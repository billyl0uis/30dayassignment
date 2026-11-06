import { SWATCHES } from '../config/glass.js'
import { useStore } from '../model/store.js'
import { LengthField } from './fields.jsx'
import PresetStrip from './PresetStrip.jsx'
import ProfileSheet from './ProfileSheet.jsx'

export default function BodyPanel() {
  return (
    <section className="body-panel">
      <PresetStrip />
      <header className="panel-head">
        <h2>Body</h2>
        <span className="muted">Jackline profile · outside wall</span>
      </header>
      <ProfileSheet />
      <p className="hint">Drag points · click the wall to add · double-click to remove · Shift snaps to 5 mm</p>
      <WallTable />
      <Glasses />
    </section>
  )
}

// Wall thickness at each profile point, foot first. The section eases
// between them, so a heavy base can thin out toward a light lip.
function WallTable() {
  const points = useStore((s) => s.points)
  const walls = useStore((s) => s.walls)
  const selectedPoint = useStore((s) => s.selectedPoint)
  const { live, setView } = useStore.getState()
  const setWall = (i, cm) => live({ walls: walls.map((w, j) => (j === i ? cm : w)) })
  return (
    <div className="block">
      <h3>Wall at each point</h3>
      <ol className="wall-table">
        {[...points.keys()].reverse().map((i) => (
          <li key={i} className={selectedPoint === i ? 'on' : ''} onPointerDown={() => setView({ selectedPoint: i })}>
            <span className="pt-name">{i === 0 ? 'Foot' : i === points.length - 1 ? 'Rim' : `Point ${i}`}</span>
            <LengthField label="wall" cm={walls[i]} min={0.08} max={3} onLive={(cm) => setWall(i, cm)} />
          </li>
        ))}
      </ol>
    </div>
  )
}

// The glasses in this piece. Bits can be a different glass from the body;
// COE and compatibility group are yours to fill in (nothing is assumed).
function Glasses() {
  const glasses = useStore((s) => s.glasses)
  const bodyGlass = useStore((s) => s.bodyGlass)
  const bits = useStore((s) => s.bits)
  const { change, live, updateGlass, addGlass, removeGlass } = useStore.getState()
  return (
    <div className="block">
      <h3>Glass</h3>
      <label className="field wide">
        <span>Body</span>
        <select value={bodyGlass} onChange={(e) => change({ bodyGlass: e.target.value })}>
          {glasses.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      </label>
      {glasses.map((g) => {
        const used = g.id === bodyGlass || bits.some((b) => b.glass === g.id)
        const edit = (patch) => updateGlass(g.id, patch)
        const cp = () => useStore.getState().checkpoint()
        return (
          <fieldset key={g.id} className="glass">
            <div className="glass-row">
              <span className="swatch" style={{ background: g.color }} />
              <input className="name" value={g.name} onFocus={cp} onChange={(e) => edit({ name: e.target.value })} aria-label="Glass name" />
              <button className="icon" disabled={used} title={used ? 'In use on this piece' : 'Remove this glass'} onClick={() => removeGlass(g.id)}>×</button>
            </div>
            <div className="glass-grid">
              <label className="field">
                <span>COE</span>
                <input value={g.coe} placeholder="yours" onFocus={cp} onChange={(e) => edit({ coe: e.target.value })} />
              </label>
              <label className="field" title="Glasses you've tested as compatible share a group name.">
                <span>Group</span>
                <input value={g.group} placeholder="tested set" onFocus={cp} onChange={(e) => edit({ group: e.target.value })} />
              </label>
              <label className="field">
                <span>Density</span>
                <input type="number" step={0.01} min={1.5} max={6} value={g.density} onFocus={cp} onChange={(e) => {
                  const v = parseFloat(e.target.value)
                  if (Number.isFinite(v) && v > 0) edit({ density: v })
                }} />
                <em>g/cm³</em>
              </label>
            </div>
            <div className="swatches">
              {SWATCHES.map(([name, hex]) => (
                <button key={hex} className={'sw' + (g.color === hex ? ' on' : '')} style={{ background: hex }} title={name} aria-label={name}
                  onClick={() => (cp(), live({ glasses: glasses.map((x) => (x.id === g.id ? { ...x, color: hex } : x)) }))} />
              ))}
            </div>
          </fieldset>
        )
      })}
      <button className="add" onClick={addGlass}>+ Add a glass</button>
    </div>
  )
}
