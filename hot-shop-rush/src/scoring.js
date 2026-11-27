// Scoring formulas (GDD §7). Pure functions.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function heatFactor(cfg, fracInBand) {
  const m = cfg.scoring.HEAT_FACTOR_MIN;
  return m + (1 - m) * clamp(fracInBand, 0, 1);
}

export function stepScore(cfg, accuracy, fracInBand) {
  return clamp(accuracy, 0, 100) * heatFactor(cfg, fracInBand);
}

// Linear falloff: 100 inside `perfect`, 0 at `zeroAt` (both as absolute error).
export function falloff(err, perfect, zeroAt) {
  const e = Math.abs(err);
  if (e <= perfect) return 100;
  if (e >= zeroAt) return 0;
  return 100 * (1 - (e - perfect) / (zeroAt - perfect));
}

// Gather accuracy: 100 at center, 70 at band edge, 0 at ZERO_AT (GDD §3.1).
export function gatherAccuracy(amount, center, halfBand, zeroAt) {
  const d = Math.abs(amount - center);
  if (d <= halfBand) return 100 - 30 * (d / halfBand);
  if (d >= zeroAt) return 0;
  return 70 * (1 - (d - halfBand) / (zeroAt - halfBand));
}

// sRGB → CIE Lab (D65), for ΔE76 hue matching.
export function rgbToLab([r, g, b]) {
  const lin = (c) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const R = lin(r), G = lin(g), B = lin(b);
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function deltaE(rgbA, rgbB) {
  const a = rgbToLab(rgbA), b = rgbToLab(rgbB);
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function hueMatch(cfg, usedRgb, ticketRgb) {
  if (!usedRgb) return 0;
  return clamp(100 - cfg.scoring.HUE_PER_DE * deltaE(usedRgb, ticketRgb), 0, 100);
}

export function waitScore(ratio) {
  if (ratio <= 0.5) return 100;
  if (ratio <= 1) return 100 - 70 * ((ratio - 0.5) / 0.5);
  return clamp(30 - 60 * (ratio - 1), 0, 30);
}

/**
 * Hand-off score (GDD §7.2).
 * r = { shapeSteps:[scores], off, shapePenalty, hue, coverage, doses, targetDoses,
 *       sizeErrPct, sizeCap, heatFrac, stress, waitRatio, garageDecay }
 */
export function handoff(cfg, r, weightMult = {}) {
  const s = cfg.scoring;
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const densityMatch = r.doses === r.targetDoses ? 100 : Math.max(0, 100 - 40 * Math.abs(r.doses - r.targetDoses));

  const cat = {
    shape: clamp(mean(r.shapeSteps) - s.OFF_WEIGHT * r.off - (r.shapePenalty || 0), 0, 100),
    color: clamp(0.5 * r.hue + 0.3 * (100 * r.coverage) + 0.2 * densityMatch, 0, 100),
    size: clamp(Math.min(r.sizeCap ?? 100, 100 - s.SIZE_PER_PCT * Math.abs(r.sizeErrPct)), 0, 100),
    heat: clamp(100 * r.heatFrac - s.STRESS_WEIGHT * r.stress, 0, 100),
    wait: waitScore(r.waitRatio),
  };

  const w = {};
  let sum = 0;
  for (const k of Object.keys(s.weights)) {
    w[k] = s.weights[k] * (weightMult[k] ?? 1);
    sum += w[k];
  }
  let total = 0;
  for (const k of Object.keys(w)) total += (w[k] / sum) * cat[k];
  total = clamp(total - (r.garageDecay || 0), 0, 100);

  return { categories: cat, total, stars: Math.round((total / 20) * 2) / 2 };
}

export function tip(basePrice, score, repMult = 1, tipMult = 1) {
  return Math.round(basePrice * (score / 100) ** 2 * repMult * tipMult * 10) / 10;
}

/**
 * Morning crack chance (GDD §7.3).
 * r = { stress, loadHeat, soakS, solid, coldSeals, doorS }
 */
export function crackChance(cfg, r) {
  const a = cfg.anneal;
  let loadPenalty = 0;
  for (const [minH, pen] of a.LOAD_PENALTY) {
    if (r.loadHeat >= minH) { loadPenalty = pen; break; }
  }
  const soakMin = r.solid ? a.SOAK_MIN_SOLID : a.SOAK_MIN_HOLLOW;
  const soakPenalty = r.soakS >= soakMin ? 0 : a.SOAK_MAX_PENALTY * (1 - Math.max(0, r.soakS) / soakMin);
  const p =
    a.STRESS_WEIGHT * (clamp(r.stress, 0, 100) / 100) ** a.STRESS_EXP +
    loadPenalty +
    soakPenalty +
    a.COLD_SEAL_PENALTY * (r.coldSeals || 0) +
    a.DOOR_PER_S * (r.doorS || 0);
  return clamp(p, 0, a.MAX_P);
}
