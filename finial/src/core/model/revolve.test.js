import { describe, expect, it } from 'vitest'
import { clipBelow, solidOfRevolution } from './revolve'

// Known answers, worked independently of the polygon formula.
const { PI } = Math

// A half-circle of radius R centred at (0, R), as N edges from the bottom
// pole to the top pole, closed down the axis.
const semicircle = (R, N) =>
  Array.from({ length: N + 1 }, (_, k) => {
    const a = -PI / 2 + (PI * k) / N
    return [R * Math.cos(a), R + R * Math.sin(a)]
  })

// The same faceted solid summed a second way: as a stack of frustums,
// V = πh(r₀² + r₀r₁ + r₁²)/3 each. Agreeing with this checks the Pappus sum
// without leaning on it.
const frustumStack = (pts) =>
  pts.slice(1).reduce((sum, [r1, z1], i) => {
    const [r0, z0] = pts[i]
    return sum + (PI * (z1 - z0) * (r0 * r0 + r0 * r1 + r1 * r1)) / 3
  }, 0)

describe('solidOfRevolution', () => {
  it('cylinder: πr²h exactly, centroid at half height', () => {
    const r = 40
    const h = 100
    const { volume, z } = solidOfRevolution([[0, 0], [r, 0], [r, h], [0, h]])
    expect(volume).toBeCloseTo(PI * r * r * h, 6)
    expect(z).toBeCloseTo(h / 2, 9)
  })

  it('does not care which way round the polygon goes', () => {
    const poly = [[0, 0], [40, 0], [40, 100], [0, 100]]
    expect(solidOfRevolution([...poly].reverse()).volume).toBeCloseTo(solidOfRevolution(poly).volume, 6)
  })

  it('cone: πr²h/3 exactly, centroid at h/4', () => {
    const { volume, z } = solidOfRevolution([[0, 0], [30, 0], [0, 90]])
    expect(volume).toBeCloseTo((PI * 30 * 30 * 90) / 3, 6)
    expect(z).toBeCloseTo(90 / 4, 9)
  })

  it('frustum: πh(R² + Rr + r²)/3 exactly', () => {
    const { volume } = solidOfRevolution([[0, 0], [50, 0], [30, 80], [0, 80]])
    expect(volume).toBeCloseTo((PI * 80 * (50 * 50 + 50 * 30 + 30 * 30)) / 3, 6)
  })

  it('faceted sphere: matches the frustum stack to rounding', () => {
    const pts = semicircle(50, 64)
    expect(solidOfRevolution(pts).volume / frustumStack(pts)).toBeCloseTo(1, 12)
  })

  it('sphere: within 0.01% of 4/3·πR³ at 256 facets', () => {
    const R = 50
    const exact = (4 / 3) * PI * R ** 3
    const { volume, z } = solidOfRevolution(semicircle(R, 256))
    expect(Math.abs(volume - exact) / exact).toBeLessThan(1e-4)
    expect(z).toBeCloseTo(R, 9)
  })

  it('sphere: the error shrinks 4× each time the facets double', () => {
    const R = 50
    const exact = (4 / 3) * PI * R ** 3
    const error = (N) => exact - solidOfRevolution(semicircle(R, N)).volume
    // Facets cut inside the curve, so always a little under.
    expect(error(64)).toBeGreaterThan(0)
    expect(error(64) / error(128)).toBeCloseTo(4, 1)
    expect(error(128) / error(256)).toBeCloseTo(4, 1)
  })

  it('hemisphere: centroid at 3R/8 from the flat face', () => {
    const R = 50
    const quarter = Array.from({ length: 513 }, (_, k) => [R * Math.cos((PI / 2) * (k / 512)), R * Math.sin((PI / 2) * (k / 512))])
    const { volume, z } = solidOfRevolution([[0, 0], ...quarter])
    expect(volume / ((2 / 3) * PI * R ** 3)).toBeCloseTo(1, 5)
    expect(z).toBeCloseTo((3 * R) / 8, 3)
  })
})

describe('clipBelow', () => {
  it('a cylinder cut at half height holds half', () => {
    const poly = [[0, 0], [40, 0], [40, 100], [0, 100]]
    expect(solidOfRevolution(clipBelow(poly, 50)).volume).toBeCloseTo(PI * 40 * 40 * 50, 6)
  })

  it('a sphere cut at its equator is a hemisphere', () => {
    const R = 50
    const half = solidOfRevolution(clipBelow(semicircle(R, 512), R)).volume
    expect(half / ((2 / 3) * PI * R ** 3)).toBeCloseTo(1, 4)
  })

  it('cutting above the top changes nothing', () => {
    const poly = [[0, 0], [40, 0], [40, 100], [0, 100]]
    expect(solidOfRevolution(clipBelow(poly, 500)).volume).toBeCloseTo(solidOfRevolution(poly).volume, 6)
  })
})
