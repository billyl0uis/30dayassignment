import { sampleCurve } from '@jackline/geometry/profile.js'
import { meshMass } from '@jackline/geometry/vessel.js'
import { anchorAt, sAlong } from '../surface.js'
import { clamp01, pathLength, surfacePath, sweep } from './common.js'

const TAU = Math.PI * 2

// A thread laid on the surface. Its size is the round thread as it comes off
// the gather; that glass is all counted, including the part pressed into the
// wall, because it's glass added to the piece. Marvering flattens it into a
// ribbon of the same cross-section area; combing drags it longer and so
// thinner, again keeping the glass that was laid.

// Helix on the body: from (s0, theta0), `wraps` times round, clockwise seen
// from above, climbing `pitch` cm along the wall per wrap (up or down).
function helix(sec, { s0, theta0, wraps, pitch, down }) {
  const n = Math.max(48, Math.ceil(wraps * 120))
  const ds = sAlong(sec, pitch) * (down ? -1 : 1)
  const out = []
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * wraps
    out.push([clamp01(s0 + ds * t), theta0 - t * TAU])
  }
  return out
}

// Combing: a tool pulled through the hot threads at `combs` places round the
// piece drags them into points. Down, up, or alternating (feathered).
function comb(sec, st, { combs, depth, dir }) {
  const dsMax = sAlong(sec, depth)
  const half = Math.PI / combs
  return st.map(([s, theta]) => {
    const a = ((theta % TAU) + TAU) % TAU
    const k = Math.round(a / (2 * half))
    const x = Math.min(1, Math.abs(a - k * 2 * half) / half)
    const sign = dir === 'up' ? 1 : dir === 'down' ? -1 : k % 2 ? 1 : -1
    return [clamp01(s + sign * dsMax * (1 - x) ** 2), theta]
  })
}

// A freehand path: the clicked points, smoothed. Angles are unwrapped first
// so a path crossing the back doesn't swing the long way round.
function freehand(bit) {
  const raw = bit.points?.length >= 2 ? bit.points : [[bit.s, bit.theta], [bit.s, bit.theta - 0.25]]
  const pts = [raw[0]]
  for (let i = 1; i < raw.length; i++) {
    let d = raw[i][1] - pts[i - 1][1]
    d = Math.atan2(Math.sin(d), Math.cos(d))
    pts.push([raw[i][0], pts[i - 1][1] + d])
  }
  return sampleCurve(pts, { perSeg: 24, floor: false }).pts.map(([s, t]) => [clamp01(s), t])
}

function threadSection(bit, r) {
  const f = bit.params.marvered ? Math.max(1, bit.params.flatten) : 1
  const wide = r * Math.sqrt(f), tall = r / Math.sqrt(f)
  return { wide, tall, rise: tall * 0.45 }
}

function buildThread(bit, sec, st, combed) {
  const r = bit.params.diameter / 2
  const path = surfacePath(sec, st)
  const geo = sweep(path, { ...threadSection(bit, r), sides: 12 })
  if (!combed) return { geo, path, r }
  // Combed: the same glass dragged along a longer path. First guess the
  // thinner thread from the lengths, then correct it against the measured
  // mesh (the dragged points fold the thread over itself a little), so the
  // combed thread holds exactly the glass that was laid.
  const laid = meshMass(geo).volume
  geo.dispose()
  const cpath = surfacePath(sec, comb(sec, st, bit.params))
  let rr = r * Math.sqrt(pathLength(path.map((q) => q.p)) / Math.max(1e-9, pathLength(cpath.map((q) => q.p))))
  let cgeo = sweep(cpath, { ...threadSection(bit, rr), sides: 12 })
  const got = meshMass(cgeo).volume
  if (got > 0) {
    rr *= Math.sqrt(laid / got)
    cgeo.dispose()
    cgeo = sweep(cpath, { ...threadSection(bit, rr), sides: 12 })
  }
  return { geo: cgeo, path: cpath, r: rr }
}

function trailPath(bit, sec) {
  const p = bit.params
  return p.path === 'freehand'
    ? freehand(bit)
    : helix(sec, { s0: bit.s, theta0: bit.theta, wraps: p.wraps, pitch: p.pitch, down: p.winds === 'down' })
}

export const TRAIL = {
  label: 'Trail / threading',
  blurb: 'Thread wound on as a helix, or drawn freehand. Click where it starts.',
  placement: 'point',
  defaults: { diameter: 0.18, wraps: 8, pitch: 0.4, winds: 'up', path: 'helix', marvered: false, flatten: 2.5, combs: 8, depth: 1.2, dir: 'feather' },
  params: [
    { key: 'path', label: 'Path', kind: 'choice', options: [['helix', 'Helix'], ['freehand', 'Freehand']] },
    { key: 'diameter', label: 'Thread ⌀ (as laid)', kind: 'length', min: 0.04, max: 1, step: 0.01 },
    { key: 'wraps', label: 'Wraps', kind: 'number', min: 0.25, max: 60, step: 0.25, when: (b) => b.params.path !== 'freehand' },
    { key: 'pitch', label: 'Pitch (along wall)', kind: 'length', min: 0.05, max: 4, step: 0.01, when: (b) => b.params.path !== 'freehand' },
    { key: 'winds', label: 'Winds', kind: 'choice', options: [['up', 'Up from start'], ['down', 'Down from start']], when: (b) => b.params.path !== 'freehand' },
    { key: 'marvered', label: 'Marvered flat', kind: 'toggle' },
    { key: 'flatten', label: 'Width ÷ thickness', kind: 'number', min: 1.2, max: 6, step: 0.1, when: (b) => b.params.marvered },
    { key: 'combs', label: 'Comb strokes', kind: 'count', min: 2, max: 24, step: 1, when: (b) => b.texture === 'combed' && b.params.path !== 'freehand' },
    { key: 'depth', label: 'Comb drag', kind: 'length', min: 0.1, max: 5, step: 0.05, when: (b) => b.texture === 'combed' && b.params.path !== 'freehand' },
    { key: 'dir', label: 'Comb', kind: 'choice', options: [['feather', 'Feathered (alternate)'], ['down', 'Down'], ['up', 'Up']], when: (b) => b.texture === 'combed' && b.params.path !== 'freehand' },
  ],
  textures: ['smooth', 'combed'],
  defaultTexture: 'smooth',
  thickest: (bit) => bit.params.diameter / (bit.params.marvered ? Math.sqrt(bit.params.flatten) : 1),
  reach: (bit) => bit.params.diameter,
  // The thinnest the thread gets, after combing stretches it (for the "too thin" check).
  thinnest(bit, sec) {
    const combed = bit.texture === 'combed' && bit.params.path !== 'freehand'
    const { r, geo } = buildThread(bit, sec, trailPath(bit, sec), combed)
    geo.dispose()
    return (2 * r) / (bit.params.marvered ? Math.sqrt(bit.params.flatten) : 1)
  },
  build(bit, sec) {
    const combed = bit.texture === 'combed' && bit.params.path !== 'freehand'
    return buildThread(bit, sec, trailPath(bit, sec), combed).geo
  },
  callout(bit, sec) {
    const st = trailPath(bit, sec)
    const a = anchorAt(sec, st[0][0], st[0][1])
    return { point: a.point, normal: a.normal }
  },
}

// A trail wound round and round one edge: down from the rim, or up from the
// foot. Turns lie touching and fuse, so the pitch is a little under the
// thread's diameter.
function coilPath(bit, sec) {
  const p = bit.params
  const r = p.diameter / 2
  const atRim = p.edge === 'rim'
  const s0 = atRim ? 1 - sAlong(sec, r * 1.1) : sAlong(sec, r * 1.1)
  return helix(sec, { s0, theta0: bit.theta, wraps: p.turns, pitch: p.diameter * 0.85, down: atRim })
}

export const COIL = {
  label: 'Coil',
  blurb: 'A trail wound round the rim or the foot edge. Click near the edge you want.',
  placement: 'edge',
  defaults: { diameter: 0.45, turns: 2, edge: 'rim', marvered: false, flatten: 2 },
  params: [
    { key: 'edge', label: 'On the', kind: 'choice', options: [['rim', 'Rim'], ['foot', 'Foot edge']] },
    { key: 'diameter', label: 'Coil ⌀', kind: 'length', min: 0.08, max: 1.5, step: 0.01 },
    { key: 'turns', label: 'Turns', kind: 'number', min: 1, max: 12, step: 0.25 },
  ],
  textures: ['smooth'],
  defaultTexture: 'smooth',
  thickest: (bit) => bit.params.diameter,
  reach: (bit) => bit.params.diameter,
  thinnest: (bit) => bit.params.diameter,
  build(bit, sec) {
    return sweep(surfacePath(sec, coilPath(bit, sec)), { wide: bit.params.diameter / 2, tall: bit.params.diameter / 2, rise: bit.params.diameter * 0.3, sides: 14 })
  },
  callout(bit, sec) {
    const [s, t] = coilPath(bit, sec)[0]
    const a = anchorAt(sec, s, t)
    return { point: a.point, normal: a.normal }
  },
}
