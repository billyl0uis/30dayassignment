// Starting glass for a new piece. Every field is editable in the app.
//
// Density: 2.5 g/cm³ is a common figure for soda-lime furnace glass. Lead
// crystal runs higher; enter the number from your batch's data sheet.
//
// COE and compatibility group are left BLANK on purpose. They come from your
// supplier and your own testing, not from this app, and matching COE alone
// does not make two glasses compatible.
export const SODA_LIME_DENSITY = 2.5

export const DEFAULT_GLASSES = [
  { id: 'g-body', name: 'Clear batch', coe: '', group: '', density: SODA_LIME_DENSITY, color: '#ffffff' },
]

export const SWATCHES = [
  ['Clear', '#ffffff'],
  ['Aqua', '#9fe0e0'],
  ['Cobalt', '#2f56c9'],
  ['Amber', '#c47a1f'],
  ['Bottle green', '#3f7f4f'],
  ['Amethyst', '#8a5bb8'],
  ['Ruby', '#b3263a'],
]
