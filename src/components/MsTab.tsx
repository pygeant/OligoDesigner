/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * LC-MS tab: expected-species table, charge ladder and assignment of
 * deconvoluted masses pasted from the instrument report.
 */

import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, FlaskConical, Share, Target } from 'lucide-react';
import {
  DEFAULT_SPECIES_CONFIG,
  DEFAULT_TOLERANCE,
  assignMasses,
  chargeSeries,
  expectedSpecies,
  parseMassList,
  toleranceWindow,
  type SpeciesConfig,
  type Tolerance,
} from '../lib/ms';
import { buildRawSeq } from '../lib/calc';
import { msReportHtml } from '../lib/report';
import { cn } from '../lib/cn';
import { SectionCard } from './ui';
import type { MassOptions, ModLibrary, Oligo, OligoStats } from '../lib/types';

const CATEGORY_COLOR: Record<string, string> = {
  product: 'text-blue-400',
  deletion: 'text-red-400',
  addition: 'text-amber-400',
  backbone: 'text-orange-400',
  adduct: 'text-violet-400',
  degradation: 'text-rose-400',
  protection: 'text-emerald-400',
};

const TOGGLES: { key: keyof SpeciesConfig; label: string }[] = [
  { key: 'includeDesulfurization', label: 'P=O / P=S' },
  { key: 'includeAcrylonitrile', label: 'Acrylonitrile' },
  { key: 'includeDepurination', label: 'Dépurination' },
  { key: 'includeAdducts', label: 'Adduits Na/K' },
  { key: 'includeDmtOn', label: 'DMT-on' },
];

interface Props {
  oligo: Oligo;
  mods: ModLibrary;
  massOptions: MassOptions;
  stats: OligoStats | null;
}

export function MsTab({ oligo, mods, massOptions, stats }: Props) {
  const [observedText, setObservedText] = useState('');
  const [tolerance, setTolerance] = useState<Tolerance>(DEFAULT_TOLERANCE);
  const [config, setConfig] = useState<SpeciesConfig>(DEFAULT_SPECIES_CONFIG);

  const species = useMemo(
    () => (stats ? expectedSpecies(oligo, mods, massOptions, stats.mass, config) : []),
    [oligo, mods, massOptions, stats, config],
  );

  const observed = useMemo(() => parseMassList(observedText), [observedText]);
  const assignments = useMemo(
    () => (species.length ? assignMasses(observed, species, tolerance) : []),
    [observed, species, tolerance],
  );

  const ladder = useMemo(() => (stats ? chargeSeries(stats.mass) : []), [stats]);
  const assignedCount = assignments.filter((a) => a.match).length;

  const exportXlsx = () => {
    if (!assignments.length) return;
    const sheet = XLSX.utils.json_to_sheet(
      assignments.map((a) => ({
        'Masse observée': a.observed.mass,
        Intensité: a.observed.intensity ?? '',
        Assignement: a.match?.label ?? 'non assignée',
        Catégorie: a.match?.category ?? '',
        'Δ (Da)': a.deltaDa ?? '',
        'Positions compatibles': a.match?.positions?.join(' ') ?? '',
        Alternatives: a.alternatives.map((s) => s.label).join(' | '),
      })),
    );
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Assignements');
    XLSX.writeFile(book, `${oligo.name || 'oligo'}_lcms.xlsx`);
  };

  const exportReport = () => {
    if (!stats) return;
    const html = msReportHtml({
      name: oligo.name,
      notation: buildRawSeq(oligo, mods),
      fullLengthMass: stats.mass,
      species,
      assignments,
    });
    const link = document.createElement('a');
    link.download = `${oligo.name || 'oligo'}_lcms.html`;
    link.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    link.click();
  };

  if (!stats) {
    return (
      <div className="bg-zinc-900/20 border border-zinc-900 border-dashed rounded-2xl p-12 text-center text-zinc-600 text-sm italic">
        Chargez une séquence dans le Designer pour générer la table d'espèces attendues.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-5 space-y-6">
        <SectionCard
          title="Masses observées"
          icon={<Target size={14} className="text-blue-500" />}
          actions={
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.1"
                value={tolerance.value}
                onChange={(e) => setTolerance({ ...tolerance, value: parseFloat(e.target.value) || 0 })}
                className="w-20 bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-xs font-mono focus:outline-none focus:border-blue-500/50"
              />
              <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-lg p-0.5">
                {(['Da', 'ppm'] as const).map((unit) => (
                  <button
                    key={unit}
                    onClick={() => setTolerance({ ...tolerance, unit })}
                    className={cn(
                      'px-2 py-0.5 rounded text-[10px] font-bold transition-all',
                      tolerance.unit === unit ? 'bg-blue-600 text-white' : 'text-zinc-500',
                    )}
                  >
                    {unit}
                  </button>
                ))}
              </div>
            </div>
          }
        >
          <textarea
            value={observedText}
            onChange={(e) => setObservedText(e.target.value)}
            placeholder={'Collez les masses déconvoluées, une par ligne.\nMasse[TAB]intensité accepté.\n7123.4\t100\n6818.1\t12'}
            className="w-full h-[220px] bg-zinc-950 border border-zinc-800 rounded-xl p-4 font-mono text-sm focus:outline-none focus:border-blue-500/50 transition-all resize-none"
          />
          <p className="mt-3 text-[10px] text-zinc-600 font-mono">
            Fenêtre à {stats.mass.toFixed(0)} g/mol : ±{toleranceWindow(stats.mass, tolerance).toFixed(2)} Da
          </p>
        </SectionCard>

        <SectionCard title="Échelle de charges (ESI négatif)" icon={<FlaskConical size={14} className="text-blue-500" />}>
          <div className="grid grid-cols-3 gap-2">
            {ladder.map(({ z, mz }) => (
              <div key={z} className="bg-zinc-950 border border-zinc-900 rounded-lg px-3 py-2">
                <p className="text-[9px] text-zinc-600 uppercase font-bold">[M−{z}H]{z}⁻</p>
                <p className="text-xs font-mono text-blue-400">{mz.toFixed(1)}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Espèces à générer">
          <div className="flex flex-wrap gap-2">
            {TOGGLES.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setConfig({ ...config, [key]: !config[key] })}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all',
                  config[key]
                    ? 'bg-blue-600/10 border-blue-500/30 text-blue-400'
                    : 'bg-zinc-950 border-zinc-900 text-zinc-600',
                )}
              >
                {label}
              </button>
            ))}
            <button
              onClick={() => setConfig({ ...config, deletionDepth: config.deletionDepth >= 2 ? 1 : 2 })}
              className={cn(
                'px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all',
                config.deletionDepth >= 2
                  ? 'bg-blue-600/10 border-blue-500/30 text-blue-400'
                  : 'bg-zinc-950 border-zinc-900 text-zinc-600',
              )}
            >
              n−2
            </button>
          </div>
          <p className="mt-4 text-[10px] text-zinc-600 leading-relaxed">
            {species.length} espèces générées à partir de la masse pleine longueur {stats.mass.toFixed(2)} g/mol.
          </p>
        </SectionCard>
      </div>

      <div className="lg:col-span-7 space-y-6">
        {assignments.length > 0 && (
          <SectionCard
            title={`Assignements — ${assignedCount}/${assignments.length}`}
            actions={
              <div className="flex items-center gap-3">
                <button
                  onClick={exportReport}
                  className="flex items-center gap-2 text-[10px] font-bold text-blue-400 hover:text-blue-300 uppercase tracking-widest"
                >
                  <Share size={12} /> Rapport HTML
                </button>
                <button
                  onClick={exportXlsx}
                  className="flex items-center gap-2 text-[10px] font-bold text-emerald-400 hover:text-emerald-300 uppercase tracking-widest"
                >
                  <Download size={12} /> Excel
                </button>
              </div>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <Th className="text-right">Observée</Th>
                    <Th>Assignement</Th>
                    <Th className="text-right">Δ Da</Th>
                    <Th>Positions</Th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((a, i) => (
                    <tr key={i} className="border-b border-zinc-900 hover:bg-zinc-900/50 transition-colors">
                      <td className="py-3 px-3 text-xs font-mono text-right text-zinc-300">
                        {a.observed.mass.toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-xs">
                        {a.match ? (
                          <span className={CATEGORY_COLOR[a.match.category] ?? 'text-zinc-300'}>{a.match.label}</span>
                        ) : (
                          <span className="text-zinc-600 italic">non assignée</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-xs font-mono text-right text-zinc-500">{a.deltaDa ?? '—'}</td>
                      <td className="py-3 px-3 text-[10px] font-mono text-zinc-600">
                        {a.match?.positions?.join(', ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        )}

        <SectionCard title="Espèces attendues">
          <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-zinc-900">
                <tr className="border-b border-zinc-800">
                  <Th>Espèce</Th>
                  <Th className="text-right">Masse</Th>
                  <Th className="text-right">Δ FLP</Th>
                </tr>
              </thead>
              <tbody>
                {species.map((s) => (
                  <tr key={s.id} className="border-b border-zinc-900/60">
                    <td className="py-2 px-3 text-xs">
                      <span className={CATEGORY_COLOR[s.category] ?? 'text-zinc-300'}>{s.label}</span>
                      {s.note && <p className="text-[10px] text-zinc-600 mt-0.5">{s.note}</p>}
                    </td>
                    <td className="py-2 px-3 text-xs font-mono text-right text-zinc-300">{s.mass.toFixed(2)}</td>
                    <td className="py-2 px-3 text-xs font-mono text-right text-zinc-500">
                      {s.delta > 0 ? '+' : ''}
                      {s.delta.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={cn('py-3 px-3 text-[10px] font-bold text-zinc-500 uppercase tracking-widest', className)}>
      {children}
    </th>
  );
}
