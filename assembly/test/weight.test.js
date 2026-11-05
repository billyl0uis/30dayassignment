import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPart, partMetrics } from '../src/core/parts.js'
import { breakLink, duplicatePart, familyCounts } from '../src/core/families.js'
import { emptyScene, sceneFromJSON, sceneToJSON, sceneTotals } from '../src/core/scene.js'
import { defaultSettings } from '../src/core/assumptions.js'
import { fmtTotalMass } from '../src/core/units.js'

const S = defaultSettings()
const near = (a, b, rel = 1e-9) => assert.ok(Math.abs(a - b) <= Math.abs(b) * rel, `got ${a}, expected ${b}`)

test('weight = volume × density (100 cm³ block at 2.5 g/cm³ = 250 g)', () => {
  const p = createPart('solid', { dims: { shape: 'block', widthMm: 100, depthMm: 50, heightMm: 20 } })
  near(partMetrics(p, S).weightG, 250)
  near(partMetrics(p, { ...S, density: 3.0 }).weightG, 300)
})

test('defaults: blown wall 4 mm; bad numbers are replaced, not used', () => {
  assert.equal(createPart('blown').dims.wallMm, 4)
  const p = createPart('solid', { dims: { shape: 'sphere', diameterMm: -5 } })
  assert.ok(p.dims.diameterMm > 0)
  assert.throws(() => createPart('lamp'))
})

test('duplicate and vary keeps the family; break link starts a new one', () => {
  const a = createPart('blown', { name: 'Float' })
  const b = duplicatePart(a, { scale: 0.8, color: { hex: '#1e3a8a' } })
  const c = duplicatePart(b, { dims: { wallMm: 5 } })
  assert.equal(b.familyId, a.id)
  assert.equal(c.familyId, a.id)
  assert.equal(c.sourceId, b.id)
  near(c.scale, 0.8)
  assert.equal(c.dims.wallMm, 5)
  assert.equal(a.dims.wallMm, 4, 'source untouched')
  assert.equal(b.color.hex, '#1e3a8a')
  near(partMetrics(b, S).weightG, partMetrics(a, S).weightG * 0.8 ** 3)

  const lone = breakLink(c)
  const counts = familyCounts([a, b, lone], S)
  assert.equal(counts.blown.count, 3)
  assert.deepEqual(counts.blown.families.map((f) => f.count).sort(), [1, 2])
})

test('scene totals add up, and survive a save/load round trip', () => {
  const sc = emptyScene()
  const a = createPart('solid', { dims: { shape: 'block', widthMm: 100, depthMm: 50, heightMm: 20 } })
  sc.parts = [a, duplicatePart(a), createPart('cane', { dims: { lengthMm: 200, diameterMm: 10 } })]
  const t = sceneTotals(sc)
  near(t.weightG, 250 + 250 + Math.PI * 25 * 200 / 1000 * 2.5)
  const back = sceneFromJSON(sceneToJSON(sc))
  near(sceneTotals(back).weightG, t.weightG)
  assert.deepEqual(back.parts, sc.parts)
  assert.throws(() => sceneFromJSON('{"hello":1}'))
})

test('total weight shows g and kg, lb when asked', () => {
  assert.equal(fmtTotalMass(1234.4), '1,234 g · 1.23 kg')
  assert.equal(fmtTotalMass(453.59237, 'lb'), '454 g · 0.45 kg · 1.00 lb')
})
