import { useMemo } from 'react'
import { PRESETS } from '../geometry/presets.js'
import { useLiveParts, useStore } from '../model/store.js'
import { pieceHeight } from '../model/layout.js'
import { formatLength } from '../model/units.js'
import ShapeIcon from './ShapeIcon.jsx'

// The piece from the lip down, the way you'd read it standing at the bench.
export default function StackList() {
  const parts = useLiveParts()
  const selectedId = useStore((s) => s.selectedId)
  const units = useStore((s) => s.units)
  const { select, nudgeOrder } = useStore.getState()
  const height = useMemo(() => pieceHeight(parts), [parts])
  if (!parts.length) return null
  return (
    <section className="stack">
      <header>
        <h3>Stack</h3>
        <span className="muted">{formatLength(height, units)} {units} tall</span>
      </header>
      <ol>
        {[...parts].reverse().map((p) => {
          const on = p.id === selectedId
          return (
            <li key={p.id} className={on ? 'on' : ''}>
              <button className="stack-row" onClick={() => select(on ? null : p.id)}>
                <span className="dot" style={{ '--c': p.material.color }} />
                <ShapeIcon preset={p.preset} size={20} />
                <span className="name">{PRESETS[p.preset].label}</span>
                {p.mode === 'free' && <span className="tag">free</span>}
              </button>
              {on && (
                <span className="order">
                  <button onClick={() => nudgeOrder(p.id, 1)} title="Move up the stack" aria-label="Move up">↑</button>
                  <button onClick={() => nudgeOrder(p.id, -1)} title="Move down the stack" aria-label="Move down">↓</button>
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
