import { describe, expect, it } from 'vitest'
import { DesignFileError } from '@core/model/designFile'
import { measure } from '@core/model/measure'
import { thicknessJumps } from '@core/model/thickness'
import { buildSection } from '@core/model/wall'
import { normalise, readDesign, saveDesign, startingDesign } from './design'
import { fitLid } from './lid'
import { PRESETS } from './presets'

describe('saving and opening a design', () => {
  it('round-trips the whole design', () => {
    const design = {
      ...startingDesign(),
      name: 'Blue honey',
      plan: [{ id: 'own-1', title: 'Gather', detail: 'Two gathers.' }],
      density: 2.45,
    }
    expect(readDesign(saveDesign(design))).toEqual(normalise(design))
    expect(readDesign(saveDesign(design)).plan[0].detail).toBe('Two gathers.')
  })

  it('fills in what an older or hand-made file leaves out', () => {
    const text = JSON.stringify({
      app: 'finial',
      schemaVersion: 1,
      design: { body: { points: [{ r: 0, z: 0 }, { r: 40, z: 0, corner: true }, { r: 40, z: 100 }] } },
    })
    const d = readDesign(text)
    expect(d.name).toBe('Untitled jar')
    expect(d.lid).toEqual(startingDesign().lid)
    expect(d.zones).toEqual(startingDesign().zones)
    expect(d.plan).toBeNull()
  })

  it('throws out bad values rather than using them', () => {
    const d = normalise({
      ...startingDesign(),
      lid: { ...startingDesign().lid, mode: 'sideways', gap: -1, knob: { style: 'gargoyle' } },
      zones: { body: { swatch: 'red', coe: 96, used: 'yes' } },
      density: -3,
    })
    expect(d.lid.mode).toBe('inside')
    expect(d.lid.gap).toBe(startingDesign().lid.gap)
    expect(d.lid.knob.style).toBe('ball')
    expect(d.zones.body.swatch).toBe(startingDesign().zones.body.swatch)
    expect(d.zones.body.coe).toBe('96')
    expect(d.density).toBe(2.5)
  })

  it('refuses a body it can’t draw', () => {
    const text = JSON.stringify({ app: 'finial', schemaVersion: 1, design: { body: { points: [] } } })
    expect(() => readDesign(text)).toThrow(DesignFileError)
  })
})

describe('presets', () => {
  for (const [key, preset] of Object.entries(PRESETS)) {
    describe(preset.name, () => {
      const section = buildSection(preset.body.points, { wall: preset.body.wall })
      const lid = fitLid(section, preset.lid)

      it('saves and opens unchanged', () => {
        expect(readDesign(saveDesign(preset))).toEqual(normalise(preset))
      })

      it('holds something and its lid fits as drawn', () => {
        expect(measure(section).capacityMl).toBeGreaterThan(100)
        expect(lid.problems, key).toEqual([])
      })

      it('has no thickness warnings by the default rule', () => {
        expect(thicknessJumps(section)).toEqual([])
      })
    })
  }

  it('one of each fit', () => {
    expect(Object.values(PRESETS).map((p) => p.lid.mode).sort()).toEqual(['gallery', 'inside', 'over'])
  })
})
