import { COOL, ROOM_F, SAG, TILT } from '../config';
import { applyHold, canHold, fail, type HoldAction, type Mods, type SimEvent } from './actions';
import { clamp, geometry, type Piece } from './piece';

/** 0 when too stiff to move, 1 when fully soft. Shaping, blowing and jacks scale with it. */
export const fluid = (T: number) => clamp((T - COOL.stiffF) / (COOL.fluidF - COOL.stiffF), 0, 1);

export const coolingK = (V: number) => COOL.base + COOL.small / (1 + V / COOL.smallV);

export interface StepContext {
  mods: Mods;
  rotating: boolean; // the pipe is rolling on the rails (on by default; Space stops it)
  justStarted: boolean; // first step of the current hold
  coasting?: boolean; // a tool was let go of moments ago and the pipe is still rolling
  pressure?: number; // breath pressure for blowing, 0–1
  tilt?: number; // −1 tip up … 0 level … +1 tip down
  roll?: number; // how far the pipe has turned (radians): which way is down in the pipe's frame
}

export interface StepResult {
  piece: Piece;
  events: SimEvent[];
  turning: boolean;
}

/** Advance one piece by dt seconds with at most one tool held. Pure: returns a new piece. */
export function step(p0: Piece, held: HoldAction | null, dt: number, ctx: StepContext): StepResult {
  const events: SimEvent[] = [];
  if (p0.failed) return { piece: p0, events, turning: false };
  const p = { ...p0 };

  // A held tool only counts if it's allowed right now; a refused one does nothing at all.
  const tool = held && canHold(p, held).ok ? held : null;
  const turning = tool !== null || ctx.rotating || !!ctx.coasting;
  if (p.V <= 0 && tool !== 'gather') return { piece: p, events, turning };

  const hctx = { mods: ctx.mods, justStarted: ctx.justStarted, events, floppy: false, pressure: ctx.pressure };
  if (tool) applyHold(p, tool, dt, hctx);
  if (p.failed) return { piece: p, events, turning };

  // Out of the furnace and the glory hole, the glass is always losing heat to the room.
  if (tool !== 'gather' && tool !== 'glory') p.T -= (p.T - ROOM_F) * coolingK(p.V) * dt;

  // Gravity along the pipe: soft glass runs toward whichever end is low.
  const tilt = ctx.tilt ?? 0;
  if (tilt !== 0 && tool !== 'gather' && tool !== 'marver' && tool !== 'block') {
    const f = fluid(p.T);
    if (f > 0) {
      const R = geometry(p).R;
      const L = p.L + tilt * TILT.rate * f * f * (1 + p.V / TILT.massV) * dt;
      // Never pushes a piece past the limits it is already outside of; only stops it going further.
      p.L = clamp(L, Math.min(p.L, TILT.minLR * 2 * R), Math.max(p.L, TILT.maxLR * 2 * R));
    }
  }

  // Gravity only acts on the droop while the pipe is still: turning spreads the pull evenly all
  // round, so it neither worsens nor fixes it. Still, soft glass falls toward whatever is down
  // right now. Stop with the droop underneath and it gets worse; stop with it on top and it
  // swings back through center, so start turning again at the right moment.
  if (!turning && p.T > SAG.minF) {
    const soft = (p.T - SAG.minF) / SAG.span;
    const k = dt * SAG.rate * soft * soft * (1 + p.V / SAG.massV);
    const roll = ctx.roll ?? 0;
    const before = p.s;
    p.cx -= Math.cos(roll) * k; // world down, seen from the turned pipe
    p.cy += Math.sin(roll) * k;
    p.s = Math.hypot(p.cx, p.cy);
    if (before < SAG.warnAt && p.s >= SAG.warnAt)
      events.push({ kind: 'warn', text: 'Off center. Stop turning with the droop on top and let gravity pull it back, or marver it.' });
  }

  if (p.s >= SAG.dropAt) {
    fail(p, 'floor', hctx.floppy
      ? 'Too hot in the glory hole — it went floppy and slid off center onto the floor. Pull it out sooner.'
      : 'Keep turning — it drooped off center and slumped onto the floor.', hctx);
  } else if (p.T < COOL.coldCheckF) {
    fail(p, 'crack', `It cooled below ${COOL.coldCheckF}°F on the ${p.punty ? 'punty' : 'pipe'} and cold-checked. Reheat before it gets that stiff.`, hctx);
  }
  return { piece: p, events, turning };
}
