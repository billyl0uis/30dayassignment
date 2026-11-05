import * as THREE from 'three'
import { anchorAt } from '../surface.js'
import { anchorMatrix, loft, sinkFor } from './common.js'

const DEG = Math.PI / 180

// A gob pulled out and pinched flat into a wing. In its own frame: out from
// the wall along y, up the wall along z, thin across x. Rotation turns the
// wing's plane about the surface normal (0° stands it up the wall).

// Where the tweezers bit: narrow notches spaced along the span.
function pinchAt(u, pinches) {
  let v = 0
  for (let k = 0; k < pinches; k++) {
    const c = 0.12 + (0.8 * (k + 0.5)) / pinches
    v = Math.max(v, Math.exp(-(((u - c) / 0.035) ** 2)))
  }
  return v
}

function wingRings(p, sink, pinched) {
  const U = 48, K = 20
  const rings = []
  for (let i = 0; i <= U; i++) {
    const u = i / U
    // Full at the root, widest a third of the way out, rounding to the tip.
    let hh = (p.height / 2) * (0.6 + 0.4 * Math.sin(Math.PI * Math.min(1, u * 1.5))) * Math.sqrt(Math.max(0, 1 - u ** 4))
    let t = p.thickness * (1 - 0.7 * u)
    if (pinched && p.pinches > 0) {
      const n = pinchAt(u, p.pinches)
      hh *= 1 - 0.28 * n
      t *= 1 - 0.45 * n
    }
    const out = -sink + (p.span + sink) * u
    const lift = p.curl * u * u
    const ring = []
    for (let k = 0; k < K; k++) {
      const phi = (k / K) * Math.PI * 2
      ring.push(new THREE.Vector3((t / 2) * Math.sin(phi), out, hh * Math.cos(phi) + lift))
    }
    rings.push(ring)
  }
  return rings
}

export const WINGS = {
  label: 'Wings',
  blurb: 'A pinched, flattened wing. Click the body; use Ring of 2 for a pair.',
  placement: 'point',
  defaults: { span: 2.2, height: 1.6, thickness: 0.35, pinches: 3, curl: 0.4, spin: 0 },
  params: [
    { key: 'span', label: 'Span (out from wall)', kind: 'length', min: 0.3, max: 8, step: 0.05 },
    { key: 'height', label: 'Height', kind: 'length', min: 0.2, max: 6, step: 0.05 },
    { key: 'thickness', label: 'Thickness at root', kind: 'length', min: 0.05, max: 1.5, step: 0.01 },
    { key: 'pinches', label: 'Tweezer pinches', kind: 'count', min: 0, max: 8, step: 1, when: (b) => b.texture === 'tweezer pinch' },
    { key: 'curl', label: 'Tip rise (− droops)', kind: 'length', min: -3, max: 3, step: 0.05 },
    { key: 'spin', label: 'Rotation', kind: 'angle', min: -90, max: 90, step: 1 },
  ],
  textures: ['tweezer pinch', 'smooth'],
  defaultTexture: 'tweezer pinch',
  thickest: (bit) => bit.params.thickness,
  thinnest: (bit) => bit.params.thickness * 0.3,
  reach: (bit) => bit.params.span,
  build(bit, sec, { display = false } = {}) {
    const p = bit.params
    const anchor = anchorAt(sec, bit.s, bit.theta)
    const sink = display ? sinkFor(Math.min(p.height, p.thickness * 2) / 2, anchor) : 0
    const m = anchorMatrix(anchor, (p.spin ?? 0) * DEG)
    const rings = wingRings(p, sink, bit.texture === 'tweezer pinch').map((r) => r.map((q) => q.applyMatrix4(m)))
    return loft(rings)
  },
  callout(bit, sec) {
    const a = anchorAt(sec, bit.s, bit.theta)
    const tip = new THREE.Vector3(0, bit.params.span, bit.params.curl).applyMatrix4(anchorMatrix(a, (bit.params.spin ?? 0) * DEG))
    return { point: tip.toArray(), normal: a.normal }
  },
}
