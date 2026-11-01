// Every tunable number in Gaffer lives here.
// Units: inches, cubic inches, °F, seconds of real time (1 s = 1 studio minute).
// Temperatures and timings are simplified for play; retune them to match your studio.

export const ROOM_F = 70;

// ── Session & economy ────────────────────────────────────────────────
export const ECONOMY = {
  startCash: 100,
  goal: 1000, // save this much toward your own furnace
  rent: 45, // one 3-hour block of hot shop time
  assistantFee: 20, // optional assistant who keeps the pipe turning
  taShiftPay: 35, // teaching-assistant shift: cash, but uses up the day
  sessionSeconds: 180, // 3 studio hours at 1 s = 1 min
  repBowlUnlock: 3, // reputation needed before bowl orders appear
  repPerSale: 1,
  repPerGradeA: 2,
  colorRequestChance: 0.3, // share of orders that ask for a specific color
  colorBonus: 15,
  secondsMin: 6, // seconds sell for this…
  secondsMax: 20, // …up to this, scaled by quality and size
};

// ── Furnace (gather) ─────────────────────────────────────────────────
export const GATHER = {
  rate: 2.2, // in³ of glass picked up per second
  furnaceF: 2100, // glass temperature in the furnace
  pullK: 0.6, // how fast the piece is pulled toward furnace temp while in (1/s)
  firstLength: 1.4, // L of the first gather (in)
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
  rate: 0.5, // s += dt·rate·soft²·(1 + V/massV) when nothing is turning it
  massV: 15,
  centeredK: 1.6, // centered score = 1 − centeredK·s
  coastSeconds: 0.35, // the pipe keeps rolling this long after you let go of a tool
};

// ── Bench tools ──────────────────────────────────────────────────────
export const MARVER = {
  coolRate: 45, // °F/s drawn off by the steel
  lengthRatio: 2.9, // pushes L toward this × R (a cylinder)
  shapeK: 0.9, // shaping speed (1/s), scaled by fluid
  centerRate: 0.35, // sag removed per second, scaled by fluid
};

export const BLOCK = {
  coolRate: 40, // °F/s into the wet wooden block
  lengthRatio: 2.0, // pushes L toward 2R (round)
  shapeK: 1.2,
  centerRate: 0.7, // re-centers harder than the marver
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
  minF: 800, // colder than this cracks going into the annealer
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
  gradeA: 0.85,
  gradeB: 0.7,
  gradeC: 0.55, // below this a piece only sells as seconds
};

export type Range = [number, number];
export interface OrderSpec {
  label: string;
  pay: number;
  D?: Range;
  H?: Range;
  wall?: Range;
  HD?: Range; // roundness: height ÷ diameter
}

export const ORDER_TYPES = {
  paperweight: { label: 'Paperweight', pay: 30, D: [2.5, 3.5], HD: [0.85, 1.15] },
  tumbler: { label: 'Tumbler', pay: 42, D: [3, 3.9], H: [3.2, 5], wall: [0.08, 0.25] },
  bowl: { label: 'Bowl', pay: 72, D: [5, 7.5], H: [1.8, 3.2], wall: [0.08, 0.3] },
} satisfies Record<string, OrderSpec>;

export const CLIENTS = [
  'a café',
  'a wedding registry',
  'a gallery consignment',
  'a neighbor',
  'a farmers-market stall',
  'a restaurant opening',
  'a retirement gift',
  'a museum shop',
  'a housewarming',
  'a craft fair booth',
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

export const UPGRADES = {
  jacks: { label: 'Smoother jacks', price: 90, blurb: 'Jacks move 40% slower for control; the neck holds to 115%.' },
  pad: { label: 'Wet newspaper pad', price: 20, blurb: 'Centers 60% faster than the block.' },
  door: { label: 'Bigger glory hole door', price: 70, blurb: 'Reheats about 40% faster.' },
};

// ── Sim loop ─────────────────────────────────────────────────────────
export const LOOP = {
  step: 1 / 60, // fixed simulation step (s)
  maxFrame: 0.25, // longest real frame we simulate (s); longer gaps (tab switches) are dropped
  readoutHz: 10, // DOM readout refresh rate
};
