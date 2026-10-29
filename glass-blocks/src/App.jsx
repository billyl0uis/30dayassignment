import { useEffect } from 'react'
import { useStore } from './model/store.js'
import Viewport from './scene/Viewport.jsx'
import Toolbar from './ui/Toolbar.jsx'
import PresetShelf from './ui/PresetShelf.jsx'
import PartPanel from './ui/PartPanel.jsx'
import StackList from './ui/StackList.jsx'

function useShortcuts() {
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest('input, textarea, select')) return
      const s = useStore.getState()
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        e.shiftKey ? s.redo() : s.undo()
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        s.redo()
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && s.selectedId) {
        e.preventDefault()
        s.removeSelected()
      } else if (e.key === 'Escape') {
        s.select(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

export default function App() {
  useShortcuts()
  const theme = useStore((s) => s.theme)
  const empty = useStore((s) => s.parts.length === 0)
  const addGoblet = useStore((s) => s.addGoblet)
  return (
    <div className="app" data-theme={theme}>
      <Toolbar />
      <PresetShelf />
      <main className="stage">
        <Viewport />
        {empty && (
          <div className="empty">
            <p>Pick a shape to start building.</p>
            <button onClick={addGoblet}>Or start from a goblet</button>
          </div>
        )}
      </main>
      <aside className="side">
        <PartPanel />
        <StackList />
      </aside>
    </div>
  )
}
