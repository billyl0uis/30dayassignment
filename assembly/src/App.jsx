import { useEffect, useRef } from 'react'
import { useStore } from './store.js'
import { sceneFromJSON, sceneToJSON } from './core/scene.js'
import PartList from './ui/PartList.jsx'
import PartEditor from './ui/PartEditor.jsx'
import Readouts from './ui/Readouts.jsx'
import SectionPreview from './ui/SectionPreview.jsx'

export default function App() {
  const { scene, undo, redo, past, future, addPart, loadScene, newScene } = useStore()
  const fileRef = useRef(null)

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest('input, select, textarea')) return
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        e.shiftKey ? redo() : undo()
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
      </aside>
      <main className="stage">
        <SectionPreview />
        <p className="stage-note">Section view of the selected part. The 3D arrangement view comes in step 2.</p>
      </main>
      <aside className="side">
        <PartEditor />
        <Readouts />
      </aside>
    </div>
  )
}
