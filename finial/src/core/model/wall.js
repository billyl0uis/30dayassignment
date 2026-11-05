import { sampleProfile, thicknessAlong } from './profile'

// From the drawn outside line to the glass itself. The inside line is the
// outside pushed inward by the wall thickness, measured square to the wall
// (not sideways), so a sloped shoulder or a floor gets the thickness you
// set. A vessel starts at the center of its base, so points[0].r is 0.

// A sharp corner's miter can run far past the wall; this caps it at so many
// thicknesses, like a corner ground off.
const MITER_LIMIT = 4

// Left of the direction of travel: walking out along the floor then up the
// wall, that's into the cavity.
const leftNormal = (a, b) => {
  const dr = b[0] - a[0]
  const dz = b[1] - a[1]
  const l = Math.hypot(dr, dz)
  return l < 1e-9 ? null : [-dz / l, dr / l]
}

// Each point of a polyline moved left by its own thickness. Where two
// edges meet, the point goes to where their two offset lines cross (a
// miter), so straight walls and their corners come out exact.
export function offsetInward(pts, thickness) {
  const last = pts.length - 1
  return pts.map((p, i) => {
    let before = null
    for (let k = i; k > 0 && !before; k--) before = leftNormal(pts[k - 1], pts[k])
    let after = null
    for (let k = i; k < last && !after; k++) after = leftNormal(pts[k], pts[k + 1])
    const t = thickness[i]
    let n
    if (before && after) {
      const dot = before[0] * after[0] + before[1] * after[1]
      const m = [before[0] + after[0], before[1] + after[1]]
      const scale = Math.min(1 / Math.max(1 + dot, 1e-9), MITER_LIMIT / (Math.hypot(...m) || 1))
      n = [m[0] * scale, m[1] * scale]
    } else {
      n = before ?? after ?? [0, 0]
    }
    return [Math.max(0, p[0] + n[0] * t), p[1] + n[1] * t]
  })
}

function crossing(a, b, c, d) {
  const r = [b[0] - a[0], b[1] - a[1]]
  const s = [d[0] - c[0], d[1] - c[1]]
  const denom = r[0] * s[1] - r[1] * s[0]
  if (Math.abs(denom) < 1e-12) return null
  const q = [c[0] - a[0], c[1] - a[1]]
  const t = (q[0] * s[1] - q[1] * s[0]) / denom
  const u = (q[0] * r[1] - q[1] * r[0]) / denom
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + r[0] * t, a[1] + r[1] * t] : null
}

// Where the wall bends tighter than its own thickness, the pushed-in line
// crosses itself in a small loop. Cut each loop out at the crossing.
export function removeLoops(pts) {
  const out = pts.map((p) => [...p])
  for (let i = 0; i < out.length - 2; i++) {
    // The farthest crossing first, so a loop inside a loop goes in one cut.
    for (let j = out.length - 2; j >= i + 2; j--) {
      const x = crossing(out[i], out[i + 1], out[j], out[j + 1])
      if (x) {
        out.splice(i + 1, j - i, x)
        break
      }
    }
  }
  return out
}

// The vessel in section: the outside line, the inside line, the glass
// between them and the cavity inside. All closed polygons are [r, z] pairs
// ready for solidOfRevolution.
//   outer, inner — open polylines, base center to rim
//   thickness    — wall thickness at each outer sample
//   glass        — the glass, as one closed polygon
//   cavity       — the inside, closed across the top at the inner rim,
//                  which is how high it fills before it spills
//
// under: the drawn line is a top surface with the glass hanging below it
// (a lid, a stopper's cap). Worked as the same piece upside down, so the
// maths is the vessel's, then turned back over.
export function buildSection(points, { wall, under = false }) {
  if (under) {
    const top = Math.max(...points.map((p) => p.z))
    const flip = ([r, z]) => [r, top - z]
    const s = buildSection(
      points.map((p) => ({ ...p, z: top - p.z })),
      { wall },
    )
    return {
      ...s,
      outer: s.outer.map(flip),
      inner: s.inner.map(flip),
      glass: s.glass.map(flip),
      cavity: s.cavity.map(flip),
      brim: top - s.brim,
    }
  }
  const sampled = sampleProfile(points)
  const outer = sampled.pts
  const thickness = thicknessAlong(points, sampled, wall)
  const inner = removeLoops(offsetInward(outer, thickness))
  const floor = [0, inner[0][1]]
  const brim = inner[inner.length - 1][1]
  // Across the rim the wall is cut square: outer rim straight to inner rim.
  const glass = [...outer, ...[...inner].reverse(), floor]
  const cavity = [floor, ...inner, [0, brim]]
  return { outer, inner, thickness, span: sampled.span, glass, cavity, brim }
}
