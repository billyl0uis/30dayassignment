import { CLIENTS, COLORS, ECONOMY } from '../config';
import type { ColorId } from '../sim/piece';
import type { Order, OrderType } from '../sim/scoring';

const BOARD_SIZE = 3;
const pick = <T>(xs: readonly T[], rnd: () => number) => xs[Math.floor(rnd() * xs.length)];

export function newOrder(rep: number, taken: Order[], rnd = Math.random): Order {
  const types: OrderType[] = rep >= ECONOMY.repBowlUnlock ? ['paperweight', 'tumbler', 'bowl'] : ['paperweight', 'tumbler'];
  // Lean away from whatever the board already has the most of.
  const weight = (t: OrderType) => 1 / (1 + taken.filter((o) => o.type === t).length);
  let x = rnd() * types.reduce((a, t) => a + weight(t), 0);
  const type = types.find((t) => (x -= weight(t)) < 0) ?? types[0];
  const client = pick(CLIENTS.filter((c) => !taken.some((o) => o.client === c)), rnd) ?? pick(CLIENTS, rnd);
  const color = rnd() < ECONOMY.colorRequestChance ? pick(Object.keys(COLORS) as ColorId[], rnd) : null;
  return { id: `${Date.now().toString(36)}-${Math.floor(rnd() * 1e6).toString(36)}`, type, client, color };
}

/** Top the board back up to three orders. */
export function refillOrders(orders: Order[], rep: number, rnd = Math.random): Order[] {
  const out = [...orders];
  while (out.length < BOARD_SIZE) out.push(newOrder(rep, out, rnd));
  return out;
}
