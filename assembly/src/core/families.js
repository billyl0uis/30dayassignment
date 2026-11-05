// Part families: duplicate a part and vary it, keeping a link to where it
// came from so the counts group nicely ("7 × Float, one family").
import { createPart, newId, partMetrics } from './parts.js'
import { normalizeColor } from './colors.js'

// A copy of `source`, in the same family, with optional changes:
//   scale  — multiplies the source's scale (1.2 = 20% bigger)
//   color  — { hex, opacity } (either may be left out)
//   dims   — dimension overrides, merged over the source's
//   name   — defaults to the source's name
export function duplicatePart(source, vary = {}) {
  const id = newId()
  return createPart(source.type, {
    id,
    name: vary.name ?? source.name,
    familyId: source.familyId,
    sourceId: source.id,
    color: vary.color ? normalizeColor({ ...source.color, ...vary.color }) : source.color,
    scale: source.scale * (Number.isFinite(vary.scale) && vary.scale > 0 ? vary.scale : 1),
    dims: structuredClone({ ...source.dims, ...vary.dims }),
    hang: source.hang ? { ...source.hang } : null,
    pose: { ...source.pose },
  })
}

// Leave the family: the part heads a family of its own. Parts that were
// copied from it stay in the old family (their link was to the family, and
// the counts should not suddenly split).
export const breakLink = (part) => ({ ...part, familyId: part.id, sourceId: null })

// Counts for the readout, grouped by type then family. Each family is named
// after its head part (the one whose id is the family id) if it's still
// there, otherwise after its first member.
export function familyCounts(parts, settings) {
  const fams = new Map()
  for (const p of parts) {
    let f = fams.get(p.familyId)
    if (!f) fams.set(p.familyId, (f = { familyId: p.familyId, type: p.type, name: p.name, count: 0, weightG: 0, partIds: [] }))
    if (p.id === p.familyId) f.name = p.name
    f.count++
    f.partIds.push(p.id)
    if (settings) f.weightG += partMetrics(p, settings).weightG
  }
  const byType = {}
  for (const f of fams.values()) (byType[f.type] ??= { type: f.type, count: 0, families: [] }).families.push(f)
  for (const t of Object.values(byType)) t.count = t.families.reduce((a, f) => a + f.count, 0)
  return byType
}
