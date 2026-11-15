import { describe, expect, it } from 'vitest'
import { runChecks } from './checks.js'
import { measureFilled, measurePiece, worstFill } from './derived.js'
import { scheduleRows, sizeText, totals } from './describe.js'
import { PRESETS, buildPreset } from './presets.js'

const load = (id) => {
  const piece = buildPreset(PRESETS.find((p) => p.id === id))
  const m = measurePiece(piece)
  const worst = worstFill(m)
  const checks = runChecks({ m, worst, ...piece })
  return { piece, m, worst, checks, filled: measureFilled(m, 1) }
}

describe('bit schedule', () => {
  it('one row per bit, numbered in working order', () => {
    const { piece, m } = load('roemer')
    const rows = scheduleRows({ bits: piece.bits, m, glasses: piece.glasses, units: 'mm' })
    expect(rows.map((r) => r.n)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(rows[0].where).toBe('under the base')
    expect(rows[1].where).toMatch(/^32 mm up · 6:00$/)
    expect(rows[1].size).toBe('⌀12 mm × 5 mm high, stamp ⌀10 mm')
    expect(rows[1].tool).toBe('raspberry stamp')
  })

  it('the lip says it adds no glass', () => {
    const { piece, m } = load('lilypad')
    const lip = scheduleRows({ bits: piece.bits, m, glasses: piece.glasses, units: 'mm' }).find((r) => r.type.startsWith('Pulled'))
    expect(lip.mass).toBe('no glass')
    expect(lip.glass).toBe('—')
  })

  it('shows the glass and its COE when one is entered', () => {
    const { piece, m } = load('threaded')
    const glasses = piece.glasses.map((g) => (g.id === 'g-thread' ? { ...g, coe: '96' } : g))
    expect(scheduleRows({ bits: piece.bits, m, glasses, units: 'mm' })[0].glass).toBe('Cobalt thread (COE 96)')
  })

  it('switches to inches', () => {
    const { piece } = load('roemer')
    expect(sizeText(piece.bits[1], 'in')).toBe('⌀0.47 in × 0.20 in high, stamp ⌀0.39 in')
  })
})

describe('totals', () => {
  it('empty and full side by side, and the thickest section from the annealing check', () => {
    const t = Object.fromEntries(totals({ ...load('winged'), units: 'mm' }).map(([k, a, b]) => [k, [a, b]]))
    expect(t['Mass'][0]).toMatch(/g$/)
    expect(t['Min tip angle'][0]).toMatch(/°$/)
    expect(t['Min tip angle'][1]).toMatch(/°$/)
    expect(t['Thickest section'][0]).toMatch(/mm: the solid stem$/)
  })
})
