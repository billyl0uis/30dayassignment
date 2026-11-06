import { COLORS, ECONOMY, UPGRADES } from '../config';
import type { Mods } from '../sim/actions';
import type { ColorId, FinishedPiece, PieceType } from '../sim/piece';
import { refillCommissions } from './commissions';

export type UpgradeId = keyof typeof UPGRADES;

/** A piece out of the annealer: in storage, or priced on a cabinet shelf. */
export interface StoredPiece {
  id: number;
  name: string;
  fp: FinishedPiece;
  q: number; // quality 0–1
  value: number; // what it's worth
  price: number; // what you're asking
  shelved: boolean;
  shelvedAt: number; // epoch ms
}

/** A customer's order: a kind of piece at or above a quality bar, sometimes in a color. */
export interface Commission {
  id: string;
  customer: string;
  type: PieceType;
  minQ: number;
  pay: number;
  rep: number;
  color: ColorId | null;
}

export interface Annealing {
  fp: FinishedPiece;
  ready: number; // epoch ms when it comes out
}

export interface Studio {
  version: 2;
  cash: number;
  rep: number;
  making: PieceType; // what the bench is set up to make; drives the step goals
  colors: Record<ColorId, number>; // charges left in each jar
  upgrades: Record<UpgradeId, boolean>;
  annealer: Annealing[];
  pieces: StoredPiece[];
  commissions: Commission[];
  sold: Partial<Record<PieceType, number>>; // sold or delivered, by kind
  made: number;
  nextId: number;
  log: string[]; // newest first
}

const KEY = 'gaffer.studio.v2';
const OLD_KEY = 'gaffer.studio.v1';

export function freshStudio(): Studio {
  const colors = Object.fromEntries(Object.keys(COLORS).map((c) => [c, 0])) as Record<ColorId, number>;
  const upgrades = Object.fromEntries(Object.keys(UPGRADES).map((u) => [u, false])) as Record<UpgradeId, boolean>;
  const s: Studio = {
    version: 2,
    cash: ECONOMY.startCash,
    rep: 0,
    making: 'tumbler',
    colors,
    upgrades,
    annealer: [],
    pieces: [],
    commissions: [],
    sold: {},
    made: 0,
    nextId: 1,
    log: [`You opened the studio with $${ECONOMY.startCash} and a furnace of clear glass.`],
  };
  return { ...s, commissions: refillCommissions(s) };
}

export function loadStudio(): Studio {
  const base = freshStudio();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fromOldSave(base);
    const s = JSON.parse(raw) as Partial<Studio>;
    if (s.version !== 2) return base;
    // Merge over defaults so a save missing a field still loads.
    const merged: Studio = {
      ...base,
      ...s,
      colors: { ...base.colors, ...s.colors },
      upgrades: { ...base.upgrades, ...s.upgrades },
      annealer: Array.isArray(s.annealer) ? s.annealer : [],
      pieces: Array.isArray(s.pieces) ? s.pieces : [],
      commissions: Array.isArray(s.commissions) ? s.commissions : [],
      log: Array.isArray(s.log) ? s.log : base.log,
    };
    return { ...merged, commissions: refillCommissions(merged) };
  } catch {
    return base;
  }
}

/** A save from the day-by-day version keeps its cash, reputation, color jars and tools. */
function fromOldSave(base: Studio): Studio {
  try {
    const raw = localStorage.getItem(OLD_KEY);
    if (!raw) return base;
    const o = JSON.parse(raw) as { cash?: number; rep?: number; colors?: Record<string, number>; upgrades?: Record<string, boolean> };
    return {
      ...base,
      cash: typeof o.cash === 'number' ? o.cash : base.cash,
      rep: typeof o.rep === 'number' ? o.rep : 0,
      colors: { ...base.colors, ...o.colors },
      upgrades: { ...base.upgrades, ...o.upgrades },
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
    localStorage.removeItem(OLD_KEY);
  } catch {
    /* nothing to clear */
  }
}

export const modsOf = (s: Studio): Mods => ({
  smoothJacks: s.upgrades.jacks,
  pad: s.upgrades.pad,
  bigDoor: s.upgrades.door,
});
