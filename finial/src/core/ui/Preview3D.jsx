import { useEffect, useMemo, useRef, useState } from 'react'
import { PreviewScene } from '../render/previewScene'
import { VIEWS } from '../render/views'
import { fileSlug } from './files'
import { downloadBlob } from './svgExport'

const hasWebGL = () => {
  try {
    return !!document.createElement('canvas').getContext('webgl2')
  } catch {
    return false
  }
}

// The vessel in 3D, rebuilt as it changes. Drag to orbit, scroll to zoom.
// Cutaway shows the back half with the wall in section. Give it one
// section (wall.js buildSection), or parts: { polygons, lift, color }
// (core/render/previewScene.js setParts) for several pieces. When
// frameKey changes (a different piece loaded), the view is framed afresh.
//
// Named views (3D, Above, and flat Front, Top, Bottom) and Save image, a
// PNG of the view as it is, named after snapshotName.
export function Preview3D({ section, parts, color = '#dff4f2', cutaway = false, background, frameKey, snapshotName = 'vessel' }) {
  const canvasRef = useRef(null)
  const sceneRef = useRef(null)
  const [failed] = useState(() => !hasWebGL())
  const shown = useMemo(() => parts ?? [{ polygons: [section.glass] }], [parts, section])
  // The named view in use; null once it's been turned by hand.
  const [view, setView] = useState('3d')
  const [backdrop, setBackdrop] = useState('scene')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (failed) return
    const scene = new PreviewScene(canvasRef.current, { background })
    sceneRef.current = scene
    scene.onUserMove = () => setView(null)
    const observer = new ResizeObserver(([entry]) => scene.resize(entry.contentRect.width, entry.contentRect.height))
    observer.observe(canvasRef.current)
    return () => {
      observer.disconnect()
      scene.dispose()
      sceneRef.current = null
    }
  }, [background, failed])

  useEffect(() => {
    sceneRef.current?.setParts(shown, { cutaway })
  }, [shown, cutaway])

  // A newly loaded piece is framed in the 3D view.
  const [framedKey, setFramedKey] = useState(frameKey)
  if (frameKey !== framedKey) {
    setFramedKey(frameKey)
    setView('3d')
  }
  useEffect(() => {
    sceneRef.current?.fit()
  }, [frameKey])

  const show = (key) => {
    sceneRef.current?.setView(key)
    setView(key)
  }

  const save = async () => {
    if (!sceneRef.current) return
    setSaving(true)
    try {
      const blob = await sceneRef.current.snapshot({ backdrop })
      downloadBlob(`${fileSlug(snapshotName)}-${view ?? 'view'}.png`, blob)
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    sceneRef.current?.setColor(color)
  }, [color])

  if (failed)
    return <p className="grid h-full place-items-center p-6 text-center text-sm text-mute">3D needs WebGL, which this browser has turned off. The drawing and numbers still work.</p>

  return (
    <div className="flex h-full w-full flex-col">
      <canvas ref={canvasRef} className="block min-h-0 w-full flex-1" aria-label="3D preview of the vessel" />
      {/* Below the picture, not over it, so a saved image shows what you framed. */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line p-2 text-xs">
        <div className="flex rounded border border-line" role="group" aria-label="View">
          {Object.entries(VIEWS).map(([key, v]) => (
            <button
              key={key}
              type="button"
              aria-pressed={view === key}
              title={v.flat ? `${v.label}, flat (no perspective)` : v.label}
              onClick={() => show(key)}
              className={`px-2 py-1 ${view === key ? 'bg-raise text-ink' : 'text-mute hover:text-ink'}`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <select
            value={backdrop}
            onChange={(e) => setBackdrop(e.target.value)}
            aria-label="Image background"
            className="rounded border border-line bg-raise px-1 py-1 text-mute outline-none focus:border-accent"
          >
            <option value="scene">Grey</option>
            <option value="white">White</option>
            <option value="clear">Clear</option>
          </select>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded border border-line px-2 py-1 text-mute hover:text-ink disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save image'}
          </button>
        </div>
      </div>
    </div>
  )
}
