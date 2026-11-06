// The machinery every tool is built from:
//   warp       — move glass by a displacement field (inverse mapping)
//   transform  — rigid move of the whole grid (set down, grind)
//   redistance — rebuild a true distance field after a warp has stretched it
//   conserve   — restore an exact volume by thickening/thinning a chosen region
//
// Rule from the brief: only Bits, Add gather and Shears may change the amount
// of glass. Every other tool ends with conserve().

import { edt3, BIG } from './edt.js';
import { frac } from './volume.js';

export const smin = (a, b, k) => {
  const hh = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - hh * hh * k * 0.25;
};
export const smax = (a, b, k) => -smin(-a, -b, k);

// ── small vector helpers (plain [x, y, z] arrays) ──
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
// Rotate v around unit axis u by angle (Rodrigues).
export const rotate = (v, u, ang) => {
  const c = Math.cos(ang), s = Math.sin(ang), d = dot(u, v), x = cross(u, v);
  return [v[0] * c + x[0] * s + u[0] * d * (1 - c), v[1] * c + x[1] * s + u[1] * d * (1 - c), v[2] * c + x[2] * s + u[2] * d * (1 - c)];
};

// new(p) = old(p − u(p)). disp(x, y, z, out) writes u into out (leave zeros
// for no motion). Colour is carried along with nearest-voxel sampling.
// Scratch copies reused across warps; only the z-slab a warp can read from
// is refreshed, which keeps many-step tools (Pull) fast.
let scratch = null;
export function warp(vol, box, disp, maxShiftCm = null) {
  const { n } = vol;
  if (!scratch || scratch.sdf.length !== vol.sdf.length) {
    scratch = { sdf: new Float32Array(vol.sdf.length), color: new Uint8Array(vol.color.length) };
  }
  const pad = maxShiftCm === null ? n : Math.ceil(maxShiftCm / vol.h) + 2;
  const k0 = Math.max(0, box.k0 - pad), k1 = Math.min(n, box.k1 + pad + 1);
  scratch.sdf.set(vol.sdf.subarray(k0 * n * n, k1 * n * n), k0 * n * n);
  scratch.color.set(vol.color.subarray(k0 * n * n, k1 * n * n), k0 * n * n);
  const src = scratch.sdf, csrc = scratch.color;
  const u = [0, 0, 0];
  vol.forBox(box, (idx, x, y, z) => {
    u[0] = u[1] = u[2] = 0;
    disp(x, y, z, u);
    if (u[0] === 0 && u[1] === 0 && u[2] === 0) return;
    const qx = x - u[0], qy = y - u[1], qz = z - u[2];
    vol.sdf[idx] = vol.sampleArr(src, qx, qy, qz);
    vol.color[idx] = vol.nearestArr(csrc, qx, qy, qz);
  });
}

// Whole-grid rigid move: inv(x, y, z, out) writes the source position.
export function transform(vol, inv) {
  const src = vol.sdf.slice(), csrc = vol.color.slice();
  const q = [0, 0, 0];
  const all = { i0: 1, i1: vol.n - 2, j0: 1, j1: vol.n - 2, k0: 1, k1: vol.n - 2 };
  vol.forBox(all, (idx, x, y, z) => {
    inv(x, y, z, q);
    vol.sdf[idx] = vol.sampleArr(src, q[0], q[1], q[2]);
    vol.color[idx] = vol.nearestArr(csrc, q[0], q[1], q[2]);
  });
  vol.sealBoundary();
}

// Rebuild a true signed distance (clamped to ±band cm) over a box.
// Voxels next to the surface keep a first-order corrected value d / |∇d|;
// everything else gets its exact distance to those surface voxels (EDT).
export function redistance(vol, box, band = 3) {
  const { n, h, sdf } = vol;
  const m = Math.ceil(band / h), c = (v) => Math.min(n - 2, Math.max(1, v));
  const b = { i0: c(box.i0 - m), i1: c(box.i1 + m), j0: c(box.j0 - m), j1: c(box.j1 + m), k0: c(box.k0 - m), k1: c(box.k1 + m) };
  const X = b.i1 - b.i0 + 1, Y = b.j1 - b.j0 + 1, Z = b.k1 - b.k0 + 1;
  const f = new Float64Array(X * Y * Z), near = new Float32Array(X * Y * Z).fill(NaN);
  const nn = n * n;
  for (let k = 0; k < Z; k++) for (let j = 0; j < Y; j++) for (let i = 0; i < X; i++) {
    const gi = i + b.i0, gj = j + b.j0, gk = k + b.k0;
    const idx = gi + n * (gj + n * gk), s = sdf[idx], neg = s < 0;
    const l = i + X * (j + Y * k);
    const surface = (sdf[idx - 1] < 0) !== neg || (sdf[idx + 1] < 0) !== neg ||
      (sdf[idx - n] < 0) !== neg || (sdf[idx + n] < 0) !== neg ||
      (sdf[idx - nn] < 0) !== neg || (sdf[idx + nn] < 0) !== neg;
    if (surface) {
      const gx = sdf[idx + 1] - sdf[idx - 1], gy = sdf[idx + n] - sdf[idx - n], gz = sdf[idx + nn] - sdf[idx - nn];
      const g = Math.hypot(gx, gy, gz) / (2 * h);
      let d = s / Math.max(g, 0.1);
      d = Math.max(-h, Math.min(h, d));
      near[l] = d;
      f[l] = (d / h) * (d / h);
    } else f[l] = BIG;
  }
  edt3(f, X, Y, Z);
  for (let k = 0; k < Z; k++) for (let j = 0; j < Y; j++) for (let i = 0; i < X; i++) {
    const l = i + X * (j + Y * k);
    const idx = (i + b.i0) + n * ((j + b.j0) + n * (k + b.k0));
    if (!Number.isNaN(near[l])) { sdf[idx] = near[l]; continue; }
    const d = Math.min(Math.sqrt(f[l]) * h, band);
    sdf[idx] = sdf[idx] < 0 ? -d : d;
  }
}

// Restore volume V0 (cm³) by adding δ·w(p) to the field inside `box`
// (δ > 0 thins the glass there, δ < 0 thickens it), optionally never letting
// the field drop below cap(p) (keeps a paddled face flat, a crease open…).
// δ is found by bisection, since volume is monotone in δ. Returns the volume
// error left over (≈ 0 unless the region couldn't supply/absorb enough).
export function conserve(vol, V0, box, weight, cap = null) {
  const { h, sdf } = vol;
  const h3 = h * h * h;
  const idxs = [], ws = [], cs = [];
  let inBox = 0;
  vol.forBox(box, (idx, x, y, z) => {
    const w = weight(x, y, z);
    inBox += frac(sdf[idx], h);
    if (w <= 0) return;
    idxs.push(idx); ws.push(w); cs.push(cap ? cap(x, y, z) : -Infinity);
  });
  const total = vol.volumeCm3() / h3;
  const target = V0 / h3 - (total - inBox);
  const I = Int32Array.from(idxs), W = Float32Array.from(ws), C = Float32Array.from(cs);
  const base = new Float32Array(I.length);
  let fixed = inBox; // contribution of box voxels we don't touch
  for (let a = 0; a < I.length; a++) { base[a] = sdf[I[a]]; fixed -= frac(base[a], h); }
  const evalV = (d) => {
    let v = fixed;
    for (let a = 0; a < I.length; a++) v += frac(Math.max(base[a] + d * W[a], C[a]), h);
    return v;
  };
  let lo = -3, hi = 3; // cm
  if (evalV(lo) < target) hi = lo;       // can't add enough: go as far as possible
  else if (evalV(hi) > target) lo = hi;  // can't remove enough
  for (let it = 0; it < 40 && hi - lo > 1e-6; it++) {
    const mid = (lo + hi) / 2;
    if (evalV(mid) > target) lo = mid; else hi = mid;
  }
  const d = (lo + hi) / 2;
  for (let a = 0; a < I.length; a++) sdf[I[a]] = Math.max(base[a] + d * W[a], C[a]);
  return (evalV(d) - target) * h3;
}

// Smooth falloff: 1 at r = 0, 0 at r ≥ R.
export const falloff = (r, R) => { if (r >= R) return 0; const s = 1 - (r * r) / (R * R); return s * s * s; };
