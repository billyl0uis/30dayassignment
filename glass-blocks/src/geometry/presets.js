// The shape catalog. Every part's base sits at y = 0 and its top at y = h (cm).
//
// "revolve" presets are a side profile spun around the Y axis: profile(t, h, R)
// gives a radius for t running 0 (bottom) → 1 (top). The radius doesn't have to
// peak at exactly R; buildProfile rescales it so the widest point is R = w / 2.
// Other presets have their own generator in build.js, keyed by `kind`.

const dome = (t) => Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2))

// Radius of a slab with rounded edges of radius e (cm), so cylinders and feet
// get a softened corner whatever their proportions.
export function slab(t, h, R, e) {
  e = Math.min(e, h / 2, R)
  const d = Math.min(t * h, h - t * h)
  if (d >= e) return R
  const k = (e - d) / e
  return R - e + e * Math.sqrt(1 - k * k)
}
const rounded = (t, h, R, e) => slab(t, h, R, e) / R

function bulb(t, a, b) {
  if (t < a || t > b) return 0
  return dome((t - a) / (b - a))
}

export const PRESETS = {
  sphere: { label: 'Sphere', group: 'body', kind: 'revolve', size: { w: 8, h: 8 }, profile: (t) => dome(t) },
  egg: {
    label: 'Egg', group: 'body', kind: 'revolve', size: { w: 7, h: 9 },
    profile: (t) => { const u = 2 * t - 1; return Math.sqrt(1 - u * u) * (1 - 0.18 * u) },
  },
  cylinder: {
    label: 'Cylinder', group: 'body', kind: 'revolve', size: { w: 6, h: 8 },
    profile: (t, h, R) => slab(t, h, R, Math.min(0.6, R * 0.25)),
  },
  cone: {
    label: 'Cone', group: 'body', kind: 'revolve', size: { w: 6, h: 8 },
    profile: (t, h, R) => Math.min(R * (1 - t) ** 0.95, slab(t, h, R, Math.min(0.5, R * 0.2))),
  },
  teardrop: {
    label: 'Teardrop', group: 'body', kind: 'revolve', size: { w: 6, h: 9 },
    profile: (t) => Math.sqrt(t) * (1 - t) ** 1.1,
  },
  gourd: {
    label: 'Gourd', group: 'body', kind: 'revolve', size: { w: 7, h: 11 },
    profile: (t) => {
      const low = bulb(t, 0, 0.6)
      const high = 0.66 * bulb(t, 0.46, 1)
      return (low ** 4 + high ** 4) ** 0.25
    },
  },
  blob: {
    label: 'Blob', group: 'body', kind: 'revolve', size: { w: 7, h: 6 },
    profile: (t) => { const u = 2 * t - 1; return Math.sqrt(1 - u * u) * (1 - 0.25 * u) },
    // A gather that's slumped a little and isn't quite round.
    mod: (rn, yn, th) => [1 + (0.09 * Math.sin(3 * th + 0.7) + 0.05 * Math.sin(5 * th + yn * 6)) * Math.sin(Math.PI * yn), 0],
  },
  disc: {
    label: 'Disc', group: 'body', kind: 'revolve', size: { w: 8, h: 1.2 },
    profile: (t, h, R) => slab(t, h, R, h * 0.45),
  },
  torus: { label: 'Torus', group: 'body', kind: 'torus', size: { w: 8, h: 2 }, noTaper: true },

  foot: {
    label: 'Foot', group: 'part', kind: 'revolve', size: { w: 8, h: 1.4 },
    profile: (t, h, R) => (0.2 + 0.8 * (1 - t) ** 2.2) * rounded(t, h, R, Math.min(h * 0.35, R * 0.2)),
  },
  stem: {
    label: 'Stem', group: 'part', kind: 'revolve', size: { w: 1.8, h: 7 },
    profile: (t, h, R) => (0.55 + 0.45 * Math.exp(-(((t - 0.5) / 0.1) ** 2))) * rounded(t, h, R, R * 0.3),
  },
  neck: {
    label: 'Neck', group: 'part', kind: 'revolve', size: { w: 2.6, h: 6 },
    profile: (t, h, R) => (0.62 + 0.38 * (2 * t - 1) ** 2) * rounded(t, h, R, R * 0.3),
  },
  lip: {
    label: 'Flared lip', group: 'part', kind: 'revolve', size: { w: 6, h: 3 },
    profile: (t, h, R) => (0.42 + 0.58 * t ** 2.2) * rounded(t, h, R, Math.min(R * 0.15, h * 0.25)),
  },
  bit: {
    label: 'Bit / prunt', group: 'part', kind: 'revolve', size: { w: 1.6, h: 0.9 },
    profile: (t, h, R) => Math.sqrt(1 - t * t) * rounded(t, h, R, h * 0.2),
  },
  coil: { label: 'Coil', group: 'part', kind: 'coil', size: { w: 6, h: 6 } },

  horn: { label: 'Horn', group: 'bone', kind: 'horn', size: { w: 2.5, h: 12 }, noTaper: true },
  tooth: { label: 'Tooth', group: 'bone', kind: 'tooth', size: { w: 3, h: 5 }, noTaper: true },
}

export const GROUPS = [
  { id: 'body', label: 'Bodies' },
  { id: 'part', label: 'Parts' },
  { id: 'bone', label: 'Bone & tooth' },
]

export const presetsInGroup = (group) => Object.entries(PRESETS).filter(([, p]) => p.group === group)
