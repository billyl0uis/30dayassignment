// Capacity in perfume terms: what a bottle holds to the brim, what it holds
// at its fill line, and how to resize it to hold a set amount. The volume
// maths itself belongs to the vessel core; everything here takes it as a
// function, so it works on whatever the core measures (round or oval).
// Lengths in mm, volumes in ml.

import { flOzToMl } from '@core/model/units.js'

// Finds x in [lo, hi] where f(x) = target, for an f that only ever rises.
// Halving the bracket each time is slow but can't overshoot or diverge,
// which matters when f is a volume measured off a mesh.
function bisect(f, target, lo, hi, tol) {
  const fLo = f(lo), fHi = f(hi)
  if (target < fLo || target > fHi) return null
  for (let i = 0; i < 80 && hi - lo > tol; i++) {
    const mid = (lo + hi) / 2
    if (f(mid) < target) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

// Fill line as a share of the brim: 90 → 0.9 of what it holds to the top.
export const fillMl = (brimMl, percent) => (brimMl * percent) / 100

// A target typed in fl oz, for makers working to a US size.
export const targetMl = (value, unit) => (unit === 'fl oz' ? flOzToMl(value) : value)

// How high the liquid stands for a given amount. `volumeUpTo(y)` is the
// cavity's volume from its floor up to height y (from the core).
export function fillHeight(volumeUpTo, floorY, brimY, ml) {
  return bisect(volumeUpTo, ml, floorY, brimY, 0.01)
}

// Ways to resize a body profile, by factor k. The neck isn't in `points`:
// it is sized by its closure and has to stay that size, so only the body
// grows or shrinks underneath it.
export const SCALE_WAYS = {
  uniform: 'Whole body (wider and taller)',
  radial: 'Wider only (same height)',
  height: 'Taller only (same width)',
}

// Points are the core's { r, z }; anything else on a point (a corner, its
// own wall) carries over unscaled, so the walls stay as thick as they were.
// Heights up to `baseZ` (the top of a thick base) don't move either: the
// base keeps its thickness and only the body above it stretches.
export function scaleProfile(points, k, way, baseZ = 0) {
  const kr = way === 'height' ? 1 : k
  const kz = way === 'radial' ? 1 : k
  return points.map((p) => ({ ...p, r: p.r * kr, z: p.z <= baseZ ? p.z : baseZ + (p.z - baseZ) * kz }))
}

// The k that makes the body hold `target` ml, and the profile it gives.
// `measure(points)` returns the brim capacity of a body profile, with the
// wall thickness held as it is (a thicker or thinner wall would change it).
// `baseZ` holds the base still (see scaleProfile). Null when no k from
// 0.2× to 5× gets there.
export function solveScale({ points, way, target, measure, baseZ = 0 }) {
  const at = (k) => measure(scaleProfile(points, k, way, baseZ))
  const k = bisect(at, target, 0.2, 5, 1e-5)
  if (k === null) return null
  const scaled = scaleProfile(points, k, way, baseZ)
  return { k, points: scaled, ml: measure(scaled) }
}
