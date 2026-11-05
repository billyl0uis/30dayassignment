// Swatch capture math: sampling a photo, white-balancing against the paper,
// and fitting tinting strength from a 1:1 tint with white. No DOM here -
// functions take ImageData-like objects ({ width, height, data }) so they can
// be tested in Node with synthetic images.

import { srgbToLinear, linearToSrgb, linearRgbToLab, labToLch, deltaE2000 } from './color.js';
import { predictMix } from './mixer.js';

export const SAMPLE_SIZE = 9; // the spec's 9x9 average

/**
 * Linear-light reflectance we assume the white paper has. Paper is never a
 * perfect diffuser; ~0.9 (L* ≈ 96) is typical of white drawing paper, and keeps
 * a bright titanium white swatch from clipping above the paper.
 */
export const PAPER_REFLECTANCE = 0.9;

/**
 * Average a size x size block centred on (x, y), in linear light (averaging
 * gamma-encoded values would bias toward dark). Edges are clamped.
 * @returns {{ linear: number[], rgb: number[], spread: number, clipped: boolean }}
 *   linear: mean linear RGB 0..1; rgb: that mean re-encoded 0..255;
 *   spread: max channel standard deviation in 0..255 units (texture/edges);
 *   clipped: some pixel had a channel at 255 (overexposed).
 */
export function sampleAverage(img, x, y, size = SAMPLE_SIZE) {
  const half = Math.floor(size / 2);
  const cx = Math.round(x), cy = Math.round(y);
  const sum = [0, 0, 0], sumE = [0, 0, 0], sumE2 = [0, 0, 0];
  let n = 0, clipped = false;
  for (let dy = -half; dy <= half; dy++) {
    for (let dx = -half; dx <= half; dx++) {
      const px = Math.min(img.width - 1, Math.max(0, cx + dx));
      const py = Math.min(img.height - 1, Math.max(0, cy + dy));
      const i = (py * img.width + px) * 4;
      for (let c = 0; c < 3; c++) {
        const v = img.data[i + c];
        if (v >= 255) clipped = true;
        sum[c] += srgbToLinear(v / 255);
        sumE[c] += v;
        sumE2[c] += v * v;
      }
      n++;
    }
  }
  const linear = sum.map((s) => s / n);
  // spread on encoded values: easier to reason about as "pixel noise"
  const spread = Math.max(...[0, 1, 2].map((c) => Math.sqrt(Math.max(0, sumE2[c] / n - (sumE[c] / n) ** 2))));
  return { linear, rgb: linear.map((v) => linearToSrgb(v) * 255), spread, clipped };
}

/**
 * White-balance a linear RGB sample using the paper's linear RGB.
 * Result is linear RGB in 0..1 as if lit by a neutral light at an exposure
 * where the paper reflects PAPER_REFLECTANCE.
 * @param {number[]} sampleLinear  mean linear RGB of the swatch (0..1)
 * @param {number[]} paperLinear   mean linear RGB of the white paper (0..1)
 * @returns {number[]} corrected linear RGB
 */
export function whiteBalance(sampleLinear, paperLinear) {
  // Von Kries: one gain per channel, chosen so the paper lands at
  // PAPER_REFLECTANCE. Dividing by the paper cancels both the light's color
  // and the exposure. A tiny floor avoids dividing by zero on an all-black
  // channel (paperProblems already warns that such a "paper" is too dark).
  // Values above 1 (swatch brighter than paper) are left for the Lab
  // conversion rather than clipped, so they still measure as "brighter".
  return sampleLinear.map((c, i) => (c / Math.max(paperLinear[i], 1e-4)) * PAPER_REFLECTANCE);
}

/** Lab of a swatch sample after white balance. */
export function measureLab(sampleLinear, paperLinear) {
  return linearRgbToLab(whiteBalance(sampleLinear, paperLinear));
}

/**
 * Is this plausibly white paper? Returns a list of human-readable problems
 * (empty when it looks fine). Checked on the raw sample, before correction.
 */
export function paperProblems(paper) {
  const problems = [];
  const [L, C] = labToLch(linearRgbToLab(paper.linear));
  if (paper.clipped) problems.push('The paper is overexposed (pure white pixels). Retake the photo a little darker so colors are measured correctly.');
  if (L < 35) problems.push('This spot is quite dark for white paper. Make sure you tapped the paper, and that it is evenly lit.');
  if (C > 25) problems.push('This spot is strongly colored for white paper. Make sure you tapped the paper, not the swatch.');
  if (paper.spread > 18) problems.push('This spot is uneven (an edge, shadow or texture). Tap a plain area of paper.');
  return problems;
}

export function swatchProblems(swatch) {
  const problems = [];
  if (swatch.clipped) problems.push('Part of this sample is overexposed. Retake the photo a little darker.');
  if (swatch.spread > 18) problems.push('This sample is uneven (an edge, brush texture or glare). Tap the middle of a flat area.');
  return problems;
}

/**
 * Fit tintingStrength so spectral.js's predicted 1:1 mix of `whitePaint` and the
 * paint matches the measured tint as closely as possible (CIEDE2000).
 * Coarse log-spaced scan, then golden-section refinement around the best.
 * @param {number[]} paintLab   measured full-strength color
 * @param {object}   whitePaint { lab, tintingStrength? } - the white used for the tint
 * @param {number[]} tintLab    measured 1:1 tint
 * @returns {{ tintingStrength: number, deltaE: number }}
 */
export function fitTintingStrength(paintLab, whitePaint, tintLab, { min = 0.05, max = 10 } = {}) {
  const white = { lab: whitePaint.lab, tintingStrength: whitePaint.tintingStrength ?? 1 };
  const err = (logTs) => deltaE2000(predictMix([white, { lab: paintLab, tintingStrength: Math.exp(logTs) }], [1, 1]).lab, tintLab);

  const lo = Math.log(min), hi = Math.log(max), steps = 48;
  let bestI = 0, bestE = Infinity;
  for (let i = 0; i <= steps; i++) {
    const e = err(lo + ((hi - lo) * i) / steps);
    if (e < bestE) (bestE = e), (bestI = i);
  }
  let a = lo + ((hi - lo) * Math.max(0, bestI - 1)) / steps;
  let b = lo + ((hi - lo) * Math.min(steps, bestI + 1)) / steps;
  const g = (Math.sqrt(5) - 1) / 2;
  let c = b - g * (b - a), d = a + g * (b - a);
  let ec = err(c), ed = err(d);
  for (let k = 0; k < 40; k++) {
    if (ec < ed) (b = d), (d = c), (ed = ec), (c = b - g * (b - a)), (ec = err(c));
    else (a = c), (c = d), (ec = ed), (d = a + g * (b - a)), (ed = err(d));
  }
  const logTs = (a + b) / 2;
  const ts = Math.exp(logTs);
  return { tintingStrength: Math.round(ts * 100) / 100, deltaE: err(logTs) };
}
