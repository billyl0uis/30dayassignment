import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { PRESETS, slab } from './presets.js'

const RADIAL = 64

// ---------------------------------------------------------------------------
// Profiles

// Side profile of a revolve preset as [[r, y], ...] from the bottom pole to the
// top pole, scaled so the widest point is R, then tapered.
export function buildProfile(preset, { h, w, taper = 1 }) {
  const def = PRESETS[preset]
  const R = w / 2
  const N = 72
  let pts = []
  for (let k = 0; k <= N; k++) {
    // Cosine spacing packs samples near the ends, where the rounding happens.
    const t = (1 - Math.cos((Math.PI * k) / N)) / 2
    pts.push([Math.max(0, def.profile(t, h, R)), t * h])
  }
  const max = Math.max(...pts.map((p) => p[0])) || 1
  pts = pts.map(([r, y]) => [(r * R) / max * Math.max(0.05, 1 + (taper - 1) * (y / h)), y])

  // Flat ends get a few rings across the cap so they shade flat.
  const [r0, y0] = pts[0]
  if (r0 > 1e-4) pts.unshift(...[0, 1, 2, 3].map((c) => [(r0 * c) / 4, y0]))
  const [r1, y1] = pts[pts.length - 1]
  if (r1 > 1e-4) pts.push(...[3, 2, 1, 0].map((c) => [(r1 * c) / 4, y1]))
  return pts
}

// Radius of a part's outer surface at height y (cm above its base). Handy for
// fitting parts together.
export function radiusAt(part, y) {
  const { preset, params } = part
  const { h, w, taper = 1 } = params
  const kind = PRESETS[preset].kind
  if (kind === 'revolve') {
    const pts = buildProfile(preset, params)
    let best = 0
    for (let i = 1; i < pts.length; i++) {
      const [ra, ya] = pts[i - 1]
      const [rb, yb] = pts[i]
      if (y < Math.min(ya, yb) || y > Math.max(ya, yb)) continue
      const r = yb === ya ? Math.max(ra, rb) : ra + ((rb - ra) * (y - ya)) / (yb - ya)
      best = Math.max(best, r)
    }
    return best
  }
  if (kind === 'torus') {
    const tube = h / 2
    const d = y - tube
    return Math.abs(d) > tube ? 0 : w / 2 - tube + Math.sqrt(tube * tube - d * d)
  }
  if (kind === 'coil') return (w / 2) * (1 + (taper - 1) * (y / h))
  if (kind === 'horn') return (w / 2) * Math.max(0, 1 - y / h)
  return w / 2
}

// ---------------------------------------------------------------------------
// Mesh generators

// Closes off a vertex/index list as a geometry. If the triangles came out
// inside-out, flips them, so generators don't have to agree on a handedness.
// The enclosed volume (cm³) rides along in userData for weight estimates.
function finish(pos, idx) {
  let vol = 0
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3
    vol +=
      (pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1]) -
        pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c]) +
        pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c])) / 6
  }
  if (vol < 0) {
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]]
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  g.userData.volume = Math.abs(vol)
  return g
}

// Spin a profile (r = 0 at both ends) around Y. mod(rn, yn, theta) can return
// [radius scale, y offset] for shapes that aren't perfectly round.
export function revolve(profile, { segments = RADIAL, mod, h = 1, R = 1 } = {}) {
  const pos = [0, profile[0][1], 0]
  const last = profile.length - 1
  for (let i = 1; i < last; i++) {
    const [r, y] = profile[i]
    for (let j = 0; j < segments; j++) {
      const th = (j / segments) * Math.PI * 2
      let rr = r, yy = y
      if (mod) {
        const [k, dy] = mod(r / R, y / h, th)
        rr *= k
        yy += dy
      }
      pos.push(rr * Math.cos(th), yy, rr * Math.sin(th))
    }
  }
  const top = pos.length / 3
  pos.push(0, profile[last][1], 0)

  const ring = (i) => 1 + (i - 1) * segments
  const idx = []
  for (let j = 0; j < segments; j++) {
    const n = (j + 1) % segments
    idx.push(0, ring(1) + j, ring(1) + n)
    for (let i = 1; i < last - 1; i++) {
      const a = ring(i) + j, b = ring(i) + n, c = ring(i + 1) + j, d = ring(i + 1) + n
      idx.push(a, c, b, b, c, d)
    }
    idx.push(top, ring(last - 1) + n, ring(last - 1) + j)
  }
  return finish(pos, idx)
}

// A tube along a curve whose radius varies along its length, capped at both ends.
export function sweep(curve, radius, { tubular = 96, radial = 28 } = {}) {
  const frames = curve.computeFrenetFrames(tubular, false)
  const p0 = curve.getPointAt(0)
  const p1 = curve.getPointAt(1)
  const pos = [p0.x, p0.y, p0.z]
  const v = new THREE.Vector3()
  for (let i = 0; i <= tubular; i++) {
    const s = i / tubular
    const c = curve.getPointAt(s)
    const r = radius(s)
    const N = frames.normals[i], B = frames.binormals[i]
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2
      v.copy(c).addScaledVector(N, r * Math.cos(a)).addScaledVector(B, r * Math.sin(a))
      pos.push(v.x, v.y, v.z)
    }
  }
  const end = pos.length / 3
  pos.push(p1.x, p1.y, p1.z)

  const ring = (i) => 1 + i * radial
  const idx = []
  for (let j = 0; j < radial; j++) {
    const n = (j + 1) % radial
    idx.push(0, ring(0) + j, ring(0) + n)
    for (let i = 0; i < tubular; i++) {
      const a = ring(i) + j, b = ring(i) + n, c = ring(i + 1) + j, d = ring(i + 1) + n
      idx.push(a, c, b, b, c, d)
    }
    idx.push(end, ring(tubular) + n, ring(tubular) + j)
  }
  return finish(pos, idx)
}

class FnCurve extends THREE.Curve {
  constructor(fn) { super(); this.fn = fn }
  getPoint(s, target = new THREE.Vector3()) { return this.fn(s, target) }
}

const BUILDERS = {
  revolve(preset, params) {
    const def = PRESETS[preset]
    const R = params.w / 2
    return revolve(buildProfile(preset, params), { mod: def.mod, h: params.h, R })
  },

  torus(_, { h, w }) {
    const tube = Math.min(h, w * 0.45) / 2
    const g = new THREE.TorusGeometry(w / 2 - tube, tube, 32, 96)
    g.rotateX(Math.PI / 2)
    g.translate(0, tube, 0)
    g.userData.volume = 2 * Math.PI ** 2 * (w / 2 - tube) * tube * tube
    return g
  },

  coil(_, { h, w, taper = 1 }) {
    const tube = Math.max(0.2, w * 0.07)
    const turns = 3
    const curve = new FnCurve((s, t) => {
      const R = (w / 2 - tube) * Math.max(0.05, 1 + (taper - 1) * s)
      const a = s * turns * Math.PI * 2
      return t.set(R * Math.cos(a), tube + s * (h - 2 * tube), R * Math.sin(a))
    })
    return sweep(curve, () => tube, { tubular: 240, radial: 20 })
  },

  horn(_, { h, w }) {
    const curve = new FnCurve((s, t) => t.set(0.38 * h * s * s, h * s, 0))
    return sweep(curve, (s) => (w / 2) * (1 - s) ** 0.9 + 0.04, { tubular: 96 })
  },

  tooth(_, { h, w }) {
    // Crown: a squarish, cusped cap over two tapering roots.
    const ch = h * 0.6
    const R = w / 2
    const crown = Array.from({ length: 41 }, (_, k) => {
      const t = (1 - Math.cos((Math.PI * k) / 40)) / 2
      return [(0.84 + 0.16 * Math.sin(Math.PI * t)) * slab(t, ch, R, R * 0.35), t * ch]
    })
    crown.unshift(...[0, 1, 2].map((c) => [(crown[0][0] * c) / 3, 0]))
    crown.push(...[2, 1, 0].map((c) => [(crown[crown.length - 1][0] * c) / 3, ch]))
    const square = (th) => (Math.abs(Math.cos(th)) ** 3 + Math.abs(Math.sin(th)) ** 3) ** (-1 / 3) / 1.26
    const crownG = revolve(crown, {
      h: ch, R,
      mod: (rn, yn, th) => {
        const top = Math.min(1, Math.max(0, (yn - 0.85) / 0.15))
        const cusp = 0.18 * ch * ((0.5 + 0.5 * Math.cos(2 * th)) * (0.5 + 0.5 * Math.cos(2 * th + Math.PI / 2) + 0.4)) * Math.sin(Math.PI * Math.min(1, rn / 0.9)) * top
        return [0.75 + 0.35 * square(th), cusp]
      },
    })
    crownG.translate(0, h - ch, 0)
    const roots = [-1, 1].map((sx) =>
      sweep(
        new FnCurve((s, t) => t.set(sx * (0.2 * w + 0.07 * w * s + 0.04 * w * Math.sin(Math.PI * s)), (h - ch) + 0.15 * h - (h - ch + 0.15 * h) * s, 0)),
        (s) => 0.19 * w * (1 - 0.88 * s ** 1.3),
        { tubular: 48, radial: 24 },
      ),
    )
    const g = mergeGeometries([crownG, ...roots])
    g.userData.volume = crownG.userData.volume + roots.reduce((a, r) => a + r.userData.volume, 0)
    return g
  },
}


export function buildGeometry(preset, params) {
  return BUILDERS[PRESETS[preset].kind](preset, params)
}

// ---------------------------------------------------------------------------
// Where the drag handles go on a part, in its local space.
//   stretch: top of the part (drag up/down → height)
//   squash:  the widest point (drag in/out → width)
//   taper:   high on the opposite side (drag in/out → top-to-bottom width ratio)
export function handleSpots(preset, params) {
  const { h, w, taper = 1 } = params
  const def = PRESETS[preset]
  if (def.kind === 'revolve') {
    const pts = buildProfile(preset, params)
    const widest = pts.reduce((a, b) => (b[0] > a[0] ? b : a))
    const yf = 0.82
    const rt = Math.max(0.15, radiusAt({ preset, params }, yf * h))
    return {
      stretch: [0, h, 0],
      squash: { pos: [widest[0], widest[1], 0], r: widest[0] },
      taper: { pos: [-rt, yf * h, 0], r: rt, yf },
    }
  }
  if (def.kind === 'coil') {
    const top = (w / 2) * Math.max(0.05, taper)
    return {
      stretch: [0, h, 0],
      squash: { pos: [w / 2, h * 0.1, 0], r: w / 2 },
      taper: { pos: [-top, h, 0], r: top, yf: 1 },
    }
  }
  if (def.kind === 'horn') return { stretch: [0.38 * h, h, 0], squash: { pos: [w / 2, 0.02 * h, 0], r: w / 2 }, taper: null }
  if (def.kind === 'torus') return { stretch: [w / 2 - h / 2, h, 0], squash: { pos: [w / 2, h / 2, 0], r: w / 2 }, taper: null }
  return { stretch: [0, h, 0], squash: { pos: [w / 2, h * 0.75, 0], r: w / 2 }, taper: null }
}
