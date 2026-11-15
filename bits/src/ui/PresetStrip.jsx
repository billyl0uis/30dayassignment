import { useMemo } from 'react'
import { bodySection, footOf } from '../model/derived.js'
import { PRESETS, buildPreset } from '../model/presets.js'
import { useStore } from '../model/store.js'

// A small silhouette of each preset: its section, mirrored, standing on its
// applied foot if it has one.
function Icon({ def }) {
  const d = useMemo(() => {
    const piece = buildPreset(def)
    const sec = bodySection(def)
    const foot = footOf(piece.bits)
    const lift = foot?.lift ?? 0
    const H = sec.height + lift
    const W = Math.max(...sec.outer.map((p) => p[0]), foot?.footprint ?? 0)
    const k = 26 / Math.max(H, W * 2)
    const P = (r, y) => `${(20 + r * k).toFixed(2)} ${(29 - (y + lift) * k).toFixed(2)}`
    const half = sec.section
    const body = 'M' + half.map(([r, y]) => P(r, y)).join('L') + 'L' + [...half].reverse().map(([r, y]) => P(-r, y)).join('L') + 'Z'
    const f = foot ? `M${(20 - foot.footprint * k).toFixed(2)} 29h${(2 * foot.footprint * k).toFixed(2)}v${(-lift * k - 0.6).toFixed(2)}h${(-2 * foot.footprint * k).toFixed(2)}Z` : ''
    return body + f
  }, [def])
  return (
    <svg className="preset-icon" viewBox="0 0 40 30" aria-hidden>
      <path d={d} />
    </svg>
  )
}

export default function PresetStrip() {
  const name = useStore((s) => s.pieceName)
  const load = (def) => useStore.getState().change({ ...buildPreset(def), selected: null, selectedPoint: null, drawing: null })
  return (
    <div className="presets" role="group" aria-label="Start from a preset">
      {PRESETS.map((def) => (
        <button key={def.id} aria-label={def.name} className={'preset' + (name === def.name ? ' on' : '')} title={`${def.blurb} Loads as an editable piece (undoable).`} onClick={() => load(def)}>
          <Icon def={def} />
          {def.name}
        </button>
      ))}
    </div>
  )
}
