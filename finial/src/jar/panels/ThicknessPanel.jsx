import { formatLength } from '@core/model/units'
import { LengthField } from '@core/ui/LengthField'
import { jumpRuleStore } from '../stores'
import { NumberField, Panel } from './Panel'

// Sudden thickness changes by the shop's own rule (core/model/thickness.js).
// Warn only.
export function ThicknessPanel({ jumps, rule, units }) {
  return (
    <Panel title={jumps.length ? `Thickness warnings (${jumps.length})` : 'Thickness warnings'}>
      {jumps.length ? (
        <ul className="grid gap-2 text-sm">
          {jumps.map((j) => (
            <li key={j.from} className="border-l-2 border-caution pl-2">
              <span className="text-caution">
                {formatLength(j.thick, units)} to {formatLength(j.thin, units)}
              </span>{' '}
              within {formatLength(j.distance, units)} of wall, at {formatLength(j.zLow, units)}–{formatLength(j.zHigh, units)} up (
              {j.ratio.toFixed(1)}×)
            </li>
          ))}
          <li className="text-xs text-faint">
            Thick glass next to thin cools at different rates, a common place for cracks. Check it against how you anneal.
          </li>
        </ul>
      ) : (
        <p className="text-sm text-faint">No sudden thickness changes by your rule.</p>
      )}
      <fieldset className="grid gap-2 border-t border-line pt-3">
        <legend className="sr-only">Your rule for a sudden change</legend>
        <p className="text-xs text-mute">Warn when the wall gets this many times thicker or thinner…</p>
        <div className="flex items-end gap-3">
          <NumberField label="Ratio" value={rule.ratio} min={1.05} step={0.1} onChange={(ratio) => jumpRuleStore.set({ ratio })} />
          <LengthField label="…within" mm={rule.within} units={units} min={1} onChange={(within) => jumpRuleStore.set({ within })} />
        </div>
        <p className="text-xs text-faint">
          A starting rule, not a published limit. Set it from your own practice.{' '}
          <button type="button" onClick={jumpRuleStore.reset} className="underline hover:text-ink">
            Reset
          </button>
        </p>
      </fieldset>
    </Panel>
  )
}
