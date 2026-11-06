import { useStore } from '../model/store.js'

// A slider whose whole drag is one step of undo.
export default function Slider({ label, value, shown, min, max, step, onChange }) {
  const checkpoint = useStore((s) => s.checkpoint)
  return (
    <label className="range">
      <span className="field-label">
        {label} <b>{shown}</b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={checkpoint}
        onKeyDown={checkpoint}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}
