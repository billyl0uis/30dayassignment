import { describe, expect, it } from 'vitest'
import { thicknessJumps, thicknessRange } from './thickness'
import { buildSection } from './wall'

// Straight-sided jar, radius 40, height 100, with optional wall overrides
// and an extra point partway up the side.
const jar = ({ base, corner, extra } = {}) => [
  { r: 0, z: 0, wall: base },
  { r: 40, z: 0, corner: true, wall: corner },
  ...(extra ? [{ r: 40, z: extra.z, corner: true, wall: extra.wall }] : []),
  { r: 40, z: 100 },
]

describe('thicknessJumps', () => {
  it('an even wall has none', () => {
    expect(thicknessJumps(buildSection(jar(), { wall: 4 }))).toEqual([])
  })

  it('a heavy base going thin within a few mm is flagged, at that height', () => {
    // 8 mm at the foot to 3 mm just 4 mm up the side: 2.7× in 4 mm.
    const section = buildSection(jar({ base: 8, corner: 8, extra: { z: 4, wall: 3 } }), { wall: 3 })
    const zones = thicknessJumps(section, { ratio: 2, within: 10 })
    expect(zones).toHaveLength(1)
    expect(zones[0].thick).toBeCloseTo(8, 6)
    expect(zones[0].thin).toBeCloseTo(3, 6)
    expect(zones[0].ratio).toBeCloseTo(8 / 3, 6)
    expect(zones[0].distance).toBeLessThanOrEqual(10)
    expect(zones[0].zHigh).toBeLessThanOrEqual(14)
  })

  it('the same change spread over the whole wall is not', () => {
    // 8 at the foot to 4 at the rim, over 100 mm.
    const section = buildSection(jar({ base: 8, corner: 8 }), { wall: 4 })
    expect(thicknessJumps(section, { ratio: 2, within: 10 })).toEqual([])
  })

  it('follows your rule: a looser distance catches the gentle taper', () => {
    const section = buildSection(jar({ base: 8, corner: 8 }), { wall: 4 })
    expect(thicknessJumps(section, { ratio: 2, within: 120 })).toHaveLength(1)
    // 0.4 mm thinner every 10 mm: 1.05× at the foot, 1.1× near the rim.
    expect(thicknessJumps(section, { ratio: 1.05, within: 10 })).toHaveLength(1)
  })

  it('thinner-then-thicker counts too', () => {
    const section = buildSection(jar({ base: 3, corner: 3, extra: { z: 5, wall: 9 } }), { wall: 9 })
    expect(thicknessJumps(section)).toHaveLength(1)
  })
})

describe('thicknessRange', () => {
  it('reads the thinnest and thickest set anywhere', () => {
    const section = buildSection(jar({ base: 8, corner: 8, extra: { z: 4, wall: 3 } }), { wall: 3 })
    expect(thicknessRange(section)).toEqual({ thinnest: 3, thickest: 8 })
  })
})
