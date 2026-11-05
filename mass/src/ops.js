// Every change to the glass is an "op": a plain object in the history list.
// The volume is always history replayed onto an empty grid, which gives us
// undo/redo, resolution changes, and (later) preset scrubbing from one model.

import { Volume } from './volume.js';

const smin = (a, b, k) => {
  const hh = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - hh * hh * k * 0.25;
};

export const OPS = {
  // A fresh gather on the end of a punty. The punty comes in along -x.
  // "Droop": hot glass hangs, so the gather is a sphere smooth-unioned with a
  // smaller, lower sphere — a soft teardrop whose mass sits below the punty.
  gather(vol, { diameter = 8 }) {
    const r = diameter / 2;
    const cx = 0, cy = Math.max(r * 1.6, 9), cz = 0;
    const droop = 0.5 * r;
    vol.map((x, y, z) => {
      const a = Math.hypot(x - cx, y - cy, z - cz) - r * 0.92;
      // The hanging lobe drifts slightly away from the punty as well as down.
      const b = Math.hypot(x - (cx + 0.12 * r), y - (cy - droop), z - cz) - r * 0.8;
      return smin(a, b, r * 0.7);
    });
    vol.meta.puntyAxis = { y: cy, z: cz };
    vol.meta.centre = [cx, cy - droop * 0.4, cz];
  },

  // ── Calibration shapes (no punty) for checking the thickness rendering. ──
  // A sphere resting on the floor: every ray through its centre crosses
  // exactly one diameter of glass.
  testSphere(vol, { diameter = 8 }) {
    const r = diameter / 2;
    vol.map((x, y, z) => Math.hypot(x, y - r, z) - r);
    vol.meta.centre = [0, r, 0];
  },

  // A wedge lying on the floor, thin edge at -x rising to `height` at +x.
  // Seen from above, glass thickness grows linearly along its length.
  testWedge(vol, { length = 16, height = 5, width = 7 }) {
    const x0 = -length / 2, x1 = length / 2, hyp = Math.hypot(length, height);
    vol.map((x, y, z) => Math.max(
      -y,                                       // floor
      (y * length - height * (x - x0)) / hyp,   // sloped top
      Math.abs(z) - width / 2,                  // sides
      x - x1, x0 - x,                           // ends
    ));
    vol.meta.centre = [0, height / 3, 0];
  },

  // Gathering again over existing glass coats it in a new layer: offsetting
  // the distance field by the layer thickness is exactly that.
  addGather(vol, { thickness = 0.8 }) {
    vol.map((x, y, z, d) => d - thickness);
  },
};

export function replay(history, n, size) {
  const vol = new Volume(n, size);
  for (const op of history) OPS[op.type](vol, op);
  vol.meta.puntyMark = findPuntyMark(vol);
  return vol;
}

// Where the punty enters the glass: march in along +x on the punty axis.
// This is the spot that must be ground off later.
export function findPuntyMark(vol) {
  const ax = vol.meta.puntyAxis;
  if (!ax) return null;
  const x0 = vol.origin[0], step = vol.h * 0.5;
  for (let x = x0; x < -x0; x += step) {
    if (vol.sample(x, ax.y, ax.z) < 0) return [x, ax.y, ax.z];
  }
  return null;
}
