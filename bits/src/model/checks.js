// Heuristic checks on a planned piece. Every result is a WARNING or a NOTE,
// never a prediction and never a block: the thresholds are placeholders in
// src/config/checks.js, to be calibrated from bench experience.
//
// Each result: { id, check (1–6), level ('warn' | 'note'), bits (ids it's
// about), title, detail (with this piece's numbers), why (the reasoning) }.
import { CHECKS } from '../config/checks.js'
import { BIT_TYPES } from './bits/index.js'
import { anchorAt, wallLength } from './surface.js'

const MM = 0.1 // cm per mm
// Lengths in the words of a check: mm (a decimal under 5 mm), or inches.
const lenText = (cm, units) => (units === 'in' ? `${(cm / 2.54).toFixed(cm < 1.27 ? 3 : 2)} in` : `${(cm * 10).toFixed(cm < 0.5 ? 1 : 0)} mm`)

export const WHY = {
  1: 'A bit much thicker than the wall it sits on holds its heat longer. The thin wall sets up first and the heavy bit is still shrinking as it cools, so the two pull against each other, and that strain gathers right at the attachment. Uneven cooling there is a common place for a crack to start, at the bench or later in the annealer.',
  2: 'Thin glass loses heat fast. A thread or an edge this fine can chill before it fuses properly to the piece, leaving a weak joint, and once cold it is fragile in use, easy to chip or snap off.',
  3: 'Something that sticks out far on a thin neck is a lever. A knock, a cloth, a dish rack or a hand catches it and all the force goes into the narrow part where it joins. Near the rim it is also where a lip or fingers meet the piece.',
  4: 'Glasses that don’t shrink alike as they cool leave strain where they meet, and it can crack days later. Matching COE numbers alone doesn’t guarantee two glasses work together: what counts is that they’ve been tested compatible with each other.',
  5: 'Annealing has to suit the thickest glass in the piece, not the typical wall. A thick foot, stem, prunt or base needs a longer soak and a slower cool than the wall around it, or it can keep strain.',
  6: 'The tip angle is how far it can lean before it falls over, standing on its foot. Small angles mean an easy knock puts it over. Liquid in it can make that better or worse, so every fill level is checked.',
}

// The thickest place in the body's section: the widest circle that fits in
// the glass, mirrored across the axis (a solid base or stem is one piece of
// glass through the middle, not two). Sampled on a grid, so good to about a
// percent of the piece's size.
export function bodyThickest(sec) {
  const poly = sec.section
  const segs = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    if (Math.abs(a[0]) < 1e-9 && Math.abs(b[0]) < 1e-9) continue // the axis isn't an edge
    segs.push([a, b], [[-a[0], a[1]], [-b[0], b[1]]])
  }
  const inside = (x, y) => {
    let c = false
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j]
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
    }
    return c
  }
  const dist = (x, y) => {
    let best = Infinity
    for (const [a, b] of segs) {
      const dx = b[0] - a[0], dy = b[1] - a[1]
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)))
      best = Math.min(best, Math.hypot(a[0] + dx * t - x, a[1] + dy * t - y))
    }
    return best
  }
  const R = Math.max(...poly.map((p) => p[0])), H = sec.height
  const h = Math.max(0.02, Math.max(R, H) / 110)
  let best = { thickness: 0, at: [0, 0] }
  for (let y = h / 2; y < H; y += h)
    for (let x = h / 2; x < R; x += h) {
      if (!inside(x, y)) continue
      const d = dist(x, y)
      if (2 * d > best.thickness) best = { thickness: 2 * d, at: [x, y] }
    }
  // The grid can miss the true center by half a cell, which would report the
  // glass thinner than it is (the unsafe way for annealing). Climb from the
  // best grid point in shrinking steps to the real widest circle.
  let [bx, by] = best.at, bd = best.thickness / 2
  for (let step = h / 2; step > h / 200; step /= 2) {
    let moved = true
    while (moved) {
      moved = false
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const x = Math.max(0, bx + dx * step), y = by + dy * step
        if (!inside(x, y)) continue
        const d = dist(x, y)
        if (d > bd + 1e-9) (bx = x), (by = y), (bd = d), (moved = true)
      }
    }
  }
  return { thickness: 2 * bd, at: [bx, by] }
}

const label = (bits, i) => `#${i + 1} ${bits[i].type === 'wings' ? 'wing' : BIT_TYPES[bits[i].type].label.toLowerCase()}`

// The glass a bit sits on: the wall under its anchor; the thinner of a
// handle's two ends; for an applied foot, the base it's stuck to. Below the
// cavity floor the glass is solid (a base, a stem), so there it's the whole
// solid section across, not the wall setting.
function wallUnder(bit, mb, sec) {
  if (bit.type === 'foot') return Math.min(sec.floorY, 2 * sec.footR)
  const at = (a) => (a.y < sec.floorY ? Math.max(a.wall, 2 * a.r) : a.wall)
  if (bit.type === 'handle') return Math.min(at(mb.anchor), at(anchorAt(sec, bit.s2, bit.theta)))
  return at(mb.anchor)
}

export function runChecks({ m, worst, bits, glasses, bodyGlass, cfg = CHECKS, units = 'mm' }) {
  const mm = (cm) => lenText(cm, units)
  const out = []
  const sec = m.sec
  const L = wallLength(sec)
  const byId = Object.fromEntries(glasses.map((g) => [g.id, g]))
  const body = byId[bodyGlass]

  bits.forEach((bit, i) => {
    const t = BIT_TYPES[bit.type]
    const mb = m.bits[i]
    if (t.addsMass === false) return
    const name = label(bits, i)

    // 1. Bit vs the wall under it.
    const wall = wallUnder(bit, mb, sec)
    const thick = t.thickest(bit)
    if (wall > 0 && thick / wall > cfg.bitToWallRatio)
      out.push({
        id: `wall-${bit.id}`, check: 1, level: 'warn', bits: [bit.id],
        title: `${name} is much heavier than the wall under it`,
        detail: `${mm(thick)} thick on a ${mm(wall)} ${bit.type === 'foot' ? 'base' : 'wall'}: ${(thick / wall).toFixed(1)}× (warns over ${cfg.bitToWallRatio}×).`,
      })

    // 2. Too thin to survive.
    const thin = t.thinnest?.(bit, sec)
    const isThread = bit.type === 'trail' || bit.type === 'coil' || (bit.type === 'foot' && bit.params.style === 'coiled')
    const isEdge = bit.type === 'wings' || bit.type === 'lilypad'
    const min = isThread ? cfg.minThread_mm * MM : isEdge ? cfg.minEdge_mm * MM : null
    if (thin != null && min != null && thin < min)
      out.push({
        id: `thin-${bit.id}`, check: 2, level: 'warn', bits: [bit.id],
        title: `${name} may be too thin to survive`,
        detail: `${isThread ? 'Thread' : 'Edge'} about ${mm(thin)}${bit.texture === 'combed' ? ' after combing' : ''} (warns under ${mm((isThread ? cfg.minThread_mm : cfg.minEdge_mm) * MM)}).`,
      })
    if ((bit.type === 'prunt' || bit.type === 'raspberry') && bit.texture === 'pulled point') {
      const neck = t.neck(bit, cfg.pointProbe_mm * MM)
      if (neck < cfg.minPointNeck_mm * MM)
        out.push({
          id: `point-${bit.id}`, check: 2, level: 'warn', bits: [bit.id],
          title: `${name}: the pulled point is very fine`,
          detail: `${mm(neck)} thick ${mm(cfg.pointProbe_mm * MM)} back from the tip (warns under ${mm(cfg.minPointNeck_mm * MM)}).`,
        })
    }

    // 3. Snag / break-off.
    const reach = t.reach(bit)
    const neck = t.neck ? t.neck(bit, cfg.pointProbe_mm * MM) : t.thickest(bit)
    // (Wings have their own span check below, so they aren't flagged twice.)
    if (!['foot', 'lilypad', 'wings'].includes(bit.type) && reach > cfg.snagReach_mm * MM && reach / Math.max(neck, 1e-3) > cfg.snagSlenderness)
      out.push({
        id: `snag-${bit.id}`, check: 3, level: 'warn', bits: [bit.id],
        title: `${name} sticks out on a thin neck`,
        detail: `Reaches ${mm(reach)} from the body on a ${mm(neck)} neck: ${(reach / neck).toFixed(1)}× as long as it is thick (warns past ${mm(cfg.snagReach_mm * MM)} and ${cfg.snagSlenderness}×).`,
      })
    const fromRim = (1 - bit.s) * L
    const proud = bit.type === 'trail' || bit.type === 'coil' ? 0 : reach
    if (t.placement === 'point' && bit.type !== 'handle' && fromRim < cfg.rimZone_mm * MM && proud > cfg.rimProtrusion_mm * MM)
      out.push({
        id: `rim-${bit.id}`, check: 3, level: 'warn', bits: [bit.id],
        title: `${name} is close to the rim`,
        detail: `${mm(fromRim)} below the rim and standing out ${mm(proud)}, where a lip or a hand meets the piece (warns within ${mm(cfg.rimZone_mm * MM)}, over ${mm(cfg.rimProtrusion_mm * MM)} out).`,
      })
    if (bit.type === 'wings') {
      const { span, height } = bit.params
      if (span > cfg.wingSpanMax_mm * MM || span / height > cfg.wingSpanToHeight)
        out.push({
          id: `wing-${bit.id}`, check: 3, level: 'warn', bits: [bit.id],
          title: `${name} has a long unsupported span`,
          detail: `${mm(span)} out on a ${mm(height)} root: ${(span / height).toFixed(1)}× its height (warns past ${mm(cfg.wingSpanMax_mm * MM)} or ${cfg.wingSpanToHeight}×).`,
        })
    }

    // 4. Glass compatibility.
    const g = byId[bit.glass]
    if (g && body && g.id !== body.id) {
      const coeA = String(body.coe).trim(), coeB = String(g.coe).trim()
      const grpA = String(body.group).trim(), grpB = String(g.group).trim()
      if (coeA && coeB && coeA !== coeB)
        out.push({
          id: `coe-${bit.id}`, check: 4, level: 'warn', bits: [bit.id],
          title: `${name}: COE differs from the body`,
          detail: `${g.name} is COE ${coeB}; the body (${body.name}) is COE ${coeA}.`,
        })
      else if (grpA && grpB && grpA !== grpB)
        out.push({
          id: `grp-${bit.id}`, check: 4, level: 'warn', bits: [bit.id],
          title: `${name}: not in the body’s tested group`,
          detail: `${g.name} is in “${grpB}”; the body (${body.name}) is in “${grpA}”.`,
        })
      else if (!grpA || !grpB)
        out.push({
          id: `untested-${bit.id}`, check: 4, level: 'note', bits: [bit.id],
          title: `${name}: ${g.name} on ${body.name}, compatibility not recorded`,
          detail: coeA && coeB ? `Both COE ${coeA}, but no tested-compatible group entered for ${!grpA ? body.name : g.name}.` : `Enter COE and a tested-compatible group for both glasses to check this.`,
        })
    }
  })

  // 5. Annealing: the thickest section anywhere on the piece.
  const bt = bodyThickest(sec)
  let thickest = { cm: bt.thickness, where: bt.at[1] <= sec.floorY + 0.05 ? (sec.floorY > 2 * sec.footR ? 'the solid stem' : 'the solid base') : 'the body wall', bits: [] }
  bits.forEach((bit, i) => {
    const t = BIT_TYPES[bit.type]
    if (t.addsMass === false) return
    const c = t.thickest(bit)
    if (c > thickest.cm) thickest = { cm: c, where: label(bits, i), bits: [bit.id] }
  })
  const typicalWall = [...sec.walls].sort((a, b) => a - b)[Math.floor(sec.walls.length / 2)]
  out.push({
    id: 'anneal', check: 5, level: 'note', bits: thickest.bits,
    title: `Anneal for ${mm(thickest.cm)}: ${thickest.where}`,
    detail: `The thickest glass on the piece is about ${mm(thickest.cm)}, in ${thickest.where}. Set the anneal for that, not the ${mm(typicalWall)} wall.`,
  })

  // 6. Stability, at whichever fill (empty to brimful) is least steady.
  const tips = [{ fill: null, deg: m.tip.deg }]
  if (worst) tips.push({ fill: worst.fill, deg: worst.tip.deg })
  const low = tips.reduce((a, b) => (b.deg < a.deg ? b : a))
  if (low.deg < cfg.minTipDeg) {
    const when = low.fill == null || low.fill === 0 ? 'empty' : `${Math.round(low.fill * 100)}% full`
    out.push({
      id: 'stability', check: 6, level: 'warn', bits: [],
      title: low.deg < 0 ? `Won’t stand on its own (${when})` : `Tips easily: ${Math.round(low.deg)}° ${when}`,
      detail: low.deg < 0 ? 'The center of mass is already past the edge of the foot.' : `Minimum tip angle ${Math.round(low.deg)}° when ${when} (warns under ${cfg.minTipDeg}°).`,
    })
  }

  return out.map((r) => ({ ...r, why: WHY[r.check] }))
}
