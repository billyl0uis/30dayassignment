import * as THREE from 'three'
import { anchorAt } from '../surface.js'

// Shared geometry for bit types. Every builder returns a CLOSED mesh in world
// space (the body standing on the table), so its volume and center of mass
// can be read off it with meshMass.

const Y = new THREE.Vector3(0, 1, 0)
export const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2])

// Local frame of a bit at an anchor: x round the piece, y out along the
// surface normal, z up the wall; then spun about the normal.
export function anchorMatrix(anchor, spin = 0) {
  const m = new THREE.Matrix4().makeBasis(v3(anchor.side), v3(anchor.normal), v3(anchor.up))
  m.multiply(new THREE.Matrix4().makeRotationAxis(Y, spin))
  m.setPosition(v3(anchor.point))
  return m
}

// How far a flat disk of radius a stands off a body of radius R (the
// sagitta). Display bases sink this far so they read as fused, not perched.
export const sinkFor = (a, anchor) => Math.min(a * 0.45, (a * a) / (2 * Math.max(anchor.r, 0.4)) + 0.03)

// Join rings of points (each the same count, each a closed loop) into one
// closed surface. `around`: the last ring joins back to the first (a lily
// pad, all the way round the body). Otherwise both ends get a flat fan cap.
// Winding is checked at the end and flipped if needed, so normals face out.
export function loft(rings, { around = false } = {}) {
  const R = rings.length, K = rings[0].length
  const pos = []
  for (const ring of rings) for (const p of ring) pos.push(p.x, p.y, p.z)
  const idx = []
  const at = (i, k) => (i % R) * K + (k % K)
  const spans = around ? R : R - 1
  for (let i = 0; i < spans; i++)
    for (let k = 0; k < K; k++) {
      const a = at(i, k), b = at(i + 1, k), c = at(i + 1, k + 1), d = at(i, k + 1)
      idx.push(a, b, c, a, c, d)
    }
  if (!around) {
    const cap = (ring) => ring.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(ring.length)
    const c0 = pos.length / 3
    const s = cap(rings[0])
    pos.push(s.x, s.y, s.z)
    const c1 = c0 + 1
    const e = cap(rings[R - 1])
    pos.push(e.x, e.y, e.z)
    for (let k = 0; k < K; k++) {
      idx.push(c0, at(0, k), at(0, k + 1))
      idx.push(c1, at(R - 1, k + 1), at(R - 1, k))
    }
  }
  if (signedVolume(pos, idx) < 0) for (let t = 0; t < idx.length; t += 3) [idx[t + 1], idx[t + 2]] = [idx[t + 2], idx[t + 1]]
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setIndex(idx)
  return geo
}

function signedVolume(p, idx) {
  let v = 0
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3
    v += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])
  }
  return v / 6
}

// A thread swept along a path: `path` is points with a reference "out"
// direction at each (the surface normal for a trail, so a marvered ribbon
// lies flat on the glass). Cross-section is an ellipse: `wide` across the
// path along the surface, `tall` out from it, each a number or a function of
// t in 0..1 along the path. `rise` lifts the center off the reference.
export function sweep(path, { wide, tall, rise = 0, sides = 14 }) {
  const n = path.length
  // An n-sided section has less area than the ellipse it stands for (12
  // sides: 4.5% less). Push it out to equal area, so the swept volume is the
  // thread's at any number of sides.
  const eq = Math.sqrt((2 * Math.PI) / (sides * Math.sin((2 * Math.PI) / sides)))
  const f = (x, t) => (typeof x === 'function' ? x(t) : x)
  const rings = []
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    const p = path[i].p
    const T = path[Math.min(n - 1, i + 1)].p.clone().sub(path[Math.max(0, i - 1)].p).normalize()
    const N = path[i].out.clone().addScaledVector(T, -path[i].out.dot(T)).normalize()
    const B = new THREE.Vector3().crossVectors(T, N)
    const a = f(wide, t) * eq, b = f(tall, t) * eq, c = p.clone().addScaledVector(N, f(rise, t))
    const ring = []
    for (let k = 0; k < sides; k++) {
      const phi = (k / sides) * Math.PI * 2
      ring.push(c.clone().addScaledVector(B, a * Math.cos(phi)).addScaledVector(N, b * Math.sin(phi)))
    }
    rings.push(ring)
  }
  return loft(rings)
}

// Length of a polyline of Vector3s.
export const pathLength = (pts) => pts.reduce((L, p, i) => (i ? L + p.distanceTo(pts[i - 1]) : 0), 0)

// Points on the body surface along a path given as (s, theta) pairs, with
// the surface normal at each, ready for sweep().
export function surfacePath(sec, st) {
  return st.map(([s, theta]) => {
    const a = anchorAt(sec, s, theta)
    return { p: v3(a.point), out: v3(a.normal), a }
  })
}

// Merge closed meshes into one (each stays closed, so volumes still add).
export function merge(geos) {
  let count = 0
  for (const g of geos) count += g.attributes.position.count
  const pos = new Float32Array(count * 3)
  const idx = []
  let off = 0
  for (const g of geos) {
    pos.set(g.attributes.position.array, off * 3)
    const gi = g.index ? g.index.array : [...Array(g.attributes.position.count).keys()]
    for (const i of gi) idx.push(i + off)
    off += g.attributes.position.count
    g.dispose()
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  out.setIndex(idx)
  return out
}

export const smooth = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
export const clamp01 = (v) => Math.min(1, Math.max(0, v))
