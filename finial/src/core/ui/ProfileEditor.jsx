import { useMemo, useRef, useState } from 'react'
import { formatLength, MM_PER_IN } from '../model/units'
import { SectionDrawing } from './SectionDrawing'

// The drafting sheet: a grid in real units with the vessel in section.
// Drag a point to reshape the outside wall; the inside follows at the wall
// thickness. Click the wall to add a point, double-click a point (or
// select it and press Delete) to remove it, C toggles a sharp corner,
// arrow keys nudge. Shift snaps to a coarser step.
//
// points[0] is the center of the base and stays on the axis.
//
// Also drawn, not edited: extras (more closed glass polygons, such as a
// lid's flange and knob) and ghost (polygons in outline only, such as the
// body a lid sits on).

const ceilTo = (v, step) => Math.ceil(v / step) * step

// The sheet's extent in mm, with room around the piece: w each side of
// the axis, from low (0, or below it for a hanging flange) up to h.
function frameFor(points, extras) {
  const all = [...points.map((p) => [p.r, p.z]), ...extras.flat()]
  const maxR = Math.max(...all.map((p) => p[0]))
  const maxZ = Math.max(...all.map((p) => p[1]))
  const minZ = Math.min(0, ...all.map((p) => p[1]))
  const low = minZ < 0 ? -ceilTo(-minZ + 5, 5) : 0
  const size = ceilTo(Math.max((maxZ - low) * 1.15, maxR * 2.3, 100), 25)
  return { w: size / 2, h: low + size, low }
}

// Grid spacing: fine and bold lines, in the viewer's units.
const gridFor = (units, h) =>
  units === 'in'
    ? { fine: MM_PER_IN / (h > 250 ? 2 : 4), bold: MM_PER_IN, label: (mm) => `${Math.round(mm / MM_PER_IN)}` }
    : { fine: h > 250 ? 10 : 5, bold: h > 250 ? 50 : 25, label: (mm) => `${Math.round(mm)}` }

// Drag steps: free (to a hair) or snapped with Shift.
const snapFor = (units, coarse) =>
  units === 'in' ? (coarse ? MM_PER_IN / 8 : MM_PER_IN / 64) : coarse ? 5 : 0.5

const snap = (v, step) => Math.round(v / step) * step

// highlights: stretches of the outside wall to mark, as { from, to }
// sample indexes along section.outer (a thickness warning, say).
// lockLastR: the last point's distance from the axis is set elsewhere (a
// lid's edge, fitted to the body), so it only moves up and down.
export function ProfileEditor({
  points,
  onChange,
  section,
  units,
  selected,
  onSelect,
  highlights = [],
  extras = [],
  ghost = [],
  lockLastR = false,
  label = 'Profile',
}) {
  const svgRef = useRef(null)
  const [drag, setDrag] = useState(null)
  // The point last pressed. A press captures the pointer on the whole
  // sheet (so a fast drag can't slip off the handle), which sends the
  // double-click to the sheet rather than the point; this says which.
  const pressed = useRef(null)
  // Hold the sheet still while dragging (only growing), so the grid doesn't
  // slide under the pointer; fit it again on release.
  const frame = useMemo(() => {
    const fit = frameFor(points, extras)
    return drag
      ? { w: Math.max(drag.frame.w, fit.w), h: Math.max(drag.frame.h, fit.h), low: Math.min(drag.frame.low, fit.low) }
      : fit
  }, [points, extras, drag])

  const tall = frame.h - frame.low
  const grid = gridFor(units, tall)
  const pad = tall * 0.07
  const handle = tall * 0.013
  const font = tall * 0.026

  const toModel = (event) => {
    const svg = svgRef.current
    const pt = svg.createSVGPoint()
    pt.x = event.clientX
    pt.y = event.clientY
    const p = pt.matrixTransform(svg.getScreenCTM().inverse())
    return { r: p.x, z: -p.y }
  }

  const move = (index, r, z) => {
    const fixedR = index === 0 || (lockLastR && index === points.length - 1)
    const next = points.map((p, i) => (i === index ? { ...p, r: fixedR ? p.r : Math.max(0, r), z: Math.max(0, z) } : p))
    onChange(next)
  }

  const remove = (index) => {
    if (index === 0 || index === points.length - 1 || points.length <= 3) return
    onChange(points.filter((_, i) => i !== index))
    onSelect(Math.min(index, points.length - 2))
  }

  // Click on the wall: a new point there, in the span it fell on.
  const addAt = (event) => {
    const at = toModel(event)
    let best = 0
    let bestD = Infinity
    section.outer.forEach(([r, z], i) => {
      const d = Math.hypot(r - at.r, z - at.z)
      if (d < bestD) {
        best = i
        bestD = d
      }
    })
    const index = section.span[best] + 1
    const step = snapFor(units, event.shiftKey)
    const point = { r: snap(Math.max(0, at.r), step), z: snap(Math.max(0, at.z), step) }
    onChange([...points.slice(0, index), point, ...points.slice(index)])
    onSelect(index)
  }

  const onKeyDown = (event) => {
    if (selected == null) return
    const p = points[selected]
    const step = snapFor(units, event.shiftKey) * (units === 'in' ? 4 : 1)
    const nudge = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[event.key]
    if (nudge) {
      event.preventDefault()
      move(selected, p.r + nudge[0], p.z + nudge[1])
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      remove(selected)
    } else if (event.key === 'c' || event.key === 'C') {
      onChange(points.map((q, i) => (i === selected ? { ...q, corner: !q.corner } : q)))
    } else if (event.key === 'Escape') {
      onSelect(null)
    }
  }

  const lines = []
  for (let v = Math.ceil(frame.low / grid.fine - 1e-6) * grid.fine; v <= frame.h + 1e-6; v += grid.fine) lines.push({ v, axis: 'z', bold: Math.abs(v / grid.bold - Math.round(v / grid.bold)) < 1e-6 })
  for (let v = grid.fine; v <= frame.w + 1e-6; v += grid.fine) lines.push({ v, axis: 'r', bold: Math.abs(v / grid.bold - Math.round(v / grid.bold)) < 1e-6 })

  return (
    <svg
      ref={svgRef}
      viewBox={`${-frame.w - pad} ${-frame.h - pad * 0.5} ${2 * frame.w + pad * 1.5} ${tall + pad * 1.5}`}
      className="h-full w-full touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-accent"
      tabIndex={0}
      role="application"
      aria-label={`${label} editor. Drag points to shape the wall; click the wall to add a point.`}
      onKeyDown={onKeyDown}
      onPointerMove={(event) => {
        if (!drag) return
        const at = toModel(event)
        const step = snapFor(units, event.shiftKey)
        move(drag.index, snap(at.r - drag.offset.r, step), snap(at.z - drag.offset.z, step))
      }}
      onPointerUp={() => setDrag(null)}
      onPointerCancel={() => setDrag(null)}
      onPointerDown={(event) => {
        if (event.target !== event.currentTarget) return
        pressed.current = null
        onSelect(null)
      }}
      onDoubleClick={() => {
        if (pressed.current != null) remove(pressed.current)
        pressed.current = null
      }}
    >
      <g>
        {lines.map(({ v, axis, bold }) =>
          axis === 'z' ? (
            <line key={`z${v}`} x1={-frame.w} x2={frame.w} y1={-v} y2={-v} stroke="var(--grid)" strokeOpacity={bold ? 1 : 0.45} vectorEffect="non-scaling-stroke" />
          ) : (
            <g key={`r${v}`}>
              <line x1={v} x2={v} y1={-frame.low} y2={-frame.h} stroke="var(--grid)" strokeOpacity={bold ? 1 : 0.45} vectorEffect="non-scaling-stroke" />
              <line x1={-v} x2={-v} y1={-frame.low} y2={-frame.h} stroke="var(--grid)" strokeOpacity={bold ? 1 : 0.45} vectorEffect="non-scaling-stroke" />
            </g>
          ),
        )}
        {lines
          .filter((l) => l.bold && (l.axis === 'z' ? l.v !== 0 : l.v > 0))
          .map(({ v, axis }) =>
            axis === 'z' ? (
              <text key={`tz${v}`} x={-frame.w - font * 0.4} y={-v + font * 0.35} fontSize={font} textAnchor="end" className="fill-faint font-mono">
                {grid.label(v)}
              </text>
            ) : (
              <text key={`tr${v}`} x={v} y={-frame.low + font * 1.4} fontSize={font} textAnchor="middle" className="fill-faint font-mono">
                {grid.label(v)}
              </text>
            ),
          )}
        <text x={-frame.w} y={-frame.low + font * 1.4} fontSize={font} textAnchor="start" className="fill-faint font-mono">
          {units}
        </text>
        {/* The axis and the table. */}
        <line x1={0} x2={0} y1={-frame.low + pad * 0.3} y2={-frame.h} stroke="var(--axis)" strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
        <line x1={-frame.w} x2={frame.w} y1={0} y2={0} stroke="var(--axis)" vectorEffect="non-scaling-stroke" />
      </g>

      {ghost.map((poly, k) => (
        <g key={`ghost${k}`} pointerEvents="none">
          {[1, -1].map((side) => (
            <path
              key={side}
              d={`M${poly.map(([r, z]) => `${side * r},${-z}`).join('L')}Z`}
              fill="var(--ghost-fill)"
              stroke="var(--ghost-line)"
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
      ))}

      {extras.map((poly, k) => (
        <g key={`extra${k}`} pointerEvents="none">
          {[1, -1].map((side) => (
            <path
              key={side}
              d={`M${poly.map(([r, z]) => `${side * r},${-z}`).join('L')}Z`}
              fill="var(--glass-fill)"
              stroke="var(--glass-line)"
              strokeOpacity={side > 0 ? 0.9 : 0.5}
              fillOpacity={side > 0 ? 1 : 0.55}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
      ))}

      <SectionDrawing section={section} />

      {highlights.map(({ from, to }) => (
        <path
          key={`${from}-${to}`}
          d={`M${section.outer.slice(from, to + 1).map(([r, z]) => `${r},${-z}`).join('L')}`}
          fill="none"
          stroke="var(--caution)"
          strokeWidth={6}
          strokeLinecap="round"
          strokeOpacity={0.75}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      ))}

      {/* A wide invisible line over the outside wall, to click on. */}
      <path
        d={`M${section.outer.map(([r, z]) => `${r},${-z}`).join('L')}`}
        fill="none"
        stroke="transparent"
        strokeWidth={handle * 1.8}
        className="cursor-copy"
        onClick={addAt}
      />

      {points.map((p, i) => {
        const isSelected = i === selected
        const size = isSelected ? handle * 1.25 : handle
        const shared = {
          className: i === 0 ? 'cursor-ns-resize' : 'cursor-grab',
          fill: isSelected ? 'var(--accent)' : 'var(--ground)',
          stroke: 'var(--accent)',
          strokeWidth: 2,
          vectorEffect: 'non-scaling-stroke',
          onPointerDown: (event) => {
            event.stopPropagation()
            event.currentTarget.ownerSVGElement.setPointerCapture(event.pointerId)
            const at = toModel(event)
            pressed.current = i
            onSelect(i)
            setDrag({ index: i, offset: { r: at.r - p.r, z: at.z - p.z }, frame })
          },
        }
        const marker = p.corner ? (
          <rect x={p.r - size} y={-p.z - size} width={size * 2} height={size * 2} {...shared} />
        ) : (
          <circle cx={p.r} cy={-p.z} r={size} {...shared} />
        )
        // A point with its own wall thickness says so beside it.
        return (
          <g key={i}>
            {marker}
            {p.wall != null && (
              <text x={p.r + size * 1.8} y={-p.z + font * 0.35} fontSize={font * 0.9} className="pointer-events-none fill-accent font-mono">
                {formatLength(p.wall, units)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
