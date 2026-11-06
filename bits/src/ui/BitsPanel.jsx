import { useRef, useState } from 'react'
import { BIT_TYPES, PALETTE } from '../model/bits/index.js'
import { useMeasures } from '../model/derived.js'
import { useStore } from '../model/store.js'
import { fmtMass } from '../model/units.js'
import { whereText } from '../model/describe.js'
import Checks, { useChecks, useWarnCounts } from './Checks.jsx'
import { LengthSlider, NumberSlider } from './fields.jsx'

export default function BitsPanel() {
  return (
    <aside className="bits-panel">
      <Palette />
      <WorkingOrder />
      <BitEditor />
      <Checks />
    </aside>
  )
}

function Palette() {
  const tool = useStore((s) => s.tool)
  const drawing = useStore((s) => s.drawing)
  const setView = useStore((s) => s.setView)
  const t = BIT_TYPES[tool]
  return (
    <div className="block">
      <h3>Place a bit</h3>
      <div className="palette">
        {PALETTE.map(([id, label]) => (
          <button key={id} className={'tool' + (tool === id ? ' on' : '')} title={BIT_TYPES[id].blurb}
            onClick={() => setView({ tool: tool === id ? null : id, drawing: null })}>
            {label}
          </button>
        ))}
      </div>
      <p className="hint">
        {drawing ? 'Drawing a trail: click the body to add points. Done when finished.'
          : t ? `${t.blurb} Esc to stop.` : 'Pick a bit, then click the body. Drag a selected bit to slide it.'}
      </p>
    </div>
  )
}

// Bits in the order they go on at the bench. Drag a row (or use the arrows)
// to reorder: the number on each bit in 3D is its place in this list.
function WorkingOrder() {
  const bits = useStore((s) => s.bits)
  const selected = useStore((s) => s.selected)
  const units = useStore((s) => s.units)
  const { setView, moveBit } = useStore.getState()
  const m = useMeasures()
  const flags = useWarnCounts()
  const from = useRef(null)
  const [over, setOver] = useState(null)

  return (
    <div className="block grow">
      <h3>Working order <span className="muted">{bits.length ? `${bits.length} bit${bits.length > 1 ? 's' : ''}` : ''}</span></h3>
      {!bits.length && <p className="empty">No bits yet. Arm one above and click the vessel.</p>}
      <ol className="order">
        {bits.map((b, i) => {
          const bm = m.bits[i]
          const share = m.total.mass > 0 ? (bm.mass / m.total.mass) * 100 : 0
          const noMass = BIT_TYPES[b.type].addsMass === false
          return (
            <li
              key={b.id}
              draggable
              className={(b.id === selected ? 'on' : '') + (over === i ? ' over' : '')}
              onClick={() => setView({ selected: b.id })}
              onDragStart={(e) => ((from.current = i), (e.dataTransfer.effectAllowed = 'move'))}
              onDragOver={(e) => (e.preventDefault(), setOver(i))}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => (e.preventDefault(), setOver(null), moveBit(from.current, i))}
              onDragEnd={() => setOver(null)}
            >
              <span className="num">{i + 1}</span>
              <span className="what">
                <b>
                  {BIT_TYPES[b.type].label}
                  {flags[b.id] > 0 && <span className="flag" title={`${flags[b.id]} heuristic warning${flags[b.id] > 1 ? 's' : ''}: see Checks`}>{flags[b.id]}</span>}
                </b>
                <small>{whereText(b, bm, units)}</small>
              </span>
              <span className="mass">
                {noMass ? 'no glass' : fmtMass(bm.mass)}
                <small>{noMass ? 'moves rim' : `${share < 0.1 ? '<0.1' : share.toFixed(1)}%`}</small>
              </span>
              <span className="move">
                <button className="icon" disabled={i === 0} aria-label="Earlier" onClick={(e) => (e.stopPropagation(), moveBit(i, i - 1))}>↑</button>
                <button className="icon" disabled={i === bits.length - 1} aria-label="Later" onClick={(e) => (e.stopPropagation(), moveBit(i, i + 1))}>↓</button>
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

// One shaping handle, drawn to suit what it is.
function Param({ bit, p }) {
  const { updateBitParams, change, checkpoint } = useStore.getState()
  const bits = useStore((s) => s.bits)
  const v = bit.params[p.key]
  const live = (x) => updateBitParams(bit.id, { [p.key]: x })
  const set = (x) => change({ bits: bits.map((b) => (b.id === bit.id ? { ...b, params: { ...b.params, [p.key]: x } } : b)) })
  switch (p.kind) {
    case 'length':
      return <LengthSlider label={p.label} cm={v} min={p.min} max={p.max} step={p.step} onLive={live} />
    case 'number':
    case 'count':
      return <NumberSlider label={p.label} value={v} min={p.min} max={p.max} step={p.step} onLive={live} />
    case 'ratio':
      return <NumberSlider label={p.label} value={Math.round(v * 100)} min={p.min * 100} max={p.max * 100} step={1} unit={p.ends ? `${p.ends[0]}–${p.ends[1]}` : '%'} onLive={(x) => live(x / 100)} />
    case 'angle':
      return <NumberSlider label={p.label} value={v} min={p.min} max={p.max} step={p.step} unit="°" onLive={live} />
    case 'toggle':
      return (
        <label className="check">
          <input type="checkbox" checked={!!v} onChange={(e) => set(e.target.checked)} />
          {p.label}
        </label>
      )
    case 'choice':
      return (
        <label className="field wide">
          <span>{p.label}</span>
          <select value={v} onFocus={checkpoint} onChange={(e) => set(e.target.value)}>
            {p.options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
      )
    default:
      return null
  }
}

function BitEditor() {
  const bits = useStore((s) => s.bits)
  const selected = useStore((s) => s.selected)
  const glasses = useStore((s) => s.glasses)
  const drawing = useStore((s) => s.drawing)
  const { change, removeBit, duplicateBit, radialArray, setView } = useStore.getState()
  const [count, setCount] = useState(6)
  const m = useMeasures()
  const results = useChecks()
  const i = bits.findIndex((b) => b.id === selected)
  if (i < 0) return null
  const mine = results.filter((r) => r.level === 'warn' && r.bits.includes(selected))
  const bit = bits[i]
  const type = BIT_TYPES[bit.type]
  const bm = m.bits[i]
  const setBit = (patch) => change({ bits: bits.map((b) => (b.id === bit.id ? { ...b, ...patch } : b)) })
  const freehand = bit.type === 'trail' && bit.params.path === 'freehand'

  return (
    <div className="block editor">
      <h3>
        #{i + 1} {type.label}
        <span className="muted">{type.addsMass === false ? 'adds no glass' : `${fmtMass(bm.mass)} · ${bm.volume.toFixed(2)} cm³`}</span>
      </h3>
      {type.textures.length > 1 && (
        <label className="field wide">
          <span>Tool</span>
          <select value={bit.texture} onChange={(e) => setBit({ texture: e.target.value })}>
            {type.textures.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      )}
      {mine.length > 0 && (
        <ul className="bit-warns">
          {mine.map((r) => <li key={r.id} title={r.why}>{r.title}. <span>{r.detail}</span></li>)}
        </ul>
      )}
      {type.params.filter((p) => !p.when || p.when(bit)).map((p) => <Param key={p.key} bit={bit} p={p} />)}
      {freehand && (
        <div className="actions">
          <button className={drawing === bit.id ? 'on' : ''} onClick={() => setView({ drawing: drawing === bit.id ? null : bit.id, tool: null })}>
            {drawing === bit.id ? 'Done' : 'Draw path'}
          </button>
          <span className="muted small">{bit.points?.length ?? 0} points</span>
          <button onClick={() => setBit({ points: [] })} disabled={!bit.points?.length}>Clear</button>
        </div>
      )}
      {bit.type === 'handle' && <p className="hint">Drag the orange dots on the body to move the top and bottom attachments.</p>}
      {type.addsMass !== false && (
        <label className="field wide">
          <span>Glass</span>
          <select value={bit.glass} onChange={(e) => setBit({ glass: e.target.value })}>
            {glasses.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
      )}
      <div className="actions">
        {!type.single && (
          <>
            <button onClick={() => duplicateBit(bit.id)} title="⌘D">Duplicate</button>
            <span className="array">
              <button onClick={() => radialArray(bit.id, count)}>Ring of</button>
              <input type="number" min={2} max={24} value={count} aria-label="How many around"
                onChange={(e) => setCount(Math.max(2, Math.min(24, parseInt(e.target.value) || 2)))} />
            </span>
          </>
        )}
        <button className="danger" onClick={() => removeBit(bit.id)} title="Delete">Remove</button>
      </div>
    </div>
  )
}
