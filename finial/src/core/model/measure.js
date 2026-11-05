import { clipBelow, solidOfRevolution } from './revolve'

// Measurements read off a section (wall.js buildSection). Lengths in mm,
// capacity in ml, glass in cm³ and g.

// Soda-lime furnace glass, about 2.5 g/cm³. The starting value of an
// editable field, not a property of your glass.
// TODO(source): replace with your batch's density from the maker's data sheet.
export const DEFAULT_DENSITY_G_CM3 = 2.5

// Points this close to the lowest point count as touching the table.
const FOOT_CONTACT_MM = 0.5

// The clear opening: the widest round thing that passes straight down into
// the jar, as a diameter. That's the narrowest the inside gets from the
// belly up: a neck below a flared lip limits it, and the floor (which
// narrows to the axis) doesn't count. Widest at the rim, it's the rim.
export function clearOpening(inner) {
  let belly = 0
  for (let i = 1; i < inner.length; i++) if (inner[i][0] > inner[belly][0]) belly = i
  return 2 * Math.min(...inner.slice(belly).map((p) => p[0]))
}

export function measure(section, { density = DEFAULT_DENSITY_G_CM3 } = {}) {
  const { outer, inner, glass, cavity } = section
  const lowest = Math.min(...outer.map((p) => p[1]))
  const footR = Math.max(...outer.filter((p) => p[1] <= lowest + FOOT_CONTACT_MM).map((p) => p[0]))
  const solid = solidOfRevolution(glass)
  const glassCm3 = solid.volume / 1000
  return {
    height: Math.max(...outer.map((p) => p[1])) - lowest,
    maxDiameter: 2 * Math.max(...outer.map((p) => p[0])),
    footDiameter: 2 * footR,
    rimOuterDiameter: 2 * outer[outer.length - 1][0],
    rimInnerDiameter: 2 * inner[inner.length - 1][0],
    openingDiameter: clearOpening(inner),
    capacityMl: solidOfRevolution(cavity).volume / 1000,
    glassCm3,
    weightG: glassCm3 * density,
    // Height of the glass's center of mass above the table, for tipping.
    centerOfMassZ: solid.z - lowest,
  }
}

// Capacity filled to a height above the table (a fill line, or the seat of
// a lid that sits down inside), in ml.
export function capacityTo(section, z) {
  return solidOfRevolution(clipBelow(section.cavity, z)).volume / 1000
}
