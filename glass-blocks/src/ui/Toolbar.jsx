import { useRef, useState } from 'react'
import { useStore } from '../model/store.js'
import { download, stamp } from '../download.js'
import { Segmented } from './fields.jsx'

export default function Toolbar() {
  const s = useStore()
  const file = useRef()
  const [note, setNote] = useState('')
  const flash = (msg) => {
    setNote(msg)
    setTimeout(() => setNote(''), 2600)
  }

  const save = () => {
    const blob = new Blob([JSON.stringify(s.designFile(), null, 2)], { type: 'application/json' })
    download(blob, `glass-design-${stamp()}.json`)
  }
  const open = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try {
      s.loadDesign(JSON.parse(await f.text()))
      flash(`Opened ${f.name}`)
    } catch (err) {
      flash(err.message.startsWith('That file') ? err.message : 'Couldn’t read that file.')
    }
  }

  return (
    <header className="toolbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        Glass Blocks
      </div>

      <div className="tool-group">
        <button onClick={s.undo} disabled={s.cursor === 0} title="Undo (⌘Z)">Undo</button>
        <button onClick={s.redo} disabled={s.cursor === s.steps.length} title="Redo (⇧⌘Z)">Redo</button>
      </div>

      <div className="tool-group">
        <button className={s.turntable ? 'on' : ''} onClick={s.toggleTurntable} aria-pressed={s.turntable} title="Spin the piece (pauses while something is selected)">
          Turntable
        </button>
        <Segmented small value={s.theme} options={[['dark', 'Dark'], ['light', 'Light']]} onChange={s.setTheme} />
        <Segmented small value={s.units} options={[['in', 'in'], ['cm', 'cm']]} onChange={s.setUnits} />
        <button className={s.fastGlass ? 'on' : ''} onClick={s.toggleFastGlass} aria-pressed={s.fastGlass} title="Simpler glass that draws faster">
          Fast glass
        </button>
      </div>

      <div className="tool-group end">
        {note && <span className="note" role="status">{note}</span>}
        <button onClick={s.newDesign} disabled={!s.parts.length} title="Start over (you can undo this)">New</button>
        <button onClick={() => file.current.click()}>Open</button>
        <button onClick={save} disabled={!s.parts.length}>Save</button>
        <button onClick={() => s.setCapturing('views')} disabled={!s.parts.length || !!s.capturing} title="Front, side, top and 3/4 views on one sheet, with sizes">
          Views
        </button>
        <button className="primary" onClick={() => s.setCapturing('png')} disabled={!s.parts.length || !!s.capturing} title="Save the view you're looking at">
          PNG
        </button>
        <input ref={file} type="file" accept=".json,application/json" hidden onChange={open} />
      </div>
    </header>
  )
}
