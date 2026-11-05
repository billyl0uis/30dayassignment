import { nodeById } from '../model/frame';
import type { Cage, GlassPart, Sculpture, Vec3 } from '../model/types';
import { BLOWN_LAT, BLOWN_LON, blownAreaAndCentroid, blownVertices, shellVolume, sphereDirs, teardropProfile, wallForVolume } from './glass';
import { add, cross, dist, dot, len, lerp, norm, rotateEulerXYZ, scale, sub } from './vec';

/**
 * How the blow works
 * ------------------
 * For every direction d out of the bubble's centre we precompute, once per blow:
 *   θ(d)  the angle to the nearest wire as seen from the centre,
 *   ρ(d)  how far out that wire's inner face is.
 * While the gaffer blows, the free bubble radius R grows. The glass radius in direction d is
 *     r(d) = softmin( R,  ρ(d) + β · s(d) ),      s(d) = ρ(d) · θ(d)
 * s is the arc distance to the nearest wire, so: right on a wire r = ρ (clamped to the wire),
 * halfway across a gap the glass may push out β·(half the gap) beyond the wire line, and a
 * wider gap allows a bigger pillow. softmin keeps the hand-off smooth, then two light
 * smoothing passes round off the pillows so they don't look faceted.
 */

export const PILLOW_BETA = 0.55;
const SOFT_K = 3; // mm
const WIRE_SAMPLE_MM = 2;

export interface Wire {
  a: Vec3;
  b: Vec3;
  radius: number;
}

export interface BlowField {
  lat: number;
  lon: number;
  center: Vec3;
  theta: Float64Array;
  rho: Float64Array;
}

export function cageWires(s: Sculpture, cage: Cage): Wire[] {
  const ids = new Set(cage.rodIds);
  const out: Wire[] = [];
  for (const r of s.rods) {
    if (!ids.has(r.id)) continue;
    const a = nodeById(s, r.a), b = nodeById(s, r.b);
    if (a && b) out.push({ a: a.p, b: b.p, radius: r.diameterMm / 2 });
  }
  return out;
}

export function precomputeField(wires: Wire[], center: Vec3, lat = BLOWN_LAT, lon = BLOWN_LON): BlowField {
  // sample the wires as points relative to the centre
  const px: number[] = [], py: number[] = [], pz: number[] = [], pd: number[] = [], pr: number[] = [];
  for (const w of wires) {
    const n = Math.max(1, Math.ceil(dist(w.a, w.b) / WIRE_SAMPLE_MM));
    for (let i = 0; i <= n; i++) {
      const p = sub(lerp(w.a, w.b, i / n), center);
      const d = len(p);
      if (d < 1e-6) continue;
      px.push(p[0] / d); py.push(p[1] / d); pz.push(p[2] / d); pd.push(d); pr.push(w.radius);
    }
  }
  const dirs = sphereDirs(lat, lon);
  const nd = dirs.length / 3;
  const theta = new Float64Array(nd), rho = new Float64Array(nd);
  for (let v = 0; v < nd; v++) {
    const dx = dirs[v * 3], dy = dirs[v * 3 + 1], dz = dirs[v * 3 + 2];
    let best = -2, bi = -1;
    for (let k = 0; k < px.length; k++) {
      const c = dx * px[k] + dy * py[k] + dz * pz[k];
      if (c > best) { best = c; bi = k; }
    }
    if (bi < 0) { theta[v] = Math.PI; rho[v] = Infinity; continue; }
    theta[v] = Math.acos(Math.min(1, best));
    rho[v] = Math.max(1, pd[bi] - pr[bi]);
  }
  return { lat, lon, center: [...center] as Vec3, theta, rho };
}

function softmin(a: number, b: number, k: number): number {
  if (!isFinite(b)) return a;
  const m = Math.min(a, b);
  return m - k * Math.log(Math.exp((m - a) / k) + Math.exp((m - b) / k));
}

/** Outer radius per direction for a free radius R inside the field's wires. */
export function inflateRadii(field: BlowField, R: number, beta = PILLOW_BETA): number[] {
  const { lat, lon, theta, rho } = field;
  let r = new Array<number>(theta.length);
  for (let v = 0; v < theta.length; v++) r[v] = softmin(R, rho[v] + beta * rho[v] * theta[v], SOFT_K);
  // light smoothing on the grid (poles are averaged rings)
  for (let pass = 0; pass < 2; pass++) {
    const next = r.slice();
    for (let i = 1; i < lat; i++) {
      for (let j = 0; j < lon; j++) {
        const c = i * lon + j;
        const nb = r[i * lon + ((j + 1) % lon)] + r[i * lon + ((j - 1 + lon) % lon)] + r[(i - 1) * lon + j] + r[(i + 1) * lon + j];
        next[c] = 0.5 * r[c] + 0.125 * nb;
      }
    }
    for (const i of [0, lat]) {
      let sum = 0;
      for (let j = 0; j < lon; j++) sum += r[i * lon + j];
      for (let j = 0; j < lon; j++) next[i * lon + j] = sum / lon;
    }
    r = next;
  }
  return r;
}

// ---------- blow session ----------

export const MIN_WALL_MM = 1.0;

export interface BlowSession {
  partId: string;
  cageId: string;
  field: BlowField;
  /** conserved glass volume, mm³ */
  volume: number;
  R: number;
  stopped: null | 'thin' | 'max';
}

export function startBlow(s: Sculpture, part: GlassPart, cage: Cage): BlowSession {
  if (part.geom.kind !== 'blown') throw new Error('Only blown parts can be blown.');
  const volume = shellVolume(blownAreaAndCentroid(part).area, part.geom.wallMm);
  part.scale = [1, 1, 1];
  part.rotationDeg = [0, 0, 0];
  const field = precomputeField(cageWires(s, cage), part.position);
  const R = part.geom.profile?.freeR ?? part.geom.outerRadiusMm;
  return { partId: part.id, cageId: cage.id, field, volume, R, stopped: null };
}

/** Apply free radius R to the part, conserving glass volume. Returns false if R was rejected (wall too thin). */
export function applyBlow(session: BlowSession, part: GlassPart, R: number): boolean {
  if (part.geom.kind !== 'blown') return false;
  const prev = part.geom.profile;
  const prevWall = part.geom.wallMm;
  const radii = inflateRadii(session.field, R);
  part.geom.profile = { lat: session.field.lat, lon: session.field.lon, radii, freeR: R };
  const wall = wallForVolume(blownAreaAndCentroid(part).area, session.volume);
  if (wall < MIN_WALL_MM) {
    part.geom.profile = prev;
    part.geom.wallMm = prevWall;
    session.stopped = 'thin';
    return false;
  }
  part.geom.wallMm = wall;
  part.geom.outerRadiusMm = Math.max(...radii);
  session.R = R;
  return true;
}

/** Blow until free radius `targetR` (or the wall gets too thin). Used by presets and tests. */
export function blowTo(s: Sculpture, part: GlassPart, cage: Cage, targetR: number, step = 1): BlowSession {
  const session = startBlow(s, part, cage);
  for (let R = session.R; R <= targetR; R += step) if (!applyBlow(session, part, R)) break;
  return session;
}

// ---------- openings & capture ----------

export interface Opening {
  label: string;
  center: Vec3;
  normal: Vec3;
  /** clear opening across, wire thickness removed, mm */
  diameter: number;
}

/** Every gap the glass could try to leave through: each cell between ribs and rings, plus the two end rings. */
export function cageOpenings(s: Sculpture, cage: Cage): Opening[] {
  const P = (id: string) => nodeById(s, id)!.p;
  const out: Opening[] = [];
  const ringCentroid = (path: string[]) => scale(path.map(P).reduce(add, [0, 0, 0] as Vec3), 1 / path.length);
  const bottom = ringCentroid(cage.ringPaths[0]);
  const top = ringCentroid(cage.ringPaths[cage.rings - 1]);
  const axis = norm(sub(top, bottom));
  const ends: [string[], Vec3, Vec3, string][] = [
    [cage.ringPaths[0], bottom, scale(axis, -1), 'bottom opening'],
    [cage.ringPaths[cage.rings - 1], top, axis, 'top opening'],
  ];
  for (const [path, c, n, label] of ends) {
    const minR = Math.min(...path.map((id) => dist(P(id), c)));
    out.push({ label, center: c, normal: n, diameter: Math.max(0, 2 * minR - cage.wireMm) });
  }
  const segsPerBand = (cage.ribPaths[0].length - 1) / (cage.rings - 1);
  for (let i = 0; i < cage.rings - 1; i++) {
    for (let j = 0; j < cage.ribs; j++) {
      const j2 = (j + 1) % cage.ribs;
      const a0 = P(cage.grid[i][j]), b0 = P(cage.grid[i][j2]);
      const a1 = P(cage.grid[i + 1][j]), b1 = P(cage.grid[i + 1][j2]);
      const midIdx = i * segsPerBand + Math.floor(segsPerBand / 2);
      const am = P(cage.ribPaths[j][midIdx]), bm = P(cage.ribPaths[j2][midIdx]);
      const width = Math.max(dist(a0, b0), dist(a1, b1), dist(am, bm));
      const height = (dist(a0, a1) + dist(b0, b1)) / 2;
      const center = scale(add(am, bm), 0.5);
      const axisPt = add(bottom, scale(axis, dot(sub(center, bottom), axis)));
      out.push({
        label: `gap ${i + 1}·${j + 1}`,
        center,
        normal: norm(sub(center, axisPt)),
        diameter: Math.max(0, Math.min(width, height) - cage.wireMm),
      });
    }
  }
  return out;
}

/** Points on the part's outer surface relative to its position (rotation/scale applied). */
export function partSurfacePoints(part: GlassPart): Vec3[] {
  const g = part.geom;
  const pts: Vec3[] = [];
  if (g.kind === 'blown') {
    const v = blownVertices(part);
    for (let i = 0; i < v.length; i += 3) pts.push([v[i], v[i + 1], v[i + 2]]);
  } else {
    const dirs = sphereDirs(12, 16);
    let half: Vec3;
    if (g.kind === 'solid') half = [g.radiusMm, g.radiusMm, g.radiusMm];
    else if (g.kind === 'cast') half = [g.sizeMm[0] / 2, g.sizeMm[1] / 2, g.sizeMm[2] / 2];
    else half = [g.lengthMm / 2, g.thicknessMm / 2, g.widthMm / 2];
    if (g.kind === 'solid' && g.shape === 'teardrop') {
      for (const q of teardropProfile(g.radiusMm, 16)) for (let a = 0; a < 16; a++) {
        const t = (2 * Math.PI * a) / 16;
        pts.push([q.r * Math.cos(t) * part.scale[0], q.y * part.scale[1], q.r * Math.sin(t) * part.scale[2]]);
      }
    } else if (g.kind === 'cast') {
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) pts.push([sx * half[0] * part.scale[0], sy * half[1] * part.scale[1], sz * half[2] * part.scale[2]]);
    } else {
      for (let i = 0; i < dirs.length; i += 3) pts.push([dirs[i] * half[0] * part.scale[0], dirs[i + 1] * half[1] * part.scale[1], dirs[i + 2] * half[2] * part.scale[2]]);
    }
  }
  return pts.map((p) => rotateEulerXYZ(p, part.rotationDeg));
}

/** Largest width of the glass seen along `n` (its silhouette's diameter). */
function silhouetteWidth(points: Vec3[], n: Vec3): number {
  let e1 = cross(n, [0, 1, 0]);
  if (len(e1) < 1e-3) e1 = cross(n, [1, 0, 0]);
  e1 = norm(e1);
  const e2 = norm(cross(n, e1));
  let best = 0;
  for (let k = 0; k < 18; k++) {
    const a = (Math.PI * k) / 18;
    const e = add(scale(e1, Math.cos(a)), scale(e2, Math.sin(a)));
    let lo = Infinity, hi = -Infinity;
    for (const p of points) {
      const t = dot(p, e);
      if (t < lo) lo = t;
      if (t > hi) hi = t;
    }
    best = Math.max(best, hi - lo);
  }
  return best;
}

export interface CaptureResult {
  inside: boolean;
  captured: boolean;
  /** true if the glass actually reached the wires (otherwise it rattles) */
  touching: boolean;
  /** the opening with the least clearance (glass width − opening) */
  tightest: { opening: Opening; glassWidth: number };
  /** an opening the glass fits through, if any */
  escape?: { opening: Opening; glassWidth: number };
  /** deepest pillow outside the wire line, mm */
  bulgeMm: number;
}

export function analyzeCapture(s: Sculpture, part: GlassPart, cage: Cage): CaptureResult {
  const openings = cageOpenings(s, cage);
  const pts = partSurfacePoints(part);
  // inside the cage?
  const bottom = scale(cage.ringPaths[0].map((id) => nodeById(s, id)!.p).reduce(add, [0, 0, 0] as Vec3), 1 / cage.ringPaths[0].length);
  const top = scale(cage.ringPaths[cage.rings - 1].map((id) => nodeById(s, id)!.p).reduce(add, [0, 0, 0] as Vec3), 1 / cage.ringPaths[cage.rings - 1].length);
  const axis = sub(top, bottom);
  const H = len(axis);
  const t = H > 0 ? dot(sub(part.position, bottom), axis) / (H * H) : 0;
  const radial = dist(part.position, add(bottom, scale(axis, t)));
  const inside = t > 0 && t < 1 && radial < cage.radiusMm * 0.6;

  let tightest: CaptureResult['tightest'] | undefined;
  let escape: CaptureResult['escape'];
  for (const o of openings) {
    const w = silhouetteWidth(pts, o.normal);
    if (!tightest || w - o.diameter < tightest.glassWidth - tightest.opening.diameter) tightest = { opening: o, glassWidth: w };
    if (w <= o.diameter && (!escape || o.diameter - w > escape.opening.diameter - escape.glassWidth)) escape = { opening: o, glassWidth: w };
  }

  // touching + bulge depth, using the same field the blow uses
  let touching = false, bulgeMm = 0;
  if (part.geom.kind === 'blown') {
    const prof = part.geom.profile;
    const field = precomputeField(cageWires(s, cage), part.position, prof?.lat ?? BLOWN_LAT, prof?.lon ?? BLOWN_LON);
    for (let v = 0; v < field.rho.length; v++) {
      const r = prof ? prof.radii[v] : part.geom.outerRadiusMm;
      if (r >= field.rho[v] - 1 && field.theta[v] < 0.05) touching = true;
      if (field.theta[v] < 0.6) bulgeMm = Math.max(bulgeMm, r - field.rho[v]);
    }
  } else {
    // non-blown: touching if any surface point is within a wire radius of a wire
    const wires = cageWires(s, cage);
    touching = pts.some((p) => wires.some((w) => pointSegDist(add(part.position, p), w.a, w.b) <= w.radius + 1));
  }
  return { inside, captured: inside && !escape, touching, tightest: tightest!, escape, bulgeMm: Math.max(0, bulgeMm) };
}

function pointSegDist(p: Vec3, a: Vec3, b: Vec3): number {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const t = l2 > 0 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2)) : 0;
  return dist(p, add(a, scale(ab, t)));
}

/** The cage a part sits in, if any (centre within the cage body). */
export function cageAround(s: Sculpture, part: GlassPart): Cage | undefined {
  let best: Cage | undefined, bestD = Infinity;
  for (const c of s.cages) {
    const half = c.heightMm / 2;
    const dy = Math.abs(part.position[1] - c.center[1]);
    const dr = Math.hypot(part.position[0] - c.center[0], part.position[2] - c.center[2]);
    if (dy < half * 0.8 && dr < c.radiusMm * 0.5 && dr + dy < bestD) {
      best = c;
      bestD = dr + dy;
    }
  }
  return best;
}
