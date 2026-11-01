import { BLOW, LOOP, SAG } from '../config';
import {
  applyTap, canHold, canTap, type Check, type HoldAction, type Mods, type SimEvent, type TapAction,
} from '../sim/actions';
import { step } from '../sim/physics';
import { newPiece, type ColorId, type FinishedPiece, type Piece } from '../sim/piece';

export interface Message {
  text: string;
  kind: SimEvent['kind'];
  at: number; // session clock when it was said
}

/** What the bench tells the studio about: a piece knocked off, a color charge used. */
export interface BenchHooks {
  onFinished(fp: FinishedPiece): void;
  onColorUsed(c: ColorId): void;
}

const RANK: Record<SimEvent['kind'], number> = { hint: 0, info: 1, warn: 2, fail: 3 };

/** The bench, always open. Owns the piece on the pipe; knows nothing about the DOM or the money. */
export class Session {
  clock = 0; // seconds since the shop was fired up
  piece: Piece | null = newPiece();
  held: HoldAction | null = null;
  tool: HoldAction | null = null; // the held tool if it's actually allowed
  rotating = true; // the pipe rolls unless the player stops it
  turning = false;
  turnPhase = 0;
  pressure: number = BLOW.pressure; // breath pressure for blowing, 0–1
  selectedColor: ColorId | null = null;
  message: Message | null = { text: 'Fresh pipe, preheated. Hold F at the furnace to gather.', kind: 'info', at: 0 };

  private justStarted = false;
  private acc = 0;
  private lastToolAt = -Infinity;

  constructor(
    public mods: Mods,
    public colors: Record<ColorId, number>, // the studio's jars; kept current by the caller
    private hooks: BenchHooks,
  ) {
    this.selectedColor = (Object.keys(colors) as ColorId[]).find((c) => colors[c] > 0) ?? null;
  }

  // ── Input ──

  press(a: HoldAction) {
    if (this.held === a) return;
    this.held = a;
    this.justStarted = true;
    const ok = canHold(this.piece, a);
    if (!ok.ok) this.say({ kind: 'hint', text: ok.reason }, true);
  }

  release(a: HoldAction) {
    if (this.held === a) this.held = null;
  }

  canTap(a: TapAction): Check {
    return canTap(this.piece, a, this.tapCtx());
  }

  tap(a: TapAction) {
    const ok = this.canTap(a);
    if (!ok.ok) return this.say({ kind: 'hint', text: ok.reason }, true);
    const p = this.piece;
    if (a === 'newPipe') {
      this.piece = newPiece();
      return this.say({ kind: 'info', text: 'New pipe. Hold F at the furnace to gather.' }, true);
    }
    if (a === 'dump') {
      this.piece = null;
      return this.say({ kind: 'info', text: 'Into the cullet bucket. N for a new pipe.' }, true);
    }
    if (!p) return;
    const r = applyTap(p, a, this.tapCtx());
    if (a === 'color' && this.selectedColor) this.hooks.onColorUsed(this.selectedColor);
    this.piece = r.piece;
    if (r.finished) this.hooks.onFinished(r.finished);
    r.events.forEach((e) => this.say(e, true));
  }

  toggleRotation() {
    this.rotating = !this.rotating;
    this.say({ kind: 'hint', text: this.rotating ? 'Rotating.' : 'Stopped turning — hot glass will droop.' }, true);
  }

  selectColor(c: ColorId) {
    this.selectedColor = c;
  }

  // ── Loop ──

  /** Advance by a real frame's worth of time, in fixed sim steps. */
  update(realDt: number) {
    this.acc += Math.min(realDt, LOOP.maxFrame);
    while (this.acc >= LOOP.step) {
      this.acc -= LOOP.step;
      this.stepOnce(LOOP.step);
    }
  }

  private stepOnce(dt: number) {
    this.clock += dt;
    const p = this.piece;
    this.tool = this.held && canHold(p, this.held).ok ? this.held : null;
    if (p) {
      const coasting = this.clock - this.lastToolAt < SAG.coastSeconds;
      const r = step(p, this.held, dt, { mods: this.mods, rotating: this.rotating, justStarted: this.justStarted, coasting, pressure: this.pressure });
      if (this.tool) this.lastToolAt = this.clock;
      this.piece = r.piece;
      this.turning = r.turning && !r.piece.failed;
      for (const e of r.events) this.say(e);
    } else {
      this.turning = false;
    }
    this.justStarted = false;
    if (this.turning) this.turnPhase = (this.turnPhase + dt * 0.55) % 1;
  }

  /** Fails stay up until something else important happens; hints don't bury warnings. Player actions always speak. */
  private say(e: SimEvent, force = false) {
    const m = this.message;
    if (m && m.text === e.text) {
      m.at = this.clock;
      return;
    }
    const age = m ? this.clock - m.at : Infinity;
    const stuckFail = m?.kind === 'fail' && this.piece?.failed;
    if (!force && m && RANK[e.kind] < RANK[m.kind] && (age < 2.5 || stuckFail)) return;
    this.message = { text: e.text, kind: e.kind, at: this.clock };
  }

  private tapCtx() {
    const c = this.selectedColor;
    return { selectedColor: c, colorCharges: c ? this.colors[c] : 0 };
  }
}
