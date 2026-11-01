import { COOL, ROOM_F, SAG } from '../config';
import { applyHold, canHold, fail, type HoldAction, type Mods, type SimEvent } from './actions';
import { clamp, type Piece } from './piece';

/** 0 when too stiff to move, 1 when fully soft. Shaping, blowing and jacks scale with it. */
export const fluid = (T: number) => clamp((T - COOL.stiffF) / (COOL.fluidF - COOL.stiffF), 0, 1);

export const coolingK = (V: number) => COOL.base + COOL.small / (1 + V / COOL.smallV);

export interface StepContext {
  mods: Mods;
  rotating: boolean; // the pipe is rolling on the rails (on by default; Space stops it)
  justStarted: boolean; // first step of the current hold
  coasting?: boolean; // a tool was let go of moments ago and the pipe is still rolling
  pressure?: number; // breath pressure for blowing, 0–1
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

  if (!turning && p.T > SAG.minF) {
    const soft = (p.T - SAG.minF) / SAG.span;
    p.s += dt * SAG.rate * soft * soft * (1 + p.V / SAG.massV);
  } else if (turning && !hctx.floppy) {
    // Steady turning lets gravity pull soft glass back on center.
    p.s = Math.max(0, p.s - SAG.turnCenterRate * fluid(p.T) * dt);
  }

  if (p.s >= 1) {
    fail(p, 'floor', hctx.floppy
      ? 'Too hot in the glory hole — it went floppy and slid off center onto the floor. Pull it out sooner.'
      : 'Keep turning — it drooped off center and slumped onto the floor.', hctx);
  } else if (p.T < COOL.coldCheckF) {
    fail(p, 'crack', `It cooled below ${COOL.coldCheckF}°F on the ${p.punty ? 'punty' : 'pipe'} and cold-checked. Reheat before it gets that stiff.`, hctx);
  }
  return { piece: p, events, turning };
}
