// Millimetres or inches, for every length the app shows. A quiet text
// toggle: the current one underlined.
export function UnitsSwitch({ units, onChange, className = '' }) {
  return (
    <div className={`inline-flex items-center gap-0.5 font-mono text-sm ${className}`} role="group" aria-label="Units">
      {['mm', 'in'].map((key, index) => (
        <span key={key} className="inline-flex items-center gap-0.5">
          {index > 0 && (
            <span aria-hidden="true" className="text-faint">
              /
            </span>
          )}
          <button
            type="button"
            aria-pressed={units === key}
            onClick={() => onChange(key)}
            title={key === 'mm' ? 'Show lengths in millimetres' : 'Show lengths in inches'}
            className={`min-h-9 px-1 font-semibold underline-offset-[6px] decoration-2 ${
              units === key ? 'text-ink underline decoration-accent' : 'text-mute hover:text-ink'
            }`}
          >
            {key}
          </button>
        </span>
      ))}
    </div>
  )
}
