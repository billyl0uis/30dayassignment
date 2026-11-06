import { describe, expect, it } from 'vitest'
import { capacity, tiltedWater, tipWithWater, waterAt, cavitySlices } from './liquid.js'
import { bodySection } from './derived.js'
import { tipAngle } from './physics.js'

const near = (a, b, rel) => expect(Math.abs(a - b) / Math.abs(b)).toBeLessThan(rel)
const DEG = Math.PI / 180

// An ideal round cavity, radius R, from y = 0 to 12, in thin slices.
function cylinderSlices(R, top = 12, n = 600) {
  const dy = top / n
  return Array.from({ length: n }, (_, i) => ({ y: (i + 0.5) * dy, R, dy }))
}

describe('water in a tilted cylinder (R = 2, water 4 deep upright)', () => {
  // Known result while the surface touches neither floor nor top: the
  // surface is y = H + x·tan α, so
  //   x̄ = R²·tan α / (4H)    ȳ = H/2 + R²·tan²α / (8H)
  const R = 2, H = 4, V = Math.PI * R * R * H
  const slices = cylinderSlices(R)

  it('upright: centered, half the depth up', () => {
    const w = tiltedWater(slices, V, 0)
    near(w.volume, V, 1e-3)
    expect(w.x).toBeCloseTo(0, 6)
    expect(w.y).toBeCloseTo(H / 2, 2)
  })

  for (const deg of [10, 25, 40]) {
    it(`tilted ${deg}°: water runs to the low side by R²·tanα/4H`, () => {
      const t = Math.tan(deg * DEG)
      const w = tiltedWater(slices, V, deg * DEG)
      near(w.volume, V, 2e-3)
      expect(w.x).toBeCloseTo((R * R * t) / (4 * H), 2)
      expect(w.y).toBeCloseTo(H / 2 + (R * R * t * t) / (8 * H), 2)
    })
  }
})

describe('fill level', () => {
  const sec = bodySection({ points: [[3, 0], [3, 5], [3, 10]], walls: [0.3, 0.3, 0.3], floor: 0.6 })

  it('is by volume: half full holds half the capacity', () => {
    near(waterAt(sec, 0.5).volume, capacity(sec) / 2, 1e-6)
  })

  it('in straight walls, half by volume is also half by height', () => {
    expect(waterAt(sec, 0.5).level).toBeCloseTo((sec.floorY + sec.brimY) / 2, 1)
  })

  it('the cavity slices hold the same as the Pappus capacity', () => {
    const s = cavitySlices(sec)
    near(tiltedWater(s, capacity(sec) * 0.6, 0).volume, capacity(sec) * 0.6, 2e-3)
  })
})

describe('tipping with water in it', () => {
  const R = 2.7
  const slices = cylinderSlices(R, 9.4)
  const rigid = { mass: 220, com: [0, 4.2, 0] }

  it('with no water it is the rigid answer: atan(r / h)', () => {
    const t = tipWithWater({ rigid, footR: 3, slices, waterVolume: 0 })
    expect(t.deg).toBeCloseTo(tipAngle(rigid.com, 3).deg, 3)
  })

  it('level water tips it sooner than the same water frozen in place', () => {
    const Vw = Math.PI * R * R * 5
    const level = tipWithWater({ rigid, footR: 3, slices, waterVolume: Vw })
    const w = tiltedWater(slices, Vw, 0)
    const M = rigid.mass + Vw
    const frozen = tipAngle([0, (rigid.mass * rigid.com[1] + Vw * w.y) / M, 0], 3)
    expect(level.deg).toBeLessThan(frozen.deg)
    expect(level.deg).toBeGreaterThan(frozen.deg - 15)
  })

  it('a foot lifting the piece raises the water too', () => {
    const Vw = Math.PI * R * R * 5
    const low = tipWithWater({ rigid, footR: 3, slices, waterVolume: Vw })
    const high = tipWithWater({ rigid: { ...rigid, com: [0, 6.2, 0] }, footR: 3, slices, waterVolume: Vw, lift: 2 })
    expect(high.deg).toBeLessThan(low.deg)
  })

  it('an off-center piece tips toward its lean; low centered water steadies it', () => {
    // Water sitting low on the axis pulls the combined center down and in,
    // so this one is steadier wet than dry, though less than frozen water would make it.
    const lean = { mass: 220, com: [0.8, 4.2, 0] }
    const Vw = Math.PI * R * R * 6
    const dry = tipWithWater({ rigid: lean, footR: 3, slices, waterVolume: 0 })
    const wet = tipWithWater({ rigid: lean, footR: 3, slices, waterVolume: Vw })
    const w = tiltedWater(slices, Vw, 0)
    const M = lean.mass + Vw
    const frozen = tipAngle([(lean.mass * 0.8) / M, (lean.mass * 4.2 + Vw * w.y) / M, 0], 3)
    expect(dry.toward).toBeCloseTo(Math.PI / 2, 6)
    expect(wet.deg).toBeGreaterThan(dry.deg)
    expect(wet.deg).toBeLessThan(frozen.deg)
  })
})
