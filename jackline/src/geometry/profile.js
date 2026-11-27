// Everything here works on a half-profile in centimetres: [r, y] pairs, where
// r is the distance from the center axis and y the height above the table.
// Spinning that half-profile around the axis gives the vessel.

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))

// Centripetal Catmull-Rom through the control points. It never loops or
// cusps between points, so a dragged point can't tie the wall in a knot.
export function sampleCurve(points, { perSeg = 20, floor = true } = {}) {
  const n = points.length
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

// Wall thickness at every sample of the outer curve. `wall` is one number for
// the whole piece, or one per control point (a heavy base, a thin lip), eased
// between points so the inside never steps.
export function wallAlong(wall, seg, perSeg = 20) {
  if (!Array.isArray(wall)) return seg.map(() => wall)
  return seg.map((s, j) => {
    const u = Math.min(1, (j - s * perSeg) / perSeg)
    const e = u * u * (3 - 2 * u)
    const a = wall[s] ?? wall[wall.length - 1], b = wall[s + 1] ?? a
    return a + (b - a) * e
  })
}

// The drawn line is the outside of the glass. The inside is that line pushed
// inward by the wall thickness, cut off at the cavity floor. Below the floor
// the glass is solid: a thick base on a tumbler, the whole stem on a goblet.
export function buildSection({ points, wall: wallIn, floor }) {
  const { pts: outer, seg } = sampleCurve(points)
  const walls = wallAlong(wallIn, seg)
  const last = outer.length - 1
  const tangent = (i) => {
    const a = outer[Math.max(0, i - 1)], b = outer[Math.min(last, i + 1)]
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]
  }
  // Walking up the wall, the glass is on the left: rotate the tangent 90°.
  const off = outer.map((p, i) => {
    const [tx, ty] = tangent(i)
    return [Math.max(0, p[0] - ty * walls[i]), p[1] + tx * walls[i]]
  })

  // How far along the outside wall each sample sits, 0 at the foot edge and
  // 1 at the rim. Color bands are placed by this, not by height: a folded
  // foot or a flared lip passes the same height twice, but never the same s.
  const outerS = [0]
  for (let i = 1; i <= last; i++) outerS.push(outerS[i - 1] + Math.hypot(outer[i][0] - outer[i - 1][0], outer[i][1] - outer[i - 1][1]))
  const outerLen = outerS[last] || 1
  for (let i = 0; i <= last; i++) outerS[i] /= outerLen

  const floorY = clamp(floor, 0, off[last][1] - 0.1)
  // Walk down from the rim until the inner wall drops below the floor.
  let k = last
  while (k > 0 && off[k - 1][1] >= floorY) k--
  const inner = off.slice(k)
  // Each inside point is the offset of an outside one, so it shares its s.
  const innerS = outerS.slice(k)
  let cavityFloor = floorY
  if (k > 0) {
    const a = off[k - 1], b = off[k]
    const u = (floorY - a[1]) / (b[1] - a[1] || 1)
    inner.unshift([a[0] + (b[0] - a[0]) * u, floorY])
    innerS.unshift(outerS[k - 1] + (outerS[k] - outerS[k - 1]) * u)
  } else {
    cavityFloor = inner[0][1]
  }

  // A fire-polished rim: a half-round joining the outer and inner lips.
  const o = outer[last], i = off[last]
  const c = [(o[0] + i[0]) / 2, (o[1] + i[1]) / 2]
  const v = [o[0] - c[0], o[1] - c[1]]
  const [tx, ty] = tangent(last)
  const sign = -v[1] * tx + v[0] * ty >= 0 ? 1 : -1
  const rim = []
  for (let s = 1; s < 8; s++) {
    const a = (sign * Math.PI * s) / 8
    rim.push([c[0] + v[0] * Math.cos(a) - v[1] * Math.sin(a), c[1] + v[0] * Math.sin(a) + v[1] * Math.cos(a)])
  }

  const section = [[0, 0], ...outer, ...rim, ...[...inner].reverse(), [0, cavityFloor]]
  // For each section point: [s, side], side 0 on the outside (with the rim
  // and the foot's underside), 1 on the inside. Color is drawn from these.
  const sectionTags = [[0, 0], ...outerS.map((v) => [v, 0]), ...rim.map(() => [1, 0]), ...[...innerS].reverse().map((v) => [v, 1]), [innerS[0], 1]]
  const brimY = inner[inner.length - 1][1]
  const cavity = [[0, cavityFloor], ...inner, [0, brimY]]
  const height = Math.max(...section.map((p) => p[1]))
  // `wall` stays one number for the color model: the piece's wall, or the
  // average when it's given per control point (Bits); `walls` has every sample.
  const wall = Array.isArray(wallIn) ? walls.reduce((a, w) => a + w, 0) / walls.length : wallIn
  return { outer, outerS, outerLen, seg, walls, sectionTags, inner, innerS, rim, section, cavity, floorY: cavityFloor, brimY, height, footR: points[0][0], wall }
}

// Volume and center-of-mass height of the solid you get by spinning a closed
// polygon around the axis. Pappus: V = 2π ∫∫ r dA, and the height of the
// centroid is ∫∫ r·y dA / ∫∫ r dA. Both integrals have exact polygon sums.
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

// Outer radius at height y, reading down from the rim so a flared lip wins
// over the foot when a profile passes the same height twice.
export function radiusAt(outer, y) {
  for (let i = outer.length - 1; i > 0; i--) {
    const a = outer[i - 1], b = outer[i]
    if ((a[1] - y) * (b[1] - y) <= 0 && a[1] !== b[1]) return a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1])
  }
  return outer[outer.length - 1][0]
}

// A pulled handle on the -x side: a C-shaped strap from high on the wall to
// low on it. Sized to the vessel so a mug and a pitcher both look right.
export function handlePath(sec) {
  const H = sec.height
  const yT = H * 0.8, yB = H * 0.3
  const rT = radiusAt(sec.outer, yT), rB = radiusAt(sec.outer, yB)
  const reach = clamp(H * 0.24, 2.2, 5.5)
  const radius = clamp(H * 0.035, 0.38, 0.75)
  const far = Math.max(rT, rB) + reach
  const points = [
    [-(rT - radius * 0.6), yT],
    [-(rT + reach * 0.75), yT + reach * 0.22],
    [-far, (yT + yB) / 2 + reach * 0.1],
    [-(rB + reach * 0.55), yB - reach * 0.05],
    [-(rB - radius * 0.6), yB],
  ]
  const { pts } = sampleCurve(points, { perSeg: 12, floor: false })
  let length = 0, moment = 0
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
    length += l
    moment += l * (pts[i][1] + pts[i - 1][1]) / 2
  }
  return { points, pts, radius, volume: length * Math.PI * radius * radius, y: moment / length }
}
