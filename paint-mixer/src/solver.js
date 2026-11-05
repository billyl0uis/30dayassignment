// Recipe solver: given a target Lab and the paints in a palette, search
// combinations of 1-3 (optionally 4) paints with integer parts and rank them
// by CIEDE2000 plus a small penalty per extra paint.

import { deltaE2000 } from './color.js';
import { paintToColor, mixParts, colorToLab, colorToHex } from './mixer.js';

export const MAX_PALETTE = 30;
export const DEFAULTS = {
  maxParts: 12, // integer parts per recipe total at most this
  allow4: false, // also try 4-paint recipes
  level: 'best', // 'best' | 'close' | 'broader'
  beam4: 40, // 4-paint search extends only the best N three-paint recipes
};

export const LEVELS = {
  best: { maxDeltaE: Infinity, limit: 1 },
  close: { maxDeltaE: 5, limit: 10 },
  broader: { maxDeltaE: 15, limit: 20 },
};

// ---- scoring -----------------------------------------------------------------

/**
 * Score used to rank recipes (lower is better).
 * @param {number} deltaE      CIEDE2000 between predicted mix and target
 * @param {number} paintCount  number of paints in the recipe (1-4)
 */
export function scoreRecipe(deltaE, paintCount) {
  // Extra cost for each paint beyond the first. It grows because every
  // added paint makes a real mix harder to hit and more likely to go muddy.
  const PENALTY = [0, 0, 0.5, 1.2, 2.2]; // index = number of paints
  return deltaE + (PENALTY[paintCount] ?? 2.2 + (paintCount - 4));
}

export function deltaELabel(dE) {
  if (dE < 2) return 'very close';
  if (dE <= 5) return 'close';
  if (dE <= 10) return 'rough';
  return 'out of reach';
}

// ---- parts helpers --------------------------------------------------------------

const gcd = (a, b) => (b ? gcd(b, a % b) : a);

const compCache = new Map();
/**
 * All k-tuples of positive integers with sum <= maxTotal whose gcd is 1
 * (2:2 is the same mix as 1:1, so non-reduced ratios are skipped).
 */
export function compositions(k, maxTotal) {
  const key = `${k}/${maxTotal}`;
  if (compCache.has(key)) return compCache.get(key);
  const out = [];
  const cur = [];
  (function rec(left, slots) {
    if (slots === 0) {
      if (cur.reduce(gcd) === 1) out.push(cur.slice());
      return;
    }
    for (let v = 1; v <= left - (slots - 1); v++) {
      cur.push(v);
      rec(left - v, slots - 1);
      cur.pop();
    }
  })(maxTotal, k);
  compCache.set(key, out);
  return out;
}

/** parts -> "3:1" or "75% / 25%" (percentages always sum to 100). */
export function formatParts(parts, mode = 'ratio') {
  if (mode === 'ratio') return parts.join(':');
  const total = parts.reduce((a, b) => a + b, 0);
  const raw = parts.map((p) => (p / total) * 100);
  const floors = raw.map(Math.floor);
  let rest = 100 - floors.reduce((a, b) => a + b, 0);
  // largest-remainder rounding
  raw
    .map((r, i) => [r - floors[i], i])
    .sort((a, b) => b[0] - a[0])
    .forEach(([, i]) => {
      if (rest-- > 0) floors[i]++;
    });
  return floors.map((p) => `${p}%`).join(' / ');
}

// ---- mixing steps -----------------------------------------------------------------

export const STRONG_TINTING = 1.5; // tintingStrength at/above this gets "tiny amounts"
export const DARK_L = 35; // paints darker than this are added gradually

/**
 * Order in which to combine the paints of a recipe.
 * Start with the paint that has the most parts (ties: the lighter one), then add
 * the rest, saving strong or dark paints for last and adding those gradually.
 */
export function mixingSteps(items) {
  const isPotent = (it) => (it.tintingStrength ?? 1) >= STRONG_TINTING || it.lab[0] < DARK_L;
  const sorted = [...items].sort((a, b) => b.parts - a.parts || b.lab[0] - a.lab[0]);
  const [base, ...rest] = sorted;
  rest.sort((a, b) => isPotent(a) - isPotent(b) || b.parts - a.parts || b.lab[0] - a.lab[0]);

  const plural = (n) => `${n} part${n === 1 ? '' : 's'}`;
  const steps = [{ id: base.id, name: base.name, parts: base.parts, text: `Start with ${plural(base.parts)} ${base.name}.`, tinyAmounts: (base.tintingStrength ?? 1) >= STRONG_TINTING }];
  for (const it of rest) {
    const tiny = (it.tintingStrength ?? 1) >= STRONG_TINTING;
    const gradual = tiny || it.lab[0] < DARK_L;
    steps.push({
      id: it.id,
      name: it.name,
      parts: it.parts,
      tinyAmounts: tiny,
      text: `Add ${plural(it.parts)} ${it.name}${gradual ? ', a little at a time, mixing in fully before adding more' : ''}.`,
    });
  }
  return steps;
}

// ---- search core ---------------------------------------------------------------------

function* combinations(n, k, start = 0, prefix = []) {
  if (prefix.length === k) {
    yield prefix.slice();
    return;
  }
  for (let i = start; i <= n - (k - prefix.length); i++) {
    prefix.push(i);
    yield* combinations(n, k, i + 1, prefix);
    prefix.pop();
  }
}

/** Best parts for one fixed set of paints. Returns { idx, parts, deltaE, lab }. */
function bestForCombo(targetLab, colors, idx, comps) {
  const cs = idx.map((i) => colors[i]);
  let best = null;
  for (const parts of comps) {
    const lab = colorToLab(mixParts(cs, parts));
    const dE = deltaE2000(targetLab, lab);
    if (!best || dE < best.deltaE) best = { idx, parts, deltaE: dE, lab };
  }
  return best;
}

function buildRecipe(entry, paints, colors) {
  const items = entry.idx.map((i, j) => ({
    id: paints[i].id,
    name: paints[i].name,
    brand: paints[i].brand,
    parts: entry.parts[j],
    lab: paints[i].lab,
    tintingStrength: paints[i].tintingStrength ?? 1,
  }));
  const mixed = mixParts(entry.idx.map((i) => colors[i]), entry.parts);
  return {
    paints: items,
    parts: entry.parts,
    deltaE: entry.deltaE,
    label: deltaELabel(entry.deltaE),
    score: scoreRecipe(entry.deltaE, entry.idx.length),
    mixLab: entry.lab,
    mixHex: colorToHex(mixed),
    ratio: formatParts(entry.parts, 'ratio'),
    percent: formatParts(entry.parts, 'percent'),
    steps: mixingSteps(items),
  };
}

/**
 * Search every combination of 1..3 paints (and 4 when allow4) and return the
 * best ratio per combination, ranked by score.
 */
export function searchAll(targetLab, paints, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const usable = paints.filter((p) => Array.isArray(p.lab));
  if (usable.length > MAX_PALETTE) throw new Error(`A palette can hold at most ${MAX_PALETTE} paints.`);
  const colors = usable.map(paintToColor);
  const n = usable.length;
  const maxK = Math.min(3, n);

  const results = [];
  let total = 0;
  for (let k = 1; k <= maxK; k++) total += binom(n, k);
  let done = 0;

  for (let k = 1; k <= maxK; k++) {
    const comps = compositions(k, o.maxParts);
    for (const idx of combinations(n, k)) {
      results.push(bestForCombo(targetLab, colors, idx, comps));
      if (o.onProgress && ++done % 200 === 0) o.onProgress(done / total);
    }
  }

  if (o.allow4 && n >= 4) {
    // Full 4-paint search is ~13M mixes for 30 paints, so extend only the
    // most promising 3-paint sets by one more paint (beam search).
    const comps4 = compositions(4, o.maxParts);
    const seeds = results.filter((r) => r.idx.length === 3).sort((a, b) => a.deltaE - b.deltaE).slice(0, o.beam4);
    const seen = new Set();
    for (const seed of seeds) {
      for (let i = 0; i < n; i++) {
        if (seed.idx.includes(i)) continue;
        const idx = [...seed.idx, i].sort((a, b) => a - b);
        const key = idx.join(',');
        if (seen.has(key)) continue;
        seen.add(key);
        results.push(bestForCombo(targetLab, colors, idx, comps4));
      }
    }
  }

  results.sort((a, b) => scoreRecipe(a.deltaE, a.idx.length) - scoreRecipe(b.deltaE, b.idx.length));
  return { ranked: results, paints: usable, colors };
}

/**
 * Main entry point.
 * @param {number[]} targetLab
 * @param {object[]} paints  mix paints ({id, name, lab, tintingStrength})
 * @param {object} opts      see DEFAULTS; plus suggestFrom: library paints for "Suggest a paint"
 */
export function solve(targetLab, paints, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const t0 = Date.now();
  const { ranked, paints: usable, colors } = searchAll(targetLab, paints, o);
  if (ranked.length === 0) return { recipes: [], best: null, ms: Date.now() - t0, message: 'No paints with a color in this palette yet.' };

  const level = LEVELS[o.level] ?? LEVELS.best;
  let picked = ranked.filter((r) => r.deltaE <= level.maxDeltaE).slice(0, level.limit);
  const fallback = picked.length === 0;
  if (fallback) picked = [ranked[0]];

  const recipes = picked.map((r) => buildRecipe(r, usable, colors));
  const best = buildRecipe(ranked[0], usable, colors);

  let suggestion = null;
  if (best.deltaE > 5 && o.suggestFrom?.length) {
    suggestion = suggestPaint(targetLab, usable, o.suggestFrom, o);
  }

  return { recipes, best, fallback, suggestion, combosSearched: ranked.length, ms: Date.now() - t0 };
}

/**
 * "Suggest a paint": try each library paint not in the palette and report the
 * single one that would get closest if added (recipes that use it, plus up to
 * two palette paints).
 */
export function suggestPaint(targetLab, palette, candidates, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const inPalette = new Set(palette.map((p) => p.id));
  const pool = candidates.filter((c) => Array.isArray(c.lab) && !inPalette.has(c.id));
  if (pool.length === 0) return null;

  const colors = palette.map(paintToColor);
  const n = palette.length;
  let best = null;

  for (const cand of pool) {
    const cColor = paintToColor(cand);
    const allColors = [...colors, cColor];
    const ci = n; // candidate index in allColors
    const sets = [[ci]];
    for (let i = 0; i < n; i++) sets.push([i, ci]);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) sets.push([i, j, ci]);

    for (const idx of sets) {
      const r = bestForCombo(targetLab, allColors, idx, compositions(idx.length, o.maxParts));
      const s = scoreRecipe(r.deltaE, idx.length);
      if (!best || s < best.score) best = { score: s, entry: r, cand, allPaints: [...palette, cand], allColors };
    }
  }

  const recipe = buildRecipe(best.entry, best.allPaints, best.allColors);
  return { paint: best.cand, deltaE: recipe.deltaE, recipe };
}

function binom(n, k) {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}
