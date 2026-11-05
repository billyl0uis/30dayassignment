import { useEffect, useState } from 'react'
import { useStore } from '../store.js'

// A number field in mm (or any unit). Focusing it takes an undo checkpoint,
// typing updates live, so one edit is one undo step. The text is kept
// locally while typing so "4." or an empty box isn't snapped back mid-edit.
export function NumField({ label, value, unit = 'mm', min = 0.1, step = 1, digits = 1, onChange, hint }) {
  const checkpoint = useStore((s) => s.checkpoint)
  const shown = String(+value.toFixed(digits))
  const [text, setText] = useState(shown)
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (!focused) setText(shown)
  }, [shown, focused])
  return (
    <label className="num">
      <span className="field-label">{label}</span>
      <span className="num-input">
        <input
          type="number"
          value={text}
          min={min}
          step={step}
          onFocus={() => (setFocused(true), checkpoint())}
          onBlur={() => setFocused(false)}
          onChange={(e) => {
            setText(e.target.value)
            const v = Number(e.target.value)
            if (e.target.value !== '' && Number.isFinite(v) && v >= min) onChange(v)
          }}
        />
        <em>{unit}</em>
      </span>
      {hint && <small className="hint">{hint}</small>}
    </label>
  )
}

export function Slider({ label, shown, value, min, max, step, onChange }) {
  const checkpoint = useStore((s) => s.checkpoint)
  return (
    <label className="range">
      <span className="field-label">
        {label} <b>{shown}</b>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onPointerDown={checkpoint} onKeyDown={checkpoint} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  )
}

export function Segmented({ value, options, onChange, small }) {
  return (
    <div className={`segmented${small ? ' small' : ''}`} role="radiogroup">
      {options.map(([id, label]) => (
        <button key={id} role="radio" aria-checked={value === id} className={value === id ? 'on' : ''} onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
    </div>
  )
}
