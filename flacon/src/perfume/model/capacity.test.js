import { describe, expect, it } from 'vitest'
import { fillHeight, fillMl, scaleProfile, solveScale, targetMl } from './capacity.js'

// A stand-in for the core's measure: a cylinder of the widest radius and
// full height, less a 2 mm wall and floor. mm³ → ml.
const WALL = 2
const cylinder = (points) => {
  const R = Math.max(...points.map((p) => p.r)), H = Math.max(...points.map((p) => p.z))
  return (Math.PI * (R - WALL) ** 2 * (H - WALL)) / 1000
}
const body = [{ r: 0, z: 0 }, { r: 20, z: 0, corner: true }, { r: 22, z: 10 }, { r: 22, z: 60 }]

describe('fill line', () => {
  it('takes a share of the brim', () => {
    expect(fillMl(100, 90)).toBe(90)
  })

  it('reads fl oz targets as US fluid ounces', () => {
    expect(targetMl(1, 'fl oz')).toBeCloseTo(29.5735, 4)
    expect(targetMl(50, 'ml')).toBe(50)
  })

  it('finds the liquid height for an amount', () => {
    // A 10 mm radius cylinder with its floor at 5: 100π mm³ per mm.
    const upTo = (y) => (Math.PI * 100 * (y - 5)) / 1000
    expect(fillHeight(upTo, 5, 50, upTo(30))).toBeCloseTo(30, 1)
    expect(fillHeight(upTo, 5, 50, 999)).toBeNull()
  })
})

describe('solveScale', () => {
  it('resizes each way to hit the target', () => {
    for (const way of ['uniform', 'radial', 'height']) {
      const hit = solveScale({ points: body, way, target: 50, measure: cylinder })
      expect(hit.ml).toBeCloseTo(50, 2)
    }
  })

  it('keeps the height when only widening', () => {
    const hit = solveScale({ points: body, way: 'radial', target: 50, measure: cylinder })
    expect(hit.points.map((p) => p.z)).toEqual(body.map((p) => p.z))
    expect(hit.points[1].corner).toBe(true)
  })

  it('says when no sensible size reaches it', () => {
    expect(solveScale({ points: body, way: 'uniform', target: 1e9, measure: cylinder })).toBeNull()
  })

  it('holds a thick base still and stretches only above it', () => {
    const based = [{ r: 0, z: 0 }, { r: 20, z: 0, corner: true }, { r: 20, z: 8 }, { r: 22, z: 60 }]
    expect(scaleProfile(based, 0.5, 'uniform', 8).map((p) => p.z)).toEqual([0, 0, 8, 34])
  })

  it('leaves the profile alone at k = 1', () => {
    expect(scaleProfile(body, 1, 'uniform')).toEqual(body)
  })
})
