import { describe, expect, it } from 'vitest';
import { DEFAULT_MODS } from '../chemistry';
import { applyPattern, parseSequence, scanUnrecognized, stripName } from '../parser';

describe('parseSequence', () => {
  it('reads the m/f/l shorthand', () => {
    const { beads } = parseSequence('mAfGlC', DEFAULT_MODS);
    expect(beads.map((b) => b.modId)).toEqual(['OMe', 'F', 'LNA']);
    expect(beads.map((b) => b.base)).toEqual(['A', 'G', 'C']);
  });

  it('accepts the modification before or after the base', () => {
    const a = parseSequence('(Aom)', DEFAULT_MODS).beads[0];
    const b = parseSequence('(omA)', DEFAULT_MODS).beads[0];
    expect(a.modId).toBe('OMe');
    expect(b.modId).toBe('OMe');
  });

  it("keeps a trailing 3' terminal instead of dropping it", () => {
    const parsed = parseSequence('AUG/3Phos/', DEFAULT_MODS);
    expect(parsed.term3).toBe('3Phos');
    expect(parsed.beads).toHaveLength(3);
  });

  it("reads a leading 5' terminal", () => {
    const parsed = parseSequence('/5Phos/AUG', DEFAULT_MODS);
    expect(parsed.term5).toBe('5Phos');
    expect(parsed.beads).toHaveLength(3);
  });

  it('switches sugar series with d and r', () => {
    const { beads } = parseSequence('dATrAU', DEFAULT_MODS);
    expect(beads.map((b) => b.baseType)).toEqual(['dna', 'dna', 'rna', 'rna']);
    // T is normalised to U once the series is RNA.
    expect(beads[1].base).toBe('T');
    expect(beads[3].base).toBe('U');
  });

  it('places the phosphorothioate on the preceding linkage', () => {
    const { bonds } = parseSequence('A*UG', DEFAULT_MODS);
    expect(bonds.map((b) => b.typeId)).toEqual(['PS', 'PO']);
  });

  it('builds a custom modification from a user-supplied mass', () => {
    const parsed = parseSequence('/UNK/AUG', DEFAULT_MODS, { '/UNK/': { mass: 500 } });
    expect(parsed.term5).toBe('custom_UNK');
    expect(parsed.customMods.custom_UNK.mw).toBe(500);
  });
});

describe('scanUnrecognized', () => {
  it('reports unknown tokens only', () => {
    expect(scanUnrecognized('(Aom)/UNK/G', DEFAULT_MODS)).toEqual(['/UNK/']);
    expect(scanUnrecognized('(Aom)*(G2f)', DEFAULT_MODS)).toEqual([]);
  });
});

describe('stripName', () => {
  it('drops a tab-separated name', () => {
    expect(stripName('Oligo_1\tAUGC')).toBe('AUGC');
  });
});

describe('applyPattern', () => {
  const pattern = {
    beads: [
      { modId: 'OMe', baseType: 'rna' as const },
      { modId: 'F', baseType: 'rna' as const },
    ],
    bonds: [{ typeId: 'PS' }],
    term5: null,
    term3: null,
  };

  it('maps a pattern onto a bare sequence and pads beyond its length', () => {
    const oligo = applyPattern('x', 'AUG', pattern);
    expect(oligo.beads.map((b) => b.modId)).toEqual(['OMe', 'F', null]);
    expect(oligo.bonds.map((b) => b.typeId)).toEqual(['PS', 'PO']);
  });

  it('strips characters that are not bases', () => {
    expect(applyPattern('x', 'au-gc 3', pattern).beads).toHaveLength(4);
  });
});
