import { functionChecks } from '../model/checks.js'
import { useDerived } from '../model/derived.js'
import { NO_SCULPT, isSculpted } from '../geometry/sculpt.js'
import { GLASS_COLORS } from '../model/presets.js'
import { useStore } from '../model/store.js'
import { fmtLen, fmtMass, fmtVol } from '../model/units.js'

// A slider whose whole drag is one step of undo.
function Slider({ label, value, shown, min, max, step, onChange }) {
  const checkpoint = useStore((s) => s.checkpoint)
  return (
    <label className="range">
      <span className="field-label">
        {label} <b>{shown}</b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={checkpoint}
        onKeyDown={checkpoint}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}

export default function SidePanel() {
  const s = useStore()
  const { sec, metrics: m } = useDerived()
  const checks = functionChecks(m, { units: s.units, spout: s.spout })

  return (
    <aside className="side">
      <section className="panel">
        <h3>Wall</h3>
        <Slider label="Thickness" value={s.wall} shown={fmtLen(s.wall, s.units, 2)} min={0.08} max={1} step={0.01} onChange={(wall) => s.live({ wall, floor: Math.max(s.floor, wall) })} />
        <Slider
          label="Solid up to"
          value={sec.floorY}
          shown={fmtLen(sec.floorY, s.units)}
          min={s.wall}
          max={Math.max(s.wall + 0.1, sec.brimY - 0.3)}
          step={0.05}
          onChange={(floor) => s.live({ floor })}
        />
        <div className="checks-row">
          <label className="check">
            <input type="checkbox" checked={s.handle} onChange={(e) => s.change({ handle: e.target.checked })} />
            Handle
          </label>
          <label className="check">
            <input type="checkbox" checked={s.spout} onChange={(e) => s.change({ spout: e.target.checked })} />
            Spout
          </label>
        </div>
      </section>

      <Sculpt />

      <section className="panel">
        <h3>Glass</h3>
        <div className="swatches">
          {GLASS_COLORS.map(([name, c]) => (
            <button key={c} title={name} aria-label={name} className={'swatch' + (s.color === c ? ' on' : '')} style={{ '--c': c }} onClick={() => s.change({ color: c })} />
          ))}
        </div>
        <Slider label="Frost" value={s.frost} shown={`${Math.round(s.frost * 100)}%`} min={0} max={1} step={0.01} onChange={(frost) => s.live({ frost })} />
      </section>

      <section className="panel">
        <h3>Measures</h3>
        <dl className="measures">
          <dt>Holds to the brim</dt>
          <dd>{fmtVol(m.brimMl, s.units)}</dd>
          <dt>Glass weight</dt>
          <dd>{fmtMass(m.glassG, s.units)}</dd>
          <dt>Height</dt>
          <dd>{fmtLen(m.height, s.units)}</dd>
          <dt>Widest</dt>
          <dd>{fmtLen(m.maxD, s.units)}</dd>
          <dt>Opening</dt>
          <dd>{fmtLen(m.neckD, s.units)}</dd>
          <dt>Tips over at</dt>
          <dd>{m.tip.toFixed(0)}° of lean</dd>
        </dl>
      </section>

      <section className="panel">
        <h3>Will it work?</h3>
        <ul className="checks">
          {checks.map(({ id, check }) =>
            check ? (
              <li key={id} className={check.level}>
                <i />
                <div>
                  <b>{check.title}</b>
                  <span>{check.text}</span>
                </div>
              </li>
            ) : null,
          )}
        </ul>
      </section>
    </aside>
  )
}

// Moves that break the round: each one is a glassblower's technique.
function Sculpt() {
  const sculpt = useStore((s) => s.sculpt)
  const units = useStore((s) => s.units)
  const live = useStore((s) => s.live)
  const change = useStore((s) => s.change)
  const set = (key) => (v) => live({ sculpt: { ...sculpt, [key]: v } })
  return (
    <section className="panel">
      <div className="panel-head">
        <h3>Sculpt</h3>
        {isSculpted(sculpt) && <button onClick={() => change({ sculpt: { ...NO_SCULPT } })}>Make round</button>}
      </div>
      <Slider label="Optic ribs" value={sculpt.ribs} shown={sculpt.ribs ? sculpt.ribs : 'none'} min={0} max={16} step={1} onChange={set('ribs')} />
      {sculpt.ribs > 0 && (
        <div className="sub">
          <Slider label="Rib depth" value={sculpt.ribDepth} shown={fmtLen(sculpt.ribDepth, units, 2)} min={0.05} max={1} step={0.01} onChange={set('ribDepth')} />
        </div>
      )}
      <Slider label="Twist" value={sculpt.twist} shown={`${sculpt.twist}°`} min={-360} max={360} step={5} onChange={set('twist')} />
      <Slider label="Paddled flat" value={sculpt.squash} shown={`${Math.round(sculpt.squash * 100)}%`} min={0} max={0.7} step={0.01} onChange={set('squash')} />
      <Slider label="Rim waves" value={sculpt.waves} shown={sculpt.waves ? sculpt.waves : 'none'} min={0} max={12} step={1} onChange={set('waves')} />
      {sculpt.waves > 0 && (
        <div className="sub">
          <Slider label="Wave height" value={sculpt.waveHeight} shown={fmtLen(sculpt.waveHeight, units)} min={0.2} max={5} step={0.1} onChange={set('waveHeight')} />
        </div>
      )}
      <Slider label="Lean" value={sculpt.lean} shown={fmtLen(sculpt.lean, units)} min={-8} max={8} step={0.1} onChange={set('lean')} />
      <Slider label="Wobble" value={sculpt.wobble} shown={fmtLen(sculpt.wobble, units)} min={0} max={1.5} step={0.01} onChange={set('wobble')} />
      {sculpt.wobble > 0 && (
        <button onClick={() => change({ sculpt: { ...sculpt, seed: Math.floor(Math.random() * 1e6) } })}>New wobble</button>
      )}
    </section>
  )
}
