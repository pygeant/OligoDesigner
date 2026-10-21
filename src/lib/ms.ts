/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * LC-MS assignment engine.
 *
 * Builds the table of species a crude oligonucleotide is expected to contain,
 * then matches a list of deconvoluted neutral masses against it. All masses are
 * average masses, which is what ESI deconvolution of a 5-10 kDa oligo returns
 * on a single quadrupole.
 */

import { DMT_MW, HPO3, PS_DELTA } from './chemistry';
import { linkageMass, residueMass } from './calc';
import type { MassOptions, ModLibrary, Oligo } from './types';

export const PROTON = 1.00728;
export const WATER = 18.015;
/** Neutral free bases lost on depurination. */
export const ADENINE = 135.13;
export const GUANINE = 151.13;
/** Na -> H and K -> H exchange, average masses. */
export const SODIUM_ADDUCT = 21.982;
export const POTASSIUM_ADDUCT = 37.956;
/** Retained cyanoethyl / acrylonitrile adduct on a phosphorothioate. */
export const ACRYLONITRILE = 53.063;

export type SpeciesCategory =
  | 'product'
  | 'deletion'
  | 'addition'
  | 'backbone'
  | 'adduct'
  | 'degradation'
  | 'protection';

export interface ExpectedSpecies {
  id: string;
  label: string;
  category: SpeciesCategory;
  /** Neutral average mass, g/mol. */
  mass: number;
  /** Mass difference against the full-length product. */
  delta: number;
  /** Residue positions (1-based) consistent with this species, when relevant. */
  positions?: number[];
  note?: string;
}

export interface SpeciesConfig {
  /** Number of simultaneous single-residue deletions to enumerate (1 or 2). */
  deletionDepth: number;
  includeAdducts: boolean;
  includeDepurination: boolean;
  includeDesulfurization: boolean;
  includeAcrylonitrile: boolean;
  includeDmtOn: boolean;
}

export const DEFAULT_SPECIES_CONFIG: SpeciesConfig = {
  deletionDepth: 1,
  includeAdducts: true,
  includeDepurination: true,
  includeDesulfurization: true,
  includeAcrylonitrile: true,
  includeDmtOn: true,
};

function round(value: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/**
 * Mass lost when residue `index` fails to couple: the residue itself plus the
 * internucleotide linkage that disappears with it.
 */
export function deletionDelta(oligo: Oligo, index: number, mods: ModLibrary): number {
  const linkIndex = index < oligo.bonds.length ? index : oligo.bonds.length - 1;
  return residueMass(oligo, index, mods) + linkageMass(oligo, linkIndex, mods);
}

export function expectedSpecies(
  oligo: Oligo,
  mods: ModLibrary,
  options: MassOptions,
  fullLengthMass: number,
  config: SpeciesConfig = DEFAULT_SPECIES_CONFIG,
): ExpectedSpecies[] {
  const species: ExpectedSpecies[] = [];
  const push = (s: Omit<ExpectedSpecies, 'delta'>) =>
    species.push({ ...s, delta: round(s.mass - fullLengthMass) });

  push({ id: 'flp', label: 'Produit pleine longueur (FLP)', category: 'product', mass: fullLengthMass });

  if (config.includeDmtOn && !options.dmtOn) {
    push({
      id: 'dmt_on',
      label: 'FLP DMT-on',
      category: 'protection',
      mass: fullLengthMass + DMT_MW,
      note: 'Détritylation incomplète ou crude DMT-on.',
    });
  }

  // --- Single deletions, grouped by mass so that identical residues collapse.
  const singles = new Map<number, number[]>();
  oligo.beads.forEach((_, i) => {
    const delta = round(deletionDelta(oligo, i, mods));
    if (delta <= 0) return;
    singles.set(delta, [...(singles.get(delta) ?? []), i + 1]);
  });

  [...singles.entries()]
    .sort((a, b) => a[0] - b[0])
    .forEach(([delta, positions]) => {
      push({
        id: `n1_${delta}`,
        label: `n-1 (−${delta.toFixed(2)})`,
        category: 'deletion',
        mass: fullLengthMass - delta,
        positions,
        note: `Positions compatibles : ${positions.join(', ')}`,
      });
      push({
        id: `np1_${delta}`,
        label: `n+1 (+${delta.toFixed(2)})`,
        category: 'addition',
        mass: fullLengthMass + delta,
        positions,
        note: 'Double couplage.',
      });
    });

  if (config.deletionDepth >= 2) {
    const deltas = [...singles.keys()].sort((a, b) => a - b);
    const seen = new Set<number>();
    for (let i = 0; i < deltas.length; i++) {
      for (let j = i; j < deltas.length; j++) {
        const delta = round(deltas[i] + deltas[j]);
        if (seen.has(delta)) continue;
        seen.add(delta);
        push({
          id: `n2_${delta}`,
          label: `n-2 (−${delta.toFixed(2)})`,
          category: 'deletion',
          mass: fullLengthMass - delta,
        });
      }
    }
  }

  // --- Backbone.
  const psCount = oligo.bonds.filter((b) => b.typeId === 'PS').length;
  if (config.includeDesulfurization && psCount > 0) {
    for (let k = 1; k <= Math.min(psCount, 3); k++) {
      push({
        id: `po_${k}`,
        label: `${k} × P=O pour P=S (−${(PS_DELTA * k).toFixed(2)})`,
        category: 'backbone',
        mass: fullLengthMass - PS_DELTA * k,
        note: 'Sulfurisation incomplète.',
      });
    }
  }

  if (config.includeAcrylonitrile && psCount > 0) {
    for (let k = 1; k <= 2; k++) {
      push({
        id: `acn_${k}`,
        label: `${k} × adduit acrylonitrile (+${(ACRYLONITRILE * k).toFixed(2)})`,
        category: 'adduct',
        mass: fullLengthMass + ACRYLONITRILE * k,
        note: 'Cyanoéthyl retenu, déprotection incomplète.',
      });
    }
  }

  // --- Degradation.
  if (config.includeDepurination) {
    const bases = oligo.beads.map((b) => b.base);
    if (bases.includes('A')) {
      push({
        id: 'depur_a',
        label: 'Dépurination (−adénine)',
        category: 'degradation',
        mass: fullLengthMass - ADENINE,
      });
    }
    if (bases.includes('G')) {
      push({
        id: 'depur_g',
        label: 'Dépurination (−guanine)',
        category: 'degradation',
        mass: fullLengthMass - GUANINE,
      });
    }
  }

  push({
    id: 'dehydration',
    label: 'Perte d\'eau (−18.02)',
    category: 'degradation',
    mass: fullLengthMass - WATER,
  });

  // --- Terminal phosphate state.
  if (oligo.term5 !== '5Phos' && options.end5Mode !== 'p') {
    push({
      id: 'plus_phos',
      label: "Phosphate 5' (+79.98)",
      category: 'protection',
      mass: fullLengthMass + HPO3,
    });
  } else {
    push({
      id: 'minus_phos',
      label: "Perte du phosphate 5' (−79.98)",
      category: 'protection',
      mass: fullLengthMass - HPO3,
    });
  }

  // --- Cation adducts.
  if (config.includeAdducts) {
    for (let k = 1; k <= 2; k++) {
      push({
        id: `na_${k}`,
        label: `${k} × Na⁺ (+${(SODIUM_ADDUCT * k).toFixed(2)})`,
        category: 'adduct',
        mass: fullLengthMass + SODIUM_ADDUCT * k,
      });
      push({
        id: `k_${k}`,
        label: `${k} × K⁺ (+${(POTASSIUM_ADDUCT * k).toFixed(2)})`,
        category: 'adduct',
        mass: fullLengthMass + POTASSIUM_ADDUCT * k,
      });
    }
  }

  return species.sort((a, b) => a.mass - b.mass);
}

/** m/z ladder in negative ESI, the usual acquisition mode for oligos. */
export function chargeSeries(mass: number, zMin = 2, zMax = 8): { z: number; mz: number }[] {
  const series: { z: number; mz: number }[] = [];
  for (let z = zMin; z <= zMax; z++) {
    series.push({ z, mz: round((mass - z * PROTON) / z, 2) });
  }
  return series;
}

export interface Tolerance {
  value: number;
  unit: 'Da' | 'ppm';
}

export const DEFAULT_TOLERANCE: Tolerance = { value: 2, unit: 'Da' };

export function toleranceWindow(mass: number, tolerance: Tolerance): number {
  return tolerance.unit === 'Da' ? tolerance.value : (mass * tolerance.value) / 1e6;
}

export interface ObservedPeak {
  mass: number;
  intensity?: number;
}

export interface Assignment {
  observed: ObservedPeak;
  match: ExpectedSpecies | null;
  deltaDa: number | null;
  alternatives: ExpectedSpecies[];
}

export function assignMasses(
  observed: ObservedPeak[],
  species: ExpectedSpecies[],
  tolerance: Tolerance = DEFAULT_TOLERANCE,
): Assignment[] {
  return observed.map((peak) => {
    const window = toleranceWindow(peak.mass, tolerance);
    const hits = species
      .map((s) => ({ s, d: peak.mass - s.mass }))
      .filter((h) => Math.abs(h.d) <= window)
      .sort((a, b) => Math.abs(a.d) - Math.abs(b.d));

    return {
      observed: peak,
      match: hits[0]?.s ?? null,
      deltaDa: hits[0] ? round(hits[0].d) : null,
      alternatives: hits.slice(1, 4).map((h) => h.s),
    };
  });
}

/**
 * Accepts the shapes a deconvolution report is pasted in: one mass per line,
 * optionally followed by an intensity or area.
 *
 * The comma is ambiguous, so it is resolved explicitly: tabs, semicolons and
 * spaces are field separators, and a comma is read as a decimal separator
 * unless the line already uses a dot for decimals — in which case it is the
 * field separator of a CSV export.
 */
export function parseMassList(text: string): ObservedPeak[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      let parts = line.split(/[\t;]+|\s+/).map((p) => p.trim()).filter(Boolean);
      if (parts.length === 1 && parts[0].includes(',')) {
        parts = parts[0].includes('.') ? parts[0].split(',') : [parts[0]];
      }

      const toNumber = (value?: string) =>
        value === undefined ? undefined : parseFloat(value.replace(',', '.'));

      const mass = toNumber(parts[0]) ?? NaN;
      const intensity = toNumber(parts[1]);
      return { mass, intensity: Number.isFinite(intensity as number) ? intensity : undefined };
    })
    .filter((p) => Number.isFinite(p.mass) && p.mass > 0);
}
