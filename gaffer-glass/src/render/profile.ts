import { GEOM } from '../config';
import { geometry, smoothstep, type Piece } from '../sim/piece';

/**
 * A piece as a side-view silhouette: radii sampled along its axis.
 * x runs from the pipe/punty end (0) to the free end (length), in inches.
 */
export interface Profile {
  xs: number[];
  outer: number[]; // outer radius at each x
  inner: number[]; // bubble radius at each x (0 = solid there)
  drop: number[]; // sag: how far the axis has dropped at each x (down is +)
  length: number;
  maxR: number;
  neckX: number; // where the jack line pinches (on the pipe)
  open: boolean; // the free end is open (after transfer)
}

const SAMPLES = 64;

export function profile(p: Piece): Profile {
  const g = geometry(p);
  const len = p.punty ? g.H : p.L;
  const xs: number[] = [];
  const outer: number[] = [];
  const inner: number[] = [];
  const drop: number[] = [];
  const neckX = Math.min(Math.max(0.18 * len + 0.25, 0.35), 0.45 * len);
  const neckW = Math.max(0.18, 0.22 * g.R);
  const bottom = p.punty ? Math.max(g.wall * 1.3, 0.12) : g.wall;

  for (let i = 0; i < SAMPLES; i++) {
    const x = (i / (SAMPLES - 1)) * len;
    const u = len > 0 ? x / len : 0;
    let body: number;

    if (!p.punty) {
      // An ellipsoid when short, a rounded cylinder once L is well past 2R.
      const ellipse = g.R * Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2));
      const cap = 0.9 * Math.min(g.R, len / 2);
      const d = Math.min(x, len - x);
      const cyl = d >= cap ? g.R : g.R * Math.sqrt(Math.max(0, 1 - (1 - d / cap) ** 2));
      const b = smoothstep((len / (2 * g.R) - 1) / 1.2);
      body = ellipse + (cyl - ellipse) * b;
      // The glass wraps the pipe tip as a collar.
      const collar = (GEOM.pipeR + 0.1) * (1 - smoothstep((x - 0.25) / 0.35));
      body = Math.max(body, collar);
    } else {
      // Rounded bottom at the punty, then the wall runs out to the lip.
      const cap = Math.min(0.8 * g.R, len / 2);
      body = x < cap ? g.R * Math.sqrt(Math.max(0, 1 - (1 - x / cap) ** 2)) : g.R;
      body = Math.max(body, (GEOM.puntyR + 0.08) * (1 - smoothstep((x - 0.15) / 0.3)));
      body += (g.lipR - g.R) * smoothstep((u - 0.35) / 0.65);
    }

    let out = body;
    if (!p.punty && p.n > 0) out *= 1 - Math.min(p.n, 1.2) * 0.7 * Math.exp(-(((x - neckX) / neckW) ** 2));

    let inn = 0;
    if (p.blown && x > bottom && (p.punty || x < len - g.wall)) {
      inn = Math.max(0, Math.min(body - g.wall, out - g.wall * 0.6));
    }

    xs.push(x);
    outer.push(out);
    inner.push(inn);
    drop.push(p.s * 0.45 * len * u * u); // how far the axis has bent off center here
  }
  return { xs, outer, inner, drop, length: len, maxR: Math.max(...outer, 0), neckX, open: p.punty };
}
