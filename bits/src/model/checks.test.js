import { describe, expect, it } from 'vitest'
import { CHECKS } from '../config/checks.js'
import { BIT_TYPES } from './bits/index.js'
import { pointNeck } from './bits/prunt.js'
import { bodyThickest, runChecks } from './checks.js'
import { bodySection, measurePiece, worstFill } from './derived.js'

// Straight cylinder body: r = 3 cm, 10 cm tall, 3 mm wall, 6 mm solid base.
const CYL = { points: [[3, 0], [3, 5], [3, 10]], walls: [0.3, 0.3, 0.3], floor: 0.6 }
const BODY = { id: 'g-body', name: 'Clear', coe: '', group: '', density: 2.5, color: '#fff' }

const bit = (type, params = {}, at = {}) => ({
  id: `${type}-${Math.random().toString(36).slice(2, 7)}`,
  type, s: 0.5, theta: 0, spin: 0,
  texture: BIT_TYPES[type].defaultTexture, glass: 'g-body',
  ...at,
  params: { ...BIT_TYPES[type].defaults, ...params },
})

function check(bits, { glasses = [BODY], body = CYL, cfg } = {}) {
  const m = measurePiece({ ...body, bits, glasses, bodyGlass: 'g-body' })
  return runChecks({ m, worst: worstFill(m), bits, glasses, bodyGlass: 'g-body', cfg })
}
const has = (res, n, level = 'warn') => res.some((r) => r.check === n && r.level === level)

describe('every result explains itself', () => {
  it('carries a why', () => {
    for (const r of check([bit('prunt', { height: 1.5 })])) expect(r.why.length).toBeGreaterThan(40)
  })
})

describe('1. bit vs the wall under it', () => {
  it('a 6 mm prunt on a 3 mm wall is fine (2×)', () => expect(has(check([bit('prunt')]), 1)).toBe(false))
  it('a 12 mm prunt on a 3 mm wall warns (4×)', () => expect(has(check([bit('prunt', { height: 1.2 })]), 1)).toBe(true))
  it('the threshold comes from the config', () => {
    expect(has(check([bit('prunt', { height: 1.2 })], { cfg: { ...CHECKS, bitToWallRatio: 5 } }), 1)).toBe(false)
  })
})

describe('2. too thin to survive', () => {
  it('a 1 mm thread warns; a 2 mm one doesn’t', () => {
    expect(has(check([bit('trail', { diameter: 0.1 })]), 2)).toBe(true)
    expect(has(check([bit('trail', { diameter: 0.2 })]), 2)).toBe(false)
  })
  it('combing a thread can take it under the line', () => {
    const t = bit('trail', { diameter: 0.17, depth: 2.5, combs: 12 })
    expect(has(check([t]), 2)).toBe(false)
    expect(has(check([{ ...t, texture: 'combed' }]), 2)).toBe(true)
  })
  it('a long fine pulled point warns', () => {
    expect(has(check([bit('prunt', { point: 2 }, { texture: 'pulled point' })]), 2)).toBe(true)
  })
  it('pointNeck reads the profile: whole diameter far back, nothing at the tip', () => {
    const p = { diameter: 1.4, height: 0.6, point: 1 }
    expect(pointNeck(p, 1.6)).toBeCloseTo(1.4, 3)
    expect(pointNeck(p, 1e-6)).toBeLessThan(0.02)
  })
})

describe('3. snag / break-off', () => {
  it('a thin handle reaching far out warns; a stout one doesn’t', () => {
    const at = { s: 0.85, s2: 0.25 }
    expect(has(check([bit('handle', { diameter: 0.5, reach: 5 }, at)]), 3)).toBe(true)
    expect(has(check([bit('handle', { diameter: 1.2, reach: 4 }, at)]), 3)).toBe(false)
  })
  it('a prunt close under the rim warns', () => {
    expect(has(check([bit('prunt', {}, { s: 0.95 })]), 3)).toBe(true)
    expect(has(check([bit('prunt', {}, { s: 0.5 })]), 3)).toBe(false)
  })
  it('a long wing warns', () => {
    expect(has(check([bit('wings', { span: 5, height: 1.6 })]), 3)).toBe(true)
  })
})

describe('4. glass compatibility', () => {
  const other = (patch) => ({ ...BODY, id: 'g-2', name: 'Cobalt', ...patch })
  const onOther = () => bit('prunt', {}, { glass: 'g-2' })
  it('different COE warns', () => {
    const res = check([onOther()], { glasses: [{ ...BODY, coe: '96' }, other({ coe: '104' })] })
    expect(has(res, 4)).toBe(true)
  })
  it('same COE but no tested group is a note, not a pass', () => {
    const res = check([onOther()], { glasses: [{ ...BODY, coe: '96' }, other({ coe: '96' })] })
    expect(has(res, 4, 'note')).toBe(true)
    expect(has(res, 4)).toBe(false)
  })
  it('same COE, different tested groups warns', () => {
    const res = check([onOther()], { glasses: [{ ...BODY, coe: '96', group: 'A' }, other({ coe: '96', group: 'B' })] })
    expect(has(res, 4)).toBe(true)
  })
  it('same tested group says nothing', () => {
    const res = check([onOther()], { glasses: [{ ...BODY, coe: '96', group: 'A' }, other({ coe: '96', group: 'A' })] })
    expect(res.some((r) => r.check === 4)).toBe(false)
  })
})

describe('5. annealing', () => {
  it('the thickest body section is the 6 mm solid base, not the 3 mm wall', () => {
    // Within 1%: reporting it thinner than it is would be the unsafe way.
    expect(bodyThickest(bodySection(CYL)).thickness).toBeCloseTo(0.6, 2)
  })
  it('speaks inches when the app does', () => {
    const m = measurePiece({ ...CYL, bits: [], glasses: [BODY], bodyGlass: 'g-body' })
    const a = runChecks({ m, worst: null, bits: [], glasses: [BODY], bodyGlass: 'g-body', units: 'in' }).find((r) => r.check === 5)
    expect(a.title).toMatch(/^Anneal for 0\.236 in/)
  })
  it('names a thick foot over the body', () => {
    const f = bit('foot', { thickness: 1.2 })
    const a = check([f]).find((r) => r.check === 5)
    expect(a.title).toMatch(/12 mm/)
    expect(a.bits).toEqual([f.id])
  })
})

describe('6. stability', () => {
  it('a plain tumbler is fine', () => expect(has(check([]), 6)).toBe(false))
  it('a narrow foot under a tall body warns', () => {
    const tall = { points: [[1, 0], [3, 3], [3, 25]], walls: [0.3, 0.3, 0.3], floor: 0.6 }
    expect(has(check([], { body: tall }), 6)).toBe(true)
  })
})
