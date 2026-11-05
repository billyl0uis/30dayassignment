// Parts: the data model, and the numbers each part gives (volume, weight,
// centre of mass, size). All lengths are mm, volumes cm³, weights g.
//
// Each part's local frame: origin at the bottom centre, y up. A part's
// placement in the arrangement (step 2) is stored separately in `pose`,
// so changing the arrangement never changes the part.
import { normalizeColor } from './colors.js'
import { blownSection, sampleCurve, solidOfRevolution } from './profile.js'
import { JACKLINE_PROFILES } from './jacklineProfiles.js'

export const PART_TYPES = ['blown', 'solid', 'cane']
export const SOLID_SHAPES = ['sphere', 'egg', 'cylinder', 'block']
export const CANE_PATTERNS = ['solid', 'cased', 'striped'] // visual only; volume is the same
export const HANG_KINDS = ['loop', 'drilled', 'cap']

let counter = 0
export const newId = (prefix = 'p') => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}`

const num = (v, fallback, min = 0) => (Number.isFinite(v) && v > min ? v : fallback)

const DEFAULTS = {
  blown: () => ({ profileId: 'tumbler', points: JACKLINE_PROFILES.tumbler.points.map((p) => [...p]), wallMm: 4, closedTop: false }),
  solid: () => ({ shape: 'sphere', diameterMm: 60, lengthMm: 90, point: 0, widthMm: 60, depthMm: 40, heightMm: 30 }),
  cane: () => ({ lengthMm: 300, diameterMm: 8, pattern: 'solid' }),
}

const NAMES = { blown: 'Blown form', solid: 'Solid', cane: 'Cane rod' }

// Make a part. `spec` overrides any field; everything missing gets a default,
// and bad numbers are replaced rather than allowed through.
export function createPart(type, spec = {}) {
  if (!PART_TYPES.includes(type)) throw new Error(`Unknown part type: ${type}`)
  const id = spec.id ?? newId()
  const dims = { ...DEFAULTS[type](), ...spec.dims }
  return {
    id,
    type,
    name: spec.name ?? NAMES[type],
    familyId: spec.familyId ?? id, // a part with no source heads its own family
    sourceId: spec.sourceId ?? null,
    color: normalizeColor(spec.color ?? { hex: '#ffffff', opacity: 0.35 }),
    scale: num(spec.scale, 1),
    dims: cleanDims(type, dims),
    hang: cleanHang(spec.hang),
    pose: cleanPose(spec.pose),
  }
}

function cleanDims(type, d) {
  if (type === 'blown') {
    const points = Array.isArray(d.points) && d.points.length >= 2 ? d.points.map(([r, y]) => [Math.max(0, +r || 0), Math.max(0, +y || 0)]) : DEFAULTS.blown().points
    return { profileId: d.profileId ?? null, points, wallMm: num(d.wallMm, 4), closedTop: !!d.closedTop }
  }
  if (type === 'solid') {
    const shape = SOLID_SHAPES.includes(d.shape) ? d.shape : 'sphere'
    return {
      shape,
      diameterMm: num(d.diameterMm, 60),
      lengthMm: num(d.lengthMm, 90),
      point: Math.min(1, Math.max(0, Number.isFinite(d.point) ? d.point : 0)),
      widthMm: num(d.widthMm, 60),
      depthMm: num(d.depthMm, 40),
      heightMm: num(d.heightMm, 30),
    }
  }
  return { lengthMm: num(d.lengthMm, 300), diameterMm: num(d.diameterMm, 8), pattern: CANE_PATTERNS.includes(d.pattern) ? d.pattern : 'solid' }
}

// Where the part is in the arrangement (see placement.js for meanings).
export const DEFAULT_POSE = { x: 0, y: 0, z: 0, yaw: 0, tilt: 0, tiltDir: 90, mount: 'rest', lineMm: 300, lean: null }
export function cleanPose(p = {}) {
  const f = (v, d) => (Number.isFinite(v) ? v : d)
  return {
    x: f(p.x, 0), y: f(p.y, 0), z: f(p.z, 0),
    yaw: f(p.yaw, 0), tilt: Math.min(85, Math.max(0, f(p.tilt, 0))), tiltDir: f(p.tiltDir, 90),
    mount: p.mount === 'hung' ? 'hung' : 'rest',
    lineMm: Math.max(0, f(p.lineMm, 300)),
    lean: typeof p.lean === 'string' ? p.lean : null,
  }
}

// A hanging point is optional: null means none (a hung part without one is
// flagged in the checks). Ratings are the user's numbers, in kg.
export function cleanHang(h) {
  if (!h || !HANG_KINDS.includes(h.kind)) return null
  if (h.kind === 'loop') return { kind: 'loop', loopDiaMm: num(h.loopDiaMm, 6) }
  if (h.kind === 'drilled') return { kind: 'drilled', holeDiaMm: num(h.holeDiaMm, 3), wireRatingKg: num(h.wireRatingKg, 0, -1) }
  return { kind: 'cap', capRatingKg: num(h.capRatingKg, 0, -1) }
}

// The egg / teardrop outline, foot to top, as [r, y]. point = 0 is an
// ellipsoid egg; point = 1 draws the top end out to a point (a drop that
// hangs point-up). Normalised so the widest point is exactly the diameter.
export function eggProfile(diameterMm, lengthMm, point, n = 96) {
  const raw = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const ell = Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2))
    raw.push([ell * (1 - point * t * t * 0.85), t * lengthMm])
  }
  const peak = Math.max(...raw.map((p) => p[0]))
  return raw.map(([r, y]) => [(r / peak) * (diameterMm / 2), y])
}

// The part's actual (scaled) dimensions. Uniform scale multiplies every
// length, wall thickness included.
export function scaledDims(part) {
  const s = part.scale
  const d = part.dims
  if (part.type === 'blown') return { ...d, points: d.points.map(([r, y]) => [r * s, y * s]), wallMm: d.wallMm * s }
  const out = { ...d }
  for (const k of Object.keys(out)) if (k.endsWith('Mm')) out[k] = out[k] * s
  return out
}

// Everything the checks and readouts need from one part, in its own frame.
//   volumeCm3, weightG, comMm ([x, y, z]), size ({ w, d, h } mm),
//   thickestMm, and for blown forms outerVolumeCm3 / capacityMl.
export function partMetrics(part, settings) {
  const g = partGeometry(part)
  const volumeCm3 = g.volumeMm3 / 1000
  return { ...g.extra, volumeCm3, weightG: volumeCm3 * settings.density, comMm: [0, g.comY, 0], size: g.size, thickestMm: g.thickestMm }
}

export function partGeometry(part) {
  const d = scaledDims(part)
  if (part.type === 'blown') {
    const sec = blownSection(d.points, d.wallMm, d.closedTop)
    return {
      volumeMm3: sec.volumeMm3,
      comY: sec.comY,
      size: { w: 2 * sec.maxR, d: 2 * sec.maxR, h: sec.height },
      thickestMm: d.wallMm,
      section: sec,
      extra: { outerVolumeCm3: sec.outerVolumeMm3 / 1000, capacityMl: d.closedTop ? 0 : sec.cavityVolumeMm3 / 1000 },
    }
  }
  if (part.type === 'cane') {
    const r = d.diameterMm / 2
    // A cane rod lies along x in its own frame (rods are long); the bottom
    // centre is under its middle.
    return { volumeMm3: Math.PI * r * r * d.lengthMm, comY: r, size: { w: d.lengthMm, d: d.diameterMm, h: d.diameterMm }, thickestMm: d.diameterMm, extra: {} }
  }
  switch (d.shape) {
    case 'sphere': {
      const r = d.diameterMm / 2
      return { volumeMm3: (4 / 3) * Math.PI * r ** 3, comY: r, size: { w: d.diameterMm, d: d.diameterMm, h: d.diameterMm }, thickestMm: d.diameterMm, extra: {} }
    }
    case 'egg': {
      const prof = eggProfile(d.diameterMm, d.lengthMm, d.point)
      const s = solidOfRevolution([[0, 0], ...prof, [0, d.lengthMm]])
      return { volumeMm3: s.volume, comY: s.y, size: { w: d.diameterMm, d: d.diameterMm, h: d.lengthMm }, thickestMm: d.diameterMm, extra: { profile: prof } }
    }
    case 'cylinder': {
      const r = d.diameterMm / 2
      // Standing on its end. Thickest section is the smaller of its
      // diameter and length (a coin is thin however wide it is).
      return { volumeMm3: Math.PI * r * r * d.lengthMm, comY: d.lengthMm / 2, size: { w: d.diameterMm, d: d.diameterMm, h: d.lengthMm }, thickestMm: Math.min(d.diameterMm, d.lengthMm), extra: {} }
    }
    case 'block':
    default:
      return {
        volumeMm3: d.widthMm * d.depthMm * d.heightMm,
        comY: d.heightMm / 2,
        size: { w: d.widthMm, d: d.depthMm, h: d.heightMm },
        thickestMm: Math.min(d.widthMm, d.depthMm, d.heightMm),
        extra: {},
      }
  }
}

// Sample the blown outer curve for drawing (re-exported for the UI).
export const outerCurve = (points) => sampleCurve(points).pts
