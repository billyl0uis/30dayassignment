import { useState } from 'react'
import { DEFAULT_DENSITY_G_CM3, capacityTo } from '@core/model/measure'
import { formatLength, formatVolume, formatWeight } from '@core/model/units'
import { LengthField } from '@core/ui/LengthField'
import { SCALE_WAYS, fillHeight, fillMl, solveScale, targetMl } from '../model/capacity.js'
import { processTemplate } from '../model/process.js'
import { Choice, Note, NumberField, Panel, Readout } from './fields.jsx'

export function CapacityPanel({ design, update, units, section, m, measureBody }) {
  const [target, setTarget] = useState({ value: null, unit: 'ml', way: 'uniform' })
  const [hit, setHit] = useState(null)
  const fill = design.fillPercent == null ? null : fillMl(m.capacityMl, design.fillPercent)
  const floorZ = section.inner[0][1]
  const fillZ = fill == null ? null : fillHeight((z) => capacityTo(section, z), floorZ, section.brim, fill)

  const find = () => {
    if (target.value == null || target.value <= 0) return
    // The base holds its thickness: the highest point that carries the
    // base's own wall marks its top.
    const baseZ = Math.max(0, ...design.points.filter((p) => p.wall != null && p.wall === design.points[0].wall).map((p) => p.z))
    setHit(solveScale({ points: design.points, way: target.way, target: targetMl(target.value, target.unit), measure: measureBody, baseZ }) ?? 'none')
  }

  return (
    <Panel title="Capacity">
      <Readout
        rows={[
          ['Brimful (to the mouth)', formatVolume(m.capacityMl, units)],
          ...(fill == null
            ? []
            : [
                [`At ${design.fillPercent}% fill`, formatVolume(fill, units)],
                ['Fill line, above the table', fillZ == null ? '—' : formatLength(fillZ, units)],
                ['Headspace to the mouth', fillZ == null ? '—' : formatLength(section.brim - fillZ, units)],
              ]),
        ]}
      />
      <NumberField label="Fill line" unit="% of brimful" value={design.fillPercent} placeholder="none" onChange={(fillPercent) => update({ fillPercent: fillPercent == null ? null : Math.min(100, fillPercent) })} />

      <div className="grid gap-2 border-t border-line pt-3">
        <h3 className="text-xs font-semibold text-mute">Resize to hold a set amount (brimful)</h3>
        <div className="grid grid-cols-[1fr_auto] items-end gap-2">
          <NumberField label="Target" value={target.value} placeholder="" onChange={(value) => setTarget({ ...target, value })} />
          <select value={target.unit} onChange={(e) => setTarget({ ...target, unit: e.target.value })} className="mb-0.5 rounded border border-line bg-raise px-2 py-1 text-ink">
            <option value="ml">ml</option>
            <option value="fl oz">fl oz (US)</option>
          </select>
        </div>
        <Choice label="By changing" value={target.way} options={SCALE_WAYS} onChange={(way) => way && setTarget({ ...target, way })} />
        <button type="button" onClick={find} className="rounded border border-line bg-raise px-3 py-1.5 text-sm hover:border-accent">
          Find the size
        </button>
        {hit === 'none' && <Note tone="caution">No size from 0.2× to 5× of this body reaches that.</Note>}
        {hit && hit !== 'none' && (
          <>
            <Readout
              rows={[
                ['Scale', `${hit.k.toFixed(4)}×`],
                ['Holds', formatVolume(hit.ml, units)],
                ['Body height', formatLength(Math.max(...hit.points.map((p) => p.z)), units)],
                ['Body widest ⌀', formatLength(2 * Math.max(...hit.points.map((p) => p.r)), units)],
              ]}
            />
            <Note>The neck keeps its size; only the body changes. Walls keep their thickness.</Note>
            <button
              type="button"
              onClick={() => {
                update({ points: hit.points })
                setHit(null)
              }}
              className="rounded bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink"
            >
              Apply this size
            </button>
          </>
        )}
      </div>
    </Panel>
  )
}

const RISK_NAMES = { baseToWall: 'Base ÷ wall', baseShare: 'Base share of the glass', neckWall: 'Neck wall at the mouth' }

export function WallPanel({ design, update, units, m, risks }) {
  const density = design.density ?? DEFAULT_DENSITY_G_CM3
  return (
    <Panel title="Wall and weight">
      <LengthField label="Body wall" mm={design.wall} units={units} min={0.3} onChange={(wall) => update({ wall })} hint="The base and the neck have their own (thick base on the profile; neck from the closure)." />
      <NumberField label="Glass density" unit="g/cm³" value={design.density} placeholder={String(DEFAULT_DENSITY_G_CM3)} onChange={(v) => update({ density: v })} />
      {design.density == null && <Note tone="caution">TODO: using {DEFAULT_DENSITY_G_CM3} g/cm³, a typical soda-lime figure. Enter your batch's density from its data sheet.</Note>}
      <Readout rows={[['Glass weight', formatWeight(m.glassCm3 * density, units)]]} />

      <div className="grid gap-2 border-t border-line pt-3">
        <h3 className="text-xs font-semibold text-mute">Risk zones</h3>
        <Readout
          rows={risks.map((r) => {
            const shown = r.measured == null ? '—' : r.id === 'neckWall' ? formatLength(r.measured, units, 2) : r.id === 'baseShare' ? `${r.measured.toFixed(0)}%` : `${r.measured.toFixed(1)}×`
            return [RISK_NAMES[r.id], `${shown}${r.level === 'risk' ? ' · risk' : r.level === 'unset' ? ' · no limit' : ' · ok'}`, r.level === 'risk' ? 'risk' : null]
          })}
        />
        <div className="grid gap-2">
          <NumberField label="Flag the base when thicker than the wall by over" unit="×" value={design.limits.baseToWall} onChange={(v) => update({ limits: { ...design.limits, baseToWall: v } })} />
          <NumberField label="Flag the base when its share of the weight is over" unit="%" value={design.limits.baseShare} onChange={(v) => update({ limits: { ...design.limits, baseShare: v } })} />
          <NumberField label="Flag the neck wall when under" unit="mm" value={design.limits.neckWall} onChange={(v) => update({ limits: { ...design.limits, neckWall: v } })} />
        </div>
        <Note>No limits are built in. Set them from your own experience; a zone is flagged only against a limit you set.</Note>
      </div>
    </Panel>
  )
}

export function ProcessPanel({ design, update }) {
  const steps = design.process.steps
  const setNote = (id, note) => update({ process: { ...design.process, steps: steps.map((s) => (s.id === id ? { ...s, note } : s)) } })
  const parts = { body: 'Body', neck: 'Neck finishing', stopper: 'Stopper (made separately)' }
  return (
    <Panel
      title="Process plan"
      aside={
        <button type="button" onClick={() => update({ process: processTemplate(design.closure.type) })} className="text-xs text-faint hover:text-ink">
          Reset to template
        </button>
      }
    >
      <Note tone="caution">{design.process.note}</Note>
      {Object.entries(parts).map(([part, name]) => {
        const rows = steps.filter((s) => s.part === part)
        if (!rows.length) return null
        return (
          <div key={part} className="grid gap-2">
            <h3 className="text-xs font-semibold text-mute">{name}</h3>
            <ol className="grid gap-2">
              {rows.map((s, i) => (
                <li key={s.id} className="grid gap-1 text-sm">
                  <span>
                    {i + 1}. {s.title}
                  </span>
                  <textarea
                    rows={1}
                    value={s.note}
                    placeholder="Notes"
                    onChange={(e) => setNote(s.id, e.target.value)}
                    className="resize-y rounded border border-line bg-raise px-2 py-1 text-xs text-ink outline-none focus:border-accent"
                  />
                </li>
              ))}
            </ol>
          </div>
        )
      })}
    </Panel>
  )
}
