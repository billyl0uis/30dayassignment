import { fmtLen, fmtMass, fmtVol } from './units.js'

// Each check returns { level: 'good' | 'warn' | 'bad', title, text } or null
// when it has nothing to say about this piece. `m` comes from measure() in
// derived.js; lengths are cm, weights grams, angles degrees.

// Does it stay standing? m.tip is how many degrees it can lean on the edge
// of its foot before falling over. m.footD, m.height and m.com (the center
// of mass, cm above the table) are there too.
export function stabilityCheck(m, units) {
  const lean = `${Math.round(m.tip)}°`
  const foot = fmtLen(m.footD, units)
  // Under ~12° a nudge or a table bump knocks it over; 12–20° survives
  // being set down but not a sleeve catching it. Stemware sits around 23°.
  if (m.tip < 12) return { level: 'bad', title: 'Falls over', text: `Only ${lean} of lean before it tips. Widen the ${foot} foot or lower the weight.` }
  if (m.tip < 20) return { level: 'warn', title: 'Tippy', text: `Tips at ${lean}. A bump will knock it over; a wider foot than ${foot} would help.` }
  return { level: 'good', title: 'Sits solid', text: `Leans ${lean} before tipping, on a ${foot} foot.` }
}

function wallCheck(m, units) {
  const w = fmtLen(m.wall, units, 2)
  if (m.wall < 0.1) return { level: 'bad', title: 'Fragile walls', text: `${w} walls chip on the first knock against a tap.` }
  if (m.wall < 0.2) return { level: 'warn', title: 'Delicate walls', text: `${w} is fine stemware: lovely to drink from, hand-wash only.` }
  if (m.wall > 0.7) return { level: 'warn', title: 'Heavy walls', text: `${w} walls make it heavy and slow to anneal evenly.` }
  return { level: 'good', title: 'Sturdy walls', text: `${w} walls suit everyday use.` }
}

function cleaningCheck(m, units) {
  const d = fmtLen(m.neckD, units)
  if (m.neckD < 1.5) return { level: 'bad', title: 'Hard to fill or clean', text: `The opening is only ${d} across.` }
  if (m.neckD < 5) return { level: 'warn', title: 'Needs a bottle brush', text: `The neck is ${d} across: too narrow for a hand or sponge.` }
  return { level: 'good', title: 'Easy to clean', text: `A ${d} opening fits a hand or sponge.` }
}

function gripCheck(m, units) {
  if (m.hasHandle) {
    if (m.brimMl > 2000) return { level: 'warn', title: 'Two-hand pour', text: `Over 2 kg when full: a lot to swing on one handle.` }
    return { level: 'good', title: 'Handle takes the weight', text: `Holds ${fmtVol(m.brimMl, units)}, carried by the handle.` }
  }
  const d = fmtLen(m.gripD, units)
  if (m.gripD > 9) return { level: 'warn', title: 'Too wide to grip', text: `${d} across where a hand goes. Narrow the waist or add a handle.` }
  if (m.glassG + m.brimMl > 1200) return { level: 'warn', title: 'Heavy without a handle', text: `${fmtMass(m.glassG, units)} of glass and big enough to be heavy in use. Consider a handle.` }
  return { level: 'good', title: 'Fits the hand', text: `${d} across where you hold it.` }
}

function pourCheck(m, spout) {
  if (spout || !m.hasHandle || m.brimMl < 750) return null
  return { level: 'warn', title: 'Dribbly pour', text: 'A big vessel with a handle wants a spout to pour cleanly.' }
}

export function functionChecks(m, { units, spout }) {
  return [
    { id: 'stability', check: stabilityCheck(m, units) },
    { id: 'wall', check: wallCheck(m, units) },
    { id: 'clean', check: cleaningCheck(m, units) },
    { id: 'grip', check: gripCheck(m, units) },
    { id: 'pour', check: pourCheck(m, spout) },
  ]
}
