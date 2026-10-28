/* Vitrigraph Lab: every number the simulation uses lives here.
 *
 * !!! PLACEHOLDERS TO VERIFY !!!
 * None of these values come from measured pulls. They are tuned so the game
 * shows cause and effect at a playable speed. Check each one against real
 * kiln logs, manufacturer data and experienced vitrigraph workers before
 * trusting it, and edit freely. Nothing else in the code hard-codes a number
 * about glass, kilns or time.
 */
window.VitrigraphLab = window.VitrigraphLab || {};

VitrigraphLab.config = {
  // Display units for temperatures. All values below are stored in °F.
  units: 'F',

  kiln: {
    roomTemp: 70,          // PLACEHOLDER TO VERIFY
    setMin: 900,           // slider range, PLACEHOLDER TO VERIFY
    setMax: 1900,          // PLACEHOLDER TO VERIFY
    setDefault: 1650,      // PLACEHOLDER TO VERIFY
    rampPerHour: 900,      // max heating rate of the kiln, °F/hr, PLACEHOLDER TO VERIFY
    coolPerHour: 400,      // passive cooling when below setpoint, °F/hr, PLACEHOLDER TO VERIFY
    glassLagMinutes: 25,   // how far the glass in the pot trails the kiln air (time constant), PLACEHOLDER TO VERIFY
    heatGameMinutesPerSecond: 2,  // HEAT stage: real seconds → kiln minutes while the clock runs
    pullGameMinutesPerSecond: 0.5,    // PULL stage: hands move in real time, but kiln time is compressed so setpoint changes show up mid-pull (game choice, not physics)
  },

  // Relative flow index (0–1). This is a logistic stand-in, NOT a viscosity curve.
  flow: {
    midTemp: 1640,         // glass temp where the index reaches 0.5, PLACEHOLDER TO VERIFY
    width: 55,             // °F; smaller = sharper change from stiff to runny, PLACEHOLDER TO VERIFY
    flowStart: 0.18,       // below this index nothing leaves the orifice
    bands: [               // labels on the meter (lower bound of each band)
      { from: 0.00, label: 'stiff' },
      { from: 0.18, label: 'taffy' },
      { from: 0.42, label: 'honey' },
      { from: 0.72, label: 'runny' },
    ],
    chunkMeltDelay: 0.06,  // chunks need a slightly higher index before they slump, PLACEHOLDER TO VERIFY
  },

  pot: {
    rings: 6,              // radial cells, center to wall
    sectors: 8,            // cells around the circle
    layers: 10,            // cells bottom to top
    chargeVolumeCm3: 60,   // glass volume when every cell is full, PLACEHOLDER TO VERIFY
    wallSlow: 0.88,        // parabolic profile: speed = 1 - wallSlow·(r/R)², PLACEHOLDER TO VERIFY
    softGain: 0.35,        // speed change per 0.1 of color softness: how much a softer column outruns a stiffer one, PLACEHOLDER TO VERIFY
  },

  // Orifice sizes. Flow scales with diameter⁴ against the reference (Poiseuille-like).
  orifices: [
    { id: 'o1', label: '1/4 in', inches: 0.25, shape: 'round' },   // PLACEHOLDER TO VERIFY
    { id: 'o2', label: '3/8 in', inches: 0.375, shape: 'round' },  // PLACEHOLDER TO VERIFY
    { id: 'o3', label: '1/2 in', inches: 0.5, shape: 'round' },    // PLACEHOLDER TO VERIFY
    { id: 'slot', label: 'slot (ribbon)', inches: 0.375, shape: 'slot', aspect: 3 }, // PLACEHOLDER TO VERIFY
  ],
  orificeDefault: 'o2',
  orificeRefInches: 0.375,

  pull: {
    maxFlowMm3PerSec: 1400,  // output at index 1 through the reference hole, full pot, PLACEHOLDER TO VERIFY
    flowExponent: 1.6,       // output ∝ index^exp, PLACEHOLDER TO VERIFY
    headMin: 0.45,           // output multiplier when the pot is nearly empty (less glass pressing down)
    mmPerPixel: 1.6,         // pointer travel → strand length
    speedSmoothing: 0.18,    // 0–1, how quickly the pull-speed reading follows the pointer
    snapSpeedAtFull: 140,    // cm/s the strand can stretch at index 1 before tearing, PLACEHOLDER TO VERIFY
    snapExponent: 1.4,       // stiffer glass tears at lower speed, PLACEHOLDER TO VERIFY
    minDiameterMm: 0.35,     // thinner than this snaps
    tearGraceSec: 0.3,       // overstretch must last this long before the strand tears (forgives pointer jitter)
    gobReadyMm3: 2500,       // gob big enough to grab, PLACEHOLDER TO VERIFY
    gobDropMm3: 9000,        // gob hanging untouched this big falls off, PLACEHOLDER TO VERIFY
    flowingSecondsPerSecond: 1, // HEAT stage clock once the gob is ready (game seconds per real second)
    droopIndex: 0.72,        // above this index the strand sags and goes lumpy at slow pulls
    droopSpeed: 12,          // cm/s; "slow" for the droop rule
    airCoolPerSec: 0.9,      // fraction of the index lost per second once the strand leaves the pot (visual stiffness only)
    twistDegPerCm: 18,       // twist mode rotation per cm pulled
    autoSpeedMax: 80,        // cm/s, steady-pull slider max
  },

  // Challenge targets
  challenges: {
    stringer: { minLenCm: 50, minD: 1.0, maxD: 3.0, maxCv: 0.12 }, // CV = spread of diameter
    colorChange: { minRunCm: 10 },
    targetMatch: 0.75,
    recipeMatch: 0.8,
  },

  // Editable COE list. Glasses only mix safely within one system; '?' = unknown.
  coes: [
    { id: '96', label: 'COE 96', note: 'example system' },
    { id: '90', label: 'COE 90', note: 'example system' },
    { id: '104', label: 'COE 104', note: 'example system' },
    { id: '33', label: 'COE 33 (boro)', note: 'example system' },
    { id: '?', label: 'unknown', note: 'unlabelled scrap' },
  ],
  coeDefault: '96',

  // Colors. soft: offset to the flow index (+ = runs softer). All PLACEHOLDERS TO VERIFY:
  // real colors differ by maker and batch.
  colors: [
    { id: 'clear',  name: 'Clear',          hex: '#d9ecee', opaque: false, soft: 0 },
    { id: 'cobalt', name: 'Cobalt blue',    hex: '#2346a8', opaque: false, soft: 0 },
    { id: 'white',  name: 'Opal white',     hex: '#f3f1ea', opaque: true,  soft: -0.05 },
    { id: 'black',  name: 'Black',          hex: '#1d1b1d', opaque: true,  soft: 0 },
    { id: 'amber',  name: 'Amber',          hex: '#c47a20', opaque: false, soft: 0.02 },
    { id: 'green',  name: 'Emerald',        hex: '#1f7a4c', opaque: false, soft: 0 },
    { id: 'ruby',   name: 'Gold ruby',      hex: '#b0244b', opaque: false, soft: -0.06 },
    { id: 'yellow', name: 'Opal yellow',    hex: '#e9c43a', opaque: true,  soft: 0.04 },
    { id: 'turq',   name: 'Opal turquoise', hex: '#3fb2ad', opaque: true,  soft: 0 },
  ],

  forms: [
    { id: 'chunk', name: 'Chunks', note: 'Few bubbles, slumps a little later.' },
    { id: 'frit',  name: 'Frit',   note: 'Packs tight but traps air: expect seeds (small bubbles).' },
    { id: 'scrap', name: 'Scrap',  note: 'Mixed bits. Only as compatible as you know it to be.' },
  ],
  fritBubbleChance: 0.35,   // chance a frit cell shows a seed in a slice, PLACEHOLDER TO VERIFY
};
