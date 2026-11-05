import { useStore } from '../store.js'
import { sceneTotals } from '../core/scene.js'
import { fmtMass, fmtTotalMass } from '../core/units.js'
import { Segmented } from './fields.jsx'

const TYPE_LABEL = { blown: 'Blown forms', solid: 'Solid shapes', cane: 'Cane rods' }
const HANG_LABEL = { loop: 'Glass loop', drilled: 'Drilled + wire', cap: 'Glued cap' }

function dimsText(p) {
  const d = p.dims, s = p.scale
  const f = (v) => Math.round(v * s)
  if (p.type === 'cane') return `${f(d.lengthMm)} × Ø${f(d.diameterMm)}`
  if (p.type === 'blown') {
    const r = Math.max(...d.points.map((q) => q[0])), h = Math.max(...d.points.map((q) => q[1]))
    return `Ø${f(2 * r)} × ${f(h)} · wall ${(d.wallMm * s).toFixed(1)}${d.closedTop ? ' · closed' : ''}`
  }
  if (d.shape === 'sphere') return `Ø${f(d.diameterMm)}`
  if (d.shape === 'block') return `${f(d.widthMm)} × ${f(d.depthMm)} × ${f(d.heightMm)}`
  return `Ø${f(d.diameterMm)} × ${f(d.lengthMm)}`
}

export default function Readouts() {
  const { scene, setSettings, select, selectedId } = useStore()
  const t = sceneTotals(scene)
  const mu = scene.settings.massUnit
  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h3>Total weight</h3>
          <Segmented small value={mu} options={[['metric', 'g / kg'], ['lb', '+ lb']]} onChange={(massUnit) => setSettings({ massUnit })} />
        </div>
        <p className="big-number">{fmtTotalMass(t.weightG, mu)}</p>
        <small className="hint">At {scene.settings.density} g/cm³ (soft soda-lime, assumed). Check your colour maker’s spec sheet.</small>
      </section>

      <section className="panel">
        <h3>Count</h3>
        {!scene.parts.length && <p className="muted small">Nothing yet.</p>}
        {Object.values(t.counts).map((ty) => (
          <div key={ty.type} className="count-group">
            <div className="count-type"><span>{TYPE_LABEL[ty.type]}</span><b>{ty.count}</b></div>
            {ty.families.map((f) => (
              <div key={f.familyId} className="count-fam"><span>{f.name}{f.count > 1 ? ' family' : ''}</span><b>{f.count} · {fmtMass(f.weightG, mu)}</b></div>
            ))}
          </div>
        ))}
      </section>

      <section className="panel">
        <h3>Footprint</h3>
        <p className="muted small">Base W × D, overall height and hang drop appear once parts are arranged (step 2).</p>
      </section>

      <section className="panel">
        <h3>Every part</h3>
        <table className="part-table">
          <thead><tr><th>Part</th><th>Size (mm)</th><th>Weight</th><th>Contacts</th><th>Hang</th></tr></thead>
          <tbody>
            {t.per.map(({ part: p, m }) => (
              <tr key={p.id} className={p.id === selectedId ? 'on' : ''} onClick={() => select(p.id)}>
                <td>{p.name}</td>
                <td>{dimsText(p)}</td>
                <td>{fmtMass(m.weightG, mu)}</td>
                <td className="muted">—</td>
                <td>{p.hang ? HANG_LABEL[p.hang.kind] : <span className="muted">none</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  )
}
