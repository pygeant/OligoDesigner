/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Canvas rendering of the single-strand necklace and of the duplex view.
 * Both renderers size their own canvas and draw on a white background so the
 * output can go straight into a report or a slide.
 */

import { getBaseKey } from './calc';
import type { DuplexAlignment } from './duplex';
import type { ModLibrary, Oligo } from './types';

export type NecklaceDirection = '5-3' | '3-5';

export interface NecklaceOptions {
  direction?: NecklaceDirection;
  scale?: number;
}

function beadColor(oligo: Oligo, index: number, mods: ModLibrary): string {
  const bead = oligo.beads[index];
  const mod = bead.modId ? mods[bead.modId] : null;
  const baseMod = mods[getBaseKey(bead.base, bead.baseType)];
  return mod?.color || baseMod?.color || '#64748b';
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
  ctx.fill();
}

export function drawNecklace(
  ctx: CanvasRenderingContext2D,
  oligo: Oligo,
  mods: ModLibrary,
  { direction = '5-3', scale = 2 }: NecklaceOptions = {},
) {
  const R = 28 * scale;
  const gap = 8 * scale;
  const barW = 5 * scale;
  const barH = 24 * scale;
  const slotW = R * 2 + gap;
  const endW = 54 * scale;

  const totalW = endW * 2 + oligo.beads.length * slotW + 40 * scale;
  const titleH = oligo.name ? 30 * scale : 0;
  const totalH = titleH + 110 * scale;

  ctx.canvas.width = totalW;
  ctx.canvas.height = totalH;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, totalW, totalH);

  if (oligo.name) {
    ctx.font = `bold italic ${14 * scale}px sans-serif`;
    ctx.fillStyle = '#18181b';
    ctx.textAlign = 'center';
    ctx.fillText(oligo.name, totalW / 2, 20 * scale);
  }

  const top = titleH + 50 * scale;
  let x = 20 * scale + endW;
  const reversed = direction === '3-5';

  ctx.font = `bold ${11 * scale}px monospace`;
  const leftTerm = reversed ? oligo.term3 : oligo.term5;
  ctx.fillStyle = leftTerm ? (reversed ? '#10b981' : '#f472b6') : '#64748b';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    leftTerm ? mods[leftTerm].code.replace(/\//g, '') : reversed ? "3'" : "5'",
    20 * scale + endW / 2,
    top,
  );

  const order = reversed
    ? oligo.beads.map((_, i) => oligo.beads.length - 1 - i)
    : oligo.beads.map((_, i) => i);
  const bondsToDraw = reversed ? [...oligo.bonds].reverse() : oligo.bonds;

  order.forEach((beadIndex, i) => {
    if (i > 0) {
      const bondMod = mods[bondsToDraw[i - 1].typeId];
      if (bondMod && bondMod.id !== 'PO') {
        ctx.fillStyle = bondMod.color || '#64748b';
        roundedRect(ctx, x - gap / 2 - barW / 2, top - barH / 2, barW, barH, 3 * scale);
      }
    }

    const color = beadColor(oligo, beadIndex, mods);
    ctx.beginPath();
    ctx.arc(x + R, top, R, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = `${color}88`;
    ctx.lineWidth = 2 * scale;
    ctx.stroke();

    ctx.font = `bold ${18 * scale}px monospace`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(oligo.beads[beadIndex].base, x + R, top);

    ctx.font = `${9 * scale}px monospace`;
    ctx.fillStyle = '#71717a';
    ctx.textBaseline = 'top';
    ctx.fillText(String(beadIndex + 1), x + R, top + R + 8 * scale);

    x += slotW;
  });

  ctx.font = `bold ${11 * scale}px monospace`;
  const rightTerm = reversed ? oligo.term5 : oligo.term3;
  ctx.fillStyle = rightTerm ? (reversed ? '#f472b6' : '#10b981') : '#64748b';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    rightTerm ? mods[rightTerm].code.replace(/\//g, '') : reversed ? "5'" : "3'",
    x + endW / 2,
    top,
  );
}

export interface DuplexRenderInput {
  name: string;
  sense: Oligo;
  antisense: Oligo;
  alignment: DuplexAlignment;
}

/**
 * Draws the duplex as two aligned necklaces: sense 5'->3' on top, antisense
 * 3'->5' underneath, with a pairing mark in every paired column.
 */
export function drawDuplex(
  ctx: CanvasRenderingContext2D,
  { name, sense, antisense, alignment }: DuplexRenderInput,
  mods: ModLibrary,
  scale = 2,
) {
  const R = 22 * scale;
  const gap = 8 * scale;
  const slotW = R * 2 + gap;
  const endW = 48 * scale;
  const rowGap = 54 * scale;
  const barW = 4 * scale;
  const barH = 18 * scale;

  const columns = alignment.columns;
  const totalW = endW * 2 + columns.length * slotW + 40 * scale;
  const titleH = name ? 34 * scale : 0;
  const totalH = titleH + 180 * scale;

  ctx.canvas.width = totalW;
  ctx.canvas.height = totalH;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, totalW, totalH);

  if (name) {
    ctx.font = `bold italic ${15 * scale}px sans-serif`;
    ctx.fillStyle = '#18181b';
    ctx.textAlign = 'center';
    ctx.fillText(name, totalW / 2, 22 * scale);
  }

  const topRow = titleH + 50 * scale;
  const bottomRow = topRow + rowGap + R * 2;
  const originX = 20 * scale + endW;

  const columnX = (i: number) => originX + i * slotW;

  const drawBead = (oligo: Oligo, index: number, cx: number, cy: number) => {
    const color = beadColor(oligo, index, mods);
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = `${color}88`;
    ctx.lineWidth = 2 * scale;
    ctx.stroke();

    ctx.font = `bold ${15 * scale}px monospace`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(oligo.beads[index].base, cx, cy);
  };

  const drawLinkage = (oligo: Oligo, bondIndex: number, cx: number, cy: number) => {
    const bond = oligo.bonds[bondIndex];
    if (!bond) return;
    const bondMod = mods[bond.typeId];
    if (!bondMod || bondMod.id === 'PO') return;
    ctx.fillStyle = bondMod.color || '#64748b';
    roundedRect(ctx, cx - barW / 2, cy - barH / 2, barW, barH, 2 * scale);
  };

  columns.forEach((col, i) => {
    const cx = columnX(i) + R;

    if (col.senseIndex !== null) {
      drawBead(sense, col.senseIndex, cx, topRow);
      if (col.senseIndex > 0 && columns[i - 1]?.senseIndex !== null) {
        drawLinkage(sense, col.senseIndex - 1, cx - R - gap / 2, topRow);
      }
      ctx.font = `${9 * scale}px monospace`;
      ctx.fillStyle = '#a1a1aa';
      ctx.textBaseline = 'bottom';
      ctx.fillText(String(col.senseIndex + 1), cx, topRow - R - 6 * scale);
    }

    if (col.antisenseIndex !== null) {
      drawBead(antisense, col.antisenseIndex, cx, bottomRow);
      // Antisense runs right to left, so its linkage sits on the right side.
      if (col.antisenseIndex > 0 && columns[i + 1]?.antisenseIndex !== null) {
        drawLinkage(antisense, col.antisenseIndex - 1, cx + R + gap / 2, bottomRow);
      }
      ctx.font = `${9 * scale}px monospace`;
      ctx.fillStyle = '#a1a1aa';
      ctx.textBaseline = 'top';
      ctx.fillText(String(col.antisenseIndex + 1), cx, bottomRow + R + 6 * scale);
    }

    if (col.pair === 'wc' || col.pair === 'wobble') {
      ctx.strokeStyle = col.pair === 'wc' ? '#3f3f46' : '#f59e0b';
      ctx.lineWidth = (col.pair === 'wc' ? 2.5 : 2) * scale;
      ctx.setLineDash(col.pair === 'wobble' ? [4 * scale, 4 * scale] : []);
      ctx.beginPath();
      ctx.moveTo(cx, topRow + R + 4 * scale);
      ctx.lineTo(cx, bottomRow - R - 4 * scale);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (col.pair === 'mismatch') {
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2 * scale;
      const mid = (topRow + bottomRow) / 2;
      const d = 6 * scale;
      ctx.beginPath();
      ctx.moveTo(cx - d, mid - d);
      ctx.lineTo(cx + d, mid + d);
      ctx.moveTo(cx + d, mid - d);
      ctx.lineTo(cx - d, mid + d);
      ctx.stroke();
    }
  });

  // Strand end labels.
  ctx.font = `bold ${12 * scale}px monospace`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  const firstSense = columns.findIndex((c) => c.senseIndex !== null);
  const lastSense = columns.length - 1 - [...columns].reverse().findIndex((c) => c.senseIndex !== null);
  const firstAs = columns.findIndex((c) => c.antisenseIndex !== null);
  const lastAs = columns.length - 1 - [...columns].reverse().findIndex((c) => c.antisenseIndex !== null);

  ctx.fillStyle = '#f472b6';
  ctx.fillText("5'", columnX(firstSense) - endW / 2 + R, topRow);
  ctx.fillStyle = '#10b981';
  ctx.fillText("3'", columnX(lastSense) + R + endW / 2, topRow);
  ctx.fillStyle = '#10b981';
  ctx.fillText("3'", columnX(firstAs) - endW / 2 + R, bottomRow);
  ctx.fillStyle = '#f472b6';
  ctx.fillText("5'", columnX(lastAs) + R + endW / 2, bottomRow);

  // Strand names.
  ctx.font = `${10 * scale}px sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#71717a';
  ctx.fillText(sense.name || 'sense', 20 * scale, topRow - R - 22 * scale);
  ctx.fillText(antisense.name || 'antisense', 20 * scale, bottomRow + R + 24 * scale);
}
