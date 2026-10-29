import { describe, expect, it } from 'vitest'
import { capacityTo, measure } from './measure'
import { sampleProfile } from './profile'
import { solidOfRevolution } from './revolve'
import { buildSection, removeLoops } from './wall'

const { PI } = Math

// A straight-sided jar: flat base out to a sharp foot corner, then
// straight up. Radius 40, height 100.
const cylinderJar = (extra = {}) => [
  { r: 0, z: 0, ...extra.base },
  { r: 40, z: 0, corner: true, ...extra.corner },
  { r: 40, z: 100, ...extra.rim },
]

describe('sampleProfile', () => {
  it('passes through every control point', () => {
    const points = [{ r: 0, z: 0 }, { r: 30, z: 5, corner: true }, { r: 45, z: 60 }, { r: 25, z: 110 }, { r: 30, z: 120 }]
    const { pts } = sampleProfile(points)
    for (const p of points) expect(pts.some(([r, z]) => Math.hypot(r - p.r, z - p.z) < 1e-9)).toBe(true)
  })

  it('keeps a span between two corners straight', () => {
    const { pts } = sampleProfile(cylinderJar())
    const wall = pts.filter(([, z]) => z > 0)
    expect(wall.every(([r]) => Math.abs(r - 40) < 1e-9)).toBe(true)
  })
})

describe('buildSection on a straight-sided jar', () => {
  const section = buildSection(cylinderJar(), { wall: 4 })
  const m = measure(section)

  it('puts the inside exactly one wall in from the outside', () => {
    expect(section.inner[0]).toEqual([0, 4])
    const corner = section.inner.find(([r, z]) => Math.abs(r - 36) < 1e-9 && Math.abs(z - 4) < 1e-9)
    expect(corner).toBeTruthy()
    expect(section.inner.at(-1)[0]).toBeCloseTo(36, 9)
    expect(section.inner.at(-1)[1]).toBeCloseTo(100, 9)
  })

  it('capacity: π·36²·96 exactly', () => {
    expect(m.capacityMl).toBeCloseTo((PI * 36 * 36 * 96) / 1000, 6)
  })

  it('glass: outer cylinder less the cavity, at the given density', () => {
    const glassMm3 = PI * 40 * 40 * 100 - PI * 36 * 36 * 96
    expect(m.glassCm3).toBeCloseTo(glassMm3 / 1000, 6)
    expect(m.weightG).toBeCloseTo((glassMm3 / 1000) * 2.5, 6)
    expect(measure(section, { density: 2.4 }).weightG).toBeCloseTo((glassMm3 / 1000) * 2.4, 6)
  })

  it('reads its sizes', () => {
    expect(m.height).toBe(100)
    expect(m.maxDiameter).toBe(80)
    expect(m.footDiameter).toBe(80)
    expect(m.rimOuterDiameter).toBe(80)
    expect(m.rimInnerDiameter).toBeCloseTo(72, 9)
    expect(m.openingDiameter).toBeCloseTo(72, 9)
  })

  it('fills to a line below the brim', () => {
    expect(capacityTo(section, 52)).toBeCloseTo((PI * 36 * 36 * 48) / 1000, 6)
  })
})

describe('wall thickness by region', () => {
  // 8 mm base, wall thinning from 8 at the foot to 4 at the rim.
  const section = buildSection(cylinderJar({ base: { wall: 8 }, corner: { wall: 8 } }), { wall: 4 })

  it('takes each point’s own thickness and changes smoothly between', () => {
    expect(section.inner[0]).toEqual([0, 8])
    const mid = section.outer.findIndex(([, z]) => Math.abs(z - 50) < 3)
    const along = section.outer[mid][1] / 100
    expect(section.thickness[mid]).toBeCloseTo(8 - 4 * along, 9)
  })

  it('a thicker base holds less', () => {
    const plain = measure(buildSection(cylinderJar(), { wall: 4 }))
    expect(measure(section).capacityMl).toBeLessThan(plain.capacityMl)
  })
})

describe('buildSection on a curved form', () => {
  it('a hollow sphere: shell of 4/3·π(R³ − (R − t)³) within 0.2%', () => {
    const R = 60
    const t = 5
    const N = 96
    const points = Array.from({ length: N + 1 }, (_, k) => {
      const a = -PI / 2 + (PI * k) / N
      return { r: Math.max(0, R * Math.cos(a)), z: R + R * Math.sin(a) }
    })
    const section = buildSection(points, { wall: t })
    const m = measure(section)
    const shell = ((4 / 3) * PI * (R ** 3 - (R - t) ** 3)) / 1000
    const cavity = ((4 / 3) * PI * (R - t) ** 3) / 1000
    expect(Math.abs(m.glassCm3 - shell) / shell).toBeLessThan(2e-3)
    expect(Math.abs(m.capacityMl - cavity) / cavity).toBeLessThan(2e-3)
    expect(m.centerOfMassZ).toBeCloseTo(R, 1)
  })

  it('a bend tighter than the wall leaves no loop in the inside line', () => {
    // A shoulder that turns in sharply, with a wall thicker than the bend.
    const points = [{ r: 0, z: 0 }, { r: 40, z: 0, corner: true }, { r: 42, z: 70 }, { r: 20, z: 76 }, { r: 18, z: 100 }]
    const { inner, cavity } = buildSection(points, { wall: 9 })
    for (let i = 0; i < inner.length - 1; i++)
      for (let j = i + 2; j < inner.length - 1; j++) {
        const [a, b, c, d] = [inner[i], inner[i + 1], inner[j], inner[j + 1]]
        const side = (p, q, x) => Math.sign((q[0] - p[0]) * (x[1] - p[1]) - (q[1] - p[1]) * (x[0] - p[0]))
        const crosses = side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0
        expect(crosses, `segments ${i} and ${j} cross`).toBe(false)
      }
    expect(solidOfRevolution(cavity).volume).toBeGreaterThan(0)
  })
})

describe('clearOpening', () => {
  it('a neck narrower than the flared lip sets the opening', () => {
    // Belly r 50, neck r 25 at z 110, lip flaring back out to r 32.
    const points = [
      { r: 0, z: 0 },
      { r: 40, z: 0, corner: true },
      { r: 50, z: 60 },
      { r: 25, z: 110, corner: true },
      { r: 25, z: 120, corner: true },
      { r: 32, z: 128 },
    ]
    const m = measure(buildSection(points, { wall: 4 }))
    expect(m.openingDiameter).toBeLessThan(m.rimInnerDiameter)
    expect(m.openingDiameter).toBeCloseTo(2 * (25 - 4), 6)
  })

  it('a bowl widest at the rim opens to the rim', () => {
    const points = [{ r: 0, z: 0 }, { r: 30, z: 0, corner: true }, { r: 70, z: 60 }]
    const m = measure(buildSection(points, { wall: 4 }))
    expect(m.openingDiameter).toBeCloseTo(m.rimInnerDiameter, 9)
  })
})

describe('removeLoops', () => {
  it('cuts a loop out at the crossing', () => {
    const out = removeLoops([[0, 0], [10, 0], [10, 5], [5, -5], [5, 10]])
    expect(out).toEqual([[0, 0], [5, 0], [5, 10]])
  })

  it('leaves a clean line alone', () => {
    const line = [[0, 0], [10, 0], [10, 10], [5, 20]]
    expect(removeLoops(line)).toEqual(line)
  })
})
