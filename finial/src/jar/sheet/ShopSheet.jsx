import { chooseScale, scaleLabel, wrapText } from '@core/model/layout'
import { formatLength, formatVolume, formatWeight } from '@core/model/units'
import { DimAcross, DimUp } from '@core/ui/Dimension'
import { textMeasurer } from '@core/ui/measureText'
import { FIT_MODES } from '../lid'
import { ZONES } from '../zones'
import { PAGES, SHEET_FONT } from './pages'

// The shop sheet: one page to take to the bench. Body and lid drawn in
// section with their sizes, the measures, the lid fit, colours, warnings
// and the process steps. Drawn as one SVG in real millimetres, so it
// prints at the scale it says and turns into a PNG as it looks.

const INK = '#1b1b1b'
const MUTE = '#5a5a5a'
const RED = '#b3261e'
const GLASS = '#dbe7e5'
const MARGIN = 12
const LINE = 1.38 // line height, in font sizes

const path = (pts, map, side = 1) => `M${pts.map(([r, z]) => `${map.x(side * r)},${map.y(z)}`).join('L')}Z`

// Where the opening is narrowest above the belly (measure.js clearOpening).
function openingAt(inner) {
  let belly = 0
  for (let i = 1; i < inner.length; i++) if (inner[i][0] > inner[belly][0]) belly = i
  return inner.slice(belly).reduce((best, p) => (p[0] < best[0] ? p : best))
}
const widestAt = (pts) => pts.reduce((best, p) => (p[0] > best[0] ? p : best))

function Drawing({ d, box }) {
  const { section, m, fitted, units } = d
  const len = (mm) => formatLength(mm, units)
  const bodyR = m.maxDiameter / 2
  const bodyH = m.height
  const lidPts = fitted.parts.flat()
  const lidR = Math.max(...lidPts.map((p) => p[0]))
  const lidLow = Math.min(...lidPts.map((p) => p[1]))
  const lidHigh = Math.max(...lidPts.map((p) => p[1]))
  const lidH = lidHigh - lidLow

  // Room for dimension lines: one up the left, a gap, one up the right;
  // three across above the body and one below each piece, plus captions.
  const left = 12
  const between = 16
  const right = 12
  const above = 21
  const below = 15
  const s = chooseScale({
    needW: 2 * bodyR + 2 * lidR,
    needH: Math.max(bodyH, lidH),
    fixedW: left + between + right,
    fixedH: above + below,
    roomW: box.w,
    roomH: box.h,
  })
  const base = box.y + box.h - below
  const bx = box.x + left + bodyR * s
  const lx = bx + bodyR * s + between + lidR * s
  const body = { x: (r) => bx + r * s, y: (z) => base - z * s }
  const lid = { x: (r) => lx + r * s, y: (z) => base - (z - lidLow) * s }

  const outerRim = section.outer[section.outer.length - 1]
  const open = openingAt(section.inner)
  const wide = widestAt(section.outer)
  const lidWide = widestAt(lidPts)
  const top = body.y(bodyH)
  const size = 2.5
  const wall = d.range.thinnest === d.range.thickest ? len(d.range.thinnest) : `${len(d.range.thinnest)}–${len(d.range.thickest)}`
  const midZ = bodyH * 0.45
  const wallAt = section.inner.reduce((best, p) => (Math.abs(p[1] - midZ) < Math.abs(best[1] - midZ) ? p : best))
  const fit = fitted.fit
  // The lid's own fit size: where on the lid it's measured.
  const fitR = fit.lidDiameter / 2
  const fitZ = d.lid.mode === 'gallery' ? 0 : -d.lid.drop

  return (
    <g>
      {/* Centre lines */}
      {[
        [bx, top - 3, base + 3],
        [lx, lid.y(lidHigh) - 3, base + 3],
      ].map(([x, y1, y2]) => (
        <line key={x} x1={x} x2={x} y1={y1} y2={y2} stroke={MUTE} strokeWidth={0.15} strokeDasharray="4 1 1 1" />
      ))}
      <line x1={bx - bodyR * s - 4} x2={bx + bodyR * s + 4} y1={base} y2={base} stroke={MUTE} strokeWidth={0.2} />

      {[1, -1].map((side) => (
        <path key={`b${side}`} d={path(section.glass, body, side)} fill={GLASS} stroke={INK} strokeWidth={0.25} strokeLinejoin="round" />
      ))}
      {fitted.parts.map((poly, i) =>
        [1, -1].map((side) => (
          <path key={`l${i}${side}`} d={path(poly, lid, side)} fill={GLASS} stroke={INK} strokeWidth={0.25} strokeLinejoin="round" />
        )),
      )}

      {/* Body */}
      <DimUp
        x={bx - bodyR * s - 7}
        y1={base}
        y2={top}
        from1={body.x(-m.footDiameter / 2)}
        from2={body.x(-outerRim[0])}
        label={len(bodyH)}
        size={size}
      />
      <DimAcross x1={body.x(-open[0])} x2={body.x(open[0])} y={top - 5} from1={body.y(open[1])} from2={body.y(open[1])} label={`opening Ø ${len(m.openingDiameter)}`} size={size} />
      <DimAcross x1={body.x(-outerRim[0])} x2={body.x(outerRim[0])} y={top - 11} from1={top} from2={top} label={`rim Ø ${len(m.rimOuterDiameter)}`} size={size} />
      <DimAcross x1={body.x(-wide[0])} x2={body.x(wide[0])} y={top - 17} from1={body.y(wide[1])} from2={body.y(wide[1])} label={`widest Ø ${len(m.maxDiameter)}`} size={size} />
      <DimAcross x1={body.x(-m.footDiameter / 2)} x2={body.x(m.footDiameter / 2)} y={base + 5} from1={base} from2={base} label={`foot Ø ${len(m.footDiameter)}`} size={size} />
      <line x1={body.x(wallAt[0]) - 0.4} x2={body.x(wallAt[0]) - 4} y1={body.y(wallAt[1])} y2={body.y(wallAt[1])} stroke={INK} strokeWidth={0.15} />
      <text x={body.x(wallAt[0]) - 4.5} y={body.y(wallAt[1]) + 0.9} fontSize={size} textAnchor="end" fill={INK}>
        wall {wall}
      </text>
      <text x={bx} y={base + 12} fontSize={3} fontWeight={700} textAnchor="middle" fill={INK}>
        Body
      </text>

      {/* Lid */}
      <DimUp x={lx + lidR * s + 7} y1={lid.y(lidLow)} y2={lid.y(lidHigh)} from1={lid.x(lidR)} from2={lx} label={len(lidH)} size={size} />
      <DimAcross
        x1={lid.x(-lidWide[0])}
        x2={lid.x(lidWide[0])}
        y={lid.y(lidHigh) - 5}
        from1={lid.y(lidWide[1])}
        from2={lid.y(lidWide[1])}
        label={`Ø ${len(2 * lidWide[0])}`}
        size={size}
      />
      <DimAcross
        x1={lid.x(-fitR)}
        x2={lid.x(fitR)}
        y={base + 5}
        from1={lid.y(fitZ)}
        from2={lid.y(fitZ)}
        label={`${fit.lidLabel.toLowerCase()} Ø ${len(fit.lidDiameter)}`}
        size={size}
      />
      <text x={lx} y={base + 12} fontSize={3} fontWeight={700} textAnchor="middle" fill={INK}>
        Lid
      </text>

      <text x={box.x} y={box.y + 2} fontSize={2.4} fill={MUTE}>
        Section, both halves. {scaleLabel(s)} when printed at 100%.
      </text>
    </g>
  )
}

// A column of text blocks: headings, label/value rows, wrapped notes.
function Column({ x, y, w, blocks }) {
  let cy = y
  const out = []
  blocks.forEach((b, i) => {
    if (b.heading) {
      cy += i ? 3 : 0
      out.push(
        <text key={i} x={x} y={cy + 3.2} fontSize={3.2} fontWeight={700} fill={INK}>
          {b.heading}
        </text>,
      )
      cy += 5
    } else if (b.row) {
      out.push(
        <g key={i}>
          <text x={x} y={cy + 2.6} fontSize={2.6} fill={MUTE}>
            {b.row[0]}
          </text>
          <text x={x + w} y={cy + 2.6} fontSize={2.6} textAnchor="end" fill={INK}>
            {b.row[1]}
          </text>
        </g>,
      )
      cy += 3.7
    } else if (b.note) {
      const size = b.size ?? 2.4
      const lines = wrapText(b.note, w, textMeasurer(SHEET_FONT, size))
      out.push(
        <text key={i} x={x} y={cy + size} fontSize={size} fill={b.color ?? MUTE}>
          {lines.map((line, k) => (
            <tspan key={k} x={x} dy={k ? size * LINE : 0}>
              {line}
            </tspan>
          ))}
        </text>,
      )
      cy += lines.length * size * LINE + 0.8
    }
  })
  return <g>{out}</g>
}

// The steps in two columns, at the largest type that fits the room.
function Steps({ steps, x, y, w, h, edited }) {
  const colW = (w - 8) / 2
  let laid = null
  for (const size of [2.6, 2.4, 2.2, 2]) {
    const bold = textMeasurer(SHEET_FONT, size, 700)
    const plain = textMeasurer(SHEET_FONT, size)
    const blocks = steps.map((st, i) => ({
      title: wrapText(`${i + 1}. ${st.title}`, colW, bold),
      detail: st.detail ? wrapText(st.detail, colW - 3.5, plain) : [],
    }))
    const lineH = size * LINE
    const need = (b) => (b.title.length + b.detail.length) * lineH + 1.4
    // Turn to the second column about halfway, so the two come out even.
    const total = blocks.reduce((sum, b) => sum + need(b), 0)
    const half = Math.min(h, total / 2 + Math.max(...blocks.map(need)) / 2)
    const cols = [[], []]
    let col = 0
    let used = 0
    let fits = true
    for (const b of blocks) {
      if (used + need(b) > (col === 0 ? half : h)) {
        if (col === 1) {
          fits = false
          break
        }
        col = 1
        used = 0
      }
      cols[col].push({ ...b, at: used })
      used += need(b)
    }
    laid = { cols, size, lineH }
    if (fits) break
  }
  const { cols, size, lineH } = laid
  const shown = cols[0].length + cols[1].length
  return (
    <g>
      {cols.map((col, c) =>
        col.map((b, i) => {
          const cx = x + c * (colW + 8)
          const top = y + b.at + size
          return (
            <g key={`${c}-${i}`}>
              <text x={cx} y={top} fontSize={size} fontWeight={700} fill={INK}>
                {b.title.map((line, k) => (
                  <tspan key={k} x={cx} dy={k ? lineH : 0}>
                    {line}
                  </tspan>
                ))}
              </text>
              <text x={cx + 3.5} y={top + b.title.length * lineH} fontSize={size} fill={MUTE}>
                {b.detail.map((line, k) => (
                  <tspan key={k} x={cx + 3.5} dy={k ? lineH : 0}>
                    {line}
                  </tspan>
                ))}
              </text>
            </g>
          )
        }),
      )}
      {shown < steps.length && (
        <text x={x + w} y={y + h + 3} fontSize={2.3} textAnchor="end" fill={RED}>
          {steps.length - shown} more step{steps.length - shown > 1 ? 's' : ''} in the app; not enough room on one page.
        </text>
      )}
      <text x={x + w} y={y - 6.4} fontSize={2.3} textAnchor="end" fill={MUTE}>
        {edited ? 'Your edited plan.' : 'A starting template to edit, not a technique guide.'}
      </text>
    </g>
  )
}

export function ShopSheet({ d, page, date, svgRef, className }) {
  const { w: W, h: H } = PAGES[page]
  const { m, units, fitted, lid, zones, inUse, coe, jumps } = d
  const len = (mm) => formatLength(mm, units)
  const drawW = (W - 2 * MARGIN) * 0.6
  const colX = MARGIN + drawW + 6
  const colW = W - MARGIN - colX
  const drawBox = { x: MARGIN, y: MARGIN + 18, w: drawW, h: 128 }
  const stepsY = drawBox.y + drawBox.h + 12
  const footerY = H - MARGIN

  const blocks = [
    { heading: 'Measures' },
    { row: ['Body height', len(m.height)] },
    { row: ['Height, lid on', len(d.lidNumbers.heightOn)] },
    { row: ['Widest', `Ø ${len(m.maxDiameter)}`] },
    { row: ['Opening', `Ø ${len(m.openingDiameter)}`] },
    { row: ['Foot', `Ø ${len(m.footDiameter)}`] },
    { row: ['Capacity, brimful', formatVolume(m.capacityMl, units)] },
    { row: ['Capacity, lid on', formatVolume(d.lidNumbers.capacityUnderMl, units)] },
    { row: ['Body glass', formatWeight(m.weightG, units)] },
    { row: ['Lid glass', formatWeight(d.lidNumbers.weightG, units)] },
    { row: ['Total glass', formatWeight(m.weightG + d.lidNumbers.weightG, units)] },
    { heading: 'Lid fit' },
    { note: FIT_MODES[lid.mode].label, color: INK, size: 2.6 },
    { row: [fitted.fit.bodyLabel, `Ø ${len(fitted.fit.bodyDiameter)}`] },
    { row: [fitted.fit.lidLabel, `Ø ${len(fitted.fit.lidDiameter)}`] },
    { row: ['Gap target, all round', formatLength(fitted.fit.gap, units, 2)] },
    ...fitted.problems.map((p) => ({ note: p, color: RED })),
    { note: 'Expect to grind the seat (cold-work) to fit; the gap is a target, not a promise.' },
    { heading: 'Colours' },
    ...inUse.map((key) => {
      const z = zones[key]
      const coeText = String(z.coe ?? '').trim()
      return { row: [ZONES[key].label, `${z.name?.trim() || '—'}${coeText ? `  ·  COE ${coeText}` : ''}`] }
    }),
    ...(coe.mismatch.length
      ? [{ note: `COEs don’t match: ${coe.mismatch.map((g) => `${g.coe} (${g.zones.join(', ')})`).join('; ')}.`, color: RED }]
      : []),
    ...(coe.missing.length ? [{ note: `No COE entered for ${coe.missing.join(', ')}.` }] : []),
    ...(jumps.length
      ? [
          { heading: 'Thickness warnings' },
          ...jumps.map((j) => ({
            note: `${len(j.thick)} to ${len(j.thin)} within ${len(j.distance)} of wall, ${len(j.zLow)}–${len(j.zHigh)} up.`,
            color: RED,
          })),
        ]
      : []),
  ]

  return (
    <svg
      ref={svgRef}
      xmlns="http://www.w3.org/2000/svg"
      width={`${W}mm`}
      height={`${H}mm`}
      viewBox={`0 0 ${W} ${H}`}
      fontFamily={SHEET_FONT}
      className={className}
      role="img"
      aria-label={`Shop sheet for ${d.name}`}
    >
      <rect width={W} height={H} fill="#fff" />
      <text x={MARGIN} y={MARGIN + 5} fontSize={6} fontWeight={700} fill={INK}>
        {d.name}
      </text>
      <text x={MARGIN} y={MARGIN + 10.5} fontSize={2.8} fill={MUTE}>
        Shop sheet · lidded jar · {date} · lengths in {units === 'in' ? 'inches' : 'millimetres'}
      </text>
      <line x1={MARGIN} x2={W - MARGIN} y1={MARGIN + 13.5} y2={MARGIN + 13.5} stroke={INK} strokeWidth={0.3} />

      <Drawing d={d} box={drawBox} />
      <Column x={colX} y={drawBox.y} w={colW} blocks={blocks} />

      <line x1={MARGIN} x2={W - MARGIN} y1={stepsY - 7} y2={stepsY - 7} stroke={INK} strokeWidth={0.2} />
      <text x={MARGIN} y={stepsY - 7 + 4.6} fontSize={3.2} fontWeight={700} fill={INK}>
        Process plan
      </text>
      <Steps steps={d.steps} x={MARGIN} y={stepsY + 2} w={W - 2 * MARGIN} h={footerY - 6 - stepsY - 2} edited={d.edited} />

      <text x={MARGIN} y={footerY} fontSize={2.2} fill={MUTE}>
        Sizes and capacity are calculated from the drawing. Glass density ({d.density} g/cm³) and COEs are as entered, not
        checked. Made with Finial.
      </text>
    </svg>
  )
}
