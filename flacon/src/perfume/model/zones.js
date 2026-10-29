// Decorative zones: bands of the bottle, by height, that carry colour, a
// place for cane or murrini, or surface work. Heights in mm above the table.
// `external` is the hook for Before The Heat: a zone can point at a cane or
// murrini design there by source and id. Nothing fills it in yet.

export const ZONE_KINDS = {
  colour: 'Colour',
  cane: 'Cane / murrini',
  surface: 'Surface',
}

export const SURFACE_TAGS = {
  optic: 'Optic',
  cut: 'Cut',
  sandblast: 'Sandblast',
}

let next = 1
export function newZone(kind, y0, y1) {
  return { id: `z${Date.now().toString(36)}${next++}`, kind, y0: Math.min(y0, y1), y1: Math.max(y0, y1), colour: null, tags: [], note: '', external: { source: null, ref: null } }
}

// Zones that can't be placed on this bottle: outside its height, or with
// no height at all. Overlaps are allowed (a cut band over a colour band).
export function zoneProblems(zones, height) {
  return zones.flatMap((z) => {
    if (z.y1 - z.y0 <= 0) return [{ id: z.id, text: 'Has no height.' }]
    if (z.y0 < 0 || z.y1 > height) return [{ id: z.id, text: 'Runs past the bottle.' }]
    return []
  })
}

// The zones as another app would take them in: plain data, versioned, with
// heights also as a share of the bottle so they survive a resize.
export function zoneExport(zones, height) {
  return {
    format: 'flacon-zones',
    version: 1,
    height,
    zones: zones.map((z) => ({ ...z, at: [z.y0 / height, z.y1 / height] })),
  }
}
