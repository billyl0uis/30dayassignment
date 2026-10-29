import { useEffect, useMemo, useRef, useState } from 'react'
import { sampleCurve } from '../geometry/profile.js'
import { useDerived } from '../model/derived.js'
import { useStore } from '../model/store.js'
import { fmtLen, fmtVol } from '../model/units.js'

// A drafting sheet in centimetres. SVG y runs down, the vessel's runs up, so
// every height is drawn negated.
const d = (pts) => 'M' + pts.map(([r, y]) => `${r.toFixed(3)} ${(-y).toFixed(3)}`).join('L')
const mirror = (pts) => pts.map(([r, y]) => [-r, y])
const snap = (v) => Math.round(v * 2) / 2

export default function ProfileEditor() {
  const points = useStore((s) => s.points)
  const selected = useStore((s) => s.selected)
  const units = useStore((s) => s.units)
  const { checkpoint, live, setView, removePoint } = useStore.getState()
  const { sec, handle, metrics } = useDerived()

  const wrap = useRef()
  const svg = useRef()
  const drag = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [size, setSize] = useState({ w: 600, h: 600 })
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(wrap.current)
    return () => ro.disconnect()
  }, [])

  // The sheet holds still while you drag and refits when you let go, so a
  // point never runs away from the pointer.
  const held = useRef(null)
  const frame = useMemo(() => {
    if (dragging && held.current) return held.current
    const reach = handle ? Math.max(...handle.pts.map((p) => -p[0])) + handle.radius : 0
    const half = Math.max(5, metrics.maxD / 2 + 1.5, reach + 1)
    const top = Math.max(8, metrics.height * 1.12 + 1)
    return (held.current = { x0: -half - 1, x1: half + 2.5, y0: -2.2, y1: top })
  }, [dragging, metrics.maxD, metrics.height, handle])
  const vbW = frame.x1 - frame.x0, vbH = frame.y1 - frame.y0
  // Screen pixels per cm. Zero before the first layout, so fall back.
  const px = Math.min(size.w / vbW, size.h / vbH) || 40
  const u = 1 / px

  const toCm = (e) => {
    const p = svg.current.createSVGPoint()
    p.x = e.clientX
    p.y = e.clientY
    const q = p.matrixTransform(svg.current.getScreenCTM().inverse())
    return [q.x, -q.y]
  }

  const startDrag = (e, what) => {
    e.stopPropagation()
    svg.current.setPointerCapture(e.pointerId)
    drag.current = what
    setDragging(true)
  }
  const onMove = (e) => {
    const g = drag.current
    if (!g) return
    let [r, y] = toCm(e)
    if (e.shiftKey) (r = snap(r)), (y = snap(y))
    const s = useStore.getState()
    if (g.kind === 'point') {
      const next = s.points.map((p) => [...p])
      next[g.i] = [Math.min(40, Math.max(0.1, r)), g.i === 0 ? 0 : Math.min(60, Math.max(0, y))]
      live({ points: next })
    } else if (g.kind === 'floor') {
      live({ floor: Math.max(s.wall, Math.min(sec.brimY - 0.3, y)) })
    }
  }
  const onUp = (e) => {
    if (!drag.current) return
    svg.current.releasePointerCapture(e.pointerId)
    drag.current = null
    setDragging(false)
  }

  // Clicking the wall drops a new point there and picks it up at once.
  const insert = (e) => {
    const [r, y] = toCm(e)
    let best = 0, bestD = Infinity
    sec.outer.forEach((p, i) => {
      const dd = Math.hypot(p[0] - r, p[1] - y)
      if (dd < bestD) (bestD = dd), (best = i)
    })
    const at = sec.seg[best] + 1
    const next = [...points.slice(0, at), [Math.max(0.1, r), Math.max(0, y)], ...points.slice(at)]
    checkpoint()
    live({ points: next, selected: at })
    startDrag(e, { kind: 'point', i: at })
  }

  const grid = useMemo(() => {
    const lines = []
    const x0 = Math.floor(frame.x0 - vbW), x1 = Math.ceil(frame.x1 + vbW)
    const y0 = Math.floor(frame.y0 - vbH), y1 = Math.ceil(frame.y1 + vbH)
    for (let x = x0; x <= x1; x++) lines.push(<line key={'x' + x} x1={x} x2={x} y1={-y1} y2={-y0} className={x % 5 ? 'g-minor' : 'g-major'} />)
    for (let y = y0; y <= y1; y++) lines.push(<line key={'y' + y} x1={x0} x2={x1} y1={-y} y2={-y} className={y % 5 ? 'g-minor' : 'g-major'} />)
    return lines
  }, [frame, vbW, vbH])

  const handleLine = useMemo(() => (handle ? sampleCurve(handle.points, { perSeg: 12, floor: false }).pts : null), [handle])
  const rim = sec.outer[sec.outer.length - 1]
  const fs = 11.5 * u

  return (
    <div className="editor" ref={wrap}>
      <svg
        ref={svg}
        viewBox={`${frame.x0} ${-frame.y1} ${vbW} ${vbH}`}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerDown={() => setView({ selected: null })}
        style={{ '--u': u }}
      >
        <g className="grid">{grid}</g>
        <line className="axis" x1={0} x2={0} y1={-frame.y1 - vbH} y2={-frame.y0 + vbH} />
        <line className="table" x1={frame.x0 - vbW} x2={frame.x1 + vbW} y1={0} y2={0} />

        {handleLine && <path className="handle-strap" d={d(handleLine)} strokeWidth={handle.radius * 2} />}
        <path className="section ghost" d={d(mirror(sec.section)) + 'Z'} />
        <path className="section" d={d(sec.section) + 'Z'} />

        {/* Cavity floor: drag it up to make a solid base or stem. */}
        <g className={'floor' + (dragging && drag.current?.kind === 'floor' ? ' on' : '')} onPointerDown={(e) => (checkpoint(), startDrag(e, { kind: 'floor' }))}>
          <line x1={-sec.inner[0][0]} x2={sec.inner[0][0]} y1={-sec.floorY} y2={-sec.floorY} />
          <rect x={-22 * u} y={-sec.floorY - 7 * u} width={44 * u} height={14 * u} rx={7 * u} />
          <text x={0} y={-sec.floorY + 3.8 * u} fontSize={9.5 * u}>floor</text>
        </g>

        <path className="control" d={d(points)} />
        <path className="hit" d={d(sec.outer)} strokeWidth={14 * u} onPointerDown={insert} />

        {points.map(([r, y], i) => {
          const on = selected === i
          const props = {
            className: 'pt' + (on ? ' on' : '') + (i === 0 ? ' foot' : ''),
            onPointerDown: (e) => {
              checkpoint()
              setView({ selected: i })
              startDrag(e, { kind: 'point', i })
            },
            onDoubleClick: () => removePoint(i),
          }
          return i === 0 ? (
            <rect key={i} x={r - 6 * u} y={-y - 6 * u} width={12 * u} height={12 * u} rx={2 * u} {...props} />
          ) : (
            <circle key={i} cx={r} cy={-y} r={(on ? 7.5 : 6.5) * u} {...props} />
          )
        })}

        <g className="dims" fontSize={fs}>
          <Dim x1={frame.x1 - 1.2} y1={0} x2={frame.x1 - 1.2} y2={sec.height} label={fmtLen(metrics.height, units)} vertical u={u} />
          <Dim x1={-rim[0]} y1={sec.height + 0.9} x2={rim[0]} y2={sec.height + 0.9} label={`rim ⌀ ${fmtLen(metrics.rimD, units)}`} u={u} />
          <Dim x1={-sec.footR} y1={-1.1} x2={sec.footR} y2={-1.1} label={`foot ⌀ ${fmtLen(metrics.footD, units)}`} u={u} below />
          <text className="cap-label" x={0} y={-(sec.floorY + sec.brimY) / 2} textAnchor="middle" dominantBaseline="middle">
            holds {fmtVol(metrics.brimMl, units)}
          </text>
        </g>
      </svg>
      <p className="editor-hint">
        Drag points to shape the outside wall · click the wall to add a point · double-click a point to remove it · hold Shift to snap to ½ cm
      </p>
    </div>
  )
}

function Dim({ x1, y1, x2, y2, label, vertical, below, u }) {
  const tick = 4 * u
  return (
    <g className="dim">
      <line x1={x1} y1={-y1} x2={x2} y2={-y2} />
      {vertical ? (
        <>
          <line x1={x1 - tick} x2={x1 + tick} y1={-y1} y2={-y1} />
          <line x1={x2 - tick} x2={x2 + tick} y1={-y2} y2={-y2} />
          <text x={x1 - 6 * u} y={-(y1 + y2) / 2} textAnchor="end" dominantBaseline="middle">{label}</text>
        </>
      ) : (
        <>
          <line x1={x1} x2={x1} y1={-y1 - tick} y2={-y1 + tick} />
          <line x1={x2} x2={x2} y1={-y2 - tick} y2={-y2 + tick} />
          <text x={(x1 + x2) / 2} y={-y1 + (below ? 14 : -6) * u} textAnchor="middle">{label}</text>
        </>
      )}
    </g>
  )
}
