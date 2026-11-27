// Every tunable in one place (GDD §4.7). Change numbers here, not in code.
// Heat is on the 0–100 scale from GDD §4; flavor °F lives in heatToF().

export const CFG = {
  heat: {
    H_START: 95,
    H_AMBIENT: 10,
    H_REF: 70,
    COOL_BASE: 2.4,
    GH_RATE: 14,
    GH_TARGET: 100,
    SLUMP_THRESHOLD: 92,
    CRACK_INSTANT: 12,
    STRESS_COLD_LINE: 40,
    sizeMult: { S: 1.25, M: 1.0, L: 0.8, solid: 0.55 },
    contactMult: { air: 1.0, marver: 1.6, blocks: 1.3, tool: 1.15, mold: 1.4 },
    sizeReheatMult: { S: 1.3, M: 1.0, L: 0.8, solid: 0.5 },
    LIP_REHEAT_MULT: 2.0,
    BODY_REHEAT_WHILE_LIP: 0.4,
    LIP_COOL_MULT: 1.4,
    STRESS_COLD_RATE: 1.5,       // per second per 10 heat below the cold line
    STRESS_RELIEF_RATE: 3,
    STRESS_RELIEF_MIN_HEAT: 80,
    STRESS_FLOOR_FRACTION: 0.5,  // reheating never takes stress below half its peak
    OFF_SLUMP_RATE: 4,
    OFF_SLUMP_GH_MULT: 0.25,     // deviation from GDD §4.6: auto-turning in the glory hole limits slump
    OFF_CORRECT_RATE: 6,
    OFF_FLOOR_FRACTION: 0.25,    // after the bench, off-center can't drop below 25% of peak
    GH_TRAVEL_S: 1.2,            // in + out; half is spent on each side
    HEAVY_GATHER_COOL: 0.9,
    WORK_BAND: [45, 92],         // used for steps that have no ideal band of their own
  },

  // Ideal working bands per step (GDD §4.3).
  bands: {
    marver: [70, 90],
    frit: [78, 92],
    blow: [65, 85],
    jacks: [55, 75],
    paddle: [50, 70],
    punty: [50, 70],
    lip: [70, 88],
    anneal: [40, 65],
  },

  stressEvents: { marverCold: 8, paddleCold: 4, forcedFlare: 5, extraTap: 2, coldPuff: 3 },
  offEvents: { marverStall: 20, drip: 15, hotPuff: 2, puntyOff: 15, hotJacks: 10, garageSag: 30 },

  garage: {
    H_GARAGE: 55,
    DRIFT: 3,
    GRACE_S: 40,
    DECAY_EVERY_S: 4,
    DECAY_CAP: 25,
    WARN_S: 120,
    SAG_S: 180,
    slotsByDay: [[1, 1], [4, 2], [9, 3], [15, 4]],
  },

  pipe: { WARM_S: 8, WARMER_SLOTS: 2, UNDERWARM_CAP: 70 },

  gather: {
    FILL_S: 2.6,
    target: { S: 0.45, M: 0.62, L: 0.78 },
    bandDay1: 0.06,
    bandDay10: 0.04,
    ZERO_AT: 0.25,
    DRIP_AFTER_S: 2,
  },

  marver: {
    RING: 0.3,            // ring radius as a fraction of the end-view circle
    RING_S: 3.0,
    MIN_OVERLAP: 85,
    STALL_S: 1.5,
    STALL_SPEED: 40,      // px/s; slower than this while pressed = stationary
    GOOD_SPEED: [120, 1300],
    CHATTER_SPEED: 1600,
    CHILL_HEAT: 55,
    SILHOUETTE_CAP_CHILLED: 80,
    targetCone: { tumbler: 0.15 },
  },

  frit: { STICK_HEAT: 75, COVERAGE_PER_PX: 1 / 1000, DONE_COVERAGE: 0.9, MAX_DOSES: 3, MELT_S: 3, MELT_HEAT: 82, ROUGH_CAP: 85 },

  blow: { START: 0.35, AIR_RATE: 0.42, TAU_S: 0.35, BLOWOUT: 1.3, PERFECT: 0.05, ZERO_AT: 0.3, HOT: 85, COLD: 60, HOT_MULT: 1.6, COLD_MULT: 0.3, UNEVEN_PENALTY: 10 },

  jacks: { NOTCH_U: 0.1, SQUEEZE_RATE: 0.35, DEPTH_BAND: [0.55, 0.75], DROP_AT: 0.95, POS_TOL: 0.05, HOT: 80, COLD: 50, COLD_PENALTY: 15 },

  paddle: { RATE: 0.55, DISH_AT: 0.8, DISH_PENALTY: 25, BULGE_HEAT: 75, BULGE_PENALTY: 20, MIN_HEAT: 40 },

  punty: { PREP_S: 6, START_HEAT: 92, COOL_MULT: 2, WEAK_BELOW: 75, SNAP_PX: 60, OFF_PX: 20, WEAK_DROP_CHANCE: 0.15 },

  crackoff: { CHIP_CHANCE: 0.25, CHIP_PENALTY: 15, SHALLOW_TAPS: 3 },

  lip: { TARGET: 1.0, TOL: 0.06, ZERO_AT: 0.4, PX_PER_UNIT: 200, MIN_HEAT: 60, FORCE_CRACK_CHANCE: 0.1, CRACK_PENALTY: 30, DROP_AT: 1.3, DROP_PENALTY: 30 },

  anneal: {
    LOAD_PENALTY: [[40, 0], [30, 0.1], [25, 0.3], [-Infinity, 0.6]], // [minHeat, penalty]
    SOAK_MIN_HOLLOW: 45,
    SOAK_MIN_SOLID: 90,
    SOAK_MAX_PENALTY: 0.25,
    COLD_SEAL_PENALTY: 0.2,
    DOOR_FREE_S: 6,
    DOOR_PER_S: 0.01,
    DOOR_AUTOCLOSE_S: 3,
    MAX_P: 0.95,
    STRESS_WEIGHT: 0.7,
    STRESS_EXP: 1.5,
    PITY_BELOW: 0.1,
  },

  day: {
    LENGTH_S: 480,
    LAST_CALL_S: 90,
    FIRST_ARRIVAL_S: 6,
    LOBBY_PATIENCE_S: 45,
    LOBBY_MAX: 3,
    RAIL_MAX: 5,
    OPEN_HOUR: 10,
    CLOSE_HOUR: 18,
    RUSH: [12, 13],
  },

  customers: { BASE: 5, PER_DAY: 0.45, MAX: 14, RUSH_MULT: 0.6, JITTER: [0.6, 1.4], PATIENCE_MULT: 3.0, DENSITY_FROM_DAY: 3 },

  products: {
    tumbler: { label: 'Tumbler', soloBuildS: 65, price: 12 },
  },

  scoring: {
    HEAT_FACTOR_MIN: 0.55,
    weights: { shape: 0.3, color: 0.2, size: 0.15, heat: 0.15, wait: 0.2 },
    OFF_WEIGHT: 0.5,
    STRESS_WEIGHT: 0.6,
    SIZE_PER_PCT: 4,
    HUE_PER_DE: 1.2,
    CLEAN_TIP_BONUS: 0.2,
  },
};

// Twelve bins in the GDD; the MVP ships six.
export const FRITS = [
  { id: 'cobalt', name: 'Cobalt', rgb: [31, 79, 184] },
  { id: 'turquoise', name: 'Turquoise', rgb: [43, 179, 177] },
  { id: 'amber', name: 'Amber', rgb: [201, 138, 26] },
  { id: 'ruby', name: 'Ruby', rgb: [179, 18, 63] },
  { id: 'seagreen', name: 'Sea Green', rgb: [62, 155, 110] },
  { id: 'violet', name: 'Violet', rgb: [122, 79, 176] },
];

// The order of work for an M tumbler (GDD §13 MVP scope).
export const STEPS = [
  { id: 'warm', station: 'furnace', label: 'Warm a pipe' },
  { id: 'gather', station: 'furnace', label: 'Gather' },
  { id: 'marver', station: 'furnace', label: 'Marver' },
  { id: 'frit', station: 'color', label: 'Pick up frit' },
  { id: 'meltin', station: 'color', label: 'Melt in (glory hole)' },
  { id: 'blow', station: 'color', label: 'Blow' },
  { id: 'jacks', station: 'bench', label: 'Jack line' },
  { id: 'paddle', station: 'bench', label: 'Paddle bottom' },
  { id: 'punty', station: 'finish', label: 'Punty transfer' },
  { id: 'crackoff', station: 'finish', label: 'Crack off pipe' },
  { id: 'lip', station: 'finish', label: 'Open the lip' },
  { id: 'anneal', station: 'finish', label: 'Load annealer' },
];

export const STATIONS = ['counter', 'furnace', 'color', 'bench', 'finish'];

export function heatToF(h) {
  // Piecewise map from GDD §4 table; flavor only.
  const pts = [[0, 700], [12, 950], [20, 1000], [30, 1100], [45, 1350], [60, 1600], [75, 1800], [90, 2000], [100, 2150]];
  for (let i = 1; i < pts.length; i++) {
    if (h <= pts[i][0]) {
      const [h0, f0] = pts[i - 1];
      const [h1, f1] = pts[i];
      return Math.round(f0 + ((h - h0) / (h1 - h0)) * (f1 - f0));
    }
  }
  return 2150;
}

export function garageSlotsForDay(day, cfg = CFG) {
  let n = 1;
  for (const [d, slots] of cfg.garage.slotsByDay) if (day >= d) n = slots;
  return n;
}
