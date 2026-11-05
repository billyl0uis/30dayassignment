import type { BlownProfile, GlassPart, Vec3 } from '../model/types';
import { add, mul, rotateEulerXYZ } from './vec';

// ---------- direction grid for blown shells ----------
export const BLOWN_LAT = 32;
export const BLOWN_LON = 48;

const dirCache = new Map<string, Float64Array>();
/** Unit directions on a lat/lon grid: (lat+1) rows from -y pole to +y pole, lon columns. */
export function sphereDirs(lat: number, lon: number): Float64Array {
  const key = `${lat}x${lon}`;
  let d = dirCache.get(key);
  if (d) return d;
  d = new Float64Array((lat + 1) * lon * 3);
  for (let i = 0; i <= lat; i++) {
    const polar = Math.PI - (Math.PI * i) / lat; // from -y up to +y
    const y = Math.cos(polar);
    const r = Math.sin(polar);
    for (let j = 0; j < lon; j++) {
      const a = (2 * Math.PI * j) / lon;
      const k = (i * lon + j) * 3;
      d[k] = r * Math.cos(a);
      d[k + 1] = y;
      d[k + 2] = r * Math.sin(a);
    }
  }
  dirCache.set(key, d);
  return d;
}

/** Triangle indices for the lat/lon grid (closed in longitude). */
export function sphereIndices(lat: number, lon: number): number[] {
  const idx: number[] = [];
  for (let i = 0; i < lat; i++) {
    for (let j = 0; j < lon; j++) {
      const a = i * lon + j, b = i * lon + ((j + 1) % lon);
      const c = (i + 1) * lon + j, d = (i + 1) * lon + ((j + 1) % lon);
      if (i > 0) idx.push(a, c, b);
      if (i < lat - 1) idx.push(b, c, d);
    }
  }
  return idx;
}

/** Outer-surface vertices of a blown part in local (unrotated) coords. */
export function blownVertices(part: GlassPart): Float64Array {
  if (part.geom.kind !== 'blown') throw new Error('not blown');
  const prof = part.geom.profile;
  const lat = prof?.lat ?? BLOWN_LAT, lon = prof?.lon ?? BLOWN_LON;
  const dirs = sphereDirs(lat, lon);
  const out = new Float64Array(dirs.length);
  const [sx, sy, sz] = part.scale;
  for (let v = 0; v < dirs.length / 3; v++) {
    const r = prof ? prof.radii[v] : part.geom.outerRadiusMm;
    out[v * 3] = dirs[v * 3] * r * sx;
    out[v * 3 + 1] = dirs[v * 3 + 1] * r * sy;
    out[v * 3 + 2] = dirs[v * 3 + 2] * r * sz;
  }
  return out;
}

function meshAreaAndCentroid(verts: Float64Array, idx: number[]): { area: number; centroid: Vec3 } {
  let area = 0, cx = 0, cy = 0, cz = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = verts[b] - verts[a], uy = verts[b + 1] - verts[a + 1], uz = verts[b + 2] - verts[a + 2];
    const vx = verts[c] - verts[a], vy = verts[c + 1] - verts[a + 1], vz = verts[c + 2] - verts[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const ta = 0.5 * Math.hypot(nx, ny, nz);
    area += ta;
    cx += (ta * (verts[a] + verts[b] + verts[c])) / 3;
    cy += (ta * (verts[a + 1] + verts[b + 1] + verts[c + 1])) / 3;
    cz += (ta * (verts[a + 2] + verts[b + 2] + verts[c + 2])) / 3;
  }
  return { area, centroid: area > 0 ? [cx / area, cy / area, cz / area] : [0, 0, 0] };
}

const areaNormCache = new Map<string, number>();
/** Factor that makes the faceted grid report exactly 4πR² for a perfect sphere. */
function areaNorm(lat: number, lon: number): number {
  const key = `${lat}x${lon}`;
  let k = areaNormCache.get(key);
  if (k === undefined) {
    k = (4 * Math.PI) / meshAreaAndCentroid(sphereDirs(lat, lon), sphereIndices(lat, lon)).area;
    areaNormCache.set(key, k);
  }
  return k;
}

/** Outer surface area of a blown part (mm²) and the shell's local centroid. */
export function blownAreaAndCentroid(part: GlassPart): { area: number; centroid: Vec3 } {
  if (part.geom.kind !== 'blown') throw new Error('not blown');
  const lat = part.geom.profile?.lat ?? BLOWN_LAT, lon = part.geom.profile?.lon ?? BLOWN_LON;
  const m = meshAreaAndCentroid(blownVertices(part), sphereIndices(lat, lon));
  return { area: m.area * areaNorm(lat, lon), centroid: m.centroid };
}

/**
 * Glass volume of a hollow shell with outer area A and wall t.
 * Exact for a sphere: 4/3·π(R³ − (R−t)³) = A·t·(1 − t/R + t²/3R²) with R = √(A/4π).
 * For a pillowed shell it uses the sphere of equal area — fine for a planning estimate.
 */
export function shellVolume(areaMm2: number, wallMm: number): number {
  const R = Math.sqrt(areaMm2 / (4 * Math.PI));
  const t = Math.min(wallMm, R);
  return areaMm2 * t * (1 - t / R + (t * t) / (3 * R * R));
}

/** Wall thickness that gives `volume` for a shell of outer area A (glass volume is conserved while blowing). */
export function wallForVolume(areaMm2: number, volumeMm3: number): number {
  const R = Math.sqrt(areaMm2 / (4 * Math.PI));
  if (shellVolume(areaMm2, R) <= volumeMm3) return R; // would be solid
  let lo = 0, hi = R;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (shellVolume(areaMm2, mid) < volumeMm3) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// ---------- teardrop (solid of revolution) ----------
const TEAR_H = 2.6; // height in radii
const TEAR_UMAX = 0.5 / 1.7; // where r(u) peaks
const TEAR_C = 1 / (Math.sqrt(TEAR_UMAX) * Math.pow(1 - TEAR_UMAX, 1.2));
/** Teardrop profile: u from 0 (round bottom) to 1 (tip). Local y = 0 at the bulb's widest point. */
export function teardropProfile(R: number, steps = 48): { r: number; y: number }[] {
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    out.push({ r: R * TEAR_C * Math.sqrt(u) * Math.pow(1 - u, 1.2), y: R * TEAR_H * (u - TEAR_UMAX) });
  }
  return out;
}

function teardropVolumeAndCy(R: number): { v: number; cy: number } {
  const n = 400;
  let v = 0, m = 0;
  const H = R * TEAR_H;
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    const r = R * TEAR_C * Math.sqrt(u) * Math.pow(1 - u, 1.2);
    const dv = Math.PI * r * r * (H / n);
    v += dv;
    m += dv * H * (u - TEAR_UMAX);
  }
  return { v, cy: m / v };
}

// ---------- per-part quantities ----------

/** Glass volume in mm³. */
export function partVolume(part: GlassPart): number {
  const g = part.geom;
  const [sx, sy, sz] = part.scale;
  switch (g.kind) {
    case 'blown':
      return shellVolume(blownAreaAndCentroid(part).area, g.wallMm);
    case 'solid':
      if (g.shape === 'teardrop') return teardropVolumeAndCy(g.radiusMm).v * sx * sy * sz;
      return (4 / 3) * Math.PI * g.radiusMm ** 3 * sx * sy * sz;
    case 'cast':
      return g.sizeMm[0] * g.sizeMm[1] * g.sizeMm[2] * sx * sy * sz;
    case 'leaf':
      return (4 / 3) * Math.PI * (g.lengthMm / 2) * (g.thicknessMm / 2) * (g.widthMm / 2) * sx * sy * sz;
  }
}

/** Centre of mass of the glass, world coords. */
export function partCom(part: GlassPart): Vec3 {
  const g = part.geom;
  let local: Vec3 = [0, 0, 0];
  if (g.kind === 'blown') local = blownAreaAndCentroid(part).centroid;
  else if (g.kind === 'solid' && g.shape === 'teardrop') local = mul([0, teardropVolumeAndCy(g.radiusMm).cy, 0], part.scale);
  return add(part.position, rotateEulerXYZ(local, part.rotationDeg));
}

/** The thickness that matters for clamping/drilling: wall, slab, or leaf thickness. */
export function partThickness(part: GlassPart): number {
  const g = part.geom;
  const [sx, sy, sz] = part.scale;
  switch (g.kind) {
    case 'blown':
      return g.wallMm;
    case 'solid':
      return 2 * g.radiusMm * Math.min(sx, sy, sz);
    case 'cast':
      return g.shape === 'slab' ? g.sizeMm[2] * sz : Math.min(g.sizeMm[0] * sx, g.sizeMm[1] * sy, g.sizeMm[2] * sz);
    case 'leaf':
      return g.thicknessMm * sy;
  }
}

export function defaultProfile(R: number): BlownProfile {
  return { lat: BLOWN_LAT, lon: BLOWN_LON, radii: new Array((BLOWN_LAT + 1) * BLOWN_LON).fill(R), freeR: R };
}
