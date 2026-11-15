// Bits in words, for the working-order list and the views sheet: where each
// one is, how big, and the sheet's schedule and totals. Plain functions of
// the piece's measures, so the sheet and the app always agree.
import { BIT_TYPES } from './bits/index.js'
import { fmtLen, fmtMass, fmtVol } from './units.js'

const L = (cm, units, digits) => fmtLen(cm, units, digits != null ? { digits } : undefined)
const fine = (units) => (units === 'in' ? 3 : 1) // threads and walls want a decimal

// Where a bit sits.
export function whereText(bit, bm, units) {
  const t = BIT_TYPES[bit.type]
  if (t.placement === 'base') return 'under the base'
  if (t.placement === 'band') return `lower body · leaf at ${bm.clock}`
  if (t.placement === 'rim') return `rim · ${bm.clock}`
  if (t.placement === 'edge') return `${bit.params.edge === 'rim' ? 'rim' : 'foot edge'} · from ${bm.clock}`
  return `${L(bm.height, units, units === 'in' ? 1 : 0)} up · ${bm.clock}`
}

// Its size, in the terms you'd shape it by.
export function sizeText(bit, units) {
  const p = bit.params
  switch (bit.type) {
    case 'prunt':
    case 'raspberry': {
      const base = `⌀${L(p.diameter, units)} × ${L(p.height, units)} high`
      if (bit.texture === 'pulled point') return `${base}, pulled ${L(p.point, units)}`
      if (bit.texture === 'raspberry stamp') return `${base}, stamp ⌀${L(p.stampD, units)}`
      return base
    }
    case 'lilypad':
      return `${p.leaves} leaves to ${L(p.height, units)} up, band ${L(p.band, units)}, ${L(p.thickness, units, fine(units))} gather`
    case 'trail': {
      const how = p.path === 'freehand' ? `freehand, ${bit.points?.length ?? 0} points` : `${p.wraps} wraps at ${L(p.pitch, units, fine(units))} pitch`
      const extra = [bit.texture === 'combed' ? `combed ${p.combs}×` : '', p.marvered ? 'marvered' : ''].filter(Boolean).join(', ')
      return `⌀${L(p.diameter, units, fine(units))} thread, ${how}${extra ? `, ${extra}` : ''}`
    }
    case 'coil':
      return `⌀${L(p.diameter, units, fine(units))} × ${p.turns} turns`
    case 'foot':
      return p.style === 'coiled'
        ? `wound, ⌀${L(p.diameter, units)}, ⌀${L(p.thread, units, fine(units))} thread × ${p.turns} turns`
        : `disk ⌀${L(p.diameter, units)} × ${L(p.thickness, units, fine(units))}${p.stem > 0.05 ? `, stem ${L(p.stem, units)} × ⌀${L(p.stemD, units)}` : ''}`
    case 'wings':
      return `${L(p.span, units)} out × ${L(p.height, units)} high × ${L(p.thickness, units, fine(units))}${bit.texture === 'tweezer pinch' ? `, ${p.pinches} pinches` : ''}`
    case 'handle':
      return `⌀${L(p.diameter, units)} strap, ${L(p.reach, units)} reach${p.thumb ? ', thumb rest' : ''}`
    case 'lip':
      return `pulled ${L(p.pull, units)}, ${L(p.width, units)} wide, ${L(p.depth, units)} down`
    default:
      return ''
  }
}

// The bit schedule: one row per bit, in working order. "#" is the number
// on the bit in every view, and it IS the working-order step.
export function scheduleRows({ bits, m, glasses, units }) {
  const byId = Object.fromEntries(glasses.map((g) => [g.id, g]))
  return bits.map((bit, i) => {
    const t = BIT_TYPES[bit.type]
    const bm = m.bits[i]
    const g = byId[bit.glass]
    return {
      n: i + 1,
      type: t.label,
      where: whereText(bit, bm, units),
      size: sizeText(bit, units),
      glass: t.addsMass === false ? '—' : (g?.name ?? '?') + (g?.coe ? ` (COE ${g.coe})` : ''),
      mass: t.addsMass === false ? 'no glass' : fmtMass(bm.mass),
      tool: bit.texture,
    }
  })
}

// The totals block: empty and filled, and the thickest section to anneal for.
export function totals({ m, filled, worst, checks, units }) {
  const tip = (d) => (d < 0 ? 'won’t stand' : `${Math.round(d)}°`)
  const anneal = checks.find((c) => c.check === 5)
  // Rows with two values fill the Empty and Filled columns; rows with one
  // value (null second) run across both.
  const steady = worst && (worst.fill === 0 ? 'empty' : `${Math.round(worst.fill * 100)}% full`)
  return [
    ['Mass', fmtMass(m.total.mass), filled ? fmtMass(filled.total.mass) : null],
    ['Center of mass', `${L(m.total.com[1], units)} up`, filled ? `${L(filled.total.com[1], units)} up` : null],
    ['Min tip angle', tip(m.tip.deg), filled ? tip(filled.tip.deg) : null],
    ...(worst ? [['Least steady', `${steady}: tips at ${tip(worst.tip.deg)} (checked every 10%)`, null]] : []),
    ...(filled ? [['Holds', `${fmtVol(filled.capacity, units)} to the brim`, null]] : []),
    ['Thickest section', anneal ? anneal.title.replace(/^Anneal for /, '') : '—', null],
  ]
}
