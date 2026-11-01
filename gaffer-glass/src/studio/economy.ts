import { ANNEAL, CABINET, COLOR, COLORS, CUSTOMERS, PRODUCTS, UPGRADES, VISITORS } from '../config';
import type { ColorId, FinishedPiece, PieceType } from '../sim/piece';
import { quality, worth } from '../sim/scoring';
import { refillCommissions, unlockedKinds } from './commissions';
import type { Commission, StoredPiece, Studio, UpgradeId } from './state';

const LOG_MAX = 30;
const between = (lo: number, hi: number, rnd: () => number) => lo + (hi - lo) * rnd();

export const kindLabel = (t: PieceType) => PRODUCTS[t].label;

function log(s: Studio, line: string): Studio {
  return { ...s, log: [line, ...s.log].slice(0, LOG_MAX) };
}

// ── The annealer ─────────────────────────────────────────────────────

/** A knocked-off piece goes in the annealer and comes out a few seconds later. */
export function anneal(s: Studio, fp: FinishedPiece, now: number): Studio {
  return { ...s, made: s.made + 1, annealer: [...s.annealer, { fp, ready: now + ANNEAL.seconds * 1000 }] };
}

/** Move anything that's done annealing into storage, with its quality and worth. */
export function unloadAnnealer(s: Studio, now: number): { studio: Studio; out: StoredPiece[] } {
  const done = s.annealer.filter((a) => a.ready <= now);
  if (!done.length) return { studio: s, out: [] };
  let next: Studio = { ...s, annealer: s.annealer.filter((a) => a.ready > now) };
  const out: StoredPiece[] = [];
  for (const { fp } of done) {
    const value = worth(fp);
    const name = fp.color
      ? `${COLORS[fp.color].label} ${kindLabel(fp.type).toLowerCase()} #${next.nextId}`
      : `${kindLabel(fp.type)} #${next.nextId}`;
    const piece: StoredPiece = { id: next.nextId, name, fp, q: quality(fp), value, price: value, shelved: false, shelvedAt: 0 };
    out.push(piece);
    next = log({ ...next, nextId: next.nextId + 1, pieces: [...next.pieces, piece] },
      `Out of the annealer: ${name}, ${pct(piece.q)} quality, worth $${value}.`);
  }
  return { studio: next, out };
}

// ── Storage and the cabinet ──────────────────────────────────────────

export const shelvedCount = (s: Studio) => s.pieces.filter((p) => p.shelved).length;

export function setPrice(s: Studio, id: number, price: number): Studio {
  const p = Math.max(1, Math.round(price));
  return { ...s, pieces: s.pieces.map((x) => (x.id === id ? { ...x, price: p } : x)) };
}

export function shelve(s: Studio, id: number, now: number): Studio | null {
  if (shelvedCount(s) >= CABINET.slots) return null;
  return { ...s, pieces: s.pieces.map((x) => (x.id === id ? { ...x, shelved: true, shelvedAt: now } : x)) };
}

export function unshelve(s: Studio, id: number): Studio {
  return { ...s, pieces: s.pieces.map((x) => (x.id === id ? { ...x, shelved: false } : x)) };
}

/** Into the cullet bucket: storage space back, nothing earned. */
export function scrap(s: Studio, id: number): Studio {
  const p = s.pieces.find((x) => x.id === id);
  return p ? log({ ...s, pieces: s.pieces.filter((x) => x.id !== id) }, `${p.name} went in the cullet.`) : s;
}

function sold(s: Studio, p: StoredPiece, cash: number, rep: number): Studio {
  return {
    ...s,
    cash: s.cash + cash,
    rep: s.rep + rep,
    pieces: s.pieces.filter((x) => x.id !== p.id),
    sold: { ...s.sold, [p.fp.type]: (s.sold[p.fp.type] ?? 0) + 1 },
  };
}

// ── Commissions ──────────────────────────────────────────────────────

export function fits(p: StoredPiece, c: Commission): boolean {
  return p.fp.type === c.type && p.q >= c.minQ && (!c.color || p.fp.color === c.color);
}

export function deliver(s: Studio, commissionId: string, pieceId: number): Studio | null {
  const c = s.commissions.find((x) => x.id === commissionId);
  const p = s.pieces.find((x) => x.id === pieceId);
  if (!c || !p || !fits(p, c)) return null;
  const next = sold(s, p, c.pay, c.rep);
  const after = { ...next, commissions: next.commissions.filter((x) => x.id !== c.id) };
  return log({ ...after, commissions: refillCommissions(after) },
    `Delivered ${p.name} to ${c.customer}: +$${c.pay}, +${c.rep} reputation.`);
}

/** Turn a commission down; another customer takes its place. */
export function pass(s: Studio, commissionId: string): Studio {
  const c = s.commissions.find((x) => x.id === commissionId);
  if (!c) return s;
  const after = { ...s, commissions: s.commissions.filter((x) => x.id !== commissionId) };
  return log({ ...after, commissions: refillCommissions(after) }, `Passed on ${c.customer}'s ${kindLabel(c.type).toLowerCase()}.`);
}

// ── Visitors ─────────────────────────────────────────────────────────

/** Seconds until the next visitor; regulars come more often as your reputation grows. */
export function nextVisitGap(rep: number, rnd = Math.random): number {
  return between(VISITORS.gapMin, VISITORS.gapMax, rnd) * (1 - Math.min(VISITORS.maxSpeedup, rep / VISITORS.repSpeedup));
}

/**
 * Someone walks in and browses the cabinet. They came hoping for one kind of piece and have a budget;
 * the closer your price is to what a piece is worth to them, the likelier they buy it.
 */
export function visit(s: Studio, now: number, rnd = Math.random): { studio: Studio; text: string | null } {
  const onShelf = s.pieces.filter((p) => p.shelved && now - p.shelvedAt >= CABINET.freshSeconds * 1000);
  if (!onShelf.length) return { studio: s, text: null };
  const who = CUSTOMERS[Math.floor(rnd() * CUSTOMERS.length)];
  const kinds = unlockedKinds(s);
  const wanted = kinds[Math.floor(rnd() * kinds.length)];
  const budget = between(VISITORS.budgetMin, VISITORS.budgetMax, rnd) * Math.min(VISITORS.maxBudget, 1 + s.rep / VISITORS.budgetRep);
  const regard = Math.min(VISITORS.maxRegard, 1 + s.rep * VISITORS.repValue);

  let best: { p: StoredPiece; prob: number } | null = null;
  for (const p of onShelf) {
    const ratio = p.price / (p.value * regard);
    let prob = ratio <= 0.8 ? 0.8 : ratio <= 1 ? 0.55 : ratio <= 1.25 ? 0.3 : ratio <= 1.6 ? 0.1 : 0.02;
    prob *= p.fp.type === wanted ? VISITORS.wantedBoost : VISITORS.otherKind;
    if (p.fp.color) prob *= VISITORS.coloredBoost;
    if (p.price > budget && ratio > 1) prob = 0;
    if (!best || prob > best.prob) best = { p, prob };
  }

  if (best && rnd() < best.prob) {
    const p = best.p;
    const rep = VISITORS.repPerSale + p.q / VISITORS.repQualityDiv;
    return { studio: log(sold(s, p, p.price, rep), `${who} bought ${p.name} for $${p.price}.`), text: `${who} bought ${p.name} for $${p.price}.` };
  }

  const look = onShelf.find((p) => p.fp.type === wanted) ?? onShelf[0];
  const ratio = look.price / (look.value * regard);
  const text = look.price > budget && ratio > 1
    ? `${who} liked ${look.name}, but $${look.price} was over their budget.`
    : ratio > 1.25
      ? `${who} thought ${look.name} was overpriced.`
      : `${who} browsed, hoping for ${article(kindLabel(wanted))}.`;
  return { studio: log(s, text), text };
}

// ── Supplies ─────────────────────────────────────────────────────────

export function buyColor(s: Studio, c: ColorId): Studio | null {
  const price = COLORS[c].price;
  if (s.cash < price) return null;
  return { ...s, cash: s.cash - price, colors: { ...s.colors, [c]: s.colors[c] + COLOR.usesPerJar } };
}

/** Why a tool can't be bought yet, or null when it can. */
export function upgradeBlock(s: Studio, u: UpgradeId): string | null {
  const up = UPGRADES[u] as { price: number; requires?: { type: string; count: number } };
  if (s.upgrades[u]) return 'Owned';
  const req = up.requires;
  if (req) {
    const have = s.sold[req.type as PieceType] ?? 0;
    if (have < req.count) return `Sell or deliver ${req.count} ${kindLabel(req.type as PieceType).toLowerCase()}${req.count === 1 ? '' : 's'} first (${have}/${req.count})`;
  }
  if (s.cash < up.price) return `You need $${up.price}`;
  return null;
}

export function buyUpgrade(s: Studio, u: UpgradeId): Studio | null {
  if (upgradeBlock(s, u)) return null;
  const next = { ...s, cash: s.cash - UPGRADES[u].price, upgrades: { ...s.upgrades, [u]: true } };
  return log({ ...next, commissions: refillCommissions(next) }, `Bought ${UPGRADES[u].label.toLowerCase()}.`);
}

export const pct = (q: number) => `${Math.round(q * 100)}%`;
const article = (w: string) => `${/^[aeiou]/i.test(w) ? 'an' : 'a'} ${w.toLowerCase()}`;
