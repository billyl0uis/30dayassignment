import { create } from 'zustand'
import { PRESETS } from '@jackline/model/presets.js'
import { DEFAULT_GLASSES } from '../config/glass.js'
import { BIT_TYPES } from './bits/index.js'

const KEY = 'bits:v1'
// What undo and saving cover. View state (selection, armed tool) is not undone.
const DOC = ['pieceName', 'points', 'walls', 'floor', 'bodyGlass', 'glasses', 'bits', 'fill']
const pick = (s) => structuredClone(Object.fromEntries(DOC.map((k) => [k, s[k]])))

let n = 0
const newId = (p) => `${p}${Date.now().toString(36)}${(n++).toString(36)}`

// The body starts as Jackline's tumbler, with its one wall thickness
// written out per point so each can be changed on its own.
function starting() {
  const t = PRESETS.tumbler
  return {
    pieceName: 'Untitled',
    points: t.points.map((p) => [...p]),
    walls: t.points.map(() => t.wall),
    floor: t.floor,
    bodyGlass: DEFAULT_GLASSES[0].id,
    glasses: structuredClone(DEFAULT_GLASSES),
    bits: [],
    fill: 1, // how full, as a fraction of capacity by volume, for the "filled" readout
  }
}

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY))
    if (!d || !Array.isArray(d.points) || d.points.length < 3 || d.walls?.length !== d.points.length) return null
    return { ...d, fill: d.fill ?? 1, bits: (d.bits ?? []).filter((b) => BIT_TYPES[b.type]) }
  } catch {
    return null
  }
}

export const useStore = create((set, get) => ({
  ...starting(),
  units: 'mm',
  maker: '', // your name, for the views sheet; remembered, not undone
  paper: 'letter', // views sheet paper: 'letter' | 'a4'
  ...load(),
  capturing: false, // drawing the views sheet: working overlays are hidden
  tool: 'prunt', // the bit type armed for placing, or null
  selected: null, // a bit id
  selectedPoint: null, // a profile point index
  drawing: null, // a freehand trail's id while its path is being clicked in
  moving: null, // { id, key } while a bit (or a handle's end) is dragged on the body
  past: [],
  future: [],

  // Call once at the start of a gesture (a drag, a slider grab), then `live`
  // as it moves, so the whole gesture is one step of undo.
  checkpoint: () => set((s) => ({ past: [...s.past.slice(-100), pick(s)], future: [] })),
  live: (patch) => set(patch),
  change: (patch) => {
    get().checkpoint()
    set(patch)
  },
  undo: () => {
    const s = get()
    if (!s.past.length) return
    set({ ...s.past[s.past.length - 1], past: s.past.slice(0, -1), future: [pick(s), ...s.future] })
    get().dropStaleSelection()
  },
  redo: () => {
    const s = get()
    if (!s.future.length) return
    set({ ...s.future[0], future: s.future.slice(1), past: [...s.past, pick(s)] })
    get().dropStaleSelection()
  },
  dropStaleSelection: () => {
    const s = get()
    if (s.selected && !s.bits.some((b) => b.id === s.selected)) set({ selected: null })
    if (s.drawing && !s.bits.some((b) => b.id === s.drawing)) set({ drawing: null })
    if (s.selectedPoint != null && s.selectedPoint >= s.points.length) set({ selectedPoint: null })
  },
  setView: (patch) => set(patch),
  reset: () => get().change({ ...starting(), selected: null, selectedPoint: null }),

  // Bits -------------------------------------------------------------------
  addBit: (type, anchor) => {
    const t = BIT_TYPES[type]
    const s = get()
    // One applied foot per piece: clicking again just selects it.
    const existing = t.single && s.bits.find((b) => b.type === type)
    if (existing) return s.setView({ selected: existing.id })
    // A new bit takes the settings of the selected bit of the same type, so
    // a run of matching prunts is click, click, click.
    const like = s.bits.find((b) => b.id === s.selected && b.type === type)
    const { params: placed, ...where } = anchor
    const bit = {
      id: newId('b'),
      type,
      spin: 0,
      ...where,
      params: { ...(like ? like.params : t.defaults), ...placed },
      texture: like ? like.texture : t.defaultTexture,
      glass: like ? like.glass : s.bodyGlass,
    }
    s.change({ bits: [...s.bits, bit], selected: bit.id })
  },
  // Freehand trails: each click while drawing adds a point to the path.
  addPathPoint: (id, s, theta) => {
    const st = get()
    st.change({
      bits: st.bits.map((b) => (b.id === id ? { ...b, points: [...(b.points?.length ? b.points : []), [s, theta]] } : b)),
    })
  },
  updateBit: (id, patch) => set((s) => ({ bits: s.bits.map((b) => (b.id === id ? { ...b, ...patch } : b)) })),
  updateBitParams: (id, patch) =>
    set((s) => ({ bits: s.bits.map((b) => (b.id === id ? { ...b, params: { ...b.params, ...patch } } : b)) })),
  removeBit: (id) => {
    const s = get()
    s.change({
      bits: s.bits.filter((b) => b.id !== id),
      selected: s.selected === id ? null : s.selected,
      drawing: s.drawing === id ? null : s.drawing,
    })
  },
  duplicateBit: (id) => {
    const s = get()
    const i = s.bits.findIndex((b) => b.id === id)
    if (i < 0 || BIT_TYPES[s.bits[i].type].single) return
    // Set a little way round, so it doesn't land on top of the original.
    const copy = { ...structuredClone(s.bits[i]), id: newId('b'), theta: s.bits[i].theta + Math.PI / 8 }
    s.change({ bits: [...s.bits.slice(0, i + 1), copy, ...s.bits.slice(i + 1)], selected: copy.id })
  },
  // Make it one of `count` evenly spaced around the piece, at the same height.
  // The copies follow it in working order, going round clockwise from above.
  radialArray: (id, count) => {
    const s = get()
    const i = s.bits.findIndex((b) => b.id === id)
    if (i < 0 || count < 2 || BIT_TYPES[s.bits[i].type].single) return
    const src = s.bits[i]
    const copies = Array.from({ length: count - 1 }, (_, k) => ({
      ...structuredClone(src),
      id: newId('b'),
      theta: src.theta - ((k + 1) * 2 * Math.PI) / count,
    }))
    s.change({ bits: [...s.bits.slice(0, i + 1), ...copies, ...s.bits.slice(i + 1)] })
  },
  moveBit: (from, to) => {
    const s = get()
    if (from === to || from < 0 || to < 0 || from >= s.bits.length || to >= s.bits.length) return
    const bits = [...s.bits]
    const [b] = bits.splice(from, 1)
    bits.splice(to, 0, b)
    s.change({ bits })
  },

  // Profile ----------------------------------------------------------------
  removePoint: (i) => {
    const s = get()
    if (i == null || i === 0 || s.points.length <= 3) return
    s.change({
      points: s.points.filter((_, j) => j !== i),
      walls: s.walls.filter((_, j) => j !== i),
      selectedPoint: null,
    })
  },

  // Glasses ----------------------------------------------------------------
  addGlass: () => {
    const s = get()
    const g = { id: newId('g'), name: `Glass ${s.glasses.length + 1}`, coe: '', group: '', density: 2.5, color: '#9fe0e0' }
    s.change({ glasses: [...s.glasses, g] })
    return g.id
  },
  updateGlass: (id, patch) => set((s) => ({ glasses: s.glasses.map((g) => (g.id === id ? { ...g, ...patch } : g)) })),
  removeGlass: (id) => {
    const s = get()
    if (id === s.bodyGlass || s.bits.some((b) => b.glass === id)) return
    s.change({ glasses: s.glasses.filter((g) => g.id !== id) })
  },
}))

useStore.subscribe((s) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...pick(s), units: s.units, maker: s.maker, paper: s.paper }))
  } catch {
    // Private windows and full storage: the piece just won't be remembered.
  }
})
