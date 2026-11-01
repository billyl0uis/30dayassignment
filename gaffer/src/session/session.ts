import { ECONOMY, LOOP, SAG } from '../config';
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

export interface SessionResult {
  annealed: FinishedPiece[];
  cullet: number;
  colors: Record<ColorId, number>; // charges left after the session
}

const RANK: Record<SimEvent['kind'], number> = { hint: 0, info: 1, warn: 2, fail: 3 };

/** One booked block of hot shop time. Owns the piece on the pipe; knows nothing about the DOM. */
export class Session {
  timeLeft = ECONOMY.sessionSeconds;
  clock = 0;
  piece: Piece | null = newPiece();
  held: HoldAction | null = null;
  tool: HoldAction | null = null; // the held tool if it's actually allowed
  turning = false;
  turnPhase = 0;
  annealed: FinishedPiece[] = [];
  cullet = 0;
  selectedColor: ColorId | null = null;
  message: Message | null = { text: 'Fresh pipe, preheated. Hold F at the furnace to gather.', kind: 'info', at: 0 };
  over = false;

  private justStarted = false;
  private acc = 0;
  private lastToolAt = -Infinity;

  constructor(
    public readonly mods: Mods,
    public readonly assistant: boolean,
    public colors: Record<ColorId, number>,
  ) {
    this.selectedColor = (Object.keys(colors) as ColorId[]).find((c) => colors[c] > 0) ?? null;
  }

  // ── Input ──

  press(a: HoldAction) {
    if (this.over || this.held === a) return;
    this.held = a;
    this.justStarted = true;
    const ok = canHold(this.piece, a);
    if (!ok.ok) this.say({ kind: 'hint', text: ok.reason }, true);
  }

  release(a: HoldAction) {
    if (this.held === a) this.held = null;
  }

  canTap(a: TapAction): Check {
    if (this.over) return { ok: false, reason: 'The session is over.' };
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
      if (p && !p.failed) this.cullet += 1;
      this.piece = null;
      return this.say({ kind: 'info', text: 'Into the cullet bucket. N for a new pipe.' }, true);
    }
    if (!p) return;
    const r = applyTap(p, a, this.tapCtx());
    if (a === 'color' && this.selectedColor) this.colors = { ...this.colors, [this.selectedColor]: this.colors[this.selectedColor] - 1 };
    this.piece = r.piece;
    if (r.finished) this.annealed.push(r.finished);
    r.events.forEach((e) => this.say(e, true));
  }

  selectColor(c: ColorId) {
    this.selectedColor = c;
  }

  endEarly() {
    this.timeLeft = 0;
  }

  result(): SessionResult {
    return { annealed: this.annealed, cullet: this.cullet, colors: this.colors };
  }

  // ── Loop ──

  /** Advance by a real frame's worth of time, in fixed sim steps. */
  update(realDt: number) {
    if (this.over) return;
    this.acc += Math.min(realDt, LOOP.maxFrame);
    while (this.acc >= LOOP.step && !this.over) {
      this.acc -= LOOP.step;
      this.stepOnce(LOOP.step);
    }
  }

  private stepOnce(dt: number) {
    this.clock += dt;
    this.timeLeft -= dt;
    const p = this.piece;
    this.tool = this.held && canHold(p, this.held).ok ? this.held : null;
    if (p) {
      const coasting = this.clock - this.lastToolAt < SAG.coastSeconds;
      const r = step(p, this.held, dt, { mods: this.mods, assistant: this.assistant, justStarted: this.justStarted, coasting });
      if (this.tool) this.lastToolAt = this.clock;
      this.piece = r.piece;
      this.turning = r.turning && !r.piece.failed;
      for (const e of r.events) {
        if (e.kind === 'fail') this.cullet += 1;
        this.say(e);
      }
    } else {
      this.turning = false;
    }
    this.justStarted = false;
    if (this.turning) this.turnPhase = (this.turnPhase + dt * 0.55) % 1;

    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.over = true;
      this.held = this.tool = null;
      const q = this.piece;
      if (q && !q.failed && q.V > 0) {
        this.cullet += 1;
        this.say({ kind: 'fail', text: "Time's up — the piece on the pipe goes in the cullet bucket." });
      } else {
        this.say({ kind: 'info', text: "Time's up. The annealer is loaded for the night." });
      }
    }
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
