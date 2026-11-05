// Revolved-profile geometry. A profile is a half-section: [r, y] pairs in mm,
// r = distance from the axis, y = height, running from the foot up to the
// top. Spinning it around the axis gives the solid.
//
// sampleCurve and solidOfRevolution are copied unchanged (apart from units)
// from Jackline, src/geometry/profile.js, so a profile drawn in Jackline
// gives the same outer shape here.

// Centripetal Catmull-Rom through the control points. It never loops or
// cusps between points, so a dragged point can't tie the wall in a knot.
export function sampleCurve(points, { perSeg = 20, floor = true } = {}) {
  const n = points.length
  if (n === 2) {
    // Two points: a straight line (Catmull-Rom would also give one, but this
    // keeps a plain cylinder exact and cheap).
    const pts = []
    for (let k = 0; k <= perSeg; k++) {
      const u = k / perSeg
      pts.push([points[0][0] + (points[1][0] - points[0][0]) * u, points[0][1] + (points[1][1] - points[0][1]) * u])
    }
    return { pts, seg: pts.map(() => 0) }
  }
  const at = (i) => {
    if (i < 0) return [2 * points[0][0] - points[1][0], 2 * points[0][1] - points[1][1]]
    if (i >= n) return [2 * points[n - 1][0] - points[n - 2][0], 2 * points[n - 1][1] - points[n - 2][1]]
    return points[i]
  }
  const pts = []
  const seg = []
  for (let i = 0; i < n - 1; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2)
    const t1 = knot(p0, p1), t2 = t1 + knot(p1, p2), t3 = t2 + knot(p2, p3)
    for (let k = 0; k < perSeg; k++) {
      const t = t1 + ((t2 - t1) * k) / perSeg
      const A1 = lerp(p0, p1, 0, t1, t), A2 = lerp(p1, p2, t1, t2, t), A3 = lerp(p2, p3, t2, t3, t)
      const B1 = lerp(A1, A2, 0, t2, t), B2 = lerp(A2, A3, t1, t3, t)
      pts.push(lerp(B1, B2, t1, t2, t))
      seg.push(i)
    }
  }
  pts.push([...points[n - 1]])
  seg.push(n - 2)
  // The curve can overshoot past the axis or under the table; glass can't.
  if (floor) for (const p of pts) (p[0] = Math.max(0, p[0])), (p[1] = Math.max(0, p[1]))
  return { pts, seg }
}
const knot = (a, b) => Math.max(Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])), 1e-3)
function lerp(a, b, ta, tb, t) {
  const u = (t - ta) / (tb - ta)
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]
}

// Volume and centre-of-mass height of the solid you get by spinning a closed
// polygon around the axis. Pappus: V = 2π ∫∫ r dA, and the height of the
// centroid is ∫∫ r·y dA / ∫∫ r dA. Both integrals have exact polygon sums.
// Units follow the input: mm in → mm³ out.
export function solidOfRevolution(poly) {
  let a1 = 0, axy = 0
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % poly.length]
    const c = x0 * y1 - x1 * y0
    a1 += (x0 + x1) * c
    axy += c * (2 * x0 * y0 + x0 * y1 + x1 * y0 + 2 * x1 * y1)
  }
  a1 /= 6
  axy /= 24
  if (a1 < 0) (a1 = -a1), (axy = -axy)
  return { volume: 2 * Math.PI * a1, y: a1 > 1e-9 ? axy / a1 : 0 }
}

// Push a polyline sideways by `w`, to its left as you walk along it. Each
// segment is moved along its own normal and neighbours are joined where the
// moved lines cross (a mitre), so a sharp foot corner gets an exact inside
// corner instead of being rounded off. Very sharp turns fall back to the
// averaged normal so a spike can't shoot out.
export function offsetLeft(path, w) {
  const n = path.length
  const dirs = []
  for (let i = 0; i < n - 1; i++) {
    const dx = path[i + 1][0] - path[i][0], dy = path[i + 1][1] - path[i][1]
    const l = Math.hypot(dx, dy) || 1
    dirs.push([dx / l, dy / l])
  }
  const left = (d) => [-d[1], d[0]]
  const out = []
  for (let j = 0; j < n; j++) {
    const p = path[j]
    if (j === 0 || j === n - 1) {
      const nn = left(dirs[j === 0 ? 0 : n - 2])
      out.push([p[0] + nn[0] * w, p[1] + nn[1] * w])
      continue
    }
    const dA = dirs[j - 1], dB = dirs[j]
    const nA = left(dA), nB = left(dB)
    const cross = dA[0] * dB[1] - dA[1] * dB[0]
    const a = [p[0] + nA[0] * w, p[1] + nA[1] * w]
    if (Math.abs(cross) < 1e-9) {
      out.push(a)
      continue
    }
    const b = [p[0] + nB[0] * w, p[1] + nB[1] * w]
    const s = ((b[0] - a[0]) * dB[1] - (b[1] - a[1]) * dB[0]) / cross
    const q = [a[0] + dA[0] * s, a[1] + dA[1] * s]
    if (Math.hypot(q[0] - p[0], q[1] - p[1]) > 4 * w) {
      const m = [nA[0] + nB[0], nA[1] + nB[1]]
      const ml = Math.hypot(m[0], m[1]) || 1
      out.push([p[0] + (m[0] / ml) * w, p[1] + (m[1] / ml) * w])
    } else out.push(q)
  }
  return out
}

// A blown form: the drawn profile is the outside of the glass, and the
// inside is that line pushed inward by the wall thickness. The bottom is
// closed across to the axis (the base is one wall thick). An open top ends
// at the rim; a closed top runs straight across to the axis from the last
// point (draw a dome in the profile if you want a dome).
//
// Glass volume is the outer solid minus the inner cavity; it is computed in
// one go as the solid of revolution of the wall's section polygon (outer
// line up, inner line back down), which is the same thing.
export function blownSection(points, wallMm, closedTop) {
  const { pts } = sampleCurve(points, { perSeg: 24 })
  const outer = pts.map((p) => [...p])
  if (outer[0][0] > 1e-6) outer.unshift([0, outer[0][1]])
  const last = outer[outer.length - 1]
  if (closedTop && last[0] > 1e-6) outer.push([0, last[1]])
  // Walking up the outside, the glass is on the left.
  const inner = offsetLeft(outer, wallMm).map(([r, y]) => [Math.max(0, r), y])

  const section = [...outer, ...[...inner].reverse()]
  const glass = solidOfRevolution(section)
  const outerSolid = solidOfRevolution(closeToAxis(outer))
  const cavity = solidOfRevolution(closeToAxis(inner))
  const ys = outer.map((p) => p[1])
  return {
    outer,
    inner,
    section,
    volumeMm3: glass.volume,
    comY: glass.y,
    outerVolumeMm3: outerSolid.volume,
    cavityVolumeMm3: cavity.volume,
    height: Math.max(...ys) - Math.min(...ys),
    maxR: Math.max(...outer.map((p) => p[0])),
  }
}

// Close a path to the axis at both ends, so it bounds a revolvable region.
function closeToAxis(path) {
  const p = [...path]
  if (p[0][0] > 1e-6) p.unshift([0, p[0][1]])
  if (p[p.length - 1][0] > 1e-6) p.push([0, p[p.length - 1][1]])
  return p
}
