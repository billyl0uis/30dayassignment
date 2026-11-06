import { newColor } from './color.js'

// Starting forms. Points run from the foot (on the table) up to the rim, in
// cm, as [distance from the axis, height]. `floor` is where the inside
// starts: a thick base on a tumbler, the top of the stem on a wine glass.
export const PRESETS = {
  tumbler: {
    name: 'Tumbler',
    points: [[3.0, 0], [3.15, 1.5], [3.5, 6], [3.9, 10.5]],
    wall: 0.3, floor: 0.9,
  },
  wine: {
    name: 'Wine glass',
    points: [[3.7, 0], [3.2, 0.3], [0.55, 0.75], [0.42, 6], [0.9, 7.4], [2.9, 9], [4.1, 12.5], [3.6, 17.5]],
    wall: 0.14, floor: 7.9,
  },
  mug: {
    name: 'Mug',
    points: [[3.9, 0], [4.1, 1.5], [4.1, 9], [4.25, 10]],
    wall: 0.35, floor: 0.9, handle: true,
  },
  pitcher: {
    name: 'Pitcher',
    points: [[4.3, 0], [4.7, 3], [4.8, 10], [4.2, 15], [4.6, 19], [5.3, 21]],
    wall: 0.35, floor: 1.0, handle: true, spout: true,
  },
  bowl: {
    name: 'Bowl',
    points: [[2.8, 0], [4.6, 1.1], [7.2, 3.4], [8.7, 6.3], [9.2, 8]],
    wall: 0.4, floor: 0.6,
  },
  budvase: {
    name: 'Bud vase',
    points: [[2.6, 0], [3.4, 3], [3.4, 7], [1.6, 12], [0.9, 16], [1.3, 18]],
    wall: 0.3, floor: 1.2, color: '#9fe0e0',
  },
  carafe: {
    name: 'Carafe',
    points: [[4.6, 0], [5.2, 3], [5.1, 9], [3.2, 14], [2.4, 19], [2.9, 22]],
    wall: 0.3, floor: 0.9,
  },
  optic: {
    name: 'Optic vase',
    points: [[3.2, 0], [4.4, 3], [4.6, 9], [3.0, 16], [2.6, 20], [3.4, 23]],
    wall: 0.35, floor: 1.0, color: '#2f56c9',
    sculpt: { ribs: 12, ribDepth: 0.4, twist: 90 },
  },
  kerchief: {
    name: 'Handkerchief',
    points: [[2.4, 0], [3.2, 1.5], [5.5, 5], [7.5, 9], [8.6, 13]],
    wall: 0.3, floor: 0.8, color: '#9fe0e0',
    sculpt: { waves: 5, waveHeight: 2.6, squash: 0.15 },
  },
  leaner: {
    name: 'Leaner',
    points: [[3.0, 0], [3.6, 3], [3.4, 12], [2.0, 19], [1.6, 25], [2.0, 27]],
    wall: 0.35, floor: 1.2, color: '#c47a1f',
    sculpt: { lean: 3.5, wobble: 0.45, seed: 7 },
  },
  bottle: {
    name: 'Bottle',
    points: [[3.6, 0], [3.8, 2], [3.8, 15], [3.2, 18], [1.4, 21], [1.2, 26], [1.45, 27]],
    wall: 0.3, floor: 1.2, color: '#3f7f4f',
  },
}

// Color presets. Each piece's color plan uses the example colors below,
// which get added to the color library when the preset loads.
Object.assign(PRESETS, {
  incalmoVase: {
    name: 'Incalmo vase',
    points: [[3.2, 0], [4.3, 3], [4.5, 9], [3.7, 14], [3.0, 18], [3.5, 20.5]],
    wall: 0.35, floor: 1.0,
    // One seam at mid-height, on a near-straight stretch, in a 3.5 mm wall.
    colors: { regions: [], incalmo: { seams: [0.5], sections: ['ex-blue', 'ex-amber'] } },
  },
  casedBowl: {
    name: 'Cased bowl',
    points: [[2.8, 0], [4.6, 1.1], [7.2, 3.4], [8.7, 6.3], [9.2, 8]],
    wall: 0.4, floor: 0.6,
    // Transparent color gathered first, cased in clear: the color is the inside.
    colors: { regions: [{ id: 'p-underlay', kind: 'underlay', colorId: 'ex-blue', s0: 0, s1: 1, pct: 0.1 }] },
  },
  fritTumbler: {
    name: 'Frit tumbler',
    points: [[3.0, 0], [3.15, 1.5], [3.5, 6], [3.9, 10.5]],
    wall: 0.3, floor: 0.9,
    // Medium frit rolled on the lower two-thirds.
    colors: { regions: [{ id: 'p-frit', kind: 'frit', colorId: 'ex-green', s0: 0, s1: 0.66, grain: 'medium', density: 0.5 }] },
  },
  lipWine: {
    name: 'Colored lip',
    points: [[3.7, 0], [3.2, 0.3], [0.55, 0.75], [0.42, 6], [0.9, 7.4], [2.9, 9], [4.1, 12.5], [3.6, 17.5]],
    wall: 0.14, floor: 7.9,
    // Clear bowl, stem and foot; a transparent wrap around the rim.
    colors: { regions: [{ id: 'p-lip', kind: 'wrap', zone: 'lip', colorId: 'ex-red', s0: 0.95, s1: 1, pct: 0.15 }] },
  },
})

// Placeholder colors for the presets. Not real products: brand-neutral, no
// COE given, and marked tested only so the presets open without BAD flags.
// Replace them with your own colors and test results.
export const EXAMPLE_COLORS = [
  { id: 'ex-blue', name: 'Example blue', hex: '#2f56c9', strength: 1.5 },
  { id: 'ex-amber', name: 'Example amber', hex: '#c47a1f', strength: 1.2 },
  { id: 'ex-green', name: 'Example green', hex: '#2f8f4f', strength: 2, opaque: true },
  { id: 'ex-red', name: 'Example red', hex: '#c0302a', strength: 2.5 },
].map((c) => ({ ...c, tested: true, example: true }))

export const GLASS_COLORS = [
  ['Clear', '#ffffff'],
  ['Aqua', '#9fe0e0'],
  ['Cobalt', '#2f56c9'],
  ['Amber', '#c47a1f'],
  ['Bottle green', '#3f7f4f'],
  ['Amethyst', '#8a5bb8'],
  ['Smoke', '#6b6f78'],
]

// Adds the example colors a preset uses that the library doesn't have yet.
// Ones already there are left as they are, so your edits to them stick.
export function withExamples(library, colors) {
  if (!colors) return library
  const ids = new Set([...(colors.regions ?? []).map((r) => r.colorId), ...(colors.incalmo?.sections ?? [])])
  const missing = EXAMPLE_COLORS.filter((c) => ids.has(c.id) && !library.some((l) => l.id === c.id))
  return missing.length ? [...library, ...missing.map(newColor)] : library
}
