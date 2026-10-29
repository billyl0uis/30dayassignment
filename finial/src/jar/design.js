import { checkProfile, lengthOr, unwrapDesign, wrapDesign } from '@core/model/designFile'
import { DEFAULT_DENSITY_G_CM3 } from '@core/model/measure'
import { DEFAULT_LID, FIT_MODES, KNOB_STYLES } from './lid'
import { STARTING_BODY } from './startingJar'
import { DEFAULT_ZONES, ZONES } from './zones'

// A whole jar design, as saved:
//   name      what you call it
//   body      { points, wall }
//   lid       lid.js DEFAULT_LID's shape
//   zones     zones.js DEFAULT_ZONES's shape
//   plan      your edited process steps, or null while it follows the design
//   density   g/cm³, for glass weight

export const APP = 'finial'
export const SCHEMA_VERSION = 1

export const startingDesign = () => ({
  name: 'Untitled jar',
  body: STARTING_BODY,
  lid: DEFAULT_LID,
  zones: DEFAULT_ZONES,
  plan: null,
  density: DEFAULT_DENSITY_G_CM3,
})

export const saveDesign = (design) => wrapDesign(APP, SCHEMA_VERSION, design)

// A saved file's text back to a design. Throws DesignFileError, with a
// reason to show, when it can't.
export const readDesign = (text) => unwrapDesign(text, { app: APP, schemaVersion: SCHEMA_VERSION, migrate: normalise })

const str = (v, fallback = '') => (typeof v === 'string' ? v : fallback)
const gapOr = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback)

// Every field checked and anything missing filled from the defaults, so a
// file from an older version (or edited by hand) still opens.
export function normalise(raw) {
  const lid = raw.lid ?? {}
  const knob = lid.knob ?? {}
  const zones = raw.zones ?? {}
  return {
    name: str(raw.name).trim() || 'Untitled jar',
    body: {
      points: checkProfile(raw.body?.points, 'body'),
      wall: lengthOr(raw.body?.wall, STARTING_BODY.wall),
    },
    lid: {
      mode: lid.mode in FIT_MODES ? lid.mode : DEFAULT_LID.mode,
      gap: gapOr(lid.gap, DEFAULT_LID.gap),
      wall: lengthOr(lid.wall, DEFAULT_LID.wall),
      drop: lengthOr(lid.drop, DEFAULT_LID.drop),
      points: lid.points === undefined ? DEFAULT_LID.points : checkProfile(lid.points, 'lid'),
      knob: {
        style: knob.style in KNOB_STYLES ? knob.style : DEFAULT_LID.knob.style,
        height: lengthOr(knob.height, DEFAULT_LID.knob.height),
        diameter: lengthOr(knob.diameter, DEFAULT_LID.knob.diameter),
        neck: lengthOr(knob.neck, DEFAULT_LID.knob.neck),
      },
    },
    zones: Object.fromEntries(
      Object.keys(ZONES).map((key) => {
        const d = DEFAULT_ZONES[key]
        const z = zones[key] ?? {}
        const zone = {
          used: typeof z.used === 'boolean' ? z.used : d.used,
          name: str(z.name, d.name),
          coe: typeof z.coe === 'number' ? String(z.coe) : str(z.coe, d.coe),
          swatch: /^#[0-9a-f]{6}$/i.test(z.swatch) ? z.swatch : d.swatch,
        }
        if ('depth' in d) zone.depth = lengthOr(z.depth, d.depth)
        if ('height' in d) zone.height = lengthOr(z.height, d.height)
        return [key, zone]
      }),
    ),
    plan: Array.isArray(raw.plan)
      ? raw.plan
          .filter((s) => s && typeof s === 'object')
          .map((s, i) => ({ id: str(s.id) || `step-${i + 1}`, title: str(s.title), detail: str(s.detail) }))
      : null,
    density: lengthOr(raw.density, DEFAULT_DENSITY_G_CM3),
  }
}
