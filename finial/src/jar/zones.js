import { clipBelow, clipBetween } from '@core/model/revolve'

// Colour zones on the jar. Brand-neutral: each is your own name for the
// glass, its COE as you read it off the maker's data, and a swatch for the
// preview. Nothing here knows any real colour or COE.
// TODO(source): COE comes from the maker's data sheet for the glass you use.

export const ZONES = {
  body: { label: 'Body', always: true },
  lip: { label: 'Lip wrap', size: { key: 'depth', label: 'Wrap depth' } },
  foot: { label: 'Foot', size: { key: 'height', label: 'Foot height' } },
  lid: { label: 'Lid', always: true },
  knob: { label: 'Knob' },
}

export const DEFAULT_ZONES = {
  body: { used: true, name: 'Clear', coe: '', swatch: '#dff4f2' },
  lip: { used: false, name: '', coe: '', swatch: '#2f5bd3', depth: 6 },
  foot: { used: false, name: '', coe: '', swatch: '#2f5bd3', height: 6 },
  lid: { used: true, name: 'Clear', coe: '', swatch: '#dff4f2' },
  knob: { used: true, name: 'Clear', coe: '', swatch: '#dff4f2' },
}

// The zones that are part of this jar: body and lid always, the knob when
// there is one, lip wrap and foot when switched on.
export function zonesInUse(zones, { hasKnob }) {
  return Object.keys(ZONES).filter((key) => {
    if (ZONES[key].always) return true
    if (key === 'knob') return hasKnob
    return zones[key].used
  })
}

// Does every glass on the jar say the same COE? Compares what was typed,
// as numbers. Returns
//   mismatch   [{ coe, zones: [labels] }] when there's more than one COE
//   missing    labels of zones with no COE entered
export function coeCheck(zones, inUse) {
  const groups = new Map()
  const missing = []
  for (const key of inUse) {
    const text = String(zones[key].coe ?? '').trim()
    const coe = Number(text)
    if (!text || !Number.isFinite(coe)) {
      missing.push(ZONES[key].label)
      continue
    }
    if (!groups.has(coe)) groups.set(coe, [])
    groups.get(coe).push(ZONES[key].label)
  }
  const mismatch = groups.size > 1 ? [...groups].map(([coe, labels]) => ({ coe, zones: labels })) : []
  return { mismatch, missing }
}

// The body's glass split into colour bands for the preview: foot at the
// bottom, lip wrap at the top, body between. Each { polygons, color }.
export function bodyBands(glass, height, zones, inUse) {
  const foot = inUse.includes('foot') ? Math.min(zones.foot.height, height) : 0
  const lip = inUse.includes('lip') ? Math.min(zones.lip.depth, height - foot) : 0
  const bands = []
  if (foot > 0) bands.push({ polygons: [clipBelow(glass, foot)], color: zones.foot.swatch })
  bands.push({ polygons: [clipBetween(glass, foot, height - lip)], color: zones.body.swatch })
  if (lip > 0) bands.push({ polygons: [clipBetween(glass, height - lip, Infinity)], color: zones.lip.swatch })
  return bands
}
