import { formatLength } from '../model/units.js'
import { VIEWS } from './shoot.js'

const PAPER = '#f6f3ed'
const INK = '#26221d'
const MUTED = '#7a7266'
const RULE = '#d8d0c3'
const DIM = '#c2541c'
const FONT = '"Bricolage Grotesque", ui-rounded, system-ui, sans-serif'

const toBlob = (canvas) => new Promise((ok) => canvas.toBlob(ok, 'image/png'))

// Lays the shots out as a drafting sheet, third-angle style like US drawings:
// top view above the front, right side beside it, the 3/4 view in the spare
// corner. Dimension lines go on the front and side views, with a scale bar
// so a printout can be measured whatever size it's printed at.
// Returns { sheet, images: { front, side, top, three } } as PNG blobs.
export async function composeSheet({ k, pad, size, shots }, { units }) {
  await document.fonts.load(`600 20px ${FONT}`).catch(() => {})
  const { front, side, top, three } = shots

  const u = Math.max(12, Math.min(48, Math.round((front.width + side.width) / 45)))
  const m = 2.5 * u
  const head = 3.4 * u
  const label = 1.6 * u
  const gap = 2 * u
  const left = 4.5 * u // room for the height dimension
  const below = 4.2 * u // room for width and depth dimensions
  const foot = 3.6 * u

  const col1 = front.width
  const col2 = Math.max(side.width, three.width)
  const row1 = Math.max(top.height, three.height)
  const row2 = front.height
  const x0 = m + left
  const x1 = x0 + col1 + gap
  const y0 = m + head + label
  const y1 = y0 + row1 + gap + label

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(x1 + col2 + m)
  canvas.height = Math.round(y1 + row2 + below + foot + m)
  const g = canvas.getContext('2d')
  g.fillStyle = PAPER
  g.fillRect(0, 0, canvas.width, canvas.height)

  const text = (str, x, y, { size: px = 0.85 * u, weight = 500, color = INK, align = 'left', spacing = 0 } = {}) => {
    g.font = `${weight} ${px}px ${FONT}`
    g.fillStyle = color
    g.textAlign = align
    g.textBaseline = 'middle'
    if ('letterSpacing' in g) g.letterSpacing = `${spacing}px`
    g.fillText(str, x, y)
    if ('letterSpacing' in g) g.letterSpacing = '0px'
  }
  const len = (cm) => `${formatLength(cm, units)} ${units}`

  // Header
  text('Glass Blocks', m, m + 1.1 * u, { size: 1.5 * u, weight: 700 })
  text('Design views', m, m + 2.5 * u, { color: MUTED })
  text(new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }), canvas.width - m, m + 1.1 * u, { align: 'right' })
  text('Third-angle projection', canvas.width - m, m + 2.5 * u, { align: 'right', color: MUTED })
  g.fillStyle = RULE
  g.fillRect(m, m + head - 0.4 * u, canvas.width - 2 * m, Math.max(1, u / 12))

  // Panels
  const at = {
    top: [x0, y0 + row1 - top.height],
    three: [x1, y0 + (row1 - three.height) / 2],
    front: [x0, y1],
    side: [x1, y1],
  }
  for (const { id, label: name } of VIEWS) {
    const shot = shots[id]
    const [x, y] = at[id]
    g.save()
    g.beginPath()
    g.roundRect(x, y, shot.width, shot.height, 0.5 * u)
    g.clip()
    g.drawImage(shot, x, y)
    g.restore()
    g.strokeStyle = RULE
    g.lineWidth = Math.max(1, u / 12)
    g.beginPath()
    g.roundRect(x, y, shot.width, shot.height, 0.5 * u)
    g.stroke()
    text(name.toUpperCase(), x, y - 0.75 * u, { size: 0.72 * u, weight: 600, color: MUTED, spacing: 0.12 * u })
  }

  // Dimensions
  const line = Math.max(1, u / 10)
  const arrow = (x, y, dx, dy) => {
    const a = 0.65 * u
    const w = 0.28 * u
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(x + dx * a - dy * w, y + dy * a + dx * w)
    g.lineTo(x + dx * a + dy * w, y + dy * a - dx * w)
    g.closePath()
    g.fill()
  }
  const seg = (ax, ay, bx, by) => {
    g.beginPath()
    g.moveTo(ax, ay)
    g.lineTo(bx, by)
    g.stroke()
  }
  g.strokeStyle = DIM
  g.fillStyle = DIM
  g.lineWidth = line

  // Width under a panel, from piece edge a to b (sheet x).
  const across = (a, b, panelBottom, cm) => {
    const y = panelBottom + 2 * u
    seg(a, panelBottom + 0.5 * u, a, y + 0.5 * u)
    seg(b, panelBottom + 0.5 * u, b, y + 0.5 * u)
    seg(a, y, b, y)
    g.fillStyle = DIM
    arrow(a, y, 1, 0)
    arrow(b, y, -1, 0)
    text(len(cm), (a + b) / 2, y + 1.2 * u, { color: DIM, weight: 600, align: 'center' })
  }
  const frontPiece = { x: x0 + pad * k, y: y1 + pad * k, w: size.x * k, h: size.y * k }
  const sidePiece = { x: x1 + pad * k, w: size.z * k }
  across(frontPiece.x, frontPiece.x + frontPiece.w, y1 + row2, size.x)
  across(sidePiece.x, sidePiece.x + sidePiece.w, y1 + row2, size.z)

  // Height to the left of the front view.
  {
    const x = x0 - 2.2 * u
    const a = frontPiece.y
    const b = frontPiece.y + frontPiece.h
    seg(x0 - 0.5 * u, a, x - 0.5 * u, a)
    seg(x0 - 0.5 * u, b, x - 0.5 * u, b)
    seg(x, a, x, b)
    g.fillStyle = DIM
    arrow(x, a, 0, 1)
    arrow(x, b, 0, -1)
    g.save()
    g.translate(x - 1.1 * u, (a + b) / 2)
    g.rotate(-Math.PI / 2)
    text(len(size.y), 0, 0, { color: DIM, weight: 600, align: 'center' })
    g.restore()
  }

  // Footer: a scale bar under the front view, overall size on the right.
  {
    const fy = y1 + row2 + below + 1.2 * u
    const steps = units === 'in' ? [0.25, 0.5, 1, 2, 5, 10] : [0.5, 1, 2, 5, 10, 20]
    const perUnit = (units === 'in' ? 2.54 : 1) * k
    const room = Math.max(col1, 12 * u)
    const step = [...steps].reverse().find((s) => 4 * s * perUnit <= room) ?? steps[0]
    const sp = step * perUnit
    const h = 0.45 * u
    for (let i = 0; i < 4; i++) {
      g.fillStyle = i % 2 ? PAPER : INK
      g.fillRect(x0 + i * sp, fy, sp, h)
    }
    g.strokeStyle = INK
    g.lineWidth = line
    g.strokeRect(x0, fy, 4 * sp, h)
    for (let i = 0; i <= 4; i++) text(`${+(i * step).toFixed(2)}`, x0 + i * sp, fy + h + 0.9 * u, { size: 0.7 * u, align: 'center', color: MUTED })
    text(units, x0 + 4 * sp + 0.8 * u, fy + h / 2, { size: 0.75 * u, color: MUTED })

    const dims = [size.y, size.x, size.z].map((cm) => formatLength(cm, units)).join(' × ')
    text(`Overall ${dims} ${units}`, canvas.width - m, fy + 0.2 * u, { align: 'right', weight: 600 })
    text('height × width × depth', canvas.width - m, fy + 1.5 * u, { align: 'right', size: 0.7 * u, color: MUTED })
  }

  const [sheet, ...each] = await Promise.all([canvas, front, side, top, three].map(toBlob))
  return { sheet, images: { front: each[0], side: each[1], top: each[2], three: each[3] } }
}
