// Plain 2D polygon math. Drawing space is [-1, 1] on both axes, y up.
// Polygons are closed implicitly (last point connects back to the first).

export type Vec2 = [number, number];

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

/** Positive when the polygon winds counter-clockwise. */
export function signedArea(poly: Vec2[]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += (poly[j][0] - poly[i][0]) * (poly[j][1] + poly[i][1]);
  }
  return a / 2;
}

export function bbox(poly: Vec2[]): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of poly) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  const [x, y] = p;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** The closest point on the polygon's outline to p. */
export function nearestOnPolygon(p: Vec2, poly: Vec2[]): Vec2 {
  let best = Infinity;
  let out: Vec2 = poly[0];
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j], b = poly[i];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
    const q: Vec2 = [a[0] + t * dx, a[1] + t * dy];
    const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (d < best) {
      best = d;
      out = q;
    }
  }
  return out;
}

/** Unsigned distance from p to the polygon's outline. */
export function distToPolygon(p: Vec2, poly: Vec2[]): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const d = distToSegment(p, poly[j], poly[i]);
    if (d < best) best = d;
  }
  return best;
}

function segmentsCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const o = (p: Vec2, q: Vec2, r: Vec2) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** True when any two non-neighbouring edges cross (a figure-8, an overshot loop...). */
export function selfIntersects(poly: Vec2[]): boolean {
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segmentsCross(a, b, poly[j], poly[(j + 1) % n])) return true;
    }
  }
  return false;
}

export function perimeter(poly: Vec2[]): number {
  let L = 0;
  for (let i = 0; i < poly.length; i++) L += dist(poly[i], poly[(i + 1) % poly.length]);
  return L;
}

/** Evenly respaced points along a closed outline. Rounds off sharp corners slightly. */
export function resampleClosed(poly: Vec2[], spacing: number): Vec2[] {
  const n = poly.length;
  if (n < 3) return poly.slice();
  const L = perimeter(poly);
  const count = Math.max(12, Math.round(L / spacing));
  const step = L / count;
  const out: Vec2[] = [];
  let seg = 0;
  let segStart = 0;
  let segLen = dist(poly[0], poly[1]);
  for (let k = 0; k < count; k++) {
    const t = k * step;
    while (segStart + segLen < t && seg < n - 1) {
      segStart += segLen;
      seg++;
      segLen = dist(poly[seg], poly[(seg + 1) % n]);
    }
    const a = poly[seg], b = poly[(seg + 1) % n];
    const u = segLen > 0 ? (t - segStart) / segLen : 0;
    out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
  }
  return out;
}

/** Splits long edges but keeps every original vertex, so pen-tool corners stay sharp. */
export function subdivideClosed(poly: Vec2[], spacing: number): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const steps = Math.max(1, Math.ceil(dist(a, b) / spacing));
    for (let s = 0; s < steps; s++) {
      const u = s / steps;
      out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
    }
  }
  return out;
}

/** Chaikin corner cutting: each pass rounds the outline a little more. */
export function chaikinClosed(poly: Vec2[], passes: number): Vec2[] {
  let pts = poly;
  for (let p = 0; p < passes; p++) {
    const next: Vec2[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      next.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    pts = next;
  }
  return pts;
}
