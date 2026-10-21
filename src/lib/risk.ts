/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Synthesis risk scoring.
 *
 * A transparent, rule-based heuristic for solid-phase synthesis difficulty:
 * every finding carries an explicit weight, so the score can be audited and
 * recalibrated against in-house yields. It is not a thermodynamic prediction —
 * the hairpin term is a stem-strength proxy, not a folding free energy.
 */

import { pairType } from './duplex';
import type { Oligo } from './types';

export type Severity = 'info' | 'low' | 'medium' | 'high';

export interface RiskFinding {
  id: string;
  title: string;
  detail: string;
  severity: Severity;
  weight: number;
  /** 1-based residue positions involved. */
  positions: number[];
}

export interface RiskReport {
  score: number;
  band: 'faible' | 'modéré' | 'élevé' | 'critique';
  findings: RiskFinding[];
  metrics: {
    length: number;
    purinePct: number;
    gPct: number;
    longestGRun: number;
    hairpinScore: number;
  };
}

export interface HairpinHit {
  /** 5' side stem start, 0-based. */
  start: number;
  /** 3' side stem end, 0-based inclusive. */
  end: number;
  stemLength: number;
  /** Weighted stem strength: G:C = 3, A:U = 2, G:U = 1. */
  score: number;
  loop: number;
}

const PAIR_SCORE: Record<string, number> = { wc: 2, wobble: 1, mismatch: 0, none: 0 };

function stemScore(a: string, b: string): number {
  const type = pairType(a, b);
  if (type === 'wc') return a === 'G' || a === 'C' ? 3 : 2;
  return PAIR_SCORE[type];
}

/** Longest contiguous self-complementary stem with a loop of at least minLoop. */
export function longestHairpin(seq: string, minLoop = 3): HairpinHit | null {
  let best: HairpinHit | null = null;

  for (let i = 0; i < seq.length; i++) {
    for (let j = seq.length - 1; j > i + minLoop; j--) {
      if (stemScore(seq[i], seq[j]) === 0) continue;

      let length = 0;
      let score = 0;
      while (
        i + length < j - length &&
        j - length - (i + length) - 1 >= minLoop &&
        stemScore(seq[i + length], seq[j - length]) > 0
      ) {
        score += stemScore(seq[i + length], seq[j - length]);
        length++;
      }

      if (length >= 3 && (!best || score > best.score)) {
        best = {
          start: i,
          end: j,
          stemLength: length,
          score,
          loop: j - length - (i + length) + 1,
        };
      }
    }
  }

  return best;
}

function runs(seq: string, base: string): { start: number; length: number }[] {
  const out: { start: number; length: number }[] = [];
  let start = -1;
  for (let i = 0; i <= seq.length; i++) {
    if (seq[i] === base) {
      if (start === -1) start = i;
    } else if (start !== -1) {
      out.push({ start, length: i - start });
      start = -1;
    }
  }
  return out;
}

function range(start: number, length: number): number[] {
  return Array.from({ length }, (_, i) => start + i + 1);
}

const G4 = /G{3,}[ATGCU]{1,7}G{3,}[ATGCU]{1,7}G{3,}[ATGCU]{1,7}G{3,}/;

export function assessRisk(oligo: Oligo, sequence: string): RiskReport {
  const seq = sequence.toUpperCase();
  const n = seq.length;
  const findings: RiskFinding[] = [];

  const purines = (seq.match(/[AG]/g) || []).length;
  const gCount = (seq.match(/G/g) || []).length;
  const purinePct = n ? (purines / n) * 100 : 0;
  const gPct = n ? (gCount / n) * 100 : 0;

  // --- G runs.
  const gRuns = runs(seq, 'G').filter((r) => r.length >= 3);
  const longestGRun = gRuns.reduce((max, r) => Math.max(max, r.length), 0);

  gRuns.forEach((run) => {
    const severity: Severity = run.length >= 5 ? 'high' : run.length === 4 ? 'high' : 'medium';
    const weight = run.length >= 5 ? 25 : run.length === 4 ? 20 : 8;
    findings.push({
      id: `grun_${run.start}`,
      title: `Run de ${run.length} G`,
      detail:
        run.length >= 4
          ? 'Les runs de 4 G ou plus sont la première cause de chute de rendement de couplage et d\'agrégation sur support.'
          : 'Run de 3 G : surveiller le couplage, impact modéré.',
      severity,
      weight,
      positions: range(run.start, run.length),
    });
  });

  // --- G-quadruplex motif.
  const g4 = seq.match(G4);
  if (g4 && g4.index !== undefined) {
    findings.push({
      id: 'g4',
      title: 'Motif G-quadruplexe putatif',
      detail: 'Quatre runs de G séparés par de courtes boucles : repliement probable sur support et en solution.',
      severity: 'high',
      weight: 30,
      positions: range(g4.index, g4[0].length),
    });
  }

  // --- Purine density.
  if (purinePct > 70) {
    findings.push({
      id: 'purine_global',
      title: `Densité purique ${purinePct.toFixed(0)} %`,
      detail: 'Séquence purine-dense : empilement et agrégation sur support, couplages plus lents.',
      severity: 'medium',
      weight: 12,
      positions: [],
    });
  }

  for (let i = 0; i + 10 <= n; i++) {
    const window = seq.slice(i, i + 10);
    if ((window.match(/[AG]/g) || []).length >= 9) {
      findings.push({
        id: `purine_window_${i}`,
        title: 'Fenêtre purique locale',
        detail: '9 purines ou plus sur 10 résidus consécutifs.',
        severity: 'medium',
        weight: 10,
        positions: range(i, 10),
      });
      break; // one representative finding is enough
    }
  }

  // --- Length.
  if (n > 40) {
    findings.push({ id: 'length', title: `Longueur ${n} nt`, detail: 'Au-delà de 40 nt, le rendement cumulé chute fortement.', severity: 'high', weight: 20, positions: [] });
  } else if (n > 30) {
    findings.push({ id: 'length', title: `Longueur ${n} nt`, detail: 'Longueur élevée : rendement cumulé à surveiller.', severity: 'medium', weight: 12, positions: [] });
  } else if (n > 25) {
    findings.push({ id: 'length', title: `Longueur ${n} nt`, detail: 'Longueur modérément élevée.', severity: 'low', weight: 6, positions: [] });
  }

  // --- Secondary structure proxy.
  const hairpin = longestHairpin(seq);
  const hairpinScore = hairpin?.score ?? 0;
  if (hairpin && hairpinScore >= 8) {
    findings.push({
      id: 'hairpin',
      title: `Tige-boucle probable (${hairpin.stemLength} pb, score ${hairpinScore})`,
      detail: `Tige entre les positions ${hairpin.start + 1} et ${hairpin.end + 1}, boucle de ${hairpin.loop} nt. Structure secondaire associée aux mauvais rendements observés sur les 23mers.`,
      severity: hairpinScore >= 12 ? 'high' : 'medium',
      weight: hairpinScore >= 12 ? 20 : 10,
      positions: [...range(hairpin.start, hairpin.stemLength), ...range(hairpin.end - hairpin.stemLength + 1, hairpin.stemLength)],
    });
  }

  // --- Homopolymer runs other than G.
  (['A', 'C', 'U', 'T'] as const).forEach((base) => {
    runs(seq, base)
      .filter((r) => r.length >= 5)
      .forEach((run) => {
        findings.push({
          id: `run_${base}_${run.start}`,
          title: `Run de ${run.length} ${base}`,
          detail: 'Homopolymère long : risque de délétion n-1 accru.',
          severity: 'low',
          weight: 6,
          positions: range(run.start, run.length),
        });
      });
  });

  // --- Backbone, informational only.
  const psCount = oligo.bonds.filter((b) => b.typeId === 'PS').length;
  if (oligo.bonds.length > 0 && psCount === oligo.bonds.length) {
    findings.push({
      id: 'full_ps',
      title: 'Squelette PS intégral',
      detail: `2^${psCount} diastéréoisomères : pics élargis en IEX et en LC-MS, sans impact sur le rendement de couplage.`,
      severity: 'info',
      weight: 0,
      positions: [],
    });
  }

  const score = Math.min(100, findings.reduce((sum, f) => sum + f.weight, 0));
  const band: RiskReport['band'] =
    score >= 70 ? 'critique' : score >= 45 ? 'élevé' : score >= 20 ? 'modéré' : 'faible';

  return {
    score,
    band,
    findings: findings.sort((a, b) => b.weight - a.weight),
    metrics: { length: n, purinePct, gPct, longestGRun, hairpinScore },
  };
}
