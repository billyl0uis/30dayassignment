import { DEFAULT_LID } from './lid'
import { startingDesign } from './design'

// Starting forms to pull around. Proportions only, picked by eye for each
// kind of jar; nothing here is a standard size.

const design = (name, body, lid) => ({ ...startingDesign(), name, body, lid: { ...DEFAULT_LID, ...lid } })

export const PRESETS = {
  apothecary: design(
    'Apothecary jar',
    {
      wall: 4,
      points: [
        { r: 0, z: 0 },
        { r: 46, z: 0, corner: true },
        { r: 49, z: 8 },
        { r: 50, z: 120 },
        { r: 47, z: 140 },
        { r: 38, z: 152, corner: true },
        { r: 38, z: 164 },
      ],
    },
    {
      mode: 'inside',
      drop: 12,
      points: [
        { r: 0, z: 18 },
        { r: 26, z: 14 },
        { r: 45, z: 4, corner: true },
        { r: 45, z: 0 },
      ],
      knob: { style: 'finial', height: 34, diameter: 22, neck: 10 },
    },
  ),
  honey: design(
    'Squat honey jar',
    {
      wall: 4,
      points: [
        { r: 0, z: 0 },
        { r: 38, z: 0, corner: true },
        { r: 52, z: 22 },
        { r: 56, z: 46 },
        { r: 49, z: 74 },
        { r: 42, z: 86, corner: true },
        { r: 42, z: 96 },
      ],
    },
    {
      mode: 'over',
      drop: 12,
      points: [
        { r: 0, z: 12 },
        { r: 28, z: 10 },
        { r: 48, z: 3, corner: true },
        { r: 48, z: 0 },
      ],
      knob: { style: 'mushroom', height: 18, diameter: 22, neck: 9 },
    },
  ),
  canister: design(
    'Tall canister',
    {
      wall: 4,
      // The neck steps in and out again just below the rim: the gallery
      // the lid sits on.
      points: [
        { r: 0, z: 0 },
        { r: 50, z: 0, corner: true },
        { r: 50, z: 222, corner: true },
        { r: 45, z: 227, corner: true },
        { r: 45, z: 231, corner: true },
        { r: 50, z: 236, corner: true },
        { r: 50, z: 250 },
      ],
    },
    {
      mode: 'gallery',
      points: [
        { r: 0, z: 8 },
        { r: 30, z: 7 },
        { r: 46, z: 3, corner: true },
        { r: 46, z: 0 },
      ],
      knob: { style: 'button', height: 18, diameter: 26, neck: 12 },
    },
  ),
}
