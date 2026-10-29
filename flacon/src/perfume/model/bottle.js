// The whole bottle as the vessel core draws it: the drawn body, then the
// neck the closure asks for. The core takes a wall thickness per point, so
// the neck is two or three points straight up at the neck's outside radius,
// each with the wall that leaves the bore: (outside ⌀ − bore ⌀) ÷ 2. A
// tapered stopper bore is a wall that thickens toward the bottom of the
// ground length. Lengths in mm.

import { neckFor } from './closures.js'

// The neck to draw: from the closure when its sizes are in, else the
// preset's placeholder (so the bottle isn't headless while you fill in).
export function neckShape(design) {
  const fromClosure = neckFor(design.closure)
  if (fromClosure) return { ...fromClosure, length: design.neckLength, placeholder: false }
  const s = design.neckSketch
  return { boreTopD: s.boreD, boreBottomD: s.boreD, boreDepth: design.neckLength, outerD: s.outerD, length: design.neckLength, rim: 'ground', placeholder: true }
}

// The body's top point is where the neck starts: it takes the neck's
// outside radius, so the shoulder runs straight into the neck (a ledge
// there, with the wall changing at the same spot, would fold the inside
// line). Its wall is the neck's, so the shoulder thickens toward the neck
// over its last span. Then the neck points, marked `neck: true` so edits to
// them can be told apart (the neck is sized in the closure panel).
export function bottlePoints(body, neck) {
  const r = neck.outerD / 2
  const wallAt = (d) => (neck.outerD - d) / 2
  const top = { ...body[body.length - 1], r, corner: true, wall: wallAt(neck.boreBottomD), shoulder: true }
  const mouth = top.z + neck.length
  const pts = [...body.slice(0, -1), top]
  // Below the fitted length the bore stays at its bottom size.
  const fitStart = mouth - Math.min(neck.boreDepth, neck.length)
  if (fitStart > top.z + 0.01) pts.push({ r, z: fitStart, wall: wallAt(neck.boreBottomD), neck: true })
  pts.push({ r, z: mouth, wall: wallAt(neck.boreTopD), neck: true })
  return pts
}

// What's left of the body after an edit on the whole bottle: everything up
// to the shoulder point, with the neck's wall taken back off it. A point
// added on the neck is dropped.
export function bodyFrom(points) {
  const shoulder = points.findIndex((p) => p.shoulder)
  const body = shoulder < 0 ? points.filter((p) => !p.neck) : points.slice(0, shoulder + 1)
  return body.map((p) => {
    if (!p.shoulder) return p
    const { wall: _wall, shoulder: _shoulder, ...rest } = p
    return rest
  })
}
