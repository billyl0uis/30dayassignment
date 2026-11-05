import { create } from 'zustand'
import { createPart } from './core/parts.js'
import { breakLink, duplicatePart } from './core/families.js'
import { emptyScene, sceneFromJSON, sceneToJSON } from './core/scene.js'
import { sphereProfile } from './core/jacklineProfiles.js'
import { bounds, collideMesh, freeSpot, settleAll, settlePart } from './core/placement.js'

const KEY = 'assembly:v1'

function load() {
  try {
    const t = localStorage.getItem(KEY)
    return t ? sceneFromJSON(t) : null
  } catch {
    return null
  }
}

function starter() {
  const s = emptyScene()
  const float = createPart('blown', { name: 'Float', color: { hex: '#9fe0e0', opacity: 0.4 }, dims: { profileId: 'sphere', points: sphereProfile(120), wallMm: 4, closedTop: true } })
  s.parts = [float]
  return settleAll(s)
}

const mapPart = (scene, id, fn) => ({ ...scene, parts: scene.parts.map((p) => (p.id === id ? fn(p) : p)) })

// Re-rest one part after its shape or placement changed.
function resettle(scene, id) {
  const p = scene.parts.find((q) => q.id === id)
  return p ? mapPart(scene, id, (q) => ({ ...q, pose: settlePart(scene, q) })) : scene
}

// Where a new part goes for the scene's mode: hung parts hang from the
// armature, leaning parts lean on the wall, others go on the base.
function mountFor(mode) {
  if (mode === 'hung') return { mount: 'hung', lineMm: 300 }
  if (mode === 'leaning') return { mount: 'rest', lean: 'wall', tilt: 8 }
  return { mount: 'rest' }
}

// Same undo pattern as Jackline: `checkpoint` once at the start of a gesture
// (a slider grab, focusing a field), then `live` while it moves, so the whole
// gesture is one undo step. `change` does both.
export const useStore = create((set, get) => {
  const initial = load() ?? starter()
  return {
    scene: initial,
    view: '3d', // '3d' or 'top' (footprint)
    selectedId: initial.parts[0]?.id ?? null,
    past: [],
    future: [],

    checkpoint: () => set((s) => ({ past: [...s.past.slice(-80), s.scene], future: [] })),
    live: (scene) => set({ scene }),
    change: (scene) => {
      get().checkpoint()
      set({ scene })
    },
    undo: () => {
      const s = get()
      if (!s.past.length) return
      set({ scene: s.past[s.past.length - 1], past: s.past.slice(0, -1), future: [s.scene, ...s.future] })
    },
    redo: () => {
      const s = get()
      if (!s.future.length) return
      set({ scene: s.future[0], future: s.future.slice(1), past: [...s.past, s.scene] })
    },

    select: (selectedId) => set({ selectedId }),
    setView: (view) => set({ view }),
    // Edit one part. `live: true` for mid-gesture updates (no undo step).
    // The part re-rests afterwards, so a bigger stone still sits on the base.
    patchPart: (id, fn, { live = false } = {}) => {
      const scene = resettle(mapPart(get().scene, id, (p) => createPart(p.type, fn(p))), id)
      live ? get().live(scene) : get().change(scene)
    },
    // Placement: the pose as given (drag has already worked out the height).
    setPose: (id, pose, { live = false } = {}) => {
      const scene = mapPart(get().scene, id, (p) => ({ ...p, pose: { ...p.pose, ...pose } }))
      live ? get().live(scene) : get().change(scene)
    },
    // Placement edits from the panel: change the pose, then re-rest.
    placePart: (id, patch, opts = {}) => {
      const scene = resettle(mapPart(get().scene, id, (p) => ({ ...p, pose: { ...p.pose, ...patch } })), id)
      opts.live ? get().live(scene) : get().change(scene)
    },
    addPart: (type) => {
      const sc = get().scene
      let p = createPart(type)
      p = { ...p, pose: { ...p.pose, ...freeSpot(sc, p), ...mountFor(sc.mode) } }
      const next = resettle({ ...sc, parts: [...sc.parts, p] }, p.id)
      get().change(next)
      set({ selectedId: p.id })
    },
    duplicate: (id, vary) => {
      const sc = get().scene
      const src = sc.parts.find((p) => p.id === id)
      if (!src) return
      let p = duplicatePart(src, vary)
      // Set the copy down beside the source, not inside it.
      const b = bounds(collideMesh(p).positions)
      const sb = bounds(collideMesh(src).positions)
      p = { ...p, pose: { ...p.pose, x: src.pose.x + (sb.max[0] - sb.min[0]) / 2 + (b.max[0] - b.min[0]) / 2 + 15 } }
      const parts = [...sc.parts]
      parts.splice(parts.indexOf(src) + 1, 0, p)
      get().change(resettle({ ...sc, parts }, p.id))
      set({ selectedId: p.id })
    },
    settleAll: () => get().change(settleAll(get().scene)),
    setMode: (mode) => get().change({ ...get().scene, mode }),
    setStage: (patch, opts = {}) => {
      let scene = { ...get().scene, stage: { ...get().scene.stage, ...patch } }
      // Moving the armature or the wall moves what hangs or leans on it.
      for (const p of scene.parts) if (p.pose.mount === 'hung' || p.pose.lean === 'wall') scene = resettle(scene, p.id)
      opts.live ? get().live(scene) : get().change(scene)
    },
    breakLink: (id) => get().change(mapPart(get().scene, id, breakLink)),
    removePart: (id) => {
      const parts = get().scene.parts
      const i = parts.findIndex((p) => p.id === id)
      const rest = parts
        .filter((p) => p.id !== id)
        .map((p) => (p.sourceId === id ? { ...p, sourceId: null } : p))
        .map((p) => (p.pose.lean === id ? { ...p, pose: { ...p.pose, lean: null } } : p))
      get().change({ ...get().scene, parts: rest })
      set({ selectedId: rest[Math.min(i, rest.length - 1)]?.id ?? null })
    },
    setSettings: (patch) => get().change({ ...get().scene, settings: { ...get().scene.settings, ...patch } }),
    loadScene: (scene) => {
      get().change(scene)
      set({ selectedId: scene.parts[0]?.id ?? null })
    },
    newScene: () => get().loadScene(emptyScene()),
  }
})

useStore.subscribe((s) => {
  try {
    localStorage.setItem(KEY, sceneToJSON(s.scene))
  } catch {
    // Private windows and full storage: the scene just won't be remembered.
  }
})
