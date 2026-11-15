import * as THREE from 'three'
import { anchorAt } from '../surface.js'
import { anchorMatrix, sinkFor } from './common.js'

// How sharply a pulled point tapers. Drawn out further than about half the
// gob's width, the same glass is stretched longer, so the point gets thinner.
const taper = ({ diameter, point }) => 8 * Math.max(1, (2 * point) / diameter)

// A gob dropped on and fused: a dome of the given diameter and height. Its
// tool texture shapes it: drawn up into a point with the tweezers, or
// pressed with a raspberry stamp. Profile runs from the axis under the base,
// out to the edge and over the crown, so the lathe closes on itself.
function profile({ diameter, height, point }, sink, n) {
  const a = diameter / 2
  const pts = [new THREE.Vector2(0, -sink)]
  if (sink > 0) pts.push(new THREE.Vector2(a * 0.9, -sink))
  for (let k = n; k >= 0; k--) {
    const phi = (k / n) * (Math.PI / 2)
    const c = Math.cos(phi)
    // The pulled point only lifts the crown; the shoulder stays put.
    pts.push(new THREE.Vector2(a * Math.sin(phi), height * c + point * c ** taper({ diameter, point })))
  }
  return pts
}

// The stamp flattens the crown and leaves a field of berry bumps across it.
// It moves glass about; it doesn't take any away, so mass is the smooth gob's.
function stamp(geo, { height, stampD, stampDepth }) {
  const p = geo.attributes.position
  const R = stampD / 2
  const pitch = Math.max(0.12, stampD / 5)
  const flat = height - stampDepth * 0.6
  const k = (2 * Math.PI) / pitch
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
    const rho = Math.hypot(x, z)
    if (rho > R * 1.15 || y <= 0) continue
    const fall = 1 - THREE.MathUtils.smoothstep(rho, R * 0.85, R * 1.15)
    // Three waves 60° apart make a hexagonal field, like the stamp's cells.
    const w = (Math.cos(k * x) + Math.cos(k * (0.5 * x + 0.866 * z)) + Math.cos(k * (-0.5 * x + 0.866 * z)) + 1.5) / 4.5
    const top = Math.min(y, flat) + stampDepth * w
    p.setY(i, y + (top - y) * fall)
  }
}

const PRUNT_TEXTURES = ['smooth', 'pulled point', 'raspberry stamp']

// How thick a pulled point is `probe` cm back from its tip, read off the same
// profile that draws it.
export function pointNeck({ diameter, height, point }, probe) {
  const a = diameter / 2
  const z = (phi) => height * Math.cos(phi) + point * Math.cos(phi) ** taper({ diameter, point })
  const target = height + point - probe
  if (target <= 0) return diameter
  let lo = 0, hi = Math.PI / 2 // z falls from the tip (phi 0) to the base
  for (let k = 0; k < 50; k++) {
    const mid = (lo + hi) / 2
    if (z(mid) > target) lo = mid
    else hi = mid
  }
  return 2 * a * Math.sin(hi)
}

function prunt(label, blurb, defaultTexture) {
  return {
    label,
    blurb,
    placement: 'point',
    defaults: { diameter: 1.4, height: 0.6, point: 0.6, stampD: 1.1, stampDepth: 0.12 },
    params: [
      { key: 'diameter', label: 'Diameter', kind: 'length', min: 0.4, max: 4, step: 0.05 },
      { key: 'height', label: 'Height', kind: 'length', min: 0.1, max: 2.5, step: 0.05 },
      { key: 'point', label: 'Pull length', kind: 'length', min: 0.05, max: 2.5, step: 0.05, when: (b) => b.texture === 'pulled point' },
      { key: 'stampD', label: 'Stamp diameter', kind: 'length', min: 0.3, max: 4, step: 0.05, when: (b) => b.texture === 'raspberry stamp' },
      { key: 'stampDepth', label: 'Stamp depth', kind: 'length', min: 0.02, max: 0.5, step: 0.01, when: (b) => b.texture === 'raspberry stamp' },
    ],
    textures: PRUNT_TEXTURES,
    defaultTexture,
    shape: (bit) => ({ ...bit.params, point: bit.texture === 'pulled point' ? bit.params.point : 0 }),
    // The gob's own thickness. A pulled point is drawn out of it, longer and
    // thinner, so it never makes the bit thicker.
    thickest(bit) {
      return this.shape(bit).height
    },
    reach(bit) {
      const p = this.shape(bit)
      return p.height + p.point
    },
    // Thickness where a snag would break it: the pulled point's neck, or the
    // whole gob if it isn't pulled.
    neck(bit, probe = 0.3) {
      const p = this.shape(bit)
      return p.point > 0 ? pointNeck(p, probe) : p.diameter
    },
    build(bit, sec, { display = false } = {}) {
      const p = this.shape(bit)
      const anchor = anchorAt(sec, bit.s, bit.theta)
      const sink = display ? sinkFor(p.diameter / 2, anchor) : 0
      const raspberry = display && bit.texture === 'raspberry stamp'
      // 64 sides round, like Jackline's body mesh: faceting costs ~0.2% of volume.
      const geo = new THREE.LatheGeometry(profile(p, sink, raspberry ? 56 : 28), raspberry ? 80 : display ? 40 : 64)
      if (raspberry) stamp(geo, { height: p.height, stampD: Math.min(p.stampD, p.diameter), stampDepth: p.stampDepth })
      geo.applyMatrix4(anchorMatrix(anchor, bit.spin ?? 0))
      return geo
    },
  }
}

export const PRUNT = prunt('Prunt', 'A gob dropped on and fused. Click the body to place one.', 'smooth')
export const RASPBERRY = prunt('Raspberry prunt', 'A prunt pressed with a raspberry stamp. Click the body to place one.', 'raspberry stamp')
