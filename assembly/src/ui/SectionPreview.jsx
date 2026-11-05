import { useStore } from '../store.js'
import { partGeometry, partMetrics, scaledDims } from '../core/parts.js'

// A cut through the middle of the selected part, drawn to scale on a 1 cm
// grid: the glass in section, tinted, with its size and centre of mass.
export default function SectionPreview() {
  const { scene, selectedId } = useStore()
  const part = scene.parts.find((p) => p.id === selectedId)
  if (!part) return <div className="preview empty">No part selected</div>

  const g = partGeometry(part)
  const m = partMetrics(part, scene.settings)
  const d = scaledDims(part)
  const shapes = sectionShapes(part, g, d) // arrays of [x, y] in mm, y up
  const all = shapes.flat()
  const minX = Math.min(...all.map((p) => p[0])), maxX = Math.max(...all.map((p) => p[0]))
  const maxY = Math.max(...all.map((p) => p[1]))
  const pad = Math.max(maxX - minX, maxY) * 0.18 + 10
  const vb = [minX - pad, -maxY - pad, maxX - minX + 2 * pad, maxY + 2 * pad]
  const toPath = (pts) => `M${pts.map(([x, y]) => `${x.toFixed(2)},${(-y).toFixed(2)}`).join('L')}Z`
  const grid = []
  for (let x = Math.floor(vb[0] / 10) * 10; x <= vb[0] + vb[2]; x += 10) grid.push(<line key={`x${x}`} x1={x} x2={x} y1={vb[1]} y2={vb[1] + vb[3]} className={x % 50 === 0 ? 'g-major' : 'g-minor'} />)
  for (let y = Math.floor(vb[1] / 10) * 10; y <= vb[1] + vb[3]; y += 10) grid.push(<line key={`y${y}`} y1={y} y2={y} x1={vb[0]} x2={vb[0] + vb[2]} className={y % 50 === 0 ? 'g-major' : 'g-minor'} />)
  const fs = vb[3] / 32
  const fillOpacity = 0.18 + part.color.opacity * 0.6

  return (
    <div className="preview">
      <svg viewBox={vb.join(' ')} preserveAspectRatio="xMidYMid meet">
        <g>{grid}</g>
        <line className="table" x1={vb[0]} x2={vb[0] + vb[2]} y1={0} y2={0} />
        {part.type !== 'cane' && d.shape !== 'block' &&<line className="axis" x1={0} x2={0} y1={8} y2={-maxY - 8} />}
        {shapes.map((s, i) => (
          <path key={i} d={toPath(s)} className="section" style={{ fill: part.color.hex, fillOpacity }} />
        ))}
        <g className="com" transform={`translate(0 ${-m.comMm[1]})`}>
          <circle r={fs * 0.35} />
          <line x1={-fs * 0.7} x2={fs * 0.7} />
          <line y1={-fs * 0.7} y2={fs * 0.7} />
        </g>
        <g className="dims" fontSize={fs}>
          <text x={(minX + maxX) / 2} y={fs * 1.4} textAnchor="middle">{m.size.w.toFixed(0)} mm</text>
          <text x={maxX + fs * 0.6} y={-maxY / 2} dominantBaseline="middle">{m.size.h.toFixed(0)} mm</text>
          <text x={0} y={-m.comMm[1] - fs * 0.9} textAnchor="middle" className="com-label">centre of mass</text>
        </g>
      </svg>
    </div>
  )
}

const mirror = (pts) => pts.map(([x, y]) => [-x, y]).reverse()

// The glass in section. A revolved part's section is its half-section and
// its mirror image; a hollow part shows as two separate walls.
function sectionShapes(part, g, d) {
  if (part.type === 'blown') {
    const s = g.section.section
    return [s, mirror(s)]
  }
  if (part.type === 'cane') {
    const L = d.lengthMm, r = d.diameterMm / 2
    return [[[-L / 2, 0], [L / 2, 0], [L / 2, 2 * r], [-L / 2, 2 * r]]]
  }
  if (d.shape === 'sphere') {
    const r = d.diameterMm / 2
    return [Array.from({ length: 96 }, (_, i) => [r * Math.cos((i / 96) * 2 * Math.PI), r + r * Math.sin((i / 96) * 2 * Math.PI)])]
  }
  if (d.shape === 'egg') {
    const half = g.extra.profile
    return [[...half, ...mirror(half)]]
  }
  if (d.shape === 'cylinder') {
    const r = d.diameterMm / 2
    return [[[-r, 0], [r, 0], [r, d.lengthMm], [-r, d.lengthMm]]]
  }
  const w = d.widthMm / 2
  return [[[-w, 0], [w, 0], [w, d.heightMm], [-w, d.heightMm]]]
}
