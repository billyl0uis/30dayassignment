import * as THREE from 'three'
import { sampleCurve } from '@jackline/geometry/profile.js'
import { anchorAt } from '../surface.js'
import { merge, smooth, sweep } from './common.js'

// A pulled handle: a strap from an upper attachment to a lower one, both on
// the wall at the same angle round the piece, looping out in that vertical
// plane. Like Jackline's handle, but the attachments are yours to place.
// bit.s is the upper attachment, bit.s2 the lower.

// The loop in the (out from axis, height) half-plane. `curve` slides the
// widest part of the loop from low (0) to high (1).
function loop(bit, sec, inset) {
  const p = bit.params
  const U = anchorAt(sec, bit.s, bit.theta), L = anchorAt(sec, bit.s2, bit.theta)
  const reach = p.reach
  const far = Math.max(U.r, L.r) + reach
  const midY = L.y + (U.y - L.y) * (0.2 + 0.6 * p.curve)
  const pts = [
    [U.r - inset, U.y],
    [U.r + reach * 0.7, U.y + reach * 0.22],
    [far, midY],
    [L.r + reach * 0.5, L.y - reach * 0.06],
    [L.r - inset, L.y],
  ]
  const sx = Math.sin(bit.theta), cz = Math.cos(bit.theta)
  const side = new THREE.Vector3(cz, 0, -sx)
  return sampleCurve(pts, { perSeg: 18, floor: false }).pts.map(([r, y]) => ({ p: new THREE.Vector3(r * sx, y, r * cz), out: side }))
}

// A small dome where the thumb goes, on top of the strap near the top.
function thumbRest(path, rad) {
  const i = Math.round(path.length * 0.14)
  const T = path[i + 1].p.clone().sub(path[i - 1].p).normalize()
  const N = new THREE.Vector3(0, 1, 0).addScaledVector(T, -T.y).normalize()
  const a = rad * 1.15, h = rad * 0.9
  const prof = [new THREE.Vector2(0, 0)]
  for (let k = 16; k >= 0; k--) {
    const phi = (k / 16) * (Math.PI / 2)
    prof.push(new THREE.Vector2(a * Math.sin(phi), h * Math.cos(phi)))
  }
  const g = new THREE.LatheGeometry(prof, 32)
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), N))
  g.translate(...path[i].p.clone().addScaledVector(N, rad * 0.85).toArray())
  return g
}

// Gobs where it's stuck on: the strap swells over the last few percent at each end.
const flare = (rad) => (t) => rad * (1 + 0.45 * (1 - smooth(0, 0.09, t)) + 0.45 * smooth(0.91, 1, t))

export const HANDLE = {
  label: 'Handle',
  blurb: 'A pulled handle. Click where the top attaches; drag either end after.',
  placement: 'point',
  defaults: { diameter: 1.1, reach: 4, curve: 0.5, thumb: false },
  params: [
    { key: 'diameter', label: 'Strap ⌀', kind: 'length', min: 0.3, max: 3, step: 0.05 },
    { key: 'reach', label: 'Reach out', kind: 'length', min: 1, max: 12, step: 0.1 },
    { key: 'curve', label: 'Loop fullest', kind: 'ratio', min: 0, max: 1, step: 0.01, ends: ['low', 'high'] },
    { key: 'thumb', label: 'Thumb-rest prunt', kind: 'toggle' },
  ],
  textures: ['smooth'],
  defaultTexture: 'smooth',
  // A click sets the top attachment; the bottom goes a sensible way below.
  place(sec, hit) {
    if (hit.s < 0.45) return { s: Math.min(0.95, hit.s + 0.45), s2: hit.s, theta: hit.theta }
    return { s: hit.s, s2: Math.max(0.06, hit.s - 0.45), theta: hit.theta }
  },
  thickest: (bit) => bit.params.diameter * 1.45,
  thinnest: (bit) => bit.params.diameter,
  neck: (bit) => bit.params.diameter,
  reach: (bit) => bit.params.reach,
  build(bit, sec, { display = false } = {}) {
    const rad = bit.params.diameter / 2
    // The mass mesh stops at the wall; the drawn one sinks in to look fused.
    const path = loop(bit, sec, display ? rad * 0.6 : 0)
    const strap = sweep(path, { wide: flare(rad), tall: flare(rad), sides: 18 })
    return bit.params.thumb ? merge([strap, thumbRest(path, rad)]) : strap
  },
  callout(bit, sec) {
    const path = loop(bit, sec, 0)
    const far = path.reduce((b, q) => (Math.hypot(q.p.x, q.p.z) > Math.hypot(b.p.x, b.p.z) ? q : b))
    const out = new THREE.Vector3(far.p.x, 0, far.p.z).normalize()
    return { point: far.p.toArray(), normal: out.toArray() }
  },
  // Grab points for dragging each end along the wall.
  grips(bit, sec) {
    return [
      { key: 's', point: anchorAt(sec, bit.s, bit.theta).point },
      { key: 's2', point: anchorAt(sec, bit.s2, bit.theta).point },
    ]
  },
}
