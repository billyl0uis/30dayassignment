import { PADDLE, PRODUCTS } from '../config';
import { geometry, type Piece, type PieceType } from '../sim/piece';

export interface Step {
  label: string;
  done: (p: Piece) => boolean;
}

const g = (p: Piece) => geometry(p);
const wallUnder = (w: number) => (p: Piece) => p.blown && g(p).wall <= w;
const neck = (p: Piece) => p.n >= 0.55 || p.punty;
const paddled = (p: Piece) => p.flat >= PADDLE.flatEnough;

/**
 * The order of work for each kind of piece, with the sim's own numbers as the checks.
 * The last step is always the knock-off, which is done the moment the piece leaves the pipe.
 */
export const RECIPES: Record<PieceType, Step[]> = {
  paperweight: [
    { label: 'Gather about 12 in³ (several gathers, marver between)', done: (p) => p.V >= 10 },
    { label: 'Block it round: height about equal to diameter', done: (p) => p.V >= 10 && g(p).HD >= 0.85 && g(p).HD <= 1.15 },
    { label: 'Jack a line to about 60%', done: neck },
    { label: 'Knock off into the annealer', done: () => false },
  ],
  ornament: [
    { label: 'Gather about 3 in³', done: (p) => p.V >= 2.5 },
    { label: 'Blow to a 0.1–0.2" wall', done: wallUnder(0.2) },
    { label: 'Jack a line to about 60%', done: neck },
    { label: 'Knock off into the annealer', done: () => false },
  ],
  tumbler: [
    { label: 'Gather 3–4 in³', done: (p) => p.V >= 3 },
    { label: 'Blow to about a 0.2" wall', done: wallUnder(0.25) },
    { label: 'Marver it long: 4.2" or more', done: (p) => p.punty || (p.blown && p.L >= 4.2) },
    { label: 'Paddle the bottom flat (A)', done: paddled },
    { label: 'Jack a line to about 60%', done: neck },
    { label: 'Transfer to the punty', done: (p) => p.punty },
    { label: 'Open the lip to 20–50%', done: (p) => p.punty && p.o >= 0.2 && p.o < 0.5 },
    { label: 'Knock off into the annealer', done: () => false },
  ],
  bowl: [
    { label: 'Gather 6 in³ or more', done: (p) => p.V >= 6 },
    { label: 'Blow to under a 0.3" wall', done: wallUnder(0.3) },
    { label: 'Paddle the bottom flat (A)', done: paddled },
    { label: 'Jack a line to about 60%', done: neck },
    { label: 'Transfer to the punty', done: (p) => p.punty },
    { label: 'Open the lip past 50%, reheating between opens', done: (p) => p.punty && p.o >= 0.5 },
    { label: 'Knock off into the annealer', done: () => false },
  ],
  'closed vessel': [
    { label: 'Gather 5 in³ or more', done: (p) => p.V >= 5 },
    { label: 'Blow to under a 0.3" wall', done: wallUnder(0.3) },
    { label: 'Marver it tall: 5" or more', done: (p) => p.punty || (p.blown && p.L >= 5) },
    { label: 'Paddle the bottom flat (A)', done: paddled },
    { label: 'Jack a line to about 60%', done: neck },
    { label: 'Transfer to the punty', done: (p) => p.punty },
    { label: 'Open just a narrow mouth, under 20%', done: (p) => p.punty && p.o > 0.03 && p.o < 0.2 },
    { label: 'Knock off into the annealer', done: () => false },
  ],
};

export interface GoalState {
  label: string; // what you're making
  steps: { label: string; done: boolean }[];
  next: string | null; // the first step not yet done
}

/** Where the piece on the pipe stands against the recipe for what you're making. */
export function goalState(kind: PieceType, p: Piece | null): GoalState {
  const recipe = RECIPES[kind];
  const live = p && !p.failed && p.V > 0 ? p : null;
  // A later step being done implies the earlier ones are (you can't transfer without a jack line).
  let reached = -1;
  if (live) recipe.forEach((s, i) => s.done(live) && (reached = i));
  const steps = recipe.map((s, i) => ({ label: s.label, done: i <= reached }));
  const first = steps.find((s) => !s.done);
  return { label: PRODUCTS[kind].label, steps, next: live ? first?.label ?? null : 'Hold F at the furnace to gather' };
}
