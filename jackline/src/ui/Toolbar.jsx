import { useDerived } from '../model/derived.js'
import { PRESETS } from '../model/presets.js'
import { useStore } from '../model/store.js'
import { exportTemplate } from './exportTemplate.js'

export default function Toolbar() {
  const s = useStore()
  const { sec, metrics } = useDerived()
  return (
    <header className="toolbar">
      <div className="brand">
        <span className="brand-mark" />
        Jackline
      </div>
      <div className="tool-group">
        <button onClick={s.undo} disabled={!s.past.length} title="Undo (⌘Z)">Undo</button>
        <button onClick={s.redo} disabled={!s.future.length} title="Redo (⇧⌘Z)">Redo</button>
      </div>
      <div className="tool-group">
        <div className="segmented">
          <button className={s.units === 'cm' ? 'on' : ''} onClick={() => s.setView({ units: 'cm' })}>cm</button>
          <button className={s.units === 'in' ? 'on' : ''} onClick={() => s.setView({ units: 'in' })}>in</button>
        </div>
        <button className={s.cutaway ? 'on' : ''} onClick={() => s.setView({ cutaway: !s.cutaway })} title="Slice the piece in half to see the wall">
          Cutaway
        </button>
        <button className={s.turntable && !s.cutaway ? 'on' : ''} disabled={s.cutaway} onClick={() => s.setView({ turntable: !s.turntable })}>
          Spin
        </button>
        <button onClick={() => s.setView({ theme: s.theme === 'dark' ? 'light' : 'dark' })}>{s.theme === 'dark' ? 'Light' : 'Dark'}</button>
      </div>
      <div className="tool-group end">
        <button onClick={() => exportTemplate(sec, metrics, s.units, PRESETS[s.preset]?.name ?? 'Vessel')} title="A 1:1 profile drawing to print">
          Profile template
        </button>
        <button onClick={() => s.setView({ sheet: true })} disabled={s.sheet} title="Top, front, side and 3/4 views on one sheet, with sizes">
          Views sheet
        </button>
        <button className="primary" onClick={() => s.setView({ capturing: true })}>Save picture</button>
      </div>
    </header>
  )
}
