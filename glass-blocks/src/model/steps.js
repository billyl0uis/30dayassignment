// A design is an ordered list of steps; the parts on screen are whatever you
// get by replaying them. Undo moves a cursor back through the list, saving
// writes the list, and a future history panel can edit steps in place.
//
//   { type: 'add',     part, index }      insert a part at a stack position
//   { type: 'set',     id, patch }        change params / material / mode / placement
//   { type: 'remove',  id }
//   { type: 'reorder', id, to }           move a part to a new stack position
//   { type: 'clear' }
//
// Later: 'melt', 'carve', 'hollow' join this list.

export const DESIGN_VERSION = 1

export const newId = () => Math.random().toString(36).slice(2, 9)

export function applyPatch(part, patch) {
  const next = { ...part }
  for (const [k, v] of Object.entries(patch)) {
    next[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...part[k], ...v } : v
  }
  return next
}

export function applyStep(parts, step) {
  switch (step.type) {
    case 'add': {
      const i = step.index ?? parts.length
      return [...parts.slice(0, i), step.part, ...parts.slice(i)]
    }
    case 'set':
      return parts.map((p) => (p.id === step.id ? applyPatch(p, step.patch) : p))
    case 'remove':
      return parts.filter((p) => p.id !== step.id)
    case 'reorder': {
      const from = parts.findIndex((p) => p.id === step.id)
      if (from < 0) return parts
      const rest = parts.filter((p) => p.id !== step.id)
      const to = Math.max(0, Math.min(rest.length, step.to))
      return [...rest.slice(0, to), parts[from], ...rest.slice(to)]
    }
    case 'clear':
      return []
    default:
      // Unknown step types (from a newer version) are skipped, not fatal.
      return parts
  }
}

export const replay = (steps) => steps.reduce(applyStep, [])
