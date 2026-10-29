import { useId, useState } from 'react'
import { formatLength, lengthValue, parseLength } from '@core/model/units'

// A titled box on the side panel.
export function Panel({ title, children, aside }) {
  return (
    <section className="grid gap-3 rounded-lg border border-line bg-panel p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-mute">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

const inputClass = (invalid) =>
  `w-24 rounded border bg-raise px-2 py-1 font-mono text-ink outline-none placeholder:text-caution/80 focus:border-accent ${invalid ? 'border-danger' : 'border-line'}`

// Like the core's LengthField, but a size can be empty: a closure size
// nobody has typed in yet shows as TODO, never as a made-up number.
export function OptionalLength({ label, mm, units, onChange, hint }) {
  const id = useId()
  const [draft, setDraft] = useState(null)
  const shown = mm == null ? '' : lengthValue(mm, units)
  const parsed = draft === null || draft.trim() === '' ? mm : parseLength(draft, units)
  const invalid = draft !== null && draft.trim() !== '' && (parsed === null || parsed <= 0)
  return (
    <label htmlFor={id} className="grid gap-1 text-sm">
      <span className="text-mute">{label}</span>
      <span className="flex items-center gap-2">
        <input
          id={id}
          inputMode="decimal"
          placeholder="TODO"
          value={draft ?? shown}
          aria-invalid={invalid}
          onFocus={() => setDraft(shown)}
          onChange={(event) => {
            const text = event.target.value
            setDraft(text)
            if (text.trim() === '') return onChange(null)
            const next = parseLength(text, units)
            if (next !== null && next > 0) onChange(next)
          }}
          onBlur={() => setDraft(null)}
          className={inputClass(invalid)}
        />
        <span className="font-mono text-faint">{units}</span>
        {units === 'in' && mm != null && !invalid && <span className="font-mono text-mute">{formatLength(mm, 'in')}</span>}
      </span>
      {hint && <span className="text-xs text-faint">{hint}</span>}
    </label>
  )
}

// A plain number (a percent, ml, a ratio), empty allowed.
export function NumberField({ label, value, unit, onChange, hint, min = 0, placeholder = 'TODO' }) {
  const id = useId()
  return (
    <label htmlFor={id} className="grid gap-1 text-sm">
      <span className="text-mute">{label}</span>
      <span className="flex items-center gap-2">
        <input
          id={id}
          type="number"
          min={min}
          step="any"
          placeholder={placeholder}
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
          className={inputClass(false)}
        />
        {unit && <span className="font-mono text-faint">{unit}</span>}
      </span>
      {hint && <span className="text-xs text-faint">{hint}</span>}
    </label>
  )
}

export function Choice({ label, value, options, onChange }) {
  const id = useId()
  return (
    <label htmlFor={id} className="grid gap-1 text-sm">
      <span className="text-mute">{label}</span>
      <select
        id={id}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || null)}
        className={`rounded border border-line bg-raise px-2 py-1 text-ink outline-none focus:border-accent ${value ? '' : 'text-caution'}`}
      >
        <option value="">TODO: choose</option>
        {Object.entries(options).map(([key, name]) => (
          <option key={key} value={key}>
            {name}
          </option>
        ))}
      </select>
    </label>
  )
}

// Label/value rows.
export function Readout({ rows }) {
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
      {rows.map(([name, value, tone]) => (
        <div key={name} className="contents">
          <dt className="text-faint">{name}</dt>
          <dd className={`text-right font-mono ${tone === 'risk' ? 'text-danger' : tone === 'todo' ? 'text-caution' : ''}`}>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

export const Note = ({ children, tone }) => (
  <p className={`rounded border px-2 py-1.5 text-xs ${tone === 'caution' ? 'border-caution/40 text-caution' : 'border-line text-faint'}`}>{children}</p>
)
