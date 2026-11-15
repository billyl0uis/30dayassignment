import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSection } from '../src/geometry/profile.js'
import { PRESETS } from '../src/model/presets.js'
import {
  PACK_ROWS, absorptionRGB, linearRGB, newColor, newRegion, normalizeColors, normalizeStudio, packLayers, pathFactor, transmittance, viewOf, layerStack,
} from '../src/model/color.js'

const near = (a, b, eps = 1e-9, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} got ${a}, expected ${b}`)
const blue = newColor({ id: 'blue', hex: '#2f56c9', strength: 1 })
const amber = newColor({ id: 'amber', hex: '#c47a1f', strength: 2 })
const white = newColor({ id: 'white', hex: '#ffffff', opaque: true })
const studio = normalizeStudio({ library: [blue, amber, white] })
const sec = buildSection(PRESETS.tumbler)
const plan = (regions, sections) => normalizeColors({ regions, incalmo: sections ? { seams: [], sections } : undefined })

test('strength 1 through 1 mm gives back the swatch color', () => {
  transmittance(blue, 0.1).forEach((t, k) => near(t, linearRGB(blue.hex)[k], 1e-3))
  assert.deepEqual(absorptionRGB(newColor({ hex: '#ffffff' })), [0, 0, 0], 'colorless glass absorbs nothing')
})

test('path factor: 1 straight on, longer toward the silhouette, inside and out', () => {
  near(pathFactor(0.3, 4, 1), 1, 1e-9)
  near(pathFactor(0.3, 4, 1, true), 1, 1e-9)
  // Longest where the sight line just grazes the inside surface (cos ≈ 0.38
  // here); nearer the edge it skims a shorter chord through the glass.
  const graze = Math.sqrt(1 - (3.7 / 4) ** 2)
  assert.ok(pathFactor(0.3, 4, 0.8) > 1)
  assert.ok(pathFactor(0.3, 4, graze) > pathFactor(0.3, 4, 0.8))
  assert.ok(pathFactor(0.3, 4, 0.1) < pathFactor(0.3, 4, graze))
  assert.ok(pathFactor(0.3, 4, 0.1) <= 12)
  near(pathFactor(0.3, 0.2, 0.5), 2, 1e-9, 'tiny radius falls back to a slab')
})

test('a thicker wall makes the same transparent layer deeper', () => {
  const c = plan([newRegion('overlay', 'blue', { pct: 0.1 })])
  const A = (wall) => viewOf(layerStack(buildSection({ ...PRESETS.tumbler, wall }), c, studio, 0.6), studio, 'outside').A
  const thin = A(0.2), thick = A(0.6)
  thin.forEach((a, k) => near(thick[k], a * 3, 1e-9))
})

test('opaque color does not change with thickness and stops the view', () => {
  const c = plan([newRegion('underlay', 'amber'), newRegion('overlay', 'white')])
  for (const wall of [0.2, 0.6]) {
    const v = viewOf(layerStack(buildSection({ ...PRESETS.tumbler, wall }), c, studio, 0.6), studio, 'outside')
    assert.equal(v.opaque.id, 'white')
    assert.deepEqual(v.A, [0, 0, 0], 'the amber under it adds nothing seen from outside')
  }
  const inside = viewOf(layerStack(sec, c, studio, 0.6), studio, 'inside')
  assert.equal(inside.opaque.id, 'white')
  assert.ok(inside.A[2] > 0, 'from inside, the amber underlay is seen in front of the white')
})

test('frit is reported as speckle, not added to the even layer', () => {
  const v = viewOf(layerStack(sec, plan([newRegion('frit', 'blue', { grain: 'coarse', density: 0.4 })]), studio, 0.3), studio, 'outside')
  assert.deepEqual(v.A, [0, 0, 0])
  assert.equal(v.frit.density, 0.4)
  assert.equal(v.frit.grain, 'coarse')
})

test('powder is an even layer, never speckle', () => {
  const v = viewOf(layerStack(sec, plan([newRegion('powder', 'blue')]), studio, 0.3), studio, 'outside')
  assert.equal(v.frit, null)
  assert.ok(v.A[0] > 0)
})

test('packed texture: bands land at the right s, sides and rows', () => {
  const N = 100
  const c = plan([newRegion('overlay', 'white', { s0: 0.5, s1: 0.7 }), newRegion('frit', 'blue', { s0: 0, s1: 0.3, grain: 'fine', density: 0.6 })])
  const d = packLayers(sec, c, studio, N)
  assert.equal(d.length, N * PACK_ROWS * 4)
  const px = (side, row, i) => [...d.slice(((side * 3 + row) * N + i) * 4, ((side * 3 + row) * N + i) * 4 + 4)]
  assert.equal(px(0, 0, 60)[3], 1, 'opaque from outside inside the band')
  assert.equal(px(0, 0, 80)[3], 0, 'clear past it')
  assert.equal(px(1, 0, 60)[3], 1, 'opaque from inside too: nothing in front of it on that side')
  near(px(0, 1, 10)[3], 0.6, 1e-6, 'frit coverage')
  assert.ok(px(0, 2, 10)[3] > 0, 'transparent frit: positive grain size')
  assert.equal(px(0, 1, 40)[3], 0, 'no frit above its band')
})
