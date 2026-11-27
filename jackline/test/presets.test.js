import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSection, handlePath } from '../src/geometry/profile.js'
import { functionChecks } from '../src/model/checks.js'
import { colorChecks } from '../src/model/colorChecks.js'
import { layerStack, newColor, normalizeColors, normalizeStudio } from '../src/model/color.js'
import { measure } from '../src/model/derived.js'
import { NO_SCULPT } from '../src/geometry/sculpt.js'
import { EXAMPLE_COLORS, PRESETS, withExamples } from '../src/model/presets.js'

const COLOR_PRESETS = ['incalmoVase', 'casedBowl', 'fritTumbler', 'lipWine']

// Every BAD flag the app would show for a preset, functional and color.
function badFlags(id, studioPatch = {}) {
  const p = PRESETS[id]
  const sec = buildSection(p)
  const colors = normalizeColors(p.colors)
  const studio = normalizeStudio({ library: withExamples([], p.colors), ...studioPatch })
  const m = measure(sec, p.handle ? handlePath(sec) : null, p.wall, { sculpt: { ...NO_SCULPT, ...p.sculpt }, spout: !!p.spout })
  return [...functionChecks(m, { units: 'cm', spout: !!p.spout }), ...colorChecks(sec, colors, studio, 'cm')]
    .filter((c) => c.check?.level === 'bad')
    .map((c) => `${c.check.title}: ${c.check.text}`)
}

for (const id of COLOR_PRESETS) {
  test(`color preset ${id} loads with no BAD flags`, () => {
    assert.deepEqual(badFlags(id), [])
  })
}

// The older shape presets carry no color, so no color check may fire on them.
// (Their own function checks are left alone: a bud vase is meant to be narrow.)
test('shape presets raise no color checks', () => {
  for (const [id, p] of Object.entries(PRESETS)) {
    if (COLOR_PRESETS.includes(id)) continue
    assert.deepEqual(colorChecks(buildSection(p), normalizeColors(p.colors), normalizeStudio(), 'cm'), [], id)
  }
})

test('color presets still pass once a studio clear COE is entered', () => {
  for (const id of COLOR_PRESETS) assert.deepEqual(badFlags(id, { clear: { name: 'Studio clear', coe: 96 } }), [], id)
})

test('each color preset is what it says', () => {
  const kinds = (id) => normalizeColors(PRESETS[id].colors).regions.map((r) => r.kind)
  const vase = normalizeColors(PRESETS.incalmoVase.colors).incalmo
  assert.equal(vase.seams.length, 1)
  assert.equal(new Set(vase.sections).size, 2, 'two different section colors')
  assert.deepEqual(kinds('casedBowl'), ['underlay'])
  assert.deepEqual(kinds('fritTumbler'), ['frit'])
  assert.equal(normalizeColors(PRESETS.fritTumbler.colors).regions[0].grain, 'medium')
  assert.deepEqual(kinds('lipWine'), ['wrap'])

  // Cased bowl: transparent color inside, clear outside it.
  const bowl = PRESETS.casedBowl
  const studio = normalizeStudio({ library: withExamples([], bowl.colors) })
  const st = layerStack(buildSection(bowl), normalizeColors(bowl.colors), studio, 0.6)
  assert.deepEqual(st.map((l) => l.kind), ['underlay', 'body'])
  assert.equal(st[1].colorId, null, 'outside is clear')
  assert.equal(studio.library[0].opaque, false)

  // The incalmo seam sits near mid-height.
  const sec = buildSection(PRESETS.incalmoVase)
  const y = sec.outer[Math.round(sec.outer.length * vase.seams[0])][1]
  assert.ok(Math.abs(y / sec.height - 0.5) < 0.1, `seam at ${y.toFixed(1)} of ${sec.height.toFixed(1)} cm`)
})

test('example colors are added once and never overwrite your edits', () => {
  const colors = PRESETS.incalmoVase.colors
  const once = withExamples([], colors)
  assert.deepEqual(once.map((c) => c.id), ['ex-blue', 'ex-amber'])
  assert.ok(once.every((c) => c.example && c.tested && c.coe == null))
  const edited = once.map((c) => (c.id === 'ex-blue' ? { ...c, name: 'My cobalt', tested: false } : c))
  assert.equal(withExamples(edited, colors), edited, 'nothing to add, same library back')
  assert.equal(withExamples([newColor({ id: 'mine' })], PRESETS.tumbler.colors).length, 1, 'plain forms add nothing')
  assert.equal(EXAMPLE_COLORS.some((c) => /\d/.test(c.name)), false, 'no product codes in names')
})
