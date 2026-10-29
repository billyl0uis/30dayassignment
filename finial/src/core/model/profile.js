// A vessel's half-profile: the outside line of the glass, drawn from the
// center of the base out and up to the rim. Spinning it around the axis
// gives the vessel. Lengths in mm; r is the distance from the axis, z the
// height above the table.
//
// Control points are { r, z, corner?, wall? }:
//   corner — the line turns sharply here (a foot edge, a shoulder break)
//            instead of curving smoothly through
//   wall   — wall thickness at this point, overriding the profile's global
//            thickness; between points it changes smoothly along the wall
//
// Polylines (what the maths runs on) are plain [r, z] pairs.

// Samples per span between two control points. Fine enough that the
// sampled curve's volume is within a hair of the smooth one's (see
// revolve.test.js), coarse enough to redraw while dragging.
export const SAMPLES_PER_SPAN = 24

// Centripetal Catmull-Rom: it never loops or cusps between points, so a
// dragged point can't tie the wall in a knot.
const knot = (a, b) => Math.max(Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])), 1e-6)
const lerp = (a, b, ta, tb, t) => {
  const u = (t - ta) / (tb - ta)
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]
}

// One smooth run between corners, as samples. Each sample carries which
// span it is on (from the run's first point) and how far along (0–1).
function sampleRun(run, perSpan) {
  const n = run.length
  // Past the ends, mirror the neighbour so the curve leaves straight.
  const at = (i) => {
    if (i < 0) return [2 * run[0][0] - run[1][0], 2 * run[0][1] - run[1][1]]
    if (i >= n) return [2 * run[n - 1][0] - run[n - 2][0], 2 * run[n - 1][1] - run[n - 2][1]]
    return run[i]
  }
  const out = []
  for (let i = 0; i < n - 1; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2)
    const t1 = knot(p0, p1), t2 = t1 + knot(p1, p2), t3 = t2 + knot(p2, p3)
    for (let k = 0; k < perSpan; k++) {
      const t = t1 + ((t2 - t1) * k) / perSpan
      const A1 = lerp(p0, p1, 0, t1, t), A2 = lerp(p1, p2, t1, t2, t), A3 = lerp(p2, p3, t2, t3, t)
      const B1 = lerp(A1, A2, 0, t2, t), B2 = lerp(A2, A3, t1, t3, t)
      out.push({ p: lerp(B1, B2, t1, t2, t), span: i, u: k / perSpan })
    }
  }
  return out
}

// The smooth outside line through the control points, breaking at corners.
// Returns the polyline and, for each sample, the control point span it lies
// on (span i runs from point i to i + 1) and how far along that span.
export function sampleProfile(points, perSpan = SAMPLES_PER_SPAN) {
  const pts = []
  const span = []
  const u = []
  let start = 0
  for (let i = 1; i < points.length; i++) {
    if (i < points.length - 1 && !points[i].corner) continue
    const run = points.slice(start, i + 1).map((p) => [p.r, p.z])
    for (const s of sampleRun(run, perSpan)) {
      pts.push(s.p)
      span.push(start + s.span)
      u.push(s.u)
    }
    start = i
  }
  const last = points[points.length - 1]
  pts.push([last.r, last.z])
  span.push(points.length - 2)
  u.push(1)
  // The curve can overshoot past the axis or under the table; glass can't.
  for (const p of pts) {
    p[0] = Math.max(0, p[0])
    p[1] = Math.max(0, p[1])
  }
  return { pts, span, u }
}

// Wall thickness at every sample: each control point's own (or the global
// one), changing in proportion to distance along the wall between them.
export function thicknessAlong(points, sampled, globalWall) {
  const { pts, span } = sampled
  const wallAt = (i) => points[i].wall ?? globalWall
  // Distance along the wall from the start of each sample's span.
  const along = new Array(pts.length).fill(0)
  const spanLength = new Map()
  for (let i = 1; i < pts.length; i++) {
    const step = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
    along[i] = span[i] === span[i - 1] ? along[i - 1] + step : 0
    // The first sample of a new span closes the previous one.
    const closing = span[i] === span[i - 1] ? span[i] : span[i - 1]
    spanLength.set(closing, (spanLength.get(closing) ?? 0) + step)
  }
  return pts.map((_, i) => {
    if (i === pts.length - 1) return wallAt(points.length - 1)
    const length = spanLength.get(span[i]) || 1
    const f = along[i] / length
    return wallAt(span[i]) * (1 - f) + wallAt(span[i] + 1) * f
  })
}
