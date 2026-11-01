import { describe, expect, it } from 'vitest';
import { PRODUCTS } from '../config';
import { applyTap, canTap, NO_MODS, type HoldAction, type Mods, type SimEvent, type TapContext } from './actions';
import { step } from './physics';
import { geometry, newPiece, pieceType, type FinishedPiece, type Piece } from './piece';
import { quality, specScore, worth } from './scoring';

const DT = 1 / 60;
const NO_COLOR: TapContext = { selectedColor: null, colorCharges: 0 };

/** A scripted gaffer: holds tools for a while or until a condition, like a player would. */
class Bench {
  p: Piece = newPiece();
  events: SimEvent[] = [];
  finished: FinishedPiece | null = null;
  constructor(public mods: Mods = NO_MODS, public rotating = true) {}

  hold(a: HoldAction | null, until: number | ((p: Piece) => boolean), max = 30) {
    const done = typeof until === 'number' ? () => false : until;
    const limit = typeof until === 'number' ? until : max;
    for (let t = 0; t < limit && !this.p.failed && !done(this.p); t += DT) {
      const r = step(this.p, a, DT, { mods: this.mods, rotating: this.rotating, justStarted: t === 0 });
      this.p = r.piece;
      this.events.push(...r.events);
    }
    return this;
  }
  /** Reheat in the glory hole until the glass is back in the working range. */
  reheat(to = 1850) {
    return this.hold('glory', (p) => p.T >= to);
  }
  tap(a: 'color' | 'transfer' | 'knockOff', ctx = NO_COLOR) {
    const ok = canTap(this.p, a, ctx);
    if (!ok.ok) throw new Error(`${a} refused: ${ok.reason}`);
    const r = applyTap(this.p, a, ctx);
    this.events.push(...r.events);
    if (r.piece) this.p = r.piece;
    if (r.finished) this.finished = r.finished;
    return this;
  }
  get fail() {
    return this.p.failed?.reason ?? null;
  }
}

function makeTumbler(b = new Bench()) {
  b.hold('gather', 2.7);
  b.hold('marver', (p) => p.T < 1880, 4);
  b.hold('blow', (p) => geometry(p).wall <= 0.24, 8);
  if (b.p.T < 1400) b.reheat();
  b.hold('blow', (p) => geometry(p).wall <= 0.2, 8);
  b.reheat();
  b.hold('marver', (p) => p.L >= 4.2, 4);
  b.hold('jacks', (p) => p.n >= 0.6, 6);
  b.reheat();
  b.tap('transfer');
  b.reheat();
  b.hold(null, (p) => p.T < 1950, 5);
  b.hold('jacks', (p) => p.o >= 0.35, 6);
  b.tap('knockOff');
  return b;
}

describe('a tumbler from start to finish', () => {
  it('comes out as a tumbler inside its spec, with high quality and close to full worth', () => {
    const b = makeTumbler();
    expect(b.fail).toBeNull();
    const fp = b.finished!;
    expect(fp.type).toBe('tumbler');
    expect(specScore(fp, PRODUCTS.tumbler)).toBeGreaterThan(0.95);
    expect(quality(fp)).toBeGreaterThan(0.9);
    expect(worth(fp)).toBeGreaterThan(PRODUCTS.tumbler.base * 0.9);
  });
});

describe('the other pieces', () => {
  it('paperweight: gather, marver, gather, block, jack line, knock off', () => {
    const b = new Bench();
    b.hold('gather', 3.2).hold('marver', (p) => p.T < 1880, 5);
    b.hold('gather', 3.2).hold('marver', (p) => p.T < 1880, 5);
    b.hold('gather', 3.2).hold('marver', (p) => p.T < 1880, 5);
    b.hold('block', 3).reheat().hold('jacks', (p) => p.n >= 0.6, 6);
    b.tap('knockOff');
    expect(b.fail).toBeNull();
    const fp = b.finished!;
    expect(fp.type).toBe('paperweight');
    expect(specScore(fp, PRODUCTS.paperweight)).toBeGreaterThan(0.95);
    expect(b.events.some((e) => e.text.startsWith('Too hot to regather'))).toBe(false);
  });

  it('bowl: more glass, opened past 50%', () => {
    const b = new Bench();
    b.hold('gather', 3).hold('marver', (p) => p.T < 1880, 4);
    b.hold('blow', (p) => geometry(p).wall <= 0.22, 10);
    b.reheat().hold('block', 1.5);
    b.hold('jacks', (p) => p.n >= 0.6, 6).reheat().tap('transfer').reheat();
    b.hold(null, (p) => p.T < 1950, 5);
    b.hold('jacks', (p) => p.o >= 0.5, 6);
    b.reheat().hold(null, (p) => p.T < 1950, 5).hold('jacks', (p) => p.o >= 0.85, 6);
    b.tap('knockOff');
    expect(b.fail).toBeNull();
    expect(b.finished!.type).toBe('bowl');
    expect(specScore(b.finished!, PRODUCTS.bowl)).toBeGreaterThan(0.9);
  });
});

describe('every fail state is reachable and explains itself', () => {
  const gathered = () => new Bench().hold('gather', 2.5);

  it('sag: rotation stopped', () => {
    const b = new Bench(NO_MODS, false).hold('gather', 2.5).hold(null, 10);
    expect(b.fail).toMatch(/Keep turning/);
  });
  it('the pipe rotates by default and stays centered', () => {
    const b = gathered().hold(null, 5);
    expect(b.p.s).toBe(0);
  });
  it('turning holds a droop where it is: it neither worsens nor fixes itself', () => {
    const b = new Bench(NO_MODS, false).hold('gather', 2.5).hold(null, 1);
    const drooped = b.p.s;
    expect(drooped).toBeGreaterThan(0.1);
    b.rotating = true;
    b.hold(null, 2);
    expect(b.p.s).toBeCloseTo(drooped, 5);
  });
  it('stopping with the droop on top lets gravity pull it back; with it underneath it gets worse', () => {
    const settle = (roll: number) => {
      // Droop it downward with the pipe at roll 0, then stop the pipe at another angle.
      let p = new Bench(NO_MODS, false).hold('gather', 2.5).hold(null, 1).p;
      const before = p.s;
      for (let t = 0; t < 0.6; t += DT) p = step(p, null, DT, { mods: NO_MODS, rotating: false, justStarted: false, roll }).piece;
      return p.s - before;
    };
    expect(settle(Math.PI)).toBeLessThan(0); // droop on top: back toward center
    expect(settle(0)).toBeGreaterThan(0); // droop underneath: further off
  });
  it('floppy in the glory hole', () => {
    const b = gathered().hold('glory', 40);
    expect(b.fail).toMatch(/floppy/);
  });
  it('cold check on the pipe', () => {
    const b = gathered().hold(null, 120);
    expect(b.fail).toMatch(/cold-checked/);
  });
  it('thermal shock in the glory hole', () => {
    const b = gathered().hold(null, (p) => p.T < 800, 120).hold('glory', 1);
    expect(b.fail).toMatch(/Thermal shock/);
  });
  it('blowout', () => {
    const b = gathered().hold('marver', 1);
    for (let i = 0; i < 6 && !b.fail; i++) b.reheat().hold('blow', 6);
    expect(b.fail).toMatch(/Blowout/);
  });
  it('jack line too deep drops the piece', () => {
    const b = gathered().hold('jacks', 30);
    expect(b.fail).toMatch(/dropped off the pipe/);
  });
  it('lip collapse when opened too far', () => {
    const b = makeTumblerOnPunty().hold('jacks', 30);
    expect(b.fail).toMatch(/lip collapsed/);
  });
  it('cracks going into the annealer when knocked off cold', () => {
    const b = makeTumblerOnPunty().hold(null, (p) => p.T < 790, 120);
    b.tap('knockOff');
    expect(b.fail).toMatch(/Cracked going into the annealer/);
  });
  it('regathering too hot warns about seeds', () => {
    const b = gathered().hold('gather', 1);
    expect(b.events.some((e) => e.text.startsWith('Too hot to regather'))).toBe(true);
    expect(b.p.uneven).toBeGreaterThan(0);
  });
  it('color will not stick to cold glass', () => {
    const b = gathered().hold(null, (p) => p.T < 1400, 60);
    const r = canTap(b.p, 'color', { selectedColor: 'cobalt', colorCharges: 5 });
    expect(r.ok).toBe(false);
  });
  it('too stiff to shape', () => {
    const b = gathered().hold(null, (p) => p.T < 1100, 60).hold('marver', 0.2);
    expect(b.events.some((e) => e.text === 'Too stiff — reheat.')).toBe(true);
  });
});

function makeTumblerOnPunty() {
  const b = new Bench();
  b.hold('gather', 2.7).hold('marver', (p) => p.T < 1880, 4);
  b.hold('blow', (p) => geometry(p).wall <= 0.2, 10).reheat();
  b.hold('jacks', (p) => p.n >= 0.6, 6).reheat().tap('transfer').reheat();
  expect(pieceType(b.p)).toBe('closed vessel');
  return b;
}
