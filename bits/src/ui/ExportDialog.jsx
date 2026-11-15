import { useEffect, useMemo, useRef, useState } from 'react'
import { download } from '@jackline/download.js'
import { useLiquid } from '../model/derived.js'
import { scheduleRows, totals } from '../model/describe.js'
import { useStore } from '../model/store.js'
import { captureViews } from '../scene/Capture.jsx'
import { useChecks } from './Checks.jsx'
import { PAPER, composeSheet } from './sheet.js'

const today = () => new Date().toISOString().slice(0, 10)
const slug = (s) => (s || 'piece').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// The views sheet: fill in the title block, see it, then save a PNG or
// print it (choose "Save as PDF" in the print dialog for a PDF).
export default function ExportDialog({ onClose }) {
  const units = useStore((s) => s.units)
  const piece = useStore((s) => s.pieceName)
  const maker = useStore((s) => s.maker)
  const paper = useStore((s) => s.paper)
  const bits = useStore((s) => s.bits)
  const glasses = useStore((s) => s.glasses)
  const [date, setDate] = useState(today)
  const [shot, setShot] = useState(null)
  const [error, setError] = useState(null)
  const { empty: m, filled, worst } = useLiquid()
  const checks = useChecks()
  const dialog = useRef()

  // Render the four views once when the dialog opens.
  useEffect(() => {
    dialog.current?.showModal()
    const tags = m.bits.map((b, i) => ({ n: i + 1, point: b.tag.point, normal: b.tag.normal }))
    captureViews(tags).then(setShot, (e) => setError(String(e.message ?? e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-lay the page (cheap) whenever a field changes.
  const canvas = useMemo(() => {
    if (!shot) return null
    return composeSheet(shot, {
      piece, maker, date, units, paper,
      rows: scheduleRows({ bits, m, glasses, units }),
      totals: totals({ m, filled: filled.capacity > 0.5 ? filled : null, worst, checks, units }),
      checks,
      fillPct: filled.capacity > 0.5 ? Math.round(filled.fill * 100) : null,
    })
  }, [shot, piece, maker, date, units, paper, bits, m, glasses, filled, worst, checks])
  const preview = useMemo(() => canvas?.toDataURL('image/png'), [canvas])

  const name = `bits-${slug(piece)}-${date}`
  const savePng = () => canvas.toBlob((b) => b && download(b, `${name}.png`), 'image/png')
  const print = () => printSheet(preview, PAPER[paper].css, name)

  const { live, checkpoint, setView } = useStore.getState()
  return (
    <dialog ref={dialog} className="export" onClose={onClose} onCancel={onClose}>
      <header>
        <h2>Views sheet</h2>
        <button className="icon" aria-label="Close" onClick={() => dialog.current.close()}>×</button>
      </header>
      <div className="export-body">
        <div className="export-fields">
          <label className="field wide">
            <span>Piece</span>
            <input value={piece} onFocus={checkpoint} onChange={(e) => live({ pieceName: e.target.value })} />
          </label>
          <label className="field wide">
            <span>Maker</span>
            <input value={maker} placeholder="Your name" onChange={(e) => setView({ maker: e.target.value })} />
          </label>
          <label className="field wide">
            <span>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field wide">
            <span>Paper</span>
            <select value={paper} onChange={(e) => setView({ paper: e.target.value })}>
              {Object.entries(PAPER).map(([id, p]) => <option key={id} value={id}>{p.label} landscape</option>)}
            </select>
          </label>
          <div className="field wide">
            <span>Units</span>
            <div className="seg" role="group" aria-label="Units">
              <button className={units === 'mm' ? 'on' : ''} onClick={() => setView({ units: 'mm' })}>mm · g</button>
              <button className={units === 'in' ? 'on' : ''} onClick={() => setView({ units: 'in' })}>in · g</button>
            </div>
          </div>
          <div className="export-actions">
            <button className="primary" disabled={!canvas} onClick={savePng}>Download PNG</button>
            <button disabled={!canvas} onClick={print}>Print / save as PDF</button>
          </div>
          <p className="hint">For a PDF, choose “Save as PDF” as the printer. Print at 100% (no “fit to page”) and the scale bar stays true.</p>
        </div>
        <div className="export-preview">
          {error ? <p className="empty">Couldn’t draw the views: {error}</p> : preview ? <img src={preview} alt="Views sheet preview" /> : <p className="empty">Drawing the views…</p>}
        </div>
      </div>
    </dialog>
  )
}

// Print the sheet image alone, on landscape paper, then tidy up.
function printSheet(src, pageCss, title) {
  const root = document.createElement('div')
  root.id = 'print-sheet'
  const img = new Image()
  img.src = src
  root.appendChild(img)
  const style = document.createElement('style')
  style.textContent = `@page { size: ${pageCss}; margin: 0; }
    @media print {
      body > *:not(#print-sheet) { display: none !important; }
      #print-sheet { display: block !important; }
      #print-sheet img { width: 100vw; height: 100vh; object-fit: contain; display: block; }
    }
    #print-sheet { display: none; }`
  document.body.append(root, style)
  const was = document.title
  document.title = title
  const done = () => {
    root.remove()
    style.remove()
    document.title = was
    window.removeEventListener('afterprint', done)
  }
  window.addEventListener('afterprint', done)
  img.decode().then(() => window.print(), () => window.print())
}
