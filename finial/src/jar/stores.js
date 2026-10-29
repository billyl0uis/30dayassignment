import { DEFAULT_JUMP_RULE } from '@core/model/thickness'
import { createPrefsStore } from '@core/stores/prefs'
import { createUnitsStore } from '@core/stores/units'

// The jar app's own saved settings, kept apart from any other app built on
// the vessel core.
export const unitsStore = createUnitsStore('finial:units')
export const jumpRuleStore = createPrefsStore('finial:jump-rule', DEFAULT_JUMP_RULE)
