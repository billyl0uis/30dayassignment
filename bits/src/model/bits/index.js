import { FOOT, LIP } from './foot.js'
import { HANDLE } from './handle.js'
import { LILYPAD } from './lilypad.js'
import { PRUNT, RASPBERRY } from './prunt.js'
import { COIL, TRAIL } from './trail.js'
import { WINGS } from './wings.js'

// Every bit type. Each one has:
//   label, blurb, placement ('point' | 'band' | 'edge' | 'base' | 'rim')
//   defaults, params (its shaping handles), textures, defaultTexture
//   place(sec, hit)   where a click puts it ({ s, theta, ... }); optional
//   build(bit, sec, { display }) → a closed mesh in world space, or null
//   thickest(bit), thinnest?(bit, sec), reach(bit)   for the checks to come
//   callout?(bit, sec) → { point, normal } for its number tag
// and optionally addsMass: false (lip), single (foot), lift/footprint (foot),
// deformBody (lip), grips (handle ends).
export const BIT_TYPES = {
  prunt: PRUNT,
  raspberry: RASPBERRY,
  lilypad: LILYPAD,
  trail: TRAIL,
  coil: COIL,
  foot: FOOT,
  wings: WINGS,
  handle: HANDLE,
  lip: LIP,
}

export const PALETTE = Object.entries(BIT_TYPES).map(([id, t]) => [id, t.label])

// Where a click on the body puts a new bit of this type.
export function placeBit(type, sec, hit) {
  const t = BIT_TYPES[type]
  if (t.place) return t.place(sec, hit)
  if (t.placement === 'band') return { s: 0, theta: hit.theta }
  if (t.placement === 'edge') return { s: hit.s, theta: hit.theta, params: { edge: hit.s > 0.5 ? 'rim' : 'foot' } }
  return { s: hit.s, theta: hit.theta }
}

export const addsMass = (bit) => BIT_TYPES[bit.type].addsMass !== false
