import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPart } from '../src/core/parts.js'
import { emptyScene } from '../src/core/scene.js'
import { settleAll, settlePart } from '../src/core/placement.js'
import { contactKey, detectContacts } from '../src/core/contacts.js'
import { fitsAnnealer, frictionNeeded, hangRatingKg, holdsAgainstSliding, leanHolds, runChecks } from '../src/core/checks.js'
import { convexHull, insideDistance } from '../src/core/geom2d.js'

const D2R = Math.PI / 180
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} got ${a}, expected ${b} ±${tol}`)
const block = (w, d, h, pose, extra = {}) => createPart('solid', { dims: { shape: 'block', widthMm: w, depthMm: d, heightMm: h }, pose, ...extra })
const sphere = (D, pose, extra = {}) => createPart('solid', { dims: { shape: 'sphere', diameterMm: D }, pose, ...extra })
const cyl = (D, L, pose) => createPart('solid', { dims: { shape: 'cylinder', diameterMm: D, lengthMm: L }, pose })
const build = (parts, contacts = {}) => settleAll({ ...emptyScene(), parts, contacts })
const allCodes = (sc) => runChecks(sc).issues.map((i) => i.code)
// Most test parts are solid and thicker than 25 mm; leave that warning to its own test.
const codes = (sc) => allCodes(sc).filter((c) => c !== 'thick')
const hangCodes = codes
const issuesFor = (sc, id) => runChecks(sc).issues.filter((i) => i.partIds.includes(id)).map((i) => i.code)
const tilted = (deg) => ({ normal: [Math.sin(deg * D2R), Math.cos(deg * D2R), 0] })

// ------------------------------------------------------------- footing maths

test('footing: inside / outside a hull, and a single point has no inside', () => {
  const h = convexHull([[0, 0], [10, 0], [10, 10], [0, 10], [5, 5]])
  assert.equal(h.length, 4)
  close(insideDistance([5, 5], h), 5, 1e-12)
  close(insideDistance([13, 5], h), -3, 1e-12)
  close(insideDistance([0, 3], [[0, 0]]), -3, 1e-12)
})

// --------------------------------------------------------------- contacts

test('contacts: a block on the base and a block on it; default type is pad', () => {
  const a = block(100, 100, 20), b = block(60, 60, 20, { y: 200 })
  const sc = build([a, b])
  const cs = detectContacts(sc)
  const onBase = cs.find((c) => c.a === a.id && c.b === 'base')
  const onA = cs.find((c) => c.a === b.id && c.b === a.id)
  assert.ok(onBase && onA, 'both contacts found')
  assert.ok(!cs.some((c) => c.a === b.id && c.b === 'base'), 'the top block does not touch the base')
  assert.equal(onA.type, 'pad')
  close(onA.normal[1], 1, 1e-6, 'flat on flat pushes straight up')
  close(onA.areaMm2, 3600, 600, 'patch is about the top block’s footprint')
})

// ------------------------------------------------------------------ tipping

test('tipping: an overhanging block stays while its centre of mass is over the block below', () => {
  const a = block(100, 100, 20)
  const ok = block(100, 100, 20, { x: 40, y: 100 })
  const bad = block(100, 100, 20, { x: 80, y: 100 })
  assert.ok(!issuesFor(build([a, ok]), ok.id).includes('tip'))
  assert.ok(issuesFor(build([a, bad]), bad.id).includes('tip'))
})

test('tipping: a sub-stack tips as one even when each part sits fine on the one below', () => {
  // B overhangs A but holds alone; C sits well inside B; together B + C
  // have their centre of mass past A's edge.
  const a = block(100, 100, 20)
  const b = block(100, 100, 20, { x: 40, y: 100 })
  const c = block(60, 100, 60, { x: 75, y: 200 })
  const sc = build([a, b, c])
  const r = runChecks(sc)
  const tips = r.issues.filter((i) => i.code === 'tip')
  assert.equal(tips.length, 1, JSON.stringify(tips.map((t) => t.title)))
  assert.equal(tips[0].focus, b.id, 'it is B (carrying C) that tips off A')
  assert.ok(tips[0].partIds.includes(c.id))
  assert.ok(!issuesFor(build([a, b]), b.id).includes('tip'), 'B alone is fine')
})

test('tipping: a sphere on a flat block is balanced', () => {
  const sc = build([block(200, 200, 30), sphere(80, { x: 30, z: -20, y: 300 })])
  assert.deepEqual(codes(sc), [])
})

// ------------------------------------------------------------------ sliding

test('sliding: one contact holds up to the friction angle atan(μ)', () => {
  const mu = () => 0.4 // atan 0.4 = 21.8°
  assert.ok(holdsAgainstSliding([tilted(20)], mu))
  assert.ok(!holdsAgainstSliding([tilted(25)], mu))
  assert.ok(holdsAgainstSliding([tilted(25)], () => 0.6))
  assert.ok(holdsAgainstSliding([tilted(70)], () => null), 'adhesive never slides')
  close(frictionNeeded([tilted(30)]), Math.tan(30 * D2R), 1e-3)
})

test('sliding: wedged between two slopes it holds, though each slope alone is too steep', () => {
  const mu = () => 0.4
  const left = { normal: [Math.sin(40 * D2R), Math.cos(40 * D2R), 0] }
  const right = { normal: [-Math.sin(40 * D2R), Math.cos(40 * D2R), 0] }
  assert.ok(!holdsAgainstSliding([left], mu))
  assert.ok(holdsAgainstSliding([left, right], mu))
})

test('sliding: a block on a tilted block slides on bare glass, holds on a pad', () => {
  const base = block(200, 200, 40, { tilt: 25, tiltDir: 0 }) // its top slopes 25°
  const top = block(40, 40, 20, { y: 400 })
  let sc = build([base, top])
  const c = detectContacts(sc).find((x) => x.a === top.id && x.b === base.id)
  assert.ok(c, 'top rests on the tilted block')
  close((Math.acos(c.normal[1]) * 180) / Math.PI, 25, 2, 'contact slope')
  assert.ok(!issuesFor(sc, top.id).includes('slide'), 'pad (μ 0.6 → 31°) holds')
  sc = { ...sc, contacts: { [contactKey(top.id, base.id)]: 'bare' } }
  const mine = issuesFor(sc, top.id)
  assert.ok(mine.includes('slide'), 'bare (μ 0.4 → 22°) slides')
  assert.ok(mine.includes('bare'))
})

// ------------------------------------------------------------------ leaning

// A uniform ladder against a frictional wall: the textbook limit is
// tan θ = 2μF / (1 − μF·μT), θ from vertical. With μ = 0.4 both ends, 43.6°.
const ladder = (deg, muF, muT) => {
  const L = 1000, t = deg * D2R
  return leanHolds({ F: [0, 0], nF: [0, 1], muF, T: [L * Math.sin(t), L * Math.cos(t)], nT: [-1, 0], muT, G: [(L / 2) * Math.sin(t), (L / 2) * Math.cos(t)] }).holds
}

test('leaning: matches the ladder limit', () => {
  const limit = Math.atan((2 * 0.4) / (1 - 0.4 * 0.4)) / D2R
  assert.ok(ladder(limit - 0.5, 0.4, 0.4))
  assert.ok(!ladder(limit + 0.5, 0.4, 0.4))
  assert.ok(ladder(70, null, 0.4), 'adhesive foot holds')
  assert.ok(!ladder(-5, 0.4, 0.4), 'leaning away from the wall falls')
})

test('leaning on the wall: a fat form leaned too little rocks back; a slim one on pads holds; steep on bare glass slides', () => {
  // 60 mm wide, 8°: its centre of mass is still behind the rim it stands on.
  assert.ok(codes(build([cyl(60, 300, { lean: 'wall', tilt: 8 })])).includes('lean-tip'))
  const ok = cyl(40, 300, { lean: 'wall', tilt: 12 })
  let sc = build([ok])
  assert.deepEqual(codes(sc), [])
  const steep = cyl(40, 300, { lean: 'wall', tilt: 60 })
  sc = build([steep])
  sc = { ...sc, contacts: { [contactKey(steep.id, 'base')]: 'bare', [contactKey(steep.id, 'wall')]: 'bare' } }
  assert.ok(codes(sc).includes('lean-slide'))
})

test('leaning on a part: finds the contact and holds at a modest angle', () => {
  const b = block(100, 100, 250, { x: 200 })
  const c = cyl(50, 300, { x: 0, lean: b.id, tilt: 10 })
  const sc = build([b, c])
  assert.ok(detectContacts(sc).some((x) => x.a === c.id && x.b === b.id && x.kind === 'lean'))
  assert.ok(!issuesFor(sc, c.id).some((k) => k.startsWith('lean')))
})

// ------------------------------------------------------------------ hanging

test('hanging: no hanging point is BAD', () => {
  assert.ok(codes(build([sphere(50, { mount: 'hung' })])).includes('no-hang'))
})

test('hanging: carried weight × safety factor against the rating', () => {
  const S = emptyScene().settings // loop rule 4 mm/kg, min 4 mm; SF 4
  close(hangRatingKg({ kind: 'loop', loopDiaMm: 6 }, S), 1.5, 1e-12)
  assert.equal(hangRatingKg({ kind: 'loop', loopDiaMm: 3 }, S), 0, 'under the minimum')
  // 50 mm solid sphere ≈ 164 g → ×4 = 0.65 kg ≤ 1.5 kg: fine.
  assert.deepEqual(hangCodes(build([sphere(50, { mount: 'hung' }, { hang: { kind: 'loop', loopDiaMm: 6 } })])), [])
  // 120 mm solid sphere ≈ 2.26 kg → ×4 = 9 kg > 1.5 kg: too weak.
  assert.ok(codes(build([sphere(120, { mount: 'hung' }, { hang: { kind: 'loop', loopDiaMm: 6 } })])).includes('hang-weak'))
  assert.ok(codes(build([sphere(50, { mount: 'hung' }, { hang: { kind: 'drilled', holeDiaMm: 3, wireRatingKg: 0 } })])).includes('hang-weak'), 'no rating entered')
  assert.ok(!codes(build([sphere(120, { mount: 'hung' }, { hang: { kind: 'drilled', holeDiaMm: 3, wireRatingKg: 20 } })])).includes('hang-weak'))
  assert.ok(codes(build([sphere(120, { mount: 'hung' }, { hang: { kind: 'cap', capRatingKg: 5 } })])).includes('hang-weak'))
})

// ----------------------------------------------------------------- annealer

test('annealer: each part alone, in any square-on orientation', () => {
  assert.ok(fitsAnnealer({ w: 100, d: 440, h: 100 }, { w: 450, d: 200, h: 200 }), 'turned to fit')
  assert.ok(!fitsAnnealer({ w: 460, d: 100, h: 100 }, { w: 450, d: 450, h: 450 }))
  const rod = createPart('cane', { dims: { lengthMm: 500, diameterMm: 8 } })
  assert.ok(codes(build([rod])).includes('annealer'))
  // A group wider than the annealer is fine: parts anneal separately.
  const sc = build([block(300, 100, 50, { x: -200 }), block(300, 100, 50, { x: 200 })])
  assert.ok(!codes(sc).includes('annealer'))
})

// --------------------------------------------------------------- thickness

test('thick sections warn above the threshold; blown walls don’t', () => {
  assert.ok(allCodes(build([sphere(30)])).includes('thick'))
  assert.ok(!allCodes(build([sphere(24)])).includes('thick'))
  assert.ok(!allCodes(build([createPart('blown')])).includes('thick'))
})

// -------------------------------------------------------------- bare glass

test('bare glass contact is BAD; pads and adhesive are not', () => {
  const a = block(100, 100, 20), b = block(60, 60, 20, { y: 100 })
  const sc = build([a, b])
  assert.deepEqual(codes(sc), [])
  const k = contactKey(a.id, b.id)
  assert.ok(codes({ ...sc, contacts: { [k]: 'bare' } }).includes('bare'))
  assert.deepEqual(codes({ ...sc, contacts: { [k]: 'adhesive' } }), [])
})

test('a part left in mid-air is BAD', () => {
  const a = block(100, 100, 20)
  const sc = build([a])
  const float = { ...block(50, 50, 20), pose: { ...block(50, 50, 20).pose, y: 300 } }
  assert.ok(codes({ ...sc, parts: [...sc.parts, float] }).includes('floating'))
})
