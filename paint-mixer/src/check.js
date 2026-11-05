// Check my mix: compare a photographed mix to the target and say how to fix it.
// Pure functions (no DOM) so they can be tested in Node.

import { labToLch, deltaE2000, labToHex } from './color.js';
import { paintToColor, mixParts, colorToLab } from './mixer.js';
import { deltaELabel } from './solver.js';

// Painters call orange-red "warm" and blue "cool". In CIELAB the warmest hue
// sits near 60° (between red and yellow); the coolest is opposite it, ~240°.
export const WARM_HUE = 60;
// How warm a hue is: 1 at the warm pole, -1 at the cool pole.
const warmth = (h) => Math.cos(((h - WARM_HUE) * Math.PI) / 180);
// Below this warmth change a hue move is neither warmer nor cooler (e.g. red→yellow
// or teal→blue swing around a pole), so we name the hue instead.
const WARMTH_TIE = 0.08;
// Below this chroma a color is near-grey and its hue angle is meaningless.
export const NEUTRAL_CHROMA = 5;

// How big a difference must be before we mention it, and the wording per size.
// Units are Lab (lightness L*, chroma C*, hue difference ΔH*).
const STEPS = [
  { min: 10, word: 'much' },
  { min: 4, word: '' },
  { min: 1.5, word: 'a little' },
];

// Upper bound of each hue family, in CIELAB hue degrees.
const HUE_NAMES = [
  [20, 'pink'], [50, 'red'], [80, 'orange'], [105, 'yellow'], [140, 'yellow-green'],
  [190, 'green'], [230, 'teal'], [290, 'blue'], [330, 'violet'], [360, 'pink'],
];
export function hueName(h) {
  const hh = ((h % 360) + 360) % 360;
  return HUE_NAMES.find(([max]) => hh < max)[1];
}

/** Signed shortest angle from a to b, in -180..180. */
const angleDiff = (a, b) => ((((b - a) % 360) + 540) % 360) - 180;

function amountWord(size) {
  const s = STEPS.find((x) => size >= x.min);
  return s ? s.word : null; // null = too small to mention
}

/**
 * Plain-language directions for moving `mixLab` toward `targetLab`.
 * @returns {{ deltaE: number, label: string, directions: {kind, text, size}[] }}
 *   directions are sorted biggest first; empty when the mix already matches.
 */
export function mixDirections(mixLab, targetLab) {
  const deltaE = deltaE2000(mixLab, targetLab);
  const [Lm, Cm, hm] = labToLch(mixLab);
  const [Lt, Ct, ht] = labToLch(targetLab);
  const out = [];

  const dL = Lt - Lm;
  const wL = amountWord(Math.abs(dL));
  if (wL !== null) out.push({ kind: 'lightness', size: Math.abs(dL), text: `${wL} ${dL > 0 ? 'lighter' : 'darker'}` });

  const dC = Ct - Cm;
  const wC = amountWord(Math.abs(dC));
  if (wC !== null) {
    out.push({
      kind: 'chroma',
      size: Math.abs(dC),
      // a near-grey mix has no hue to compare, so say which color it needs
      text: dC > 0
        ? `${wC} more saturated (${Cm < NEUTRAL_CHROMA ? `toward ${hueName(ht)}` : 'more intense'})`
        : `${wC} less saturated (greyer, more muted)`,
    });
  }

  // Hue only means something when both colors actually have a hue.
  if (Cm >= NEUTRAL_CHROMA && Ct >= NEUTRAL_CHROMA) {
    const dh = angleDiff(hm, ht);
    const dH = 2 * Math.sqrt(Cm * Ct) * Math.sin(((dh / 2) * Math.PI) / 180); // metric hue difference
    const wH = amountWord(Math.abs(dH));
    if (wH !== null) {
      const dw = warmth(ht) - warmth(hm);
      const toward = hueName(ht) !== hueName(hm) ? ` (toward ${hueName(ht)})` : '';
      const text = Math.abs(dw) < WARMTH_TIE ? `${wH} more ${hueName(ht)}` : `${wH} ${dw > 0 ? 'warmer' : 'cooler'}${toward}`;
      out.push({ kind: 'hue', size: Math.abs(dH), text });
    }
  }

  for (const d of out) d.text = cap(d.text.trim());
  out.sort((a, b) => b.size - a.size);
  return { deltaE, label: deltaELabel(deltaE), directions: out };
}

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');

/**
 * Which single palette paint, added as `addParts` part(s) to the current mix,
 * brings it closest to the target.
 *
 * spectral.js weights each paint by parts² x strength² x luminance, so a mix
 * can't be treated as just another paint without error. Two models:
 *  - recipe known (preferred): predict recipe + 1 part X from the real paints,
 *    then add the gap seen between the photo and the recipe's prediction
 *    (that gap is the real world: brand, batch, mixing, lighting).
 *  - freehand mix: the photographed color stands in as a paint making up
 *    `mixParts` parts (rougher).
 *
 * @param {number[]} mixLab      measured color of the current mix
 * @param {number[]} targetLab
 * @param {object[]} palette     paints with lab
 * @param {{ recipe?: {paints, parts}, mixParts?: number, addParts?: number }} opts
 * @returns {{ before, model: 'recipe'|'freehand', options: {paint, lab, hex, deltaE, gain}[] }}
 *   options sorted best first; only those that improve on `before`.
 */
export function suggestAddition(mixLab, targetLab, palette, { recipe = null, mixParts: n = 4, addParts = 1 } = {}) {
  const before = deltaE2000(mixLab, targetLab);
  const model = recipe?.paints?.length ? 'recipe' : 'freehand';
  const predict = model === 'recipe' ? recipePredictor(mixLab, recipe, addParts) : freehandPredictor(mixLab, n, addParts);
  const options = [];
  for (const paint of palette) {
    if (!Array.isArray(paint.lab)) continue;
    const lab = predict(paint);
    const dE = deltaE2000(lab, targetLab);
    if (dE < before - 0.05) options.push({ paint, lab, hex: labToHex(lab), deltaE: dE, gain: before - dE });
  }
  options.sort((a, b) => a.deltaE - b.deltaE);
  return { before, model, options };
}

function recipePredictor(mixLab, recipe, addParts) {
  const paints = recipe.paints;
  const parts = recipe.parts ?? paints.map((p) => p.parts);
  const colors = paints.map(paintToColor); // built once, reused for every candidate
  const base = colorToLab(mixParts(colors, parts));
  const gap = mixLab.map((v, i) => v - base[i]);
  return (paint) => {
    const at = paints.findIndex((p) => p.id === paint.id);
    const cs = at >= 0 ? colors : [...colors, paintToColor(paint)];
    const pp = at >= 0 ? parts.map((v, i) => (i === at ? v + addParts : v)) : [...parts, addParts];
    const lab = colorToLab(mixParts(cs, pp));
    return lab.map((v, i) => v + gap[i]);
  };
}

function freehandPredictor(mixLab, n, addParts) {
  const mixColor = paintToColor({ name: 'your mix', lab: mixLab, tintingStrength: 1 });
  return (paint) => colorToLab(mixParts([mixColor, paintToColor(paint)], [n, addParts]));
}

/** Default size of "the current mix" in parts: the recipe's total, or 4. */
export function defaultMixParts(recipe) {
  const total = recipe?.parts?.reduce((s, p) => s + p, 0);
  return total > 0 ? total : 4;
}

