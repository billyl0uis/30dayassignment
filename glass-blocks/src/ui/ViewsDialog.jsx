import { useEffect, useMemo, useRef } from 'react'
import { useStore } from '../model/store.js'
import { download, stamp } from '../download.js'
import { VIEWS } from '../views/shoot.js'

// Shows the finished design sheet with a save button for it and for each view.
// One click per file, since browsers block a burst of downloads at once.
export default function ViewsDialog() {
  const views = useStore((s) => s.views)
  const setViews = useStore((s) => s.setViews)
  const close = () => setViews(null)
  const ref = useRef()
  const url = useMemo(() => views && URL.createObjectURL(views.sheet), [views])
  useEffect(() => () => url && URL.revokeObjectURL(url), [url])

  useEffect(() => {
    if (!views) return
    ref.current?.querySelector('button.primary')?.focus()
    const onKey = (e) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!views) return null
  const when = stamp()
  return (
    <div className="dialog-scrim" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="dialog views-dialog" role="dialog" aria-modal="true" aria-labelledby="views-title" ref={ref}>
        <header>
          <h2 id="views-title">Design views</h2>
          <button className="icon-btn" onClick={close} aria-label="Close">×</button>
        </header>
        <div className="sheet-frame">
          <img src={url} alt="Design sheet with top, 3/4, front and right side views and their dimensions" />
        </div>
        <footer>
          <button className="primary" onClick={() => download(views.sheet, `glass-blocks-sheet-${when}.png`)}>
            Save sheet
          </button>
          <span className="muted">or one view:</span>
          {VIEWS.map((v) => (
            <button key={v.id} onClick={() => download(views.images[v.id], `glass-blocks-${v.id === 'three' ? '3-4' : v.id}-${when}.png`)}>
              {v.label}
            </button>
          ))}
        </footer>
      </div>
    </div>
  )
}
