// 2D profiles in the (r, y) half-plane, spun around the Y axis to make solids.
// An "open" profile starts on the axis at the bottom, runs up the outside and
// ends on the axis at the top. A "loop" is a closed outline that never touches
// the axis (a torus).

export type Vec2 = [number, number];

const EPS = 1e-9;

/** Points on a circular arc, both ends included. Angles in radians, 0 = +r. */
export function arc(cr: number, cy: number, radius: number, a0: number, a1: number, n: number): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([cr + radius * Math.cos(a), cy + radius * Math.sin(a)]);
  }
  return pts;
}

/** Drops repeated points and snaps tiny negative radii (float noise) to the axis. */
export function cleanProfile(pts: Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (const [r, y] of pts) {
    const p: Vec2 = [Math.abs(r) < 1e-7 ? 0 : r, y];
    const prev = out[out.length - 1];
    if (prev && Math.hypot(prev[0] - p[0], prev[1] - p[1]) < 1e-7) continue;
    out.push(p);
  }
  return out;
}

/**
 * Volume swept by a closed polygon spun around the Y axis (Pappus): 2π times the
 * first moment of area about the axis. Exact for the polygon; an open profile
 * whose ends sit on the axis is closed along the axis, which adds nothing.
 */
export function revolvedVolume(loop: Vec2[]): number {
  let s = 0;
  for (let i = 0; i < loop.length; i++) {
    const [r0, y0] = loop[i];
    const [r1, y1] = loop[(i + 1) % loop.length];
    s += (r0 + r1) * (r0 * y1 - r1 * y0);
  }
  return Math.abs((2 * Math.PI * s) / 6);
}

/**
 * Offsets an open profile inward by `t` (the wall), giving the inner surface of a
 * hollow part. Corners are mitred so a cylinder's inner wall stays exactly `t` from
 * both its side and its base. End points are slid along their edge to land on the axis.
 */
export function offsetInward(profile: Vec2[], t: number): Vec2[] {
  const n = profile.length;
  const normals: Vec2[] = [];
  const dirs: Vec2[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dr = profile[i + 1][0] - profile[i][0];
    const dy = profile[i + 1][1] - profile[i][1];
    const len = Math.hypot(dr, dy) || 1;
    dirs.push([dr / len, dy / len]);
    normals.push([-dy / len, dr / len]); // left of travel = inside for bottom-to-top profiles
  }

  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const [r, y] = profile[i];
    if (i === 0 || i === n - 1) {
      const e = i === 0 ? 0 : n - 2;
      out.push(onAxis(r + normals[e][0] * t, y + normals[e][1] * t, dirs[e]));
      continue;
    }
    const a = normals[i - 1];
    const b = normals[i];
    let mr = a[0] + b[0];
    let my = a[1] + b[1];
    const ml = Math.hypot(mr, my) || 1;
    mr /= ml;
    my /= ml;
    const miter = t / Math.max(mr * a[0] + my * a[1], 0.25);
    out.push([Math.max(0, r + mr * miter), y + my * miter]);
  }
  return cleanProfile(out);
}

function onAxis(r: number, y: number, dir: Vec2): Vec2 {
  if (Math.abs(dir[0]) < EPS) return [0, y];
  const s = -r / dir[0];
  return [0, y + s * dir[1]];
}

/** Signed area of a closed polygon: positive when the points run counter-clockwise. */
export function polygonArea(pts: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

/**
 * A smooth curve through control points (Catmull-Rom), `per` samples per span. Open
 * curves pass through both end points; closed ones wrap around. Lets a preset (or a
 * hand drawing) be described with a handful of points and still turn smoothly.
 */
export function smoothThrough(points: Vec2[], per: number, closed = false): Vec2[] {
  const n = points.length;
  if (n < 3) return points.slice();
  const at = (i: number) => (closed ? points[(i + n) % n] : points[Math.max(0, Math.min(n - 1, i))]);
  const out: Vec2[] = [];
  const spans = closed ? n : n - 1;
  for (let i = 0; i < spans; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    for (let k = 0; k < per; k++) {
      const t = k / per;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  if (!closed) out.push(points[n - 1]);
  return out;
}

/** Moves points so the lowest sits at y = 0: every part rests on the floor. */
export function onFloor(pts: Vec2[]): Vec2[] {
  const minY = Math.min(...pts.map((p) => p[1]));
  return pts.map(([x, y]) => [x, y - minY]);
}
