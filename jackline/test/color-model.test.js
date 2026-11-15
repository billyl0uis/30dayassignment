import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSection } from '../src/geometry/profile.js'
import { PRESETS } from '../src/model/presets.js'
import {
  addSeam, clampSpan, hasInside, layerStack, moveSeam, nearestS, newColor, newRegion, normalizeColors,
  normalizeStudio, pointAtS, removeSeam, sectionAt, stackRuns, transmittance,
} from '../src/model/color.js'

const near = (a, b, eps = 1e-6, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} got ${a}, expected ${b}`)
const tumbler = (wall = PRESETS.tumbler.wall) => buildSection({ ...PRESETS.tumbler, wall })

const blue = newColor({ id: 'blue', hex: '#2f56c9', strength: 2 })
const white = newColor({ id: 'white', hex: '#ffffff', opaque: true })
const red = newColor({ id: 'red', hex: '#c0302a', opaque: true })
const studio = normalizeStudio({ library: [blue, white, red] })
const plan = (regions, incalmo) => normalizeColors({ regions, incalmo })

test('s runs 0 → 1 along the outside wall, and the inside shares it', () => {
  const sec = tumbler()
  assert.equal(sec.outerS[0], 0)
  assert.equal(sec.outerS.at(-1), 1)
  for (let i = 1; i < sec.outerS.length; i++) assert.ok(sec.outerS[i] >= sec.outerS[i - 1])
  assert.equal(sec.innerS.length, sec.inner.length)
  assert.equal(sec.innerS.at(-1), 1)
  assert.ok(sec.innerS[0] > 0, 'a tumbler has a solid base, so the inside starts above the foot')
})

test('pointAtS and nearestS invert each other', () => {
  const sec = buildSection(PRESETS.wine)
  assert.deepEqual(pointAtS(sec, 0), sec.outer[0])
  assert.deepEqual(pointAtS(sec, 1), sec.outer.at(-1))
  for (const s of [0.1, 0.37, 0.5, 0.82]) near(nearestS(sec, pointAtS(sec, s)), s, 1e-6, `s=${s}`)
})

test('no inside surface in the solid base', () => {
  const sec = tumbler()
  assert.equal(hasInside(sec, 0.01), false)
  assert.equal(hasInside(sec, 0.9), true)
})

test('regions get per-kind defaults and only per-kind fields', () => {
  const o = newRegion('overlay', 'blue')
  assert.deepEqual([o.s0, o.s1, o.pct], [0, 1, 0.1])
  const f = newRegion('frit', 'blue')
  assert.equal(f.grain, 'medium')
  assert.equal(f.pct, undefined)
  assert.equal(newRegion('powder', 'blue').pct, undefined)
  assert.throws(() => newRegion('glitter', 'blue'))
})

test('spans stay in order and wraps stay pinned to their end', () => {
  const r = clampSpan({ kind: 'overlay', s0: 0.8, s1: 0.2 })
  assert.ok(r.s0 < r.s1)
  const lip = clampSpan({ ...newRegion('wrap', 'red'), s0: 0.7, s1: 0.85 })
  assert.equal(lip.s1, 1)
  assert.equal(lip.s0, 0.7)
  const foot = clampSpan({ ...newRegion('wrap', 'red', { zone: 'foot' }), s0: 0.3, s1: 0.1 })
  assert.equal(foot.s0, 0)
  assert.equal(foot.s1, 0.1)
})

test('incalmo seams split, move and merge as a partition', () => {
  let inc = normalizeColors().incalmo
  inc = addSeam(inc, 0.5, 'blue')
  assert.deepEqual(inc, { seams: [0.5], sections: [null, 'blue'] })
  inc = addSeam(inc, 0.25, 'red')
  assert.deepEqual(inc.sections, [null, 'red', 'blue'])
  assert.equal(sectionAt(inc, 0.3), 1)
  assert.equal(moveSeam(inc, 0, 0.9).seams[0], 0.49, 'a seam cannot pass its neighbor')
  inc = removeSeam(inc, 0)
  assert.deepEqual(inc, { seams: [0.5], sections: [null, 'blue'] })
  assert.equal(addSeam(inc, 0.5005), inc, 'too close to an existing seam')
})

test('old saves and junk load as an empty plan', () => {
  assert.deepEqual(normalizeColors(undefined), { regions: [], incalmo: { seams: [], sections: [null] } })
  const c = normalizeColors({ regions: [{ kind: 'nope' }, { kind: 'powder', colorId: 'blue' }], incalmo: { seams: [0.6, 0.3, 0.3] } })
  assert.equal(c.regions.length, 1)
  assert.deepEqual(c.incalmo, { seams: [0.3, 0.6], sections: [null, null, null] })
})

test('stack runs inside to outside in application order', () => {
  const sec = tumbler()
  const c = plan([
    newRegion('underlay', 'blue', { id: 'u1' }),
    newRegion('underlay', 'red', { id: 'u2', s0: 0.5 }),
    newRegion('overlay', 'white', { id: 'o1', s1: 0.6 }),
    newRegion('powder', 'blue', { id: 'p1' }),
  ])
  const st = layerStack(sec, c, studio, 0.55)
  assert.deepEqual(st.map((l) => l.key), ['u1', 'u2', 'body0', 'o1', 'p1'])
  near(st.reduce((a, l) => a + l.t, 0), sec.wall, 1e-9, 'layers fill the wall exactly')
})

test('bar color is a share of the wall wherever the wall is', () => {
  for (const wall of [0.2, 0.5]) {
    const sec = tumbler(wall)
    const st = layerStack(sec, plan([newRegion('overlay', 'blue', { pct: 0.1 })]), studio, 0.7)
    near(st.find((l) => l.kind === 'overlay').t, wall * 0.1, 1e-12)
  }
})

test('no underlay where there is no inside (solid base)', () => {
  const sec = tumbler()
  const st = layerStack(sec, plan([newRegion('underlay', 'blue')]), studio, 0.01)
  assert.equal(st.some((l) => l.kind === 'underlay'), false)
})

test('opaque hides what is under it from the side it is seen from', () => {
  const sec = tumbler()
  // White opaque overlay over a blue underlay: blue still shows from inside.
  let st = layerStack(sec, plan([newRegion('underlay', 'blue'), newRegion('overlay', 'white')]), studio, 0.7)
  const under = st.find((l) => l.kind === 'underlay')
  assert.equal(under.fromOutside, false)
  assert.equal(under.fromInside, true)
  assert.equal(under.hidden, false)
  // Opaque on both sides: the middle can't be seen at all.
  st = layerStack(sec, plan([newRegion('underlay', 'red'), newRegion('overlay', 'white')], { seams: [], sections: ['blue'] }), studio, 0.7)
  assert.equal(st.find((l) => l.kind === 'body').hidden, true)
  // In the solid base there's no inside view, so an opaque overlay hides the body.
  st = layerStack(sec, plan([newRegion('overlay', 'white')], { seams: [], sections: ['blue'] }), studio, 0.01)
  assert.equal(st.find((l) => l.kind === 'body').hidden, true)
})

test('opaque frit is scattered grains and never hides what is under it', () => {
  const st = layerStack(tumbler(), plan([newRegion('frit', 'white')], { seams: [], sections: ['blue'] }), studio, 0.3)
  assert.equal(st.find((l) => l.kind === 'body').hidden, false)
})

test('stack runs tile the wall and break at every edge and seam', () => {
  const sec = tumbler()
  const c = plan([newRegion('overlay', 'blue', { s0: 0.2, s1: 0.4 })], { seams: [0.6], sections: [null, 'red'] })
  const runs = stackRuns(sec, c, studio)
  assert.equal(runs[0].s0, 0)
  assert.equal(runs.at(-1).s1, 1)
  for (let i = 1; i < runs.length; i++) assert.equal(runs[i].s0, runs[i - 1].s1)
  for (const s of [0.2, 0.4, 0.6, sec.innerS[0]]) assert.ok(runs.some((r) => r.s0 === s), `break at ${s}`)
})

test('Beer–Lambert: thicker or longer path is deeper; opaque blocks all', () => {
  const thin = transmittance(blue, 0.02), thick = transmittance(blue, 0.06)
  thin.forEach((t, k) => near(thick[k], t ** 3, 1e-12, 'three times the path is the cube of the transmittance'))
  transmittance(blue, 0.02, 3).forEach((t, k) => near(t, thick[k], 1e-12))
  assert.deepEqual(transmittance(white, 0.001), [0, 0, 0])
  assert.deepEqual(transmittance(null, 1), [1, 1, 1])
})
