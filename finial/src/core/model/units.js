// Millimetres or inches, the viewer's choice. Every length inside a design
// is in mm and every volume in ml; units only change how they are shown and
// typed. Inches read as shop fractions (1 3/8 in), the way a ruler or
// calipers are marked.

export const MM_PER_IN = 25.4
// US customary fluid ounce, by definition (not a measured value).
export const ML_PER_FL_OZ = 29.5735295625

const gcd = (a, b) => (b ? gcd(b, a % b) : a)
const num = (v, digits) => v.toLocaleString('en', { maximumFractionDigits: digits })

// How finely to split an inch when showing a length, as the denominator
// (8 → eighths, 16 → sixteenths). Takes the length in inches so small and
// large sizes can be read at different precision.
// Walls and gaps (under an inch) need 32nds to tell 3 mm from 4 mm; jar
// diameters read in 16ths; heights and other long sizes in 8ths, since a
// blown form isn't held closer than that and the sheet stays readable.
export function fractionStep(totalInches) {
  if (totalInches < 1) return 32
  if (totalInches < 6) return 16
  return 8
}

// 34.925 mm → "1 3/8 in"; 3.175 mm → "1/8 in".
export function inches(mm) {
  const total = Math.abs(mm) / MM_PER_IN
  const sign = mm < 0 ? '−' : ''
  const step = fractionStep(total)
  let whole = Math.floor(total)
  let parts = Math.round((total - whole) * step)
  if (parts === step) {
    whole += 1
    parts = 0
  }
  // Smaller than the finest mark: say so rather than print "0 in".
  if (!whole && !parts) return total > 0 ? `< 1/${step} in` : '0 in'
  if (!parts) return `${sign}${whole} in`
  const g = gcd(parts, step)
  const fraction = `${parts / g}/${step / g}`
  return `${sign}${whole ? `${whole} ${fraction}` : fraction} in`
}

// A length in the chosen units: "35 mm" or "1 3/8 in".
export function formatLength(mm, units, digits = 1) {
  if (!Number.isFinite(mm)) return '—'
  return units === 'in' ? inches(mm) : `${num(mm, digits)} mm`
}

// A length as a bare number in the chosen units, for an input box:
// 34.925 → "34.9" (mm) or "1.375" (in). Decimal inches, since a fraction
// is awkward to edit.
export function lengthValue(mm, units) {
  return units === 'in' ? num(mm / MM_PER_IN, 3).replace(/,/g, '') : num(mm, 2).replace(/,/g, '')
}

// What someone typed, back to mm. Takes "35", "35.5", "1 3/8", "1-3/8",
// "3/8", "1.375", and a unit on the end ("in", "\"", "mm", "cm") overrides
// the current units. Returns null for anything it can't read.
export function parseLength(text, units) {
  const match = String(text)
    .trim()
    .toLowerCase()
    .match(/^(-?[\d.]+)?(?:[\s-]+)?(?:(\d+)\/(\d+))?\s*(mm|cm|in|"|”)?$/)
  if (!match) return null
  const [, wholeText, top, bottom, suffix] = match
  if (wholeText === undefined && top === undefined) return null
  const whole = wholeText === undefined ? 0 : Number(wholeText)
  if (!Number.isFinite(whole)) return null
  // A fraction only follows a whole number ("1 3/8"), never a decimal.
  if (top !== undefined && wholeText?.includes('.')) return null
  const fraction = top === undefined ? 0 : Number(top) / Number(bottom)
  if (!Number.isFinite(fraction)) return null
  const value = whole + Math.sign(whole || 1) * fraction
  const unit = suffix === '"' || suffix === '”' ? 'in' : suffix ?? units
  if (unit === 'in') return value * MM_PER_IN
  if (unit === 'cm') return value * 10
  return value
}

export const mlToFlOz = (ml) => ml / ML_PER_FL_OZ
export const flOzToMl = (oz) => oz * ML_PER_FL_OZ

// Capacity shows both: "500 ml · 16.9 fl oz", the chosen one first.
export function formatVolume(ml, units) {
  if (!Number.isFinite(ml)) return '—'
  const metric = `${num(ml, ml < 100 ? 1 : 0)} ml`
  const us = `${num(mlToFlOz(ml), 1)} fl oz`
  return units === 'in' ? `${us} · ${metric}` : `${metric} · ${us}`
}

// Glass weight in grams, with ounces (avoirdupois) in inch mode.
export function formatWeight(grams, units) {
  if (!Number.isFinite(grams)) return '—'
  const g = `${num(grams, 0)} g`
  return units === 'in' ? `${num(grams / 28.349523125, 1)} oz · ${g}` : g
}
