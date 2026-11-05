import { describe, expect, it } from 'vitest'
import { solidOfRevolution } from '@core/model/revolve'
import { buildSection } from '@core/model/wall'
import { DEFAULT_LID, fitLid, knobPolygon } from './lid'

// Straight-sided jar: outside radius 40, 4 mm wall, so the mouth is 36
// inside and the rim's top is at 100.
const plainJar = buildSection(
  [
    { r: 0, z: 0 },
    { r: 40, z: 0, corner: true },
    { r: 40, z: 100 },
  ],
  { wall: 4 },
)

// The same jar with a gallery: the neck steps in to 30 (outside 34) at
// 84–88 mm, then back out to the full mouth.
const galleryJar = buildSection(
  [
    { r: 0, z: 0 },
    { r: 40, z: 0, corner: true },
    { r: 40, z: 80, corner: true },
    { r: 34, z: 84, corner: true },
    { r: 34, z: 88, corner: true },
    { r: 40, z: 92, corner: true },
    { r: 40, z: 100 },
  ],
  { wall: 4 },
)

// A flat disc lid, 6 mm thick, no knob.
const flatLid = (patch) => ({
  ...DEFAULT_LID,
  wall: 6,
  gap: 1,
  drop: 10,
  points: [
    { r: 0, z: 6 },
    { r: 44, z: 6, corner: true },
    { r: 44, z: 0 },
  ],
  knob: { style: 'none', height: 0, diameter: 0, neck: 0 },
  ...patch,
})

describe('flange inside the opening', () => {
  const lid = fitLid(plainJar, flatLid({ mode: 'inside' }))

  it('sizes the flange to the opening less the gap', () => {
    expect(lid.fit.bodyDiameter).toBeCloseTo(72, 9)
    expect(lid.fit.lidDiameter).toBeCloseTo(70, 9)
    expect(lid.problems).toEqual([])
  })

  it('rests the top on the rim, flange hanging inside', () => {
    expect(lid.seat).toBeCloseTo(100, 9)
    expect(lid.lowest).toBeCloseTo(90, 9)
    expect(lid.lowestInside).toBeCloseTo(90, 9)
  })

  it('weighs top plus flange', () => {
    const top = Math.PI * 44 * 44 * 6
    const flange = Math.PI * (35 * 35 - 29 * 29) * 10
    expect(lid.glassCm3).toBeCloseTo((top + flange) / 1000, 6)
  })

  it('says when the lid is narrower than the mouth', () => {
    const narrow = flatLid({ mode: 'inside', points: [{ r: 0, z: 6 }, { r: 30, z: 6, corner: true }, { r: 30, z: 0 }] })
    expect(fitLid(plainJar, narrow).problems.join(' ')).toMatch(/narrower than the mouth/)
  })
})

describe('over the rim', () => {
  const lid = fitLid(plainJar, flatLid({ mode: 'over' }))

  it('sizes the skirt to the rim plus the gap, and sets the edge', () => {
    expect(lid.fit.bodyDiameter).toBeCloseTo(80, 9)
    expect(lid.fit.lidDiameter).toBeCloseTo(82, 9)
    expect(lid.edgeR).toBeCloseTo(41 + 6, 9)
    expect(lid.problems).toEqual([])
  })

  it('widens the drawn top to the skirt, keeping its shape', () => {
    const domed = flatLid({ mode: 'over', points: [{ r: 0, z: 10 }, { r: 20, z: 8 }, { r: 40, z: 0 }] })
    const { points } = fitLid(plainJar, domed)
    expect(points[2].r).toBeCloseTo(47, 9)
    expect(points[1].r).toBeCloseTo(20 * (47 / 40), 9)
  })

  it('rests on the rim with the skirt hanging outside', () => {
    expect(lid.seat).toBeCloseTo(100, 9)
    expect(lid.lowest).toBeCloseTo(90, 9)
  })

  it('takes no room inside: the skirt is outside the mouth', () => {
    expect(lid.lowestInside).toBeCloseTo(100, 9)
  })
})

describe('sits on a gallery', () => {
  it('drops into the mouth and catches on the ledge', () => {
    const lid = fitLid(galleryJar, flatLid({ mode: 'gallery', gap: 0.5 }))
    expect(lid.edgeR).toBeCloseTo(35.5, 9)
    expect(lid.problems).toEqual([])
    // The step's upper slope runs (34, 88) → (40, 92) outside; inside, it
    // is that line moved 4 mm square to it. The 35.5 edge lands on it.
    const n = [-4 / Math.hypot(6, 4), 6 / Math.hypot(6, 4)]
    const start = [34 + 4 * n[0], 88 + 4 * n[1]]
    expect(lid.seat).toBeCloseTo(start[1] + ((35.5 - start[0]) * 4) / 6, 6)
  })

  it('says so when there is no ledge', () => {
    const lid = fitLid(plainJar, flatLid({ mode: 'gallery' }))
    expect(lid.problems.join(' ')).toMatch(/No gallery/)
  })
})

describe('the gap', () => {
  it('is yours to set: more gap, smaller flange', () => {
    const tight = fitLid(plainJar, flatLid({ mode: 'inside', gap: 0.25 }))
    const loose = fitLid(plainJar, flatLid({ mode: 'inside', gap: 2 }))
    expect(tight.fit.lidDiameter - loose.fit.lidDiameter).toBeCloseTo(3.5, 9)
  })

  it('warns at none', () => {
    expect(fitLid(plainJar, flatLid({ gap: 0 })).problems.join(' ')).toMatch(/No clearance/)
  })
})

describe('knobs', () => {
  it('a ball knob is close to a sphere on a short neck', () => {
    const poly = knobPolygon({ style: 'ball', height: 20, diameter: 20, neck: 0.01 })
    const sphere = (4 / 3) * Math.PI * 10 ** 3
    expect(solidOfRevolution(poly).volume / sphere).toBeCloseTo(1, 2)
  })

  it('every style stands on the lid and reaches its height', () => {
    for (const style of ['ball', 'button', 'mushroom', 'finial']) {
      const poly = knobPolygon({ style, height: 22, diameter: 20, neck: 9 })
      expect(Math.min(...poly.map((p) => p[1]))).toBeCloseTo(0, 9)
      expect(Math.max(...poly.map((p) => p[1]))).toBeCloseTo(22, 9)
      expect(solidOfRevolution(poly).volume).toBeGreaterThan(0)
    }
  })

  it('none adds nothing', () => {
    expect(knobPolygon({ style: 'none', height: 22, diameter: 20, neck: 9 })).toBeNull()
  })
})
