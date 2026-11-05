import { describe, expect, it } from 'vitest'
import { CLOSURE_TYPES, emptyClosure, fieldsFor, hardwareFit, missingFields, neckFor, neckWall, stopperTaper } from './closures.js'

describe('emptyClosure', () => {
  it('starts every size empty, with no invented defaults', () => {
    for (const type of Object.keys(CLOSURE_TYPES)) {
      const c = emptyClosure(type)
      const sizes = Object.entries(c).filter(([k, v]) => k !== 'type' && typeof v !== 'boolean')
      expect(sizes.every(([, v]) => v === null)).toBe(true)
      expect(neckFor(c)).toBeNull()
    }
  })
})

describe('fields', () => {
  it('asks for dauber sizes only when there is a dauber', () => {
    const c = emptyClosure('stopper')
    expect(fieldsFor(c).map((f) => f.key)).not.toContain('dauberLength')
    expect(fieldsFor({ ...c, dauber: true }).map((f) => f.key)).toContain('dauberLength')
  })

  it('asks for a flange only on crimp hardware', () => {
    const c = { ...emptyClosure('hardware'), hardware: 'crimp' }
    expect(missingFields(c).map((f) => f.key)).toContain('flangeD')
    expect(missingFields({ ...c, hardware: 'screw' }).map((f) => f.key)).toContain('threadD')
  })
})

describe('stopperTaper', () => {
  it('reads the angle and steepness of the shank', () => {
    // 2 mm narrower over 20 mm: each side leans atan(1/20).
    const t = stopperTaper({ shankTopD: 12, shankBottomD: 10, shankLength: 20 })
    expect(t.halfAngle).toBeCloseTo(2.862, 3)
    expect(t.included).toBeCloseTo(5.725, 3)
    expect(t.lengthPerMm).toBe(10)
  })

  it('is null until all three sizes are in', () => {
    expect(stopperTaper({ shankTopD: 12, shankBottomD: null, shankLength: 20 })).toBeNull()
  })
})

describe('neckFor', () => {
  it('gives a stopper neck the shank taper and a ground rim', () => {
    const c = { ...emptyClosure('stopper'), head: 'disc', headWidth: 40, headHeight: 30, shankTopD: 12, shankBottomD: 10, shankLength: 20, neckOD: 20 }
    expect(neckFor(c)).toEqual({ boreTopD: 12, boreBottomD: 10, boreDepth: 20, outerD: 20, rim: 'ground' })
    expect(neckWall(neckFor(c))).toBe(4)
  })

  it('sizes a cork bore where a tapered cork stops', () => {
    // 8 mm at the small end, 10 mm at the top, 20 long, sat 15 in: 9.5 mm.
    const c = { ...emptyClosure('cork'), corkTopD: 10, corkBottomD: 8, corkLength: 20, seatDepth: 15, neckOD: 16 }
    expect(neckFor(c).boreTopD).toBeCloseTo(9.5)
    expect(neckFor({ ...c, squeeze: 0.5 }).boreTopD).toBeCloseTo(9)
  })
})

describe('hardwareFit', () => {
  const spec = { neckOD: 15, boreD: 8, finishHeight: 10, tolerance: 0.3 }

  it('passes sizes within tolerance and fails those outside', () => {
    const rows = hardwareFit(spec, { neckOD: 15.2, boreD: 7.5 })
    const od = rows.find((r) => r.key === 'neckOD')
    const bore = rows.find((r) => r.key === 'boreD')
    expect(od.off).toBeCloseTo(0.2)
    expect(od.ok).toBe(true)
    expect(bore.ok).toBe(false)
  })

  it("can't judge without a tolerance", () => {
    expect(hardwareFit({ ...spec, tolerance: null }, { neckOD: 15 })[0].ok).toBeNull()
  })

  it('skips sizes the made neck does not have', () => {
    expect(hardwareFit(spec, { neckOD: 15 }).map((r) => r.key)).not.toContain('finishHeight')
  })
})
