import { anchorAt, wallLength } from '../surface.js'
import { loft, v3 } from './common.js'

const TAU = Math.PI * 2

// A superimposed gather over the lower body, tooled up into leaves. Only the
// gather layer is counted as the bit (it sits on the body's wall, which is
// unchanged). It starts at the foot edge; the glass under the base isn't
// drawn or counted.
//
// Built as one loop of section per angle round the piece (up the outside of
// the layer, down its inside against the body), joined all the way round.

// How far up a leaf reaches at angle phi: 1 at a leaf's center line, falling
// to 0 at its edges, pointed at the tip. Leaf 0 is centered on theta0.
function lobe(phi, theta0, leaves, width) {
  const period = TAU / leaves
  let d = (phi - theta0) % period
  if (d < 0) d += period
  if (d > period / 2) d -= period
  const x = Math.abs(d) / ((period / 2) * width)
  return x >= 1 ? 0 : (1 - x) ** 0.85
}

export const LILYPAD = {
  label: 'Lily pad',
  blurb: 'A second gather over the lower body, tooled up into leaves. Click where a leaf should point.',
  placement: 'band',
  defaults: { height: 5, band: 1.5, thickness: 0.3, leaves: 6, width: 0.8, curl: 0.4 },
  params: [
    { key: 'height', label: 'Leaf tips (along wall)', kind: 'length', min: 0.5, max: 40, step: 0.1 },
    { key: 'band', label: 'Solid band', kind: 'length', min: 0.2, max: 30, step: 0.1 },
    { key: 'thickness', label: 'Gather thickness', kind: 'length', min: 0.05, max: 1.5, step: 0.01 },
    { key: 'leaves', label: 'Leaves', kind: 'count', min: 2, max: 16, step: 1 },
    { key: 'width', label: 'Leaf width', kind: 'ratio', min: 0.2, max: 1, step: 0.01 },
    { key: 'curl', label: 'Curl out at tips', kind: 'length', min: 0, max: 3, step: 0.05 },
  ],
  textures: ['smooth'],
  defaultTexture: 'smooth',
  thickest: (bit) => bit.params.thickness,
  // The tips are where it's thinnest: the gather is drawn out there.
  thinnest: (bit) => bit.params.thickness * 0.35,
  reach: (bit) => bit.params.thickness + bit.params.curl,
  build(bit, sec, { display = false } = {}) {
    const p = bit.params
    const L = wallLength(sec)
    const H = Math.min(p.height, L * 0.98)
    const band = Math.min(Math.max(0.05, p.band), H)
    const A = Math.max(120, p.leaves * 28)
    const M = display ? 28 : 36
    const sink = display ? 0.02 : 0
    const rings = []
    for (let j = 0; j < A; j++) {
      const phi = bit.theta + (j / A) * TAU
      const top = band + (H - band) * lobe(phi, bit.theta, p.leaves, p.width)
      const outer = [], inner = []
      for (let i = 0; i <= M; i++) {
        const len = (i / M) * top
        const a = anchorAt(sec, len / L, phi)
        const up = len > band && H > band ? (len - band) / (H - band) : 0
        const t = p.thickness * (1 - 0.65 * up ** 1.5)
        const lift = p.curl * up * up
        const n = v3(a.normal), q = v3(a.point)
        outer.push(q.clone().addScaledVector(n, lift + t))
        inner.push(q.clone().addScaledVector(n, lift - sink))
      }
      rings.push([...outer, ...inner.reverse()])
    }
    return loft(rings, { around: true })
  },
  callout(bit, sec) {
    const a = anchorAt(sec, Math.min(bit.params.height, wallLength(sec)) / wallLength(sec), bit.theta)
    return { point: a.point, normal: a.normal }
  },
}
