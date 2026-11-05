import { useStore } from '../store.js'
import { partMetrics } from '../core/parts.js'
import { fmtMass } from '../core/units.js'

const TYPE_LABEL = { blown: 'Blown', solid: 'Solid', cane: 'Cane' }

// Parts grouped by family, in the order they were made. A family's copies
// sit indented under the first member.
export default function PartList() {
  const { scene, selectedId, select } = useStore()
  const groups = []
  const byFam = new Map()
  for (const p of scene.parts) {
    let g = byFam.get(p.familyId)
    if (!g) {
      byFam.set(p.familyId, (g = []))
      groups.push(g)
    }
    g.push(p)
  }
  return (
    <section>
      <h2>Parts · {scene.parts.length}</h2>
      {!scene.parts.length && <p className="muted small">No parts yet. Add a blown form, solid or cane rod from the toolbar.</p>}
      <ul className="parts">
        {groups.map((g) =>
          g.map((p, i) => {
            const m = partMetrics(p, scene.settings)
            return (
              <li key={p.id}>
                <button className={`part-row${p.id === selectedId ? ' on' : ''}${i > 0 ? ' copy' : ''}`} onClick={() => select(p.id)}>
                  <i className="dot" style={{ '--c': p.color.hex, '--a': 0.25 + p.color.opacity * 0.75 }} />
                  <span className="part-name">{p.name}</span>
                  <span className="part-meta">{i === 0 ? TYPE_LABEL[p.type] : `${Math.round(p.scale * 100)}%`} · {fmtMass(m.weightG, scene.settings.massUnit)}</span>
                </button>
              </li>
            )
          }),
        )}
      </ul>
    </section>
  )
}
