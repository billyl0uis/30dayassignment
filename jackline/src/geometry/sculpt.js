// Sculpting bends space around the turned form. One warp moves every point
// (outside wall, inside wall, handle, cut faces) so the handle stays stuck on
// and the wall keeps its thickness however far the piece is pushed.
// Moves are the hot shop's: optic ribs, twisting them, paddling the sides
// flat, ruffling the rim, leaning the piece, and a freehand wobble.

export const NO_SCULPT = { ribs: 0, ribDepth: 0.35, twist: 0, squash: 0, lean: 0, waves: 0, waveHeight: 1.2, wobble: 0, seed: 1 }

export const isSculpted = (s) => !!s && (s.ribs > 0 || s.twist !== 0 || s.squash > 0 || s.lean !== 0 || s.waves > 0 || s.wobble > 0)

const smooth = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

// `height` is the piece's height, so the moves scale with it. With
// `levelRim`, the ruffled rim drops to its lowest point all the way round:
// that's where water would spill, so it's the brim for capacity.
export function makeWarp(s, height, { levelRim = false } = {}) {
  if (!isSculpted(s)) return null
  const twist = (s.twist * Math.PI) / 180
  // Seeded phases so a wobble you like comes back the same after a reload.
  const ph = [1, 2, 3, 4, 5].map((k) => ((Math.sin(s.seed * 12.9898 + k * 78.233) * 43758.5453) % 1) * Math.PI * 2)
  const f = 1 / Math.max(4, height * 0.35) // wobble scale: a few bumps per piece

  return (x, y, z, out) => {
    const t = Math.min(1.2, Math.max(0, y / height))
    let r = Math.hypot(x, z)
    let a = Math.atan2(x, z)

    // Ribs push in and out round the piece, like an optic mold. Scaled down
    // near the axis so the center of the floor doesn't crumple.
    if (s.ribs > 0) r += s.ribDepth * Math.cos(s.ribs * a) * Math.min(1, r)
    a += twist * t
    if (s.waves > 0) {
      const ramp = smooth(0.55, 1, t)
      y += (levelRim ? -s.waveHeight : s.waveHeight * Math.sin(s.waves * a)) * ramp
    }
    let nx = r * Math.sin(a)
    let nz = r * Math.cos(a)
    // Paddled: wider one way, flatter the other.
    if (s.squash > 0) {
      nx *= 1 + s.squash * 0.5
      nz *= 1 - s.squash * 0.5
    }
    if (s.wobble > 0) {
      const n =
        (Math.sin(nx * f * 6 + ph[0]) * Math.sin(y * f * 4 + ph[1]) +
          Math.sin(nz * f * 5 + ph[2]) * Math.sin(y * f * 3 + ph[3]) +
          Math.sin((nx + nz) * f * 4 + y * f * 2 + ph[4])) /
        2
      const rr = Math.hypot(nx, nz)
      if (rr > 1e-4) {
        const k = (rr + s.wobble * n * Math.min(1, rr)) / rr
        nx *= k
        nz *= k
      }
    }
    // Lean curves the piece over while the foot stays flat on the table.
    nx += s.lean * t * t
    out[0] = nx
    out[1] = y
    out[2] = nz
    return out
  }
}

// Runs a warp over every vertex of a three.js geometry.
export function warpPositions(geo, warp) {
  const p = geo.attributes.position
  const v = [0, 0, 0]
  for (let i = 0; i < p.count; i++) {
    warp(p.getX(i), p.getY(i), p.getZ(i), v)
    p.setXYZ(i, v[0], v[1], v[2])
  }
}
