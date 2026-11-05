// Starting pieces. Each loads as an ordinary, editable piece (one undo step):
// a Jackline profile with a wall per point, its glass, and its bits in
// working order. Bits are placed by HEIGHT (cm up from the table, before any
// applied foot lifts the piece), so they land in the right place on the wall
// however long the curve is. All sizes are cm, like the rest of the model.
import { PRESETS as JACKLINE } from '@jackline/model/presets.js'
import { BIT_TYPES } from './bits/index.js'
import { bodySection } from './derived.js'
import { arcTable } from './surface.js'

const LEFT = -Math.PI / 2 // 9:00
const RIGHT = Math.PI / 2 // 3:00

const glass = (id, name, color, density = 2.5) => ({ id, name, coe: '', group: '', density, color })

export const PRESETS = [
  {
    id: 'roemer',
    name: 'Roemer',
    blurb: 'Hollow stem with a ring of raspberry prunts, on a wound foot.',
    // Stem and bowl are one hollow bubble: the cavity runs down into the stem.
    points: [[1.9, 0], [1.7, 1.5], [1.6, 4.5], [1.9, 6.0], [3.6, 8.5], [4.2, 11.5], [3.7, 14.5]],
    walls: [0.35, 0.3, 0.3, 0.3, 0.28, 0.25, 0.22],
    floor: 0.4,
    glasses: [glass('g-body', 'Forest green', '#3f7f4f')],
    bits: [
      { type: 'foot', params: { style: 'coiled', diameter: 6.5, thread: 0.4, turns: 5 } },
      { type: 'raspberry', y: 3.2, theta: 0, params: { diameter: 1.2, height: 0.5, stampD: 1.0, stampDepth: 0.1 }, ring: 6 },
    ],
  },
  {
    id: 'threaded',
    name: 'Threaded tumbler',
    blurb: 'A straight tumbler with fine threading wound round the lower third.',
    points: JACKLINE.tumbler.points,
    walls: JACKLINE.tumbler.points.map(() => JACKLINE.tumbler.wall),
    floor: JACKLINE.tumbler.floor,
    glasses: [glass('g-body', 'Clear batch', '#ffffff'), glass('g-thread', 'Cobalt thread', '#2f56c9')],
    bits: [
      { type: 'trail', y: 0.5, theta: 0, glass: 'g-thread', params: { diameter: 0.16, wraps: 12, pitch: 0.28, winds: 'up', path: 'helix' } },
    ],
  },
  {
    id: 'lilypad',
    name: 'Lily-pad pitcher',
    blurb: 'A superimposed lily-pad gather, a pulled handle and a spout.',
    points: JACKLINE.pitcher.points,
    walls: JACKLINE.pitcher.points.map(() => JACKLINE.pitcher.wall),
    floor: JACKLINE.pitcher.floor,
    glasses: [glass('g-body', 'Aqua', '#9fe0e0')],
    bits: [
      { type: 'lilypad', theta: 0, params: { height: 8, band: 3, thickness: 0.3, leaves: 5, width: 0.75, curl: 0.5 } },
      { type: 'handle', y: 17, y2: 7, theta: LEFT, params: { diameter: 1.3, reach: 4.5, curve: 0.45 } },
      { type: 'lip', theta: RIGHT, params: { pull: 1.6, width: 4, depth: 3 } },
    ],
  },
  {
    id: 'winged',
    name: 'Winged goblet',
    blurb: 'A bowl on a solid stem with a pair of pinched wings, on an applied foot.',
    // Jackline's wine glass with its foot taken off: the foot is applied here.
    points: [[0.55, 0], [0.45, 0.6], [0.42, 6], [0.9, 7.4], [2.9, 9], [4.1, 12.5], [3.6, 17.5]],
    walls: [0.14, 0.14, 0.14, 0.14, 0.14, 0.14, 0.14],
    floor: 7.9,
    glasses: [glass('g-body', 'Clear batch', '#ffffff')],
    bits: [
      { type: 'foot', params: { style: 'disk', diameter: 7.4, thickness: 0.35, stem: 0 } },
      { type: 'wings', y: 3.4, theta: RIGHT, params: { span: 2.0, height: 1.5, thickness: 0.36, pinches: 3, curl: 0.5 }, ring: 2 },
    ],
  },
  {
    id: 'coiled',
    name: 'Coiled bowl',
    blurb: 'An open bowl with a coil wound on the rim, on a wound foot (delete it for a plain base).',
    points: JACKLINE.bowl.points,
    walls: JACKLINE.bowl.points.map(() => JACKLINE.bowl.wall),
    floor: JACKLINE.bowl.floor,
    glasses: [glass('g-body', 'Amber', '#c47a1f')],
    bits: [
      { type: 'foot', params: { style: 'coiled', diameter: 6, thread: 0.45, turns: 2 } },
      { type: 'coil', theta: 0, params: { edge: 'rim', diameter: 0.5, turns: 1.5 } },
    ],
  },
]

// Fraction along the outer wall where it first reaches height y.
export function sAtHeight(sec, y) {
  const { outer } = sec
  const L = arcTable(outer)
  for (let i = 1; i < outer.length; i++) {
    const a = outer[i - 1], b = outer[i]
    if ((a[1] - y) * (b[1] - y) <= 0 && a[1] !== b[1]) {
      const u = (y - a[1]) / (b[1] - a[1])
      return (L[i - 1] + (L[i] - L[i - 1]) * u) / L.at(-1)
    }
  }
  return y <= outer[0][1] ? 0 : 1
}

let n = 0
const newId = () => `p${Date.now().toString(36)}${(n++).toString(36)}`

// A preset as a piece the store can load: real bits with ids, anchors and
// full params, rings expanded into evenly spaced copies (clockwise from above).
export function buildPreset(def) {
  const sec = bodySection(def)
  const bits = []
  for (const b of def.bits) {
    const t = BIT_TYPES[b.type]
    const s = b.y != null ? sAtHeight(sec, b.y) : t.placement === 'rim' ? 1 : 0
    const one = (theta) => ({
      id: newId(),
      type: b.type,
      s,
      ...(b.y2 != null ? { s2: sAtHeight(sec, b.y2) } : {}),
      theta,
      spin: 0,
      params: { ...t.defaults, ...b.params },
      texture: b.texture ?? t.defaultTexture,
      glass: b.glass ?? def.glasses[0].id,
    })
    const count = b.ring ?? 1
    for (let k = 0; k < count; k++) bits.push(one((b.theta ?? 0) - (k * 2 * Math.PI) / count))
  }
  return {
    pieceName: def.name,
    points: def.points.map((p) => [...p]),
    walls: [...def.walls],
    floor: def.floor,
    bodyGlass: def.glasses[0].id,
    glasses: def.glasses.map((g) => ({ ...g })),
    bits,
    fill: 1,
  }
}
