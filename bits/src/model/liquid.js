// Liquid in the piece: how much it holds, where that weight sits, and what it
// does to tipping. Water (1 g/ml) unless told otherwise.
//
// Upright, the water is the cavity cut off at a level, spun round the axis,
// so its volume and center come exactly from Jackline's Pappus sums.
//
// Tilted, the water doesn't tilt with the glass: its surface stays level and
// it runs toward the low side, which makes a filled piece tip sooner than
// frozen water would. That's modeled by cutting the cavity into thin
// horizontal slices: in each round slice the water is a circular segment,
// whose area and center are exact. It assumes none spills over the rim.
import { solidOfRevolution } from '@jackline/geometry/profile.js'

export const WATER = 1.0 // g/ml

const DEG = 180 / Math.PI

// Cut a polygon to the part at or below height h (Sutherland–Hodgman, one edge).
export function clipBelow(poly, h) {
  const out = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    const ain = a[1] <= h, bin = b[1] <= h
    if (ain) out.push(a)
    if (ain !== bin) {
      const t = (h - a[1]) / (b[1] - a[1])
      out.push([a[0] + (b[0] - a[0]) * t, h])
    }
  }
  return out
}

export const capacity = (sec) => (sec.brimY > sec.floorY ? solidOfRevolution(sec.cavity).volume : 0)

// The water upright at a fill fraction OF CAPACITY (by volume, so "half
// full" means half the ml, not half the height). Heights are in the body's
// own frame; add the foot's lift to stand it on the table.
export function waterAt(sec, fill) {
  const cap = capacity(sec)
  const target = Math.min(1, Math.max(0, fill)) * cap
  if (target <= 1e-9) return { volume: 0, level: sec.floorY, y: sec.floorY, poly: null }
  let lo = sec.floorY, hi = sec.brimY
  for (let k = 0; k < 50; k++) {
    const mid = (lo + hi) / 2
    if (solidOfRevolution(clipBelow(sec.cavity, mid)).volume < target) lo = mid
    else hi = mid
  }
  const poly = clipBelow(sec.cavity, hi)
  const m = solidOfRevolution(poly)
  return { volume: m.volume, level: hi, y: m.y, poly }
}

// Inside radius at each slice of the cavity, floor to brim.
export function cavitySlices(sec, n = 140) {
  const inner = sec.inner
  const y0 = sec.floorY, y1 = sec.brimY
  const dy = (y1 - y0) / n
  const slices = []
  let j = 0
  for (let i = 0; i < n; i++) {
    const y = y0 + (i + 0.5) * dy
    while (j < inner.length - 2 && inner[j + 1][1] < y) j++
    const a = inner[j], b = inner[j + 1]
    const t = b[1] !== a[1] ? Math.min(1, Math.max(0, (y - a[1]) / (b[1] - a[1]))) : 0
    slices.push({ y, R: Math.max(0, a[0] + (b[0] - a[0]) * t), dy })
  }
  return slices
}

// The part of a disk of radius R with x ≥ x0: area and the x of its center.
function segment(R, x0) {
  if (x0 <= -R) return { A: Math.PI * R * R, x: 0 }
  if (x0 >= R) return { A: 0, x: 0 }
  const s = Math.sqrt(R * R - x0 * x0)
  const A = R * R * Math.acos(x0 / R) - x0 * s
  return { A, x: A > 1e-12 ? (2 / 3) * s ** 3 / A : x0 }
}

// Water of a given volume in the piece tilted by `alpha` toward +x (the axis
// leaning toward +x). In the piece's own frame, world-up is
// (−sin α, cos α); the water is everything below a level plane
// −x·sin α + y·cos α = c, with c found so the volume comes out right.
// Returns volume and the center (x, y) in the piece's frame.
export function tiltedWater(slices, volume, alpha) {
  if (volume <= 0) return { volume: 0, x: 0, y: 0 }
  const sa = Math.sin(alpha), ca = Math.cos(alpha)
  const measure = (c) => {
    let V = 0, mx = 0, my = 0
    for (const { y, R, dy } of slices) {
      // Below the plane at this height: x ≥ (y·cos α − c) / sin α.
      if (Math.abs(sa) < 1e-9) {
        // Upright: the level cuts across one slice; count the part below it.
        const f = Math.min(1, Math.max(0, (c / ca - (y - dy / 2)) / dy))
        const v = Math.PI * R * R * dy * f
        V += v
        my += v * (y - dy / 2 + (f * dy) / 2)
        continue
      }
      const seg = segment(R, (y * ca - c) / sa)
      const v = seg.A * dy
      V += v
      mx += v * seg.x
      my += v * y
    }
    return { V, mx, my }
  }
  const ys = slices.map((s) => s.y), Rmax = Math.max(...slices.map((s) => s.R))
  let lo = Math.min(...ys) * ca - Rmax * Math.abs(sa) - 1, hi = Math.max(...ys) * ca + Rmax * Math.abs(sa) + 1
  for (let k = 0; k < 44; k++) {
    const mid = (lo + hi) / 2
    if (measure(mid).V < volume) lo = mid
    else hi = mid
  }
  const m = measure(hi)
  return m.V > 0 ? { volume: m.V, x: m.mx / m.V, y: m.my / m.V } : { volume: 0, x: 0, y: 0 }
}

// How far it tilts before going over, with liquid in it. The glass (and
// its bits) is rigid: mass `rigid.mass`, center `rigid.com` on the table
// frame. It's tipped toward where its weight already leans (the worst way,
// since round water and a round foot are the same every way). Pivoting on
// the foot's edge at distance footR, it goes once the combined center of
// mass passes over that edge.
//   lift: how far the cavity's floor frame sits above the table (the foot).
export function tipWithWater({ rigid, footR, slices, waterVolume, lift = 0, density = WATER }) {
  const [x, y, z] = rigid.com
  const d = Math.hypot(x, z)
  const toward = d > 1e-3 ? Math.atan2(x, z) : null
  const mw = waterVolume * density
  const over = (alpha) => {
    const w = tiltedWater(slices, waterVolume, alpha)
    // The cavity's own frame is lifted by the foot; shift its heights up.
    const wy = w.y + lift
    const M = rigid.mass + mw
    const X = (rigid.mass * d + mw * w.x) / M
    const Y = (rigid.mass * y + mw * wy) / M
    return (X - footR) * Math.cos(alpha) + Y * Math.sin(alpha)
  }
  // Already over at rest: report it as the rigid formula does (negative).
  if (over(0) >= 0) return { deg: Math.atan2(footR - d, Math.max(y, 1e-6)) * DEG, toward, offset: d }
  let a0 = 0, a1 = null
  for (let deg = 2; deg <= 88; deg += 2) {
    const a = deg / DEG
    if (over(a) >= 0) {
      a1 = a
      break
    }
    a0 = a
  }
  if (a1 == null) return { deg: 90, toward, offset: d }
  for (let k = 0; k < 30; k++) {
    const mid = (a0 + a1) / 2
    if (over(mid) >= 0) a1 = mid
    else a0 = mid
  }
  return { deg: ((a0 + a1) / 2) * DEG, toward, offset: d }
}
