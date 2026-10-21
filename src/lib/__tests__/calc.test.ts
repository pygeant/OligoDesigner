import { describe, expect, it } from 'vitest';
import { BRIDGE, DEFAULT_MODS, DMT_MW, HPO3 } from '../chemistry';
import { buildRawSeq, calculateStats, HYPOCHROMICITY } from '../calc';
import { parseSequence } from '../parser';
import type { Oligo } from '../types';

const options = { dmtOn: false, end5Mode: 'oh' as const };

function oligoFrom(notation: string, name = 'test'): Oligo {
  const parsed = parseSequence(notation, DEFAULT_MODS);
  return { name, beads: parsed.beads, bonds: parsed.bonds, term5: parsed.term5, term3: parsed.term3 };
}

describe('calculateStats', () => {
  it('sums residues and bridges for an unmodified RNA trimer', () => {
    const oligo = oligoFrom('AUG');
    const stats = calculateStats(oligo, DEFAULT_MODS, options)!;
    const expected =
      DEFAULT_MODS.rA.mw + DEFAULT_MODS.rU.mw + DEFAULT_MODS.rG.mw + 2 * BRIDGE;
    expect(stats.mass).toBeCloseTo(expected, 3);
    expect(stats.nBases).toBe(3);
  });

  it('adds one phosphorothioate delta per PS linkage', () => {
    const plain = calculateStats(oligoFrom('AUG'), DEFAULT_MODS, options)!;
    const thioate = calculateStats(oligoFrom('A*U*G'), DEFAULT_MODS, options)!;
    expect(thioate.mass - plain.mass).toBeCloseTo(2 * DEFAULT_MODS.PS.mw, 3);
    expect(thioate.psCount).toBe(2);
  });

  it("honours the 5' phosphate toggle and the DMT-on toggle", () => {
    const oligo = oligoFrom('AUG');
    const base = calculateStats(oligo, DEFAULT_MODS, options)!;
    const phos = calculateStats(oligo, DEFAULT_MODS, { ...options, end5Mode: 'p' })!;
    const dmt = calculateStats(oligo, DEFAULT_MODS, { ...options, dmtOn: true })!;
    expect(phos.mass - base.mass).toBeCloseTo(HPO3, 3);
    expect(dmt.massDmt - base.mass).toBeCloseTo(DMT_MW, 3);
  });

  it('applies the flat hypochromicity factor to epsilon', () => {
    const stats = calculateStats(oligoFrom('AUG'), DEFAULT_MODS, options)!;
    const raw = DEFAULT_MODS.rA.epsilon! + DEFAULT_MODS.rU.epsilon! + DEFAULT_MODS.rG.epsilon!;
    expect(stats.epsilon).toBe(Math.round(raw * HYPOCHROMICITY));
  });

  it('excludes spacers from length and GC but keeps their mass', () => {
    const oligo = oligoFrom('AU/HEG/GC');
    const stats = calculateStats(oligo, DEFAULT_MODS, options)!;
    expect(stats.nBases).toBe(4);
    expect(stats.gcPct).toBe('50.0');
  });
});

describe('buildRawSeq', () => {
  it('round-trips modified notation through the parser', () => {
    const notation = '(Aom)*(G2f)(Uom)C';
    const oligo = oligoFrom(notation);
    expect(buildRawSeq(oligo, DEFAULT_MODS)).toBe(notation);
  });
});
