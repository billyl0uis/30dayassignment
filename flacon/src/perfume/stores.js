import { createUnitsStore } from '@core/stores/units'
import { fromPreset } from './model/presets.js'
import { processTemplate } from './model/process.js'

// Flacon's own saved settings, kept apart from Finial's.
export const unitsStore = createUnitsStore('flacon:units')

const KEY = 'flacon:design:v1'

export const newDesign = (preset) => {
  const d = fromPreset(preset)
  return { ...d, density: null, fillPercent: 90, limits: { baseToWall: null, baseShare: null, neckWall: null }, process: processTemplate(d.closure.type) }
}

// The design is remembered in this browser until the vessel core has save
// and open; a bad or old copy just starts fresh.
export function loadDesign() {
  try {
    const d = JSON.parse(window.localStorage.getItem(KEY))
    if (d && Array.isArray(d.points) && d.points.length >= 3 && d.closure?.type) return { ...newDesign(d.preset ?? 'flacon'), ...d }
  } catch {
    // Fall through to a fresh one.
  }
  return newDesign('flacon')
}

export function saveDesign(design) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(design))
  } catch {
    // Private window or full storage: it just won't be remembered.
  }
}
