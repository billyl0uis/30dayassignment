import { LengthField } from '@core/ui/LengthField'
import { formatLength } from '@core/model/units'
import { CLOSURE_TYPES, emptyClosure, fieldsFor, hardwareFit, missingFields, stopperTaper } from '../model/closures.js'
import { Choice, Note, OptionalLength, Panel, Readout } from './fields.jsx'
import { StopperDrawing } from './StopperDrawing.jsx'

const TYPE_NAMES = Object.fromEntries(Object.entries(CLOSURE_TYPES).map(([k, v]) => [k, v.name]))
const MEASURED = [
  ['neckOD', 'Neck outside ⌀'],
  ['boreD', 'Bore'],
  ['finishHeight', 'Finish height'],
]

export function ClosurePanel({ design, update, units, neck, dauberRoom }) {
  const c = design.closure
  const def = CLOSURE_TYPES[c.type]
  const set = (key) => (value) => update({ closure: { ...c, [key]: value } })
  const missing = missingFields(c)
  const taper = c.type === 'stopper' ? stopperTaper(c) : null
  const measured = design.measured ?? {}
  const fit = c.type === 'hardware' ? hardwareFit(c, measured) : []

  return (
    <Panel title="Neck and closure">
      <Choice label="Closure" value={c.type} options={TYPE_NAMES} onChange={(type) => type && update({ closure: emptyClosure(type) }, { retemplate: true })} />
      <Note>{def.note}</Note>

      <div className="grid grid-cols-2 gap-3">
        {fieldsFor(c).map((f) => {
          if (f.kind === 'length') return <OptionalLength key={f.key} label={f.label} mm={c[f.key]} units={units} hint={f.hint} onChange={set(f.key)} />
          if (f.kind === 'choice') return <Choice key={f.key} label={f.label} value={c[f.key]} options={f.options} onChange={set(f.key)} />
          if (f.kind === 'flag')
            return (
              <label key={f.key} className="flex items-center gap-2 self-end pb-1 text-sm text-mute">
                <input type="checkbox" checked={!!c[f.key]} onChange={(e) => set(f.key)(e.target.checked)} className="accent-accent" />
                {f.label}
              </label>
            )
          return (
            <label key={f.key} className="col-span-2 grid gap-1 text-sm">
              <span className="text-mute">{f.label}</span>
              <input
                value={c[f.key] ?? ''}
                placeholder="TODO"
                onChange={(e) => set(f.key)(e.target.value || null)}
                className="rounded border border-line bg-raise px-2 py-1 text-ink outline-none placeholder:text-caution/80 focus:border-accent"
              />
            </label>
          )
        })}
      </div>

      <LengthField label="Neck length (shoulder to mouth)" mm={design.neckLength} units={units} min={1} onChange={(neckLength) => update({ neckLength })} />
      {!neck.placeholder && neck.boreDepth > design.neckLength + 0.01 && (
        <Note tone="caution">The fitted length ({formatLength(neck.boreDepth, units)}) is longer than the neck. Lengthen the neck or it runs into the shoulder.</Note>
      )}

      {missing.length > 0 && (
        <Note tone="caution">
          Placeholder neck from the starting sketch, not from your closure. Still to fill in: {missing.map((f) => f.label).join(', ')}.
        </Note>
      )}

      {taper && (
        <Readout
          rows={[
            ['Taper, each side', `${taper.halfAngle.toFixed(2)}°`],
            ['Taper, included', `${taper.included.toFixed(2)}°`],
            ['Length per 1 mm of ⌀', Number.isFinite(taper.lengthPerMm) ? `${taper.lengthPerMm.toFixed(1)} mm` : 'straight'],
          ]}
        />
      )}
      {c.type === 'stopper' && c.dauber && c.dauberLength != null && dauberRoom != null && (
        <Readout
          rows={[
            ['Room below the neck for the dauber', formatLength(dauberRoom, units)],
            ['Dauber', formatLength(c.dauberLength, units), c.dauberLength > dauberRoom ? 'risk' : null],
          ]}
        />
      )}
      {c.type === 'stopper' && <StopperDrawing stopper={c} units={units} />}

      {c.type === 'hardware' && (
        <div className="grid gap-2 border-t border-line pt-3">
          <h3 className="text-xs font-semibold text-mute">Check a neck as made (measured off the piece)</h3>
          <div className="grid grid-cols-3 gap-2">
            {MEASURED.map(([key, label]) => (
              <OptionalLength key={key} label={label} mm={measured[key] ?? null} units={units} onChange={(v) => update({ measured: { ...measured, [key]: v } })} />
            ))}
          </div>
          {fit.length > 0 && (
            <Readout
              rows={fit.map((row) => [
                row.label,
                `${row.off >= 0 ? '+' : '−'}${formatLength(Math.abs(row.off), units, 2)} ${row.ok === null ? '· no tolerance' : row.ok ? '· fits' : '· out'}`,
                row.ok === false ? 'risk' : row.ok === null ? 'todo' : null,
              ])}
            />
          )}
        </div>
      )}
    </Panel>
  )
}
