// Every tunable number in Gaffer Glass lives here.
// Units: inches, cubic inches, °F, seconds of real time (1 s = 1 studio minute).
// Temperatures and timings are simplified for play; retune them to match your studio.

export const ROOM_F = 70;

// ── Studio & economy ─────────────────────────────────────────────────
export const ECONOMY = {
  startCash: 20, // you open the studio with this and a furnace of clear glass
  goal: 1000, // save this much toward your own furnace
  colorValue: 1.15, // a colored piece is worth this much more
  floorValue: 0.35, // a piece at 0% quality is still worth this share of its base
};

export const ANNEAL = {
  seconds: 8, // real seconds in the annealer before a piece comes out to storage
};

export const CABINET = {
  slots: 6, // shelf spaces in the cabinet
  freshSeconds: 20, // a just-shelved piece isn't browsed until it has sat this long
};

// Visitors drop by in real time and browse the cabinet.
export const VISITORS = {
  gapMin: 25, // seconds between visits…
  gapMax: 40,
  repSpeedup: 250, // …shortened by rep/repSpeedup, up to maxSpeedup
  maxSpeedup: 0.4,
  budgetMin: 15, // what a visitor will spend, before reputation
  budgetMax: 70,
  budgetRep: 80, // budget × (1 + rep/budgetRep)
  repValue: 0.004, // reputation makes your work worth more to them: × (1 + rep·repValue)…
  maxRegard: 1.5, // …up to this, so a famous studio still has to price sensibly
  maxBudget: 3, // budget × (1 + rep/budgetRep) tops out at this multiple
  wantedBoost: 1.3, // the kind of piece they came in for
  otherKind: 0.55,
  coloredBoost: 1.1,
  repPerSale: 0.5, // + quality/repQualityDiv
  repQualityDiv: 0.6,
};

export const COMMISSIONS = {
  count: 3,
  minQ: [0.6, 0.8] as const, // quality bar
  payK: [1.0, 1.25] as const, // × the piece's base worth
  rep: [3, 5] as const,
  colorChance: 0.3, // share that ask for a color
  colorPay: 1.2, // a color request pays this much more
};

// ── Furnace (gather) ─────────────────────────────────────────────────
export const GATHER = {
  rate: 2.2, // in³ of glass picked up per second
  furnaceF: 2100, // glass temperature in the furnace
  pullK: 0.6, // how fast the piece is pulled toward furnace temp while in (1/s)
  firstLength: 1.4, // L of the first gather (in)
  maxV: 24, // all the glass one pipe can carry (in³)
  tooHotToRegatherF: 1900, // starting a new gather above this adds seeds/unevenness
  regatherUneven: 0.15, // unevenness added by a too-hot regather
};

// ── Glory hole (reheat) ──────────────────────────────────────────────
export const GLORY = {
  targetF: 2350, // the glory hole pulls the piece toward this
  pullK: 0.55, // base reheat rate (1/s), slowed by mass
  massV: 20, // reheat rate is divided by (1 + V/massV)
  floppyF: 2200, // above this the piece goes floppy and a bubble collapses
  floppySag: 0.35, // sag added per second per 100°F over floppyF, even while turning
  collapseRate: 0.12, // in/s the bubble radius shrinks per 100°F over floppyF
  shockF: 850, // starting a reheat below this = thermal shock
  bigDoorBoost: 1.4, // reheat speed multiplier with the bigger door
};

// ── Cooling & workability ────────────────────────────────────────────
export const COOL = {
  base: 0.012, // T -= (T − room)·k·dt with k = base + small/(1 + V/smallV)
  small: 0.03,
  smallV: 4, // small pieces lose heat faster
  stiffF: 1150, // below this the glass doesn't move (fluid = 0)
  fluidF: 1950, // at or above this the glass is fully soft (fluid = 1)
  hotF: 2150, // gauge: "too hot" zone starts here
  coldCheckF: 650, // below this on the pipe or punty the piece cracks
  glowStartF: 900, // the glass starts to glow (and hide its color) above this
};

// ── Sag / centering ──────────────────────────────────────────────────
export const SAG = {
  minF: 1050, // no sag below this
  span: 1100, // soft = (T − minF)/span
  rate: 0.32, // droop grows by dt·rate·soft²·(1 + V/massV) while the pipe is still
  massV: 15,
  dropAt: 1.6, // droop this far and the piece slumps off onto the floor
  warnAt: 0.25, // droop this far and the bench warns you
  centeredK: 0.75, // centered score = 1 − centeredK·droop
  coastSeconds: 0.35, // the pipe keeps rolling this long after you let go of a tool
};

// Tipping the pipe lets gravity shape soft glass: tip down and it runs long, tip up and it slumps short and fat.
export const TILT = {
  rate: 0.55, // in/s of length change at full tilt, fully soft, scaled by mass
  massV: 10, // heavier glass flows harder: × (1 + V/massV)
  ease: 4, // how fast the pipe swings toward where you're tipping it (1/s)
  maxDegrees: 14, // how far the pipe tips on screen at full tilt
  minLR: 0.9, // shortest: L ≥ minLR × 2R (a squat ball)
  maxLR: 3.4, // longest: L ≤ maxLR × 2R before it's a drip, not a piece
};

// ── Bench tools ──────────────────────────────────────────────────────
export const MARVER = {
  coolRate: 45, // °F/s drawn off by the steel
  lengthRatio: 2.9, // pushes L toward this × R (a cylinder)
  shapeK: 0.9, // shaping speed (1/s), scaled by fluid
  centerRate: 0.18, // droop taken out per second, scaled by fluid: slow, and it costs you heat
};

export const BLOCK = {
  coolRate: 40, // °F/s into the wet wooden block
  lengthRatio: 2.0, // pushes L toward 2R (round)
  shapeK: 1.2,
  centerRate: 0.4, // re-centers harder than the marver
  padBoost: 1.6, // wet newspaper pad: centers 60% faster than the block
};

export const BLOW = {
  rate: 0.3, // in/s of bubble radius growth at full softness
  startR: 0.05, // first puff opens a bubble this big
  lengthGrowth: 0.2, // L grows by this × the radius growth
  coolRate: 4, // °F/s of breath cooling
  tooHotF: 2050, // blowing above this blows unevenly
  hotUneven: 0.12, // unevenness per second while blowing too hot
  blowoutWall: 0.07, // wall thinner than this = blowout
  thinRef: 0.2, // thin walls give way faster: rate × clamp(thinRef / wall, 1, thinMax)
  thinMax: 3,
  pressure: 0.55, // default breath pressure (0–1); the slider sets it
  pressureMin: 0.2,
  pressureBlowout: 0.4, // blowout wall × (1 + pressureBlowout·(pressure/default − 1)): harder breath tears at a thicker wall
};

export const JACKS = {
  neckRate: 0.22, // jack line depth per second on the pipe, scaled by fluid
  openRate: 0.3, // lip opening per second on the punty, scaled by fluid
  coolRate: 18, // °F/s into the steel blades
  dropAt: 1.0, // jack line past this and the piece falls off the pipe
  smoothDropAt: 1.15, // …with the smoother jacks
  smoothSlow: 0.6, // smoother jacks move at 60% speed (40% slower) for control
  collapseAt: 1.25, // lip opening past this collapses
  tooHotOpenF: 2000, // opening above this goes wobbly
  hotUneven: 0.15, // unevenness per second while opening too hot
};

// ── Tap actions ──────────────────────────────────────────────────────
export const COLOR = {
  minF: 1500, // colored frit won't stick below this
  coolBy: 120, // rolling in cold frit costs this many °F
  usesPerJar: 5,
};

export const TRANSFER = {
  minNeck: 0.45, // jack line needed before the punty can take it
  minF: 1150, // the punty won't stick to a stiff piece
  coolBy: 80,
};

export const KNOCKOFF = {
  minNeck: 0.45, // jack line needed to knock off from the pipe
  minF: 900, // colder than this cracks going into the annealer (soda-lime anneals near 960°F, strains near 880°F)
};

// ── Geometry & rendering helpers ─────────────────────────────────────
export const GEOM = {
  pipeR: 0.42, // blowpipe outer radius (in)
  puntyR: 0.24, // punty rod radius (in)
  openKnee: 0.25, // o below this mostly widens the hole; above it flares the lip
  heightLoss: 0.35, // H = L·(1 − heightLoss·max(0, o − openKnee))
  flare: 0.9, // lipR gains flare·R per unit of o past the knee
};

// ── Piece types & scoring ────────────────────────────────────────────
export const TYPE_THRESHOLDS = {
  tumblerFrom: 0.2, // on the punty: o below this = closed vessel
  bowlFrom: 0.5, // o at or above this = bowl
};

export const SCORE = {
  wCentered: 0.4,
  wEven: 0.25,
  wSpec: 0.35,
  falloff: 0.15, // outside a range, spec falls off over this share of the range's midpoint
};

export type Range = [number, number];
/** What a buyer expects of a kind of piece; anything outside a range costs quality. */
export interface OrderSpec {
  D?: Range;
  H?: Range;
  wall?: Range;
  HD?: Range; // roundness: height ÷ diameter
}

/** What you can make. Keyed by the sim's piece type; the ranges are what a buyer expects. */
export const PRODUCTS = {
  paperweight: { label: 'Paperweight', base: 30, D: [2.5, 3.5], HD: [0.85, 1.15] },
  ornament: { label: 'Ornament', base: 26, D: [2, 3.5], wall: [0.05, 0.2] },
  tumbler: { label: 'Tumbler', base: 42, D: [3, 3.9], H: [3.2, 5], wall: [0.08, 0.25] },
  bowl: { label: 'Bowl', base: 72, D: [5, 7.5], H: [1.8, 3.2], wall: [0.08, 0.3], unlock: 'jacks' },
  'closed vessel': { label: 'Vase', base: 64, D: [2.8, 4.5], H: [4.5, 8], wall: [0.08, 0.3], unlock: 'door' },
} satisfies Record<string, OrderSpec & { label: string; base: number; unlock?: string }>;

// Generic first names for visitors and commission customers.
export const CUSTOMERS = [
  'Ana', 'Ben', 'Chloe', 'Dev', 'Eli', 'Farah', 'Gus', 'Hana', 'Ivo', 'June',
  'Kai', 'Lena', 'Milo', 'Nora', 'Omar', 'Pia', 'Quinn', 'Rosa', 'Sam', 'Tess',
];

// ── Shop ─────────────────────────────────────────────────────────────
export const COLORS = {
  cobalt: { label: 'Cobalt', price: 12, rgb: [38, 70, 196] },
  amber: { label: 'Amber', price: 10, rgb: [205, 128, 30] },
  copperGreen: { label: 'Copper green', price: 10, rgb: [40, 160, 110] },
  opal: { label: 'Opal white', price: 14, rgb: [236, 232, 220] },
  goldRuby: { label: 'Gold ruby', price: 28, rgb: [200, 28, 76] },
} satisfies Record<string, { label: string; price: number; rgb: [number, number, number] }>;

export const CLEAR_RGB: [number, number, number] = [205, 228, 232];

/** Tools. Some unlock a new kind of piece, and only once you've sold or delivered enough of another. */
export const UPGRADES = {
  pad: { label: 'Wet newspaper pad', price: 20, blurb: 'A second shaping tool (D): centers 60% faster than the block, and works on the punty too.' },
  jacks: {
    label: 'Smoother jacks', price: 55, blurb: 'Slower, steadier jacks; the neck holds to 115%. Unlocks bowls.',
    requires: { type: 'tumbler', count: 2 },
  },
  door: {
    label: 'Bigger glory hole door', price: 70, blurb: 'Reheats about 40% faster. Unlocks vases.',
    requires: { type: 'bowl', count: 1 },
  },
} satisfies Record<string, { label: string; price: number; blurb: string; requires?: { type: string; count: number } }>;

// ── Sim loop ─────────────────────────────────────────────────────────
export const LOOP = {
  step: 1 / 60, // fixed simulation step (s)
  maxFrame: 0.25, // longest real frame we simulate (s); longer gaps (tab switches) are dropped
  readoutHz: 10, // DOM readout refresh rate
};
