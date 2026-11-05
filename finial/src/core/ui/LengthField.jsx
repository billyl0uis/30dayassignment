import { useId, useState } from 'react'
import { formatLength, lengthValue, parseLength } from '../model/units'

// A length input that shows the chosen units and always hands back mm.
// Takes "1 3/8", "35mm" and the like (parseLength). What's typed is kept
// while the box has focus; on leaving it, the box goes back to the value.
export function LengthField({ label, mm, units, onChange, min = 0, hint, disabled = false }) {
  const id = useId()
  const [draft, setDraft] = useState(null)
  const parsed = draft === null ? mm : parseLength(draft, units)
  const invalid = draft !== null && (parsed === null || parsed < min)

  return (
    <label htmlFor={id} className="grid gap-1 text-sm">
      <span className="text-mute">{label}</span>
      <span className="flex items-center gap-2">
        <input
          id={id}
          inputMode="decimal"
          disabled={disabled}
          value={draft ?? lengthValue(mm, units)}
          aria-invalid={invalid}
          onFocus={() => setDraft(lengthValue(mm, units))}
          onChange={(event) => {
            setDraft(event.target.value)
            const next = parseLength(event.target.value, units)
            if (next !== null && next >= min) onChange(next)
          }}
          onBlur={() => setDraft(null)}
          className={`w-20 min-w-0 rounded border bg-raise px-2 py-1 font-mono text-ink outline-none focus:border-accent disabled:opacity-50 ${
            invalid ? 'border-danger' : 'border-line'
          }`}
        />
        <span className="font-mono text-faint">{units}</span>
      </span>
      {/* The decimal as the fraction you'd read off a ruler. */}
      {units === 'in' && !invalid && <span className="font-mono text-xs text-mute">= {formatLength(parsed, 'in')}</span>}
      {hint && <span className="text-xs text-faint">{hint}</span>}
    </label>
  )
}
