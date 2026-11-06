import { buildSection } from '@jackline/geometry/profile.js'
import { measureMesh } from '@jackline/geometry/vessel.js'
import { BIT_TYPES, addsMass } from './bits/index.js'
import { clockOf, combine, massOf, tipAngle } from './physics.js'
import { anchorAt, arcTable } from './surface.js'
import { WATER, capacity, cavitySlices, tipWithWater, waterAt } from './liquid.js'
import { useStore } from './store.js'

// The body section, with the running length along its outer wall for anchoring bits.
export function bodySection({ points, walls, floor }) {
  const sec = buildSection({ points, wall: walls, floor })
  sec.arc = arcTable(sec.outer)
  return sec
}

// The body's glass, measured off the closed lathe mesh of its section. A
// pulled lip only moves rim glass, so the body is measured un-pulled.
export function bodyMass(sec, density) {
  const geo = measureMesh(sec.section, sec, {})
  const m = massOf(geo, density)
  geo.dispose()
  return m
}

const lifted = (com, lift) => [com[0], com[1] + lift, com[2]]

// The applied foot, if there is one: how far it lifts everything else.
export function footOf(bits) {
  const foot = bits.find((b) => BIT_TYPES[b.type].lift)
  return foot ? { bit: foot, lift: BIT_TYPES.foot.lift(foot), footprint: BIT_TYPES.foot.footprint(foot) } : null
}

// One bit on the body: where it is, and what it weighs (in place, so with
// the foot's lift added for anything standing on the foot).
export function measureBit(bit, sec, glassById, lift = 0) {
  const type = BIT_TYPES[bit.type]
  const anchor = anchorAt(sec, bit.s, bit.theta)
  const ownLift = type.lift ? 0 : lift
  const tag = type.callout ? type.callout(bit, sec) : { point: anchor.point, normal: anchor.normal }
  const base = {
    anchor,
    lift: ownLift,
    tag: { point: lifted(tag.point, ownLift), normal: tag.normal },
    height: type.lift ? 0 : anchor.y,
    clock: clockOf(bit.theta),
    thickest: type.thickest(bit),
  }
  if (!addsMass(bit)) return { ...base, volume: 0, mass: 0, com: lifted(anchor.point, ownLift) }
  const glass = glassById[bit.glass]
  const geo = type.build(bit, sec)
  const m = massOf(geo, glass?.density ?? 2.5)
  geo.dispose()
  return { ...base, ...m, com: lifted(m.com, ownLift) }
}

// Everything the readout needs, for the piece as it stands.
export function measurePiece({ points, walls, floor, bits, glasses, bodyGlass }) {
  const sec = bodySection({ points, walls, floor })
  const glassById = Object.fromEntries(glasses.map((g) => [g.id, g]))
  const foot = footOf(bits)
  const lift = foot?.lift ?? 0
  const body0 = bodyMass(sec, glassById[bodyGlass]?.density ?? 2.5)
  const body = { ...body0, com: lifted(body0.com, lift) }
  const perBit = bits.map((b) => measureBit(b, sec, glassById, lift))
  const total = combine([body, ...perBit])
  const footR = foot?.footprint ?? sec.footR
  return { sec, lift, footR, body, bits: perBit, total, tip: tipAngle(total.com, footR) }
}

// The piece with liquid in it, `fill` of its capacity by volume: totals with
// the water's weight, and the tip angle with the water staying level as it
// tilts. `slices` can be passed in to reuse them.
export function measureFilled(m, fill, slices = cavitySlices(m.sec)) {
  const cap = capacity(m.sec)
  const w = waterAt(m.sec, fill)
  const water = { volume: w.volume, mass: w.volume * WATER, com: [0, w.y + m.lift, 0], level: w.level + m.lift, poly: w.poly }
  const total = combine([m.total, water])
  const tip = tipWithWater({ rigid: m.total, footR: m.footR, slices, waterVolume: w.volume, lift: m.lift })
  return { fill, capacity: cap, water, total, tip }
}

// The worst fill for tipping, checked every 10% from empty to brimful.
// A piece can be steadiest full and least steady part full, so check them all.
export function worstFill(m) {
  if (capacity(m.sec) <= 0) return null
  const slices = cavitySlices(m.sec)
  let worst = null
  for (let k = 0; k <= 10; k++) {
    const f = measureFilled(m, k / 10, slices)
    if (!worst || f.tip.deg < worst.tip.deg) worst = f
  }
  return worst
}

// Measures with liquid: the empty piece (useMeasures), at the fill on the
// slider, and the worst fill. The worst doesn't depend on the slider, so
// dragging it doesn't redo that search.
// Many panels ask for the same measures at once. Each of these remembers its
// last answer and the inputs it came from (compared by identity, which the
// store keeps stable until something changes), so one change is measured
// once, not once per panel.
export function memoLast(fn) {
  let args = null, value
  return (...next) => {
    if (args && next.length === args.length && next.every((a, i) => a === args[i])) return value
    args = next
    return (value = fn(...next))
  }
}

const measureShared = memoLast((points, walls, floor, bits, glasses, bodyGlass) => measurePiece({ points, walls, floor, bits, glasses, bodyGlass }))
const slicesShared = memoLast((sec) => cavitySlices(sec))
const filledShared = memoLast((m, fill, slices) => measureFilled(m, fill, slices))
const worstShared = memoLast((m) => worstFill(m))

export function useLiquid() {
  const m = useMeasures()
  const fill = useStore((s) => s.fill)
  const slices = slicesShared(m.sec)
  return { empty: m, filled: filledShared(m, fill, slices), worst: worstShared(m) }
}

export function useMeasures() {
  const points = useStore((s) => s.points)
  const walls = useStore((s) => s.walls)
  const floor = useStore((s) => s.floor)
  const bits = useStore((s) => s.bits)
  const glasses = useStore((s) => s.glasses)
  const bodyGlass = useStore((s) => s.bodyGlass)
  return measureShared(points, walls, floor, bits, glasses, bodyGlass)
}
