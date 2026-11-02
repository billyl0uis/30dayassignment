import { COLORS, GEOM, ROOM_F, TYPE_THRESHOLDS } from '../config';

export type ColorId = keyof typeof COLORS;
export type PieceType = 'paperweight' | 'ornament' | 'closed vessel' | 'tumbler' | 'bowl';
/** How a failed piece ended up: on the floor, cracked on the pipe, or never there. */
export type FailKind = 'floor' | 'crack';

export interface Piece {
  V: number; // glass volume (in³)
  L: number; // length along the pipe (in)
  r: number; // inner bubble radius (in)
  T: number; // temperature (°F)
  s: number; // how far off center it has drooped (the length of cx, cy)
  cx: number; // the droop as a direction in the pipe's own frame: it turns with the pipe,
  cy: number; // so stopping with the droop on top lets gravity pull it back
  n: number; // jack line depth, 0–1+
  o: number; // opening after transfer, 0–1.25
  punty: boolean;
  blown: boolean;
  uneven: number; // accumulated wall unevenness
  color: ColorId | null;
  gathers: number; // how many gathers have started
  failed: null | { kind: FailKind; reason: string };
}

export function newPiece(): Piece {
  return {
    V: 0, L: 0, r: 0, T: ROOM_F, s: 0, cx: 0, cy: 0, n: 0, o: 0,
    punty: false, blown: false, uneven: 0, color: null, gathers: 0, failed: null,
  };
}

export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
export const smoothstep = (x: number) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

export interface Geometry {
  R: number; // outer radius of the cylinder body
  wall: number;
  lipR: number; // radius at the open end (punty only)
  D: number; // overall diameter
  H: number; // overall height (length of the piece)
  HD: number; // roundness, H ÷ D
}

export function geometry(p: Piece): Geometry {
  if (p.V <= 0 || p.L <= 0) return { R: 0, wall: 0, lipR: 0, D: 0, H: 0, HD: 0 };
  const R = Math.sqrt(p.V / (Math.PI * p.L) + p.r * p.r);
  const wall = p.blown ? R - p.r : R;
  const past = Math.max(0, p.o - GEOM.openKnee);
  const lipR = p.punty
    ? R * (0.3 + 0.7 * smoothstep(p.o / GEOM.openKnee)) + GEOM.flare * R * past
    : 0;
  const D = Math.max(2 * R, 2 * lipR);
  const H = p.L * (1 - GEOM.heightLoss * past);
  return { R, wall, lipR, D, H, HD: H / D };
}

export function pieceType(p: Piece): PieceType {
  if (!p.blown) return 'paperweight';
  if (!p.punty) return 'ornament';
  if (p.o < TYPE_THRESHOLDS.tumblerFrom) return 'closed vessel';
  if (p.o < TYPE_THRESHOLDS.bowlFrom) return 'tumbler';
  return 'bowl';
}

/** The part of a piece that goes into the annealer and gets sold. */
export interface FinishedPiece {
  type: PieceType;
  V: number;
  D: number;
  H: number;
  wall: number;
  HD: number;
  centered: number; // 0–1
  even: number; // 0–1
  color: ColorId | null;
  shape?: Piece; // the piece as it left the pipe, for showing it in 3D afterward
}

/** Set how far off center the piece is, keeping the direction it has drooped. */
export function setSag(p: Piece, s: number) {
  const m = Math.hypot(p.cx, p.cy);
  if (m < 1e-9) {
    p.cx = -s; // no direction yet: call it down in the pipe's frame
    p.cy = 0;
  } else {
    p.cx *= s / m;
    p.cy *= s / m;
  }
  p.s = Math.max(0, s);
}
