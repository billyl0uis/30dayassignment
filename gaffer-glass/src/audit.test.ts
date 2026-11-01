import { describe, expect, it } from 'vitest';
import { ANNEAL, CABINET, COMMISSIONS, ECONOMY, GATHER, PRODUCTS } from './config';
import { applyTap, canHold, canTap, NO_MODS, type HoldAction, type Mods } from './sim/actions';
import { Session } from './session/session';
import { step } from './sim/physics';
import { geometry, newPiece, type FinishedPiece, type Piece, type PieceType } from './sim/piece';
import { glowAmount } from './render/heat';
import { quality, specScore, worth } from './sim/scoring';
import { anneal, deliver, fits, nextVisitGap, pass, shelve, unloadAnnealer, visit } from './studio/economy';
import { goalState } from './studio/goals';
import { freshStudio, type Studio } from './studio/state';

// ── A scripted gaffer that also keeps time, so the economy can be costed in real seconds ──

const DT = 1 / 60;
const NO_COLOR = { selectedColor: null, colorCharges: 0 };

class Gaffer {
  p: Piece = newPiece();
  seconds = 0;
  finished: FinishedPiece | null = null;
  goals: (string | null)[] = [];
  constructor(public kind: PieceType, public mods: Mods = NO_MODS) {}

  hold(a: HoldAction | null, until: number | ((p: Piece) => boolean), max = 30) {
    const done = typeof until === 'number' ? () => false : until;
    const limit = typeof until === 'number' ? until : max;
    for (let t = 0; t < limit && !this.p.failed && !done(this.p); t += DT) {
      this.p = step(this.p, a, DT, { mods: this.mods, rotating: true, justStarted: t === 0 }).piece;
      this.seconds += DT;
    }
    this.note();
    return this;
  }
  reheat(to = 1850) {
    return this.hold('glory', (p) => p.T >= to);
  }
  tap(a: 'transfer' | 'knockOff') {
    const ok = canTap(this.p, a, NO_COLOR);
    if (!ok.ok) throw new Error(`${a} refused: ${ok.reason}`);
    const r = applyTap(this.p, a, NO_COLOR);
    if (r.piece) this.p = r.piece;
    if (r.finished) this.finished = r.finished;
    this.seconds += 1; // a tap still takes a moment at the bench
    if (!r.finished) this.note();
    return this;
  }
  private note() {
    const next = goalState(this.kind, this.p).next;
    if (this.goals[this.goals.length - 1] !== next) this.goals.push(next);
  }
  get fail() {
    return this.p.failed?.reason ?? null;
  }
}

/** One recipe per kind of piece, written the way the goals panel tells a player to work. */
const RECIPE: Record<PieceType, (g: Gaffer) => Gaffer> = {
  paperweight: (g) => {
    for (let i = 0; i < 3; i++) g.hold('gather', 3.2).hold('marver', (p) => p.T < 1880, 5);
    return g.hold('block', 3).reheat().hold('jacks', (p) => p.n >= 0.6, 6).tap('knockOff');
  },
  ornament: (g) =>
    g.hold('gather', 1.3).hold('marver', (p) => p.T < 1880, 4)
      .hold('blow', (p) => geometry(p).wall <= 0.16, 10)
      .reheat().hold('jacks', (p) => p.n >= 0.6, 6).reheat(1300).tap('knockOff'),
  tumbler: (g) => {
    g.hold('gather', 2.7).hold('marver', (p) => p.T < 1880, 4);
    g.hold('blow', (p) => geometry(p).wall <= 0.24, 8);
    if (g.p.T < 1400) g.reheat();
    g.hold('blow', (p) => geometry(p).wall <= 0.2, 8).reheat();
    g.hold('marver', (p) => p.L >= 4.2, 4).hold('jacks', (p) => p.n >= 0.6, 6);
    g.reheat().tap('transfer').reheat().hold(null, (p) => p.T < 1950, 5);
    return g.hold('jacks', (p) => p.o >= 0.35, 6).tap('knockOff');
  },
  bowl: (g) => {
    g.hold('gather', 3).hold('marver', (p) => p.T < 1880, 4);
    g.hold('blow', (p) => geometry(p).wall <= 0.22, 10);
    // Bowls need the smoother jacks, which move at 60% speed: allow for it, reheating as a player would.
    g.reheat().hold('block', 1.5);
    for (let i = 0; i < 3 && g.p.n < 0.6; i++) g.reheat().hold('jacks', (p) => p.n >= 0.6, 6);
    g.reheat().tap('transfer').reheat();
    for (let i = 0; i < 4 && g.p.o < 0.85; i++) g.reheat().hold(null, (p) => p.T < 1950, 5).hold('jacks', (p) => p.o >= 0.85, 6);
    return g.tap('knockOff');
  },
  'closed vessel': (g) => {
    g.hold('gather', 2.5).hold('marver', (p) => p.T < 1880, 4);
    g.hold('blow', (p) => geometry(p).wall <= 0.24, 10);
    for (let i = 0; i < 4 && g.p.L < 5.5; i++) g.reheat().hold('marver', (p) => p.L >= 5.5, 3);
    g.reheat().hold('jacks', (p) => p.n >= 0.6, 6).reheat().tap('transfer').reheat();
    g.hold(null, (p) => p.T < 1950, 5).hold('jacks', (p) => p.o >= 0.1, 6);
    return g.tap('knockOff');
  },
};

const make = (kind: PieceType, mods: Mods = NO_MODS) => RECIPE[kind](new Gaffer(kind, mods));

describe('every kind of piece can be made inside its spec by following its goals', () => {
  for (const kind of Object.keys(PRODUCTS) as PieceType[]) {
    it(PRODUCTS[kind].label, () => {
      const g = make(kind, kind === 'bowl' ? { ...NO_MODS, smoothJacks: true } : NO_MODS);
      expect(g.fail).toBeNull();
      const fp = g.finished!;
      expect(fp.type).toBe(kind);
      expect(specScore(fp, PRODUCTS[kind])).toBeGreaterThan(0.9);
      expect(quality(fp)).toBeGreaterThan(0.85);
      // The goals panel reached its last step before the knock-off.
      expect(g.goals.at(-1)).toMatch(/Knock off/);
      // A real-feeling bench time: under three minutes of play.
      expect(g.seconds).toBeLessThan(180);
    });
  }
});

describe('the science holds together', () => {
  it('a gather left still on the pipe droops and falls; rotating keeps it', () => {
    const run = (rotating: boolean) => {
      let p: Piece = newPiece();
      for (let t = 0; t < 2.5; t += DT) p = step(p, 'gather', DT, { mods: NO_MODS, rotating, justStarted: t === 0 }).piece;
      for (let t = 0; t < 20 && !p.failed; t += DT) p = step(p, null, DT, { mods: NO_MODS, rotating, justStarted: false }).piece;
      return p;
    };
    expect(run(false).failed?.kind).toBe('floor');
    expect(run(true).failed).toBeNull();
  });

  it('a bigger piece holds its heat longer than a small one', () => {
    const coolTo = (V: number) => {
      let p: Piece = { ...newPiece(), V, L: 1.4, T: 2000 };
      let t = 0;
      while (p.T > 1300 && t < 300) {
        p = step(p, null, DT, { mods: NO_MODS, rotating: true, justStarted: false }).piece;
        t += DT;
      }
      return t;
    };
    expect(coolTo(12)).toBeGreaterThan(coolTo(2) * 1.3);
  });

  it('a heavier piece reheats more slowly in the glory hole', () => {
    const heatTo = (V: number) => {
      let p: Piece = { ...newPiece(), V, L: 1.4, T: 1400 };
      let t = 0;
      while (p.T < 1900 && t < 60) {
        p = step(p, 'glory', DT, { mods: NO_MODS, rotating: true, justStarted: t === 0 }).piece;
        t += DT;
      }
      return t;
    };
    expect(heatTo(15)).toBeGreaterThan(heatTo(3));
  });

  it('tipping the pipe lets gravity stretch soft glass down, or slump it short when tipped up', () => {
    const tip = (tilt: number, T = 2000) => {
      let p: Piece = { ...newPiece(), V: 4, L: 3, T };
      for (let t = 0; t < 2; t += DT) p = step(p, null, DT, { mods: NO_MODS, rotating: true, justStarted: false, tilt }).piece;
      return p.L;
    };
    expect(tip(1)).toBeGreaterThan(tip(0) + 0.5);
    expect(tip(-1)).toBeLessThan(tip(0) - 0.3);
    expect(tip(1, 1100)).toBeCloseTo(tip(0, 1100), 5); // stiff glass doesn't care which way the pipe points
  });

  it('a pipe only carries so much glass: gathering stops at the limit', () => {
    let p: Piece = newPiece();
    for (let t = 0; t < 30; t += DT) p = step(p, 'gather', DT, { mods: NO_MODS, rotating: true, justStarted: t === 0 }).piece;
    expect(p.V).toBe(GATHER.maxV);
    expect(canHold(p, 'gather').ok).toBe(false);
  });

  it('paused, the bench holds perfectly still', () => {
    const sess = new Session(NO_MODS, freshStudio().colors, { onFinished() {}, onColorUsed() {} });
    sess.press('gather');
    sess.update(1);
    const before = { ...sess.piece! };
    sess.paused = true;
    sess.update(5);
    expect(sess.piece).toEqual(before);
  });

  it('cold glass does not move under the tools', () => {
    const p0: Piece = { ...newPiece(), V: 3, L: 1.4, T: 1100, blown: true, r: 0.3 };
    let p = p0;
    for (let t = 0; t < 1; t += DT) p = step(p, 'blow', DT, { mods: NO_MODS, rotating: true, justStarted: t === 0 }).piece;
    expect(p.r).toBe(p0.r);
  });

  it('glass volume is conserved by shaping: marvering and blocking only move it', () => {
    let p: Piece = { ...newPiece(), V: 4, L: 1.4, T: 2000 };
    for (let t = 0; t < 1.5; t += DT) p = step(p, 'marver', DT, { mods: NO_MODS, rotating: true, justStarted: t === 0 }).piece;
    expect(p.V).toBe(4);
    expect(p.L).toBeGreaterThan(1.4);
  });

  it('glass glows from about 900°F, and the glow fully hides its color at working heat', () => {
    expect(glowAmount(850)).toBe(0);
    expect(glowAmount(1000)).toBeGreaterThan(0);
    expect(glowAmount(1900)).toBeGreaterThan(0.95);
  });

  it('a piece knocked off below the annealing range cracks; one knocked off hot goes in', () => {
    const g = make('ornament');
    expect(g.fail).toBeNull();
    const cold = new Gaffer('ornament');
    cold.hold('gather', 1.3).hold('marver', (p) => p.T < 1880, 4).hold('blow', (p) => geometry(p).wall <= 0.16, 10)
      .reheat().hold('jacks', (p) => p.n >= 0.6, 6).hold(null, (p) => p.T < 880, 120);
    const r = applyTap(cold.p, 'knockOff', NO_COLOR);
    expect(r.piece?.failed?.reason).toMatch(/Cracked going into the annealer/);
  });

  it('reputation helps, but a famous studio still cannot sell at five times worth', () => {
    let s: Studio = anneal({ ...freshStudio(), rep: 5000 }, make('tumbler').finished!, 0);
    s = unloadAnnealer(s, ANNEAL.seconds * 1000).studio;
    const id = s.pieces[0].id;
    s = shelve({ ...s, pieces: s.pieces.map((p) => ({ ...p, price: p.value * 5 })) }, id, 0)!;
    const r = visit(s, (CABINET.freshSeconds + 1) * 1000, () => 0.2);
    expect(r.studio.pieces).toHaveLength(1);
  });
});

describe('the economy, played by a bot', () => {
  /**
   * A steady player: makes the most valuable piece they can, prices it at worth, shelves it,
   * delivers to any commission it fits. Visitors come on their real-time schedule.
   */
  function play(minutes: number, rnd: () => number) {
    let s: Studio = freshStudio();
    let clock = 0; // seconds of play
    let nextVisit = nextVisitGap(0, rnd);
    let firstJacks: number | null = null;
    let goalAt: number | null = null;
    let made = 0;
    let sales = 0;
    let delivered = 0;
    const end = minutes * 60;

    const advanceTo = (t: number) => {
      while (nextVisit <= t) {
        const now = nextVisit * 1000;
        s = unloadAnnealer(s, now).studio;
        const r = visit(s, now, rnd);
        if (r.studio.cash > s.cash) sales++;
        s = r.studio;
        nextVisit += nextVisitGap(s.rep, rnd);
      }
      clock = t;
      s = unloadAnnealer(s, clock * 1000).studio;
    };

    while (clock < end) {
      const kind: PieceType = s.upgrades.jacks ? 'bowl' : 'tumbler';
      const g = make(kind, { smoothJacks: s.upgrades.jacks, pad: s.upgrades.pad, bigDoor: s.upgrades.door });
      advanceTo(clock + g.seconds);
      if (g.finished) {
        s = anneal(s, g.finished, clock * 1000);
        made++;
        advanceTo(clock + ANNEAL.seconds);
      }
      for (const c of [...s.commissions]) {
        const p = s.pieces.find((x) => fits(x, c));
        if (p) {
          s = deliver(s, c.id, p.id)!;
          delivered++;
        } else if (c.type !== kind || c.color) {
          s = pass(s, c.id); // not something this player makes: turn it down
        }
      }
      for (const p of s.pieces.filter((x) => !x.shelved)) s = shelve(s, p.id, clock * 1000) ?? s;
      if (!s.upgrades.jacks && (s.sold.tumbler ?? 0) >= 2 && s.cash >= 55) {
        s = { ...s, cash: s.cash - 55, upgrades: { ...s.upgrades, jacks: true } };
        firstJacks = clock;
      }
      if (goalAt === null && s.cash >= ECONOMY.goal) goalAt = clock;
    }
    return { s, made, sales, delivered, firstJacks, goalAt };
  }

  // A seeded random so the run is repeatable.
  const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

  it('unlocks bowls within the first 15 minutes and reaches the $1,000 furnace in a few hours', () => {
    const r = play(240, seeded(42));
    console.log(
      `[economy] made ${r.made}, visitor sales ${r.sales}, commissions ${r.delivered}, ` +
      `jacks at ${r.firstJacks && (r.firstJacks / 60).toFixed(1)} min, ` +
      `$1,000 at ${r.goalAt && (r.goalAt / 60).toFixed(0)} min, ` +
      `ended with $${r.s.cash} and ${r.s.rep.toFixed(0)} rep, ${r.s.pieces.length} unsold`);
    expect(r.firstJacks).not.toBeNull();
    expect(r.firstJacks!).toBeLessThan(15 * 60);
    expect(r.goalAt).not.toBeNull();
  });

  it('the cabinet never holds more than its shelves, and storage never goes negative', () => {
    const r = play(60, seeded(7));
    expect(r.s.pieces.filter((p) => p.shelved).length).toBeLessThanOrEqual(CABINET.slots);
    expect(r.s.cash).toBeGreaterThanOrEqual(0);
  });

  it('a commission always pays more than its piece is worth on the shelf', () => {
    const fp = make('tumbler').finished!;
    expect(COMMISSIONS.payK[0] * PRODUCTS.tumbler.base).toBeGreaterThanOrEqual(worth(fp) * 0.95);
  });
});
