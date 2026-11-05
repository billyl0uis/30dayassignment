import { download, stamp } from '../download.js'
import { fmtLen } from '../model/units.js'

// A 1:1 profile drawing to print and work against at the bench: the full
// silhouette, the wall in section, the center line and the key sizes.
export function exportTemplate(sec, metrics, units, name) {
  const pad = 2
  const half = metrics.maxD / 2
  const x0 = -half - pad, w = half * 2 + pad * 2
  const h = sec.height + pad * 2 + 1
  const y = (v) => (sec.height + pad - v).toFixed(3)
  const path = (pts, flip = 1) => 'M' + pts.map(([r, v]) => `${(r * flip).toFixed(3)} ${y(v)}`).join('L') + 'Z'
  const rim = sec.outer[sec.outer.length - 1]
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(2)}cm" height="${h.toFixed(2)}cm" viewBox="${x0.toFixed(3)} 0 ${w.toFixed(3)} ${h.toFixed(3)}" font-family="Helvetica, Arial, sans-serif">
  <title>${name} profile, 1:1</title>
  <path d="${path(sec.section, -1)}" fill="none" stroke="#000" stroke-width="0.03"/>
  <path d="${path(sec.section)}" fill="#bcd7e8" stroke="#000" stroke-width="0.03"/>
  <line x1="0" x2="0" y1="0.3" y2="${(h - 0.3).toFixed(2)}" stroke="#000" stroke-width="0.02" stroke-dasharray="0.6 0.2 0.1 0.2"/>
  <line x1="${x0}" x2="${x0 + w}" y1="${y(0)}" y2="${y(0)}" stroke="#000" stroke-width="0.02"/>
  <text x="${(x0 + 0.3).toFixed(2)}" y="0.8" font-size="0.45">${name} · ${fmtLen(metrics.height, units)} tall · rim ⌀ ${fmtLen(metrics.rimD, units)} · foot ⌀ ${fmtLen(metrics.footD, units)} · wall ${fmtLen(metrics.wall, units)}</text>
  <text x="${(x0 + 0.3).toFixed(2)}" y="1.35" font-size="0.32" fill="#555">Print at 100% (actual size). Check: the bar below is 5 cm.</text>
  <rect x="${(x0 + 0.3).toFixed(2)}" y="${(h - 0.7).toFixed(2)}" width="5" height="0.2" fill="#000"/>
  <circle cx="${rim[0].toFixed(3)}" cy="${y(rim[1])}" r="0.08" fill="#000"/>
</svg>`
  download(new Blob([svg], { type: 'image/svg+xml' }), `jackline-template-${stamp()}.svg`)
}
