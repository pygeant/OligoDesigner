/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Duplex assembly tab: generates or accepts an antisense strand, aligns it
 * against the sense strand and exports the pair as a single duplex figure.
 */

import React, { useMemo, useState } from 'react';
import { Download, GitCompare, RefreshCw, Share } from 'lucide-react';
import { alignDuplex, buildAntisense } from '../lib/duplex';
import { buildRawSeq, calculateStats, getBaseKey } from '../lib/calc';
import { parseSequence, stripName } from '../lib/parser';
import { drawDuplex } from '../lib/render';
import { duplexReportHtml } from '../lib/report';
import { cn } from '../lib/cn';
import { SectionCard, StatRow } from './ui';
import type { MassOptions, ModLibrary, Oligo } from '../lib/types';

const OVERHANGS = [
  { id: 'none', label: 'Franc', value: '' },
  { id: 'uu', label: 'UU', value: 'UU' },
  { id: 'tt', label: 'dTdT', value: 'TT' },
];

interface Props {
  sense: Oligo;
  mods: ModLibrary;
  massOptions: MassOptions;
}

export function DuplexTab({ sense, mods, massOptions }: Props) {
  const [antisense, setAntisense] = useState<Oligo | null>(null);
  const [overhang, setOverhang] = useState('UU');
  const [mirrorMods, setMirrorMods] = useState(true);
  const [manualInput, setManualInput] = useState('');

  const senseStats = useMemo(() => calculateStats(sense, mods, massOptions), [sense, mods, massOptions]);
  const antisenseStats = useMemo(
    () => (antisense ? calculateStats(antisense, mods, massOptions) : null),
    [antisense, mods, massOptions],
  );
  const alignment = useMemo(
    () => (antisense && sense.beads.length ? alignDuplex(sense, antisense) : null),
    [sense, antisense],
  );

  const generate = () => {
    if (!sense.beads.length) return;
    const overhangSeries = overhang === 'TT' ? 'dna' : 'rna';
    setAntisense(
      buildAntisense(sense, {
        overhang,
        overhangSeries,
        ...(mirrorMods ? {} : { modId: null }),
      }),
    );
  };

  const applyManual = () => {
    const input = stripName(manualInput);
    if (!input) return;
    const parsed = parseSequence(input, mods);
    if (!parsed.beads.length) return;
    setAntisense({
      name: `${sense.name}_AS`,
      beads: parsed.beads,
      bonds: parsed.bonds,
      term5: parsed.term5,
      term3: parsed.term3,
    });
  };

  const withCanvas = (action: (canvas: HTMLCanvasElement) => void) => {
    if (!antisense || !alignment) return;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawDuplex(ctx, { name: `${sense.name} — duplex`, sense, antisense, alignment }, mods);
    action(canvas);
  };

  const exportPng = () =>
    withCanvas((canvas) => {
      const link = document.createElement('a');
      link.download = `${sense.name || 'duplex'}_duplex.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    });

  const exportReport = () =>
    withCanvas((canvas) => {
      if (!antisense || !alignment) return;
      const html = duplexReportHtml({
        name: sense.name,
        png: canvas.toDataURL('image/png'),
        senseNotation: buildRawSeq(sense, mods),
        antisenseNotation: buildRawSeq(antisense, mods),
        senseStats,
        antisenseStats,
        alignment,
      });
      const link = document.createElement('a');
      link.download = `${sense.name || 'duplex'}_duplex.html`;
      link.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      link.click();
    });

  const duplexMass =
    senseStats && antisenseStats ? (senseStats.mass + antisenseStats.mass).toFixed(2) : '—';

  return (
    <div className="space-y-6">
      <SectionCard
        title="Brin antisens"
        icon={<GitCompare size={14} className="text-blue-500" />}
        actions={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-zinc-950/50 border border-zinc-800 rounded-lg p-1">
              {OVERHANGS.map((o) => (
                <button
                  key={o.id}
                  onClick={() => setOverhang(o.value)}
                  className={cn(
                    'px-3 py-1 rounded text-[10px] font-bold transition-all',
                    overhang === o.value ? 'bg-blue-600 text-white' : 'text-zinc-500 hover:text-zinc-300',
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
              <input
                type="checkbox"
                checked={mirrorMods}
                onChange={(e) => setMirrorMods(e.target.checked)}
                className="accent-blue-500"
              />
              Miroir des modifications
            </label>
            <button
              onClick={generate}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-lg shadow-blue-600/20"
            >
              <RefreshCw size={14} /> Générer le complément
            </button>
          </div>
        }
      >
        <div className="flex gap-3">
          <input
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            placeholder="Ou collez une notation antisens — (Aom)*(G2f)…"
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 font-mono text-sm focus:outline-none focus:border-blue-500/50 transition-all"
          />
          <button
            onClick={applyManual}
            className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 px-6 rounded-xl text-xs font-bold transition-all"
          >
            Charger
          </button>
        </div>
        {antisense && (
          <p className="mt-4 font-mono text-xs text-zinc-400 break-all bg-zinc-950 border border-zinc-800 rounded-xl p-4">
            {buildRawSeq(antisense, mods)}
          </p>
        )}
      </SectionCard>

      {alignment && antisense ? (
        <>
          <SectionCard
            title="Appariement"
            icon={<GitCompare size={14} className="text-blue-500" />}
            actions={
              <div className="flex items-center gap-3">
                <button
                  onClick={exportReport}
                  className="flex items-center gap-2 text-[10px] font-bold text-blue-400 hover:text-blue-300 uppercase tracking-widest transition-colors"
                >
                  <Share size={12} /> Rapport HTML
                </button>
                <button
                  onClick={exportPng}
                  className="flex items-center gap-2 text-[10px] font-bold text-zinc-400 hover:text-white uppercase tracking-widest transition-colors"
                >
                  <Download size={12} /> Export PNG duplex
                </button>
              </div>
            }
          >
            <DuplexView sense={sense} antisense={antisense} alignment={alignment} mods={mods} />
          </SectionCard>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SectionCard title="Masses">
              <div className="space-y-4">
                <StatRow label="Sens" value={senseStats?.mw || '—'} unit="g/mol" />
                <StatRow label="Antisens" value={antisenseStats?.mw || '—'} unit="g/mol" />
                <div className="h-px bg-zinc-800 my-2" />
                <StatRow label="Duplex" value={duplexMass} unit="g/mol" color="text-blue-400" />
                <StatRow
                  label="ε 260 cumulé"
                  value={
                    senseStats && antisenseStats
                      ? (senseStats.epsilon + antisenseStats.epsilon).toLocaleString()
                      : '—'
                  }
                  unit="M⁻¹cm⁻¹"
                />
              </div>
            </SectionCard>

            <SectionCard title="Structure">
              <div className="space-y-4">
                <StatRow label="Paires Watson-Crick" value={alignment.wcCount} />
                <StatRow
                  label="Wobble G·U"
                  value={alignment.wobbleCount}
                  color={alignment.wobbleCount ? 'text-amber-400' : undefined}
                />
                <StatRow
                  label="Mésappariements"
                  value={alignment.mismatchCount}
                  color={alignment.mismatchCount ? 'text-red-400' : undefined}
                />
                <StatRow label="GC de la zone appariée" value={`${alignment.gcPct.toFixed(1)}%`} />
                <div className="h-px bg-zinc-800 my-2" />
                <StatRow label="Overhang 5' sens" value={`${alignment.overhangs.sense5} nt`} />
                <StatRow label="Overhang 3' sens" value={`${alignment.overhangs.sense3} nt`} />
                <StatRow label="Overhang 3' antisens" value={`${alignment.overhangs.antisense3} nt`} />
                <StatRow label="Overhang 5' antisens" value={`${alignment.overhangs.antisense5} nt`} />
              </div>
            </SectionCard>
          </div>
        </>
      ) : (
        <div className="bg-zinc-900/20 border border-zinc-900 border-dashed rounded-2xl p-12 text-center text-zinc-600 text-sm italic">
          {sense.beads.length
            ? 'Générez ou collez un brin antisens pour afficher le duplex.'
            : 'Chargez une séquence dans le Designer.'}
        </div>
      )}
    </div>
  );
}

function DuplexView({
  sense,
  antisense,
  alignment,
  mods,
}: {
  sense: Oligo;
  antisense: Oligo;
  alignment: ReturnType<typeof alignDuplex>;
  mods: ModLibrary;
}) {
  const colorOf = (oligo: Oligo, index: number) => {
    const bead = oligo.beads[index];
    const mod = bead.modId ? mods[bead.modId] : null;
    return mod?.color || mods[getBaseKey(bead.base, bead.baseType)]?.color || '#64748b';
  };

  return (
    <div className="overflow-x-auto pb-4">
      <div className="inline-flex flex-col gap-1 min-w-max px-2">
        <div className="flex items-center gap-1">
          <span className="w-8 text-[10px] font-mono text-pink-400 shrink-0">5'</span>
          {alignment.columns.map((col, i) => (
            <React.Fragment key={`s${i}`}>
              <Residue oligo={sense} index={col.senseIndex} color={colorOf} />
            </React.Fragment>
          ))}
          <span className="w-8 text-[10px] font-mono text-emerald-400 shrink-0 text-right">3'</span>
        </div>

        <div className="flex items-center gap-1">
          <span className="w-8 shrink-0" />
          {alignment.columns.map((col, i) => (
            <span key={`p${i}`} className="w-7 flex justify-center shrink-0">
              {col.pair === 'wc' && <span className="w-px h-4 bg-zinc-500" />}
              {col.pair === 'wobble' && <span className="w-px h-4 bg-amber-500 opacity-70" />}
              {col.pair === 'mismatch' && <span className="text-red-500 text-[11px] leading-none">×</span>}
            </span>
          ))}
          <span className="w-8 shrink-0" />
        </div>

        <div className="flex items-center gap-1">
          <span className="w-8 text-[10px] font-mono text-emerald-400 shrink-0">3'</span>
          {alignment.columns.map((col, i) => (
            <React.Fragment key={`a${i}`}>
              <Residue oligo={antisense} index={col.antisenseIndex} color={colorOf} />
            </React.Fragment>
          ))}
          <span className="w-8 text-[10px] font-mono text-pink-400 shrink-0 text-right">5'</span>
        </div>
      </div>
    </div>
  );
}

function Residue({
  oligo,
  index,
  color,
}: {
  oligo: Oligo;
  index: number | null;
  color: (oligo: Oligo, index: number) => string;
}) {
  if (index === null) return <span className="w-7 h-7 shrink-0" />;
  const bead = oligo.beads[index];
  return (
    <span
      title={`${oligo.name} · position ${index + 1}`}
      className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center font-mono font-bold text-[11px] text-white"
      style={{ backgroundColor: color(oligo, index) }}
    >
      {bead.base}
    </span>
  );
}
