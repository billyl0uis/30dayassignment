// A scene: the parts, their arrangement and the assumptions they were judged
// with. Saved and loaded as JSON. Contacts and the light are filled in by
// later steps; the fields exist now so saved files stay compatible.
import { defaultSettings } from './assumptions.js'
import { createPart, partMetrics } from './parts.js'
import { familyCounts } from './families.js'

export const SCENE_VERSION = 1
export const MODES = ['stacked', 'leaning', 'hung', 'field']

// The setting the sculpture is arranged in, mm: a base plate centred on the
// origin, a back wall along its back edge, and an armature (ceiling bar) for
// hung parts.
export const defaultStage = () => ({ baseW: 900, baseD: 600, armatureY: 1400 })

export function emptyScene() {
  return { app: 'assembly', version: SCENE_VERSION, name: 'Untitled', mode: 'field', settings: defaultSettings(), stage: defaultStage(), parts: [], contacts: [], light: null }
}

export const sceneToJSON = (scene) => JSON.stringify(scene, null, 2)

// Read a saved scene. Anything missing gets a default and every part is
// rebuilt through createPart, so a hand-edited or older file can't put bad
// numbers into the maths. Throws on something that isn't a scene at all.
export function sceneFromJSON(text) {
  const raw = typeof text === 'string' ? JSON.parse(text) : text
  if (!raw || raw.app !== 'assembly' || !Array.isArray(raw.parts)) throw new Error('Not an Assembly scene file')
  if (raw.version > SCENE_VERSION) throw new Error(`Scene is from a newer version (${raw.version})`)
  const base = emptyScene()
  const s = { ...base.settings, ...raw.settings }
  s.friction = { ...base.settings.friction, ...raw.settings?.friction }
  s.loopRule = { ...base.settings.loopRule, ...raw.settings?.loopRule }
  s.annealer = { ...base.settings.annealer, ...raw.settings?.annealer }
  const parts = raw.parts.map((p) => createPart(p.type, p))
  const ids = new Set(parts.map((p) => p.id))
  for (const p of parts) {
    if (p.sourceId && !ids.has(p.sourceId)) p.sourceId = null
    if (p.pose.lean && p.pose.lean !== 'wall' && !ids.has(p.pose.lean)) p.pose.lean = null
  } // source was deleted: keep the family, drop the dangling link
  return {
    ...base,
    name: typeof raw.name === 'string' ? raw.name : base.name,
    mode: MODES.includes(raw.mode) ? raw.mode : base.mode,
    settings: s,
    stage: { ...base.stage, ...raw.stage },
    parts,
    contacts: Array.isArray(raw.contacts) ? raw.contacts : [],
    light: raw.light ?? null,
  }
}

// The always-visible totals that don't depend on the arrangement.
export function sceneTotals(scene) {
  const per = scene.parts.map((p) => ({ part: p, m: partMetrics(p, scene.settings) }))
  return {
    weightG: per.reduce((a, x) => a + x.m.weightG, 0),
    volumeCm3: per.reduce((a, x) => a + x.m.volumeCm3, 0),
    counts: familyCounts(scene.parts, scene.settings),
    per,
  }
}
