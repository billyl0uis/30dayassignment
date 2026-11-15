import { describe, expect, it } from 'vitest'
import { BIT_TYPES } from './bits/index.js'
import { bodySection, measurePiece } from './derived.js'
import { clockOf, meshMass } from './physics.js'
import { DEFAULT_GLASSES } from '../config/glass.js'

const near = (a, b, rel) => expect(Math.abs(a - b) / Math.abs(b)).toBeLessThan(rel)

// A straight cylinder body, r = 3 cm, 10 cm tall: the outer wall is 10 cm
// long, so s (fraction up the wall) is just height / 10.
const CYL = { points: [[3, 0], [3, 5], [3, 10]], walls: [0.3, 0.3, 0.3], floor: 0.6 }
const sec = bodySection(CYL)
const R = 3

const bit = (type, params = {}, at = {}) => ({
  id: type,
  type,
  s: 0.5,
  theta: 0,
  spin: 0,
  texture: BIT_TYPES[type].defaultTexture,
  glass: DEFAULT_GLASSES[0].id,
  ...at,
  params: { ...BIT_TYPES[type].defaults, ...params },
})
const vol = (b) => meshMass(BIT_TYPES[b.type].build(b, sec)).volume
const piece = (bits) => measurePiece({ ...CYL, bits, glasses: DEFAULT_GLASSES, bodyGlass: DEFAULT_GLASSES[0].id })

describe('trail on a cylinder', () => {
  // A round thread of radius r along a helix: volume is πr² × helix length.
  // The helix runs at the thread center, which rides 0.45·r off the wall.
  const r = 0.1, wraps = 4, pitch = 0.5
  const t = bit('trail', { diameter: 2 * r, wraps, pitch }, { s: 0.2 })
  const Rc = R + 0.45 * r
  const L = wraps * Math.hypot(2 * Math.PI * Rc, pitch)

  it('volume is the laid thread: πr²·L', () => near(vol(t), Math.PI * r * r * L, 0.01))

  it('marvering flat keeps the same glass', () => {
    near(vol(bit('trail', { diameter: 2 * r, wraps, pitch, marvered: true, flatten: 3 }, { s: 0.2 })), vol(t), 0.01)
  })

  it('combing drags it thinner but keeps the same glass', () => {
    near(vol({ ...t, texture: 'combed' }), vol(t), 0.02)
  })

  it('combing makes the thread thinner', () => {
    expect(BIT_TYPES.trail.thinnest({ ...t, texture: 'combed' }, sec)).toBeLessThan(BIT_TYPES.trail.thinnest(t, sec))
  })
})

describe('coil', () => {
  it('on the rim: πr² × (turns × circumference), near enough', () => {
    const d = 0.4, turns = 2
    const c = bit('coil', { diameter: d, turns, edge: 'rim' })
    // Pitch is small next to the circumference, so the length is ~turns·2πR.
    near(vol(c), Math.PI * (d / 2) ** 2 * turns * 2 * Math.PI * (R + 0.3 * d), 0.02)
  })
})

describe('lily pad', () => {
  it('with no leaves (tips at the band) it is a sleeve: π((R+t)² − R²)·H', () => {
    const H = 3, th = 0.3
    const p = bit('lilypad', { height: H, band: H, thickness: th, curl: 0 })
    near(vol(p), Math.PI * ((R + th) ** 2 - R * R) * H, 0.01)
  })

  it('leaves add glass above the band; wider leaves add more', () => {
    const base = vol(bit('lilypad', { height: 2, band: 2, curl: 0 }))
    const narrow = vol(bit('lilypad', { height: 5, band: 2, width: 0.4, curl: 0 }))
    const wide = vol(bit('lilypad', { height: 5, band: 2, width: 0.9, curl: 0 }))
    expect(narrow).toBeGreaterThan(base)
    expect(wide).toBeGreaterThan(narrow)
  })
})

describe('wings', () => {
  it('is a closed solid smaller than its bounding box', () => {
    const w = bit('wings')
    const v = vol(w)
    const { span, height, thickness } = w.params
    expect(v).toBeGreaterThan(0)
    expect(v).toBeLessThan(span * height * thickness)
  })

  it('pinches take glass out of the outline (thinner, narrower at each pinch)', () => {
    expect(vol(bit('wings', { pinches: 4 }))).toBeLessThan(vol({ ...bit('wings'), texture: 'smooth' }))
  })
})

describe('handle', () => {
  const h = bit('handle', { diameter: 1, reach: 4 }, { s: 0.85, s2: 0.25, theta: -Math.PI / 2 })

  it('weighs at least a straight strap between its attachments', () => {
    expect(vol(h)).toBeGreaterThan(Math.PI * 0.25 * (0.85 - 0.25) * 10)
  })

  it('pulls the center of mass its way, and the piece tips that way (9:00)', () => {
    const m = piece([h])
    expect(m.total.com[0]).toBeLessThan(-0.05)
    expect(clockOf(m.tip.toward)).toBe('9:00')
    expect(m.tip.deg).toBeLessThan(piece([]).tip.deg)
  })

  it('a thumb-rest prunt adds a little glass', () => {
    expect(vol({ ...h, params: { ...h.params, thumb: true } })).toBeGreaterThan(vol(h))
  })
})

describe('applied foot', () => {
  it('lifts the body by its thickness + stem, and becomes the footprint', () => {
    const bare = piece([])
    const f = bit('foot', { style: 'disk', diameter: 9, thickness: 0.5, stem: 2, stemD: 1 })
    const m = piece([f])
    expect(m.lift).toBeCloseTo(2.5, 9)
    expect(m.body.com[1]).toBeCloseTo(bare.body.com[1] + 2.5, 6)
    expect(m.footR).toBeCloseTo(4.5, 9)
    // Centered, so it tips at atan(footR / h_com) every way.
    expect(m.tip.deg).toBeCloseTo((Math.atan(4.5 / m.total.com[1]) * 180) / Math.PI, 6)
  })

  it('a wide foot steadies a piece with a handle', () => {
    const h = bit('handle', {}, { s: 0.85, s2: 0.25, theta: Math.PI / 2 })
    const without = piece([h]).tip.deg
    const withFoot = piece([h, bit('foot', { diameter: 12, thickness: 0.4 })]).tip.deg
    expect(withFoot).toBeGreaterThan(without)
  })

  it('coiled foot lifts by its stacked thread', () => {
    const f = bit('foot', { style: 'coiled', thread: 0.4, turns: 3, diameter: 8 })
    expect(piece([f]).lift).toBeGreaterThan(0.4)
    expect(vol(f)).toBeGreaterThan(0)
  })
})

describe('pulled lip', () => {
  it('adds no glass and doesn’t move the center of mass', () => {
    const bare = piece([])
    const m = piece([bit('lip', {}, { s: 1, theta: 0 })])
    expect(m.total.mass).toBe(bare.total.mass)
    expect(m.total.com).toEqual(bare.total.com)
  })
})
