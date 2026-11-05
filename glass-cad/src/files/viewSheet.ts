// Lays rendered views out as finished images: one sheet with front, side, top and
// 3/4 in a grid under a title block, or each view on its own. Dimension lines are
// drawn on the true views in the drawing's own scale, so they line up with the piece.

import type { Units } from '../model/types';
import { formatLength } from '../model/units';
import type { OrthoView } from './orthoViews';

export interface SheetText {
  title: string;
  subtitle: string;
  units: Units;
  dims: boolean;
}

const INK = '#1c1c1c';
const DIM = '#a2461c';
const MUTED = '#6b6b6b';
const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('A view failed to render.'));
    img.src = url;
  });

/** Draws one view, with its dimension lines, into a T×T square at (x, y). */
async function drawView(ctx: CanvasRenderingContext2D, v: OrthoView, x: number, y: number, T: number, units: Units, dims: boolean) {
  ctx.drawImage(await loadImage(v.url), x, y, T, T);
  if (!dims || !v.measured) return;
  const k = T / v.size;
  const px = (u: number) => x + (u - v.u0) * k;
  const py = (val: number) => y + T - (val - v.v0) * k;
  const gap = T * 0.05;
  const tick = T * 0.012;
  const across = v.name === 'Side' ? 'D' : 'W';
  const up = v.name === 'Top' ? 'D' : 'H';
  const bottom = py(v.vMin) + gap;
  const right = px(v.uMax) + gap;

  ctx.save();
  ctx.strokeStyle = DIM;
  ctx.lineWidth = Math.max(1.5, T / 450);
  ctx.beginPath();
  ctx.moveTo(px(v.uMin), bottom);
  ctx.lineTo(px(v.uMax), bottom);
  for (const u of [v.uMin, v.uMax]) {
    ctx.moveTo(px(u), bottom - tick);
    ctx.lineTo(px(u), bottom + tick);
  }
  ctx.moveTo(right, py(v.vMin));
  ctx.lineTo(right, py(v.vMax));
  for (const val of [v.vMin, v.vMax]) {
    ctx.moveTo(right - tick, py(val));
    ctx.lineTo(right + tick, py(val));
  }
  ctx.stroke();

  ctx.font = `600 ${Math.round(T * 0.03)}px ${FONT}`;
  const label = (text: string, tx: number, ty: number, align: CanvasTextAlign) => {
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(3, T / 220);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; // a halo, so it reads over glass or line work
    ctx.strokeText(text, tx, ty);
    ctx.fillStyle = DIM;
    ctx.fillText(text, tx, ty);
  };
  label(`${across} ${formatLength(v.uMax - v.uMin, units)}`, (px(v.uMin) + px(v.uMax)) / 2, bottom + T * 0.035, 'center');
  label(`${up} ${formatLength(v.vMax - v.vMin, units)}`, right + tick * 1.8, (py(v.vMin) + py(v.vMax)) / 2, 'left');
  ctx.restore();
}

/** All four views on one sheet, two by two, under a title block. Returns a PNG data URL. */
export async function composeSheet(views: OrthoView[], text: SheetText): Promise<string> {
  const T = 820;
  const pad = 56;
  const gap = 40;
  const head = 128;
  const caption = 44;
  const canvas = document.createElement('canvas');
  canvas.width = pad * 2 + T * 2 + gap;
  canvas.height = head + (T + caption) * 2 + gap + pad;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = INK;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.font = `700 40px ${FONT}`;
  ctx.fillText(text.title, pad, 66);
  ctx.fillStyle = MUTED;
  ctx.font = `400 22px ${FONT}`;
  ctx.fillText(text.subtitle, pad, 100);
  ctx.fillStyle = INK;
  ctx.fillRect(pad, head - 14, canvas.width - pad * 2, 3);

  for (const [i, v] of views.entries()) {
    const x = pad + (i % 2) * (T + gap);
    const y = head + Math.floor(i / 2) * (T + caption + gap);
    await drawView(ctx, v, x, y, T, text.units, text.dims);
    ctx.strokeStyle = '#d5d5d0';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, T - 1, T - 1);
    ctx.fillStyle = MUTED;
    ctx.font = `600 20px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(v.name.toUpperCase(), x + T / 2, y + T + 30);
  }
  return canvas.toDataURL('image/png');
}

/** One view on its own, with its dimensions. Returns a PNG data URL. */
export async function composeView(view: OrthoView, units: Units, dims: boolean): Promise<string> {
  const T = 1200;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = T;
  await drawView(canvas.getContext('2d')!, view, 0, 0, T, units, dims);
  return canvas.toDataURL('image/png');
}
