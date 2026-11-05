import { describe, expect, it } from 'vitest'
import { measure } from '@core/model/measure'
import { thicknessRange } from '@core/model/thickness'
import { buildSection } from '@core/model/wall'
import { DEFAULT_LID, fitLid } from './lid'
import { planSteps } from './process'
import { STARTING_BODY } from './startingJar'
import { DEFAULT_ZONES, zonesInUse } from './zones'

const plan = ({ lid = DEFAULT_LID, zones = DEFAULT_ZONES, units = 'mm' } = {}) => {
  const section = buildSection(STARTING_BODY.points, { wall: STARTING_BODY.wall })
  const fitted = fitLid(section, lid)
  const inUse = zonesInUse(zones, { hasKnob: lid.knob.style !== 'none' })
  return planSteps({ section, m: measure(section), range: thicknessRange(section), lid, fitted, lidWeightG: 80, zones, inUse, units })
}
const ids = (steps) => steps.map((s) => s.id)

describe('planSteps', () => {
  it('covers the stages in order, the lid made separately', () => {
    expect(ids(plan())).toEqual(['gather', 'colour', 'block', 'shape', 'punty', 'open', 'lip', 'anneal-body', 'lid', 'knob', 'anneal-lid', 'cold-work'])
  })

  it('adds a gallery step only for a gallery lid', () => {
    expect(ids(plan({ lid: { ...DEFAULT_LID, mode: 'gallery' } }))).toContain('gallery')
    expect(ids(plan())).not.toContain('gallery')
  })

  it('names the colours and COEs you entered, foot and wrap only when on', () => {
    const zones = {
      ...DEFAULT_ZONES,
      body: { ...DEFAULT_ZONES.body, name: 'Smoke', coe: '33' },
      lip: { ...DEFAULT_ZONES.lip, used: true, name: 'Ruby', coe: '' },
    }
    const steps = plan({ zones })
    const colour = steps.find((s) => s.id === 'colour').detail
    expect(colour).toMatch(/Smoke \(COE 33\)/)
    expect(colour).toMatch(/Ruby/)
    expect(ids(steps)).not.toContain('foot')
    expect(steps.find((s) => s.id === 'lip').detail).toMatch(/wrap of Ruby/)
  })

  it('leaves the knob out when there is none', () => {
    expect(ids(plan({ lid: { ...DEFAULT_LID, knob: { ...DEFAULT_LID.knob, style: 'none' } } }))).not.toContain('knob')
  })

  it('writes sizes in the chosen units', () => {
    expect(plan({ units: 'in' }).find((s) => s.id === 'open').detail).toMatch(/ in inside/)
    expect(plan().find((s) => s.id === 'open').detail).toMatch(/ mm inside/)
  })

  it('never gives an annealing schedule', () => {
    for (const step of plan()) expect(step.detail).not.toMatch(/°|degrees|hours|minutes/i)
  })
})
