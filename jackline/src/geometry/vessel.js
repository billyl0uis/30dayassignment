import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// Turns a section (see profile.js) into meshes. The spout faces +x and the
// handle -x, so the seam of the lathe hides at the back (-z).
export const SPOUT_AT = Math.PI / 2

const FULL = { segments: 96, start: Math.PI, length: Math.PI * 2 }
// Cutaway keeps the back half (z < 0) so the cut faces look at the camera.
const HALF = { segments: 48, start: Math.PI / 2, length: Math.PI }

// Lathing a path with sharp corners in it smears the shading across them,
// so split the path at corners and lathe each smooth run on its own.
function splitAtCorners(path, maxDeg = 38) {
  const pts = path.filter((p, i) => i === 0 || Math.hypot(p[0] - path[i - 1][0], p[1] - path[i - 1][1]) > 1e-5)
  const runs = []
  let run = [pts[0]]
  const cos = Math.cos(THREE.MathUtils.degToRad(maxDeg))
  for (let i = 1; i < pts.length; i++) {
    run.push(pts[i])
    if (i === pts.length - 1) break
    const a = [pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]
    const b = [pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]]
    const d = (a[0] * b[0] + a[1] * b[1]) / (Math.hypot(...a) * Math.hypot(...b))
    if (d < cos) {
      runs.push(run)
      run = [pts[i]]
    }
  }
  if (run.length > 1) runs.push(run)
  return runs
}

function lathe(run, cut, deform) {
  const opts = cut ? HALF : FULL
  const geo = new THREE.LatheGeometry(run.map(([r, y]) => new THREE.Vector2(Math.max(r, 0), y)), opts.segments, opts.start, opts.length)
  if (deform) deform(geo)
  geo.computeVertexNormals()
  if (!cut) closeSeam(geo, run.length, opts.segments)
  return geo
}

// The first and last rings of a full lathe sit on top of each other but get
// separate normals; average them so the seam doesn't show as a line.
function closeSeam(geo, np, segments) {
  const n = geo.attributes.normal
  const v = new THREE.Vector3()
  for (let j = 0; j < np; j++) {
    const a = j, b = segments * np + j
    v.set(n.getX(a) + n.getX(b), n.getY(a) + n.getY(b), n.getZ(a) + n.getZ(b)).normalize()
    n.setXYZ(a, v.x, v.y, v.z)
    n.setXYZ(b, v.x, v.y, v.z)
  }
}

// The flat faces where the cutaway slices through: the section itself on the
// right, and its mirror on the left.
function caps(poly) {
  const right = new THREE.ShapeGeometry(new THREE.Shape(poly.map(([r, y]) => new THREE.Vector2(r, y))))
  const left = new THREE.ShapeGeometry(new THREE.Shape(poly.map(([r, y]) => new THREE.Vector2(-r, y))))
  return [right, left]
}

// A pulled lip: near the rim and around +x, push the wall out and up.
// Inner and outer walls move together, so the wall keeps its thickness.
export function spoutDeform(sec) {
  const top = sec.outer[sec.outer.length - 1][1]
  const depth = THREE.MathUtils.clamp(sec.height * 0.2, 1.5, 4)
  const amount = THREE.MathUtils.clamp(sec.outer[sec.outer.length - 1][0] * 0.32, 0.8, 2.4)
  const width = 0.6
  return (geo) => {
    const p = geo.attributes.position
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
      const t = (y - (top - depth)) / depth
      if (t <= 0) continue
      let d = Math.atan2(x, z) - SPOUT_AT
      d = Math.atan2(Math.sin(d), Math.cos(d))
      if (Math.abs(d) >= width) continue
      const r = Math.hypot(x, z)
      if (r < 1e-4) continue
      const f = Math.cos(((d / width) * Math.PI) / 2) ** 2 * Math.min(t, 1.2) ** 2
      const k = (r + amount * f) / r
      p.setXYZ(i, x * k, y + amount * 0.35 * f, z * k)
    }
  }
}

function handleGeometry(handle) {
  const curve = new THREE.CatmullRomCurve3(handle.points.map(([x, y]) => new THREE.Vector3(x, y, 0)), false, 'centripetal')
  const tube = new THREE.TubeGeometry(curve, 72, handle.radius, 14)
  // Glassblowers attach a handle with a gob at each end; so do we.
  const blobs = [0, 1].map((t) => {
    const g = new THREE.SphereGeometry(handle.radius * 1.45, 18, 12)
    const p = curve.getPoint(t)
    g.translate(p.x, p.y, p.z)
    return g
  })
  return [tube, ...blobs]
}

// The cut faces come back separately so they can be drawn solid, like the
// hatched wall in a section drawing.
export function glassGeometry(sec, { handle, spout, cut }) {
  const deform = spout ? spoutDeform(sec) : null
  const parts = splitAtCorners(sec.section).map((run) => lathe(run, cut, deform))
  if (handle) parts.push(...handleGeometry(handle))
  const body = mergeGeometries(parts, false)
  parts.forEach((g) => g.dispose())
  if (!cut) return { body, cut: null }
  const faces = caps(sec.section)
  if (deform) faces.forEach(deform)
  const cutFaces = mergeGeometries(faces, false)
  faces.forEach((g) => g.dispose())
  return { body, cut: cutFaces }
}
