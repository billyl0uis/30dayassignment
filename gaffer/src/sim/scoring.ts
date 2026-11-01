import { ECONOMY, ORDER_TYPES, SCORE, type OrderSpec, type Range } from '../config';
import { clamp, type ColorId, type FinishedPiece } from './piece';

export type OrderType = keyof typeof ORDER_TYPES;
export type Grade = 'A' | 'B' | 'C' | 'Seconds';

export interface Order {
  id: string;
  type: OrderType;
  client: string;
  color: ColorId | null; // asks for this color (bonus if it matches)
}

/** 1 inside the range, falling smoothly to 0 the further outside it you are. */
export function rangeFit(x: number, [lo, hi]: Range): number {
  if (x >= lo && x <= hi) return 1;
  const tol = SCORE.falloff * ((lo + hi) / 2);
  const off = x < lo ? lo - x : x - hi;
  return Math.exp(-((off / tol) ** 2));
}

/** How well a piece's D, H, wall and roundness fall inside an order's ranges. */
export function specScore(fp: FinishedPiece, spec: OrderSpec): number {
  const fits: number[] = [];
  if (spec.D) fits.push(rangeFit(fp.D, spec.D));
  if (spec.H) fits.push(rangeFit(fp.H, spec.H));
  if (spec.wall) fits.push(rangeFit(fp.wall, spec.wall));
  if (spec.HD) fits.push(rangeFit(fp.HD, spec.HD));
  return fits.length ? fits.reduce((a, b) => a + b, 0) / fits.length : 0;
}

export function quality(fp: FinishedPiece, spec: OrderSpec): number {
  return SCORE.wCentered * fp.centered + SCORE.wEven * fp.even + SCORE.wSpec * specScore(fp, spec);
}

export function grade(q: number): Grade {
  if (q >= SCORE.gradeA) return 'A';
  if (q >= SCORE.gradeB) return 'B';
  if (q >= SCORE.gradeC) return 'C';
  return 'Seconds';
}

export function orderPrice(fp: FinishedPiece, order: Order, q: number): number {
  const bonus = order.color && fp.color === order.color ? ECONOMY.colorBonus : 0;
  return Math.round(ORDER_TYPES[order.type].pay * (0.6 + 0.4 * q)) + bonus;
}

/** Seconds price: craftsmanship and a bit of size, between secondsMin and secondsMax. */
export function secondsPrice(fp: FinishedPiece): number {
  const craft = 0.5 * fp.centered + 0.3 * fp.even + 0.2 * clamp(fp.V / 8, 0, 1);
  return Math.round(ECONOMY.secondsMin + (ECONOMY.secondsMax - ECONOMY.secondsMin) * craft);
}

/** What a piece would score against its own kind of order, for readouts and seconds grading. */
export function selfQuality(fp: FinishedPiece): number {
  const spec = fp.type in ORDER_TYPES ? ORDER_TYPES[fp.type as OrderType] : null;
  return spec ? quality(fp, spec) : SCORE.wCentered * fp.centered + SCORE.wEven * fp.even;
}

export interface Sale {
  piece: FinishedPiece;
  order: Order | null; // null = sold as seconds
  q: number;
  grade: Grade;
  price: number;
  rep: number;
}

/**
 * Sell a night's pieces. Best pieces pick first; each goes to the matching open order
 * that pays most if it grades C or better, otherwise it sells as seconds.
 */
export function sellPieces(pieces: FinishedPiece[], orders: Order[]): { sales: Sale[]; filled: Set<string> } {
  const filled = new Set<string>();
  const ranked = [...pieces].sort((a, b) => selfQuality(b) - selfQuality(a));
  const sales = ranked.map((fp): Sale => {
    let best: Sale | null = null;
    for (const o of orders) {
      if (filled.has(o.id) || o.type !== fp.type) continue;
      const q = quality(fp, ORDER_TYPES[o.type]);
      if (q < SCORE.gradeC) continue;
      const price = orderPrice(fp, o, q);
      if (!best || price > best.price) {
        const g = grade(q);
        best = { piece: fp, order: o, q, grade: g, price, rep: g === 'A' ? ECONOMY.repPerGradeA : ECONOMY.repPerSale };
      }
    }
    if (best?.order) {
      filled.add(best.order.id);
      return best;
    }
    return { piece: fp, order: null, q: selfQuality(fp), grade: 'Seconds', price: secondsPrice(fp), rep: 0 };
  });
  return { sales, filled };
}
