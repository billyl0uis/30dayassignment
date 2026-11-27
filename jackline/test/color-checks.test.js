import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSection } from '../src/geometry/profile.js'
import { newColor, newRegion, normalizeColors, normalizeStudio } from '../src/model/color.js'
import { colorChecks, seamTurn } from '../src/model/colorChecks.js'

// A plain cylinder: r = 4, 10 cm tall, solid up to 1 cm.
const cyl = (wall = 0.4) => buildSection({ points: [[4, 0], [4, 5], [4, 10]], wall, floor: 1 })
// Wide body, sharp shoulder into a narrow neck.
const shouldered = buildSection({ points: [[4, 0], [4, 6], [1.4, 6.6], [1.4, 10]], wall: 0.4, floor: 1 })

const lib = [
  newColor({ id: 'blue', name: 'Blue', tested: true, coe: 96 }),
  newColor({ id: 'red', name: 'Red', tested: true, coe: 96, reactive: ['sulfur-selenium'] }),
  newColor({ id: 'green', name: 'Green', tested: true, coe: 96, reactive: ['Copper'] }),
  newColor({ id: 'white', name: 'White', tested: true, coe: 96, opaque: true }),
  newColor({ id: 'raw', name: 'Untested', tested: false, coe: 96 }),
  newColor({ id: 'off', name: 'Off-COE', tested: true, coe: 90 }),
]
const studio = (patch = {}) => normalizeStudio({ library: lib, clear: { coe: 96 }, ...patch })
const plan = (regions = [], incalmo) => normalizeColors({ regions, incalmo })
const run = (sec, c, st = studio()) => colorChecks(sec, c, st, 'cm').map((x) => ({ id: x.id, ...x.check }))
const ids = (r) => r.map((x) => x.id)
const levels = (r) => r.map((x) => x.level)

test('a clean plan has nothing to say', () => {
  assert.deepEqual(run(cyl(), plan([newRegion('overlay', 'blue')], { seams: [0.5], sections: ['blue', null] })), [])
})

test('BAD: incalmo seam in a wall thinner than the minimum', () => {
  const c = plan([], { seams: [0.5], sections: ['blue', null] })
  const r = run(cyl(0.2), c)
  assert.deepEqual(ids(r), ['seam-wall-0'])
  assert.equal(r[0].level, 'bad')
  assert.match(r[0].text, /at 5\.\d cm up/, 'says where')
  assert.match(r[0].text, /Thicken the wall/, 'says how to fix it')
  assert.deepEqual(run(cyl(0.2), c, studio({ minSeamWall: 0.15 })), [], 'the minimum is editable')
})

test('a seam down in the solid base is through thick glass, so it passes', () => {
  assert.deepEqual(run(cyl(0.2), plan([], { seams: [0.02], sections: ['blue', null] })), [])
})

test('WARN: seam where the wall turns sharply', () => {
  let worst = 0, sAt = 0
  for (let s = 0.05; s < 0.95; s += 0.005) {
    const t = seamTurn(shouldered, s)
    if (t > worst) (worst = t), (sAt = s)
  }
  assert.ok(worst > 30, `shoulder turns ${worst}°`)
  const r = run(shouldered, plan([], { seams: [sAt], sections: ['blue', null] }))
  assert.deepEqual(ids(r), ['seam-turn-0'])
  assert.equal(r[0].level, 'warn')
  assert.ok(seamTurn(cyl(), 0.5) < 1, 'a straight wall barely turns')
})

test('WARN: more incalmo joins than the team limit', () => {
  const c = plan([], { seams: [0.3, 0.5, 0.7], sections: ['blue', null, 'blue', null] })
  assert.deepEqual(ids(run(cyl(), c)), ['joins'])
  assert.deepEqual(run(cyl(), c, studio({ maxJoins: 3 })), [], 'the limit is editable')
  assert.deepEqual(run(cyl(), plan([], { seams: [0.3, 0.6], sections: ['blue', null, 'blue'] })), [], 'two joins are fine')
})

test('WARN: more than 3 color applications on one gather', () => {
  const four = [newRegion('underlay', 'blue'), newRegion('powder', 'blue'), newRegion('frit', 'blue'), newRegion('wrap', 'blue')]
  const r = run(cyl(), plan(four))
  assert.deepEqual(ids(r), ['stack-0'])
  assert.match(r[0].text, /4 color applications/)
  // A seam puts the lip wrap on its own gather: no section has more than 3.
  const split = plan(
    [newRegion('underlay', 'blue', { s1: 0.5 }), newRegion('powder', 'blue', { s1: 0.5 }), newRegion('frit', 'blue', { s1: 0.5 }), newRegion('wrap', 'blue')],
    { seams: [0.5], sections: [null, null] },
  )
  assert.deepEqual(run(cyl(), split), [])
})

test('BAD: untested color, and COE outside the tolerance', () => {
  const r = run(cyl(), plan([newRegion('overlay', 'raw'), newRegion('frit', 'off')]))
  assert.deepEqual(ids(r).sort(), ['coe-off', 'coe-tested-raw'])
  assert.deepEqual(levels(r), ['bad', 'bad'])
  assert.deepEqual(ids(run(cyl(), plan([newRegion('frit', 'off')]), studio({ coeTolerance: 6 }))), [], 'tolerance is editable')
})

test('WARN: studio clear COE not entered', () => {
  const r = run(cyl(), plan([newRegion('overlay', 'blue')]), studio({ clear: { coe: null } }))
  assert.deepEqual(ids(r), ['coe-clear'])
  assert.deepEqual(run(cyl(), plan(), studio({ clear: { coe: null } })), [], 'no color, nothing to compare')
})

test('WARN: reactive pair touching, face to face, edge to edge, or at a seam', () => {
  // Face to face: a green overlay right on a red incalmo section.
  let r = run(cyl(), plan([newRegion('overlay', 'green')], { seams: [], sections: ['red'] }))
  assert.deepEqual(ids(r), ['react-green|red'])
  assert.match(r[0].text, /Green \(copper\)/, 'each color named with its own tag')
  assert.match(r[0].text, /Red \(sulfur-selenium\)/)
  // Edge to edge on the outside.
  r = run(cyl(), plan([newRegion('overlay', 'red', { s0: 0, s1: 0.4 }), newRegion('overlay', 'green', { s0: 0.4, s1: 0.8 })]))
  assert.deepEqual(ids(r), ['react-green|red'])
  // At an incalmo seam.
  r = run(cyl(), plan([], { seams: [0.5], sections: ['red', 'green'] }))
  assert.deepEqual(ids(r), ['react-green|red'])
})

test('reactive colors that do not touch are fine', () => {
  // Gap between the bands.
  assert.deepEqual(run(cyl(), plan([newRegion('overlay', 'red', { s1: 0.4 }), newRegion('overlay', 'green', { s0: 0.5 })])), [])
  // Underlay and overlay with clear body glass between them.
  assert.deepEqual(run(cyl(), plan([newRegion('underlay', 'red'), newRegion('overlay', 'green')])), [])
})

test('INFO: a layer fully covered by opaque glass on both sides', () => {
  const r = run(cyl(), plan([newRegion('underlay', 'white'), newRegion('overlay', 'white')], { seams: [], sections: ['blue'] }))
  assert.deepEqual(ids(r), ['hidden-section-0'])
  assert.equal(r[0].level, 'info')
  const layer = run(cyl(), plan([newRegion('underlay', 'white'), newRegion('powder', 'blue'), newRegion('overlay', 'white')]))
  assert.deepEqual(levels(layer), ['info'])
})

test('INFO: an underlay with no inside to sit on', () => {
  const r = run(cyl(), plan([newRegion('underlay', 'blue', { s0: 0, s1: 0.03 })]))
  assert.deepEqual(ids(r).map((i) => i.split('-')[0]), ['nowhere'])
})
