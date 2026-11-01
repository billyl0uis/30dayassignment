import {
  BLOCK, BLOW, COLOR, GATHER, GLORY, JACKS, KNOCKOFF, MARVER, SAG, TRANSFER,
} from '../config';
import { clamp, geometry, type ColorId, type FinishedPiece, type Piece, pieceType } from './piece';
import { fluid } from './physics';

export type HoldAction = 'gather' | 'glory' | 'marver' | 'block' | 'blow' | 'jacks';
export type TapAction = 'newPipe' | 'dump' | 'color' | 'transfer' | 'knockOff';

export type Check = { ok: true } | { ok: false; reason: string };
const OK: Check = { ok: true };
const no = (reason: string): Check => ({ ok: false, reason });

export type SimEvent =
  | { kind: 'fail'; text: string }
  | { kind: 'warn'; text: string } // something just went a bit wrong
  | { kind: 'hint'; text: string } // nothing is happening, here's why
  | { kind: 'info'; text: string };

/** Studio upgrades that change how the tools behave. */
export interface Mods {
  smoothJacks: boolean;
  pad: boolean;
  bigDoor: boolean;
}
export const NO_MODS: Mods = { smoothJacks: false, pad: false, bigDoor: false };

export const dropAt = (mods: Mods) => (mods.smoothJacks ? JACKS.smoothDropAt : JACKS.dropAt);

// ── Can I do this? (shared by the sim, the buttons, and the message line) ──

export function canHold(p: Piece | null, a: HoldAction): Check {
  if (!p) return no('Nothing on the pipe — press N for a new pipe.');
  if (p.failed) return no('That piece is done for — N for a new pipe or Q to dump it.');
  if (a === 'gather') return p.punty ? no('No gathering on the punty.') : OK;
  if (p.V <= 0) return no('Gather some glass first (F at the furnace).');
  if (a === 'block' && p.punty) return no('Block on the pipe, not the punty.');
  if (a === 'blow' && p.punty) return no("You can't blow through the punty — it's solid.");
  return OK;
}

export interface TapContext {
  selectedColor: ColorId | null;
  colorCharges: number; // charges left in the selected jar
}

export function canTap(p: Piece | null, a: TapAction, ctx: TapContext): Check {
  if (a === 'newPipe') return p && !p.failed && p.V > 0 ? no('Finish this piece or dump it (Q) first.') : OK;
  if (a === 'dump') return p && p.V > 0 ? OK : no('Nothing to dump.');
  if (!p) return no('Nothing on the pipe — press N for a new pipe.');
  if (p.failed) return no('That piece is done for — N for a new pipe or Q to dump it.');
  if (p.V <= 0) return no('Gather some glass first (F at the furnace).');
  switch (a) {
    case 'color':
      if (p.punty) return no('Roll in color on the pipe, before the transfer.');
      if (!ctx.selectedColor) return no('Pick a color jar first.');
      if (ctx.colorCharges <= 0) return no('That jar is empty — buy more in the shop.');
      if (p.T <= COLOR.minF) return no(`Won't stick — reheat above ${COLOR.minF}°F first.`);
      return OK;
    case 'transfer':
      if (p.punty) return no('Already on the punty.');
      if (!p.blown) return no('Only a blown piece goes on the punty. A solid one knocks off the pipe as a paperweight.');
      if (p.n < TRANSFER.minNeck) return no(`Jack a line of at least ${pct(TRANSFER.minNeck)} first.`);
      if (p.T <= TRANSFER.minF) return no(`Too stiff to transfer — reheat above ${TRANSFER.minF}°F.`);
      return OK;
    case 'knockOff':
      if (!p.punty && p.n < KNOCKOFF.minNeck)
        return no(`Jack a line of at least ${pct(KNOCKOFF.minNeck)} before knocking off.`);
      return OK;
  }
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

// ── Hold tools: one step of dt seconds. Mutates a copy the caller owns. ──

export interface HoldContext {
  mods: Mods;
  justStarted: boolean; // first step of this hold
  events: SimEvent[];
  /** Set when the glory hole caused this step's sag, so a slump gets the right reason. */
  floppy?: boolean;
}

const STIFF = 'Too stiff — reheat.';

export function applyHold(p: Piece, a: HoldAction, dt: number, ctx: HoldContext): void {
  const f = fluid(p.T);
  switch (a) {
    case 'gather': {
      if (ctx.justStarted) {
        if (p.V > 0 && p.T > GATHER.tooHotToRegatherF) {
          p.uneven += GATHER.regatherUneven;
          ctx.events.push({ kind: 'warn', text: `Too hot to regather — expect seeds. Marver it below ${GATHER.tooHotToRegatherF}°F first.` });
        }
        p.gathers += 1;
      }
      const dV = GATHER.rate * dt;
      const V = p.V + dV;
      // New glass arrives at furnace temperature, then the furnace keeps pulling.
      p.T = (p.T * p.V + GATHER.furnaceF * dV) / V;
      p.T += (GATHER.furnaceF - p.T) * GATHER.pullK * dt;
      if (p.gathers <= 1 || p.V <= 0) p.L = GATHER.firstLength;
      else p.L *= Math.cbrt(V / p.V);
      p.V = V;
      return;
    }
    case 'glory': {
      if (ctx.justStarted && p.T < GLORY.shockF) {
        fail(p, 'crack', `Thermal shock — it was under ${GLORY.shockF}°F going into the glory hole and cracked. Reheat sooner.`, ctx);
        return;
      }
      const k = (GLORY.pullK * (ctx.mods.bigDoor ? GLORY.bigDoorBoost : 1)) / (1 + p.V / GLORY.massV);
      p.T += (GLORY.targetF - p.T) * k * dt;
      if (p.T > GLORY.floppyF) {
        const over = (p.T - GLORY.floppyF) / 100;
        p.s += GLORY.floppySag * over * dt;
        ctx.floppy = true;
        ctx.events.push({ kind: 'warn', text: `Over ${GLORY.floppyF}°F — it's going floppy. Pull it out.` });
        if (p.blown && p.r > 0) {
          p.r = Math.max(0, p.r - GLORY.collapseRate * over * dt);
          if (p.r < 0.02 && !p.punty) {
            p.r = 0;
            p.blown = false;
            ctx.events.push({ kind: 'warn', text: 'The bubble collapsed in the heat — it is solid again.' });
          }
        }
      }
      return;
    }
    case 'marver':
    case 'block': {
      const c = a === 'marver' ? MARVER : BLOCK;
      p.T -= c.coolRate * dt;
      if (f <= 0) return void ctx.events.push({ kind: 'hint', text: STIFF });
      if (!p.punty) {
        const R = geometry(p).R;
        p.L += (c.lengthRatio * R - p.L) * c.shapeK * f * dt;
      }
      const boost = a === 'block' && ctx.mods.pad ? BLOCK.padBoost : 1;
      p.s = Math.max(0, p.s - c.centerRate * boost * f * dt);
      return;
    }
    case 'blow': {
      p.T -= BLOW.coolRate * dt;
      if (f <= 0) return void ctx.events.push({ kind: 'hint', text: STIFF });
      if (!p.blown) {
        p.blown = true;
        p.r = Math.max(p.r, BLOW.startR);
      }
      const thin = clamp(BLOW.thinRef / geometry(p).wall, 1, BLOW.thinMax);
      const dr = BLOW.rate * thin * f * dt;
      p.r += dr;
      p.L += BLOW.lengthGrowth * dr;
      if (p.T > BLOW.tooHotF) {
        p.uneven += BLOW.hotUneven * dt;
        ctx.events.push({ kind: 'warn', text: `Blowing above ${BLOW.tooHotF}°F — the wall is going uneven.` });
      }
      if (geometry(p).wall < BLOW.blowoutWall)
        fail(p, 'crack', `Blowout — the wall got thinner than ${BLOW.blowoutWall}". Stop blowing sooner or gather more glass.`, ctx);
      return;
    }
    case 'jacks': {
      p.T -= JACKS.coolRate * dt;
      if (f <= 0) return void ctx.events.push({ kind: 'hint', text: STIFF });
      const slow = ctx.mods.smoothJacks ? JACKS.smoothSlow : 1;
      if (!p.punty) {
        p.n += JACKS.neckRate * slow * f * dt;
        const max = dropAt(ctx.mods);
        if (p.n > max)
          fail(p, 'floor', `The jack line went past ${pct(max)} and the piece dropped off the pipe. Stop around 60%.`, ctx);
        return;
      }
      p.o += JACKS.openRate * slow * f * dt;
      if (p.T > JACKS.tooHotOpenF) {
        p.uneven += JACKS.hotUneven * dt;
        ctx.events.push({ kind: 'warn', text: `Opening above ${JACKS.tooHotOpenF}°F — the lip is going wobbly. Let it cool a touch.` });
      }
      if (p.o > JACKS.collapseAt)
        fail(p, 'floor', `Opened past ${pct(JACKS.collapseAt)} — the lip collapsed. Stop opening once it's the shape you want.`, ctx);
      return;
    }
  }
}

export function fail(p: Piece, kind: 'floor' | 'crack', reason: string, ctx: { events: SimEvent[] }) {
  if (p.failed) return;
  p.failed = { kind, reason };
  ctx.events.push({ kind: 'fail', text: reason });
}

// ── Tap tools ──

export interface TapResult {
  piece: Piece | null;
  events: SimEvent[];
  finished?: FinishedPiece; // knocked off into the annealer
}

/** Color, transfer and knock-off. New pipe and dump are bookkeeping, handled by the session. */
export function applyTap(p0: Piece, a: 'color' | 'transfer' | 'knockOff', ctx: TapContext): TapResult {
  const p = { ...p0 };
  const events: SimEvent[] = [];
  switch (a) {
    case 'color':
      p.color = ctx.selectedColor;
      p.T -= COLOR.coolBy;
      events.push({ kind: 'info', text: 'Rolled in color. It hides under the glow until the piece cools.' });
      return { piece: p, events };
    case 'transfer':
      p.punty = true;
      p.o = 0;
      p.T -= TRANSFER.coolBy;
      events.push({ kind: 'info', text: 'On the punty. Reheat, then open the lip with the jacks.' });
      return { piece: p, events };
    case 'knockOff':
      if (p.T < KNOCKOFF.minF) {
        fail(p, 'crack', `Cracked going into the annealer — it was under ${KNOCKOFF.minF}°F. Reheat before you knock off.`, { events });
        return { piece: p, events };
      }
      events.push({ kind: 'info', text: `Into the annealer: a ${pieceType(p)}. N for a new pipe.` });
      return { piece: null, events, finished: finish(p) };
  }
}

export function finish(p: Piece): FinishedPiece {
  const g = geometry(p);
  return {
    type: pieceType(p),
    V: p.V,
    D: g.D,
    H: g.H,
    wall: g.wall,
    HD: g.HD,
    centered: clamp(1 - SAG.centeredK * p.s, 0, 1),
    even: clamp(1 - p.uneven, 0, 1),
    color: p.color,
  };
}
