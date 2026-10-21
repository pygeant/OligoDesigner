/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Synthesizer-notation parser.
 *
 * Accepted grammar (left to right, 5' -> 3'):
 *   /Code/        terminal or spacer modification
 *   (Xom) (X2f)   base with a sugar modification, either order
 *   mX fX lX      shorthand for 2'-OMe / 2'-F / LNA
 *   X             plain base, in the current sugar series
 *   d / r         switches the current series to DNA / RNA
 *   *             makes the *preceding* linkage a phosphorothioate
 */

import type { Bead, Bond, BaseType, ModLibrary, Modification, Oligo } from './types';
import { normalizeBase } from './calc';

export interface UnknownMapping {
  modId?: string;
  mass?: number;
}

export interface ParseResult {
  beads: Bead[];
  bonds: Bond[];
  term5: string | null;
  term3: string | null;
  /** Modifications invented on the fly from user-supplied masses. */
  customMods: ModLibrary;
}

const SLASH = /^\/([^/]+)\//;
const TRAILING_SLASH = /^\/([^/]+)\/$/;
const PAREN = /^\(([^)]+)\)/;
const PREFIX = /^([mfl])([atgcu])/i;
const BASE = /^([atgcu])/i;

/** Strips a leading "Name<TAB>" or "Name " prefix from a pasted line. */
export function stripName(raw: string): string {
  const input = raw.trim();
  if (input.includes('\t')) {
    const parts = input.split('\t');
    return parts[parts.length - 1].trim();
  }
  if (input.includes(' ')) {
    const firstParen = input.indexOf('(');
    const firstSlash = input.indexOf('/');
    const start = Math.min(
      firstParen === -1 ? Infinity : firstParen,
      firstSlash === -1 ? Infinity : firstSlash,
    );
    if (start !== Infinity && start > 0) return input.slice(start).trim();
  }
  return input;
}

function findMod(mods: ModLibrary, predicate: (m: Modification) => boolean) {
  return (Object.values(mods) as Modification[]).find(predicate);
}

function matchSugarMod(mods: ModLibrary, modPart: string): string | null {
  const needle = modPart.toLowerCase();
  return (
    findMod(mods, (m) => {
      if (m.type !== 'sugar') return false;
      const code = m.code.toLowerCase();
      const notation = m.notation?.toLowerCase() || '';
      return (
        code.includes(needle) ||
        notation.includes(needle) ||
        (needle === 'om' && m.id === 'OMe') ||
        (needle === '2f' && m.id === 'F')
      );
    })?.id || null
  );
}

/** Splits "(Xom)" into its base letter and its modification part. */
function splitParen(content: string): { base: string; modPart: string } | null {
  const last = content[content.length - 1]?.toUpperCase() ?? '';
  const first = content[0]?.toUpperCase() ?? '';
  if (/[ATGCU]/.test(last)) return { base: last, modPart: content.slice(0, -1) };
  if (/[ATGCU]/.test(first)) return { base: first, modPart: content.slice(1) };
  return null;
}

/**
 * Lists the tokens the parser cannot resolve against the library, so the UI can
 * ask the user to map them before parsing for real.
 */
export function scanUnrecognized(input: string, mods: ModLibrary): string[] {
  const unknown: string[] = [];
  let rest = input;

  const push = (token: string) => {
    if (!unknown.includes(token)) unknown.push(token);
  };

  while (rest.length > 0) {
    const slash = rest.match(SLASH);
    if (slash) {
      const code = `/${slash[1]}/`;
      const known = findMod(
        mods,
        (m) =>
          (m.type === 'terminal5' || m.type === 'terminal3' || m.type === 'spacer' || m.type === 'other') &&
          (m.code === code || m.notation === code),
      );
      if (!known) push(code);
      rest = rest.slice(slash[0].length);
      continue;
    }

    const paren = rest.match(PAREN);
    if (paren) {
      const content = paren[1];
      if (!splitParen(content)) {
        const code = `(${content})`;
        const known = findMod(mods, (m) => m.code === code || m.notation === code);
        if (!known) push(code);
      }
      rest = rest.slice(paren[0].length);
      continue;
    }

    if (PREFIX.test(rest)) {
      rest = rest.slice(2);
      continue;
    }
    if (BASE.test(rest)) {
      rest = rest.slice(1);
      continue;
    }
    if (rest.startsWith('*') || /^[dr]/i.test(rest)) {
      rest = rest.slice(1);
      continue;
    }

    push(rest[0]);
    rest = rest.slice(1);
  }

  return unknown;
}

export function parseSequence(
  input: string,
  mods: ModLibrary,
  mappings: Record<string, UnknownMapping> = {},
): ParseResult {
  const beads: Bead[] = [];
  const bonds: Bond[] = [];
  const customMods: ModLibrary = {};
  let term5: string | null = null;
  let term3: string | null = null;

  let rest = input;
  let series: BaseType = 'rna';
  let nextBondPS = false;

  const pushBead = (bead: Bead) => {
    beads.push(bead);
    if (beads.length > 1) {
      bonds.push({ typeId: nextBondPS ? 'PS' : 'PO' });
      nextBondPS = false;
    }
  };

  const customFor = (code: string, mass: number, type: Modification['type']) => {
    const id = `custom_${code.replace(/[/()]/g, '')}`;
    customMods[id] = {
      id,
      code,
      name: `Custom ${code}`,
      type,
      color: '#6366f1',
      mw: mass,
      builtin: false,
    };
    return id;
  };

  while (rest.length > 0) {
    // Sugar series switches.
    if (/^d/i.test(rest)) {
      series = 'dna';
      rest = rest.slice(1);
      continue;
    }
    if (/^r/i.test(rest)) {
      series = 'rna';
      rest = rest.slice(1);
      continue;
    }

    // Phosphorothioate marker, applied to the next linkage created.
    if (beads.length > 0 && rest.startsWith('*')) {
      nextBondPS = true;
      rest = rest.slice(1);
      continue;
    }

    // A trailing /Code/ is a 3' terminal. Checked before the generic slash rule
    // so that 3' modifications are no longer silently dropped.
    const trailing = rest.match(TRAILING_SLASH);
    if (trailing && beads.length > 0) {
      const code = `/${trailing[1]}/`;
      const mod = findMod(
        mods,
        (m) => m.type === 'terminal3' && (m.code === code || m.notation === code),
      );
      if (mod) term3 = mod.id;
      else {
        const mapping = mappings[code];
        if (mapping?.modId) term3 = mapping.modId;
        else if (mapping?.mass !== undefined) term3 = customFor(code, mapping.mass, 'terminal3');
      }
      break;
    }

    const slash = rest.match(SLASH);
    if (slash) {
      const code = `/${slash[1]}/`;
      const mod = findMod(
        mods,
        (m) =>
          (m.type === 'terminal5' || m.type === 'spacer' || m.type === 'other') &&
          (m.code === code || m.notation === code),
      );

      if (mod) {
        if (mod.type === 'terminal5' && beads.length === 0) term5 = mod.id;
        else pushBead({ base: 'S', baseType: series, modId: mod.id });
      } else {
        const mapping = mappings[code];
        if (mapping?.modId) {
          const mapped = mods[mapping.modId];
          if (mapped?.type === 'terminal5' && beads.length === 0) term5 = mapping.modId;
          else pushBead({ base: 'X', baseType: series, modId: mapping.modId });
        } else if (mapping?.mass !== undefined) {
          const terminal = beads.length === 0;
          const id = customFor(code, mapping.mass, terminal ? 'terminal5' : 'spacer');
          if (terminal) term5 = id;
          else pushBead({ base: 'X', baseType: series, modId: id });
        }
      }
      rest = rest.slice(slash[0].length);
      continue;
    }

    const paren = rest.match(PAREN);
    if (paren) {
      const content = paren[1];
      const code = `(${content})`;
      const split = splitParen(content);

      if (split) {
        pushBead({
          base: normalizeBase(split.base, series),
          baseType: series,
          modId: matchSugarMod(mods, split.modPart),
        });
      } else {
        const mapping = mappings[code];
        if (mapping?.modId) pushBead({ base: 'X', baseType: series, modId: mapping.modId });
        else if (mapping?.mass !== undefined) {
          pushBead({ base: 'X', baseType: series, modId: customFor(code, mapping.mass, 'other') });
        }
      }
      rest = rest.slice(paren[0].length);
      continue;
    }

    const prefix = rest.match(PREFIX);
    if (prefix) {
      const modId = { m: 'OMe', f: 'F', l: 'LNA' }[prefix[1].toLowerCase()] ?? null;
      pushBead({
        base: normalizeBase(prefix[2].toUpperCase(), series),
        baseType: series,
        modId,
      });
      rest = rest.slice(2);
      continue;
    }

    const base = rest.match(BASE);
    if (base) {
      pushBead({
        base: normalizeBase(base[1].toUpperCase(), series),
        baseType: series,
        modId: null,
      });
      rest = rest.slice(1);
      continue;
    }

    const char = rest[0];
    const mapping = mappings[char];
    if (mapping?.modId) pushBead({ base: 'X', baseType: series, modId: mapping.modId });
    else if (mapping?.mass !== undefined) {
      pushBead({ base: 'X', baseType: series, modId: customFor(char, mapping.mass, 'other') });
    }
    rest = rest.slice(1);
  }

  return { beads, bonds, term5, term3, customMods };
}

/** Applies a stored pattern to a bare base string — the batch entry point. */
export function applyPattern(
  name: string,
  sequence: string,
  pattern: { beads: { modId: string | null; baseType: BaseType }[]; bonds: Bond[]; term5: string | null; term3: string | null },
): Oligo {
  const bases = sequence.toUpperCase().replace(/[^ATGCU]/g, '').split('');

  const beads: Bead[] = bases.map((base, i) => {
    const template = i < pattern.beads.length ? pattern.beads[i] : null;
    const baseType: BaseType = template ? template.baseType : 'rna';
    return { base: normalizeBase(base, baseType), baseType, modId: template ? template.modId : null };
  });

  const bonds: Bond[] = Array.from({ length: Math.max(0, bases.length - 1) }, (_, i) => ({
    typeId: i < pattern.bonds.length ? pattern.bonds[i].typeId : 'PO',
  }));

  return { name, beads, bonds, term5: pattern.term5, term3: pattern.term3 };
}
