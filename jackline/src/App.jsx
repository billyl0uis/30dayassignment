import { useEffect } from 'react'
import { useStore } from './model/store.js'
import Viewport from './scene/Viewport.jsx'
import Toolbar from './ui/Toolbar.jsx'
import PresetStrip from './ui/PresetStrip.jsx'
import ProfileEditor from './ui/ProfileEditor.jsx'
import SidePanel from './ui/SidePanel.jsx'

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
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && s.selected != null) {
        e.preventDefault()
        s.removePoint(s.selected)
      } else if (e.key.startsWith('Arrow') && s.selected != null) {
        // Nudge the selected point: a millimetre, or a centimetre with Shift.
        e.preventDefault()
        const step = e.shiftKey ? 1 : 0.1
        const [dr, dy] = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key]
        const points = s.points.map((p) => [...p])
        const p = points[s.selected]
        points[s.selected] = [Math.max(0.1, p[0] + dr), s.selected === 0 ? 0 : Math.max(0, p[1] + dy)]
        s.change({ points })
      } else if (e.key === 'Escape') {
        s.setView({ selected: null })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

export default function App() {
  useShortcuts()
  const theme = useStore((s) => s.theme)
  return (
    <div className="app" data-theme={theme}>
      <Toolbar />
      <section className="draw">
        <PresetStrip />
        <ProfileEditor />
      </section>
      <main className="stage">
        <Viewport />
      </main>
      <SidePanel />
    </div>
  )
}
