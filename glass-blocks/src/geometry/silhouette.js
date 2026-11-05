import { PRESETS } from './presets.js'
import { buildProfile } from './build.js'

// Little side-view drawings for the shape buttons, in a 40 × 40 box.
const BOX = 40
const PAD = 4

function fit(points) {
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1])
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  const s = (BOX - PAD * 2) / Math.max(maxX - minX, maxY - minY)
  const ox = (BOX - (maxX - minX) * s) / 2, oy = (BOX - (maxY - minY) * s) / 2
  return points.map(([x, y]) => [ox + (x - minX) * s, BOX - (oy + (y - minY) * s)])
}
const path = (pts) => 'M' + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L') + 'Z'

const DRAWN = {
  torus: { d: 'M4 20a16 8 0 1 0 32 0a16 8 0 1 0-32 0ZM13 20a7 2.6 0 1 0 14 0a7 2.6 0 1 0-14 0Z', fillRule: 'evenodd' },
  tooth: { d: 'M9 7Q12.5 3 16 6.5Q20 3.5 24 6.5Q27.5 3 31 7Q34.5 14 30.5 20.5L29 34Q27 38.5 25 34L22.5 25Q20 22.5 17.5 25L15 34Q13 38.5 11 34L9.5 20.5Q5.5 14 9 7Z' },
}

export function silhouette(preset) {
  const def = PRESETS[preset]
  if (DRAWN[preset]) return DRAWN[preset]
  const { w, h } = def.size
  if (def.kind === 'revolve') {
    const prof = buildProfile(preset, { w, h, taper: 1 })
    const right = prof.map(([r, y]) => [r, y])
    const left = [...prof].reverse().map(([r, y]) => [-r, y])
    return { d: path(fit([...right, ...left])) }
  }
  if (def.kind === 'coil') {
    const pts = []
    for (let i = 0; i <= 120; i++) {
      const s = i / 120
      pts.push([(w / 2) * Math.cos(s * 6 * Math.PI), s * h])
    }
    const f = fit(pts)
    return { d: 'M' + f.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L'), stroke: true }
  }
  if (def.kind === 'horn') {
    const a = [], b = []
    for (let i = 0; i <= 40; i++) {
      const s = i / 40
      const cx = 0.38 * h * s * s, cy = h * s
      const tx = 0.76 * h * s, ty = h
      const l = Math.hypot(tx, ty)
      const r = (w / 2) * (1 - s) ** 0.9 + 0.04
      a.push([cx + (ty / l) * r, cy - (tx / l) * r])
      b.push([cx - (ty / l) * r, cy + (tx / l) * r])
    }
    return { d: path(fit([...a, ...b.reverse()])) }
  }
  return { d: '' }
}
