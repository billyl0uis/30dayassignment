import { COLORS, ECONOMY } from '../config';
import type { Mods } from '../sim/actions';
import type { ColorId } from '../sim/piece';
import type { Order } from '../sim/scoring';
import { refillOrders } from './orders';

export type UpgradeId = 'jacks' | 'pad' | 'door';

export interface Studio {
  version: 1;
  day: number;
  cash: number;
  rep: number;
  colors: Record<ColorId, number>; // charges left in each jar
  upgrades: Record<UpgradeId, boolean>;
  orders: Order[];
}

const KEY = 'gaffer.studio.v1';

export function freshStudio(): Studio {
  const colors = Object.fromEntries(Object.keys(COLORS).map((c) => [c, 0])) as Record<ColorId, number>;
  return {
    version: 1,
    day: 1,
    cash: ECONOMY.startCash,
    rep: 0,
    colors,
    upgrades: { jacks: false, pad: false, door: false },
    orders: refillOrders([], 0),
  };
}

export function loadStudio(): Studio {
  const base = freshStudio();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const s = JSON.parse(raw) as Partial<Studio>;
    if (s.version !== 1) return base;
    // Merge over defaults so an older save missing a field still loads.
    return {
      ...base,
      ...s,
      colors: { ...base.colors, ...s.colors },
      upgrades: { ...base.upgrades, ...s.upgrades },
      orders: refillOrders(Array.isArray(s.orders) ? s.orders : [], s.rep ?? 0),
    };
  } catch {
    return base;
  }
}

export function saveStudio(s: Studio): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Private mode or storage full: the game still plays, it just won't remember.
  }
}

export function clearStudio(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}

export const modsOf = (s: Studio): Mods => ({
  smoothJacks: s.upgrades.jacks,
  pad: s.upgrades.pad,
  bigDoor: s.upgrades.door,
});
