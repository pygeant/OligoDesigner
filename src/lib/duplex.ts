/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Duplex assembly: reverse-complement generation, sense/antisense alignment,
 * overhang and mismatch detection.
 *
 * Alignment convention — the sense strand is laid out 5'->3' from left to
 * right, the antisense strand underneath it 3'->5'. A column index `c` refers
 * to a sense position; the antisense residue in that column is taken from the
 * reversed antisense array at `c - offset`. Pure structure: no thermodynamics.
 */

import { normalizeBase } from './calc';
import type { BaseType, Bead, Bond, Oligo } from './types';

export type PairType = 'wc' | 'wobble' | 'mismatch' | 'none';

export interface DuplexColumn {
  /** Index in the sense strand, or null when the column is an antisense overhang. */
  senseIndex: number | null;
  /** Index in the antisense strand (5'->3' numbering), or null for a sense overhang. */
  antisenseIndex: number | null;
  pair: PairType;
}

export interface DuplexAlignment {
  offset: number;
  columns: DuplexColumn[];
  wcCount: number;
  wobbleCount: number;
  mismatchCount: number;
  pairedCount: number;
  /** Unpaired residue counts at each end, in nucleotides. */
  overhangs: {
    sense5: number;
    sense3: number;
    antisense5: number;
    antisense3: number;
  };
  /** GC content of the paired region, as a percentage of paired columns. */
  gcPct: number;
}

export interface Duplex {
  name: string;
  sense: Oligo;
  antisense: Oligo;
}

const COMPLEMENT: Record<string, string> = { A: 'U', U: 'A', T: 'A', G: 'C', C: 'G' };

/** Treats T and U as the same pairing partner. */
function pairKey(base: string): string {
  return base === 'T' ? 'U' : base;
}

export function pairType(senseBase: string, antisenseBase: string): PairType {
  const s = pairKey(senseBase);
  const a = pairKey(antisenseBase);
  if ((s === 'A' && a === 'U') || (s === 'U' && a === 'A')) return 'wc';
  if ((s === 'G' && a === 'C') || (s === 'C' && a === 'G')) return 'wc';
  if ((s === 'G' && a === 'U') || (s === 'U' && a === 'G')) return 'wobble';
  return 'mismatch';
}

export function complementBase(base: string, series: BaseType): string {
  return normalizeBase(COMPLEMENT[pairKey(base)] ?? 'N', series);
}

export interface AntisenseOptions {
  /** Residues appended at the antisense 3' end, e.g. 'UU' or 'TT'. */
  overhang?: string;
  overhangSeries?: BaseType;
  /** Modification applied to the generated residues when no pattern is used. */
  modId?: string | null;
}

/**
 * Builds the reverse complement of a sense strand. Sugar series and
 * modification of each residue are mirrored from the sense position it pairs
 * with, which keeps a 2'-OMe/2'-F alternation meaningful by default.
 */
export function buildAntisense(sense: Oligo, options: AntisenseOptions = {}): Oligo {
  const core = [...sense.beads]
    .filter((b) => /^[ATGCU]$/.test(b.base))
    .reverse()
    .map<Bead>((bead) => ({
      base: complementBase(bead.base, bead.baseType),
      baseType: bead.baseType,
      modId: options.modId !== undefined ? options.modId : bead.modId,
    }));

  const series: BaseType = options.overhangSeries ?? core[core.length - 1]?.baseType ?? 'rna';
  const overhang = (options.overhang ?? '').toUpperCase().split('').filter((c) => /[ATGCU]/.test(c));
  const tail = overhang.map<Bead>((base) => ({
    base: normalizeBase(base, series),
    baseType: series,
    modId: null,
  }));

  const beads = [...core, ...tail];
  const bonds: Bond[] = Array.from({ length: Math.max(0, beads.length - 1) }, (_, i) => ({
    // Mirror the sense backbone where it exists, phosphodiester beyond it.
    typeId: sense.bonds[sense.bonds.length - 1 - i]?.typeId ?? 'PO',
  }));

  return {
    name: `${sense.name}_AS`,
    beads,
    bonds,
    term5: null,
    term3: null,
  };
}

function scoreOffset(senseBases: string[], revAntisense: string[], offset: number): number {
  let score = 0;
  for (let j = 0; j < revAntisense.length; j++) {
    const senseIndex = j + offset;
    if (senseIndex < 0 || senseIndex >= senseBases.length) continue;
    const type = pairType(senseBases[senseIndex], revAntisense[j]);
    if (type === 'wc') score += 2;
    else if (type === 'wobble') score += 1;
    else score -= 1;
  }
  return score;
}

/**
 * Finds the register that maximises base pairing. Ties are broken towards the
 * alignment with the largest overlap, which is what a blunt or 2-nt-overhang
 * siRNA design is expected to produce.
 */
export function alignDuplex(sense: Oligo, antisense: Oligo): DuplexAlignment {
  const senseBases = sense.beads.filter((b) => /^[ATGCU]$/.test(b.base)).map((b) => b.base);
  const antisenseBases = antisense.beads.filter((b) => /^[ATGCU]$/.test(b.base)).map((b) => b.base);
  const revAntisense = [...antisenseBases].reverse();

  const m = senseBases.length;
  const n = revAntisense.length;

  let bestOffset = 0;
  let bestScore = -Infinity;
  let bestOverlap = -1;

  for (let offset = -(n - 1); offset <= m - 1; offset++) {
    const overlap = Math.min(m, n + offset) - Math.max(0, offset);
    if (overlap <= 0) continue;
    const score = scoreOffset(senseBases, revAntisense, offset);
    if (score > bestScore || (score === bestScore && overlap > bestOverlap)) {
      bestScore = score;
      bestOffset = offset;
      bestOverlap = overlap;
    }
  }

  const start = Math.min(0, bestOffset);
  const end = Math.max(m, n + bestOffset);

  const columns: DuplexColumn[] = [];
  let wcCount = 0;
  let wobbleCount = 0;
  let mismatchCount = 0;
  let gcPaired = 0;

  for (let c = start; c < end; c++) {
    const senseIndex = c >= 0 && c < m ? c : null;
    const revIndex = c - bestOffset;
    const hasAntisense = revIndex >= 0 && revIndex < n;
    // Convert back to 5'->3' numbering on the antisense strand.
    const antisenseIndex = hasAntisense ? n - 1 - revIndex : null;

    let pair: PairType = 'none';
    if (senseIndex !== null && hasAntisense) {
      pair = pairType(senseBases[senseIndex], revAntisense[revIndex]);
      if (pair === 'wc') wcCount++;
      else if (pair === 'wobble') wobbleCount++;
      else mismatchCount++;
      if (pair !== 'mismatch' && /[GC]/.test(senseBases[senseIndex])) gcPaired++;
    }

    columns.push({ senseIndex, antisenseIndex, pair });
  }

  const pairedCount = wcCount + wobbleCount;

  return {
    offset: bestOffset,
    columns,
    wcCount,
    wobbleCount,
    mismatchCount,
    pairedCount,
    overhangs: {
      sense5: countLeadingUnpaired(columns, 'sense'),
      sense3: countTrailingUnpaired(columns, 'sense'),
      antisense3: countLeadingUnpaired(columns, 'antisense'),
      antisense5: countTrailingUnpaired(columns, 'antisense'),
    },
    gcPct: pairedCount > 0 ? (gcPaired / pairedCount) * 100 : 0,
  };
}

function countLeadingUnpaired(columns: DuplexColumn[], strand: 'sense' | 'antisense'): number {
  const other = strand === 'sense' ? 'antisenseIndex' : 'senseIndex';
  const own = strand === 'sense' ? 'senseIndex' : 'antisenseIndex';
  let count = 0;
  for (const col of columns) {
    if (col[own] === null) continue;
    if (col[other] === null) count++;
    else break;
  }
  return count;
}

function countTrailingUnpaired(columns: DuplexColumn[], strand: 'sense' | 'antisense'): number {
  const other = strand === 'sense' ? 'antisenseIndex' : 'senseIndex';
  const own = strand === 'sense' ? 'senseIndex' : 'antisenseIndex';
  let count = 0;
  for (let i = columns.length - 1; i >= 0; i--) {
    const col = columns[i];
    if (col[own] === null) continue;
    if (col[other] === null) count++;
    else break;
  }
  return count;
}
