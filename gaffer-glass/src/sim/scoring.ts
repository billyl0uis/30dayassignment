import { ECONOMY, PRODUCTS, SCORE, type OrderSpec, type Range } from '../config';
import { clamp, type FinishedPiece } from './piece';

/** 1 inside the range, falling smoothly to 0 the further outside it you are. */
export function rangeFit(x: number, [lo, hi]: Range): number {
  if (x >= lo && x <= hi) return 1;
  const tol = SCORE.falloff * ((lo + hi) / 2);
  const off = x < lo ? lo - x : x - hi;
  return Math.exp(-((off / tol) ** 2));
}

/** How well a piece's D, H, wall and roundness fall inside a spec's ranges. */
export function specScore(fp: FinishedPiece, spec: OrderSpec): number {
  const fits: number[] = [];
  if (spec.D) fits.push(rangeFit(fp.D, spec.D));
  if (spec.H) fits.push(rangeFit(fp.H, spec.H));
  if (spec.wall) fits.push(rangeFit(fp.wall, spec.wall));
  if (spec.HD) fits.push(rangeFit(fp.HD, spec.HD));
  return fits.length ? fits.reduce((a, b) => a + b, 0) / fits.length : 0;
}

/** Quality, 0–1: centered, even, and how well it fits what its kind of piece should be. */
export function quality(fp: FinishedPiece): number {
  return clamp(SCORE.wCentered * fp.centered + SCORE.wEven * fp.even + SCORE.wSpec * specScore(fp, PRODUCTS[fp.type]), 0, 1);
}

/** What a piece is worth: its kind's base, scaled by quality, a little more with color. */
export function worth(fp: FinishedPiece): number {
  const q = quality(fp);
  const color = fp.color ? ECONOMY.colorValue : 1;
  return Math.max(1, Math.round(PRODUCTS[fp.type].base * (ECONOMY.floorValue + (1 - ECONOMY.floorValue) * q) * color));
}
