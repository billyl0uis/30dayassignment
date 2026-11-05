// Where a bit sits on the body. A bit is anchored by how far up the outer
// wall it is (s: 0 at the foot edge, 1 at the rim, measured along the curve)
// and its angle around the axis (theta = atan2(x, z), 0 = front). Anchoring
// to the curve rather than to a fixed x, y, z means bits ride along when the
// profile is redrawn, and stay on the glass.

// Running length along the outer curve, so s can be turned into a point.
export function arcTable(outer) {
  const L = [0]
  for (let i = 1; i < outer.length; i++) L.push(L[i - 1] + Math.hypot(outer[i][0] - outer[i - 1][0], outer[i][1] - outer[i - 1][1]))
  return L
}

// The surface at (s, theta): point, outward normal, profile height and
// radius, and the wall thickness under it.
export function anchorAt(sec, s, theta) {
  const { outer, walls } = sec
  const L = sec.arc ?? arcTable(outer)
  const total = L[L.length - 1]
  const at = Math.min(Math.max(s, 0), 1) * total
  let i = 1
  while (i < L.length - 1 && L[i] < at) i++
  const seg = L[i] - L[i - 1] || 1
  const u = Math.min(Math.max((at - L[i - 1]) / seg, 0), 1)
  const a = outer[i - 1], b = outer[i]
  const r = a[0] + (b[0] - a[0]) * u
  const y = a[1] + (b[1] - a[1]) * u
  const wall = walls[i - 1] + (walls[i] - walls[i - 1]) * u

  // Walking up the wall, outward is to the right of the direction of travel.
  const tr = b[0] - a[0], ty = b[1] - a[1]
  const tl = Math.hypot(tr, ty) || 1
  const nr = ty / tl, ny = -tr / tl
  const sx = Math.sin(theta), cz = Math.cos(theta)
  const normal = [nr * sx, ny, nr * cz]
  // Up the wall, in 3D, and round the piece (normal × up), for bits that
  // have a direction: wings stand up the wall, handles reach out from it.
  const up = [(tr / tl) * sx, ty / tl, (tr / tl) * cz]
  const side = [normal[1] * up[2] - normal[2] * up[1], normal[2] * up[0] - normal[0] * up[2], normal[0] * up[1] - normal[1] * up[0]]
  return {
    s,
    theta,
    r,
    y,
    wall,
    point: [r * sx, y, r * cz],
    normal,
    up,
    side,
  }
}

// A length measured along the wall, as a fraction of the whole outer curve.
export const sAlong = (sec, cm) => cm / (sec.arc ?? arcTable(sec.outer)).at(-1)
export const wallLength = (sec) => (sec.arc ?? arcTable(sec.outer)).at(-1)

// From a click on the 3D body back to (s, theta): the nearest place on the
// outer curve in the half-plane through the click.
export function anchorFromPoint(sec, [x, y, z]) {
  const { outer } = sec
  const L = sec.arc ?? arcTable(outer)
  const r = Math.hypot(x, z)
  let best = Infinity, bestS = 0
  for (let i = 1; i < outer.length; i++) {
    const a = outer[i - 1], b = outer[i]
    const dr = b[0] - a[0], dy = b[1] - a[1]
    const len2 = dr * dr + dy * dy || 1e-12
    const u = Math.min(1, Math.max(0, ((r - a[0]) * dr + (y - a[1]) * dy) / len2))
    const d = Math.hypot(a[0] + dr * u - r, a[1] + dy * u - y)
    if (d < best) (best = d), (bestS = L[i - 1] + (L[i] - L[i - 1]) * u)
  }
  return { s: bestS / L[L.length - 1], theta: Math.atan2(x, z) }
}
