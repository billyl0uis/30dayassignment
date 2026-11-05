export const CM_PER_IN = 2.54

export const toUnits = (cm, units) => (units === 'in' ? cm / CM_PER_IN : cm)
export const fromUnits = (v, units) => (units === 'in' ? v * CM_PER_IN : v)

export function formatLength(cm, units) {
  const v = toUnits(cm, units)
  return units === 'in' ? v.toFixed(2) : v.toFixed(1)
}

// Reads what someone typed: "3.5", "3 1/2", "3-1/2", "3/4", and a trailing
// unit ("9cm", '4"', "4 in") overrides the current units. Returns cm or null.
export function parseLength(text, units) {
  let s = String(text).trim().toLowerCase()
  let u = units
  const m = s.match(/(cm|mm|in|inch|inches|"|”)$/)
  if (m) {
    u = m[1] === 'cm' ? 'cm' : m[1] === 'mm' ? 'mm' : 'in'
    s = s.slice(0, -m[1].length).trim()
  }
  const frac = s.match(/^(?:(\d+(?:\.\d+)?)[\s-]+)?(\d+)\/(\d+)$/)
  let v
  if (frac) v = Number(frac[1] || 0) + Number(frac[2]) / Number(frac[3])
  else v = Number(s)
  if (!isFinite(v) || v <= 0) return null
  if (u === 'mm') return v / 10
  return fromUnits(v, u)
}
