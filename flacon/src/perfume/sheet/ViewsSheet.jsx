import { chooseScale, scaleLabel, wrapText } from '@core/model/layout'
import { formatLength, formatVolume, formatWeight } from '@core/model/units'
import { DimAcross, DimUp } from '@core/ui/Dimension'
import { textMeasurer } from '@core/ui/measureText'
import { PAGES, SHEET_FONT, narrowestBore, radiusAt, silhouette, topCircles, widestPoint } from './views.js'

// The bottle in flat views, the way a drawing office lays them out
// (third-angle: the top view above the front, the side to its right),
// plus a section through the middle. All four at one scale, drawn as one
// SVG in real millimetres, so it prints at the scale it says and saves as
// SVG or PNG looking the same.

const INK = '#1b1b1b'
const MUTE = '#5a5a5a'
const RED = '#b3261e'
const BLUE = '#2f62b0'
const GLASS = '#e6dcef'
const CUT = '#cdb9de'
const MARGIN = 12
const PANEL_W = 62
const COL_GAP = 10
// Room each column keeps for dimension lines beside the piece, mm on paper.
const PAD = { front: [14, 6], side: [6, 6], section: [6, 28] }
// Above the top view, between it and the front row, and under the front row.
const ABOVE_TOP = 10
const ABOVE_FRONT = 18
const BELOW = 14

const loop = (pts, map) => `M${pts.map(([r, z]) => `${map.x(r)},${map.y(z)}`).join('L')}Z`
const line = (pts, map, side = 1) => `M${pts.map(([r, z]) => `${map.x(side * r)},${map.y(z)}`).join('L')}`

function Caption({ x, y, children, note }) {
  return (
    <g>
      <text x={x} y={y} fontSize={3} fontWeight={700} textAnchor="middle" fill={INK} letterSpacing={0.3}>
        {children}
      </text>
      {note && (
        <text x={x} y={y + 3.6} fontSize={2.3} textAnchor="middle" fill={RED}>
          {note}
        </text>
      )}
    </g>
  )
}

// A view from outside: the outline in glass, the inside as hidden lines.
function Outside({ section, map }) {
  return (
    <g>
      <path d={loop(silhouette(section.outer), map)} fill={GLASS} stroke={INK} strokeWidth={0.3} strokeLinejoin="round" />
      {[1, -1].map((side) => (
        <path key={side} d={line(section.inner, map, side)} fill="none" stroke={MUTE} strokeWidth={0.15} strokeDasharray="1.2 0.8" />
      ))}
    </g>
  )
}

function CentreLine({ x, y1, y2 }) {
  return <line x1={x} x2={x} y1={y1} y2={y2} stroke={MUTE} strokeWidth={0.15} strokeDasharray="4 1 1 1" />
}

// The largest standard scale at which all four views fit the room.
const viewsScale = (m, box) =>
  chooseScale({
    needW: 3 * m.maxDiameter,
    needH: m.maxDiameter + m.height,
    fixedW: Object.values(PAD).flat().reduce((a, b) => a + b) + 2 * COL_GAP,
    fixedH: ABOVE_TOP + ABOVE_FRONT + BELOW,
    roomW: box.w,
    roomH: box.h,
  })

function Views({ d, box, s }) {
  const { section, m, units } = d
  const len = (mm, digits) => formatLength(mm, units, digits)
  const R = m.maxDiameter / 2
  const H = m.height

  // Column centres, left to right, and the shared ground line.
  const centres = {}
  let x = box.x
  for (const key of ['front', 'side', 'section']) {
    centres[key] = x + PAD[key][0] + R * s
    x = centres[key] + R * s + PAD[key][1] + COL_GAP
  }
  // Centred up and down in the room, when the scale leaves some over.
  const used = (m.maxDiameter + H) * s + ABOVE_TOP + ABOVE_FRONT + BELOW
  const base = box.y + box.h - BELOW - Math.max(0, (box.h - used) / 2)
  const top = base - H * s
  const topY = top - ABOVE_FRONT - R * s
  const at = (cx) => ({ x: (r) => cx + r * s, y: (z) => base - z * s })
  const front = at(centres.front)
  const side = at(centres.side)
  const cut = at(centres.section)

  const rim = section.outer.at(-1)
  const wide = widestPoint(section.outer)
  const bore = narrowestBore(section.inner)
  const mouth = section.inner.at(-1)
  const size = 2.5
  const midZ = d.floorZ + (wide[1] - d.floorZ) * 0.6
  const wallR = radiusAt(section.inner, midZ)
  const fillR = d.fillZ == null ? null : radiusAt(section.inner, d.fillZ)

  return (
    <g>
      <line x1={box.x} x2={x - COL_GAP} y1={base} y2={base} stroke={MUTE} strokeWidth={0.2} />

      {/* Top view, above the front */}
      <CentreLine x={centres.front} y1={topY - R * s - 2} y2={topY + R * s + 2} />
      <line x1={centres.front - R * s - 2} x2={centres.front + R * s + 2} y1={topY} y2={topY} stroke={MUTE} strokeWidth={0.15} strokeDasharray="4 1 1 1" />
      {topCircles(m).map((c) => (
        <circle
          key={c.key}
          cx={centres.front}
          cy={topY}
          r={(c.d / 2) * s}
          fill={c.key === 'widest' ? GLASS : 'none'}
          stroke={c.hidden ? MUTE : INK}
          strokeWidth={c.hidden ? 0.15 : 0.3}
          strokeDasharray={c.hidden ? '1.2 0.8' : undefined}
        />
      ))}
      <DimAcross x1={centres.front - R * s} x2={centres.front + R * s} y={topY - R * s - 5} from1={topY} from2={topY} label={`Ø ${len(m.maxDiameter)}`} size={size} />
      <text x={centres.front + R * s + 6} y={topY + 1} fontSize={3} fontWeight={700} fill={INK} letterSpacing={0.3}>
        TOP
      </text>

      {/* Front */}
      <CentreLine x={centres.front} y1={top - 3} y2={base + 3} />
      <Outside section={section} map={front} />
      <DimUp x={front.x(-R) - 8} y1={base} y2={top} from1={front.x(-m.footDiameter / 2)} from2={front.x(-rim[0])} label={len(H)} size={size} />
      <DimAcross x1={front.x(-rim[0])} x2={front.x(rim[0])} y={top - 5} from1={top} from2={top} label={`neck Ø ${len(m.rimOuterDiameter, 2)}`} size={size} />
      <DimAcross x1={front.x(-R)} x2={front.x(R)} y={top - 11} from1={front.y(wide[1])} from2={front.y(wide[1])} label={`widest Ø ${len(m.maxDiameter)}`} size={size} />
      <DimAcross x1={front.x(-m.footDiameter / 2)} x2={front.x(m.footDiameter / 2)} y={base + 5} from1={base} from2={base} label={`foot Ø ${len(m.footDiameter)}`} size={size} />
      <Caption x={centres.front} y={base + 12}>FRONT</Caption>

      {/* Side, to the right of the front */}
      <CentreLine x={centres.side} y1={top - 3} y2={base + 3} />
      <Outside section={section} map={side} />
      <DimAcross x1={side.x(-R)} x2={side.x(R)} y={top - 5} from1={side.y(wide[1])} from2={side.y(wide[1])} label={`depth Ø ${len(m.maxDiameter)}`} size={size} />
      <Caption x={centres.side} y={base + 12} note={d.oval ? 'Drawn round: the oval isn’t built yet' : null}>
        SIDE
      </Caption>

      {/* Section through the middle */}
      <CentreLine x={centres.section} y1={top - 3} y2={base + 3} />
      {[1, -1].map((k) => (
        <path key={k} d={line(section.glass, cut, k) + 'Z'} fill={CUT} stroke={INK} strokeWidth={0.3} strokeLinejoin="round" />
      ))}
      {fillR != null && (
        <g>
          <line x1={cut.x(-fillR)} x2={cut.x(fillR)} y1={cut.y(d.fillZ)} y2={cut.y(d.fillZ)} stroke={BLUE} strokeWidth={0.25} strokeDasharray="1.5 0.8" />
          <DimUp x={cut.x(R) + 20} y1={base} y2={cut.y(d.fillZ)} from1={cut.x(R)} from2={cut.x(fillR)} label={`fill ${len(d.fillZ)}`} size={size} color={BLUE} />
        </g>
      )}
      {/* The base is too short to letter along, so its size sits beside it. */}
      <DimUp x={cut.x(R) + 6} y1={base} y2={cut.y(d.floorZ)} from1={cut.x(R)} from2={cut.x(R * 0.5)} label="" size={size} />
      <text x={cut.x(R) + 7.5} y={(base + cut.y(d.floorZ)) / 2 + 0.9} fontSize={size} fill={INK} stroke="#fff" strokeWidth={0.8} paintOrder="stroke">
        base {len(d.floorZ)}
      </text>
      <DimAcross x1={cut.x(-mouth[0])} x2={cut.x(mouth[0])} y={top - 5} from1={top} from2={top} label={`mouth Ø ${len(m.rimInnerDiameter, 2)}`} size={size} />
      <DimAcross x1={cut.x(-bore[0])} x2={cut.x(bore[0])} y={top - 11} from1={cut.y(bore[1])} from2={cut.y(bore[1])} label={`bore Ø ${len(m.openingDiameter, 2)}`} size={size} />
      {wallR != null && (
        <g>
          <line x1={cut.x(wallR) - 0.4} x2={cut.x(wallR) - 4} y1={cut.y(midZ)} y2={cut.y(midZ)} stroke={INK} strokeWidth={0.15} />
          <text x={cut.x(wallR) - 4.5} y={cut.y(midZ) + 0.9} fontSize={size} textAnchor="end" fill={INK}>
            wall {len(d.wall)}
          </text>
        </g>
      )}
      <Caption x={centres.section} y={base + 12}>SECTION</Caption>

      <text x={box.x} y={box.y + 3} fontSize={2.4} fill={MUTE}>
        Scale {scaleLabel(s)} · dashed grey: hidden lines · blue: fill line
      </text>
    </g>
  )
}

function Panel({ d, date, x, y, w, h, scale }) {
  const { m, units } = d
  const len = (mm, digits) => formatLength(mm, units, digits)
  const rows = [
    ['Height', len(m.height)],
    ['Widest', len(m.maxDiameter)],
    ['Foot', len(m.footDiameter)],
    ['Neck outside', len(m.rimOuterDiameter, 2)],
    ['Mouth, inside', len(m.rimInnerDiameter, 2)],
    ['Narrowest bore', len(m.openingDiameter, 2)],
    ['Body wall', len(d.wall)],
    ['Base', len(d.floorZ)],
    ['Brimful', formatVolume(m.capacityMl, units)],
    ...(d.fillMl == null ? [] : [[`At ${d.fillPercent}% fill`, formatVolume(d.fillMl, units)]]),
    ['Glass', formatWeight(m.weightG, units)],
    ['Closure', d.closureName],
  ]
  const notes = [
    d.oval && 'Meant to be oval; every view and size here is for a round body.',
    d.placeholderNeck && 'Neck is the starting sketch until the closure sizes are in.',
    d.stopper && 'Stopper not drawn in place; see the stopper detail in the app.',
    d.densityTodo && 'Weight uses 2.5 g/cm³, a starting value, not your batch.',
  ].filter(Boolean)
  const block = 30
  const noteLines = notes.flatMap((n) => wrapText(n, w, textMeasurer(SHEET_FONT, 2.2)))
  const notesY = y + 14 + rows.length * 4.2
  return (
    <g>
      <text x={x} y={y + 3} fontSize={3.2} fontWeight={700} fill={INK}>
        Sizes
      </text>
      {rows.map(([k, v], i) => (
        <g key={k}>
          <text x={x} y={y + 9 + i * 4.2} fontSize={2.6} fill={MUTE}>
            {k}
          </text>
          <text x={x + w} y={y + 9 + i * 4.2} fontSize={2.6} textAnchor="end" fill={INK}>
            {v}
          </text>
        </g>
      ))}
      {noteLines.map((n, i) => (
        <text key={i} x={x} y={notesY + i * 3.1} fontSize={2.2} fill={RED}>
          {n}
        </text>
      ))}
      {/* Title block */}
      <rect x={x} y={y + h - block} width={w} height={block} fill="none" stroke={INK} strokeWidth={0.3} />
      {[
        ['Drawing', d.name],
        ['Scale', `${scaleLabel(scale)} (print at 100%)`],
        ['Lengths', units === 'in' ? 'inches' : 'millimetres'],
        ['Projection', 'third-angle'],
        ['Date', date],
      ].map(([k, v], i) => (
        <g key={k}>
          <text x={x + 2} y={y + h - block + 5 + i * 5.6} fontSize={2.2} fill={MUTE}>
            {k}
          </text>
          <text x={x + 19} y={y + h - block + 5 + i * 5.6} fontSize={2.6} fill={INK} fontWeight={i === 0 ? 700 : 400}>
            {v}
          </text>
        </g>
      ))}
    </g>
  )
}

export function ViewsSheet({ d, page, date, svgRef, className }) {
  const { w: W, h: H } = PAGES[page]
  const head = 14
  const room = { x: MARGIN, y: MARGIN + head + 4, w: W - 2 * MARGIN - PANEL_W - 8, h: H - 2 * MARGIN - head - 4 }
  const scale = viewsScale(d.m, room)
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
      aria-label={`Views of ${d.name}`}
    >
      <rect width={W} height={H} fill="#fff" />
      <text x={MARGIN} y={MARGIN + 5} fontSize={6} fontWeight={700} fill={INK}>
        {d.name}
      </text>
      <text x={MARGIN} y={MARGIN + 10.5} fontSize={2.8} fill={MUTE}>
        Views · perfume bottle · front, side, top and section · lengths in {d.units === 'in' ? 'inches' : 'millimetres'}
      </text>
      <line x1={MARGIN} x2={W - MARGIN} y1={MARGIN + head - 0.5} y2={MARGIN + head - 0.5} stroke={INK} strokeWidth={0.3} />
      <Views d={d} box={room} s={scale} />
      <Panel d={d} date={date} x={W - MARGIN - PANEL_W} y={room.y} w={PANEL_W} h={room.h} scale={scale} />
    </svg>
  )
}
