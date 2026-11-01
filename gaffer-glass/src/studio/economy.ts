import { COLOR, COLORS, ECONOMY, UPGRADES } from '../config';
import type { ColorId, FinishedPiece } from '../sim/piece';
import { sellPieces, type Sale } from '../sim/scoring';
import { refillOrders } from './orders';
import type { Studio, UpgradeId } from './state';

export const sessionCost = (assistant: boolean) => ECONOMY.rent + (assistant ? ECONOMY.assistantFee : 0);

export function bookSession(s: Studio, assistant: boolean): Studio | null {
  const cost = sessionCost(assistant);
  return s.cash >= cost ? { ...s, cash: s.cash - cost } : null;
}

/** Teaching a class pays a little and uses up the day, so you can never get stuck broke. */
export function teachClass(s: Studio): Studio {
  return { ...s, cash: s.cash + ECONOMY.classPay, day: s.day + 1 };
}

export function buyColor(s: Studio, c: ColorId): Studio | null {
  const price = COLORS[c].price;
  if (s.cash < price) return null;
  return { ...s, cash: s.cash - price, colors: { ...s.colors, [c]: s.colors[c] + COLOR.usesPerJar } };
}

export function buyUpgrade(s: Studio, u: UpgradeId): Studio | null {
  const price = UPGRADES[u].price;
  if (s.upgrades[u] || s.cash < price) return null;
  return { ...s, cash: s.cash - price, upgrades: { ...s.upgrades, [u]: true } };
}

export interface NightReport {
  day: number; // the morning the pieces came out
  sales: Sale[];
  cullet: number; // pieces lost or dumped during the session
  earned: number;
  repGained: number;
}

/** Overnight: the annealer comes down, pieces sell, the board refills, and it's a new day. */
export function overnight(s: Studio, pieces: FinishedPiece[], cullet: number): { studio: Studio; report: NightReport } {
  const { sales, filled } = sellPieces(pieces, s.orders);
  const earned = sales.reduce((a, x) => a + x.price, 0);
  const repGained = sales.reduce((a, x) => a + x.rep, 0);
  const rep = s.rep + repGained;
  const studio: Studio = {
    ...s,
    day: s.day + 1,
    cash: s.cash + earned,
    rep,
    orders: refillOrders(s.orders.filter((o) => !filled.has(o.id)), rep),
  };
  return { studio, report: { day: studio.day, sales, cullet, earned, repGained } };
}
