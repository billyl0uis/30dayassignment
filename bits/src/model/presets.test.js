import { describe, expect, it } from 'vitest'
import { runChecks } from './checks.js'
import { measurePiece, worstFill } from './derived.js'
import { PRESETS, buildPreset, sAtHeight } from './presets.js'
import { anchorAt } from './surface.js'
import { bodySection } from './derived.js'

describe('sAtHeight', () => {
  it('finds the point on the wall at a given height', () => {
    const sec = bodySection(PRESETS[0])
    for (const y of [1, 3.2, 9, 13]) expect(anchorAt(sec, sAtHeight(sec, y), 0).y).toBeCloseTo(y, 2)
  })
})

for (const def of PRESETS) {
  describe(def.name, () => {
    const piece = buildPreset(def)
    const m = measurePiece(piece)
    const results = runChecks({ m, worst: worstFill(m), ...piece })
    const warns = results.filter((r) => r.level === 'warn')

    it('builds, weighs something and stands up', () => {
      expect(piece.bits.length).toBeGreaterThan(0)
      expect(m.total.mass).toBeGreaterThan(50)
      expect(m.tip.deg).toBeGreaterThan(0)
      for (const b of m.bits) expect(Number.isFinite(b.mass)).toBe(true)
    })

    // Presets are sensible starting points, so they start clean, except
    // where an ordinary piece trips a placeholder threshold. That's left
    // showing on purpose: it's the kind of case to calibrate against.
    const EXPECTED = {
      // A normal pulled handle's attachment gob is several times the wall.
      lilypad: [1],
    }
    it(`starts with ${EXPECTED[def.id] ? 'only the expected' : 'no'} warnings`, () => {
      expect(warns.map((w) => w.check)).toEqual(EXPECTED[def.id] ?? [])
    })

    it('reports an annealing note', () => {
      expect(results.some((r) => r.check === 5)).toBe(true)
    })
  })
}

it('rings are evenly spaced: the roemer has 6 prunts 60° apart', () => {
  const p = buildPreset(PRESETS.find((d) => d.id === 'roemer'))
  const prunts = p.bits.filter((b) => b.type === 'raspberry')
  expect(prunts).toHaveLength(6)
  expect(prunts[0].theta - prunts[1].theta).toBeCloseTo(Math.PI / 3, 9)
})

it('the winged goblet stands on its applied foot, with wings on the solid stem', () => {
  const p = buildPreset(PRESETS.find((d) => d.id === 'winged'))
  const m = measurePiece(p)
  expect(m.lift).toBeCloseTo(0.35, 9)
  expect(m.footR).toBeCloseTo(3.7, 9)
  const wing = m.bits[p.bits.findIndex((b) => b.type === 'wings')]
  expect(wing.anchor.y).toBeLessThan(m.sec.floorY)
})
