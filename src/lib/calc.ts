/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Mass, extinction coefficient and composition calculations.
 *
 * Epsilon uses the historical nearest-neighbour-free approximation: the sum of
 * the monomer coefficients scaled by a flat 0.9 hypochromicity factor. This is
 * deliberately unchanged — see docs/CHEMISTRY.md for its known limitations.
 */

import { BRIDGE, DMT_MW, HPO3 } from './chemistry';
import type { BaseType, MassOptions, ModLibrary, Oligo, OligoStats } from './types';

export const HYPOCHROMICITY = 0.9;

/** Maps a base letter plus a sugar series to the standard residue id. */
export function getBaseKey(base: string, series: BaseType): string {
  if (series === 'dna') {
    if (base === 'A') return 'dA';
    if (base === 'T' || base === 'U') return 'dT';
    if (base === 'G') return 'dG';
    if (base === 'C') return 'dC';
  } else {
    if (base === 'A') return 'rA';
    if (base === 'U' || base === 'T') return 'rU';
    if (base === 'G') return 'rG';
    if (base === 'C') return 'rC';
  }
  return '';
}

/** Normalises T/U for a given sugar series. */
export function normalizeBase(base: string, series: BaseType): string {
  if (base === 'T' && series === 'rna') return 'U';
  if (base === 'U' && series === 'dna') return 'T';
  return base;
}

/**
 * Average neutral mass of residue i, modification included, excluding the
 * internucleotide bridge. Used by both the stats and the LC-MS engine.
 */
export function residueMass(oligo: Oligo, index: number, mods: ModLibrary): number {
  const bead = oligo.beads[index];
  if (!bead) return 0;
  const mod = bead.modId ? mods[bead.modId] : null;
  if (mod?.type === 'spacer') return mod.mw;

  const baseMod = mods[getBaseKey(bead.base, bead.baseType)];
  return (baseMod?.mw ?? 0) + (mod ? mod.mw : 0);
}

/** Average mass contributed by linkage i (between residues i and i+1). */
export function linkageMass(oligo: Oligo, index: number, mods: ModLibrary): number {
  const bond = oligo.bonds[index];
  if (!bond) return 0;
  return BRIDGE + (mods[bond.typeId]?.mw ?? 0);
}

export function calculateStats(
  oligo: Oligo,
  mods: ModLibrary,
  options: MassOptions,
): OligoStats | null {
  if (oligo.beads.length === 0) return null;

  let mass = 0;
  let nBases = 0;
  let gcCount = 0;
  let epsilon = 0;
  let psCount = 0;

  oligo.beads.forEach((bead) => {
    const mod = bead.modId ? mods[bead.modId] : null;

    if (mod?.type === 'spacer') {
      mass += mod.mw;
      return; // spacers contribute neither length nor GC
    }

    const baseMod = mods[getBaseKey(bead.base, bead.baseType)];
    if (baseMod) {
      mass += baseMod.mw;
      nBases++;
      if (bead.base === 'G' || bead.base === 'C') gcCount++;
      epsilon += baseMod.epsilon || 0;
    }
    if (mod) mass += mod.mw;
  });

  oligo.bonds.forEach((bond) => {
    const bondMod = mods[bond.typeId];
    if (!bondMod) return;
    mass += bondMod.mw;
    if (bond.typeId === 'PS') psCount++;
  });

  if (oligo.term5 && mods[oligo.term5]) mass += mods[oligo.term5].mw;
  if (oligo.term3 && mods[oligo.term3]) mass += mods[oligo.term3].mw;

  if (nBases > 0) {
    mass += (nBases - 1) * BRIDGE;
    const has5Phos = oligo.term5 === '5Phos';
    if (!has5Phos && options.end5Mode === 'p') mass += HPO3;
  }

  const massDmt = mass + (options.dmtOn ? DMT_MW : 0);

  return {
    mass,
    massDmt,
    mw: mass.toFixed(2),
    mwDmt: massDmt.toFixed(2),
    nBases,
    gcPct: (nBases > 0 ? (gcCount / nBases) * 100 : 0).toFixed(1),
    epsilon: Math.round(epsilon * HYPOCHROMICITY),
    psCount,
  };
}

/** Renders the oligo in synthesizer notation. */
export function buildRawSeq(oligo: Oligo, mods: ModLibrary): string {
  let res = '';
  if (oligo.term5 && mods[oligo.term5]) {
    res += mods[oligo.term5].notation || mods[oligo.term5].code;
  }

  oligo.beads.forEach((bead, i) => {
    const mod = bead.modId ? mods[bead.modId] : null;
    if (mod && mod.notation) res += mod.notation.replace('N', bead.base);
    else if (mod) res += `(${bead.base}${mod.code})`;
    else res += bead.base;

    if (i < oligo.bonds.length) {
      const bond = mods[oligo.bonds[i].typeId];
      if (bond && bond.notation) res += bond.notation;
    }
  });

  if (oligo.term3 && mods[oligo.term3]) {
    res += mods[oligo.term3].notation || mods[oligo.term3].code;
  }
  return res;
}

/** Plain base string, spacers excluded — the input to sequence analytics. */
export function baseString(oligo: Oligo): string {
  return oligo.beads
    .filter((b) => /^[ATGCU]$/.test(b.base))
    .map((b) => b.base)
    .join('');
}
