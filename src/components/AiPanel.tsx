/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Natural-language design bar. The model only proposes a specification; it is
 * validated and applied locally, and every adjustment is surfaced.
 */

import React, { useEffect, useState } from 'react';
import { Sparkles, Loader2, ShieldAlert } from 'lucide-react';
import {
  applyDesignSpec,
  designFromPrompt,
  detectTransport,
  reviewDesign,
  type AiTransport,
  type DesignReview,
} from '../lib/ai';
import { cn } from '../lib/cn';
import type { ModLibrary, Oligo } from '../lib/types';

const EXAMPLES = [
  'gapmer 5-10-5, LNA sur les ailes, PS intégral',
  "siRNA 21mer, alternance 2'OMe/2'F, PS sur les deux premières et deux dernières liaisons",
  "passe tout en 2'OMe sauf les positions 7 à 11 en 2'F",
];

interface Props {
  oligo: Oligo;
  mods: ModLibrary;
  currentBases: string;
  facts: string;
  notation: string;
  onApply: (oligo: Oligo) => void;
}

export function AiPanel({ oligo, mods, currentBases, facts, notation, onApply }: Props) {
  const [transport, setTransport] = useState<AiTransport>('unavailable');
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState<'design' | 'review' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [rationale, setRationale] = useState<string | null>(null);
  const [review, setReview] = useState<DesignReview | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    detectTransport(controller.signal).then(setTransport).catch(() => setTransport('unavailable'));
    return () => controller.abort();
  }, []);

  const runDesign = async () => {
    if (!prompt.trim()) return;
    setBusy('design');
    setError(null);
    setWarnings([]);
    setRationale(null);
    try {
      const spec = await designFromPrompt(
        prompt,
        { currentBases, currentLength: currentBases.length },
        transport,
      );
      const applied = applyDesignSpec(spec, currentBases, mods);
      onApply({ ...applied.oligo, name: spec.name?.trim() || oligo.name });
      setWarnings(applied.warnings);
      setRationale(spec.rationale);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const runReview = async () => {
    setBusy('review');
    setError(null);
    setReview(null);
    try {
      setReview(await reviewDesign(notation, facts, transport));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="bg-indigo-500/5 border border-indigo-500/20 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <h2 className="text-sm font-bold uppercase tracking-widest text-indigo-400 flex items-center gap-2">
          <Sparkles size={14} />
          Design en langage naturel
        </h2>
        <TransportBadge transport={transport} />
      </div>

      <div className="flex gap-3">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && runDesign()}
          disabled={transport === 'unavailable'}
          placeholder="Décrivez le motif voulu…"
          className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500/50 transition-all disabled:opacity-40"
        />
        <button
          onClick={runDesign}
          disabled={transport === 'unavailable' || busy !== null}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white px-6 py-3 rounded-xl text-xs font-bold transition-all shadow-lg shadow-indigo-600/20 flex items-center gap-2"
        >
          {busy === 'design' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          Appliquer
        </button>
        <button
          onClick={runReview}
          disabled={transport === 'unavailable' || busy !== null || !oligo.beads.length}
          className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 disabled:opacity-40 text-zinc-300 px-4 py-3 rounded-xl text-xs font-bold transition-all"
        >
          {busy === 'review' ? <Loader2 size={14} className="animate-spin" /> : 'Relire le design'}
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mt-3">
        {EXAMPLES.map((example) => (
          <button
            key={example}
            onClick={() => setPrompt(example)}
            className="text-[10px] text-zinc-500 hover:text-indigo-400 bg-zinc-950/60 border border-zinc-900 rounded-full px-3 py-1 transition-colors"
          >
            {example}
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-4 text-[11px] text-red-400 bg-red-500/5 border border-red-500/20 rounded-xl p-3">{error}</p>
      )}

      {rationale && (
        <p className="mt-4 text-[11px] text-zinc-400 bg-zinc-950/60 border border-zinc-900 rounded-xl p-3 italic">
          {rationale}
        </p>
      )}

      {warnings.length > 0 && (
        <ul className="mt-3 space-y-1">
          {warnings.map((w) => (
            <li key={w} className="text-[10px] text-amber-400 flex gap-2">
              <ShieldAlert size={12} className="shrink-0 mt-0.5" />
              {w}
            </li>
          ))}
        </ul>
      )}

      {review && (
        <div className="mt-4 space-y-3">
          <p className="text-[11px] text-zinc-300">{review.summary}</p>
          <ul className="space-y-2">
            {review.points.map((p, i) => (
              <li key={i} className="flex gap-2">
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full mt-1.5 shrink-0',
                    p.severity === 'warning' ? 'bg-amber-500' : 'bg-zinc-600',
                  )}
                />
                <p className="text-[10px] text-zinc-500 leading-relaxed">
                  <span className="font-bold text-zinc-400">{p.topic} — </span>
                  {p.comment}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function TransportBadge({ transport }: { transport: AiTransport }) {
  const config = {
    proxy: { label: 'Proxy serveur — clé côté serveur', className: 'text-emerald-400 border-emerald-500/30' },
    direct: { label: 'Clé locale — séquences envoyées au fournisseur', className: 'text-amber-400 border-amber-500/30' },
    unavailable: { label: 'IA non configurée', className: 'text-zinc-600 border-zinc-800' },
  }[transport];

  return (
    <span className={cn('text-[9px] font-bold uppercase tracking-widest border rounded-full px-3 py-1', config.className)}>
      {config.label}
    </span>
  );
}
