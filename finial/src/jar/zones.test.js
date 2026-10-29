import { describe, expect, it } from 'vitest'
import { solidOfRevolution } from '@core/model/revolve'
import { bodyBands, coeCheck, DEFAULT_ZONES, zonesInUse } from './zones'

const zones = (patch = {}) =>
  Object.fromEntries(Object.entries(DEFAULT_ZONES).map(([key, z]) => [key, { ...z, ...patch[key] }]))

describe('zonesInUse', () => {
  it('body and lid always; knob only with a knob; wrap and foot when on', () => {
    expect(zonesInUse(zones(), { hasKnob: false })).toEqual(['body', 'lid'])
    expect(zonesInUse(zones({ lip: { used: true } }), { hasKnob: true })).toEqual(['body', 'lip', 'lid', 'knob'])
  })
})

describe('coeCheck', () => {
  const inUse = ['body', 'lip', 'lid']

  it('is quiet when every COE matches', () => {
    const z = zones({ body: { coe: '33' }, lip: { coe: '33' }, lid: { coe: '33.0' } })
    expect(coeCheck(z, inUse)).toEqual({ mismatch: [], missing: [] })
  })

  it('groups the zones by COE when they differ', () => {
    const z = zones({ body: { coe: '33' }, lip: { coe: '34' }, lid: { coe: '33' } })
    expect(coeCheck(z, inUse).mismatch).toEqual([
      { coe: 33, zones: ['Body', 'Lid'] },
      { coe: 34, zones: ['Lip wrap'] },
    ])
  })

  it('lists zones with no COE rather than guessing', () => {
    const z = zones({ body: { coe: '33' }, lip: { coe: '' }, lid: { coe: 'ask' } })
    expect(coeCheck(z, inUse)).toEqual({ mismatch: [], missing: ['Lip wrap', 'Lid'] })
  })

  it('ignores zones not on the jar', () => {
    const z = zones({ body: { coe: '33' }, foot: { coe: '99' }, lid: { coe: '33' } })
    expect(coeCheck(z, ['body', 'lid']).mismatch).toEqual([])
  })
})

describe('bodyBands', () => {
  const glass = [[0, 0], [40, 0], [40, 100], [0, 100]]
  const volume = (bands) => bands.reduce((s, b) => s + solidOfRevolution(b.polygons[0]).volume, 0)

  it('splits into foot, body and lip without losing glass', () => {
    const z = zones({ lip: { used: true, depth: 8 }, foot: { used: true, height: 5 } })
    const bands = bodyBands(glass, 100, z, ['body', 'lip', 'foot', 'lid'])
    expect(bands).toHaveLength(3)
    expect(volume(bands)).toBeCloseTo(solidOfRevolution(glass).volume, 6)
    expect(bands.map((b) => b.color)).toEqual([z.foot.swatch, z.body.swatch, z.lip.swatch])
  })

  it('is just the body with no wrap or foot', () => {
    expect(bodyBands(glass, 100, zones(), ['body', 'lid'])).toHaveLength(1)
  })
})
