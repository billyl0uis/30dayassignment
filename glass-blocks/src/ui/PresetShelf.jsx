import { GROUPS, presetsInGroup } from '../geometry/presets.js'
import { useStore } from '../model/store.js'
import ShapeIcon from './ShapeIcon.jsx'

export default function PresetShelf() {
  const addPart = useStore((s) => s.addPart)
  return (
    <nav className="shelf" aria-label="Shapes">
      {GROUPS.map((g) => (
        <section key={g.id}>
          <h2>{g.label}</h2>
          <div className="shelf-grid">
            {presetsInGroup(g.id).map(([key, p]) => (
              <button key={key} className="shape-btn" onClick={() => addPart(key)} title={`Add ${p.label.toLowerCase()}`}>
                <ShapeIcon preset={key} />
                <span>{p.label}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </nav>
  )
}
