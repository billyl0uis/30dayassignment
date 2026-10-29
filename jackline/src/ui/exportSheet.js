import { download, stamp } from '../download.js'
import { CM_PER_IN, fmtLen, fmtMass, fmtVol } from '../model/units.js'

const PAPER = {
  light: { bg: '#f6f2eb', card: '#ebe6dd', ink: '#24211d', muted: '#736c61', line: '#d9d1c4' },
  dark: { bg: '#15171c', card: '#1c1f26', ink: '#ece8e0', muted: '#9097a3', line: '#2e333e' },
}
const HOT = '#ff8a3d'
const FONT = '"Bricolage Grotesque", ui-rounded, system-ui, sans-serif'
const M = 64, GAP = 36, TITLE = 190

// Lays the views out as a design sheet in third-angle projection: top above
// front, right side beside front, the 3/4 view in the spare corner. The flat
// views carry dimensions, and a scale bar ties them to real size.
export function drawSheet({ images, box, center: c, cmPerPx: k, cell }, { metrics, units, theme, name }) {
  const p = PAPER[theme] ?? PAPER.light
  const W = M * 2 + cell * 2 + GAP
  const H = M * 2 + cell * 2 + GAP + TITLE
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const g = canvas.getContext('2d')
  g.fillStyle = p.bg
  g.fillRect(0, 0, W, H)

  const left = M, right = M + cell + GAP, upper = M, lower = M + cell + GAP
  const cells = {
    top: { x: left, y: upper, label: 'Top' },
    hero: { x: right, y: upper, label: '3/4 view' },
    front: { x: left, y: lower, label: 'Front' },
    side: { x: right, y: lower, label: 'Right side' },
  }
  for (const [key, at] of Object.entries(cells)) {
    g.save()
    g.beginPath()
    g.roundRect(at.x, at.y, cell, cell, 14)
    g.clip()
    g.drawImage(images[key], at.x, at.y)
    g.restore()
    g.strokeStyle = p.line
    g.lineWidth = 2
    g.beginPath()
    g.roundRect(at.x, at.y, cell, cell, 14)
    g.stroke()
    pill(g, at.x + 18, at.y + 18, at.label.toUpperCase())
  }

  // World cm to sheet pixels for each flat view. The side view looks from
  // +x, so its right-hand direction is -z; the top view has the front (+z)
  // at the bottom, under the front view.
  const front = (x, y) => [left + cell / 2 + (x - c.x) / k, lower + cell / 2 - (y - c.y) / k]
  const side = (z, y) => [right + cell / 2 - (z - c.z) / k, lower + cell / 2 - (y - c.y) / k]
  const top = (x, z) => [left + cell / 2 + (x - c.x) / k, upper + cell / 2 + (z - c.z) / k]

  // Center lines: the throwing axis, as a long-dash-dot line.
  g.save()
  g.strokeStyle = HOT
  g.globalAlpha = 0.7
  g.lineWidth = 1.5
  g.setLineDash([22, 6, 4, 6])
  const past = 1.5 // cm beyond the piece
  line(g, front(0, box.min.y - past), front(0, box.max.y + past))
  line(g, side(0, box.min.y - past), side(0, box.max.y + past))
  line(g, top(box.min.x - past, 0), top(box.max.x + past, 0))
  line(g, top(0, box.min.z - past), top(0, box.max.z + past))
  g.restore()

  // Dimensions on the flat views.
  const off = 26
  dim(g, p, front(box.max.x, 0), front(box.max.x, box.max.y), fmtLen(box.max.y, units), { side: 'right', off })
  dim(g, p, front(box.min.x, box.min.y), front(box.max.x, box.min.y), fmtLen(box.max.x - box.min.x, units), { side: 'below', off })
  dim(g, p, side(box.max.z, box.min.y), side(box.min.z, box.min.y), fmtLen(box.max.z - box.min.z, units), { side: 'below', off })
  dim(g, p, top(box.min.x, box.min.z), top(box.max.x, box.min.z), fmtLen(box.max.x - box.min.x, units), { side: 'above', off })

  titleBlock(g, p, { x: M, y: M + cell * 2 + GAP + 28, w: W - M * 2, h: TITLE - 28 }, { metrics, units, name, k, tall: box.max.y })

  canvas.toBlob((blob) => blob && download(blob, `jackline-views-${stamp()}.png`), 'image/png')
}

function line(g, [x1, y1], [x2, y2]) {
  g.beginPath()
  g.moveTo(x1, y1)
  g.lineTo(x2, y2)
  g.stroke()
}

function pill(g, x, y, text) {
  g.font = `700 17px ${FONT}`
  const w = g.measureText(text).width + 22
  g.fillStyle = 'rgba(0,0,0,0.45)'
  g.beginPath()
  g.roundRect(x, y, w, 30, 15)
  g.fill()
  g.fillStyle = '#fff'
  g.textBaseline = 'middle'
  g.fillText(text, x + 11, y + 16)
}

// A drafting dimension: extension lines out from the piece, a line with
// end ticks, and the size in a little label so it reads over any backdrop.
function dim(g, p, a, b, label, { side, off }) {
  const vertical = side === 'right'
  const shift = side === 'right' ? [off, 0] : side === 'below' ? [0, off] : [0, -off]
  const A = [a[0] + shift[0], a[1] + shift[1]]
  const B = [b[0] + shift[0], b[1] + shift[1]]
  g.save()
  g.strokeStyle = HOT
  g.lineWidth = 1.5
  line(g, [a[0] + shift[0] * 0.25, a[1] + shift[1] * 0.25], [A[0] + shift[0] * 0.3, A[1] + shift[1] * 0.3])
  line(g, [b[0] + shift[0] * 0.25, b[1] + shift[1] * 0.25], [B[0] + shift[0] * 0.3, B[1] + shift[1] * 0.3])
  g.lineWidth = 2
  line(g, A, B)
  for (const [x, y] of [A, B]) line(g, vertical ? [x - 7, y] : [x, y - 7], vertical ? [x + 7, y] : [x, y + 7])
  g.font = `600 19px ${FONT}`
  const w = g.measureText(label).width + 16
  const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2
  const lx = vertical ? mx + 12 : mx - w / 2
  const ly = vertical ? my - 14 : my + (side === 'below' ? 10 : -38)
  g.fillStyle = p.bg
  g.globalAlpha = 0.9
  g.beginPath()
  g.roundRect(lx, ly, w, 28, 6)
  g.fill()
  g.globalAlpha = 1
  g.fillStyle = p.ink
  g.textBaseline = 'middle'
  g.fillText(label, lx + 8, ly + 15)
  g.restore()
}

function titleBlock(g, p, box, { metrics: m, units, name, k, tall }) {
  g.fillStyle = p.card
  g.strokeStyle = p.line
  g.lineWidth = 2
  g.beginPath()
  g.roundRect(box.x, box.y, box.w, box.h, 14)
  g.fill()
  g.stroke()

  const pad = 28
  g.textBaseline = 'alphabetic'
  g.fillStyle = p.ink
  g.font = `700 38px ${FONT}`
  g.fillText(name, box.x + pad, box.y + 58)
  g.fillStyle = p.muted
  g.font = `500 17px ${FONT}`
  g.fillText(`Jackline · ${new Date().toLocaleDateString()}${m.sculpted ? ' · sculpted' : ''}`, box.x + pad, box.y + 88)

  // Real-size scale bar: every flat view is drawn at this scale.
  const unit = units === 'in' ? CM_PER_IN : 1
  const steps = units === 'in' ? 2 : 5
  const bar = (steps * unit) / k
  const bx = box.x + pad, by = box.y + box.h - 34
  for (let i = 0; i < steps; i++) {
    g.fillStyle = i % 2 ? p.bg : p.ink
    g.fillRect(bx + (bar / steps) * i, by, bar / steps, 10)
  }
  g.strokeStyle = p.ink
  g.lineWidth = 1
  g.strokeRect(bx, by, bar, 10)
  g.fillStyle = p.muted
  g.font = `500 15px ${FONT}`
  g.fillText(units === 'in' ? '2 in' : '5 cm', bx + bar + 10, by + 10)
  g.fillText('Front, side and top share this scale', bx + bar + 60, by + 10)

  const facts = [
    // Overall, so it matches the drawing even when a spout lifts the lip.
    ['Height', fmtLen(tall, units)],
    ['Rim ⌀', fmtLen(m.rimD, units)],
    ['Foot ⌀', fmtLen(m.footD, units)],
    ['Widest', fmtLen(m.maxD, units)],
    ['Wall', fmtLen(m.wall, units, 2)],
    ['Holds', fmtVol(m.brimMl, units)],
    ['Weight', fmtMass(m.glassG, units)],
    ['Tips at', m.tip < 0 ? "won't stand" : `${Math.round(m.tip)}°`],
  ]
  const cols = 4, colW = 170
  const fx = box.x + box.w - pad - cols * colW
  facts.forEach(([label, value], i) => {
    const x = fx + (i % cols) * colW
    const y = box.y + 44 + Math.floor(i / cols) * 58
    g.fillStyle = p.muted
    g.font = `500 15px ${FONT}`
    g.fillText(label.toUpperCase(), x, y)
    g.fillStyle = p.ink
    g.font = `600 24px ${FONT}`
    g.fillText(value, x, y + 28)
  })
}
