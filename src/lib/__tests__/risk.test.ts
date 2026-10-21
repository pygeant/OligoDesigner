import { describe, expect, it } from 'vitest';
import { DEFAULT_MODS } from '../chemistry';
import { parseSequence } from '../parser';
import { assessRisk, longestHairpin } from '../risk';
import type { Oligo } from '../types';

function oligoFrom(notation: string): Oligo {
  const parsed = parseSequence(notation, DEFAULT_MODS);
  return { name: 'r', beads: parsed.beads, bonds: parsed.bonds, term5: parsed.term5, term3: parsed.term3 };
}

describe('assessRisk', () => {
  it('scores a benign mixed sequence as low risk', () => {
    const seq = 'AUCAUCAUCAUCAUCAUCAU';
    const report = assessRisk(oligoFrom(seq), seq);
    expect(report.band).toBe('faible');
    expect(report.metrics.longestGRun).toBe(0);
  });

  it('flags a run of four guanosines', () => {
    const seq = 'AUCGGGGAUCAUCAUC';
    const report = assessRisk(oligoFrom(seq), seq);
    const finding = report.findings.find((f) => f.id.startsWith('grun_'));
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('high');
    expect(finding!.positions).toEqual([4, 5, 6, 7]);
  });

  it('detects a putative G-quadruplex', () => {
    const seq = 'GGGAUGGGAUGGGAUGGG';
    const report = assessRisk(oligoFrom(seq), seq);
    expect(report.findings.some((f) => f.id === 'g4')).toBe(true);
    expect(report.score).toBeGreaterThanOrEqual(45);
  });

  it('penalises long sequences', () => {
    const seq = 'AUC'.repeat(15); // 45 nt
    const report = assessRisk(oligoFrom(seq), seq);
    expect(report.findings.some((f) => f.id === 'length')).toBe(true);
  });

  it('reports a full phosphorothioate backbone without scoring it', () => {
    const oligo = oligoFrom('A*U*C*A*U*C');
    const report = assessRisk(oligo, 'AUCAUC');
    const finding = report.findings.find((f) => f.id === 'full_ps')!;
    expect(finding.severity).toBe('info');
    expect(finding.weight).toBe(0);
  });

  it('caps the score at 100', () => {
    const seq = 'GGGGAGGGGAGGGGAGGGGAGGGGAGGGGAGGGGAGGGGA';
    expect(assessRisk(oligoFrom(seq), seq).score).toBeLessThanOrEqual(100);
  });
});

describe('longestHairpin', () => {
  it('finds a self-complementary stem separated by a loop', () => {
    const hit = longestHairpin('GGGGCCAAAAGGCCCC');
    expect(hit).not.toBeNull();
    expect(hit!.stemLength).toBeGreaterThanOrEqual(3);
    expect(hit!.loop).toBeGreaterThanOrEqual(3);
  });

  it('returns null when no stem exists', () => {
    expect(longestHairpin('AAAAAAAAAAAA')).toBeNull();
  });
});
