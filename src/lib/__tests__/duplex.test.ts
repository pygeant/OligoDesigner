import { describe, expect, it } from 'vitest';
import { DEFAULT_MODS } from '../chemistry';
import { alignDuplex, buildAntisense, pairType } from '../duplex';
import { parseSequence } from '../parser';
import type { Oligo } from '../types';

function oligoFrom(notation: string, name = 'sense'): Oligo {
  const parsed = parseSequence(notation, DEFAULT_MODS);
  return { name, beads: parsed.beads, bonds: parsed.bonds, term5: parsed.term5, term3: parsed.term3 };
}

const SENSE_19 = 'AAUAACACUGUUUCUGUUC';

describe('pairType', () => {
  it('classifies Watson-Crick, wobble and mismatch', () => {
    expect(pairType('A', 'U')).toBe('wc');
    expect(pairType('G', 'C')).toBe('wc');
    expect(pairType('A', 'T')).toBe('wc');
    expect(pairType('G', 'U')).toBe('wobble');
    expect(pairType('A', 'G')).toBe('mismatch');
  });
});

describe('buildAntisense', () => {
  it('returns the reverse complement with the requested overhang', () => {
    const antisense = buildAntisense(oligoFrom('AUGC'), { overhang: 'UU' });
    expect(antisense.beads.map((b) => b.base).join('')).toBe('GCAUUU');
  });

  it('mirrors the sugar modifications of the position it pairs with', () => {
    const antisense = buildAntisense(oligoFrom('(Aom)(G2f)'), {});
    expect(antisense.beads.map((b) => b.modId)).toEqual(['F', 'OMe']);
  });

  it("builds a dT overhang in the DNA series when asked", () => {
    const antisense = buildAntisense(oligoFrom('AUGC'), { overhang: 'TT', overhangSeries: 'dna' });
    const tail = antisense.beads.slice(-2);
    expect(tail.every((b) => b.base === 'T' && b.baseType === 'dna')).toBe(true);
  });
});

describe('alignDuplex', () => {
  it('registers a canonical 21/21 siRNA with 2-nt 3\' overhangs', () => {
    const sense = oligoFrom(`${SENSE_19}UU`);
    const antisense = buildAntisense(oligoFrom(SENSE_19), { overhang: 'UU' });

    const alignment = alignDuplex(sense, antisense);

    expect(alignment.wcCount).toBe(19);
    expect(alignment.mismatchCount).toBe(0);
    expect(alignment.overhangs.sense3).toBe(2);
    expect(alignment.overhangs.antisense3).toBe(2);
    expect(alignment.overhangs.sense5).toBe(0);
    expect(alignment.overhangs.antisense5).toBe(0);
  });

  it('aligns a blunt duplex without overhangs', () => {
    const sense = oligoFrom('AUGCAUGCAUGC');
    const antisense = buildAntisense(sense, {});
    const alignment = alignDuplex(sense, antisense);

    expect(alignment.pairedCount).toBe(12);
    expect(alignment.overhangs.sense3).toBe(0);
    expect(alignment.overhangs.antisense3).toBe(0);
    expect(alignment.columns).toHaveLength(12);
  });

  it('flags a single internal mismatch', () => {
    const sense = oligoFrom('AUGCAUGCAUGC');
    const antisense = buildAntisense(sense, {});
    antisense.beads[5].base = 'A'; // break one pair

    const alignment = alignDuplex(sense, antisense);
    expect(alignment.mismatchCount).toBe(1);
    expect(alignment.wcCount).toBe(11);
  });

  it('counts G·U wobbles separately from Watson-Crick pairs', () => {
    const sense = oligoFrom('GGGGAAAAGGGG');
    const antisense = buildAntisense(sense, {});
    antisense.beads[0].base = 'U'; // C -> U facing a G

    const alignment = alignDuplex(sense, antisense);
    expect(alignment.wobbleCount).toBe(1);
  });
});
