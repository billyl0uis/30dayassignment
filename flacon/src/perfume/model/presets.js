// Starting forms. Each is a sketch to draw from, not a spec. The body
// profile is in the vessel core's form ({ r, z } in mm, from the center of
// the base out and up), and stops at the base of the neck: the neck comes
// from the closure, whose sizes start empty. Until they're filled in, the
// bottle wears `neckSketch`, a placeholder neck the app labels as such.
// A `wall` on a point overrides the body wall there: the thick base, which
// runs up a short upright foot ring so the cavity floor comes out flat (a
// thick wall on a slanted side would sag the inside corner).
// `section` is the body's cross-section: aspect is depth ÷ width (1 is
// round), squareness runs from 0 (oval) to 1 (rounded rectangle).

import { emptyClosure } from './closures.js'

export const PRESETS = {
  flacon: {
    name: 'Classic round flacon',
    points: [{ r: 0, z: 0, wall: 8 }, { r: 24, z: 0, corner: true, wall: 8 }, { r: 24, z: 8, wall: 8 }, { r: 31, z: 16 }, { r: 32, z: 30 }, { r: 26, z: 52 }, { r: 9, z: 62, corner: true }],
    wall: 3,
    section: { aspect: 1, squareness: 0 },
    closure: 'stopper',
    neckSketch: { outerD: 18, boreD: 10, length: 14 },
  },
  flatOval: {
    name: 'Flat oval',
    points: [{ r: 0, z: 0, wall: 9 }, { r: 30, z: 0, corner: true, wall: 9 }, { r: 30, z: 9, wall: 9 }, { r: 36, z: 18 }, { r: 36, z: 50 }, { r: 28, z: 70 }, { r: 9, z: 78, corner: true }],
    wall: 3,
    section: { aspect: 0.4, squareness: 0 },
    closure: 'hardware',
    neckSketch: { outerD: 18, boreD: 10, length: 12 },
  },
  column: {
    name: 'Tall column',
    points: [{ r: 0, z: 0, wall: 10 }, { r: 17, z: 0, corner: true, wall: 10 }, { r: 17, z: 10, wall: 10 }, { r: 18, z: 16 }, { r: 18, z: 120 }, { r: 14, z: 128 }, { r: 8, z: 132, corner: true }],
    wall: 2.5,
    section: { aspect: 1, squareness: 0 },
    closure: 'hardware',
    neckSketch: { outerD: 15, boreD: 8, length: 12 },
  },
  sample: {
    name: 'Tiny sample bottle',
    points: [{ r: 0, z: 0, wall: 3 }, { r: 6, z: 0, corner: true, wall: 3 }, { r: 6, z: 3, wall: 3 }, { r: 7, z: 6 }, { r: 7, z: 38 }, { r: 4, z: 42, corner: true }],
    wall: 1.2,
    section: { aspect: 1, squareness: 0 },
    closure: 'cork',
    neckSketch: { outerD: 8, boreD: 4, length: 8 },
  },
}

export function fromPreset(id) {
  const p = PRESETS[id]
  return {
    preset: id,
    points: p.points.map((q) => ({ ...q })),
    wall: p.wall,
    section: { ...p.section },
    closure: emptyClosure(p.closure),
    neckLength: p.neckSketch.length,
    neckSketch: { ...p.neckSketch },
  }
}
