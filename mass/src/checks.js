// Making-and-annealing checks. Each result:
//   { level: 'bad'|'warn'|'info'|'ok', title, detail, marks: [[x,y,z], …],
//     focus: [x,y,z] | null, show: { support?, thickest?, mount? } }
// Clicking a result in the panel highlights its marks and turns the camera to it.

import { ANNEAL, CHECKS, STABILITY } from './config.js';
import { COLORS } from './colors.js';

export function runChecks(vol, a) {
  const out = [];
  const m = vol.meta;

  // ── Anneal time ──
  if (a.annealHours > ANNEAL.warnAboveHours) {
    out.push({
      level: 'warn', title: `Long anneal (estimate ~${Math.round(a.annealHours)} h)`,
      detail: `The thickest point is ${a.thickest.diameter.toFixed(1)} cm through, and anneal time grows with the square of that. ` +
        (ANNEAL.calibrated ? '' : 'The constants are uncalibrated placeholders; see src/config.js.'),
      marks: a.thickest.centre ? [a.thickest.centre] : [], focus: a.thickest.centre, show: { thickest: true },
    });
  }

  // ── Thick-to-thin junctions ──
  const junctions = thickToThin(vol);
  if (junctions.length) {
    const worst = junctions.reduce((p, q) => (q.ratio > p.ratio ? q : p));
    out.push({
      level: 'warn',
      title: `Sudden thick-to-thin transition${junctions.length > 1 ? ` (${junctions.length} places)` : ''}`,
      detail: `Glass ${worst.thin.toFixed(1)} cm thick meets glass ${worst.thick.toFixed(1)} cm thick within ${CHECKS.overCm} cm (${worst.ratio.toFixed(1)} : 1). ` +
        'Thin parts chill fast and can crack where they join thick glass.',
      marks: junctions.map((j) => j.at), focus: worst.at, show: {},
    });
  }

  // ── Base / mount ──
  if (m.mounted) {
    out.push({
      level: 'info', title: 'Mounted on a stand', detail: 'No base needed. The rod goes in at the mount point.',
      marks: m.mountPoint ? [m.mountPoint] : [], focus: m.mountPoint, show: { mount: true },
    });
  } else {
    const problems = [];
    let focus = null, marks = [];
    if (m.puntyMark) problems.push('It is still on the punty. Set it down and grind a base, or mark it as mounted.');
    else {
      if (!m.groundBase) problems.push('The base has not been ground flat. Grind it after paddling a flat face.');
      if (m.markOnPiece) { problems.push('The punty mark is still on the piece. Grind deeper to remove it.'); marks.push(m.markOnPiece); focus = m.markOnPiece; }
      if (a.tip.deg === null) problems.push('There is no flat area touching the floor.');
      else if (a.tip.deg < 0) problems.push('The centre of mass is outside the base, so it falls over.');
      else if (a.tip.deg < STABILITY.minTipAngleDeg) problems.push(`It tips at ${a.tip.deg.toFixed(1)}°; a stable base needs at least ${STABILITY.minTipAngleDeg}°.`);
      if (!m.paddled?.length && m.groundBase) problems.push('Tip: paddle a flat face before setting down for a wider base.');
    }
    const hard = problems.filter((p) => !p.startsWith('Tip:'));
    if (hard.length) {
      out.push({ level: 'bad', title: 'No stable base', detail: problems.join(' '), marks, focus: focus || a.com, show: { support: true } });
    }
  }

  // ── Opaque colour ──
  const opaque = opaqueCentroid(vol);
  if (opaque) {
    out.push({
      level: 'info', title: 'Opaque colour won’t deepen',
      detail: 'Opaque colour blocks light, so it shows no thickness-deepening effect. Only transparent colour gets richer where the glass is thick.',
      marks: [opaque], focus: opaque, show: {},
    });
  }

  if (!out.some((c) => c.level === 'bad' || c.level === 'warn')) {
    out.unshift({ level: 'ok', title: 'Passes all checks', detail: '', marks: [], focus: null, show: {} });
  }
  return out;
}

// Thin centreline points near much thicker glass. Works on the exact
// interior distance transform from analysis (vol.interior).
//   D(p)   = distance to the surface (voxels); thickness there = 2D
//   ridge  = centreline: p's inscribed ball isn't inside a neighbour's ball
//   prune  = drop ridge points where D changes faster than maxRidgeSlope
//            along the ridge — those are convex-corner branches, not limbs
// Flag thin ridge point p if some thick ridge ball (c, Dc) comes within
// overCm of p and 2Dc ≥ ratio × 2Dp.
export function thickToThin(vol) {
  const I = vol.interior;
  if (!I) return [];
  const { d2, lo, dims: [X, Y, Z] } = I;
  const h = vol.h, XY = X * Y;
  const D = new Float32Array(d2.length);
  for (let i = 0; i < d2.length; i++) D[i] = Math.sqrt(d2[i]);

  const thin = [], thick = [];
  const maxThinV = CHECKS.maxThinCm / h / 2, minThickV = CHECKS.minThickCm / h / 2;
  for (let k = 1; k < Z - 1; k++) for (let j = 1; j < Y - 1; j++) for (let i = 1; i < X - 1; i++) {
    const p = i + X * (j + Y * k), d = D[p];
    if (d < 1.5) continue;
    let ridge = true;
    for (let dz = -1; dz <= 1 && ridge; dz++) for (let dy = -1; dy <= 1 && ridge; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy && !dz) continue;
      if (D[p + dx + X * dy + XY * dz] >= d + 0.8 * Math.hypot(dx, dy, dz)) { ridge = false; break; }
    }
    if (!ridge) continue;
    const gx = D[p + 1] - D[p - 1], gy = D[p + X] - D[p - X], gz = D[p + XY] - D[p - XY];
    if (0.5 * Math.hypot(gx, gy, gz) > CHECKS.maxRidgeSlope) continue;
    if (d <= maxThinV) thin.push([i, j, k, d]);
    if (d >= minThickV && (i + j + k) % 2 === 0) thick.push([i, j, k, d]);
  }
  thick.sort((a, b) => b[3] - a[3]);

  const reach = CHECKS.overCm / h;
  const hits = [];
  for (const [i, j, k, d] of thin) {
    for (const [ci, cj, ck, dc] of thick) {
      if (dc < CHECKS.ratio * d) break; // sorted: nothing thicker remains
      const dist = Math.hypot(ci - i, cj - j, ck - k);
      if (dist > dc + reach) continue;
      // Junction ≈ where the thick ball's surface faces the thin part.
      const t = Math.min(1, dc / dist);
      const at = [ci + (i - ci) * t, cj + (j - cj) * t, ck + (k - ck) * t]
        .map((v, a) => vol.origin[a] + (v + lo[a]) * h);
      hits.push({ at, ratio: dc / d, thin: 2 * d * h, thick: 2 * dc * h });
      break;
    }
  }
  // Merge hits within 2.5 cm into one junction (one ring round a limb), keeping the worst.
  const merged = [];
  for (const hit of hits.sort((a, b) => b.ratio - a.ratio)) {
    if (!merged.some((m) => Math.hypot(m.at[0] - hit.at[0], m.at[1] - hit.at[1], m.at[2] - hit.at[2]) < 2.5)) merged.push(hit);
  }
  return merged;
}

function opaqueCentroid(vol) {
  const opaqueIdx = new Set();
  vol.meta.palette.forEach((k, i) => { if (COLORS[k]?.kind === 'opaque') opaqueIdx.add(i + 1); });
  if (!opaqueIdx.size) return null;
  const { n, h, origin, sdf, color } = vol;
  let c = 0, sx = 0, sy = 0, sz = 0, idx = 0;
  for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++, idx++) {
    if (sdf[idx] >= 0 || !opaqueIdx.has(color[idx])) continue;
    c++; sx += i; sy += j; sz += k;
  }
  return c ? [origin[0] + (sx / c) * h, origin[1] + (sy / c) * h, origin[2] + (sz / c) * h] : null;
}
