// Triangle meshes for every part, in plain JS so the placement maths and the
// renderer use exactly the same shape. Local frame: mm, origin at the bottom
// centre, y up. Two detail levels: 'render' (smooth) and 'collide' (coarse,
// for snapping and footprints).
//
// A mesh is { positions: Float32Array (xyz…), indices: Uint32Array }.
import { partGeometry, scaledDims } from './parts.js'

const DETAIL = {
  render: { segs: 64, step: 1 },
  collide: { segs: 24, step: 3 },
}

// Spin a profile ([r, y] pairs) around the y axis. The profile is split at
// sharp corners into strips that don't share vertices, so a cylinder's rim
// stays crisp when normals are computed (instead of going soft and blobby).
export function lathe(profile, segs, { closed = false } = {}) {
  const strips = splitAtCorners(closed ? [...profile, profile[0]] : profile)
  const pos = []
  const idx = []
  for (const strip of strips) {
    const base = pos.length / 3
    for (const [r, y] of strip) {
      for (let s = 0; s < segs; s++) {
        const a = (s / segs) * Math.PI * 2
        pos.push(r * Math.cos(a), y, -r * Math.sin(a))
      }
    }
    for (let i = 0; i < strip.length - 1; i++) {
      for (let s = 0; s < segs; s++) {
        const s2 = (s + 1) % segs
        const a = base + i * segs + s, b = base + i * segs + s2
        const c = base + (i + 1) * segs + s, d = base + (i + 1) * segs + s2
        idx.push(a, b, d, a, d, c)
      }
    }
  }
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx) }
}

function splitAtCorners(pts, limitDeg = 40) {
  const strips = [[pts[0]]]
  for (let i = 1; i < pts.length; i++) {
    strips[strips.length - 1].push(pts[i])
    if (i < pts.length - 1) {
      const a = pts[i - 1], b = pts[i], c = pts[i + 1]
      const u = [b[0] - a[0], b[1] - a[1]], v = [c[0] - b[0], c[1] - b[1]]
      const lu = Math.hypot(...u), lv = Math.hypot(...v)
      if (lu < 1e-9 || lv < 1e-9) continue
      const cos = (u[0] * v[0] + u[1] * v[1]) / (lu * lv)
      if (cos < Math.cos((limitDeg * Math.PI) / 180)) strips.push([pts[i]])
    }
  }
  return strips
}

function box(w, d, h) {
  const x = w / 2, z = d / 2
  // 24 vertices (4 per face) so every face is flat-shaded.
  const faces = [
    [[x, 0, z], [x, 0, -z], [x, h, -z], [x, h, z]],
    [[-x, 0, -z], [-x, 0, z], [-x, h, z], [-x, h, -z]],
    [[-x, h, z], [x, h, z], [x, h, -z], [-x, h, -z]],
    [[-x, 0, -z], [x, 0, -z], [x, 0, z], [-x, 0, z]],
    [[-x, 0, z], [x, 0, z], [x, h, z], [-x, h, z]],
    [[x, 0, -z], [-x, 0, -z], [-x, h, -z], [x, h, -z]],
  ]
  const pos = [], idx = []
  faces.forEach((f, i) => {
    for (const p of f) pos.push(...p)
    idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3)
  })
  return { positions: new Float32Array(pos), indices: new Uint32Array(idx) }
}

const thin = (pts, step) => (step <= 1 ? pts : pts.filter((_, i) => i % step === 0 || i === pts.length - 1))

export function partMesh(part, detail = 'render') {
  const { segs, step } = DETAIL[detail]
  const g = partGeometry(part)
  const d = scaledDims(part)
  if (part.type === 'blown') return lathe(thin(g.section.section, step), segs, { closed: true })
  if (part.type === 'cane') {
    const r = d.diameterMm / 2, L = d.lengthMm
    const m = lathe([[0, -L / 2], [r, -L / 2], [r, L / 2], [0, L / 2]], Math.max(12, segs / 2))
    // Lay it along x, resting on the table: (x, y, z) → (y, x + r, z).
    const p = m.positions
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i], y = p[i + 1]
      p[i] = y
      p[i + 1] = x + r
    }
    // Swapping two axes mirrors the mesh; flip the winding to keep normals out.
    for (let i = 0; i < m.indices.length; i += 3) [m.indices[i + 1], m.indices[i + 2]] = [m.indices[i + 2], m.indices[i + 1]]
    return m
  }
  switch (d.shape) {
    case 'sphere': {
      const r = d.diameterMm / 2, n = detail === 'render' ? 48 : 14
      const prof = Array.from({ length: n + 1 }, (_, i) => {
        const a = -Math.PI / 2 + (Math.PI * i) / n
        return [i === 0 || i === n ? 0 : r * Math.cos(a), r + r * Math.sin(a)]
      })
      return lathe(prof, segs)
    }
    case 'egg':
      return lathe(thin([[0, 0], ...g.extra.profile.slice(1, -1), [0, d.lengthMm]], step), segs)
    case 'cylinder': {
      const r = d.diameterMm / 2
      return lathe([[0, 0], [r, 0], [r, d.lengthMm], [0, d.lengthMm]], segs)
    }
    default:
      return box(d.widthMm, d.depthMm, d.heightMm)
  }
}
