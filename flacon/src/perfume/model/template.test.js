import { describe, expect, it } from 'vitest'
import { CLOSURE_TYPES } from './closures.js'
import { PRESETS, fromPreset } from './presets.js'
import { processTemplate } from './process.js'
import { defaultLimits, riskZones } from './risks.js'
import { newZone, zoneExport, zoneProblems } from './zones.js'

describe('presets', () => {
  it('has the four starting forms, each with an empty closure', () => {
    expect(Object.keys(PRESETS)).toEqual(['flacon', 'flatOval', 'column', 'sample'])
    for (const id of Object.keys(PRESETS)) {
      const d = fromPreset(id)
      expect(d.points[0]).toMatchObject({ r: 0, z: 0 })
      expect(CLOSURE_TYPES[d.closure.type]).toBeDefined()
    }
  })
})

describe('process template', () => {
  it('is marked as a template, with stopper steps only for a stopper', () => {
    const s = processTemplate('stopper')
    expect(s.template).toBe(true)
    expect(s.steps.some((x) => x.part === 'stopper')).toBe(true)
    expect(processTemplate('cork').steps.some((x) => x.part === 'stopper')).toBe(false)
    expect(new Set(s.steps.map((x) => x.id)).size).toBe(s.steps.length)
  })
})

describe('risk zones', () => {
  const m = { base: 12, wall: 3, baseShare: 0.45, neckWall: 1.5, neckZone: [60, 75] }

  it('flags nothing until the maker sets limits', () => {
    expect(riskZones(m, defaultLimits()).every((r) => r.level === 'unset')).toBe(true)
  })

  it('flags a heavy base and a thin neck against set limits', () => {
    const rows = riskZones(m, { baseToWall: 3, baseShare: 50, neckWall: 2 })
    expect(Object.fromEntries(rows.map((r) => [r.id, r.level]))).toEqual({ baseToWall: 'risk', baseShare: 'ok', neckWall: 'risk' })
  })
})

describe('decorative zones', () => {
  it('carries an empty Before The Heat hook and exports by share of height', () => {
    const z = newZone('cane', 40, 10)
    expect([z.y0, z.y1]).toEqual([10, 40])
    expect(z.external).toEqual({ source: null, ref: null })
    expect(zoneExport([z], 80).zones[0].at).toEqual([0.125, 0.5])
    expect(zoneProblems([z], 30)).toHaveLength(1)
  })
})
