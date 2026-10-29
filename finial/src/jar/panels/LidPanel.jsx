import { formatLength } from '@core/model/units'
import { LengthField } from '@core/ui/LengthField'
import { FIT_MODES, KNOB_STYLES } from '../lid'
import { Panel } from './Panel'

// How the lid fits the body, its gap, and its knob.
export function LidPanel({ lid, onChange, fitted, units }) {
  const set = (patch) => onChange({ ...lid, ...patch })
  const setKnob = (patch) => onChange({ ...lid, knob: { ...lid.knob, ...patch } })
  const { fit } = fitted

  return (
    <>
      <Panel title="Lid fit">
        <fieldset className="grid gap-2">
          <legend className="sr-only">How the lid fits</legend>
          {Object.entries(FIT_MODES).map(([key, mode]) => (
            <label key={key} className="grid grid-cols-[auto_1fr] gap-x-2 text-sm">
              <input type="radio" name="fit" checked={lid.mode === key} onChange={() => set({ mode: key })} className="mt-1 accent-accent" />
              <span className={lid.mode === key ? 'text-ink' : 'text-mute'}>{mode.label}</span>
              {lid.mode === key && <span className="col-start-2 text-xs text-faint">{mode.help}</span>}
            </label>
          ))}
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <LengthField label="Gap, all round" mm={lid.gap} units={units} min={0} onChange={(gap) => set({ gap })} />
          {lid.mode !== 'gallery' && (
            <LengthField
              label={lid.mode === 'over' ? 'Skirt depth' : 'Flange depth'}
              mm={lid.drop}
              units={units}
              min={1}
              onChange={(drop) => set({ drop })}
            />
          )}
          <LengthField label="Lid wall" mm={lid.wall} units={units} min={0.5} onChange={(wall) => set({ wall })} />
        </div>

        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-t border-line pt-3 text-sm">
          <dt className="text-faint">{fit.bodyLabel}</dt>
          <dd className="text-right font-mono">{formatLength(fit.bodyDiameter, units)}</dd>
          <dt className="text-faint">{fit.lidLabel}</dt>
          <dd className="text-right font-mono">{formatLength(fit.lidDiameter, units)}</dd>
          <dt className="text-faint">Gap</dt>
          <dd className="text-right font-mono">
            {formatLength(fit.gap, units, 2)} all round
            <span className="block text-xs text-faint">{formatLength(2 * fit.gap, units, 2)} on the diameter</span>
          </dd>
        </dl>

        {fitted.problems.length > 0 && (
          <ul className="grid gap-1 text-sm">
            {fitted.problems.map((p) => (
              <li key={p} className="border-l-2 border-danger pl-2 text-danger">
                {p}
              </li>
            ))}
          </ul>
        )}

        <p className="rounded border border-line bg-raise p-2 text-xs text-mute">
          Hand-blown lids rarely seat straight off the pipe. Expect to grind the seat (cold-work) to get an even fit; the gap
          here is your target, not a promise.
        </p>
      </Panel>

      <Panel title="Knob">
        <label className="grid gap-1 text-sm">
          <span className="text-mute">Shape</span>
          <select
            value={lid.knob.style}
            onChange={(e) => setKnob({ style: e.target.value })}
            className="rounded border border-line bg-raise px-2 py-1 text-ink outline-none focus:border-accent"
          >
            {Object.entries(KNOB_STYLES).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {lid.knob.style !== 'none' && (
          <div className="grid grid-cols-2 gap-3">
            <LengthField label="Height" mm={lid.knob.height} units={units} min={2} onChange={(height) => setKnob({ height })} />
            <LengthField label="Widest" mm={lid.knob.diameter} units={units} min={2} onChange={(diameter) => setKnob({ diameter })} />
            <LengthField label="Neck" mm={lid.knob.neck} units={units} min={1} onChange={(neck) => setKnob({ neck })} />
          </div>
        )}
      </Panel>
    </>
  )
}
