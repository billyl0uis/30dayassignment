// Solids of revolution from closed [r, z] polygons in the half-plane r ≥ 0.
// Volumes in mm³.

// Volume and center-of-mass height of the solid made by spinning a closed
// polygon around the axis. Pappus: V = 2π ∫∫ r dA, and the centroid height
// is ∫∫ r·z dA / ∫∫ r dA. Both integrals have exact sums over the polygon's
// edges (Green's theorem), so for a polygon the answer is exact, not an
// estimate; the only error is in how closely the polygon follows the curve.
export function solidOfRevolution(poly) {
  let a1 = 0
  let az = 0
  for (let i = 0; i < poly.length; i++) {
    const [r0, z0] = poly[i]
    const [r1, z1] = poly[(i + 1) % poly.length]
    const c = r0 * z1 - r1 * z0
    a1 += (r0 + r1) * c
    az += c * (2 * r0 * z0 + r0 * z1 + r1 * z0 + 2 * r1 * z1)
  }
  a1 /= 6
  az /= 24
  // Either winding direction: the sign only says which way round it went.
  if (a1 < 0) {
    a1 = -a1
    az = -az
  }
  return { volume: 2 * Math.PI * a1, z: a1 > 1e-12 ? az / a1 : 0 }
}

// The part of a closed polygon at or below height h (Sutherland–Hodgman
// against one line). For capacity to a fill line below the brim.
export function clipBelow(poly, h) {
  const out = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const aIn = a[1] <= h
    const bIn = b[1] <= h
    if (aIn) out.push(a)
    if (aIn !== bIn) {
      const t = (h - a[1]) / (b[1] - a[1])
      out.push([a[0] + (b[0] - a[0]) * t, h])
    }
  }
  return out
}

// The part at or above height h: clipBelow turned over.
export function clipAbove(poly, h) {
  const flip = ([r, z]) => [r, -z]
  return clipBelow(poly.map(flip), -h).map(flip)
}

// The part between two heights, for a band of colour (a foot, a lip wrap).
export const clipBetween = (poly, low, high) => clipAbove(clipBelow(poly, high), low)
