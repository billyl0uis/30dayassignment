import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { fileSlug } from '@core/ui/files'
import { downloadBlob, svgToPng } from '@core/ui/svgExport'
import { PAGES } from './pages'
import { ShopSheet } from './ShopSheet'

// PNGs at this many dots per inch: sharp enough to print from a phone.
const PNG_DPI = 200

// The shop sheet on screen, with Print (and so Save as PDF) and PNG. For
// printing, a second copy at true size goes outside the app, which print
// styles show alone (index.css, #print-sheet).
export function ShopSheetView({ d, onClose }) {
  const [page, setPage] = useState(d.units === 'in' ? 'letter' : 'a4')
  const [busy, setBusy] = useState(false)
  // The day the sheet was made, as it will print.
  const [date] = useState(() => new Date().toLocaleDateString())
  const svgRef = useRef(null)

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const png = async () => {
    setBusy(true)
    try {
      const widthPx = Math.round((PAGES[page].w / 25.4) * PNG_DPI)
      downloadBlob(`${fileSlug(d.name)}-shop-sheet.png`, await svgToPng(svgRef.current, { widthPx }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ground/95" role="dialog" aria-modal="true" aria-label="Shop sheet">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2">
        <h2 className="mr-auto font-semibold">Shop sheet</h2>
        <select
          value={page}
          onChange={(e) => setPage(e.target.value)}
          aria-label="Paper size"
          className="rounded border border-line bg-raise px-2 py-1 text-sm text-mute outline-none focus:border-accent"
        >
          {Object.entries(PAGES).map(([key, p]) => (
            <option key={key} value={key}>
              {p.label}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => window.print()} className="rounded bg-accent px-3 py-1 text-sm font-semibold text-accent-ink">
          Print / Save as PDF
        </button>
        <button type="button" onClick={png} disabled={busy} className="rounded border border-line px-3 py-1 text-sm text-mute hover:text-ink disabled:opacity-50">
          {busy ? 'Making PNG…' : 'Download PNG'}
        </button>
        <button type="button" onClick={onClose} className="rounded border border-line px-3 py-1 text-sm text-mute hover:text-ink">
          Close
        </button>
      </div>
      <p className="px-4 pt-2 text-xs text-faint">
        To keep the drawing at its stated scale, print at 100% (turn off “fit to page”).
      </p>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <ShopSheet d={d} page={page} date={date} svgRef={svgRef} className="mx-auto block h-auto w-full max-w-[820px] shadow-2xl" />
      </div>
      {createPortal(
        <div id="print-sheet">
          <style>{`@page { size: ${PAGES[page].css}; margin: 0; }`}</style>
          <ShopSheet d={d} page={page} date={date} />
        </div>,
        document.body,
      )}
    </div>
  )
}
