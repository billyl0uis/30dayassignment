// Small 2D helpers for the footing (support region) of a part.

// Convex hull, Andrew's monotone chain. Points are [x, y]; returns the hull
// counter-clockwise without repeating the first point.
export function convexHull(points) {
  const pts = [...new Map(points.map((p) => [`${p[0].toFixed(3)},${p[1].toFixed(3)}`, p])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (pts.length <= 2) return pts
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower = [], upper = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 1e-12) lower.pop()
    lower.push(p)
  }
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 1e-12) upper.pop()
    upper.push(p)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

function distToSegment(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

// How far point p is inside the hull: positive inside (distance to the
// nearest edge), negative outside (distance to the hull). A hull of one or
// two points has no inside, so the result is never positive.
export function insideDistance(p, hull) {
  if (!hull.length) return -Infinity
  if (hull.length === 1) return -Math.hypot(p[0] - hull[0][0], p[1] - hull[0][1])
  if (hull.length === 2) return -distToSegment(p, hull[0], hull[1])
  let inside = true
  let d = Infinity
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length]
    if ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) < 0) inside = false
    d = Math.min(d, distToSegment(p, a, b))
  }
  return inside ? d : -d
}

// Is the origin inside the convex hull of these points (with a little slack)?
export const containsOrigin = (points, slack = 1e-9) => insideDistance([0, 0], convexHull(points)) >= -slack
