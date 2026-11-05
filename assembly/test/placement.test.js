import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPart } from '../src/core/parts.js'
import { emptyScene } from '../src/core/scene.js'
import { cylinderProfile } from '../src/core/jacklineProfiles.js'
import { applyRot, bounds, footprint, posedPositions, rotationMatrix, settleAll, settlePart, slideToPart, wallZ } from '../src/core/placement.js'

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} got ${a}, expected ${b} ±${tol}`)
const block = (w, d, h, pose) => createPart('solid', { dims: { shape: 'block', widthMm: w, depthMm: d, heightMm: h }, pose })
const sphere = (D, pose) => createPart('solid', { dims: { shape: 'sphere', diameterMm: D }, pose })
const cyl = (D, L, pose) => createPart('solid', { dims: { shape: 'cylinder', diameterMm: D, lengthMm: L }, pose })
const scene = (...parts) => ({ ...emptyScene(), parts })
const place = (sc, p) => ({ ...p, pose: settlePart(sc, p) })

test('rotation: tipping 90° towards +x lays the up axis along +x', () => {
  const v = applyRot(rotationMatrix({ yaw: 0, tilt: 90, tiltDir: 0 }), [0, 1, 0])
  close(v[0], 1, 1e-12); close(v[1], 0, 1e-12); close(v[2], 0, 1e-12)
  const w = applyRot(rotationMatrix({ yaw: 0, tilt: 90, tiltDir: 90 }), [0, 1, 0])
  close(w[2], -1, 1e-12, 'tiltDir 90 is towards −z (the back wall)')
})

test('snap-to-rest: a sphere dropped anywhere on an empty base sits on it', () => {
  const s = sphere(80, { x: 120, y: 500, z: -40 })
  close(settlePart(scene(s), s).y, 0, 1e-6)
})

test('stacking: dropped over a block, a part lands on the block top', () => {
  const b = block(200, 200, 30)
  const s = sphere(60, { x: 20, y: 999, z: 10 })
  close(settlePart(scene(b, s), s).y, 30, 0.01)
  const top = block(80, 80, 20, { x: 50, y: 0, z: 0 })
  close(settlePart(scene(b, top), top).y, 30, 0.01, 'flat on flat')
})

test('stacking: beside the block (no overlap) it drops to the base', () => {
  const b = block(100, 100, 30)
  const s = sphere(40, { x: 200, z: 0 })
  close(settlePart(scene(b, s), s).y, 0, 1e-6)
})

test('a small sphere dropped into an open cup lands on the cavity floor', () => {
  const cup = createPart('blown', { dims: { points: cylinderProfile(120, 100), wallMm: 4, closedTop: false } })
  const s = sphere(30, { x: 0, z: 0 })
  close(settlePart(scene(cup, s), s).y, 4, 0.3)
})

test('a tilted cylinder rests on its lowest edge', () => {
  const c = cyl(60, 200, { tilt: 30, tiltDir: 0 })
  const p = settlePart(scene(c), c)
  close(bounds(posedPositions(c, p)).min[1], 0, 1e-6)
})

test('leaning on the wall: foot on the base, top touching the wall', () => {
  const c = cyl(60, 300, { z: 0, tilt: 8, lean: 'wall' })
  const p = settlePart(scene(c), c)
  const b = bounds(posedPositions(c, p))
  close(b.min[1], 0, 1e-6, 'on the base')
  close(b.min[2], wallZ(emptyScene().stage), 0.1, 'touching the wall')
  close(p.tiltDir, 90, 1e-9, 'tips towards the wall')
})

test('leaning on another part: slides in until it touches', () => {
  const b = block(100, 100, 250, { x: 200, z: 0 })
  const c = cyl(50, 300, { x: 0, z: 0, tilt: 10, lean: b.id })
  const sc = scene(b, c)
  const p = settlePart(sc, c)
  close(slideToPart(c, p, b, [1, 0, 0]), 0, CELL_TOL, 'gap closed')
  close(p.tiltDir, 0, 1e-9, 'tips towards the block')
  assert.ok(bounds(posedPositions(c, p)).max[0] > 150, 'top reaches the block face')
})
const CELL_TOL = 2.5 // one depth-map cell, plus rounding

test('hung part hangs its line length below the armature', () => {
  const sc = emptyScene()
  const s = sphere(50, { mount: 'hung', lineMm: 400, x: 10 })
  const p = settlePart({ ...sc, parts: [s] }, s)
  close(p.y + 50, sc.stage.armatureY - 400, 1e-6)
})

test('settle all: a stack comes to rest bottom-up', () => {
  const a = block(150, 150, 40, { y: 300 })
  const b = block(100, 100, 30, { y: 600 })
  const c = sphere(50, { y: 900 })
  const out = settleAll(scene(a, b, c))
  const y = (id) => out.parts.find((p) => p.id === id).pose.y
  close(y(a.id), 0, 1e-6); close(y(b.id), 40, 0.01); close(y(c.id), 70, 0.01)
})

test('footprint: bounding rectangle, height and hang drop', () => {
  const sc = emptyScene()
  const a = block(100, 60, 40, { x: -100, z: 0 })
  const b = block(50, 50, 120, { x: 100, z: 50 })
  let f = footprint({ ...sc, parts: [a, b] })
  close(f.w, 275, 1e-6); close(f.d, 105, 1e-6); close(f.height, 120, 1e-6)
  assert.equal(f.hangDrop, null)
  const h = place({ ...sc, parts: [] }, sphere(40, { mount: 'hung', lineMm: 300 }))
  f = footprint({ ...sc, parts: [a, b, h] })
  close(f.hangDrop, 340, 1e-6)
  close(f.height, sc.stage.armatureY, 1e-6, 'armature counts in overall height')
})
