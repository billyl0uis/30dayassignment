import { describe, expect, it } from 'vitest'
import { narrowestBore, radiusAt, silhouette, topCircles, widestPoint } from './views.js'

const outer = [[0, 0], [20, 0], [30, 20], [10, 40], [10, 50]]

describe('views', () => {
  it('mirrors the outer line into one closed outline', () => {
    const s = silhouette(outer)
    expect(s).toHaveLength(10)
    expect(s[4]).toEqual([10, 50])
    expect(s[5]).toEqual([-10, 50])
    expect(s.at(-1)).toEqual([-0, 0])
  })

  it('reads the radius where a line first reaches a height', () => {
    expect(radiusAt(outer, 10)).toBeCloseTo(25)
    expect(radiusAt(outer, 45)).toBeCloseTo(10)
    expect(radiusAt(outer, 60)).toBeNull()
  })

  it('finds the widest point and the narrowest bore above the belly', () => {
    expect(widestPoint(outer)).toEqual([30, 20])
    const inner = [[0, 5], [25, 18], [6, 38], [5, 44], [7, 50]]
    expect(narrowestBore(inner)).toEqual([5, 44])
  })

  it('hides a narrow foot from above and drops one as wide as the body', () => {
    const narrow = topCircles({ maxDiameter: 60, footDiameter: 40, rimOuterDiameter: 18, rimInnerDiameter: 10 })
    expect(narrow.find((c) => c.key === 'foot').hidden).toBe(true)
    const flush = topCircles({ maxDiameter: 60, footDiameter: 60, rimOuterDiameter: 18, rimInnerDiameter: 10 })
    expect(flush.map((c) => c.key)).toEqual(['widest', 'neck', 'mouth'])
  })
})
