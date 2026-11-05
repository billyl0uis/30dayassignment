import { describe, expect, it } from 'vitest'
import { buildSection } from '@core/model/wall'
import { measure } from '@core/model/measure'
import { emptyClosure } from './closures.js'
import { bodyFrom, bottlePoints, neckShape } from './bottle.js'
import { fromPreset } from './presets.js'

const stopper = { ...emptyClosure('stopper'), head: 'disc', headWidth: 40, headHeight: 30, shankTopD: 12, shankBottomD: 10, shankLength: 10, neckOD: 20 }

describe('bottle', () => {
  it('wears the placeholder neck until the closure is filled in', () => {
    const d = fromPreset('flacon')
    expect(neckShape(d).placeholder).toBe(true)
    expect(neckShape({ ...d, closure: stopper }).placeholder).toBe(false)
  })

  it('opens the mouth to the bore the closure asks for', () => {
    const d = { ...fromPreset('flacon'), closure: stopper, neckLength: 16 }
    const pts = bottlePoints(d.points, neckShape(d))
    const m = measure(buildSection(pts, { wall: d.wall }))
    // Narrowest inside, above the belly: the mouth of the tapered bore.
    expect(m.openingDiameter).toBeCloseTo(10, 1)
    expect(m.rimInnerDiameter).toBeCloseTo(12, 1)
    expect(m.rimOuterDiameter).toBeCloseTo(20, 6)
  })

  it('gives back just the body after an edit, dropping points added on the neck', () => {
    const d = fromPreset('sample')
    const pts = bottlePoints(d.points, neckShape(d))
    expect(bodyFrom(pts)).toEqual(d.points)
    const withExtra = [...pts.slice(0, -1), { r: 3, z: 45 }, pts[pts.length - 1]]
    expect(bodyFrom(withExtra)).toEqual(d.points)
  })
})
