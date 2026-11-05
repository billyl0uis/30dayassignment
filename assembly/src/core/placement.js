// Where parts sit. Placement is user-controlled; this file only works out
// the height a part comes to rest at (snap-to-rest), slides a leaning part
// until it touches what it leans on, and hangs hung parts on their line.
// No physics engine: stability is judged later by static checks.
//
// The trick is a depth map: look at a mesh along one direction and record,
// on a grid of small cells, the nearest (or farthest) surface in each cell.
// Snap-to-rest is then "lift the part above everything, drop it until its
// underside first meets the top surface of what's below", which is one
// max() over overlapping cells, fast enough to run on every drag event.
import { partMesh } from './mesh.js'
export { DEFAULT_POSE } from './parts.js'
export { defaultStage } from './scene.js'

export const CELL_MM = 2
const D2R = Math.PI / 180

// pose: x, y, z (mm, the part's bottom centre in the world), yaw (deg, turn
// about the vertical), tilt (deg from upright) and tiltDir (deg, the way the
// top leans, measured in the floor plane from +x towards −z).
// mount: 'rest' | 'hung'; lineMm: hanging line length; lean: null | 'wall' | partId.
// DEFAULT_POSE and defaultStage live in parts.js / scene.js (no import cycle).
export const wallZ = (stage) => -stage.baseD / 2

// Rotation as a 3×3 row-major matrix: turn by yaw, then tip the top over by
// `tilt` towards tiltDir (Rodrigues about the horizontal axis up × lean).
export function rotationMatrix(pose) {
  const y = (pose.yaw ?? 0) * D2R
  const cy = Math.cos(y), sy = Math.sin(y)
  const Ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy]
  const t = (pose.tilt ?? 0) * D2R
  if (Math.abs(t) < 1e-9) return Ry
  const d = (pose.tiltDir ?? 0) * D2R
  const L = [Math.cos(d), 0, -Math.sin(d)]
  const k = [L[2], 0, -L[0]] // up × L
  const c = Math.cos(t), s = Math.sin(t), C = 1 - c
  const [kx, ky, kz] = k
  const Rt = [
    c + kx * kx * C, kx * ky * C - kz * s, kx * kz * C + ky * s,
    ky * kx * C + kz * s, c + ky * ky * C, ky * kz * C - kx * s,
    kz * kx * C - ky * s, kz * ky * C + kx * s, c + kz * kz * C,
  ]
  return mul3(Rt, Ry)
}
function mul3(a, b) {
  const o = new Array(9)
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]
  return o
}
export const applyRot = (R, p) => [R[0] * p[0] + R[1] * p[1] + R[2] * p[2], R[3] * p[0] + R[4] * p[1] + R[5] * p[2], R[6] * p[0] + R[7] * p[1] + R[8] * p[2]]

// Coarse meshes, cached by shape (pose doesn't change the shape).
const meshCache = new Map()
export function collideMesh(part) {
  const key = `${part.type}|${part.scale}|${JSON.stringify(part.dims)}`
  let m = meshCache.get(key)
  if (!m) {
    m = partMesh(part, 'collide')
    meshCache.set(key, m)
    if (meshCache.size > 300) meshCache.delete(meshCache.keys().next().value)
  }
  return m
}

// Mesh positions rotated by the pose; translated too unless `rotateOnly`.
export function posedPositions(part, pose = part.pose, rotateOnly = false) {
  const src = collideMesh(part).positions
  const R = rotationMatrix(pose)
  const out = new Float32Array(src.length)
  const tx = rotateOnly ? 0 : pose.x, ty = rotateOnly ? 0 : pose.y, tz = rotateOnly ? 0 : pose.z
  for (let i = 0; i < src.length; i += 3) {
    const x = src[i], y = src[i + 1], z = src[i + 2]
    out[i] = R[0] * x + R[1] * y + R[2] * z + tx
    out[i + 1] = R[3] * x + R[4] * y + R[5] * z + ty
    out[i + 2] = R[6] * x + R[7] * y + R[8] * z + tz
  }
  return out
}

export function bounds(positions) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < positions.length; i += 3)
    for (let k = 0; k < 3; k++) {
      const v = positions[i + k]
      if (v < min[k]) min[k] = v
      if (v > max[k]) max[k] = v
    }
  return { min, max }
}

// ---------------------------------------------------------------- depth maps

const KEY_OFF = 32768
const key = (i, j) => (i + KEY_OFF) * 65536 + (j + KEY_OFF)

// Record, per cell of the (u, v) plane, the max or min of w over a mesh.
// Triangles are filled at cell centres and their edges are sampled too, so
// walls seen edge-on (a cup's side, seen from above) still register.
export function depthMap(positions, indices, u, v, w, mode, cell = CELL_MM, into = new Map()) {
  const better = mode === 'max' ? (a, b) => a > b : (a, b) => a < b
  const put = (i, j, val) => {
    const k = key(i, j)
    const cur = into.get(k)
    if (cur === undefined || better(val, cur)) into.set(k, val)
  }
  const P = (n) => {
    const x = positions[n * 3], y = positions[n * 3 + 1], z = positions[n * 3 + 2]
    return [x * u[0] + y * u[1] + z * u[2], x * v[0] + y * v[1] + z * v[2], x * w[0] + y * w[1] + z * w[2]]
  }
  for (let t = 0; t < indices.length; t += 3) {
    const a = P(indices[t]), b = P(indices[t + 1]), c = P(indices[t + 2])
    // Edges (and so vertices).
    for (const [p, q] of [[a, b], [b, c], [c, a]]) {
      const n = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / (cell * 0.5)) + 1
      for (let s = 0; s <= n; s++) {
        const f = s / n
        put(Math.round((p[0] + (q[0] - p[0]) * f) / cell), Math.round((p[1] + (q[1] - p[1]) * f) / cell), p[2] + (q[2] - p[2]) * f)
      }
    }
    // Interior, by barycentric test at cell centres.
    const det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
    if (Math.abs(det) < 1e-9) continue
    const i0 = Math.ceil(Math.min(a[0], b[0], c[0]) / cell), i1 = Math.floor(Math.max(a[0], b[0], c[0]) / cell)
    const j0 = Math.ceil(Math.min(a[1], b[1], c[1]) / cell), j1 = Math.floor(Math.max(a[1], b[1], c[1]) / cell)
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) {
        const px = i * cell, py = j * cell
        const l1 = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / det
        const l2 = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / det
        const l3 = 1 - l1 - l2
        if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue
        put(i, j, l1 * a[2] + l2 * b[2] + l3 * c[2])
      }
  }
  return into
}

const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1]

// Top surface of every resting part except `excludeId`, seen from above.
export function supportMap(scene, excludeIds = []) {
  const map = new Map()
  for (const p of scene.parts) {
    if (excludeIds.includes(p.id) || p.pose.mount === 'hung') continue
    depthMap(posedPositions(p), collideMesh(p).indices, X, Z, Y, 'max', CELL_MM, map)
  }
  return map
}

// The part's underside, rotated but not moved, plus its lowest point.
export function undersideMap(part, pose) {
  const pos = posedPositions(part, pose, true)
  return { map: depthMap(pos, collideMesh(part).indices, X, Z, Y, 'min'), minY: bounds(pos).min[1] }
}

// Snap-to-rest: the height at which the part, lifted above everything and
// lowered at (x, z), first touches the base or a part below. Also says what
// it landed on ('base' or the cell that touched, for the readout).
export function restY(support, under, x, z) {
  let y = -under.minY // sitting on the base
  let onPart = false
  const di = Math.round(x / CELL_MM), dj = Math.round(z / CELL_MM)
  for (const [k, bottom] of under.map) {
    const i = Math.floor(k / 65536) - KEY_OFF + di, j = (k % 65536) - KEY_OFF + dj
    const top = support.get(key(i, j))
    if (top !== undefined && top - bottom > y + 1e-6) {
      y = top - bottom
      onPart = true
    }
  }
  return { y, onPart }
}

// ------------------------------------------------------------------ leaning

// How far the part can slide along horizontal unit vector d before it
// touches `target` (null if nothing on that line). Negative = overlapping,
// and the slide backs it out.
export function slideToPart(part, pose, target, d) {
  const u = [-d[2], 0, d[0]] // horizontal, across the slide
  const mine = depthMap(posedPositions(part, pose, true), collideMesh(part).indices, u, Y, d, 'max')
  const theirs = depthMap(posedPositions(target), collideMesh(target).indices, u, Y, d, 'min')
  const du = Math.round((pose.x * u[0] + pose.z * u[2]) / CELL_MM), dv = Math.round(pose.y / CELL_MM)
  const along = pose.x * d[0] + pose.z * d[2]
  let s = Infinity
  for (const [k, front] of mine) {
    const i = Math.floor(k / 65536) - KEY_OFF + du, j = (k % 65536) - KEY_OFF + dv
    const near = theirs.get(key(i, j))
    if (near !== undefined) s = Math.min(s, near - (front + along))
  }
  return Number.isFinite(s) ? s : null
}

// Lean the part: tip it towards the wall or the target part by pose.tilt,
// rest it on the base, and slide it in until it touches. A few rounds,
// because sliding changes where the foot is.
export function leanPose(scene, part, pose) {
  const stage = scene.stage
  let p = { ...pose }
  let d
  const target = pose.lean === 'wall' ? null : scene.parts.find((q) => q.id === pose.lean)
  if (pose.lean === 'wall') d = [0, 0, -1]
  else if (target) {
    const dx = target.pose.x - p.x, dz = target.pose.z - p.z
    const l = Math.hypot(dx, dz)
    d = l > 1e-6 ? [dx / l, 0, dz / l] : [0, 0, -1]
  } else return { pose: restOnBase(part, p), touching: false }
  p.tiltDir = (Math.atan2(-d[2], d[0]) / D2R + 360) % 360
  let touching = false
  for (let round = 0; round < 4; round++) {
    p = restOnBase(part, p)
    let s
    if (!target) {
      const b = bounds(posedPositions(part, p))
      s = b.min[2] - wallZ(stage) // distance to the wall along −z
    } else s = slideToPart(part, p, target, d)
    if (s === null) break
    touching = true
    p.x += d[0] * s
    p.z += d[2] * s
    if (Math.abs(s) < 0.05) break
  }
  return { pose: restOnBase(part, p), touching }
}

// A leaning part stands on the base (not on other parts) at its lowest point.
function restOnBase(part, pose) {
  const b = bounds(posedPositions(part, pose, true))
  return { ...pose, y: -b.min[1] }
}

// ------------------------------------------------------------------ hanging

// Where a part's hanging point is, in its own frame: top centre.
export function hangPointLocal(part) {
  const b = bounds(collideMesh(part).positions)
  return [0, b.max[1], 0]
}

// A hung part hangs straight: no tilt, the hanging point directly under the
// line's anchor on the armature.
export function hungPose(scene, part, pose) {
  const top = hangPointLocal(part)[1]
  return { ...pose, tilt: 0, y: scene.stage.armatureY - pose.lineMm - top }
}

// --------------------------------------------------------------- settle

// Put one part where its mount says it goes, given everyone else.
export function settlePart(scene, part, pose = part.pose) {
  if (pose.mount === 'hung') return hungPose(scene, part, pose)
  if (pose.lean) return leanPose(scene, part, pose).pose
  const support = supportMap(scene, [part.id])
  return { ...pose, y: restY(support, undersideMap(part, pose), pose.x, pose.z).y }
}

// Settle everything, lowest first, so stacks come to rest bottom-up and
// leaning parts go last (they need their targets in place).
export function settleAll(scene) {
  const order = [...scene.parts].sort((a, b) => (!!a.pose.lean - !!b.pose.lean) || a.pose.y - b.pose.y)
  // Each part rests only on parts already settled, not on ones still
  // floating above it waiting their turn.
  const done = []
  for (const p of order) {
    const pose = settlePart({ ...scene, parts: [...done, p] }, p)
    done.push({ ...p, pose })
  }
  const byId = new Map(done.map((p) => [p.id, p]))
  return { ...scene, parts: scene.parts.map((p) => byId.get(p.id)) }
}

// ------------------------------------------------------------- footprint

// The group's size: bounding rectangle on the base (W × D), overall height,
// and for hung parts how far the lowest one hangs below the armature.
export function footprint(scene) {
  if (!scene.parts.length) return null
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
  let hungLow = Infinity, anyHung = false, restTop = 0
  for (const p of scene.parts) {
    const b = bounds(posedPositions(p))
    for (let k = 0; k < 3; k++) (min[k] = Math.min(min[k], b.min[k])), (max[k] = Math.max(max[k], b.max[k]))
    if (p.pose.mount === 'hung') (anyHung = true), (hungLow = Math.min(hungLow, b.min[1]))
    else restTop = Math.max(restTop, b.max[1])
  }
  return {
    minX: min[0], maxX: max[0], minZ: min[2], maxZ: max[2],
    w: max[0] - min[0], d: max[2] - min[2],
    height: Math.max(max[1], anyHung ? scene.stage.armatureY : 0),
    partsTop: max[1],
    restTop, // tallest part or stack standing on the base
    hangDrop: anyHung ? scene.stage.armatureY - hungLow : null,
    clearance: anyHung ? hungLow : null,
  }
}

// A free spot to set a new part down: the first place on the base, row by
// row from the middle outwards, where its footprint doesn't overlap any
// part already there. Off to the right if the base is full.
export function freeSpot(scene, part, gap = 15) {
  const b = bounds(collideMesh(part).positions)
  const hw = (b.max[0] - b.min[0]) / 2, hd = (b.max[2] - b.min[2]) / 2
  const taken = scene.parts.map((p) => bounds(posedPositions(p)))
  const free = (x, z) => taken.every((t) => x + hw + gap <= t.min[0] || x - hw - gap >= t.max[0] || z + hd + gap <= t.min[2] || z - hd - gap >= t.max[2])
  const { baseW, baseD } = scene.stage
  const xs = [], zs = [0]
  for (let x = -baseW / 2 + hw + 20; x <= baseW / 2 - hw - 20; x += 10) xs.push(x)
  for (let dz = 2 * hd + gap; dz <= baseD / 2 - hd; dz += 2 * hd + gap) zs.push(-dz, dz)
  xs.sort((a, c) => Math.abs(a) - Math.abs(c))
  for (const z of zs) for (const x of xs) if (free(x, z)) return { x, z }
  if (!scene.parts.length) return { x: 0, z: 0 }
  const f = footprint(scene)
  return { x: f.maxX + hw + 20, z: 0 }
}
