import { LengthField } from '@core/ui/LengthField'
import { ZONES } from '../zones'
import { Panel } from './Panel'

// Colour zones, brand-neutral: your own name for each glass, its COE from
// the maker, and a swatch for the preview.
export function ColourPanel({ zones, onChange, inUse, hasKnob, coe, units }) {
  const set = (key, patch) => onChange({ ...zones, [key]: { ...zones[key], ...patch } })

  return (
    <>
      <Panel title="Colour zones">
        <div className="grid gap-4">
          {Object.entries(ZONES).map(([key, zone]) => {
            const z = zones[key]
            const on = inUse.includes(key)
            const toggle = !zone.always && key !== 'knob'
            return (
              <fieldset key={key} className="grid gap-2 border-t border-line pt-3 first:border-t-0 first:pt-0">
                <legend className="sr-only">{zone.label}</legend>
                <div className="flex items-center gap-2 text-sm">
                  {toggle ? (
                    <label className="flex items-center gap-2 font-semibold text-ink">
                      <input type="checkbox" checked={z.used} onChange={(e) => set(key, { used: e.target.checked })} className="accent-accent" />
                      {zone.label}
                    </label>
                  ) : (
                    <span className="font-semibold text-ink">{zone.label}</span>
                  )}
                  {key === 'knob' && !hasKnob && <span className="text-xs text-faint">no knob on this lid</span>}
                </div>
                {on && (
                  <div className="grid grid-cols-[auto_1fr_4.5rem] items-end gap-2">
                    <label className="grid gap-1 text-xs text-mute">
                      Preview
                      <input
                        type="color"
                        value={z.swatch}
                        onChange={(e) => set(key, { swatch: e.target.value })}
                        className="h-8 w-10 cursor-pointer rounded border border-line bg-raise"
                      />
                    </label>
                    <label className="grid gap-1 text-xs text-mute">
                      Colour name
                      <input
                        value={z.name}
                        placeholder="Your name for it"
                        onChange={(e) => set(key, { name: e.target.value })}
                        className="min-w-0 rounded border border-line bg-raise px-2 py-1 text-sm text-ink outline-none focus:border-accent"
                      />
                    </label>
                    <label className="grid gap-1 text-xs text-mute">
                      COE
                      <input
                        value={z.coe}
                        inputMode="decimal"
                        placeholder="—"
                        onChange={(e) => set(key, { coe: e.target.value })}
                        className="min-w-0 rounded border border-line bg-raise px-2 py-1 font-mono text-sm text-ink outline-none focus:border-accent"
                      />
                    </label>
                  </div>
                )}
                {on && zone.size && (
                  <LengthField
                    label={zone.size.label}
                    mm={z[zone.size.key]}
                    units={units}
                    min={0.5}
                    onChange={(v) => set(key, { [zone.size.key]: v })}
                  />
                )}
              </fieldset>
            )
          })}
        </div>
      </Panel>

      <Panel title="COE check">
        {coe.mismatch.length > 0 ? (
          <div className="grid gap-2 border-l-2 border-danger pl-2 text-sm">
            <p className="text-danger">The COEs don’t match.</p>
            <ul className="grid gap-1">
              {coe.mismatch.map((g) => (
                <li key={g.coe}>
                  <span className="font-mono">{g.coe}</span>: {g.zones.join(', ')}
                </li>
              ))}
            </ul>
            <p className="text-xs text-mute">Glasses with different COEs fused together are likely to crack as they cool.</p>
          </div>
        ) : coe.missing.length === 0 ? (
          <p className="text-sm text-mute">Every zone has the same COE.</p>
        ) : null}
        {coe.missing.length > 0 && (
          <p className="text-sm text-faint">No COE entered for: {coe.missing.join(', ')}. Add it from the maker’s data to check it.</p>
        )}
        <p className="text-xs text-faint">
          Matching COE alone doesn’t make glasses compatible; check the maker’s compatibility notes too. Swatches are for the
          preview only.
        </p>
      </Panel>
    </>
  )
}
