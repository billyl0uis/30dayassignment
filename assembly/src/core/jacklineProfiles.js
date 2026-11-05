// Outer profiles for blown forms. The named ones are Jackline's starting
// forms (src/model/presets.js), converted from cm to mm; only the outer line
// is used, since Assembly sets its own wall thickness. Jackline's sculpt
// moves (ribs, twist, lean) aren't carried over: parts here stay round.
const cm = (pts) => pts.map(([r, y]) => [r * 10, y * 10])

export const JACKLINE_PROFILES = {
  tumbler: { name: 'Tumbler', points: cm([[3.0, 0], [3.15, 1.5], [3.5, 6], [3.9, 10.5]]) },
  bowl: { name: 'Bowl', points: cm([[2.8, 0], [4.6, 1.1], [7.2, 3.4], [8.7, 6.3], [9.2, 8]]) },
  budvase: { name: 'Bud vase', points: cm([[2.6, 0], [3.4, 3], [3.4, 7], [1.6, 12], [0.9, 16], [1.3, 18]]) },
  carafe: { name: 'Carafe', points: cm([[4.6, 0], [5.2, 3], [5.1, 9], [3.2, 14], [2.4, 19], [2.9, 22]]) },
  optic: { name: 'Optic vase', points: cm([[3.2, 0], [4.4, 3], [4.6, 9], [3.0, 16], [2.6, 20], [3.4, 23]]) },
  leaner: { name: 'Leaner', points: cm([[3.0, 0], [3.6, 3], [3.4, 12], [2.0, 19], [1.6, 25], [2.0, 27]]) },
  bottle: { name: 'Bottle', points: cm([[3.6, 0], [3.8, 2], [3.8, 15], [3.2, 18], [1.4, 21], [1.2, 26], [1.45, 27]]) },
}

// A round float: a semicircle from the bottom of the axis to the top.
// Use with closedTop for a sealed sphere.
export function sphereProfile(diameterMm, n = 13) {
  const R = diameterMm / 2
  const pts = []
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / (n - 1)
    pts.push([Math.abs(R * Math.cos(a)) < 1e-9 ? 0 : R * Math.cos(a), R + R * Math.sin(a)])
  }
  return pts
}

// A straight-walled cylinder from foot to rim: two points, so it stays a
// true cylinder (exact volume, handy for checking the maths).
export const cylinderProfile = (diameterMm, heightMm) => [
  [diameterMm / 2, 0],
  [diameterMm / 2, heightMm],
]
