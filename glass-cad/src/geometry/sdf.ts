// Signed distance functions: how far a point is from a part's surface, negative inside.
// Shells use them to find the cavity (everything deeper than the wall), and melt will
// use them in step 4. Every preset gets an exact one straight from its Section, since
// a turned part's distance is just the 2D distance from (radius, height) to its profile.

import { innerProfile, type Cap, type Section, type V3 } from './section';
import type { Vec2 } from './profile';

export type Sdf = (x: number, y: number, z: number) => number;

/** Null for imported meshes: there's no exact distance to an arbitrary triangle soup here. */
export function sectionSdf(section: Section): Sdf | null {
  switch (section.kind) {
    case 'lathe': {
      const outer = revolvedSdf(section.profile, false);
      const inner = innerProfile(section);
      if (!inner) return outer;
      const cavity = revolvedSdf(inner, false);
      return (x, y, z) => Math.max(outer(x, y, z), -cavity(x, y, z));
    }
    case 'lathe-loop':
      return revolvedSdf(section.loop, true);
    case 'sweep':
      return sweepSdf(section.path, section.radii, section.closed, section.caps);
    case 'extrude': {
      const flat = outlineDistance(section.outline, true);
      const half = section.depth / 2;
      return (x, y, z) => {
        const d2 = flat(x, y);
        const dz = Math.abs(z) - half;
        return Math.min(Math.max(d2, dz), 0) + Math.hypot(Math.max(d2, 0), Math.max(dz, 0));
      };
    }
    case 'implicit':
      return section.sdf;
    case 'mesh':
      return null;
    case 'box': {
      const { width: w, depth: d, height: h, wall: t } = section;
      const outer = boxSdf(w / 2, h / 2, d / 2, h / 2);
      if (t <= 0) return outer;
      const cavity = boxSdf(w / 2 - t, h / 2 - t, d / 2 - t, h / 2);
      return (x, y, z) => Math.max(outer(x, y, z), -cavity(x, y, z));
    }
  }
}

/**
 * Distance from a point to a turned solid. An open profile runs from the axis back to
 * the axis; the stretch along the axis that closes it is inside the glass, not
 * surface, so only the profile's own edges count for distance. A closed loop (a
 * torus's tube) counts every edge.
 */
export function revolvedSdf(points: Vec2[], closed: boolean): Sdf {
  const flat = outlineDistance(points, closed);
  return (px, py, pz) => flat(Math.hypot(px, pz), py);
}

/**
 * Signed 2D distance to a polygon, negative inside. With `closed` false the closing
 * edge (last point back to first) still counts for inside/outside but not for distance.
 */
export function outlineDistance(points: Vec2[], closed: boolean): (u: number, v: number) => number {
  const n = points.length;
  const r = new Float64Array(n);
  const y = new Float64Array(n);
  points.forEach(([pr, py], i) => {
    r[i] = pr;
    y[i] = py;
  });
  const edges = closed ? n : n - 1;
  return (pr, py) => {
    let best = Infinity;
    let inside = false;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      // Even-odd crossing test over the closed polygon (the axis edge included).
      if (y[i] > py !== y[j] > py && pr < ((r[j] - r[i]) * (py - y[i])) / (y[j] - y[i]) + r[i]) inside = !inside;
      if (i >= edges) continue;
      const ex = r[j] - r[i];
      const ey = y[j] - y[i];
      const len2 = ex * ex + ey * ey;
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((pr - r[i]) * ex + (py - y[i]) * ey) / len2)) : 0;
      const dx = pr - (r[i] + t * ex);
      const dy = py - (y[i] + t * ey);
      const d2 = dx * dx + dy * dy;
      if (d2 < best) best = d2;
    }
    const d = Math.sqrt(best);
    return inside ? -d : d;
  };
}

/** A box centred on the axis at height `cy`. */
function boxSdf(hx: number, hy: number, hz: number, cy: number): Sdf {
  return (x, y, z) => {
    const qx = Math.abs(x) - hx;
    const qy = Math.abs(y - cy) - hy;
    const qz = Math.abs(z) - hz;
    const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0));
    return outside + Math.min(Math.max(qx, qy, qz), 0);
  };
}

/** An upright cylinder from y0 to y1 around (cx, cz). */
export function cylinderSdf(cx: number, cz: number, radius: number, y0: number, y1: number): Sdf {
  const mid = (y0 + y1) / 2;
  const half = (y1 - y0) / 2;
  return (x, y, z) => {
    const dr = Math.hypot(x - cx, z - cz) - radius;
    const dy = Math.abs(y - mid) - half;
    return Math.min(Math.max(dr, dy), 0) + Math.hypot(Math.max(dr, 0), Math.max(dy, 0));
  };
}

export const union = (a: Sdf, b: Sdf): Sdf => (x, y, z) => Math.min(a(x, y, z), b(x, y, z));
export const subtract = (a: Sdf, b: Sdf): Sdf => (x, y, z) => Math.max(a(x, y, z), -b(x, y, z));
export const intersect = (a: Sdf, b: Sdf): Sdf => (x, y, z) => Math.max(a(x, y, z), b(x, y, z));

/**
 * Polynomial smooth minimum: like min(a, b), but within `k` of each other the two
 * surfaces flow together instead of meeting at a crease. Never more than k/4 below min.
 */
export function smoothMin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - (h * h * k) / 4;
}

export interface Bounded {
  sdf: Sdf;
  min: [number, number, number];
  max: [number, number, number];
}

/**
 * Melts shapes together. Each shape's bounding box gives a cheap lower bound on its
 * distance, and a shape more than `k` farther than the best so far can't change a
 * smooth minimum, so most points only ever evaluate the one or two nearest parts.
 */
export function smoothUnion(items: Bounded[], k: number): Sdf {
  return (x, y, z) => {
    let d = Infinity;
    for (const { sdf, min, max } of items) {
      const lb = Math.hypot(Math.max(min[0] - x, 0, x - max[0]), Math.max(min[1] - y, 0, y - max[1]), Math.max(min[2] - z, 0, z - max[2]));
      if (lb > d + k) continue;
      const a = sdf(x, y, z);
      d = d === Infinity ? a : smoothMin(d, a, k);
    }
    return d;
  };
}

/**
 * Distance to a rod of varying radius along a path: for each segment, the distance to
 * the segment minus the radius there. Close to exact while the radius changes slowly
 * along the rod, which holds for canes, coils and horns. A flat end is cut square.
 */
export function sweepSdf(path: V3[], radii: number[], closed: boolean, caps: [Cap, Cap]): Sdf {
  const n = path.length;
  const segs = closed ? n : n - 1;
  const flat = (i: number, j: number) => {
    const t = [path[j][0] - path[i][0], path[j][1] - path[i][1], path[j][2] - path[i][2]];
    const l = Math.hypot(t[0], t[1], t[2]) || 1;
    return { o: path[j], t: [t[0] / l, t[1] / l, t[2] / l] };
  };
  const start = !closed && caps[0] === 'flat' ? flat(1, 0) : null; // normal points out of the end
  const end = !closed && caps[1] === 'flat' ? flat(n - 2, n - 1) : null;
  return (x, y, z) => {
    let d = Infinity;
    for (let i = 0; i < segs; i++) {
      const a = path[i];
      const b = path[(i + 1) % n];
      const ex = b[0] - a[0];
      const ey = b[1] - a[1];
      const ez = b[2] - a[2];
      const len2 = ex * ex + ey * ey + ez * ez;
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey + (z - a[2]) * ez) / len2)) : 0;
      const r = radii[i] + (radii[(i + 1) % n] - radii[i]) * t;
      const di = Math.hypot(x - a[0] - t * ex, y - a[1] - t * ey, z - a[2] - t * ez) - r;
      if (di < d) d = di;
    }
    for (const cap of [start, end]) {
      if (cap) d = Math.max(d, (x - cap.o[0]) * cap.t[0] + (y - cap.o[1]) * cap.t[1] + (z - cap.o[2]) * cap.t[2]);
    }
    return d;
  };
}
