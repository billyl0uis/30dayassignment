// Contacts: where a part touches another part, the base, or the wall.
// Found from the same depth maps placement uses: where one part's underside
// and another's top surface come within a fraction of a millimetre, they
// touch. Each contact gets a set of contact points (its patch), a normal
// (the direction the support pushes) and a type the user chooses.
//
// What's detected: a part resting on parts or the base below it, and a
// leaning part's foot and the thing it leans on. Parts that only touch
// side-by-side (not resting, not leaning) aren't detected as contacts.
import { CELL_MM, X, Y, Z, bounds, cellIJ, cellKey, collideMesh, depthMap, posedPositions, wallZ } from './placement.js'

export const CONTACT_TYPES = ['bare', 'pad', 'adhesive']
export const DEFAULT_CONTACT = 'pad'
const DETECT_MM = 1.0 // closer than this counts as touching
const PATCH_MM = 0.5 // cells within this of the closest point form the patch
const SINK_MM = 1.5 // allowed overlap from map rounding

// Stored contact types are keyed by the pair, so a contact keeps its type if
// the parts move a little. Base and wall contacts are `${id}|base` / `|wall`.
export const contactKey = (a, b) => (b === 'base' || b === 'wall' ? `${a}|${b}` : [a, b].sort().join('|'))

// ---- cached maps (shape + pose) ------------------------------------------
const cache = new Map()
const poseKey = (p) => `${p.type}|${p.scale}|${JSON.stringify(p.dims)}|${p.pose.x}|${p.pose.y}|${p.pose.z}|${p.pose.yaw}|${p.pose.tilt}|${p.pose.tiltDir}`
function cached(kind, part, make) {
  const k = `${kind}|${poseKey(part)}`
  let v = cache.get(k)
  if (!v) {
    v = make()
    cache.set(k, v)
    if (cache.size > 400) cache.delete(cache.keys().next().value)
  }
  return v
}
export const worldPositions = (part) => cached('pos', part, () => posedPositions(part))
const worldBounds = (part) => cached('bounds', part, () => bounds(worldPositions(part)))
const topMap = (part) => cached('top', part, () => depthMap(worldPositions(part), collideMesh(part).indices, X, Z, Y, 'max'))
const bottomMap = (part) => cached('bottom', part, () => depthMap(worldPositions(part), collideMesh(part).indices, X, Z, Y, 'min'))

// ---- normals ---------------------------------------------------------------

// Least-squares plane h = a·u + b·v + c through a map's cells near the patch.
// Returns [a, b] or null. `reach` cells around each patch cell are used.
function fitSlope(map, patchKeys, reach = 2) {
  const seen = new Set()
  let n = 0, su = 0, sv = 0, sh = 0, suu = 0, svv = 0, suv = 0, suh = 0, svh = 0
  for (const k of patchKeys) {
    const [i, j] = cellIJ(k)
    for (let di = -reach; di <= reach; di++)
      for (let dj = -reach; dj <= reach; dj++) {
        const kk = cellKey(i + di, j + dj)
        if (seen.has(kk)) continue
        seen.add(kk)
        const h = map.get(kk)
        if (h === undefined) continue
        const u = (i + di) * CELL_MM, v = (j + dj) * CELL_MM
        n++, (su += u), (sv += v), (sh += h), (suu += u * u), (svv += v * v), (suv += u * v), (suh += u * h), (svh += v * h)
      }
  }
  if (n < 3) return null
  // Centre the sums, then solve the 2×2 system for the slopes.
  const mu = su / n, mv = sv / n, mh = sh / n
  const cuu = suu / n - mu * mu, cvv = svv / n - mv * mv, cuv = suv / n - mu * mv
  const cuh = suh / n - mu * mh, cvh = svh / n - mv * mh
  const det = cuu * cvv - cuv * cuv
  if (Math.abs(det) < 1e-9) {
    // All cells in a line: slope only along it.
    if (cuu > 1e-9) return [cuh / cuu, 0]
    if (cvv > 1e-9) return [0, cvh / cvv]
    return [0, 0]
  }
  return [(cuh * cvv - cvh * cuv) / det, (cvh * cuu - cuh * cuv) / det]
}

// Does the patch reach the edge of this surface (a corner or rim)?
function atEdge(map, patchKeys) {
  for (const k of patchKeys) {
    const [i, j] = cellIJ(k)
    if (!map.has(cellKey(i + 1, j)) || !map.has(cellKey(i - 1, j)) || !map.has(cellKey(i, j + 1)) || !map.has(cellKey(i, j - 1))) return true
  }
  return false
}

const norm = (v) => {
  const l = Math.hypot(...v) || 1
  return v.map((x) => x / l)
}

// The contact normal for a resting contact: the slope of the support's top
// and of the upper part's underside, fitted around the patch. Where one of
// them is an edge or corner (a sphere on the edge of a block) the other
// surface decides, as for real contacts; otherwise the two are averaged.
function restingNormal(top, bottom, patch) {
  const sTop = top ? fitSlope(top, patch) : [0, 0]
  const sBot = fitSlope(bottom, patch)
  const nTop = sTop ? norm([-sTop[0], 1, -sTop[1]]) : null
  const nBot = sBot ? norm([-sBot[0], 1, -sBot[1]]) : null
  if (!nTop) return nBot ?? [0, 1, 0]
  if (!nBot) return nTop
  const eTop = top ? atEdge(top, patch) : false
  const eBot = atEdge(bottom, patch)
  if (eTop && !eBot) return nBot
  if (eBot && !eTop) return nTop
  return norm([nTop[0] + nBot[0], nTop[1] + nBot[1], nTop[2] + nBot[2]])
}

// ---- detection -------------------------------------------------------------

function patchFrom(cellsGap, toPoint) {
  let min = Infinity
  for (const [, g] of cellsGap) min = Math.min(min, g)
  const keys = [], points = []
  for (const [k, g, extra] of cellsGap) {
    if (g <= min + PATCH_MM) {
      keys.push(k)
      points.push(toPoint(k, extra))
    }
  }
  return { min, keys, points }
}

function makeContact(a, b, kind, points, normal, types, keys) {
  const key = contactKey(a, b)
  const c = points.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]).map((v) => v / points.length)
  return { key, a, b, kind, points, normal, center: c, areaMm2: (keys?.length ?? points.length) * CELL_MM * CELL_MM, type: types?.[key] ?? DEFAULT_CONTACT }
}

// All contacts in the scene. `types` is the scene's stored {key: type}.
export function detectContacts(scene, types = scene.contacts ?? {}) {
  const out = []
  const resting = scene.parts.filter((p) => p.pose.mount !== 'hung')
  for (const A of resting) {
    const bot = bottomMap(A)
    const bA = worldBounds(A)

    // On the base.
    if (bA.min[1] < DETECT_MM) {
      const cells = []
      for (const [k, v] of bot) cells.push([k, v])
      const pf = patchFrom(cells, (k) => {
        const [i, j] = cellIJ(k)
        return [i * CELL_MM, 0, j * CELL_MM]
      })
      out.push(makeContact(A.id, 'base', 'support', pf.points, [0, 1, 0], types, pf.keys))
    }

    if (A.pose.lean) {
      const lc = leanContact(scene, A)
      if (lc) out.push(makeContact(A.id, lc.b, 'lean', lc.points, lc.normal, types))
      continue // a leaning part stands on the base only
    }

    // On other parts.
    for (const B of resting) {
      if (B.id === A.id) continue
      const bB = worldBounds(B)
      if (bB.max[0] < bA.min[0] || bB.min[0] > bA.max[0] || bB.max[2] < bA.min[2] || bB.min[2] > bA.max[2]) continue
      if (bA.min[1] > bB.max[1] + DETECT_MM || bB.min[1] > bA.min[1] + DETECT_MM + 1e-6) continue
      const top = topMap(B)
      const cells = []
      for (const [k, v] of bot) {
        const t = top.get(k)
        if (t !== undefined) cells.push([k, v - t, (v + t) / 2])
      }
      if (!cells.length) continue
      const pf = patchFrom(cells, (k, y) => {
        const [i, j] = cellIJ(k)
        return [i * CELL_MM, y, j * CELL_MM]
      })
      if (pf.min > DETECT_MM || pf.min < -SINK_MM) continue
      out.push(makeContact(A.id, B.id, 'support', pf.points, restingNormal(top, bot, pf.keys), types, pf.keys))
    }
  }
  return out
}

// Where a leaning part touches what it leans on: the wall, or a part.
function leanContact(scene, A) {
  const pos = worldPositions(A)
  if (A.pose.lean === 'wall') {
    const wz = wallZ(scene.stage)
    let min = Infinity
    for (let i = 2; i < pos.length; i += 3) min = Math.min(min, pos[i])
    if (min - wz > DETECT_MM) return null
    const points = []
    for (let i = 0; i < pos.length; i += 3) if (pos[i + 2] <= min + PATCH_MM) points.push([pos[i], pos[i + 1], wz])
    return { b: 'wall', points, normal: [0, 0, 1] }
  }
  const B = scene.parts.find((p) => p.id === A.pose.lean)
  if (!B || B.pose.mount === 'hung') return null
  const dx = B.pose.x - A.pose.x, dz = B.pose.z - A.pose.z
  const l = Math.hypot(dx, dz) || 1
  const d = [dx / l, 0, dz / l]
  const u = [-d[2], 0, d[0]]
  const mine = depthMap(pos, collideMesh(A).indices, u, Y, d, 'max')
  const theirs = depthMap(worldPositions(B), collideMesh(B).indices, u, Y, d, 'min')
  const cells = []
  for (const [k, front] of mine) {
    const near = theirs.get(k)
    if (near !== undefined) cells.push([k, near - front, (near + front) / 2])
  }
  if (!cells.length) return null
  const pf = patchFrom(cells, (k, t) => {
    const [i, j] = cellIJ(k)
    const uu = i * CELL_MM, vv = j * CELL_MM
    return [u[0] * uu + d[0] * t, vv, u[2] * uu + d[2] * t]
  })
  if (pf.min > DETECT_MM || pf.min < -SINK_MM) return null
  // The target's near face, as t = a·u + b·v; its normal faces back at A.
  // If the patch is on the target's edge, use the leaning part's front.
  const useMine = atEdge(theirs, pf.keys) && !atEdge(mine, pf.keys)
  const s = fitSlope(useMine ? mine : theirs, pf.keys) ?? [0, 0]
  const g = [d[0] - s[0] * u[0], -s[1], d[2] - s[0] * u[2]] // ∇(t − a·u − b·v)
  return { b: B.id, points: pf.points, normal: norm(g.map((x) => -x)) }
}

