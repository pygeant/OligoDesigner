/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Synthesis risk panel. Rendered next to the designer so the score updates as
 * the sequence is edited.
 */

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '../lib/cn';
import type { RiskReport, Severity } from '../lib/risk';

const BAND_COLOR: Record<RiskReport['band'], string> = {
  faible: 'text-emerald-400',
  modéré: 'text-amber-400',
  élevé: 'text-orange-400',
  critique: 'text-red-400',
};

const BAND_BAR: Record<RiskReport['band'], string> = {
  faible: 'bg-emerald-500',
  modéré: 'bg-amber-500',
  élevé: 'bg-orange-500',
  critique: 'bg-red-500',
};

const SEVERITY_DOT: Record<Severity, string> = {
  info: 'bg-zinc-600',
  low: 'bg-sky-500',
  medium: 'bg-amber-500',
  high: 'bg-red-500',
};

export function RiskPanel({ report }: { report: RiskReport | null }) {
  if (!report) return null;

  return (
    <section className="bg-zinc-900/30 border border-zinc-900 rounded-2xl p-6 backdrop-blur-sm">
      <h2 className="text-sm font-bold uppercase tracking-widest text-zinc-500 mb-6 flex items-center gap-2">
        <AlertTriangle size={14} className="text-blue-500" />
        Risque de synthèse
      </h2>

      <div className="flex items-baseline gap-3 mb-3">
        <span className={cn('text-4xl font-mono font-bold tracking-tighter', BAND_COLOR[report.band])}>
          {report.score}
        </span>
        <span className="text-xs text-zinc-600 font-mono">/100</span>
        <span className={cn('ml-auto text-xs font-bold uppercase tracking-widest', BAND_COLOR[report.band])}>
          {report.band}
        </span>
      </div>

      <div className="h-1.5 w-full bg-zinc-900 rounded-full overflow-hidden mb-6">
        <div
          className={cn('h-full rounded-full transition-all', BAND_BAR[report.band])}
          style={{ width: `${report.score}%` }}
        />
      </div>

      <div className="grid grid-cols-3 gap-2 mb-6">
        <Metric label="Purines" value={`${report.metrics.purinePct.toFixed(0)}%`} />
        <Metric label="Run G max" value={String(report.metrics.longestGRun)} />
        <Metric label="Tige max" value={String(report.metrics.hairpinScore)} />
      </div>

      {report.findings.length === 0 ? (
        <p className="text-[11px] text-zinc-600 italic">Aucun motif à risque détecté.</p>
      ) : (
        <ul className="space-y-3">
          {report.findings.map((f) => (
            <li key={f.id} className="flex gap-3">
              <span className={cn('w-1.5 h-1.5 rounded-full mt-1.5 shrink-0', SEVERITY_DOT[f.severity])} />
              <div>
                <p className="text-[11px] font-bold text-zinc-300">
                  {f.title}
                  {f.weight > 0 && <span className="ml-2 text-[9px] font-mono text-zinc-600">+{f.weight}</span>}
                </p>
                <p className="text-[10px] text-zinc-500 leading-relaxed">{f.detail}</p>
                {f.positions.length > 0 && (
                  <p className="text-[9px] font-mono text-zinc-700 mt-0.5">
                    pos. {f.positions.slice(0, 12).join(', ')}
                    {f.positions.length > 12 ? '…' : ''}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-950 border border-zinc-900 rounded-lg px-3 py-2">
      <p className="text-[8px] text-zinc-600 uppercase font-bold tracking-widest">{label}</p>
      <p className="text-sm font-mono text-zinc-300">{value}</p>
    </div>
  );
}
