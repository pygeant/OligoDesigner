/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Domain types shared by every module. Kept free of React and DOM imports so
 * that the chemistry layer stays pure and unit-testable.
 */

export type ModType =
  | 'sugar'
  | 'backbone'
  | 'terminal5'
  | 'terminal3'
  | 'base'
  | 'other'
  | 'standard'
  | 'spacer';

export interface Modification {
  id: string;
  code: string;
  name: string;
  type: ModType;
  color: string;
  /** Absolute mass for standard residues and spacers, delta mass otherwise. */
  mw: number;
  formula?: string;
  delta?: boolean;
  notation?: string;
  epsilon?: number;
  ref?: string;
  desc?: string;
  builtin?: boolean;
}

export type ModLibrary = Record<string, Modification>;

export type BaseType = 'dna' | 'rna';

export interface Bead {
  base: string;
  baseType: BaseType;
  modId: string | null;
}

export interface Bond {
  /** 'PO', 'PS', or a custom backbone modification id. */
  typeId: string;
}

export interface Oligo {
  name: string;
  beads: Bead[];
  bonds: Bond[];
  term5: string | null;
  term3: string | null;
}

/** Options that affect mass but are not stored on the oligo itself. */
export interface MassOptions {
  dmtOn: boolean;
  end5Mode: 'oh' | 'p';
}

export interface OligoStats {
  mw: string;
  mwDmt: string;
  /** Neutral average mass as a number — the string fields are display-only. */
  mass: number;
  massDmt: number;
  nBases: number;
  gcPct: string;
  epsilon: number;
  psCount: number;
}

export interface Pattern {
  id: string;
  name: string;
  description?: string;
  beads: { modId: string | null; baseType: BaseType }[];
  bonds: Bond[];
  term5: string | null;
  term3: string | null;
  createdAt?: string;
}

export const EMPTY_OLIGO: Oligo = {
  name: 'Untitled_Oligo',
  beads: [],
  bonds: [],
  term5: null,
  term3: null,
};
