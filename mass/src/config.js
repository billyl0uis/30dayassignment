// ─────────────────────────────────────────────────────────────────────────────
//  ANNEAL ESTIMATE CONFIG — UNCALIBRATED PLACEHOLDER
//
//  Annealing time is estimated as   t = k × d²   where d is the thickest-point
//  dimension in cm (the diameter of the largest sphere that fits inside the
//  glass). The d² scaling follows from heat diffusion; the constants do not.
//
//  The values below were NOT taken from any chart. They are round numbers so
//  the readout does something. Before trusting the estimate, calibrate k and
//  the schedule against Bullseye's "Annealing Thick Slabs" chart
//  or against your own studio's schedule for the glass you actually use, e.g.
//  fit k so that k × d² matches the chart's total time at two thicknesses.
//
//  The readout is always labelled "estimate" in the UI.
// ─────────────────────────────────────────────────────────────────────────────
export const ANNEAL = {
  calibrated: false,     // set true once k and the schedule come from real data
  k: 1.0,                // hours per cm² of thickest-point dimension — PLACEHOLDER
  minHours: 1,           // floor for very small pieces — PLACEHOLDER
  warnAboveHours: 24,    // the "long anneal" warning threshold (step 5)

  // Base schedule, filled in from your glass manufacturer's data or your
  // studio. Left empty on purpose rather than guessed.
  schedule: {
    glass: 'soft / soda-lime (unspecified)',
    annealSoakC: null,   // anneal soak temperature, °C
    strainPointC: null,  // strain point, °C
    segments: [],        // e.g. [{ toC, ratePerHourC, holdHours }]
  },
};

export function annealHours(thickestCm) {
  return Math.max(ANNEAL.minHours, ANNEAL.k * thickestCm * thickestCm);
}

// Material + stability defaults (also editable in the side panel).
export const MATERIAL = {
  density: 2.5,          // g/cm³ — soda-lime / soft glass
};

// Thick-to-thin check: warn where a thin part (≤ maxThinCm thick) sits
// within overCm of glass at least `ratio` times thicker (and ≥ minThickCm).
// Thin glass chills faster than the thick glass it joins and can crack there.
export const CHECKS = {
  ratio: 4,
  overCm: 1,
  minThickCm: 1,
  maxThinCm: 1.5,
  // Centreline points whose distance-to-surface changes faster than this per
  // unit length are corner branches (a 90° edge climbs at ≈0.71), not limbs.
  maxRidgeSlope: 0.5,
};

export const STABILITY = {
  minTipAngleDeg: 10,    // a base must allow this lean before tipping (step 5)
  contactTolCm: 0.01,    // glass surface within 0.1 mm of the floor counts as touching
};
