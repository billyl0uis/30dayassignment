import { useEffect, useRef, useState } from 'react'
import { downloadText, fileSlug } from '@core/ui/files'
import { downloadBlob, svgToPng } from '@core/ui/svgExport'
import { PAGES } from './views.js'
import { ViewsSheet } from './ViewsSheet.jsx'

// PNGs at this many dots per inch: sharp enough to print from a phone.
const PNG_DPI = 200

// The sheet as a standalone SVG file: sized in mm, so a drawing program
// opens it at true scale. Page styling stays behind (as svgToPng does).
function svgFile(svg) {
  const copy = svg.cloneNode(true)
  copy.removeAttribute('class')
  copy.removeAttribute('style')
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(copy)}`
}

export function ViewsSheetView({ d, onClose }) {
  const [page, setPage] = useState(d.units === 'in' ? 'letter' : 'a4')
  const [busy, setBusy] = useState(false)
  // The day the sheet was made, as it will save.
  const [date] = useState(() => new Date().toLocaleDateString())
  const svgRef = useRef(null)
  const name = `${fileSlug(d.name)}-views`

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const png = async () => {
    setBusy(true)
    try {
      const widthPx = Math.round((PAGES[page].w / 25.4) * PNG_DPI)
      downloadBlob(`${name}.png`, await svgToPng(svgRef.current, { widthPx }))
    } finally {
      setBusy(false)
    }
  }

  const button = 'rounded border border-line px-3 py-1 text-sm text-mute hover:text-ink disabled:opacity-50'
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ground/95" role="dialog" aria-modal="true" aria-label="Views sheet">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2">
        <h2 className="mr-auto font-semibold">Views sheet</h2>
        <select
          value={page}
          onChange={(e) => setPage(e.target.value)}
          aria-label="Paper size"
          className="rounded border border-line bg-raise px-2 py-1 text-sm text-mute outline-none focus:border-accent"
        >
          {Object.entries(PAGES).map(([key, p]) => (
            <option key={key} value={key}>
              {p.label}, landscape
            </option>
          ))}
        </select>
        <button type="button" onClick={() => downloadText(`${name}.svg`, svgFile(svgRef.current), 'image/svg+xml')} className="rounded bg-accent px-3 py-1 text-sm font-semibold text-accent-ink">
          Download SVG
        </button>
        <button type="button" onClick={png} disabled={busy} className={button}>
          {busy ? 'Making PNG…' : 'Download PNG'}
        </button>
        <button type="button" onClick={onClose} className={button}>
          Close
        </button>
      </div>
      <p className="px-4 pt-2 text-xs text-faint">
        SVG keeps true size, so it opens to scale in Illustrator or Inkscape; print at 100% (turn off “fit to page”) to keep the stated scale.
      </p>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <ViewsSheet d={d} page={page} date={date} svgRef={svgRef} className="mx-auto block h-auto w-full max-w-[1100px] shadow-2xl" />
      </div>
    </div>
  )
}
