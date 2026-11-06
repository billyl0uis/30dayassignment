import { solidOfRevolution } from '../geometry/profile.js'
import { colorOf, pointAtS, spanPath } from './color.js'

// How much color glass a piece takes, from the turned profile (sculpting
// is ignored: it reshapes the glass but hardly changes how much there is).
// Everything here is an estimate and is rounded to whole grams for display.

// Area of the surface you get by spinning a wall path round the axis:
// 2π ∫ r dl, summed exactly over straight segments (Pappus).
export function surfaceArea(path) {
  let a = 0
  for (let i = 1; i < path.length; i++) {
    const [r0, y0] = path[i - 1], [r1, y1] = path[i]
    a += Math.PI * (r0 + r1) * Math.hypot(r1 - r0, y1 - y0)
  }
  return a
}

export const outsideArea = (sec, s0, s1) => surfaceArea(spanPath(sec.outer, sec.outerS, s0, s1))
export const insideArea = (sec, s0, s1) => surfaceArea(spanPath(sec.inner, sec.innerS, s0, s1))

// Glass volume of the slice of the piece between s0 and s1: outside wall,
// the rim if it reaches it, back down the inside wall. Where the slice takes
// in the solid base or stem, it runs to the axis, so the solid glass counts.
// Slices at the seams add up to the whole piece exactly.
export function sliceVolume(sec, s0, s1) {
  const in0 = sec.innerS[0]
  const outer = spanPath(sec.outer, sec.outerS, s0, s1)
  if (outer.length < 2) return 0
  const inner = s1 > in0 ? spanPath(sec.inner, sec.innerS, Math.max(s0, in0), s1).reverse() : []
  const poly = []
  if (s0 < in0) poly.push([0, outer[0][1]])
  poly.push(...outer)
  if (s1 >= 1) poly.push(...sec.rim)
  poly.push(...inner)
  if (s0 < in0) poly.push(inner.length ? [0, sec.floorY] : [0, pointAtS(sec, s1)[1]])
  return solidOfRevolution(poly).volume
}

const BAR_KINDS = new Set(['overlay', 'underlay', 'wrap'])

// One line per color and form you'd buy: bar color, frit of a grain, powder.
// Bar lines carry cm³ and grams; frit and powder go straight to grams from
// the coverage rate (g/cm² at full coverage, scaled by the band's coverage).
export function materialsEstimate(sec, colors, studio) {
  const lines = new Map()
  const line = (colorId, form) => {
    const key = `${colorId}|${form}`
    if (!lines.has(key)) lines.set(key, { key, colorId, color: colorOf(studio, colorId), form, cm3: 0, grams: 0, area: 0 })
    return lines.get(key)
  }

  const layered = Array(colors.incalmo.sections.length).fill(0) // bar glass inside each incalmo section, cm³
  const bounds = [0, ...colors.incalmo.seams, 1]
  const addLayer = (s0, s1, cm3) => {
    // Share a layer's volume out to the sections it crosses, by span.
    for (let k = 0; k < layered.length; k++) {
      const lo = Math.max(s0, bounds[k]), hi = Math.min(s1, bounds[k + 1])
      if (hi > lo) layered[k] += (cm3 * (hi - lo)) / (s1 - s0)
    }
  }

  for (const r of colors.regions) {
    if (r.colorId == null) continue
    if (BAR_KINDS.has(r.kind)) {
      const area = r.kind === 'underlay' ? insideArea(sec, r.s0, r.s1) : outsideArea(sec, r.s0, r.s1)
      const cm3 = area * r.pct * sec.wall
      const l = line(r.colorId, 'bar')
      l.area += area
      l.cm3 += cm3
      l.grams += cm3 * studio.density
      addLayer(r.s0, r.s1, cm3)
    } else {
      const area = outsideArea(sec, r.s0, r.s1)
      const rate = r.kind === 'frit' ? studio.coverage[r.grain] * r.density : studio.coverage.powder
      const l = line(r.colorId, r.kind === 'frit' ? `frit-${r.grain}` : 'powder')
      l.area += area
      l.grams += area * rate
    }
  }

  // Incalmo: a colored section is that whole slice of the piece, less the
  // layers already counted on it.
  colors.incalmo.sections.forEach((colorId, k) => {
    if (colorId == null) return
    const cm3 = Math.max(0, sliceVolume(sec, bounds[k], bounds[k + 1]) - layered[k])
    const l = line(colorId, 'bar')
    l.cm3 += cm3
    l.grams += cm3 * studio.density
  })

  const items = [...lines.values()].map((l) => {
    const withWaste = l.grams * (1 + studio.waste)
    const bars = l.form === 'bar' && l.color?.barWeight > 0 ? Math.ceil(withWaste / l.color.barWeight) : null
    return { ...l, withWaste, bars }
  })
  const net = items.reduce((a, l) => a + l.grams, 0)
  return { items, net, waste: net * studio.waste, total: net * (1 + studio.waste) }
}

export const FORM_LABEL = { bar: 'Bar / rod', 'frit-fine': 'Frit, fine', 'frit-medium': 'Frit, medium', 'frit-coarse': 'Frit, coarse', powder: 'Powder' }

// Whole grams only: this is an estimate, so no false precision.
export const grams = (g) => (g > 0 && g < 1 ? '<1 g' : `${Math.round(g)} g`)

// The figures as shown: whole grams per line, with the totals built from
// the rounded lines, so the column adds up on the page you take to the shop.
export function roundedTotals(est, waste) {
  const net = est.items.reduce((a, l) => a + Math.round(l.grams), 0)
  const w = Math.round(net * waste)
  return { net, waste: w, total: net + w }
}
