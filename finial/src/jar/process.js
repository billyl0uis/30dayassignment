import { formatLength, formatWeight } from '@core/model/units'
import { KNOB_STYLES } from './lid'

// A starting list of steps for the bench, filled in with this jar's
// numbers. It's a template to edit, not a technique: it names the usual
// stages and the sizes to aim for, and leaves how to the glassblower.
// Each step is { id, title, detail }.

// "Cobalt (COE 33)", or just the name, or "unnamed glass".
const glassName = (zone) => {
  const name = zone.name?.trim() || 'unnamed glass'
  const coe = String(zone.coe ?? '').trim()
  return coe ? `${name} (COE ${coe})` : name
}
const isClear = (zone) => /^clear$/i.test(zone.name?.trim() ?? '')

export function planSteps({ section, m, range, lid, fitted, lidWeightG, zones, inUse, units }) {
  const len = (mm) => formatLength(mm, units)
  const wide = section.outer.reduce((best, p) => (p[0] > best[0] ? p : best), section.outer[0])
  const steps = []
  const add = (id, title, detail) => steps.push({ id, title, detail })

  add(
    'gather',
    'Gathers',
    `Gather for the body. The finished body is about ${formatWeight(m.weightG, units)} of glass; gather more to allow for what's lost to the pipe, punty and trimming.`,
  )

  const colours = []
  if (!isClear(zones.body)) colours.push(`Body: ${glassName(zones.body)}.`)
  if (inUse.includes('foot')) colours.push(`Foot: ${glassName(zones.foot)}, applied later.`)
  if (inUse.includes('lip')) colours.push(`Lip wrap: ${glassName(zones.lip)}, applied at the lip.`)
  add('colour', 'Colour application', colours.length ? colours.join(' ') : 'Clear throughout; no colour to apply to the body.')

  add('block', 'Blocking', 'Block the gather to centre it on the pipe.')

  add(
    'shape',
    'Shaping the body',
    `Blow and shape to the profile: ${len(m.height)} tall, widest ⌀ ${len(m.maxDiameter)} at ${len(wide[1])} up, foot ⌀ ${len(m.footDiameter)}. Wall ${
      range.thinnest === range.thickest ? len(range.thinnest) : `${len(range.thinnest)} to ${len(range.thickest)}`
    }.`,
  )

  if (inUse.includes('foot'))
    add('foot', 'Foot', `Foot in ${glassName(zones.foot)}, about ${len(zones.foot.height)} tall, ⌀ ${len(m.footDiameter)} where it meets the table.`)

  add('punty', 'Transfer to the punty', 'Transfer the body to the punty to work the mouth.')

  add(
    'open',
    'Opening',
    `Open the mouth to ⌀ ${len(m.openingDiameter)} inside; rim ⌀ ${len(m.rimOuterDiameter)} outside.`,
  )

  if (lid.mode === 'gallery')
    add(
      'gallery',
      'Gallery',
      `Form the gallery: a ledge inside the neck to catch a ⌀ ${len(fitted.fit.lidDiameter)} lid, about ${len(fitted.seat)} up from the table.`,
    )

  add(
    'lip',
    'Lip finishing',
    inUse.includes('lip')
      ? `Finish the lip with a wrap of ${glassName(zones.lip)}, about ${len(zones.lip.depth)} deep.`
      : 'Finish the lip.',
  )

  add(
    'anneal-body',
    'Body into the annealer',
    `Thickest wall ${len(range.thickest)}. Anneal on your own schedule for that thickness.`,
  )

  const fit = fitted.fit
  const fitLine = {
    inside: `Flange ⌀ ${len(fit.lidDiameter)} outside, ${len(lid.drop)} deep, to drop into the ⌀ ${len(fit.bodyDiameter)} opening.`,
    over: `Skirt ⌀ ${len(fit.lidDiameter)} inside, ${len(lid.drop)} deep, to go over the ⌀ ${len(fit.bodyDiameter)} rim.`,
    gallery: `Edge ⌀ ${len(fit.lidDiameter)} to drop into the ⌀ ${len(fit.bodyDiameter)} mouth and rest on the gallery.`,
  }[lid.mode]
  add(
    'lid',
    'Lid, as a separate piece',
    `Make the lid in ${glassName(zones.lid)}: ${fitLine} Target gap ${formatLength(fit.gap, units, 2)} all round. About ${formatWeight(lidWeightG, units)} of glass.`,
  )

  if (inUse.includes('knob'))
    add(
      'knob',
      'Knob',
      `${KNOB_STYLES[lid.knob.style]} knob in ${glassName(zones.knob)}, ${len(lid.knob.height)} tall, ⌀ ${len(lid.knob.diameter)} at its widest.`,
    )

  add('anneal-lid', 'Lid into the annealer', 'Anneal on your own schedule for the lid’s thickness.')

  add(
    'cold-work',
    'Cold-work the fit',
    `Grind the lid’s seat${lid.mode === 'gallery' ? '' : lid.mode === 'over' ? ' and skirt' : ' and flange'} until it sits evenly; aim for the ${formatLength(fit.gap, units, 2)} gap all round.`,
  )

  return steps
}
