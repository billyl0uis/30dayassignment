// The geometry behind the views sheet: what each flat view of the bottle
// is made of, read off the core's section. Lengths in mm, in the core's
// [r, z] form (r out from the axis, z up from the table).

// Paper, landscape, in mm. Four views side by side want the width.
export const PAGES = {
  letter: { w: 279.4, h: 215.9, label: 'US Letter' },
  a4: { w: 297, h: 210, label: 'A4' },
}

// System fonts: a PNG can't load web fonts.
export const SHEET_FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif'

// The outline seen from the front: the outer line up the right, across the
// mouth, and back down its mirror on the left. One closed loop.
export function silhouette(outer) {
  return [...outer, ...outer.toReversed().map(([r, z]) => [-r, z])]
}

// The radius of a line where it first reaches height z, walking from its
// start (the base) upward. For the inside line that's the side of the
// cavity, not the neck above it. Null when the line never gets that high.
export function radiusAt(line, z) {
  for (let i = 1; i < line.length; i++) {
    const [r0, z0] = line[i - 1]
    const [r1, z1] = line[i]
    if ((z0 - z) * (z1 - z) > 0) continue
    if (z1 === z0) return Math.max(r0, r1)
    return r0 + ((z - z0) / (z1 - z0)) * (r1 - r0)
  }
  return null
}

// Where the outer line is widest, as [r, z]: where the widest dimension's
// extension lines start.
export const widestPoint = (outer) => outer.reduce((best, p) => (p[0] > best[0] ? p : best))

// Where the inside is narrowest from the belly up (the core's
// clearOpening, but with the height, for placing the dimension).
export function narrowestBore(inner) {
  let belly = 0
  for (let i = 1; i < inner.length; i++) if (inner[i][0] > inner[belly][0]) belly = i
  return inner.slice(belly).reduce((best, p) => (p[0] < best[0] ? p : best))
}

// The circles seen looking straight down, largest first. Each is a
// diameter and whether it's in sight: the neck's outside and the mouth
// are; the foot hides under a wider body and is drawn dashed.
export function topCircles(m) {
  const circles = [
    { key: 'widest', d: m.maxDiameter, hidden: false },
    { key: 'foot', d: m.footDiameter, hidden: m.footDiameter < m.maxDiameter - 0.01 },
    { key: 'neck', d: m.rimOuterDiameter, hidden: false },
    { key: 'mouth', d: m.rimInnerDiameter, hidden: false },
  ]
  // A foot as wide as the body is the same circle; don't draw it twice.
  return circles.filter((c) => c.key !== 'foot' || c.hidden)
}
