import { useEffect, useState } from 'react'
import { useStore } from '../model/store.js'

// The studio's own limits for the color checks. Saved, not undone.
export default function CheckLimits() {
  const studio = useStore((s) => s.studio)
  const setStudio = useStore((s) => s.setStudio)
  return (
    <details className="library limits">
      <summary>Color check limits</summary>
      <div className="lib-grid">
        <Num label="Thinnest seam wall (mm)" value={+(studio.minSeamWall * 10).toFixed(2)} step={0.5} onChange={(v) => setStudio({ minSeamWall: v / 10 })} />
        <Num label="Most incalmo joins" value={studio.maxJoins} step={1} onChange={(v) => setStudio({ maxJoins: Math.round(v) })} />
        <Num label="Most color steps per gather" value={studio.maxStack} step={1} onChange={(v) => setStudio({ maxStack: Math.round(v) })} />
        <Num label="COE tolerance (±)" value={studio.coeTolerance} step={0.1} onChange={(v) => setStudio({ coeTolerance: v })} />
      </div>
      <Pairs pairs={studio.reactivePairs} onChange={(reactivePairs) => setStudio({ reactivePairs })} />
    </details>
  )
}

function Num({ label, value, step, onChange }) {
  return (
    <label className="lib-field">
      <span>{label}</span>
      <input
        type="number"
        min="0"
        step={step}
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (e.target.value !== '' && Number.isFinite(v) && v >= 0) onChange(v)
        }}
      />
    </label>
  )
}

// One pair per line, "copper + sulfur-selenium". Tags match the reactive
// tags on library colors, case-insensitively.
function Pairs({ pairs, onChange }) {
  const joined = pairs.map((p) => p.join(' + ')).join('\n')
  const [text, setText] = useState(joined)
  useEffect(() => setText(joined), [joined])
  const commit = () =>
    onChange(
      text
        .split('\n')
        .map((l) => l.split('+').map((t) => t.trim().toLowerCase()).filter(Boolean))
        .filter((p) => p.length === 2),
    )
  return (
    <label className="lib-field">
      <span>Reactive pairs (one per line, tag + tag)</span>
      <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} />
    </label>
  )
}
