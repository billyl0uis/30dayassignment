import { createUnitsStore } from '@core/stores/units'

// The jar app's own saved settings, kept apart from any other app built on
// the vessel core.
export const unitsStore = createUnitsStore('finial:units')
