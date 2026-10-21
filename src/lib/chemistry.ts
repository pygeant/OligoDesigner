/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Chemical constants, the built-in modification library and the preset
 * modification patterns. All masses are average (not monoisotopic) masses in
 * g/mol, consistent with ESI deconvolution on a single-quadrupole instrument.
 */

import type { ModLibrary, Pattern } from './types';

/** HPO3 — mass added by a terminal phosphate. */
export const HPO3 = 79.979;
/** Phosphodiester bridge: +HPO3 - H2O between two nucleosides. */
export const BRIDGE = 61.964;
/** 4,4'-dimethoxytrityl, as carried by a DMT-on crude. */
export const DMT_MW = 303.03;
/** P=S for P=O substitution (S - O, average masses). */
export const PS_DELTA = 16.06;

export const DEFAULT_MODS: ModLibrary = {
  // DNA standard
  dA: { id: 'dA', code: 'dA', name: 'Désoxyadenosine', mw: 251.245, formula: 'C10H13N5O3', type: 'standard', color: '#10b981', epsilon: 15200, builtin: true },
  dT: { id: 'dT', code: 'dT', name: 'Désoxythymidine', mw: 242.231, formula: 'C10H14N2O5', type: 'standard', color: '#10b981', epsilon: 8400, builtin: true },
  dG: { id: 'dG', code: 'dG', name: 'Désoxyguanosine', mw: 267.243, formula: 'C10H13N5O4', type: 'standard', color: '#10b981', epsilon: 12010, builtin: true },
  dC: { id: 'dC', code: 'dC', name: 'Désoxycytidine', mw: 227.219, formula: 'C9H13N3O4', type: 'standard', color: '#10b981', epsilon: 7050, builtin: true },
  // RNA standard
  rA: { id: 'rA', code: 'rA', name: 'Adénosine', mw: 267.244, formula: 'C10H13N5O4', type: 'standard', color: '#3b82f6', epsilon: 15400, builtin: true },
  rU: { id: 'rU', code: 'rU', name: 'Uridine', mw: 244.201, formula: 'C9H12N2O6', type: 'standard', color: '#3b82f6', epsilon: 9900, builtin: true },
  rG: { id: 'rG', code: 'rG', name: 'Guanosine', mw: 283.243, formula: 'C10H13N5O5', type: 'standard', color: '#3b82f6', epsilon: 11500, builtin: true },
  rC: { id: 'rC', code: 'rC', name: 'Cytidine', mw: 243.219, formula: 'C9H13N3O5', type: 'standard', color: '#3b82f6', epsilon: 7200, builtin: true },
  // Sugars
  OMe: { id: 'OMe', code: "2'OMe", name: "2'-O-Méthyl", type: 'sugar', color: '#111111', mw: 14.016, delta: true, notation: '(Nom)', builtin: true, desc: 'Résistance aux nucléases.' },
  F: { id: 'F', code: "2'F", name: "2'-Fluoro", type: 'sugar', color: '#16a34a', mw: 1.995, delta: true, notation: '(N2f)', builtin: true, desc: 'Stabilité thermique.' },
  LNA: { id: 'LNA', code: 'LNA', name: 'Locked Nucleic Acid', type: 'sugar', color: '#7c3aed', mw: 28.01, delta: true, notation: '(Nl)', builtin: true, desc: 'Affinité élevée.' },
  // Backbone
  PO: { id: 'PO', code: 'PO', name: 'Phosphodiester', type: 'backbone', color: '#64748b', mw: 0, delta: true, notation: '', builtin: true },
  PS: { id: 'PS', code: 'PS', name: 'Phosphorothioate', type: 'backbone', color: '#f97316', mw: PS_DELTA, delta: true, notation: '*', builtin: true, desc: 'Résistance nucléase.' },
  // Terminals
  '5Phos': { id: '5Phos', code: '/5Phos/', name: "Phosphate 5'", type: 'terminal5', color: '#f472b6', mw: HPO3, delta: true, notation: '/5Phos/', builtin: true },
  '3Phos': { id: '3Phos', code: '/3Phos/', name: "Phosphate 3'", type: 'terminal3', color: '#34d399', mw: HPO3, delta: true, notation: '/3Phos/', builtin: true },
  '5Cy3': { id: '5Cy3', code: '/5Cy3/', name: "Cy3 5'", type: 'terminal5', color: '#f59e0b', mw: 767.0, delta: true, notation: '/5Cy3/', builtin: true },
  '3Biotin': { id: '3Biotin', code: '/3BioTEG/', name: 'Biotine 3\'', type: 'terminal3', color: '#f97316', mw: 414.5, delta: true, notation: '/3BioTEG/', builtin: true },
  HEG: { id: 'HEG', code: '/HEG/', name: 'Hexaethylene Glycol', type: 'spacer', color: '#a855f7', mw: 344.36, delta: false, notation: '/HEG/', builtin: true, desc: 'Internal non-nucleoside spacer.' },
};

const rnaBeads = (mods: (string | null)[]) =>
  mods.map((modId) => ({ modId, baseType: 'rna' as const }));

const bonds = (types: string[]) => types.map((typeId) => ({ typeId }));

export const PRESET_PATTERNS: Pattern[] = [
  {
    id: 'preset_sirna_sense_21b',
    name: 'siRNA sense 21b',
    description: '21nt siRNA sense strand pattern.',
    beads: rnaBeads([
      'OMe', 'OMe', 'OMe', 'OMe', 'OMe', 'OMe',
      'F', 'OMe', 'F', 'F', 'F', 'OMe',
      'OMe', 'OMe', 'OMe', 'OMe', 'OMe', 'OMe',
      'OMe', 'OMe', 'OMe',
    ]),
    bonds: bonds(['PS', 'PS', ...Array<string>(18).fill('PO')]),
    term5: null,
    term3: null,
  },
  {
    id: 'preset_sirna_antisense_23b',
    name: 'siRNA antisense 23b',
    description: '23nt siRNA antisense strand pattern.',
    beads: rnaBeads([
      'OMe', 'F', 'OMe', 'OMe', 'OMe', 'F',
      'OMe', 'OMe', 'OMe', 'OMe', 'OMe', 'OMe',
      'OMe', 'F', 'OMe', 'F', 'OMe', 'OMe',
      'OMe', 'OMe', 'OMe', 'OMe', 'OMe',
    ]),
    bonds: bonds(['PS', 'PS', ...Array<string>(18).fill('PO'), 'PS', 'PS']),
    term5: null,
    term3: null,
  },
  {
    id: 'preset_sirna',
    name: "siRNA (Alternating 2'OMe/2'F)",
    description: "21nt alternating 2'OMe and 2'F modifications with PS ends.",
    beads: Array.from({ length: 21 }, (_, i) => ({
      modId: i % 2 === 0 ? 'OMe' : 'F',
      baseType: 'rna' as const,
    })),
    bonds: Array.from({ length: 20 }, (_, i) => ({ typeId: i < 2 || i >= 18 ? 'PS' : 'PO' })),
    term5: null,
    term3: null,
  },
  {
    id: 'preset_aso',
    name: 'ASO Gapmer (5-10-5 LNA/DNA)',
    description: '20nt Gapmer: 5 LNA ends, 10 DNA gap, fully phosphorothioated.',
    beads: Array.from({ length: 20 }, (_, i) => ({
      modId: i < 5 || i >= 15 ? 'LNA' : null,
      baseType: (i < 5 || i >= 15 ? 'rna' : 'dna') as 'dna' | 'rna',
    })),
    bonds: Array.from({ length: 19 }, () => ({ typeId: 'PS' })),
    term5: null,
    term3: null,
  },
  {
    id: 'preset_rna_ps',
    name: 'Fully PS RNA',
    description: '21nt RNA with full phosphorothioate backbone.',
    beads: Array.from({ length: 21 }, () => ({ modId: null, baseType: 'rna' as const })),
    bonds: Array.from({ length: 20 }, () => ({ typeId: 'PS' })),
    term5: null,
    term3: null,
  },
];
