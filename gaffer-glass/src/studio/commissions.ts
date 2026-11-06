import { COLORS, COMMISSIONS, CUSTOMERS, PRODUCTS } from '../config';
import type { ColorId, PieceType } from '../sim/piece';
import type { Commission, Studio } from './state';

const pick = <T>(xs: readonly T[], rnd: () => number) => xs[Math.floor(rnd() * xs.length)];
const between = ([lo, hi]: readonly [number, number], rnd: () => number) => lo + (hi - lo) * rnd();

/** The kinds of piece you can make right now: the starters, plus whatever your tools have unlocked. */
export function unlockedKinds(s: Pick<Studio, 'upgrades'>): PieceType[] {
  return (Object.keys(PRODUCTS) as PieceType[]).filter((t) => {
    const u = (PRODUCTS[t] as { unlock?: string }).unlock;
    return !u || s.upgrades[u as keyof Studio['upgrades']];
  });
}

export function newCommission(s: Pick<Studio, 'upgrades' | 'commissions'>, rnd = Math.random): Commission {
  const kinds = unlockedKinds(s);
  // Lean away from whatever the board already has the most of.
  const weight = (t: PieceType) => 1 / (1 + s.commissions.filter((c) => c.type === t).length);
  let x = rnd() * kinds.reduce((a, t) => a + weight(t), 0);
  const type = kinds.find((t) => (x -= weight(t)) < 0) ?? kinds[0];
  const customer = pick(CUSTOMERS.filter((n) => !s.commissions.some((c) => c.customer === n)), rnd) ?? pick(CUSTOMERS, rnd);
  const color: ColorId | null = rnd() < COMMISSIONS.colorChance ? pick(Object.keys(COLORS) as ColorId[], rnd) : null;
  const minQ = Math.round(between(COMMISSIONS.minQ, rnd) * 20) / 20; // to the nearest 5%
  const pay = Math.round(PRODUCTS[type].base * between(COMMISSIONS.payK, rnd) * (color ? COMMISSIONS.colorPay : 1));
  return {
    id: `${Date.now().toString(36)}-${Math.floor(rnd() * 1e6).toString(36)}`,
    customer, type, minQ, pay, color,
    rep: Math.round(between(COMMISSIONS.rep, rnd)),
  };
}

/** Keep three commissions open, dropping any for a kind you can no longer make. */
export function refillCommissions(s: Pick<Studio, 'upgrades' | 'commissions'>, rnd = Math.random): Commission[] {
  const kinds = unlockedKinds(s);
  const out = s.commissions.filter((c) => kinds.includes(c.type));
  while (out.length < COMMISSIONS.count) out.push(newCommission({ ...s, commissions: out }, rnd));
  return out;
}
