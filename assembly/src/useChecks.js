import { useStore } from './store.js'
import { runChecks } from './core/checks.js'

// One run of the checks per scene change, shared by every panel and the 3D
// view (the scene object is replaced on every edit, so identity is the key).
let last = { scene: null, result: null }
export function checksFor(scene) {
  if (last.scene !== scene) last = { scene, result: runChecks(scene) }
  return last.result
}

export function useChecks() {
  return checksFor(useStore((s) => s.scene))
}
