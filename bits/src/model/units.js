// Inside the app everything is cm and g (Jackline's units). On screen,
// lengths are mm or inches and mass is always grams.
export const CM_PER_IN = 2.54

export function fmtLen(cm, units, { digits } = {}) {
  if (units === 'in') return `${(cm / CM_PER_IN).toFixed(digits ?? 2)} in`
  return `${(cm * 10).toFixed(digits ?? 0)} mm`
}

// A length field shows and takes mm or inches; the store keeps cm.
export const toShown = (cm, units) => (units === 'in' ? cm / CM_PER_IN : cm * 10)
export const fromShown = (v, units) => (units === 'in' ? v * CM_PER_IN : v / 10)
export const unitLabel = (units) => (units === 'in' ? 'in' : 'mm')

const ML_PER_FLOZ = 29.5735
export function fmtVol(ml, units) {
  return units === 'in' ? `${(ml / ML_PER_FLOZ).toFixed(1)} fl oz` : `${Math.round(ml)} ml`
}

// Grams: whole for anything over 10 g, one decimal under, because a 2 g
// prunt to the gram is a 25% swing.
export function fmtMass(g) {
  if (!Number.isFinite(g)) return '–'
  if (g === 0) return '0 g'
  return g >= 10 ? `${Math.round(g)} g` : `${g.toFixed(1)} g`
}
