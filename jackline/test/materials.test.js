import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSection, solidOfRevolution } from '../src/geometry/profile.js'
import { PRESETS } from '../src/model/presets.js'
import { newColor, newRegion, normalizeColors, normalizeStudio } from '../src/model/color.js'
import { grams, materialsEstimate, outsideArea, roundedTotals, sliceVolume, surfaceArea } from '../src/model/materials.js'

const PI = Math.PI
const near = (a, b, rel = 1e-9, msg = '') => assert.ok(Math.abs(a - b) <= Math.abs(b) * rel + 1e-12, `${msg} got ${a}, expected ${b}`)
// A straight cylinder: r = 4 cm, 10 cm tall, 4 mm wall, solid up to 1 cm.
const cyl = buildSection({ points: [[4, 0], [4, 5], [4, 10]], wall: 0.4, floor: 1 })
const blue = newColor({ id: 'blue', hex: '#2f56c9', barWeight: 100 })
const red = newColor({ id: 'red', hex: '#c0302a' })
const studio = normalizeStudio({ library: [blue, red] })
const plan = (regions, incalmo) => normalizeColors({ regions, incalmo })

test('surface of revolution: cylinder and cone frustum', () => {
  near(surfaceArea([[3, 0], [3, 10]]), 2 * PI * 3 * 10)
  near(surfaceArea([[2, 0], [5, 4]]), PI * (2 + 5) * 5)
  near(outsideArea(cyl, 0, 1), 2 * PI * 4 * 10, 1e-9)
  near(outsideArea(cyl, 0.25, 0.75), 2 * PI * 4 * 5, 1e-9)
})

test('the whole slice is the whole piece, for a base, a stem and a bowl', () => {
  for (const id of ['tumbler', 'wine', 'bowl', 'bottle']) {
    const sec = buildSection(PRESETS[id])
    near(sliceVolume(sec, 0, 1), solidOfRevolution(sec.section).volume, 1e-9, id)
  }
})

test('slices cut at seams add back up to the whole piece', () => {
  for (const id of ['tumbler', 'wine', 'carafe']) {
    const sec = buildSection(PRESETS[id])
    const cuts = [0, 0.05, 0.3, 0.62, 0.9, 1]
    let sum = 0
    for (let i = 1; i < cuts.length; i++) sum += sliceVolume(sec, cuts[i - 1], cuts[i])
    near(sum, solidOfRevolution(sec.section).volume, 1e-9, id)
  }
})

test('overlay: area × share of the wall × density', () => {
  const e = materialsEstimate(cyl, plan([newRegion('overlay', 'red', { pct: 0.1 })]), studio)
  const cm3 = 2 * PI * 4 * 10 * 0.04
  near(e.items[0].cm3, cm3, 1e-9)
  near(e.items[0].grams, cm3 * 2.5, 1e-9)
  assert.equal(e.items[0].form, 'bar')
})

test('density is editable and only moves bar color', () => {
  const c = plan([newRegion('overlay', 'red'), newRegion('powder', 'blue')])
  const a = materialsEstimate(cyl, c, studio), b = materialsEstimate(cyl, c, { ...studio, density: 5 })
  near(b.items.find((l) => l.form === 'bar').grams, a.items.find((l) => l.form === 'bar').grams * 2)
  near(b.items.find((l) => l.form === 'powder').grams, a.items.find((l) => l.form === 'powder').grams)
})

test('frit and powder: area × coverage rate', () => {
  const e = materialsEstimate(cyl, plan([newRegion('frit', 'blue', { s0: 0, s1: 0.5, grain: 'coarse', density: 0.5 }), newRegion('powder', 'red')]), studio)
  const frit = e.items.find((l) => l.form === 'frit-coarse'), powder = e.items.find((l) => l.form === 'powder')
  near(frit.grams, 2 * PI * 4 * 5 * studio.coverage.coarse * 0.5, 1e-9)
  near(powder.grams, 2 * PI * 4 * 10 * studio.coverage.powder, 1e-9)
})

test('the same color as bar and as frit are separate lines; two bands of one form add', () => {
  const e = materialsEstimate(cyl, plan([newRegion('overlay', 'blue', { s0: 0, s1: 0.3 }), newRegion('overlay', 'blue', { s0: 0.6, s1: 1 }), newRegion('frit', 'blue')]), studio)
  assert.equal(e.items.length, 2)
  near(e.items.find((l) => l.form === 'bar').area, 2 * PI * 4 * 10 * 0.7, 1e-9)
})

test('underlay uses the inside surface', () => {
  const e = materialsEstimate(cyl, plan([newRegion('underlay', 'red', { pct: 0.1 })]), studio)
  // Inside: r = 3.6 from the floor (1 cm) up to the rim, plus the cavity floor
  // isn't part of the wall path, so just the cylinder.
  near(e.items[0].area, 2 * PI * 3.6 * 9, 1e-9)
})

test('incalmo: a colored section is its slice of glass, less layers counted on it', () => {
  const inc = { seams: [0.5], sections: [null, 'red'] }
  const bare = materialsEstimate(cyl, plan([], inc), studio)
  near(bare.items[0].cm3, sliceVolume(cyl, 0.5, 1), 1e-9)
  const cased = materialsEstimate(cyl, plan([newRegion('overlay', 'blue', { s0: 0, s1: 1, pct: 0.1 })], inc), studio)
  const overlayInTop = 2 * PI * 4 * 5 * 0.04
  near(cased.items.find((l) => l.colorId === 'red').cm3, sliceVolume(cyl, 0.5, 1) - overlayInTop, 1e-9)
})

test('waste is its own line, and bars are counted with waste in', () => {
  const e = materialsEstimate(cyl, plan([newRegion('overlay', 'blue', { pct: 0.5 })]), studio)
  near(e.waste, e.net * 0.3)
  near(e.total, e.net * 1.3)
  assert.equal(e.items[0].bars, Math.ceil((e.items[0].grams * 1.3) / 100))
  const noWeight = materialsEstimate(cyl, plan([newRegion('overlay', 'red')]), studio)
  assert.equal(noWeight.items[0].bars, null, 'no bar weight entered, no bar count')
})

test('display rounds to whole grams', () => {
  assert.equal(grams(12.6), '13 g')
  assert.equal(grams(0.4), '<1 g')
  assert.equal(grams(0), '0 g')
})

test('shown totals add up the rounded lines', () => {
  const est = { items: [{ grams: 3.6 }, { grams: 3.8 }] }
  assert.deepEqual(roundedTotals(est, 0.3), { net: 8, waste: 2, total: 10 })
})
