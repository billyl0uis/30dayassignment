// The views sheet: one landscape page, drawn on a canvas so the PNG and the
// printed PDF are the same picture.
//
//   title strip   piece · maker · date · units · scale bar
//   views         front · right side · top · 3/4, every bit numbered
//   bottom        bit schedule (left) · totals and checks (right)
import { CM_PER_IN } from '../model/units.js'

export const PAPER = {
  letter: { label: 'US Letter', w: 11, h: 8.5, css: 'letter landscape' },
  a4: { label: 'A4', w: 297, h: 210, css: 'A4 landscape' },
}

const W = 3000 // px across the page: 270+ dpi on Letter, 255 on A4
const M = 80
const FONT = '"Bricolage Grotesque", ui-rounded, system-ui, sans-serif'
const C = { bg: '#fbfaf6', ink: '#1f1c18', muted: '#6e675d', line: '#d8d1c4', card: '#f1ede5', hot: '#e8691c', warn: '#b7791f', note: '#2f6ea8', view: '#e4e1da' }

export function composeSheet(shot, info) {
  const paper = PAPER[info.paper] ?? PAPER.letter
  const H = Math.round((W * paper.h) / paper.w)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const g = canvas.getContext('2d')
  g.fillStyle = C.bg
  g.fillRect(0, 0, W, H)

  // Views: four across, at one shared scale for the three flat ones.
  const top = M + 170
  const gap = 34
  const cell = Math.floor((W - 2 * M - 3 * gap) / 4)
  const s = cell / shot.cell // sheet px per rendered px
  const cmPerPx = shot.cmPerPx / s
  const order = [['front', 'Front (6:00 toward you)'], ['side', 'Right side (3:00)'], ['top', 'Top (front at bottom)'], ['hero', '3/4 view (not to scale)']]
  order.forEach(([key, label], i) => drawView(g, shot.views[key], { x: M + i * (cell + gap), y: top, size: cell, s, label }))

  titleStrip(g, { x: M, y: M, w: W - 2 * M, h: 140 }, info, cmPerPx)

  // Bottom: schedule on the left, totals and checks on the right.
  const y0 = top + cell + 56
  const leftW = Math.round((W - 2 * M) * 0.62)
  const rightX = M + leftW + 50
  const rightW = W - M - rightX
  schedule(g, { x: M, y: y0, w: leftW, bottom: H - M }, info.rows)
  let y = totalsTable(g, { x: rightX, y: y0, w: rightW }, info.totals, info.fillPct)
  warnings(g, { x: rightX, y: y + 40, w: rightW, bottom: H - M - 40 }, info.checks)

  g.fillStyle = C.muted
  g.font = `500 22px ${FONT}`
  g.textBaseline = 'alphabetic'
  g.fillText('Bits · planning sheet. Every number is an estimate from the drawn shape, and every check is a rule-of-thumb warning, not a prediction.', M, H - M + 30)
  return canvas
}

function drawView(g, view, { x, y, size, s, label }) {
  g.save()
  g.beginPath()
  g.roundRect(x, y, size, size, 16)
  g.clip()
  g.fillStyle = C.view
  g.fillRect(x, y, size, size)
  g.drawImage(view.img, x, y, size, size)
  g.restore()
  g.strokeStyle = C.line
  g.lineWidth = 2
  g.beginPath()
  g.roundRect(x, y, size, size, 16)
  g.stroke()

  // Numbered callouts with leaders. Bits on the far side are drawn faint
  // with a dashed leader, so every bit is numbered in every view.
  const R = 21
  for (const mk of view.marks) {
    const ax = x + mk.at[0] * s, ay = y + mk.at[1] * s
    let lx = ax + mk.dir[0] * 70, ly = ay + mk.dir[1] * 70
    lx = Math.min(x + size - R - 6, Math.max(x + R + 6, lx))
    ly = Math.min(y + size - R - 6, Math.max(y + R + 46, ly))
    g.save()
    g.globalAlpha = mk.hidden ? 0.45 : 1
    g.strokeStyle = C.ink
    g.lineWidth = 2
    g.setLineDash(mk.hidden ? [6, 5] : [])
    g.beginPath()
    g.moveTo(ax, ay)
    g.lineTo(lx, ly)
    g.stroke()
    g.setLineDash([])
    g.fillStyle = C.ink
    g.beginPath()
    g.arc(ax, ay, 4, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = mk.hidden ? C.bg : C.ink
    g.beginPath()
    g.arc(lx, ly, R, 0, Math.PI * 2)
    g.fill()
    g.stroke()
    g.fillStyle = mk.hidden ? C.ink : C.bg
    g.font = `700 22px ${FONT}`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(String(mk.n), lx, ly + 1)
    g.restore()
  }

  g.font = `700 19px ${FONT}`
  const w = g.measureText(label.toUpperCase()).width + 24
  g.fillStyle = 'rgba(31,28,24,0.78)'
  g.beginPath()
  g.roundRect(x + 14, y + 14, w, 32, 16)
  g.fill()
  g.fillStyle = '#fff'
  g.textAlign = 'left'
  g.textBaseline = 'middle'
  g.fillText(label.toUpperCase(), x + 26, y + 31)
}

function titleStrip(g, b, info, cmPerPx) {
  g.fillStyle = C.card
  g.strokeStyle = C.line
  g.lineWidth = 2
  g.beginPath()
  g.roundRect(b.x, b.y, b.w, b.h, 16)
  g.fill()
  g.stroke()
  const pad = 30
  g.textAlign = 'left'
  g.textBaseline = 'alphabetic'
  g.fillStyle = C.ink
  g.font = `700 52px ${FONT}`
  g.fillText(info.piece || 'Untitled', b.x + pad, b.y + 70)
  g.fillStyle = C.muted
  g.font = `500 26px ${FONT}`
  const by = [info.maker && `by ${info.maker}`, info.date, info.units === 'in' ? 'inches · grams' : 'millimetres · grams'].filter(Boolean).join('   ·   ')
  g.fillText(by, b.x + pad, b.y + 112)

  // Scale bar, true to the flat views on this sheet.
  const unit = info.units === 'in' ? CM_PER_IN : 1
  const steps = info.units === 'in' ? 2 : 5
  const bar = (steps * unit) / cmPerPx
  const bx = b.x + b.w - pad - bar - 360, by2 = b.y + 64
  for (let i = 0; i < steps; i++) {
    g.fillStyle = i % 2 ? C.bg : C.ink
    g.fillRect(bx + (bar / steps) * i, by2, bar / steps, 14)
  }
  g.strokeStyle = C.ink
  g.lineWidth = 1.5
  g.strokeRect(bx, by2, bar, 14)
  g.fillStyle = C.ink
  g.font = `600 26px ${FONT}`
  g.fillText(info.units === 'in' ? '2 in' : '50 mm', bx + bar + 18, by2 + 15)
  g.fillStyle = C.muted
  g.font = `500 20px ${FONT}`
  g.fillText('Front, side and top are drawn to this scale.', bx, by2 + 52)
}

// Wrap text to a width; returns lines.
function wrap(g, text, w) {
  const words = String(text).split(/\s+/)
  const lines = []
  let line = ''
  for (const word of words) {
    const t = line ? `${line} ${word}` : word
    if (g.measureText(t).width > w && line) {
      lines.push(line)
      line = word
    } else line = t
  }
  if (line) lines.push(line)
  return lines
}

function heading(g, x, y, text) {
  g.fillStyle = C.muted
  g.font = `600 22px ${FONT}`
  g.textAlign = 'left'
  g.textBaseline = 'alphabetic'
  g.fillText(text.toUpperCase(), x, y)
}

function schedule(g, b, rows) {
  heading(g, b.x, b.y, 'Bit schedule · # is the working order')
  const cols = [['#', 0.04], ['Bit', 0.14], ['Where', 0.17], ['Size', 0.29], ['Glass', 0.15], ['Tool', 0.12], ['Mass', 0.09]]
  const xs = []
  let acc = b.x
  for (const [, f] of cols) (xs.push(acc), (acc += f * b.w))
  let y = b.y + 24
  g.strokeStyle = C.ink
  g.lineWidth = 2
  g.beginPath()
  g.moveTo(b.x, y + 44)
  g.lineTo(b.x + b.w, y + 44)
  g.stroke()
  g.fillStyle = C.ink
  g.font = `600 23px ${FONT}`
  cols.forEach(([name], i) => g.fillText(name, xs[i] + 6, y + 32))
  y += 44
  const keys = ['n', 'type', 'where', 'size', 'glass', 'tool', 'mass']
  g.font = `500 23px ${FONT}`
  const lh = 30
  let shown = 0
  for (const row of rows) {
    const cells = keys.map((k, i) => wrap(g, row[k], cols[i][1] * b.w - 14))
    const h = Math.max(...cells.map((c) => c.length)) * lh + 18
    if (y + h > b.bottom - 40) break
    cells.forEach((lines, i) => {
      g.fillStyle = i === 0 ? C.hot : C.ink
      g.font = i === 0 ? `700 23px ${FONT}` : `500 23px ${FONT}`
      lines.forEach((l, j) => g.fillText(l, xs[i] + 6, y + 30 + j * lh))
    })
    y += h
    g.strokeStyle = C.line
    g.lineWidth = 1.5
    g.beginPath()
    g.moveTo(b.x, y)
    g.lineTo(b.x + b.w, y)
    g.stroke()
    shown++
  }
  if (!rows.length) {
    g.fillStyle = C.muted
    g.fillText('No bits on this piece.', b.x + 6, y + 34)
    y += 50
  } else if (shown < rows.length) {
    g.fillStyle = C.warn
    g.fillText(`+ ${rows.length - shown} more bits not shown: see the app's working order.`, b.x + 6, y + 34)
    y += 50
  }

  // Whatever's left: ruled lines for notes at the bench.
  const top = y + 60
  if (b.bottom - top > 150) {
    heading(g, b.x, top, 'Bench notes')
    g.strokeStyle = C.line
    g.lineWidth = 1.5
    for (let ly = top + 62; ly < b.bottom - 20; ly += 58) {
      g.beginPath()
      g.moveTo(b.x, ly)
      g.lineTo(b.x + b.w, ly)
      g.stroke()
    }
  }
}

function totalsTable(g, b, rows, fillPct) {
  heading(g, b.x, b.y, 'Totals')
  let y = b.y + 24
  const c1 = b.x, c2 = b.x + b.w * 0.42, c3 = b.x + b.w * 0.71
  g.fillStyle = C.ink
  g.font = `600 23px ${FONT}`
  g.fillText('Empty', c2, y + 32)
  if (fillPct != null) g.fillText(`Filled ${fillPct}% (water)`, c3, y + 32)
  g.strokeStyle = C.ink
  g.lineWidth = 2
  g.beginPath()
  g.moveTo(b.x, y + 44)
  g.lineTo(b.x + b.w, y + 44)
  g.stroke()
  y += 44
  for (const [label, a, f] of rows) {
    g.font = `500 23px ${FONT}`
    g.fillStyle = C.muted
    g.fillText(label, c1, y + 32)
    g.fillStyle = C.ink
    g.font = `600 24px ${FONT}`
    if (f == null) {
      const lines = wrap(g, a, b.x + b.w - c2)
      lines.forEach((l, j) => g.fillText(l, c2, y + 32 + j * 30))
      y += 30 * lines.length + 14
    } else {
      g.fillText(a, c2, y + 32)
      g.fillText(f, c3, y + 32)
      y += 44
    }
  }
  return y
}

function warnings(g, b, checks) {
  const warns = checks.filter((c) => c.level === 'warn')
  const notes = checks.filter((c) => c.level !== 'warn')
  heading(g, b.x, b.y, `Checks · ${warns.length} warning${warns.length === 1 ? '' : 's'} (rules of thumb, not predictions)`)
  let y = b.y + 22
  const lh = 28
  const items = [...warns, ...notes]
  let shown = 0
  for (const c of items) {
    g.font = `600 22px ${FONT}`
    const t = wrap(g, c.title, b.w - 34)
    g.font = `500 20px ${FONT}`
    const d = wrap(g, c.detail, b.w - 34)
    const h = (t.length + d.length) * lh + 14
    if (y + h > b.bottom) break
    g.fillStyle = c.level === 'warn' ? C.warn : C.note
    g.beginPath()
    g.arc(b.x + 9, y + 21, 7, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = C.ink
    g.font = `600 22px ${FONT}`
    t.forEach((l, j) => g.fillText(l, b.x + 30, y + 28 + j * lh))
    g.fillStyle = C.muted
    g.font = `500 20px ${FONT}`
    d.forEach((l, j) => g.fillText(l, b.x + 30, y + 28 + (t.length + j) * lh))
    y += h
    shown++
  }
  if (shown < items.length) {
    g.fillStyle = C.warn
    g.font = `600 22px ${FONT}`
    g.fillText(`+ ${items.length - shown} more in the app's Checks panel.`, b.x, y + 26)
  }
}
