import { create } from 'zustand'
import { PRESETS, withExamples } from './presets.js'
import { NO_SCULPT } from '../geometry/sculpt.js'
import { normalizeColors, normalizeStudio } from './color.js'

const KEY = 'jackline:v1'
// What undo and saving cover. View settings (units, theme) and the studio
// (color library, density, check thresholds) are saved but not undone.
const DOC = ['preset', 'points', 'wall', 'floor', 'handle', 'spout', 'color', 'frost', 'sculpt', 'colors']
const pick = (s) => Object.fromEntries(DOC.map((k) => [k, s[k]]))

export function fromPreset(id) {
  const p = PRESETS[id]
  return {
    preset: id,
    points: p.points.map((q) => [...q]),
    wall: p.wall,
    floor: p.floor,
    handle: !!p.handle,
    spout: !!p.spout,
    color: p.color ?? '#ffffff',
    frost: 0,
    sculpt: { ...NO_SCULPT, ...p.sculpt },
    colors: normalizeColors(p.colors),
  }
}

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY))
    if (!d || !Array.isArray(d.points) || d.points.length < 3) return null
    return { ...d, sculpt: { ...NO_SCULPT, ...d.sculpt }, colors: normalizeColors(d.colors), studio: normalizeStudio(d.studio) }
  } catch {
    return null
  }
}

export const useStore = create((set, get) => ({
  ...fromPreset('tumbler'),
  units: 'cm',
  theme: 'dark',
  studio: normalizeStudio(),
  ...load(),
  turntable: true,
  cutaway: false,
  selected: null, // index of the selected profile point
  colorSel: null, // id of the selected color band, or 'seam:<i>'
  capturing: false,
  sheet: false, // rendering the front/side/top views sheet
  past: [],
  future: [],

  // Call once at the start of a gesture (a drag, a slider grab), then `live`
  // as it moves, so the whole gesture is one step of undo.
  checkpoint: () => set((s) => ({ past: [...s.past.slice(-80), pick(s)], future: [] })),
  live: (patch) => set(patch),
  change: (patch) => {
    get().checkpoint()
    set(patch)
  },
  undo: () => {
    const s = get()
    if (!s.past.length) return
    set({ ...s.past[s.past.length - 1], past: s.past.slice(0, -1), future: [pick(s), ...s.future], selected: null, colorSel: null })
  },
  redo: () => {
    const s = get()
    if (!s.future.length) return
    set({ ...s.future[0], future: s.future.slice(1), past: [...s.past, pick(s)], selected: null, colorSel: null })
  },
  loadPreset: (id) => {
    get().change({ ...fromPreset(id), selected: null, colorSel: null })
    const { studio } = get()
    get().setStudio({ library: withExamples(studio.library, PRESETS[id].colors) })
  },
  removePoint: (i) => {
    const { points } = get()
    if (i == null || i === 0 || points.length <= 3) return
    get().change({ points: points.filter((_, j) => j !== i), selected: null })
  },
  setView: (patch) => set(patch),
  setStudio: (patch) => set((s) => ({ studio: { ...s.studio, ...patch } })),
}))

useStore.subscribe((s) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...pick(s), units: s.units, theme: s.theme, studio: s.studio }))
  } catch {
    // Private windows and full storage: the piece just won't be remembered.
  }
})
