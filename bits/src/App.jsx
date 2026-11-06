import { useEffect, useState } from 'react'
import { useStore } from './model/store.js'
import Viewport from './scene/Viewport.jsx'
import BitsPanel from './ui/BitsPanel.jsx'
import BodyPanel from './ui/BodyPanel.jsx'
import Readout from './ui/Readout.jsx'
import ExportDialog from './ui/ExportDialog.jsx'

function useShortcuts() {
  useEffect(() => {
    const onKey = (e) => {
      // Not while typing, and not inside the views-sheet dialog.
      if (e.target.closest('input, textarea, select, dialog')) return
      const s = useStore.getState()
      const mod = e.metaKey || e.ctrlKey
      const k = e.key.toLowerCase()
      if (mod && k === 'z') {
        e.preventDefault()
        e.shiftKey ? s.redo() : s.undo()
      } else if (mod && k === 'y') {
        e.preventDefault()
        s.redo()
      } else if (mod && k === 'd' && s.selected) {
        e.preventDefault()
        s.duplicateBit(s.selected)
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (s.selected) (e.preventDefault(), s.removeBit(s.selected))
        else if (s.selectedPoint != null) (e.preventDefault(), s.removePoint(s.selectedPoint))
      } else if (e.key === 'Escape') {
        s.setView(s.drawing ? { drawing: null } : s.tool ? { tool: null } : { selected: null, selectedPoint: null })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

function Toolbar({ onSheet }) {
  const units = useStore((s) => s.units)
  const pieceName = useStore((s) => s.pieceName)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const { undo, redo, setView, live, checkpoint, reset } = useStore.getState()
  return (
    <header className="toolbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden />
        Bits
      </div>
      <input className="piece-name" value={pieceName} aria-label="Piece name" onFocus={checkpoint} onChange={(e) => live({ pieceName: e.target.value })} />
      <div className="tool-group">
        <button onClick={undo} disabled={!canUndo} title="⌘Z">Undo</button>
        <button onClick={redo} disabled={!canRedo} title="⇧⌘Z">Redo</button>
      </div>
      <div className="tool-group end">
        <div className="seg" role="group" aria-label="Units">
          <button className={units === 'mm' ? 'on' : ''} onClick={() => setView({ units: 'mm' })}>mm</button>
          <button className={units === 'in' ? 'on' : ''} onClick={() => setView({ units: 'in' })}>in</button>
        </div>
        <button onClick={reset} title="Back to a plain tumbler, no bits (undoable)">New piece</button>
        <button className="primary" onClick={onSheet} title="Front, side, top and 3/4 views with a bit schedule, as PNG or PDF">Views sheet</button>
      </div>
    </header>
  )
}

export default function App() {
  useShortcuts()
  const [sheet, setSheet] = useState(false)
  return (
    <div className="app">
      <Toolbar onSheet={() => setSheet(true)} />
      {sheet && <ExportDialog onClose={() => setSheet(false)} />}
      <BodyPanel />
      <main className="stage">
        <Viewport />
        <Readout />
      </main>
      <BitsPanel />
    </div>
  )
}
