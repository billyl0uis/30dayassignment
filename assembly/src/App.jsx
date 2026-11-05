import { useEffect, useRef } from 'react'
import { useStore } from './store.js'
import { sceneFromJSON, sceneToJSON } from './core/scene.js'
import PartList from './ui/PartList.jsx'
import PartEditor from './ui/PartEditor.jsx'
import Readouts from './ui/Readouts.jsx'
import SectionPreview from './ui/SectionPreview.jsx'
import PlacementPanel, { StagePanel } from './ui/PlacementPanel.jsx'
import ChecksPanel, { ContactsPanel } from './ui/ChecksPanel.jsx'
import Viewport from './scene/Viewport.jsx'
import { Segmented } from './ui/fields.jsx'

const STAGE_NOTE = {
  '3d': 'Drag a part to move it; it drops onto what’s below. Shift snaps to 10 mm. R turns 15°, ⌘D duplicates, arrows nudge. Drag empty space to orbit.',
  top: 'Top-down footprint: the dashed rectangle is the group’s bounding box on the base. Drag parts here too.',
  section: 'Section view of the selected part, to scale on a 1 cm grid.',
}

export default function App() {
  const { scene, undo, redo, past, future, addPart, loadScene, newScene, view, setView, setMode } = useStore()
  const fileRef = useRef(null)

  useEffect(() => {
    // Shortcuts: ⌘Z / ⇧⌘Z undo/redo, R / ⇧R turn 15°, ⌘D duplicate,
    // arrows nudge 5 mm (⇧ 1 mm), Delete removes, Esc deselects.
    const onKey = (e) => {
      if (e.target.closest('input, select, textarea')) return
      const st = useStore.getState()
      const mod = e.metaKey || e.ctrlKey
      const k = e.key.toLowerCase()
      if (mod && k === 'z') {
        e.preventDefault()
        e.shiftKey ? redo() : undo()
        return
      }
      const part = st.scene.parts.find((p) => p.id === st.selectedId)
      if (k === 'escape') return st.select(null)
      if (!part) return
      if (mod && k === 'd') {
        e.preventDefault()
        st.duplicate(part.id)
      } else if (!mod && k === 'r') {
        st.placePart(part.id, { yaw: ((part.pose.yaw + (e.shiftKey ? -15 : 15) + 540) % 360) - 180 })
      } else if (k === 'delete' || k === 'backspace') {
        e.preventDefault()
        st.removePart(part.id)
      } else if (k.startsWith('arrow')) {
        e.preventDefault()
        const step = e.shiftKey ? 1 : 5
        const dx = k === 'arrowleft' ? -step : k === 'arrowright' ? step : 0
        const dz = k === 'arrowup' ? -step : k === 'arrowdown' ? step : 0
        st.placePart(part.id, { x: part.pose.x + dx, z: part.pose.z + dz })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  const save = () => {
    const blob = new Blob([sceneToJSON(scene)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${(scene.name || 'assembly').replace(/[^\w-]+/g, '-').toLowerCase()}.assembly.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const open = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try {
      loadScene(sceneFromJSON(await f.text()))
    } catch (err) {
      alert(`Couldn’t open that file: ${err.message}`)
    }
  }

  return (
    <div className="app" data-theme="dark">
      <header className="toolbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden />
          Assembly
        </div>
        <div className="tool-group">
          <span className="note">Add</span>
          <button onClick={() => addPart('blown')}>Blown form</button>
          <button onClick={() => addPart('solid')}>Solid</button>
          <button onClick={() => addPart('cane')}>Cane rod</button>
        </div>
        <div className="tool-group">
          <span className="note">Mode</span>
          <Segmented small value={scene.mode} options={[['field', 'Field'], ['stacked', 'Stacked'], ['leaning', 'Leaning'], ['hung', 'Hung']]} onChange={setMode} />
        </div>
        <div className="tool-group">
          <button onClick={undo} disabled={!past.length} title="Undo (⌘Z)">Undo</button>
          <button onClick={redo} disabled={!future.length} title="Redo (⇧⌘Z)">Redo</button>
        </div>
        <div className="tool-group end">
          <button onClick={newScene}>New</button>
          <button onClick={() => fileRef.current.click()}>Open…</button>
          <button className="primary" onClick={save}>Save JSON</button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={open} />
        </div>
      </header>
      <aside className="shelf">
        <PartList />
        <ChecksPanel />
      </aside>
      <main className="stage">
        {/* The 3D view stays mounted (remounting the canvas is slow and drops its labels); the section view lies over it. */}
        <Viewport />
        {view === 'section' && <div className="section-over"><SectionPreview /></div>}
        <div className="view-switch">
          <Segmented small value={view} options={[['3d', '3D'], ['top', 'Top (footprint)'], ['section', 'Section']]} onChange={setView} />
        </div>
        <p className="stage-note">{STAGE_NOTE[view]}</p>
      </main>
      <aside className="side">
        <PartEditor />
        <PlacementPanel />
        <ContactsPanel />
        <Readouts />
        <StagePanel />
      </aside>
    </div>
  )
}
