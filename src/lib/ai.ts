/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Provider-agnostic AI layer.
 *
 * Two transports, decided at runtime:
 *   proxy  — the app is served by server.ts, which holds the API key. Nothing
 *            secret ever reaches the browser. Preferred.
 *   direct — standalone single-file build: the user supplies their own key,
 *            kept in localStorage and sent only to the provider.
 *
 * Model output is never trusted: every response is validated and normalised
 * against the local modification library before it can touch the design.
 */

import { normalizeBase } from './calc';
import type { Bead, Bond, ModLibrary, Oligo } from './types';

export type AiTransport = 'proxy' | 'direct' | 'unavailable';

const KEY_STORAGE = 'oligo_ai_key';
const MODEL = 'gemini-2.5-flash';

export function getStoredKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

export function setStoredKey(key: string): void {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    /* storage unavailable — direct mode simply stays off */
  }
}

/** Probes the server proxy; falls back to the user key, then to unavailable. */
export async function detectTransport(signal?: AbortSignal): Promise<AiTransport> {
  try {
    const res = await fetch('/api/ai/health', { signal });
    if (res.ok) {
      const body = (await res.json()) as { configured?: boolean };
      if (body.configured) return 'proxy';
    }
  } catch {
    /* no proxy in standalone mode */
  }
  return getStoredKey() ? 'direct' : 'unavailable';
}

interface GenerateOptions {
  prompt: string;
  system?: string;
  schema: Record<string, unknown>;
  transport: AiTransport;
  signal?: AbortSignal;
}

async function generateViaProxy({ prompt, system, schema, signal }: GenerateOptions): Promise<string> {
  const res = await fetch('/api/ai/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, system, schema }),
    signal,
  });
  if (!res.ok) throw new Error(`Proxy IA : ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { text?: string };
  if (!body.text) throw new Error('Réponse vide du proxy IA.');
  return body.text;
}

async function generateDirect({ prompt, system, schema, signal }: GenerateOptions): Promise<string> {
  const key = getStoredKey();
  if (!key) throw new Error('Aucune clé API configurée.');

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        systemInstruction: system ? { parts: [{ text: system }] } : undefined,
        generationConfig: { responseMimeType: 'application/json', responseSchema: schema },
      }),
    },
  );
  if (!res.ok) throw new Error(`API IA : ${res.status}`);
  const body = await res.json();
  const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Réponse vide du modèle.');
  return text;
}

async function generateJson<T>(options: GenerateOptions): Promise<T> {
  if (options.transport === 'unavailable') {
    throw new Error("IA non configurée : renseignez une clé API ou servez l'application via server.ts.");
  }
  const raw =
    options.transport === 'proxy' ? await generateViaProxy(options) : await generateDirect(options);
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error('Le modèle a renvoyé une réponse non JSON.');
  }
}

// --- Natural-language design -------------------------------------------------

const SUGARS = ['none', 'OMe', 'F', 'LNA'] as const;
const LINKAGES = ['PO', 'PS'] as const;

export interface DesignSpec {
  name: string;
  bases: string;
  residues: { sugar: (typeof SUGARS)[number]; series: 'dna' | 'rna' }[];
  linkages: (typeof LINKAGES)[number][];
  term5: string;
  term3: string;
  rationale: string;
}

const DESIGN_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    bases: { type: 'string', description: "Lettres A/U/G/C/T, 5'->3'. Chaîne vide si l'utilisateur n'a pas donné de séquence." },
    residues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          sugar: { type: 'string', enum: [...SUGARS] },
          series: { type: 'string', enum: ['dna', 'rna'] },
        },
        required: ['sugar', 'series'],
      },
    },
    linkages: { type: 'array', items: { type: 'string', enum: [...LINKAGES] } },
    term5: { type: 'string', enum: ['none', '5Phos', '5Cy3'] },
    term3: { type: 'string', enum: ['none', '3Phos', '3Biotin'] },
    rationale: { type: 'string' },
  },
  required: ['name', 'bases', 'residues', 'linkages', 'term5', 'term3', 'rationale'],
} as const;

const DESIGN_SYSTEM = [
  "Tu es un assistant de conception d'oligonucléotides thérapeutiques.",
  "À partir d'une consigne en langage naturel, tu produis une spécification position par position.",
  'Règles strictes :',
  "- residues contient exactement un élément par résidu, dans l'ordre 5'->3'.",
  '- linkages contient exactement (nombre de résidus - 1) éléments.',
  "- Si l'utilisateur fournit une séquence, bases la reprend à l'identique ; sinon bases est vide et le motif sera appliqué à la séquence courante.",
  "- Un gapmer 5-10-5 signifie 5 résidus modifiés, 10 résidus DNA non modifiés, 5 résidus modifiés.",
  '- Par défaut un siRNA est en série rna, un ASO gapmer a un gap en série dna.',
  '- rationale : deux phrases maximum, en français, sur les choix faits.',
].join('\n');

export async function designFromPrompt(
  instruction: string,
  context: { currentBases: string; currentLength: number },
  transport: AiTransport,
  signal?: AbortSignal,
): Promise<DesignSpec> {
  const prompt = [
    `Consigne : ${instruction}`,
    context.currentBases
      ? `Séquence actuellement chargée (${context.currentLength} nt) : ${context.currentBases}`
      : 'Aucune séquence chargée.',
  ].join('\n');

  return generateJson<DesignSpec>({
    prompt,
    system: DESIGN_SYSTEM,
    schema: DESIGN_SCHEMA as unknown as Record<string, unknown>,
    transport,
    signal,
  });
}

const SUGAR_TO_MOD: Record<string, string | null> = {
  none: null,
  OMe: 'OMe',
  F: 'F',
  LNA: 'LNA',
};

export interface AppliedDesign {
  oligo: Oligo;
  warnings: string[];
}

/**
 * Turns a model specification into an Oligo, clamping everything to what the
 * local library actually supports and reporting every adjustment made.
 */
export function applyDesignSpec(spec: DesignSpec, fallbackBases: string, mods: ModLibrary): AppliedDesign {
  const warnings: string[] = [];

  const rawBases = (spec.bases || fallbackBases || '').toUpperCase().replace(/[^ATGCU]/g, '');
  if (!rawBases) throw new Error('Aucune séquence exploitable dans la réponse du modèle.');

  const residues = Array.isArray(spec.residues) ? spec.residues : [];
  if (residues.length !== rawBases.length) {
    warnings.push(
      `Motif de ${residues.length} positions pour ${rawBases.length} bases : ajusté sur la longueur de la séquence.`,
    );
  }

  const beads: Bead[] = rawBases.split('').map((base, i) => {
    const residue = residues[i] ?? residues[residues.length - 1] ?? { sugar: 'none', series: 'rna' as const };
    const series = residue.series === 'dna' ? 'dna' : 'rna';
    const modKey = SUGAR_TO_MOD[residue.sugar] ?? null;
    if (residue.sugar && !(residue.sugar in SUGAR_TO_MOD)) {
      warnings.push(`Sucre inconnu « ${residue.sugar} » en position ${i + 1} : ignoré.`);
    }
    return {
      base: normalizeBase(base, series),
      baseType: series,
      modId: modKey && mods[modKey] ? modKey : null,
    };
  });

  const linkages = Array.isArray(spec.linkages) ? spec.linkages : [];
  const bonds: Bond[] = Array.from({ length: Math.max(0, beads.length - 1) }, (_, i) => ({
    typeId: linkages[i] === 'PS' ? 'PS' : 'PO',
  }));
  if (linkages.length && linkages.length !== beads.length - 1) {
    warnings.push(`Motif de liaisons de ${linkages.length} éléments au lieu de ${beads.length - 1} : complété en PO.`);
  }

  const term = (value: string) => (value && value !== 'none' && mods[value] ? value : null);

  return {
    oligo: {
      name: spec.name?.trim() || 'AI_Design',
      beads,
      bonds,
      term5: term(spec.term5),
      term3: term(spec.term3),
    },
    warnings,
  };
}

// --- Design review -----------------------------------------------------------

export interface DesignReview {
  summary: string;
  points: { topic: string; comment: string; severity: 'info' | 'warning' }[];
}

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    points: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          topic: { type: 'string' },
          comment: { type: 'string' },
          severity: { type: 'string', enum: ['info', 'warning'] },
        },
        required: ['topic', 'comment', 'severity'],
      },
    },
  },
  required: ['summary', 'points'],
} as const;

export async function reviewDesign(
  notation: string,
  facts: string,
  transport: AiTransport,
  signal?: AbortSignal,
): Promise<DesignReview> {
  return generateJson<DesignReview>({
    prompt: `Notation synthétiseur :\n${notation}\n\nDonnées calculées localement :\n${facts}`,
    system: [
      "Tu relis un design d'oligonucléotide pour un chimiste expérimenté.",
      'Commente le motif de modifications au regard des conventions du domaine (ESC, ESC avancé, gapmer).',
      'Ne recalcule rien : les valeurs fournies font foi.',
      'Sois bref, technique, en français. Cinq points maximum.',
    ].join('\n'),
    schema: REVIEW_SCHEMA as unknown as Record<string, unknown>,
    transport,
    signal,
  });
}
