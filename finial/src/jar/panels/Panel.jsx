export function Panel({ title, children, className = '' }) {
  return (
    <section className={`grid gap-3 rounded-lg border border-line bg-panel p-3 ${className}`}>
      <h2 className="text-sm font-semibold text-mute">{title}</h2>
      {children}
    </section>
  )
}

// A small plain-number box (a ratio, a count), for values with no units.
export function NumberField({ label, value, onChange, min, step = 1 }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-mute">{label}</span>
      <input
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={(e) => e.target.value !== '' && Number(e.target.value) >= min && onChange(Number(e.target.value))}
        className="w-20 rounded border border-line bg-raise px-2 py-1 font-mono text-ink outline-none focus:border-accent"
      />
    </label>
  )
}
