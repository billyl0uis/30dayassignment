import { useMemo } from 'react'
import { sampleCurve } from '../geometry/profile.js'
import { PRESETS } from '../model/presets.js'
import { useStore } from '../model/store.js'

// Little side views of each starting form, drawn from the same curve code.
function Icon({ points }) {
  const path = useMemo(() => {
    const { pts } = sampleCurve(points, { perSeg: 8 })
    const H = Math.max(...pts.map((p) => p[1]))
    const R = Math.max(...pts.map((p) => p[0]))
    const s = 30 / Math.max(H, R * 2)
    const right = pts.map(([r, y]) => [18 + r * s, 34 - y * s])
    const left = [...pts].reverse().map(([r, y]) => [18 - r * s, 34 - y * s])
    return 'M' + [...left, ...right].map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L')
  }, [points])
  return (
    <svg viewBox="0 0 36 36" width="36" height="36" className="preset-icon">
      <path d={path} />
    </svg>
  )
}

export default function PresetStrip() {
  const current = useStore((s) => s.preset)
  const loadPreset = useStore((s) => s.loadPreset)
  return (
    <nav className="presets" aria-label="Start from">
      {Object.entries(PRESETS).map(([id, p]) => (
        <button key={id} className={'preset' + (id === current ? ' on' : '')} onClick={() => loadPreset(id)}>
          <Icon points={p.points} />
          <span>{p.name}</span>
        </button>
      ))}
    </nav>
  )
}
