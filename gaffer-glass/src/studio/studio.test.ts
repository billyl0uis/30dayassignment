import { describe, expect, it } from 'vitest';
import { ANNEAL, CABINET, ECONOMY } from '../config';
import { NO_MODS } from '../sim/actions';
import { step } from '../sim/physics';
import { geometry, newPiece, type FinishedPiece, type Piece } from '../sim/piece';
import { unlockedKinds } from './commissions';
import { anneal, buyUpgrade, deliver, fits, setPrice, shelve, unloadAnnealer, upgradeBlock, visit } from './economy';
import { goalState } from './goals';
import { freshStudio, type Studio } from './state';

const tumbler: FinishedPiece = { type: 'tumbler', V: 3.4, D: 3.4, H: 4.2, wall: 0.18, HD: 1.24, centered: 1, even: 1, color: null };
const T0 = 1_000_000;

/** A fresh studio with one finished tumbler out of the annealer. */
function withTumbler(): Studio {
  const s = anneal(freshStudio(), tumbler, T0);
  return unloadAnnealer(s, T0 + ANNEAL.seconds * 1000).studio;
}

describe('the studio', () => {
  it('opens with $20 and the starter pieces, bowls and vases locked', () => {
    const s = freshStudio();
    expect(s.cash).toBe(ECONOMY.startCash);
    expect(unlockedKinds(s)).toEqual(['paperweight', 'ornament', 'tumbler']);
    expect(s.commissions).toHaveLength(3);
  });

  it('a knocked-off piece anneals, then lands in storage with its quality and worth', () => {
    const s = anneal(freshStudio(), tumbler, T0);
    expect(unloadAnnealer(s, T0 + 1000).out).toHaveLength(0);
    const { studio, out } = unloadAnnealer(s, T0 + ANNEAL.seconds * 1000);
    expect(out).toHaveLength(1);
    expect(studio.annealer).toHaveLength(0);
    expect(studio.pieces[0].q).toBeGreaterThan(0.9);
    expect(studio.pieces[0].price).toBe(studio.pieces[0].value);
  });

  it('delivers a fitting piece to a commission for its pay and reputation', () => {
    let s = withTumbler();
    s = { ...s, commissions: [{ id: 'c1', customer: 'Nora', type: 'tumbler', minQ: 0.7, pay: 45, rep: 4, color: null }] };
    const p = s.pieces[0];
    expect(fits(p, s.commissions[0])).toBe(true);
    const after = deliver(s, 'c1', p.id)!;
    expect(after.cash).toBe(s.cash + 45);
    expect(after.rep).toBe(4);
    expect(after.pieces).toHaveLength(0);
    expect(after.sold.tumbler).toBe(1);
    expect(after.commissions).toHaveLength(3); // refilled
  });

  it('refuses a piece under the quality bar or in the wrong color', () => {
    const s = withTumbler();
    const p = s.pieces[0];
    expect(fits(p, { id: 'x', customer: 'A', type: 'tumbler', minQ: p.q + 0.01, pay: 1, rep: 1, color: null })).toBe(false);
    expect(fits(p, { id: 'y', customer: 'B', type: 'tumbler', minQ: 0.5, pay: 1, rep: 1, color: 'cobalt' })).toBe(false);
  });

  it('a visitor buys a fairly priced shelved piece, and passes on an overpriced one', () => {
    let s = withTumbler();
    const id = s.pieces[0].id;
    s = shelve(s, id, T0)!;
    const later = T0 + (CABINET.freshSeconds + 1) * 1000;
    const always = () => 0; // every roll comes up as likely as it can
    const bought = visit(s, later, always);
    expect(bought.studio.pieces).toHaveLength(0);
    expect(bought.studio.cash).toBe(s.cash + s.pieces[0].price);

    const pricey = setPrice(s, id, s.pieces[0].value * 5);
    const passed = visit(pricey, later, () => 0.99);
    expect(passed.studio.pieces).toHaveLength(1);
    expect(passed.text).toMatch(/overpriced|budget|browsed/);
  });

  it('nobody browses a piece the moment it is shelved', () => {
    const s = shelve(withTumbler(), 1, T0)!;
    expect(visit(s, T0 + 1000, () => 0).text).toBeNull();
  });

  it('smoother jacks need two tumblers sold first, then unlock bowls', () => {
    const s = { ...freshStudio(), cash: 500 };
    expect(upgradeBlock(s, 'jacks')).toMatch(/2 tumblers first \(0\/2\)/);
    const ready = { ...s, sold: { tumbler: 2 } };
    const after = buyUpgrade(ready, 'jacks')!;
    expect(after.upgrades.jacks).toBe(true);
    expect(unlockedKinds(after)).toContain('bowl');
  });
});

describe('step goals', () => {
  it('walk a tumbler forward as the piece changes', () => {
    expect(goalState('tumbler', null).next).toMatch(/gather/i);
    let p: Piece = { ...newPiece(), V: 3.5, L: 1.4, T: 2000 };
    expect(goalState('tumbler', p).next).toMatch(/Blow/);
    p = { ...p, blown: true, r: 0.6, L: 4.5 };
    expect(geometry(p).wall).toBeLessThan(0.25);
    expect(goalState('tumbler', p).next).toMatch(/Jack/);
    p = { ...p, n: 0.6, punty: true, o: 0.3 };
    expect(goalState('tumbler', p).next).toMatch(/Knock off/);
  });
});

describe('blow pressure', () => {
  const blowFor = (pressure: number, seconds: number) => {
    let p: Piece = { ...newPiece(), V: 3, L: 1.4, T: 1950 };
    for (let t = 0; t < seconds; t += 1 / 60) p = step(p, 'blow', 1 / 60, { mods: NO_MODS, rotating: true, justStarted: t === 0, pressure }).piece;
    return p;
  };
  it('harder breath blows the bubble faster', () => {
    expect(blowFor(0.9, 1).r).toBeGreaterThan(blowFor(0.3, 1).r * 2);
  });
});
