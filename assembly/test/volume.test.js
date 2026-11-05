import { test } from 'node:test'
import assert from 'node:assert/strict'
import { blownSection, offsetLeft, solidOfRevolution } from '../src/core/profile.js'
import { createPart, eggProfile, partMetrics } from '../src/core/parts.js'
import { cylinderProfile, sphereProfile, JACKLINE_PROFILES } from '../src/core/jacklineProfiles.js'
import { defaultSettings } from '../src/core/assumptions.js'

const S = defaultSettings()
const PI = Math.PI
const near = (a, b, rel, msg) => assert.ok(Math.abs(a - b) <= Math.abs(b) * rel, `${msg ?? ''} got ${a}, expected ${b} (±${rel * 100}%)`)

test('Pappus: a rectangle spun round the axis is a cylinder', () => {
  const { volume, y } = solidOfRevolution([[0, 0], [30, 0], [30, 100], [0, 100]])
  near(volume, PI * 30 * 30 * 100, 1e-12)
  near(y, 50, 1e-12)
})

test('offset: a foot corner gets an exact inside corner', () => {
  const inner = offsetLeft([[0, 0], [50, 0], [50, 100]], 4)
  assert.deepEqual(inner.map((p) => p.map((v) => +v.toFixed(9))), [[0, 4], [46, 4], [46, 100]])
})

test('blown, open top: straight cup = outer cylinder − inner cylinder', () => {
  const R = 50, H = 100, w = 4
  const sec = blownSection(cylinderProfile(2 * R, H), w, false)
  near(sec.volumeMm3, PI * R * R * H - PI * (R - w) ** 2 * (H - w), 1e-9, 'glass')
  near(sec.cavityVolumeMm3, PI * (R - w) ** 2 * (H - w), 1e-9, 'capacity')
  near(sec.outerVolumeMm3 - sec.cavityVolumeMm3, sec.volumeMm3, 1e-9, 'outer − inner')
})

test('blown, closed top: sealed cylinder has a wall at both ends', () => {
  const R = 40, H = 120, w = 5
  const sec = blownSection(cylinderProfile(2 * R, H), w, true)
  near(sec.volumeMm3, PI * R * R * H - PI * (R - w) ** 2 * (H - 2 * w), 1e-9)
  near(sec.comY, H / 2, 1e-9, 'symmetric, so centre of mass is halfway up')
})

test('blown, closed top: sphere float ≈ spherical shell', () => {
  const D = 120, w = 4, R = D / 2
  const sec = blownSection(sphereProfile(D, 25), w, true)
  // The profile is a spline through points on the circle, so allow 1%.
  near(sec.volumeMm3, (4 / 3) * PI * (R ** 3 - (R - w) ** 3), 0.01)
  near(sec.comY, R, 0.005)
})

test('wall thickness: thicker wall, more glass, less room inside', () => {
  const pts = JACKLINE_PROFILES.carafe.points
  const thin = blownSection(pts, 3, false), thick = blownSection(pts, 6, false)
  assert.ok(thick.volumeMm3 > thin.volumeMm3)
  assert.ok(thick.cavityVolumeMm3 < thin.cavityVolumeMm3)
  near(thin.outerVolumeMm3, thick.outerVolumeMm3, 1e-12, 'outside is the drawn line either way')
})

test('solids: sphere, cylinder, block exact', () => {
  near(partMetrics(createPart('solid', { dims: { shape: 'sphere', diameterMm: 50 } }), S).volumeCm3, ((4 / 3) * PI * 25 ** 3) / 1000, 1e-12)
  near(partMetrics(createPart('solid', { dims: { shape: 'cylinder', diameterMm: 40, lengthMm: 80 } }), S).volumeCm3, (PI * 400 * 80) / 1000, 1e-12)
  near(partMetrics(createPart('solid', { dims: { shape: 'block', widthMm: 100, depthMm: 50, heightMm: 20 } }), S).volumeCm3, 100, 1e-12)
})

test('egg with point = 0 is an ellipsoid', () => {
  const D = 60, L = 90
  const m = partMetrics(createPart('solid', { dims: { shape: 'egg', diameterMm: D, lengthMm: L, point: 0 } }), S)
  near(m.volumeCm3, (PI * D * D * L) / 6 / 1000, 0.002)
  near(m.comMm[1], L / 2, 0.002)
})

test('teardrop: same widest diameter, less glass, weight sits low', () => {
  const egg = partMetrics(createPart('solid', { dims: { shape: 'egg', diameterMm: 60, lengthMm: 90, point: 0 } }), S)
  const drop = partMetrics(createPart('solid', { dims: { shape: 'egg', diameterMm: 60, lengthMm: 90, point: 1 } }), S)
  const widest = Math.max(...eggProfile(60, 90, 1).map((p) => p[0]))
  near(widest, 30, 1e-12)
  assert.ok(drop.volumeCm3 < egg.volumeCm3)
  assert.ok(drop.comMm[1] < 45)
})

test('cane rod is a cylinder lying down', () => {
  const m = partMetrics(createPart('cane', { dims: { lengthMm: 300, diameterMm: 8 } }), S)
  near(m.volumeCm3, (PI * 16 * 300) / 1000, 1e-12)
  assert.deepEqual(m.size, { w: 300, d: 8, h: 8 })
})

test('uniform scale: volume goes with the cube', () => {
  const a = createPart('blown', { dims: { points: sphereProfile(100), wallMm: 4, closedTop: true } })
  const b = { ...a, scale: 1.5 }
  near(partMetrics(b, S).volumeCm3, partMetrics(a, S).volumeCm3 * 1.5 ** 3, 1e-9)
})
