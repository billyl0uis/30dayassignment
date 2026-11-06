// Every change to the glass is an "op": a plain, serialisable object.
// runOp() applies one to a volume. History stores the ops plus the voxel
// regions they changed, so undo/redo is instant and a preset can be scrubbed.

import { Volume, frac } from './volume.js';
import {
  smin, smax, sub, add, scale, dot, cross, len, norm, rotate, falloff,
  warp, transform, redistance, conserve,
} from './deform.js';

// Tools that must not change the amount of glass.
export const CONSERVES = new Set(['pull', 'pinch', 'twist', 'paddle', 'sag', 'setDown']);

export const LABELS = {
  gather: 'Gather', addGather: 'Add gather', testSphere: 'Calibration sphere', testWedge: 'Calibration wedge',
  pull: 'Pull', pinch: 'Pinch', twist: 'Twist', paddle: 'Paddle', bits: 'Bit', color: 'Colour',
  shears: 'Shears', sag: 'Sag', setDown: 'Set down', grind: 'Grind base',
};

export const OPS = {
  // ── Starting glass ────────────────────────────────────────────────────────
  // A fresh gather on the end of a punty coming in along −x. Hot glass hangs,
  // so it's a sphere smooth-unioned with a lower, smaller one: mass below the
  // punty axis, drifting slightly away from it.
  gather(vol, { diameter = 8 }) {
    const r = diameter / 2;
    const cx = 0, cy = Math.max(r * 1.6, 9), cz = 0;
    const droop = 0.5 * r;
    vol.map((x, y, z) => {
      const a = Math.hypot(x - cx, y - cy, z - cz) - r * 0.92;
      const b = Math.hypot(x - (cx + 0.12 * r), y - (cy - droop), z - cz) - r * 0.8;
      return smin(a, b, r * 0.7);
    });
    vol.color.fill(0);
    vol.meta = { palette: [], paddled: [], puntyAxis: { y: cy, z: cz } };
  },

  // Gathering again coats the piece in a new layer: offset the distance field.
  addGather(vol, { thickness = 0.8 }) {
    vol.map((x, y, z, d) => d - thickness);
  },

  testSphere(vol, { diameter = 8 }) {
    const r = diameter / 2;
    vol.map((x, y, z) => Math.hypot(x, y - r, z) - r);
    vol.color.fill(0);
    vol.meta = { palette: [], paddled: [], onFloor: true };
  },

  testWedge(vol, { length = 16, height = 5, width = 7 }) {
    const x0 = -length / 2, x1 = length / 2, hyp = Math.hypot(length, height);
    vol.map((x, y, z) => Math.max(-y, (y * length - height * (x - x0)) / hyp, Math.abs(z) - width / 2, x - x1, x0 - x));
    vol.color.fill(0);
    vol.meta = { palette: [], paddled: [], onFloor: true };
  },

  // ── Pull ──────────────────────────────────────────────────────────────────
  // Grab the surface at `a` and draw it out to `b`. Done as many small drags,
  // each moving a shrinking blob of glass a little further, so the trail
  // stretches into a tapering limb. Then the glass it came from is thinned
  // until the volume is back where it started.
  pull(vol, { a, b, radius = 1.2, taper = 0.35 }) {
    const V0 = vol.volumeCm3();
    const d = sub(b, a), L = len(d);
    if (L < 1e-3) return;
    const dir = scale(d, 1 / L);
    const N = Math.max(1, Math.ceil(L / (0.2 * radius)));
    const step = scale(d, 1 / N);
    // The blob sits half inside the glass so it carries a full load of glass,
    // and its core moves rigidly (flat-topped falloff).
    const c0 = sub(a, scale(dir, 0.5 * radius));
    const core = (s) => (s < 0.45 ? 1 : falloff(s - 0.45, 0.55));
    for (let k = 0; k < N; k++) {
      // Inverse mapping: weight around where the blob is going, so the point
      // at the new centre takes exactly the glass from the old centre.
      const c = add(c0, scale(step, k + 1));
      const r = radius * (1 - (1 - taper) * ((k + 1) / N));
      const box = vol.box(sub(c, step), c, r + 0.5);
      warp(vol, box, (x, y, z, out) => {
        const w = core(Math.hypot(x - c[0], y - c[1], z - c[2]) / r);
        if (w > 0) { out[0] = step[0] * w; out[1] = step[1] * w; out[2] = step[2] * w; }
      }, len(step));
    }
    const all = vol.box([Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])],
      [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])], 3 * radius + 1);
    redistance(vol, all);
    // Thin the source: a soft region around the grab point, behind the limb.
    const Rs = 2.5 * radius;
    const src = vol.box(a, a, Rs);
    const err = conserve(vol, V0, src, (x, y, z) => {
      const q = [x - a[0], y - a[1], z - a[2]];
      const along = dot(q, dir);
      const behind = Math.min(1, Math.max(0, (0.3 * radius - along) / (0.6 * radius)));
      return falloff(len(q), Rs) * behind;
    });
    if (Math.abs(err) > 0.05) conserveEverywhere(vol, V0);
  },

  // ── Pinch ─────────────────────────────────────────────────────────────────
  // Tweezer jaws come in from p1 and p2 toward each other. Each jaw is a thin
  // blade (thickness `thick`, width `width`) occupying the space behind its
  // tip. The glass they occupy is squeezed out into bulges either side of the
  // crease.
  pinch(vol, { p1, p2, width = 3, thick = 0.5, angle = 0 }) {
    const V0 = vol.volumeCm3();
    const a = norm(sub(p2, p1)), M = scale(add(p1, p2), 0.5), gap = len(sub(p2, p1));
    const ref = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const n = rotate(norm(sub(ref, scale(a, dot(a, ref)))), a, angle * Math.PI / 180);
    const bd = cross(a, n);
    const blades = (x, y, z) => {
      const q = [x - M[0], y - M[1], z - M[2]];
      const slab = Math.max(Math.abs(dot(q, n)) - thick / 2, Math.abs(dot(q, bd)) - width / 2);
      const s1 = dot([x - p1[0], y - p1[1], z - p1[2]], a);  // ≤ 0 behind jaw 1
      const s2 = -dot([x - p2[0], y - p2[1], z - p2[2]], a); // ≤ 0 behind jaw 2
      return Math.min(Math.max(slab, s1, -s1 - 8), Math.max(slab, s2, -s2 - 8));
    };
    const box = vol.pieceBox(1);
    if (!box) return;
    vol.forBox(box, (idx, x, y, z) => { vol.sdf[idx] = smax(vol.sdf[idx], -blades(x, y, z), thick * 0.6); });
    redistance(vol, box);
    const Rb = gap / 2 + width / 2 + 1.5;
    const err = conserve(vol, V0, vol.box(M, M, Rb), (x, y, z) => {
      const q = [x - M[0], y - M[1], z - M[2]];
      const off = Math.abs(dot(q, n));
      const side = Math.min(1, Math.max(0, (off - thick / 2) / 0.6));
      return falloff(len(q), Rb) * side;
    }, (x, y, z) => -blades(x, y, z));
    if (Math.abs(err) > 0.05) conserveEverywhere(vol, V0);
  },

  // ── Twist ─────────────────────────────────────────────────────────────────
  // Rotate the glass about the axis a→b. Before a nothing turns, past b the
  // whole end turns by `angle`, and in between the turn ramps smoothly. Each
  // slice turns rigidly, so volume is preserved by construction; conserve()
  // only mops up resampling error.
  twist(vol, { a, b, angle = 180 }) {
    const V0 = vol.volumeCm3();
    const u = norm(sub(b, a)), L = len(sub(b, a)), ang = angle * Math.PI / 180;
    const box = vol.pieceBox(1);
    if (!box || L < 1e-3) return;
    warp(vol, box, (x, y, z, out) => {
      const q = [x - a[0], y - a[1], z - a[2]];
      let s = Math.min(1, Math.max(0, dot(q, u) / L));
      s = s * s * (3 - 2 * s);
      if (s === 0) return;
      const r = rotate(q, u, -ang * s);
      out[0] = q[0] - r[0]; out[1] = q[1] - r[1]; out[2] = q[2] - r[2];
    });
    redistance(vol, box);
    conserveEverywhere(vol, V0);
  },

  // ── Paddle ────────────────────────────────────────────────────────────────
  // A flat disc (centre c, normal n pointing into the glass, radius) pushed
  // into the piece: glass in front of it is flattened, and the displaced
  // glass bulges out just behind the face, around its edge.
  paddle(vol, { c, n, radius = 5 }) {
    const V0 = vol.volumeCm3();
    n = norm(n);
    const cap = (x, y, z) => {
      const q = [x - c[0], y - c[1], z - c[2]];
      const hgt = dot(q, n), lat = len(sub(q, scale(n, hgt)));
      return lat <= radius ? -hgt : -Infinity;
    };
    const box = vol.pieceBox(1);
    if (!box) return;
    vol.forBox(box, (idx, x, y, z) => { vol.sdf[idx] = Math.max(vol.sdf[idx], cap(x, y, z)); });
    redistance(vol, box);
    const err = conserve(vol, V0, box, (x, y, z) => {
      const q = [x - c[0], y - c[1], z - c[2]];
      const hgt = dot(q, n);
      if (hgt < 0 || hgt > 4) return 0;
      const lat = len(sub(q, scale(n, hgt)));
      return Math.exp(-hgt / 1.2) * falloff(Math.max(0, lat - radius * 0.5), radius + 3);
    }, cap);
    if (Math.abs(err) > 0.05) conserveEverywhere(vol, V0, cap);
    vol.meta.paddled.push({ c, n, radius });
  },

  // ── Bits ──────────────────────────────────────────────────────────────────
  // A blob of glass dropped onto the surface at c (surface normal n). It sits
  // partly embedded and fuses with a soft fillet. Adds glass.
  bits(vol, { c, n, r = 1, color = 'clear' }) {
    n = norm(n);
    const ctr = add(c, scale(n, 0.45 * r));
    const ci = vol.colorIndex(color);
    const box = vol.box(ctr, ctr, r * 1.8);
    vol.forBox(box, (idx, x, y, z) => {
      const db = Math.hypot(x - ctr[0], y - ctr[1], z - ctr[2]) - r;
      const old = vol.sdf[idx];
      vol.sdf[idx] = smin(old, db, 0.35 * r);
      if (db < 0 && old > -0.1) vol.color[idx] = ci;
    });
  },

  // ── Colour ────────────────────────────────────────────────────────────────
  // Recolours the outer shell (`depth` cm) of glass — no glass added. Modes:
  //   layer   — the whole surface (or a patch round `at` if given)
  //   frit    — scattered speckles
  //   stripes — `count` stripes running along an axis through `centre`
  color(vol, { mode = 'layer', color = 'cobalt', depth = 0.25, at = null, radius = 2, count = 6, width = 0.3, axis = 'x', centre = [0, 0, 0], seed = 1, grain = 0.35, density = 0.35 }) {
    const ci = vol.colorIndex(color);
    const box = at ? vol.box(at, at, radius + 0.5) : vol.pieceBox(0.5);
    if (!box) return;
    const ax = axis === 'y' ? 1 : axis === 'z' ? 2 : 0;
    const u1 = (ax + 1) % 3, u2 = (ax + 2) % 3;
    vol.forBox(box, (idx, x, y, z) => {
      const d = vol.sdf[idx];
      if (d >= 0 || d < -depth) return;
      const p = [x, y, z];
      if (at && Math.hypot(x - at[0], y - at[1], z - at[2]) > radius) return;
      if (mode === 'frit') {
        if (hash3(Math.floor(x / grain), Math.floor(y / grain), Math.floor(z / grain), seed) > density) return;
      } else if (mode === 'stripes') {
        const t = (Math.atan2(p[u2] - centre[u2], p[u1] - centre[u1]) / (2 * Math.PI) + 1) * count;
        if (t - Math.floor(t) > width) return;
      }
      vol.color[idx] = ci;
    });
  },

  // ── Shears ────────────────────────────────────────────────────────────────
  // Cut along a plane; keep the side the normal points to. A smooth max
  // leaves the cut edge soft and slightly rounded. Removes glass.
  shears(vol, { c, n, round = 0.25 }) {
    n = norm(n);
    const box = vol.pieceBox(1);
    if (!box) return;
    vol.forBox(box, (idx, x, y, z) => {
      vol.sdf[idx] = smax(vol.sdf[idx], -((x - c[0]) * n[0] + (y - c[1]) * n[1] + (z - c[2]) * n[2]), round);
    });
  },

  // ── Gravity ───────────────────────────────────────────────────────────────
  // Hot glass on the punty sags: glass further from the punty mark drops
  // more. `ticks` lists each small sag so merged steps replay identically.
  sag(vol, { ticks = [] }) {
    const S = vol.meta.puntyMark;
    if (!S) return;
    const V0 = vol.volumeCm3();
    const box = vol.pieceBox(1.5);
    if (!box) return;
    const { min, max } = vol.boxWorld(box);
    let Lmax = 0;
    for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) {
      Lmax = Math.max(Lmax, Math.hypot(x - S[0], y - S[1], z - S[2]));
    }
    for (const amount of ticks) {
      warp(vol, box, (x, y, z, out) => {
        const w = Math.min(1, Math.hypot(x - S[0], y - S[1], z - S[2]) / Lmax);
        out[1] = -amount * w * Math.sqrt(w);
      });
    }
    redistance(vol, box);
    conserveEverywhere(vol, V0, (x, y, z) => -y); // never through the floor
  },

  // ── Cold work ─────────────────────────────────────────────────────────────
  // Knock the piece off the punty and stand it on the floor, either with the
  // punty end down (classic: the punty mark ends up on the base) or as it is.
  setDown(vol, { orient = 'puntyDown' }) {
    const com = centreOfMass(vol);
    if (!com) return;
    const V0 = vol.volumeCm3();
    // puntyDown: rotate +90° about z so the punty's −x end points down.
    const ang = orient === 'puntyDown' ? Math.PI / 2 : 0;
    const Z = [0, 0, 1];
    transform(vol, (x, y, z, out) => {
      const q = rotate([x - com[0], y - com[1], z - com[2]], Z, -ang);
      out[0] = q[0] + com[0]; out[1] = q[1] + com[1]; out[2] = q[2] + com[2];
    });
    const minY = lowestPoint(vol);
    const T = [-com[0], -minY, -com[2]];
    transform(vol, (x, y, z, out) => { out[0] = x - T[0]; out[1] = y - T[1]; out[2] = z - T[2]; });
    // Two resamples blur sharp edges slightly; moving glass mustn't lose any.
    redistance(vol, vol.pieceBox(0));
    conserveEverywhere(vol, V0, (x, y, z) => -y);
    const move = (p) => add(rotate(sub(p, com), Z, ang), add(com, T));
    const m = vol.meta;
    m.markOnPiece = m.puntyMark ? move(m.puntyMark) : null;
    m.puntyAxis = null; m.puntyMark = null;
    m.paddled = m.paddled.map((f) => ({ c: move(f.c), n: rotate(f.n, Z, ang), radius: f.radius }));
    m.onFloor = true;
    m.mounted = false; m.mountPoint = null;
  },

  // Grind the base flat on the wheel: take `depth` cm off the bottom, which
  // also removes a punty mark sitting there, then reseat on the floor.
  grind(vol, { depth = 0.3 }) {
    const box = vol.pieceBox(1);
    if (!box) return;
    vol.forBox(box, (idx, x, y, z) => { vol.sdf[idx] = Math.max(vol.sdf[idx], depth - y); });
    transform(vol, (x, y, z, out) => { out[0] = x; out[1] = y + depth; out[2] = z; });
    const m = vol.meta;
    if (m.markOnPiece && m.markOnPiece[1] < depth + 0.3) m.markOnPiece = null;
    else if (m.markOnPiece) m.markOnPiece = [m.markOnPiece[0], m.markOnPiece[1] - depth, m.markOnPiece[2]];
    m.groundBase = true;
  },
};

// Mounted on a stand (fish, birds): no base needed, a rod goes in at `point`.
// Changes no glass; it's an op so it's undoable and presets can set it.
// Mounting knocks the piece off the punty (if still on it) and lifts it to
// display height, 4 cm clear of the floor, so the rod and stand fit beneath.
OPS.mount = (vol, { on = true, point = null }) => {
  const m = vol.meta;
  if (!on) { m.mounted = false; m.mountPoint = null; return; }
  const V0 = vol.volumeCm3();
  if (m.puntyMark) { m.markOnPiece = m.puntyMark; m.puntyAxis = null; m.puntyMark = null; }
  const lift = Math.max(0, 4 - lowestPoint(vol));
  if (lift > 0) {
    transform(vol, (x, y, z, out) => { out[0] = x; out[1] = y - lift; out[2] = z; });
    const up = (p) => (p ? [p[0], p[1] + lift, p[2]] : p);
    m.markOnPiece = up(m.markOnPiece);
    m.paddled = m.paddled.map((f) => ({ ...f, c: up(f.c) }));
    point = up(point);
    conserveEverywhere(vol, V0);
  }
  m.onFloor = false;
  m.mounted = true;
  m.mountPoint = point || underside(vol);
};
CONSERVES.add('mount');
LABELS.mount = 'Mount';

// Where a rod straight up under the centre of mass would meet the glass.
function underside(vol) {
  const c = centreOfMass(vol);
  if (!c) return null;
  let y = c[1];
  while (y > vol.origin[1] && vol.sample(c[0], y, c[2]) < 0) y -= vol.h * 0.25;
  return [c[0], y, c[2]];
}

// Apply an op, then tidy the field. Returns the volume change it made.
export function runOp(vol, op) {
  const V0 = vol.volumeCm3();
  const before = CONSERVES.has(op.type) ? null : vol.sdf.slice();
  OPS[op.type](vol, op);
  if (before) {
    const b = diffBox(vol, before);
    if (b) redistance(vol, b);
  }
  vol.sealBoundary();
  if (vol.meta.puntyAxis) vol.meta.puntyMark = findPuntyMark(vol);
  return vol.volumeCm3() - V0;
}

export function replay(ops, n, size) {
  const vol = new Volume(n, size);
  for (const op of ops) runOp(vol, op);
  return vol;
}

function conserveEverywhere(vol, V0, cap = null) {
  const box = vol.pieceBox(1);
  if (box) conserve(vol, V0, box, () => 1, cap);
}

export function diffBox(vol, before, beforeColor = null) {
  const { n, sdf, color } = vol;
  let i0 = n, i1 = -1, j0 = n, j1 = -1, k0 = n, k1 = -1, idx = 0;
  for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++, idx++) {
    if (sdf[idx] === before[idx] && (!beforeColor || color[idx] === beforeColor[idx])) continue;
    if (i < i0) i0 = i; if (i > i1) i1 = i;
    if (j < j0) j0 = j; if (j > j1) j1 = j;
    if (k < k0) k0 = k; if (k > k1) k1 = k;
  }
  return i1 < 0 ? null : { i0, i1, j0, j1, k0, k1 };
}

function centreOfMass(vol) {
  const { n, h, origin, sdf } = vol;
  let v = 0, sx = 0, sy = 0, sz = 0, idx = 0;
  for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++, idx++) {
    const w = frac(sdf[idx], h);
    if (!w) continue;
    v += w; sx += w * i; sy += w * j; sz += w * k;
  }
  return v ? [origin[0] + (sx / v) * h, origin[1] + (sy / v) * h, origin[2] + (sz / v) * h] : null;
}

// Lowest point of the glass, interpolated between grid layers.
function lowestPoint(vol) {
  const { n, h, origin, sdf } = vol;
  for (let j = 1; j < n; j++) {
    let best = Infinity;
    for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) {
      const s = sdf[i + n * (j + n * k)];
      if (s >= 0) continue;
      const below = sdf[i + n * (j - 1 + n * k)];
      const y = origin[1] + (j - 1) * h + h * (below / (below - s));
      if (y < best) best = y;
    }
    if (best < Infinity) return best;
  }
  return 0;
}

// Where the punty enters the glass: march in along +x on the punty axis.
export function findPuntyMark(vol) {
  const ax = vol.meta.puntyAxis;
  if (!ax) return null;
  const x0 = vol.origin[0], step = vol.h * 0.5;
  for (let x = x0; x < 0; x += step) {
    if (vol.sample(x, ax.y, ax.z) < 0) return [x, ax.y, ax.z];
  }
  return null;
}

function hash3(i, j, k, seed) {
  let h = (i * 374761393 + j * 668265263 + k * 2147483647 + seed * 974634281) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
