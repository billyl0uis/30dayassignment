// Measurements of the solid. Everything here reads the voxel volume (and the
// mesh only to refine one number), so it works for any shape the tools make.

import { MATERIAL, STABILITY, annealHours } from './config.js';
import { edt3, BIG } from './edt.js';


export function analyze(vol, mesh) {
  const mass = massProperties(vol);
  const interior = interiorDistance(vol);
  const thickest = thickestPoint(vol, interior, mesh.positions);
  const support = supportPolygon(vol);
  const tip = tipAngle(mass.com, support);
  vol.interior = interior; // kept for the thick-to-thin check (step 5)
  return {
    volume: mass.volume,
    weight: mass.volume * MATERIAL.density,
    com: mass.com,
    thickest,
    annealHours: annealHours(thickest.diameter),
    support,
    tip,
  };
}

// ── Volume and centre of mass ───────────────────────────────────────────────
// Each voxel counts as partly inside, by how far its centre is from the
// surface relative to the voxel size. Uniform density is assumed: coloured
// glass is close enough in density to clear that it doesn't move the COM.
function massProperties(vol) {
  const { n, h, origin, sdf } = vol;
  let v = 0, sx = 0, sy = 0, sz = 0, idx = 0;
  for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++, idx++) {
    const f = 0.5 - sdf[idx] / h;
    if (f <= 0) continue;
    const w = f >= 1 ? 1 : f;
    v += w; sx += w * i; sy += w * j; sz += w * k;
  }
  if (!v) return { volume: 0, com: null };
  return {
    volume: v * h * h * h,
    com: [origin[0] + (sx / v) * h, origin[1] + (sy / v) * h, origin[2] + (sz / v) * h],
  };
}

// ── Interior distance field ─────────────────────────────────────────────────
// Exact Euclidean distance transform (Felzenszwalb–Huttenlocher, one 1-D pass
// per axis) from every inside voxel to the nearest outside voxel. The tools
// warp the SDF so it stops being a true distance deep inside; the EDT is
// rebuilt from inside/outside alone, so it stays honest.
// Result: squared distance in voxel units, over the bounding box of the glass.
function interiorDistance(vol) {
  const { n, sdf } = vol;
  let lo = [n, n, n], hi = [-1, -1, -1], idx = 0;
  for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++, idx++) {
    if (sdf[idx] >= 0) continue;
    if (i < lo[0]) lo[0] = i; if (i > hi[0]) hi[0] = i;
    if (j < lo[1]) lo[1] = j; if (j > hi[1]) hi[1] = j;
    if (k < lo[2]) lo[2] = k; if (k > hi[2]) hi[2] = k;
  }
  if (hi[0] < 0) return null;
  for (let a = 0; a < 3; a++) { lo[a] = Math.max(0, lo[a] - 1); hi[a] = Math.min(n - 1, hi[a] + 1); }
  const X = hi[0] - lo[0] + 1, Y = hi[1] - lo[1] + 1, Z = hi[2] - lo[2] + 1;
  const d = new Float64Array(X * Y * Z);
  for (let k = 0; k < Z; k++) for (let j = 0; j < Y; j++) for (let i = 0; i < X; i++) {
    d[i + X * (j + Y * k)] = sdf[vol.index(i + lo[0], j + lo[1], k + lo[2])] < 0 ? BIG : 0;
  }
  edt3(d, X, Y, Z);
  return { d2: d, lo, dims: [X, Y, Z] };
}

// ── Thickest point ──────────────────────────────────────────────────────────
// The largest sphere that fits inside = the maximum of the interior distance.
// Voxel-to-voxel distance is only good to about half a voxel, so the best few
// candidates are re-measured against the actual surface (mesh vertices, which
// lie on the surface at sub-voxel spacing) and the largest wins.
function thickestPoint(vol, interior, positions) {
  if (!interior) return { diameter: 0, centre: null };
  const { d2, lo, dims: [X, Y] } = interior;
  let max = 0;
  for (let i = 0; i < d2.length; i++) if (d2[i] > max) max = d2[i];
  const cutoff = (Math.sqrt(max) - 1.5) ** 2;
  const cands = [];
  for (let i = 0; i < d2.length; i++) if (d2[i] >= cutoff) cands.push([d2[i], i]);
  cands.sort((a, b) => b[0] - a[0]);
  cands.length = Math.min(cands.length, 96);

  const { h, origin } = vol;
  const radius = (c) => {
    let r2 = Infinity;
    for (let p = 0; p < positions.length; p += 3) {
      const dx = positions[p] - c[0], dy = positions[p + 1] - c[1], dz = positions[p + 2] - c[2];
      const q = dx * dx + dy * dy + dz * dz;
      if (q < r2) r2 = q;
    }
    return Math.sqrt(r2);
  };
  let best = { r: 0, c: null };
  for (const [, id] of cands) {
    const i = id % X, j = ((id / X) | 0) % Y, k = (id / (X * Y)) | 0;
    const c = [origin[0] + (i + lo[0]) * h, origin[1] + (j + lo[1]) * h, origin[2] + (k + lo[2]) * h];
    const r = radius(c);
    if (r > best.r) best = { r, c };
  }
  if (!best.c) return { diameter: 0, centre: null };

  // The true centre usually falls between voxels. Pattern search: try a step
  // along each of the 26 neighbour directions, keep any move that grows the
  // empty sphere, halve the step when none does.
  const dirs = [];
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
    if (a || b || c) { const l = Math.hypot(a, b, c); dirs.push([a / l, b / l, c / l]); }
  }
  let step = h;
  while (step > h / 64) {
    let moved = false;
    for (const d of dirs) {
      const c = [best.c[0] + d[0] * step, best.c[1] + d[1] * step, best.c[2] + d[2] * step];
      if (vol.sample(c[0], c[1], c[2]) >= 0) continue; // must stay inside the glass
      const r = radius(c);
      if (r > best.r + 1e-6) { best = { r, c }; moved = true; }
    }
    if (!moved) step /= 2;
  }
  return { diameter: 2 * best.r, centre: best.c };
}

// ── Support polygon ─────────────────────────────────────────────────────────
// Columns of glass whose underside sits on the floor, then their 2-D convex
// hull in the x–z plane. The floor is grid layer j = 2 (y = 0); the surface
// height in each column is found by interpolating the SDF between layers 2
// and 3, and counts as touching within STABILITY.contactTolCm. A tolerance
// band instead would give a sphere a fake flat spot and a fake tip angle.
// Each touching column contributes its square footprint.
function supportPolygon(vol) {
  const { n, h, origin, sdf } = vol;
  const tol = STABILITY.contactTolCm;
  const pts = [];
  for (let k = 1; k < n - 1; k++) for (let i = 1; i < n - 1; i++) {
    const x = origin[0] + i * h, z = origin[2] + k * h;
    const s2 = sdf[vol.index(i, 2, k)], s3 = sdf[vol.index(i, 3, k)];
    const touching = s2 < 0 || (s3 < 0 && (h * s2) / (s2 - s3) <= tol);
    if (touching) {
      const e = h / 2;
      pts.push([x - e, z - e], [x + e, z - e], [x + e, z + e], [x - e, z + e]);
    }
  }
  if (!pts.length) return { hull: [], contactCount: 0, area: 0 };
  const hull = convexHull(pts);
  let area = 0;
  for (let a = 0; a < hull.length; a++) {
    const p = hull[a], q = hull[(a + 1) % hull.length];
    area += p[0] * q[1] - q[0] * p[1];
  }
  return { hull, contactCount: pts.length / 4, area: Math.abs(area) / 2 };
}

// Andrew's monotone chain; returns counter-clockwise hull in (x, z).
function convexHull(points) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

// ── Tip angle ───────────────────────────────────────────────────────────────
// How far the piece can lean before its centre of mass passes over the edge
// of its base: atan(horizontal distance from the COM's floor projection to the
// nearest hull edge / COM height). Negative means the COM is already outside
// the base, i.e. it falls over.
function tipAngle(com, support) {
  if (!com || support.hull.length < 3) return { deg: null, edge: null };
  const P = [com[0], com[2]], hull = support.hull;
  let dmin = Infinity, edge = null, inside = true;
  for (let a = 0; a < hull.length; a++) {
    const p = hull[a], q = hull[(a + 1) % hull.length];
    const ex = q[0] - p[0], ez = q[1] - p[1];
    if (ex * (P[1] - p[1]) - ez * (P[0] - p[0]) < 0) inside = false; // right of a CCW edge
    const t = Math.max(0, Math.min(1, ((P[0] - p[0]) * ex + (P[1] - p[1]) * ez) / (ex * ex + ez * ez)));
    const cx = p[0] + t * ex, cz = p[1] + t * ez;
    const d = Math.hypot(P[0] - cx, P[1] - cz);
    if (d < dmin) { dmin = d; edge = [cx, cz]; }
  }
  const deg = Math.atan2(dmin, Math.max(com[1], 1e-6)) * 180 / Math.PI;
  return { deg: inside ? deg : -deg, edge };
}
