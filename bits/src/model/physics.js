// Mass, center of mass and tipping. Lengths are cm, so cm³ × g/cm³ = g.
//
// Every volume here is measured off a closed mesh (Jackline's meshMass: sum
// of signed tetrahedra from the origin to each triangle), never estimated
// from a formula for the "ideal" shape. The tests check those meshes against
// shapes with known answers.
import { meshMass } from '@jackline/geometry/vessel.js'

export { meshMass }

const DEG = 180 / Math.PI

// Mass and center of mass of one closed mesh at one density.
export function massOf(geo, density) {
  const { volume, com } = meshMass(geo)
  return { volume, mass: volume * density, com }
}

// Several parts as one: masses add, centers of mass average by mass.
export function combine(parts) {
  let mass = 0
  const c = [0, 0, 0]
  for (const p of parts) {
    if (!(p.mass > 0)) continue
    mass += p.mass
    for (let i = 0; i < 3; i++) c[i] += p.com[i] * p.mass
  }
  return { mass, com: mass > 0 ? c.map((v) => v / mass) : [0, 0, 0] }
}

// How far it can be tilted before it falls, standing on a round footprint of
// radius r. Tilted toward some direction, it goes over once the center of
// mass passes the edge of the foot on that side. With the center of mass at
// height h and offset d from the axis, the worst direction is straight
// toward the offset, and the angle there is atan((r − d) / h).
//
// Returns degrees (negative: it can't stand on its own) and the direction it
// tips, as an angle around the axis (atan2(x, z), 0 = front), or null when
// the weight is centered and it tips equally every way.
export function tipAngle(com, footR) {
  const [x, y, z] = com
  const d = Math.hypot(x, z)
  const h = Math.max(y, 1e-6)
  return {
    deg: Math.atan2(footR - d, h) * DEG,
    toward: d > 1e-3 ? Math.atan2(x, z) : null,
    offset: d,
  }
}

// Directions around the piece as a clock seen from above, front (toward
// you, +z) at 6 and the right side (+x) at 3. Rounded to the half hour,
// because nobody marks a pontil finer than that.
export function clockOf(theta) {
  let h = (6 - (theta * DEG) / 30) % 12
  if (h < 0) h += 12
  h = Math.round(h * 2) / 2
  if (h === 0 || h === 12) h = 12
  const whole = Math.floor(h)
  return `${whole === 0 ? 12 : whole}:${h % 1 ? '30' : '00'}`
}
