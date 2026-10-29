export const CM_PER_IN = 2.54
const ML_PER_FLOZ = 29.5735
const G_PER_OZ = 28.3495

export function fmtLen(cm, units, digits = 1) {
  return units === 'in' ? `${(cm / CM_PER_IN).toFixed(digits + 1)} in` : `${cm.toFixed(digits)} cm`
}

export function fmtVol(ml, units) {
  return units === 'in' ? `${(ml / ML_PER_FLOZ).toFixed(1)} fl oz` : `${Math.round(ml)} ml`
}

export function fmtMass(g, units) {
  if (units === 'in') return g >= G_PER_OZ * 16 ? `${(g / G_PER_OZ / 16).toFixed(2)} lb` : `${(g / G_PER_OZ).toFixed(1)} oz`
  return g >= 1000 ? `${(g / 1000).toFixed(2)} kg` : `${Math.round(g)} g`
}
