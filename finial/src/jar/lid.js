import { sampleProfile } from '@core/model/profile'
import { solidOfRevolution } from '@core/model/revolve'
import { buildSection } from '@core/model/wall'

// The lid: a drawn top surface (glass hangs below it), a knob on top, and
// a flange or skirt made to fit the body. Lengths in mm. In the lid's own
// frame z = 0 is the bottom of its top, the plane it sits on; the flange
// or skirt hangs below that.
//
// Where the lid comes to rest is worked out, not assumed: it is lowered
// onto the body until glass meets glass.

export const FIT_MODES = {
  inside: {
    label: 'Flange inside the opening',
    help: 'The lid’s top rests on the rim; a flange underneath drops into the opening and keeps it centred.',
  },
  gallery: {
    label: 'Sits on a gallery',
    help: 'The lid drops into the mouth and rests on a ledge inside the neck. Draw the ledge into the body profile.',
  },
  over: {
    label: 'Over the rim',
    help: 'A skirt hangs down outside the rim, like a cap.',
  },
}

export const KNOB_STYLES = {
  none: 'None',
  ball: 'Ball',
  button: 'Button',
  mushroom: 'Mushroom',
  finial: 'Finial (teardrop)',
}

// The gap is your target clearance, all round, between lid and body. A
// starting value to edit; how much you leave depends on how you cold-work.
// TODO(source): set your shop's usual grinding allowance.
export const DEFAULT_GAP = 0.75

export const DEFAULT_LID = {
  mode: 'inside',
  gap: DEFAULT_GAP,
  wall: 4,
  // How far the flange or skirt reaches down.
  drop: 10,
  points: [
    { r: 0, z: 14 },
    { r: 24, z: 11 },
    { r: 38, z: 4, corner: true },
    { r: 38, z: 0 },
  ],
  knob: { style: 'ball', height: 22, diameter: 20, neck: 9 },
}

// Along a polyline (or around a closed polygon), the lowest z, or the
// least or greatest r, found between two limits of the other coordinate.
// Edges are cut at the limits, so a long edge crossing in counts.
function extreme(poly, { closed = false, along, from, to, pick, read }) {
  let best = null
  const n = closed ? poly.length : poly.length - 1
  for (let i = 0; i < n; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const lo = Math.max(from, Math.min(a[along], b[along]))
    const hi = Math.min(to, Math.max(a[along], b[along]))
    if (lo > hi) continue
    const span = b[along] - a[along]
    for (const v of [lo, hi]) {
      const t = span === 0 ? 0 : (v - a[along]) / span
      const value = a[read] + (b[read] - a[read]) * t
      if (best === null || pick(value, best)) best = value
    }
    if (span === 0) {
      const other = b[read]
      if (best === null || pick(other, best)) best = other
    }
  }
  return best
}
const R = 0
const Z = 1
const less = (a, b) => a < b
const more = (a, b) => a > b

// The knob's section, standing on z = 0, as a closed polygon.
export function knobPolygon({ style, height: h, diameter: d, neck: n }) {
  if (style === 'none' || h <= 0 || d <= 0) return null
  const neck = Math.min(n, d) / 2
  if (style === 'ball') {
    const radius = d / 2
    const center = h - radius
    const pts = [[0, 0], [neck, 0]]
    // The neck runs up to where it meets the ball.
    const meet = Math.asin(Math.min(1, neck / radius))
    const startZ = center - radius * Math.cos(meet)
    pts.push([neck, Math.max(0, startZ)])
    const from = -Math.PI / 2 + meet
    for (let k = 1; k <= 32; k++) {
      const a = from + ((Math.PI / 2 - from) * k) / 32
      pts.push([radius * Math.cos(a), center + radius * Math.sin(a)])
    }
    pts[pts.length - 1] = [0, h]
    return pts
  }
  const shapes = {
    button: [
      { r: neck, z: 0 },
      { r: neck, z: h * 0.35, corner: true },
      { r: d / 2, z: h * 0.5 },
      { r: d / 2, z: h * 0.8 },
      { r: d * 0.3, z: h },
      { r: 0, z: h },
    ],
    mushroom: [
      { r: neck, z: 0 },
      { r: neck, z: h * 0.4, corner: true },
      { r: d / 2, z: h * 0.52 },
      { r: d * 0.38, z: h * 0.86 },
      { r: 0, z: h },
    ],
    finial: [
      { r: neck, z: 0 },
      { r: d / 2, z: h * 0.3 },
      { r: d * 0.33, z: h * 0.62 },
      { r: Math.min(neck * 0.3, d * 0.1), z: h * 0.9 },
      { r: 0, z: h },
    ],
  }
  // The smooth curve can bulge a hair past the top; the height you set wins.
  return [[0, 0], ...sampleProfile(shapes[style]).pts.map(([r, z]) => [r, Math.min(z, h)])]
}

// The lowest glass at radius r: the underside of a lid's top.
const undersideAt = (glass, r) => extreme(glass, { closed: true, along: R, from: r, to: r, pick: less, read: Z }) ?? 0

// The lid made and fitted to a body section. Returns
//   section          the lid's top, as wall.js builds it (lid frame)
//   parts            closed glass polygons in the lid frame: top, then the
//                    flange or skirt, then the knob
//   knobPart         the knob's polygon (also last in parts), or null
//   edgeR            the lid edge's radius when the fit sets it, or null
//   seat             height above the table of the lid's z = 0, on the body
//   lowest           height above the table of the lid's lowest glass
//   lowestInside     the same, counting only glass inside the mouth
//   fit              { bodyLabel, bodyDiameter, lidLabel, lidDiameter, gap }
//   problems         things that stop it fitting, in words
//   glassCm3         the lid's glass
export function fitLid(body, lid) {
  const problems = []
  const rimZ = body.outer[body.outer.length - 1][Z]
  const rimOuterR = body.outer[body.outer.length - 1][R]
  const mouthR = body.inner[body.inner.length - 1][R]
  const dropFrom = rimZ - lid.drop
  const w = lid.wall
  const gap = lid.gap

  // The fit sets the lid's edge in two modes; the drawn edge in the other.
  let edgeR = null
  let fit
  let ringPart = null
  if (lid.mode === 'over') {
    // Widest the body gets within the skirt's reach.
    const bodyR = extreme(body.outer, { along: Z, from: dropFrom, to: rimZ, pick: more, read: R })
    const skirtIn = bodyR + gap
    edgeR = skirtIn + w
    fit = { bodyLabel: 'Rim outside', bodyDiameter: 2 * bodyR, lidLabel: 'Skirt inside', lidDiameter: 2 * skirtIn, gap }
    ringPart = { rIn: skirtIn, rOut: edgeR }
  } else if (lid.mode === 'gallery') {
    edgeR = mouthR - gap
    fit = { bodyLabel: 'Mouth inside', bodyDiameter: 2 * mouthR, lidLabel: 'Lid edge', lidDiameter: 2 * edgeR, gap }
  } else {
    // Narrowest the opening gets within the flange's reach.
    const bodyR = extreme(body.inner, { along: Z, from: dropFrom, to: rimZ, pick: less, read: R })
    const flangeOut = bodyR - gap
    fit = { bodyLabel: 'Opening at the flange', bodyDiameter: 2 * bodyR, lidLabel: 'Flange outside', lidDiameter: 2 * flangeOut, gap }
    if (flangeOut - w <= 0) problems.push('The opening is too narrow for a flange this thick.')
    ringPart = { rIn: Math.max(0, flangeOut - w), rOut: flangeOut }
  }

  // When the fit sets the edge, the whole drawn top widens or narrows to
  // it, so the shape you drew keeps its proportions.
  const drawnR = lid.points[lid.points.length - 1].r
  const scale = edgeR === null || drawnR <= 0 ? 1 : edgeR / drawnR
  const points = scale === 1 ? lid.points : lid.points.map((p) => ({ ...p, r: p.r * scale }))
  const section = buildSection(points, { wall: w, under: true })
  const drawnEdgeR = points[points.length - 1].r
  const parts = [section.glass]

  // The flange or skirt runs up to meet the underside of the top, following
  // its curve so the two neither overlap nor leave a gap.
  if (ringPart) {
    const { rIn, rOut } = ringPart
    const top = []
    for (let k = 0; k <= 8; k++) {
      const r = rOut + ((rIn - rOut) * k) / 8
      top.push([r, Math.max(0, undersideAt(section.glass, r))])
    }
    parts.push([[rIn, -lid.drop], [rOut, -lid.drop], ...top])
  }

  const topZ = Math.max(...points.map((p) => p.z))
  const knob = knobPolygon(lid.knob)
  if (knob) parts.push(knob.map(([r, z]) => [r, z + topZ]))

  // Lower the lid onto the body.
  let seat
  if (lid.mode === 'gallery') {
    // The edge drops down the mouth until the inside narrows to meet it.
    let caught = null
    let at = 0
    for (let i = body.inner.length - 1; i > 0 && caught === null; i--) {
      const a = body.inner[i]
      const b = body.inner[i - 1]
      if (a[R] > edgeR && b[R] <= edgeR) {
        caught = a[Z] + ((b[Z] - a[Z]) * (edgeR - a[R])) / (b[R] - a[R])
        at = i - 1
      }
    }
    // A ledge has jar below it wider than the lid. If nothing below is,
    // the lid has fallen to the floor.
    const widerBelow = body.inner.slice(0, at).some((p) => p[R] > edgeR)
    if (caught === null || !widerBelow) {
      problems.push('No gallery: the lid would drop into the jar. Draw a ledge inside the neck, narrower than the mouth.')
      seat = rimZ
    } else {
      seat = caught
    }
  } else {
    // The top's underside comes down on the rim.
    const rimFrom = mouthR
    const rimTo = Math.min(rimOuterR, drawnEdgeR)
    if (drawnEdgeR <= mouthR) {
      problems.push('The lid is narrower than the mouth, so its top can’t rest on the rim. Widen the lid’s edge.')
      seat = rimZ
    } else {
      const underside = extreme(section.glass, { closed: true, along: R, from: rimFrom, to: rimTo, pick: less, read: Z }) ?? 0
      seat = rimZ - underside
    }
  }
  if (gap <= 0) problems.push('No clearance: the lid can’t go on without grinding.')

  const glassCm3 = parts.reduce((sum, poly) => sum + solidOfRevolution(poly).volume, 0) / 1000
  const lowest = seat + Math.min(...parts.flat().map((p) => p[Z]))
  // The lowest glass inside the mouth: what the contents have to stay
  // below. A skirt outside the rim doesn't count.
  const inMouth = parts
    .map((poly) => extreme(poly, { closed: true, along: R, from: 0, to: mouthR, pick: less, read: Z }))
    .filter((z) => z !== null)
  const lowestInside = seat + Math.min(...inMouth)
  const knobPart = knob ? parts[parts.length - 1] : null
  return { section, points, parts, knobPart, edgeR, seat, lowest, lowestInside, topZ, fit, problems, glassCm3 }
}
