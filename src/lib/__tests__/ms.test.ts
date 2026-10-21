import { describe, expect, it } from 'vitest';
import { DEFAULT_MODS, PS_DELTA } from '../chemistry';
import { calculateStats } from '../calc';
import { parseSequence } from '../parser';
import {
  DEFAULT_SPECIES_CONFIG,
  PROTON,
  assignMasses,
  chargeSeries,
  deletionDelta,
  expectedSpecies,
  parseMassList,
  toleranceWindow,
} from '../ms';
import type { Oligo } from '../types';

const options = { dmtOn: false, end5Mode: 'oh' as const };

function oligoFrom(notation: string): Oligo {
  const parsed = parseSequence(notation, DEFAULT_MODS);
  return { name: 'ms', beads: parsed.beads, bonds: parsed.bonds, term5: parsed.term5, term3: parsed.term3 };
}

const OLIGO = oligoFrom('A*UGC*A');
const MASS = calculateStats(OLIGO, DEFAULT_MODS, options)!.mass;
const SPECIES = expectedSpecies(OLIGO, DEFAULT_MODS, options, MASS);

describe('expectedSpecies', () => {
  it('always contains the full-length product at zero delta', () => {
    const flp = SPECIES.find((s) => s.id === 'flp')!;
    expect(flp.mass).toBeCloseTo(MASS, 6);
    expect(flp.delta).toBe(0);
  });

  it('derives n-1 masses from the residue plus its linkage', () => {
    const delta = deletionDelta(OLIGO, 2, DEFAULT_MODS);
    const hit = SPECIES.find((s) => Math.abs(s.mass - (MASS - delta)) < 0.01);
    expect(hit).toBeDefined();
    expect(hit!.category).toBe('deletion');
  });

  it('groups positions that share a deletion mass', () => {
    // Two adenosines with identical phosphodiester/phosphorothioate context.
    const grouped = SPECIES.filter((s) => s.category === 'deletion' && (s.positions?.length ?? 0) > 1);
    expect(grouped.length).toBeGreaterThan(0);
  });

  it('enumerates desulfurization for each phosphorothioate', () => {
    const psCount = OLIGO.bonds.filter((b) => b.typeId === 'PS').length;
    const single = SPECIES.find((s) => s.id === 'po_1')!;
    expect(single.mass).toBeCloseTo(MASS - PS_DELTA, 6);
    expect(SPECIES.filter((s) => s.id.startsWith('po_'))).toHaveLength(Math.min(psCount, 3));
  });

  it('omits categories that are switched off', () => {
    const trimmed = expectedSpecies(OLIGO, DEFAULT_MODS, options, MASS, {
      ...DEFAULT_SPECIES_CONFIG,
      includeAdducts: false,
      includeDepurination: false,
    });
    expect(trimmed.some((s) => s.id.startsWith('na_'))).toBe(false);
    expect(trimmed.some((s) => s.id.startsWith('depur_'))).toBe(false);
  });
});

describe('chargeSeries', () => {
  it('computes negative-mode m/z', () => {
    const [first] = chargeSeries(7000, 3, 3);
    expect(first.z).toBe(3);
    expect(first.mz).toBeCloseTo((7000 - 3 * PROTON) / 3, 2);
  });
});

describe('assignMasses', () => {
  it('matches an observed mass to the closest species inside the window', () => {
    const [assignment] = assignMasses([{ mass: MASS + 0.4 }], SPECIES, { value: 2, unit: 'Da' });
    expect(assignment.match?.id).toBe('flp');
    expect(assignment.deltaDa).toBeCloseTo(0.4, 2);
  });

  it('leaves a mass unassigned when nothing falls in the window', () => {
    const [assignment] = assignMasses([{ mass: MASS + 500 }], SPECIES, { value: 1, unit: 'Da' });
    expect(assignment.match).toBeNull();
  });

  it('scales a ppm tolerance with the mass', () => {
    expect(toleranceWindow(7000, { value: 100, unit: 'ppm' })).toBeCloseTo(0.7, 6);
  });
});

describe('parseMassList', () => {
  it('reads masses with optional intensities and separators', () => {
    const peaks = parseMassList('7123.4\t100\n6818,1;12\n7000.5,42\nrubbish\n5000');
    expect(peaks).toEqual([
      { mass: 7123.4, intensity: 100 },
      { mass: 6818.1, intensity: 12 },
      { mass: 7000.5, intensity: 42 },
      { mass: 5000, intensity: undefined },
    ]);
  });
});
