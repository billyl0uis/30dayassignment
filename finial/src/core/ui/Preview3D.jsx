import { useEffect, useRef, useState } from 'react'
import { PreviewScene } from '../render/previewScene'

const hasWebGL = () => {
  try {
    return !!document.createElement('canvas').getContext('webgl2')
  } catch {
    return false
  }
}

// The vessel in 3D, rebuilt as the section changes. Drag to orbit, scroll
// to zoom. Cutaway shows the back half with the wall in section.
export function Preview3D({ section, color = '#dff4f2', cutaway = false, background }) {
  const canvasRef = useRef(null)
  const sceneRef = useRef(null)
  const [failed] = useState(() => !hasWebGL())

  useEffect(() => {
    if (failed) return
    const scene = new PreviewScene(canvasRef.current, { background })
    sceneRef.current = scene
    const observer = new ResizeObserver(([entry]) => scene.resize(entry.contentRect.width, entry.contentRect.height))
    observer.observe(canvasRef.current)
    return () => {
      observer.disconnect()
      scene.dispose()
      sceneRef.current = null
    }
  }, [background, failed])

  useEffect(() => {
    sceneRef.current?.setSection(section, { cutaway })
  }, [section, cutaway])

  useEffect(() => {
    sceneRef.current?.setColor(color)
  }, [color])

  if (failed)
    return <p className="grid h-full place-items-center p-6 text-center text-sm text-mute">3D needs WebGL, which this browser has turned off. The drawing and numbers still work.</p>

  return (
    <div className="relative h-full w-full">
      <canvas ref={canvasRef} className="block h-full w-full" aria-label="3D preview of the vessel" />
      <button
        type="button"
        onClick={() => sceneRef.current?.fit()}
        className="absolute right-2 bottom-2 rounded border border-line bg-panel/80 px-2 py-1 text-xs text-mute hover:text-ink"
      >
        Reset view
      </button>
    </div>
  )
}
