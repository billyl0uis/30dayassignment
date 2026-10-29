// How a perfume bottle is closed, and what that asks of its neck. Three
// kinds: a glass stopper ground into the neck, a cork, or bought hardware
// (atomizer, pump, crimp or screw). Every size here is typed in by the
// maker, from their own stopper drawing, cork or supplier's spec sheet.
// Nothing has a default: an empty field is null and shows as a TODO.
// Lengths in mm, angles in degrees.

export const HARDWARE_KINDS = {
  atomizer: 'Atomizer',
  pump: 'Pump',
  crimp: 'Crimp',
  screw: 'Screw cap',
}

export const STOPPER_HEADS = {
  disc: 'Flat disc',
  ball: 'Ball',
  teardrop: 'Teardrop',
  faceted: 'Faceted (cut)',
}

// Each field: what it's called, what kind of value, and whether the neck
// can't be worked out without it. `when` limits a field to some hardware
// kinds, or to stoppers with a dauber.
const neckOD = { key: 'neckOD', label: 'Neck outside ⌀', kind: 'length', required: true }

export const CLOSURE_TYPES = {
  stopper: {
    name: 'Ground glass stopper',
    note: 'The shank and the neck are ground together to fit, so the stopper belongs to this one bottle.',
    fields: [
      { key: 'head', label: 'Head shape', kind: 'choice', options: STOPPER_HEADS, required: true },
      { key: 'headWidth', label: 'Head width', kind: 'length', required: true },
      { key: 'headHeight', label: 'Head height', kind: 'length', required: true },
      { key: 'headThickness', label: 'Head thickness', kind: 'length', required: false, hint: 'Front to back, for a flat head. Leave empty for a round one.' },
      { key: 'shankTopD', label: 'Shank ⌀ at top', kind: 'length', required: true },
      { key: 'shankBottomD', label: 'Shank ⌀ at bottom', kind: 'length', required: true },
      { key: 'shankLength', label: 'Shank length', kind: 'length', required: true },
      neckOD,
      { key: 'dauber', label: 'Dauber', kind: 'flag', required: false },
      { key: 'dauberLength', label: 'Dauber length', kind: 'length', required: true, when: { dauber: true }, hint: 'Below the shank.' },
      { key: 'dauberD', label: 'Dauber ⌀', kind: 'length', required: true, when: { dauber: true } },
    ],
  },
  cork: {
    name: 'Cork',
    note: 'The neck bore is sized to the cork you have, at the depth it should sit.',
    fields: [
      { key: 'corkTopD', label: 'Cork ⌀ at top', kind: 'length', required: true },
      { key: 'corkBottomD', label: 'Cork ⌀ at bottom', kind: 'length', required: true, hint: 'Same as the top for a straight cork.' },
      { key: 'corkLength', label: 'Cork length', kind: 'length', required: true },
      { key: 'seatDepth', label: 'Sits this far in', kind: 'length', required: true },
      { key: 'squeeze', label: 'Squeeze', kind: 'length', required: false, hint: 'How much smaller than the cork the bore should be. TODO: ask your cork supplier; empty means none.' },
      neckOD,
    ],
  },
  hardware: {
    name: 'Commercial hardware',
    note: "The neck must match the hardware you buy. Copy every size from the supplier's spec sheet for that exact part.",
    fields: [
      { key: 'hardware', label: 'Hardware', kind: 'choice', options: HARDWARE_KINDS, required: true },
      { key: 'specRef', label: 'Supplier and part number', kind: 'text', required: true },
      { key: 'neckOD', label: 'Neck finish outside ⌀', kind: 'length', required: true },
      { key: 'boreD', label: 'Bore (inside ⌀)', kind: 'length', required: true },
      { key: 'finishHeight', label: 'Finish height', kind: 'length', required: true },
      { key: 'tolerance', label: 'Tolerance ±', kind: 'length', required: true, hint: "From the spec sheet. A hand-formed neck may need finishing cold to hold it." },
      { key: 'flangeD', label: 'Flange ⌀', kind: 'length', required: true, when: { hardware: ['crimp'] } },
      { key: 'flangeHeight', label: 'Flange height', kind: 'length', required: true, when: { hardware: ['crimp'] } },
      { key: 'threadD', label: 'Thread outside ⌀', kind: 'length', required: true, when: { hardware: ['screw'] } },
      { key: 'threadRootD', label: 'Thread root ⌀', kind: 'length', required: true, when: { hardware: ['screw'] } },
      { key: 'dipTube', label: 'Dip tube length', kind: 'length', required: false, when: { hardware: ['atomizer', 'pump'] }, hint: 'As supplied, before trimming.' },
    ],
  },
}

// A fresh closure of a kind, every size still to fill in.
export function emptyClosure(type) {
  const def = CLOSURE_TYPES[type]
  if (!def) throw new Error(`Unknown closure type: ${type}`)
  const values = Object.fromEntries(def.fields.map((f) => [f.key, f.kind === 'flag' ? false : null]))
  return { type, ...values }
}

// Is a field in play for this closure? A crimp flange only matters on a crimp.
function applies(field, closure) {
  if (!field.when) return true
  return Object.entries(field.when).every(([key, want]) => (Array.isArray(want) ? want.includes(closure[key]) : closure[key] === want))
}

export const fieldsFor = (closure) => CLOSURE_TYPES[closure.type].fields.filter((f) => applies(f, closure))

const filled = (v) => v !== null && v !== undefined && v !== '' && !(typeof v === 'number' && !Number.isFinite(v))

// The fields still to fill in before the neck can be drawn: the shop sheet
// lists these as TODOs.
export const missingFields = (closure) => fieldsFor(closure).filter((f) => f.required && !filled(closure[f.key]))

// How steep a stopper's shank is. Half-angle is each side against the axis;
// the ratio is how much length it takes to lose 1 mm of diameter.
export function stopperTaper({ shankTopD, shankBottomD, shankLength }) {
  if (![shankTopD, shankBottomD, shankLength].every(filled) || shankLength <= 0) return null
  const drop = shankTopD - shankBottomD
  const half = (Math.atan2(drop / 2, shankLength) * 180) / Math.PI
  return { halfAngle: half, included: half * 2, lengthPerMm: drop > 0 ? shankLength / drop : Infinity }
}

// A tapered cork's diameter `s` mm up from its small end.
const corkDAt = ({ corkTopD, corkBottomD, corkLength }, s) => corkBottomD + ((corkTopD - corkBottomD) * s) / corkLength

// The neck this closure asks for, as the profile will need it: the bore
// (⌀ at the mouth, ⌀ at the bottom of the fitted length, that length), the
// outside ⌀, and whether the rim is ground flat or left fire-polished.
// Null until the required sizes are in.
export function neckFor(closure) {
  if (missingFields(closure).length) return null
  if (closure.type === 'stopper') {
    // The bore takes the shank's taper; grinding makes them one fit.
    return { boreTopD: closure.shankTopD, boreBottomD: closure.shankBottomD, boreDepth: closure.shankLength, outerD: closure.neckOD, rim: 'ground' }
  }
  if (closure.type === 'cork') {
    // The mouth meets the cork where it stops; below that the bore can stay
    // that size, so it is drawn straight.
    const seat = Math.min(closure.seatDepth, closure.corkLength)
    const bore = corkDAt(closure, seat) - (closure.squeeze ?? 0)
    return { boreTopD: bore, boreBottomD: bore, boreDepth: seat, outerD: closure.neckOD, rim: 'fire-polished' }
  }
  return { boreTopD: closure.boreD, boreBottomD: closure.boreD, boreDepth: closure.finishHeight, outerD: closure.neckOD, rim: 'ground' }
}

// Neck wall left around the bore, at the mouth. The thin-neck risk check reads this.
export function neckWall(neck) {
  return neck ? (neck.outerD - neck.boreTopD) / 2 : null
}

// Does a neck as made (measured, or as drawn) fit the hardware? `made` has
// the same keys as the spec's sizes (neckOD, boreD, finishHeight, and
// flangeD or threadD when the hardware has them); any it lacks are skipped.
// Returns one line per size: { key, label, spec, made, off, ok }, where off
// is made − spec in mm. The spec's tolerance applies both ways; with no
// tolerance entered, ok is null (can't judge) rather than a guess.
const FIT_KEYS = ['neckOD', 'boreD', 'finishHeight', 'flangeD', 'threadD']

export function hardwareFit(spec, made) {
  const labels = Object.fromEntries(CLOSURE_TYPES.hardware.fields.map((f) => [f.key, f.label]))
  const tol = filled(spec.tolerance) ? spec.tolerance : null
  return FIT_KEYS.filter((key) => filled(spec[key]) && filled(made[key])).map((key) => {
    const off = made[key] - spec[key]
    return { key, label: labels[key], spec: spec[key], made: made[key], off, ok: tol === null ? null : Math.abs(off) <= tol + 1e-9 }
  })
}
