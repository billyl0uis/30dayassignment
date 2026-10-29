// Saved designs as JSON files. The envelope is the core's; what goes in
// `design` is each app's own. A file says which app wrote it and which
// version of its format, so an older file can be brought up to date
// (migrate) and a newer or foreign one refused with a reason.
//
//   { "app": "finial", "schemaVersion": 1, "savedAt": "…", "design": { … } }

export class DesignFileError extends Error {}

export function wrapDesign(app, schemaVersion, design) {
  return JSON.stringify({ app, schemaVersion, savedAt: new Date().toISOString(), design }, null, 2)
}

// The design from a file's text, checked and brought up to date.
// migrate(design, fromVersion) returns the design in the current format.
export function unwrapDesign(text, { app, schemaVersion, migrate = (d) => d }) {
  let file
  try {
    file = JSON.parse(text)
  } catch {
    throw new DesignFileError('This file isn’t a saved design (it isn’t JSON).')
  }
  if (!file || typeof file !== 'object' || !file.design || typeof file.design !== 'object')
    throw new DesignFileError('This file isn’t a saved design.')
  if (file.app !== app) throw new DesignFileError(`This design was saved by ${file.app ? `“${file.app}”` : 'another app'}, not this one.`)
  const version = Number(file.schemaVersion)
  if (!Number.isInteger(version) || version < 1) throw new DesignFileError('This file has no format version.')
  if (version > schemaVersion) throw new DesignFileError('This design was saved by a newer version of the app.')
  return migrate(file.design, version)
}

const isLength = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0

// A profile's control points, checked: at least three, every r and z a
// length, the first on the axis, wall thicknesses positive. Returns clean
// points (unknown fields dropped) or throws.
export function checkProfile(points, what) {
  if (!Array.isArray(points) || points.length < 3) throw new DesignFileError(`The ${what} needs at least three points.`)
  return points.map((p, i) => {
    if (!p || !isLength(p.r) || !isLength(p.z)) throw new DesignFileError(`Point ${i + 1} of the ${what} isn’t a position.`)
    if (p.wall !== undefined && !(isLength(p.wall) && p.wall > 0))
      throw new DesignFileError(`Point ${i + 1} of the ${what} has a wall thickness that isn’t a length.`)
    const clean = { r: i === 0 ? 0 : p.r, z: p.z }
    if (p.corner) clean.corner = true
    if (p.wall !== undefined) clean.wall = p.wall
    return clean
  })
}

// A positive length, or the fallback when it's missing or not a number.
export const lengthOr = (value, fallback) => (isLength(value) && value > 0 ? value : fallback)
