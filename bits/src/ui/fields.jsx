import { useStore } from '../model/store.js'
import { fromShown, toShown, unitLabel } from '../model/units.js'

// A length in the store's cm, shown and typed in mm or inches. Focusing the
// field is the start of one undo step; every keystroke after is live.
export function LengthField({ label, cm, onLive, min = 0, max = 100, hint }) {
  const units = useStore((s) => s.units)
  const shown = toShown(cm, units)
  const step = units === 'in' ? 0.01 : 0.5
  return (
    <label className="field" title={hint}>
      <span>{label}</span>
      <input
        type="number"
        value={Number(shown.toFixed(units === 'in' ? 3 : 1))}
        step={step}
        min={toShown(min, units)}
        max={toShown(max, units)}
        onFocus={() => useStore.getState().checkpoint()}
        onChange={(e) => {
          const v = parseFloat(e.target.value)
          if (Number.isFinite(v)) onLive(Math.min(max, Math.max(min, fromShown(v, units))))
        }}
      />
      <em>{unitLabel(units)}</em>
    </label>
  )
}

// A plain number (a count, a ratio, an angle) with a slider. Not a length, so no units switch.
export function NumberSlider({ label, value, min, max, step, unit, onLive }) {
  const checkpoint = () => useStore.getState().checkpoint()
  const take = (raw) => {
    const v = parseFloat(raw)
    if (Number.isFinite(v)) onLive(Math.min(max, Math.max(min, v)))
  }
  return (
    <div className="slider">
      <label className="field">
        <span>{label}</span>
        <input type="number" value={value} min={min} max={max} step={step} onFocus={checkpoint} onChange={(e) => take(e.target.value)} />
        <em>{unit ?? ''}</em>
      </label>
      <input type="range" min={min} max={max} step={step} value={value} aria-label={label}
        onPointerDown={checkpoint} onKeyDown={checkpoint} onChange={(e) => take(e.target.value)} />
    </div>
  )
}

// A slider plus its number, for shaping a bit. Same undo rule: the grab is one step.
export function LengthSlider({ label, cm, min, max, step, onLive }) {
  const units = useStore((s) => s.units)
  const checkpoint = () => useStore.getState().checkpoint()
  return (
    <div className="slider">
      <LengthField label={label} cm={cm} onLive={onLive} min={min} max={max} />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={cm}
        aria-label={`${label} (${unitLabel(units)})`}
        onPointerDown={checkpoint}
        onKeyDown={checkpoint}
        onChange={(e) => onLive(parseFloat(e.target.value))}
      />
    </div>
  )
}
