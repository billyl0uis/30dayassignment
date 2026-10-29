import { useEffect, useRef, useState } from 'react'

// A text box that shows a value but only commits when you press Enter or leave
// it. Typing is never required: everything here also has a handle or slider.
export function NumberField({ label, value, format, parse, suffix, onCommit }) {
  const [text, setText] = useState(format(value))
  const [editing, setEditing] = useState(false)
  const [bad, setBad] = useState(false)
  useEffect(() => {
    if (!editing) setText(format(value))
  }, [value, format, editing])

  const commit = () => {
    setEditing(false)
    const v = parse(text)
    if (v == null) {
      setBad(true)
      setTimeout(() => setBad(false), 600)
      setText(format(value))
      return
    }
    onCommit(v)
  }
  return (
    <label className={`field${bad ? ' bad' : ''}`}>
      <span className="field-label">{label}</span>
      <span className="field-box">
        <input
          aria-label={suffix ? `${label} (${suffix})` : label}
          value={text}
          inputMode="decimal"
          onFocus={(e) => {
            setEditing(true)
            e.target.select()
          }}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.target.blur()
            if (e.key === 'Escape') {
              setText(format(value))
              setEditing(false)
              setTimeout(() => e.target.blur())
            }
          }}
        />
        {suffix && <span className="field-suffix">{suffix}</span>}
      </span>
    </label>
  )
}

// A slider that previews live while dragging and lands as one undo step.
export function DraftRange({ label, value, min, max, step = 1, display, onDraft, onCommit }) {
  return (
    <label className="range">
      <span className="field-label">
        {label}
        <b>{display ?? value}</b>
      </span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onDraft(Number(e.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        onBlur={onCommit}
      />
    </label>
  )
}

// The native color picker fires "input" while you drag around it and
// "change" once you settle, which maps neatly onto draft vs commit.
export function ColorInput({ value, onDraft, onCommit }) {
  const ref = useRef()
  useEffect(() => {
    const el = ref.current
    const done = () => onCommit(el.value)
    el.addEventListener('change', done)
    return () => el.removeEventListener('change', done)
  }, [onCommit])
  return (
    <label className="swatch custom" title="Any color">
      <input ref={ref} type="color" value={value} onChange={(e) => onDraft(e.target.value)} />
    </label>
  )
}

export function Segmented({ value, options, onChange, small }) {
  return (
    <div className={`segmented${small ? ' small' : ''}`} role="radiogroup">
      {options.map(([v, label]) => (
        <button key={v} role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  )
}
