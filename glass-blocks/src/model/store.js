import { useMemo } from 'react'
import { create } from 'zustand'
import { PRESETS } from '../geometry/presets.js'
import { DESIGN_VERSION, applyPatch, newId, replay } from './steps.js'
import { stackLayout } from './layout.js'

const SAVE_KEY = 'glass-blocks:design'
const PREFS_KEY = 'glass-blocks:prefs'

export const DEFAULT_MATERIAL = { color: '#ffffff', finish: 'clear', frost: 0, iridescent: false }

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? null
  } catch {
    return null
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable: the design just won't survive a reload */
  }
}

export function makePart(preset, overrides = {}) {
  const def = PRESETS[preset]
  return {
    id: newId(),
    preset,
    params: { ...def.size, taper: 1, ...overrides.params },
    material: { ...DEFAULT_MATERIAL, ...overrides.material },
    mode: 'stack',
    position: [0, 0, 0],
    rotation: [0, 0, 0],
  }
}

const saved = read(SAVE_KEY)
const initialSteps = Array.isArray(saved?.steps) ? saved.steps : []
const prefs = { units: 'in', theme: 'dark', ...read(PREFS_KEY) }

export const useStore = create((set, get) => {
  // Every edit goes through here: drop any redo tail, append, replay.
  const commit = (...newSteps) => {
    const { steps, cursor, selectedId } = get()
    const next = [...steps.slice(0, cursor), ...newSteps]
    const parts = replay(next)
    set({
      steps: next,
      cursor: next.length,
      parts,
      draft: null,
      selectedId: parts.some((p) => p.id === selectedId) ? selectedId : null,
    })
  }
  const moveCursor = (cursor) => {
    const parts = replay(get().steps.slice(0, cursor))
    set({ cursor, parts, draft: null, selectedId: parts.some((p) => p.id === get().selectedId) ? get().selectedId : null })
  }
  const selected = () => get().parts.find((p) => p.id === get().selectedId)

  return {
    steps: initialSteps,
    cursor: initialSteps.length,
    parts: replay(initialSteps),
    selectedId: null,
    // A live, uncommitted edit (a handle mid-drag, a slider mid-slide).
    draft: null,

    units: prefs.units,
    theme: prefs.theme,
    turntable: false,
    fastGlass: false,
    gizmo: 'translate',
    capturing: false,

    commit,
    select: (id) => set({ selectedId: id }),

    addPart(preset) {
      const { parts } = get()
      const sel = selected()
      // New parts go on top of the selected one, or on top of the whole stack.
      const index = sel ? parts.indexOf(sel) + 1 : parts.length
      const part = makePart(preset)
      commit({ type: 'add', part, index })
      set({ selectedId: part.id })
    },

    addGoblet() {
      const parts = [
        makePart('foot', { params: { w: 7.5, h: 1.2 } }),
        makePart('stem', { params: { w: 1.6, h: 6 }, material: { color: '#f3c26b' } }),
        makePart('sphere', { params: { w: 8, h: 7.5 }, material: { color: '#5f9ee8' } }),
        makePart('neck', { params: { w: 2.6, h: 3 } }),
        makePart('lip', { params: { w: 6.5, h: 2.6 } }),
      ]
      commit(...parts.map((part) => ({ type: 'add', part })))
    },

    setPart: (id, patch) => commit({ type: 'set', id, patch }),

    setDraft(id, patch) {
      const d = get().draft
      set({ draft: { id, patch: d?.id === id ? applyPatch(d.patch, patch) : patch } })
    },
    commitDraft() {
      const d = get().draft
      if (d) commit({ type: 'set', id: d.id, patch: d.patch })
    },
    cancelDraft: () => set({ draft: null }),

    removeSelected() {
      const sel = selected()
      if (sel) commit({ type: 'remove', id: sel.id })
    },

    duplicateSelected() {
      const { parts } = get()
      const sel = selected()
      if (!sel) return
      const part = { ...structuredClone(sel), id: newId() }
      if (part.mode === 'free') part.position = [part.position[0] + 1.5, part.position[1], part.position[2] + 1.5]
      commit({ type: 'add', part, index: parts.indexOf(sel) + 1 })
      set({ selectedId: part.id })
    },

    // Moves a part one slot up (+1) or down (-1) the stack.
    nudgeOrder(id, delta) {
      const { parts } = get()
      const i = parts.findIndex((p) => p.id === id)
      const to = i + delta
      if (i < 0 || to < 0 || to >= parts.length) return
      commit({ type: 'reorder', id, to })
    },

    // Switching to free keeps the part where it is; switching back snaps it to the axis.
    setMode(id, mode) {
      const part = get().parts.find((p) => p.id === id)
      if (!part || part.mode === mode) return
      const patch = { mode }
      if (mode === 'free') patch.position = [0, stackLayout(get().parts).ys[id] ?? 0, 0]
      if (mode === 'free') patch.rotation = [0, 0, 0]
      commit({ type: 'set', id, patch })
    },

    undo() {
      const { cursor } = get()
      if (cursor > 0) moveCursor(cursor - 1)
    },
    redo() {
      const { cursor, steps } = get()
      if (cursor < steps.length) moveCursor(cursor + 1)
    },

    newDesign() {
      if (get().parts.length) commit({ type: 'clear' })
    },

    loadDesign(data) {
      if (!Array.isArray(data?.steps)) throw new Error('That file isn’t a Glass Blocks design.')
      const parts = replay(data.steps)
      set({ steps: data.steps, cursor: data.steps.length, parts, draft: null, selectedId: null })
    },

    designFile: () => ({ app: 'glass-blocks', version: DESIGN_VERSION, steps: get().steps.slice(0, get().cursor) }),

    setUnits: (units) => set({ units }),
    setTheme: (theme) => set({ theme }),
    setGizmo: (gizmo) => set({ gizmo }),
    toggleTurntable: () => set((s) => ({ turntable: !s.turntable })),
    toggleFastGlass: () => set((s) => ({ fastGlass: !s.fastGlass })),
    setCapturing: (capturing) => set({ capturing }),
  }
})

useStore.subscribe((s, prev) => {
  if (s.steps !== prev.steps || s.cursor !== prev.cursor) write(SAVE_KEY, s.designFile())
  if (s.units !== prev.units || s.theme !== prev.theme) write(PREFS_KEY, { units: s.units, theme: s.theme })
})

// Parts with any in-progress drag or slide applied, for drawing.
export function useLiveParts() {
  const parts = useStore((s) => s.parts)
  const draft = useStore((s) => s.draft)
  return useMemo(
    () => (draft ? parts.map((p) => (p.id === draft.id ? applyPatch(p, draft.patch) : p)) : parts),
    [parts, draft],
  )
}

export function useLivePart(id) {
  const parts = useLiveParts()
  return parts.find((p) => p.id === id)
}
