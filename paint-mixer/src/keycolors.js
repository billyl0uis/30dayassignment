// Key colors of a reference photo: k-means clustering in CIELAB.
// Pure functions on ImageData-like objects ({ width, height, data }).

import { rgbToLab, labToHex, deltaE2000 } from './color.js';

export const MAX_KEY_COLORS = 8;
export const MIN_KEY_COLORS = 5;
const MERGE_DELTA_E = 6; // clusters closer than this look like the same color
// centre gap < 2.8 x internal spread => one noisy color, not two. Measured on
// noisy test images: noise-split halves sit at 2.2-2.4, the closest genuinely
// different colors at 3.3, and the two ends of a smooth gradient at ~3.5.
const SPLIT_FACTOR = 2.8;

/** Small seeded RNG (mulberry32) so the same photo always gives the same chips. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/** Evenly spaced pixel sample (about maxSamples points), skipping transparent pixels. */
export function samplePixels(img, maxSamples = 6000) {
  const total = img.width * img.height;
  const step = Math.max(1, Math.sqrt(total / maxSamples));
  const pts = [];
  for (let y = step / 2; y < img.height; y += step) {
    for (let x = step / 2; x < img.width; x += step) {
      const px = Math.floor(x), py = Math.floor(y);
      const i = (py * img.width + px) * 4;
      if (img.data[i + 3] < 128) continue;
      pts.push({ lab: rgbToLab([img.data[i], img.data[i + 1], img.data[i + 2]]), x: px, y: py });
    }
  }
  return pts;
}

/** Root-mean-square distance of a cluster's members from its centre (Lab units). */
function rmsSpread(cl) {
  let sum = 0;
  for (const m of cl.members) sum += dist2(m.lab, cl.lab);
  return Math.sqrt(sum / cl.members.length);
}

/** Plain k-means (Euclidean in Lab - CIEDE2000 has no mean, so it's used only for merging). */
export function kmeans(points, k, { seed = 1, maxIter = 25 } = {}) {
  const rand = rng(seed);
  k = Math.min(k, points.length);
  if (k === 0) return [];

  // k-means++ initialisation: spread starting centres out
  const centers = [points[Math.floor(rand() * points.length)].lab.slice()];
  const d = new Float64Array(points.length).fill(Infinity);
  while (centers.length < k) {
    let sum = 0;
    for (let i = 0; i < points.length; i++) {
      d[i] = Math.min(d[i], dist2(points[i].lab, centers[centers.length - 1]));
      sum += d[i];
    }
    if (sum === 0) break; // fewer distinct colors than k
    let r = rand() * sum, i = 0;
    while ((r -= d[i]) > 0 && i < points.length - 1) i++;
    centers.push(points[i].lab.slice());
  }

  const assign = new Int32Array(points.length);
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    for (let i = 0; i < points.length; i++) {
      let best = 0, bd = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const dd = dist2(points[i].lab, centers[c]);
        if (dd < bd) (bd = dd), (best = c);
      }
      if (assign[i] !== best) {
        assign[i] = best;
        changed = true;
      }
    }
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < points.length; i++) {
      const s = sums[assign[i]], l = points[i].lab;
      s[0] += l[0]; s[1] += l[1]; s[2] += l[2]; s[3]++;
    }
    sums.forEach((s, c) => { if (s[3]) centers[c] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]; });
    if (!changed && iter > 0) break;
  }

  return centers.map((lab, c) => {
    const members = [];
    for (let i = 0; i < points.length; i++) if (assign[i] === c) members.push(points[i]);
    return { lab, members };
  }).filter((cl) => cl.members.length);
}

/**
 * 5-8 key colors, biggest first. A photo with only a few distinct colors
 * returns fewer rather than near-duplicate chips.
 * @returns {{ lab, hex, share, x, y }[]}  x, y: a real pixel close to the color (for the marker)
 */
export function extractKeyColors(img, { k = MAX_KEY_COLORS, seed = 1, maxSamples = 6000 } = {}) {
  const pts = samplePixels(img, maxSamples);
  if (!pts.length) return [];
  let clusters = kmeans(pts, k, { seed });

  // Merge clusters that are really one color. Two rules, closest pair first:
  //  - statistically one color: the centres are closer than the spread inside
  //    the clusters (k-means splits one noisy color in two; a smooth gradient's
  //    two ends stay apart because their gap is larger than their spread);
  //  - looks alike (ΔE00 < MERGE_DELTA_E) while there are more than MIN_KEY_COLORS,
  //    or practically identical (ΔE00 < 2) at any count.
  clusters = clusters.map((cl) => ({ ...cl, rms: rmsSpread(cl) }));
  for (;;) {
    let best = null;
    for (let i = 0; i < clusters.length; i++) for (let j = i + 1; j < clusters.length; j++) {
      const a = clusters[i], b = clusters[j];
      const d = Math.sqrt(dist2(a.lab, b.lab));
      const dE = deltaE2000(a.lab, b.lab);
      // min, not max: a big merged cluster has a big spread, and comparing
      // against it would swallow its neighbours one by one (a gradient would
      // collapse to a single chip). Noise-split halves have similar spreads.
      const inseparable = d < SPLIT_FACTOR * Math.min(a.rms, b.rms);
      const alike = dE < (clusters.length > MIN_KEY_COLORS ? MERGE_DELTA_E : 2);
      if ((inseparable || alike) && (!best || d < best.d)) best = { i, j, d };
    }
    if (!best) break;
    const a = clusters[best.i], b = clusters[best.j];
    const n = a.members.length + b.members.length;
    const merged = { lab: a.lab.map((v, c) => (v * a.members.length + b.lab[c] * b.members.length) / n), members: a.members.concat(b.members) };
    merged.rms = rmsSpread(merged);
    clusters.splice(best.j, 1);
    clusters[best.i] = merged;
  }

  return clusters
    .map((cl) => {
      let rep = cl.members[0], rd = Infinity;
      for (const m of cl.members) {
        const dd = dist2(m.lab, cl.lab);
        if (dd < rd) (rd = dd), (rep = m);
      }
      return { lab: cl.lab, hex: labToHex(cl.lab), share: cl.members.length / pts.length, x: rep.x, y: rep.y };
    })
    .sort((a, b) => b.share - a.share);
}
