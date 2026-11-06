import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSection } from '../src/geometry/profile.js'
import { PRESETS } from '../src/model/presets.js'
import {
  colorInUse, newRegion, normalizeColors, offsetPath, pointAtS, removeRegion, reorderRegion, shiftRegion, spanPath, updateRegion,
} from '../src/model/color.js'

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `got ${a}, expected ${b}`)
const plan = (...regions) => normalizeColors({ regions })

test('changing type keeps color and span, drops unused fields', () => {
  let c = plan(newRegion('overlay', 'a', { id: 'r', s0: 0.2, s1: 0.5, pct: 0.2 }))
  c = updateRegion(c, 'r', { kind: 'frit' })
  const r = c.regions[0]
  assert.deepEqual([r.kind, r.colorId, r.s0, r.s1, r.pct, r.grain], ['frit', 'a', 0.2, 0.5, undefined, 'medium'])
  c = updateRegion(c, 'r', { kind: 'wrap' })
  assert.deepEqual([c.regions[0].s0, c.regions[0].s1], [0.92, 1], 'a wrap snaps to the rim')
  c = updateRegion(c, 'r', { zone: 'foot' })
  assert.deepEqual([c.regions[0].s0, c.regions[0].s1], [0, 0.08])
})

test('edge edits are clamped; shifting keeps the length', () => {
  let c = plan(newRegion('overlay', 'a', { id: 'r', s0: 0.2, s1: 0.5 }))
  c = updateRegion(c, 'r', { s1: 0.1 })
  assert.ok(c.regions[0].s1 > c.regions[0].s0)
  c = plan(newRegion('overlay', 'a', { id: 'r', s0: 0.2, s1: 0.5 }))
  c = shiftRegion(c, 'r', 0.9)
  near(c.regions[0].s1, 1)
  near(c.regions[0].s0, 0.7)
})

test('reorder and remove', () => {
  let c = plan(newRegion('powder', 'a', { id: 'x' }), newRegion('frit', 'b', { id: 'y' }))
  c = reorderRegion(c, 'y', -1)
  assert.deepEqual(c.regions.map((r) => r.id), ['y', 'x'])
  assert.equal(reorderRegion(c, 'y', -1), c, 'already first')
  c = removeRegion(c, 'y')
  assert.deepEqual(c.regions.map((r) => r.id), ['x'])
  assert.equal(colorInUse(c, 'a'), true)
  assert.equal(colorInUse(c, 'b'), false)
})

test('spanPath ends exactly at s0 and s1', () => {
  const sec = buildSection(PRESETS.carafe)
  const p = spanPath(sec.outer, sec.outerS, 0.3, 0.6)
  assert.deepEqual(p[0], pointAtS(sec, 0.3))
  assert.deepEqual(p.at(-1), pointAtS(sec, 0.6))
  assert.deepEqual(spanPath(sec.inner, sec.innerS, 0, 0.01), [], 'nothing below where the inside starts')
})

test('offsetPath: negative moves off the outside wall', () => {
  // A straight vertical wall at r = 3, walking up: outside is +r.
  const wall = [[3, 0], [3, 5], [3, 10]]
  assert.deepEqual(offsetPath(wall, -0.5).map((p) => p[0]), [3.5, 3.5, 3.5])
})
