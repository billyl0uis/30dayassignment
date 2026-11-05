import { useCallback } from 'react'
import { PRESETS } from '../geometry/presets.js'
import { useLivePart, useStore } from '../model/store.js'
import { formatLength, parseLength } from '../model/units.js'
import { ColorInput, DraftRange, NumberField, Segmented } from './fields.jsx'
import ShapeIcon from './ShapeIcon.jsx'

export const SWATCHES = [
  ['#ffffff', 'Clear'],
  ['#2f5fd0', 'Cobalt'],
  ['#2aa9b0', 'Teal'],
  ['#1f9d6b', 'Emerald'],
  ['#f2d23c', 'Canary'],
  ['#e0902f', 'Amber'],
  ['#d0365a', 'Gold ruby'],
  ['#8a5fc8', 'Amethyst'],
  ['#e6dcc4', 'Bone'],
  ['#6b6a66', 'Smoke'],
  ['#1a1a1c', 'Black'],
]

const parsePercent = (t) => {
  const v = Number(String(t).replace('%', '').trim())
  return isFinite(v) && v >= 15 && v <= 300 ? v / 100 : null
}

export default function PartPanel() {
  const id = useStore((s) => s.selectedId)
  const part = useLivePart(id)
  const units = useStore((s) => s.units)
  const gizmo = useStore((s) => s.gizmo)
  const { setPart, setDraft, commitDraft, setMode, setGizmo, duplicateSelected, removeSelected, select } = useStore.getState()

  const fmt = useCallback((cm) => formatLength(cm, units), [units])
  const parse = useCallback((t) => parseLength(t, units), [units])
  const fmtPct = useCallback((v) => `${Math.round(v * 100)}`, [])
  const draftColor = useCallback((c) => setDraft(id, { material: { color: c } }), [id, setDraft])
  const commitColor = useCallback((c) => setPart(id, { material: { color: c } }), [id, setPart])

  if (!part) {
    return (
      <div className="panel quiet">
        <p className="lede">Click a shape on the left to add it.</p>
        <p>New pieces stack on top. Click a piece to select it, then drag its dots:</p>
        <ul className="legend">
          <li><i style={{ '--c': '#ff9a4d' }} />top dot: taller or shorter</li>
          <li><i style={{ '--c': '#5fd0ff' }} />side dot: wider or narrower</li>
          <li><i style={{ '--c': '#ff6fb1' }} />high dot: taper or flare</li>
        </ul>
        <p className="hint">Drag empty space to orbit. Scroll to zoom.</p>
      </div>
    )
  }

  const def = PRESETS[part.preset]
  const { params, material } = part
  const u = units === 'in' ? 'in' : 'cm'

  return (
    <div className="panel">
      <header className="panel-head">
        <ShapeIcon preset={part.preset} size={28} />
        <h2>{def.label}</h2>
        <button className="icon-btn" onClick={() => select(null)} title="Deselect (Esc)" aria-label="Deselect">×</button>
      </header>

      <Segmented
        value={part.mode}
        options={[['stack', 'On the axis'], ['free', 'Free']]}
        onChange={(m) => setMode(id, m)}
      />
      {part.mode === 'free' && (
        <Segmented small value={gizmo} options={[['translate', 'Move'], ['rotate', 'Rotate'], ['scale', 'Scale']]} onChange={setGizmo} />
      )}

      <div className="field-row">
        <NumberField label="Height" value={params.h} format={fmt} parse={parse} suffix={u} onCommit={(h) => setPart(id, { params: { h } })} />
        <NumberField label="Width" value={params.w} format={fmt} parse={parse} suffix={u} onCommit={(w) => setPart(id, { params: { w } })} />
        {!def.noTaper && (
          <NumberField label="Top" value={params.taper ?? 1} format={fmtPct} parse={parsePercent} suffix="%" onCommit={(taper) => setPart(id, { params: { taper } })} />
        )}
      </div>

      <h3>Glass</h3>
      <div className="swatches">
        {SWATCHES.map(([c, name]) => (
          <button
            key={c}
            className={`swatch${material.color.toLowerCase() === c ? ' on' : ''}`}
            style={{ '--c': c }}
            title={name}
            aria-label={name}
            onClick={() => commitColor(c)}
          />
        ))}
        <ColorInput value={material.color} onDraft={draftColor} onCommit={commitColor} />
      </div>
      <Segmented
        value={material.finish}
        options={[['clear', 'Transparent'], ['opaque', 'Opaque']]}
        onChange={(finish) => setPart(id, { material: { finish } })}
      />
      <DraftRange
        label="Frost"
        min={0}
        max={100}
        value={Math.round(material.frost * 100)}
        display={material.frost === 0 ? 'polished' : `${Math.round(material.frost * 100)}%`}
        onDraft={(v) => setDraft(id, { material: { frost: v / 100 } })}
        onCommit={commitDraft}
      />
      <label className="check">
        <input type="checkbox" checked={material.iridescent} onChange={(e) => setPart(id, { material: { iridescent: e.target.checked } })} />
        Iridescent
      </label>

      <div className="panel-actions">
        <button onClick={duplicateSelected}>Duplicate</button>
        <button className="danger" onClick={removeSelected}>Delete</button>
      </div>
    </div>
  )
}
