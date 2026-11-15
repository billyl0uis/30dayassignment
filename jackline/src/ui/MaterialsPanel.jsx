import { useMemo } from 'react'
import { useDerived } from '../model/derived.js'
import { FORM_LABEL, grams, materialsEstimate, roundedTotals } from '../model/materials.js'
import { GRAINS } from '../model/color.js'
import { useStore } from '../model/store.js'

// What to pull from the color shelf before the session. All of it is an
// estimate, rounded to whole grams; the assumptions are editable below.
export default function MaterialsPanel() {
  const colors = useStore((s) => s.colors)
  const studio = useStore((s) => s.studio)
  const { sec } = useDerived()
  const est = useMemo(() => materialsEstimate(sec, colors, studio), [sec, colors, studio])
  if (!est.items.length) return null
  const shown = roundedTotals(est, studio.waste)

  return (
    <section className="panel materials-panel">
      <div className="panel-head">
        <h3>Color glass needed</h3>
        <span className="tag">estimate</span>
      </div>
      <table className="materials">
        <thead>
          <tr>
            <th>Color</th>
            <th>Form</th>
            <th>Glass</th>
            <th>Bars</th>
          </tr>
        </thead>
        <tbody>
          {est.items.map((l) => (
            <tr key={l.key}>
              <td>
                <i className={'dot' + (l.form.startsWith('frit') ? ' speckle' : '')} style={{ '--c': l.color?.hex ?? 'transparent' }} />
                {l.color?.name ?? 'missing color'}
              </td>
              <td>{FORM_LABEL[l.form]}</td>
              <td>{grams(l.grams)}</td>
              <td>{l.form !== 'bar' ? '—' : l.bars != null ? l.bars : <span className="muted" title="Enter a bar weight in the color library">set weight</span>}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2}>Color glass</td>
            <td>{shown.net} g</td>
            <td />
          </tr>
          <tr>
            <td colSpan={2}>Waste ({Math.round(studio.waste * 100)}%)</td>
            <td>{shown.waste} g</td>
            <td />
          </tr>
          <tr className="total">
            <td colSpan={2}>To have on hand</td>
            <td>{shown.total} g</td>
            <td />
          </tr>
        </tfoot>
      </table>
      <p className="fine">Bar counts include waste. From the turned profile; sculpting is ignored.</p>
      <Assumptions />
    </section>
  )
}

function NumField({ label, value, step, onChange, note }) {
  return (
    <label className="lib-field">
      <span>
        {label} {note && <em className="est">{note}</em>}
      </span>
      <input
        type="number"
        step={step}
        min="0"
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (e.target.value !== '' && Number.isFinite(v) && v >= 0) onChange(v)
        }}
      />
    </label>
  )
}

function Assumptions() {
  const studio = useStore((s) => s.studio)
  const setStudio = useStore((s) => s.setStudio)
  const cov = (k) => (v) => setStudio({ coverage: { ...studio.coverage, [k]: v } })
  return (
    <details className="library">
      <summary>Assumptions</summary>
      <div className="lib-grid">
        <NumField label="Glass density (g/cm³)" value={studio.density} step={0.05} onChange={(density) => setStudio({ density })} />
        <NumField label="Waste (%)" value={Math.round(studio.waste * 100)} step={5} onChange={(v) => setStudio({ waste: v / 100 })} />
      </div>
      <p className="fine">Coverage at 100%, in g/cm² of surface. Rough defaults: weigh a test gather to set your own.</p>
      <div className="lib-grid">
        {GRAINS.map((g) => (
          <NumField key={g} label={`Frit, ${g}`} note="est." value={studio.coverage[g]} step={0.005} onChange={cov(g)} />
        ))}
        <NumField label="Powder" note="est." value={studio.coverage.powder} step={0.002} onChange={cov('powder')} />
      </div>
    </details>
  )
}
