/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Self-contained HTML reports. Images are embedded as data URIs so a report is
 * a single file that can be mailed or archived as-is.
 */

import type { DuplexAlignment } from './duplex';
import type { ModLibrary, Oligo, OligoStats } from './types';
import type { Assignment, ExpectedSpecies } from './ms';
import type { RiskReport } from './risk';

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const BASE_CSS = `
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 1100px; margin: 0 auto; padding: 40px; background: #f9f9f9; }
  .card { background: white; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); padding: 30px; margin-bottom: 30px; }
  h1 { margin-top: 0; color: #111; font-size: 24px; border-bottom: 2px solid #eee; padding-bottom: 15px; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #666; margin-bottom: 20px; font-weight: bold; }
  .figure { width: 100%; height: auto; border: 1px solid #eee; border-radius: 8px; margin-bottom: 20px; background: #fff; padding: 20px; box-sizing: border-box; }
  .stats-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 20px; }
  .stat-item { background: #fcfcfc; border: 1px solid #eee; padding: 15px; border-radius: 8px; }
  .stat-label { font-size: 10px; text-transform: uppercase; color: #888; margin-bottom: 5px; font-weight: bold; }
  .stat-value { font-size: 18px; font-weight: 600; color: #2563eb; }
  .sequence-box { background: #111; color: #eee; padding: 20px; border-radius: 8px; font-family: "SFMono-Regular", Consolas, monospace; font-size: 13px; word-break: break-all; margin-top: 10px; }
  table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
  th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #eee; }
  th { font-size: 11px; text-transform: uppercase; color: #666; background: #f8f8f8; }
  .mono { font-family: "SFMono-Regular", Consolas, monospace; font-size: 12px; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .footer { text-align: center; font-size: 11px; color: #999; margin-top: 40px; text-transform: uppercase; letter-spacing: 1px; }
  .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .pill-high { background: #fee2e2; color: #991b1b; }
  .pill-medium { background: #fef3c7; color: #92400e; }
  .pill-low { background: #e0f2fe; color: #075985; }
  .pill-info { background: #f1f5f9; color: #475569; }
`;

function shell(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>${BASE_CSS}</style>
</head>
<body>
${body}
<div class="footer">OligoDesigner Pro &bull; ${new Date().toLocaleString('fr-FR')}</div>
</body>
</html>`;
}

function statItem(label: string, value: string): string {
  return `<div class="stat-item"><div class="stat-label">${escapeHtml(label)}</div><div class="stat-value">${escapeHtml(value)}</div></div>`;
}

export interface SingleReportInput {
  oligo: Oligo;
  mods: ModLibrary;
  stats: OligoStats | null;
  notation: string;
  png: string;
  risk?: RiskReport | null;
}

export function singleReportHtml({ oligo, mods, stats, notation, png, risk }: SingleReportInput): string {
  const composition = oligo.beads
    .map(
      (bead, i) => `<tr>
        <td class="num">${i + 1}</td>
        <td><strong>${escapeHtml(bead.base)}</strong></td>
        <td>${escapeHtml(bead.modId ? mods[bead.modId]?.name ?? bead.modId : 'Classic')}</td>
        <td>${escapeHtml(i < oligo.bonds.length ? oligo.bonds[i].typeId : '—')}</td>
      </tr>`,
    )
    .join('');

  const riskSection = risk
    ? `<div class="card">
        <h2>Risque de synthèse</h2>
        <p><strong>Score ${risk.score}/100</strong> — ${escapeHtml(risk.band)}</p>
        <table>
          <thead><tr><th>Constat</th><th>Sévérité</th><th>Positions</th><th>Détail</th></tr></thead>
          <tbody>
            ${risk.findings
              .map(
                (f) => `<tr>
                  <td>${escapeHtml(f.title)}</td>
                  <td><span class="pill pill-${f.severity}">${escapeHtml(f.severity)}</span></td>
                  <td class="mono">${f.positions.length ? escapeHtml(f.positions.join(', ')) : '—'}</td>
                  <td>${escapeHtml(f.detail)}</td>
                </tr>`,
              )
              .join('')}
          </tbody>
        </table>
      </div>`
    : '';

  return shell(
    `Oligo Design — ${oligo.name}`,
    `<div class="card">
      <h1>Oligo Design : ${escapeHtml(oligo.name)}</h1>
      <div style="margin-bottom:20px;display:flex;gap:40px;">
        <div><span class="stat-label">Extrémité 5'</span> ${escapeHtml(oligo.term5 ? mods[oligo.term5]?.name : 'OH')}</div>
        <div><span class="stat-label">Extrémité 3'</span> ${escapeHtml(oligo.term3 ? mods[oligo.term3]?.name : 'OH')}</div>
      </div>
      <h2>Représentation</h2>
      <img src="${png}" class="figure" alt="Collier de perles">
      <h2>Propriétés calculées</h2>
      <div class="stats-grid">
        ${statItem('Masse moléculaire', `${stats?.mw ?? '—'} g/mol`)}
        ${statItem('MW (DMT-on)', `${stats?.mwDmt ?? '—'} g/mol`)}
        ${statItem('Longueur', `${stats?.nBases ?? '—'} nt`)}
        ${statItem('GC', `${stats?.gcPct ?? '—'} %`)}
        ${statItem('Epsilon 260', `${stats?.epsilon?.toLocaleString('fr-FR') ?? '—'} M⁻¹cm⁻¹`)}
        ${statItem('Liaisons PS', String(stats?.psCount ?? 0))}
      </div>
      <h2 style="margin-top:30px;">Notation synthétiseur</h2>
      <div class="sequence-box">${escapeHtml(notation)}</div>
    </div>
    <div class="card">
      <h2>Composition détaillée</h2>
      <table>
        <thead><tr><th>Pos</th><th>Base</th><th>Modification</th><th>Liaison suivante</th></tr></thead>
        <tbody>${composition}</tbody>
      </table>
    </div>
    ${riskSection}`,
  );
}

export interface BatchRow {
  name: string;
  rawSeq: string;
  stats: OligoStats | null;
  risk?: RiskReport | null;
}

export function batchReportHtml(rows: BatchRow[]): string {
  return shell(
    'Oligo Batch Report',
    `<div class="card">
      <h1>Rapport de lot</h1>
      <p style="color:#666;font-size:13px;">${rows.length} séquences</p>
      <table>
        <thead>
          <tr><th>Nom</th><th>Séquence</th><th class="num">nt</th><th class="num">MW</th><th class="num">GC%</th><th class="num">ε 260</th><th class="num">PS</th><th class="num">Risque</th></tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r) => `<tr>
                <td><strong>${escapeHtml(r.name)}</strong></td>
                <td class="mono">${escapeHtml(r.rawSeq)}</td>
                <td class="num">${r.stats?.nBases ?? '—'}</td>
                <td class="num">${r.stats?.mw ?? '—'}</td>
                <td class="num">${r.stats?.gcPct ?? '—'}</td>
                <td class="num">${r.stats?.epsilon?.toLocaleString('fr-FR') ?? '—'}</td>
                <td class="num">${r.stats?.psCount ?? 0}</td>
                <td class="num">${r.risk ? `<span class="pill pill-${r.risk.score >= 45 ? 'high' : r.risk.score >= 20 ? 'medium' : 'low'}">${r.risk.score}</span>` : '—'}</td>
              </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </div>`,
  );
}

export interface DuplexReportInput {
  name: string;
  png: string;
  senseNotation: string;
  antisenseNotation: string;
  senseStats: OligoStats | null;
  antisenseStats: OligoStats | null;
  alignment: DuplexAlignment;
}

export function duplexReportHtml({
  name,
  png,
  senseNotation,
  antisenseNotation,
  senseStats,
  antisenseStats,
  alignment,
}: DuplexReportInput): string {
  const duplexMass =
    senseStats && antisenseStats ? (senseStats.mass + antisenseStats.mass).toFixed(2) : '—';

  return shell(
    `Duplex — ${name}`,
    `<div class="card">
      <h1>Duplex : ${escapeHtml(name)}</h1>
      <img src="${png}" class="figure" alt="Duplex">
      <h2>Structure</h2>
      <div class="stats-grid">
        ${statItem('Paires Watson-Crick', String(alignment.wcCount))}
        ${statItem('Wobble G·U', String(alignment.wobbleCount))}
        ${statItem('Mésappariements', String(alignment.mismatchCount))}
        ${statItem('GC apparié', `${alignment.gcPct.toFixed(1)} %`)}
        ${statItem("Overhang 3' sens", `${alignment.overhangs.sense3} nt`)}
        ${statItem("Overhang 3' antisens", `${alignment.overhangs.antisense3} nt`)}
      </div>
      <h2 style="margin-top:30px;">Masses</h2>
      <div class="stats-grid">
        ${statItem('Sens', `${senseStats?.mw ?? '—'} g/mol`)}
        ${statItem('Antisens', `${antisenseStats?.mw ?? '—'} g/mol`)}
        ${statItem('Duplex', `${duplexMass} g/mol`)}
      </div>
      <h2 style="margin-top:30px;">Notations</h2>
      <div class="sequence-box">Sens&nbsp;&nbsp;&nbsp;&nbsp;: ${escapeHtml(senseNotation)}</div>
      <div class="sequence-box">Antisens : ${escapeHtml(antisenseNotation)}</div>
    </div>`,
  );
}

export interface MsReportInput {
  name: string;
  notation: string;
  fullLengthMass: number;
  species: ExpectedSpecies[];
  assignments: Assignment[];
}

export function msReportHtml({ name, notation, fullLengthMass, species, assignments }: MsReportInput): string {
  return shell(
    `LC-MS — ${name}`,
    `<div class="card">
      <h1>Assignement LC-MS : ${escapeHtml(name)}</h1>
      <div class="sequence-box">${escapeHtml(notation)}</div>
      <p style="margin-top:20px;"><strong>Masse pleine longueur :</strong> ${fullLengthMass.toFixed(2)} g/mol</p>
      ${
        assignments.length
          ? `<h2 style="margin-top:30px;">Masses observées</h2>
      <table>
        <thead><tr><th class="num">Observée</th><th class="num">Intensité</th><th>Assignement</th><th class="num">Δ (Da)</th><th>Alternatives</th></tr></thead>
        <tbody>
          ${assignments
            .map(
              (a) => `<tr>
                <td class="num mono">${a.observed.mass.toFixed(2)}</td>
                <td class="num mono">${a.observed.intensity ?? '—'}</td>
                <td>${a.match ? escapeHtml(a.match.label) : '<em>non assignée</em>'}</td>
                <td class="num mono">${a.deltaDa ?? '—'}</td>
                <td>${escapeHtml(a.alternatives.map((s) => s.label).join(' · ') || '—')}</td>
              </tr>`,
            )
            .join('')}
        </tbody>
      </table>`
          : ''
      }
      <h2 style="margin-top:30px;">Espèces attendues</h2>
      <table>
        <thead><tr><th>Espèce</th><th>Catégorie</th><th class="num">Masse</th><th class="num">Δ FLP</th><th>Note</th></tr></thead>
        <tbody>
          ${species
            .map(
              (s) => `<tr>
                <td>${escapeHtml(s.label)}</td>
                <td>${escapeHtml(s.category)}</td>
                <td class="num mono">${s.mass.toFixed(2)}</td>
                <td class="num mono">${s.delta > 0 ? '+' : ''}${s.delta.toFixed(2)}</td>
                <td>${escapeHtml(s.note ?? '')}</td>
              </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </div>`,
  );
}
