import { useEffect, useMemo, useRef, useState } from 'react'
import { BIT_TYPES } from '../model/bits/index.js'
import { useMeasures } from '../model/derived.js'
import { useStore } from '../model/store.js'

// The body's half-profile on a 1 cm grid, as in Jackline: drag points, click
// the wall to add one, double-click to remove, drag "floor" for a solid base.
// Bits show as dots at their height so you can see where they sit in section.
// SVG y runs down and the vessel's runs up, so every height is drawn negated.
const d = (pts) => 'M' + pts.map(([r, y]) => `${r.toFixed(3)} ${(-y).toFixed(3)}`).join('L')
const mirror = (pts) => pts.map(([r, y]) => [-r, y])
const snap = (v) => Math.round(v * 2) / 2

export default function ProfileSheet() {
  const points = useStore((s) => s.points)
  const selectedPoint = useStore((s) => s.selectedPoint)
  const selectedBit = useStore((s) => s.selected)
  const bits = useStore((s) => s.bits)
  const { checkpoint, live, setView, removePoint } = useStore.getState()
  const m = useMeasures()
  const sec = m.sec

  const wrap = useRef()
  const svg = useRef()
  const drag = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [size, setSize] = useState({ w: 300, h: 300 })
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(wrap.current)
    return () => ro.disconnect()
  }, [])

  // Holds still while you drag and refits when you let go.
  const held = useRef(null)
  const frame = useMemo(() => {
    if (dragging && held.current) return held.current
    const half = Math.max(5, Math.max(...sec.outer.map((p) => p[0])) + 2.5)
    const top = Math.max(8, sec.height * 1.08 + 1)
    return (held.current = { x0: -half, x1: half, y0: -1, y1: top })
  }, [dragging, sec])
  const vbW = frame.x1 - frame.x0, vbH = frame.y1 - frame.y0
  const u = 1 / (Math.min(size.w / vbW, size.h / vbH) || 30)

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
      live({ floor: Math.max(s.walls[0], Math.min(sec.brimY - 0.3, y)) })
    }
  }
  const onUp = (e) => {
    if (!drag.current) return
    svg.current.releasePointerCapture(e.pointerId)
    drag.current = null
    setDragging(false)
  }

  // Clicking the wall drops a new point there, with the wall thickness the
  // section already has at that spot, and picks it up.
  const insert = (e) => {
    const [r, y] = toCm(e)
    let best = 0, bestD = Infinity
    sec.outer.forEach((p, i) => {
      const dd = Math.hypot(p[0] - r, p[1] - y)
      if (dd < bestD) (bestD = dd), (best = i)
    })
    const at = sec.seg[best] + 1
    const s = useStore.getState()
    checkpoint()
    live({
      points: [...s.points.slice(0, at), [Math.max(0.1, r), Math.max(0, y)], ...s.points.slice(at)],
      walls: [...s.walls.slice(0, at), sec.walls[best], ...s.walls.slice(at)],
      selectedPoint: at,
    })
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

  return (
    <div className="sheet" ref={wrap}>
      <svg
        ref={svg}
        viewBox={`${frame.x0} ${-frame.y1} ${vbW} ${vbH}`}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerDown={() => setView({ selectedPoint: null })}
      >
        <g className="grid">{grid}</g>
        <line className="axis" x1={0} x2={0} y1={-frame.y1 - vbH} y2={-frame.y0 + vbH} />
        <line className="table" x1={frame.x0 - vbW} x2={frame.x1 + vbW} y1={0} y2={0} />
        <path className="section ghost" d={d(mirror(sec.section)) + 'Z'} />
        <path className="section" d={d(sec.section) + 'Z'} />

        <g className={'floor' + (dragging && drag.current?.kind === 'floor' ? ' on' : '')} onPointerDown={(e) => (checkpoint(), startDrag(e, { kind: 'floor' }))}>
          <line x1={-sec.inner[0][0]} x2={sec.inner[0][0]} y1={-sec.floorY} y2={-sec.floorY} />
          <rect x={-20 * u} y={-sec.floorY - 7 * u} width={40 * u} height={14 * u} rx={7 * u} />
          <text x={0} y={-sec.floorY + 3.6 * u} fontSize={9 * u}>floor</text>
        </g>

        <path className="control" d={d(points)} style={{ strokeWidth: u }} />
        <path className="hit" d={d(sec.outer)} strokeWidth={14 * u} onPointerDown={insert} />

        {/* Bits placed at a point show as dots at their height on the wall. */}
        {bits.map((b, i) => {
          if (BIT_TYPES[b.type].placement !== 'point') return null
          const a = m.bits[i].anchor
          const on = b.id === selectedBit
          return (
            <g key={b.id} className={'bit-dot' + (on ? ' on' : '')} onPointerDown={(e) => (e.stopPropagation(), setView({ selected: b.id }))}>
              {/* Just outside the wall, so it never hides a profile point. */}
              <circle cx={a.r + 12 * u} cy={-a.y} r={4.5 * u} />
            </g>
          )
        })}

        {points.map(([r, y], i) => {
          const on = selectedPoint === i
          const props = {
            className: 'pt' + (on ? ' on' : '') + (i === 0 ? ' foot' : ''),
            onPointerDown: (e) => {
              checkpoint()
              setView({ selectedPoint: i })
              startDrag(e, { kind: 'point', i })
            },
            onDoubleClick: () => removePoint(i),
          }
          return i === 0 ? (
            <rect key={i} x={r - 5.5 * u} y={-y - 5.5 * u} width={11 * u} height={11 * u} rx={2 * u} {...props} />
          ) : (
            <circle key={i} cx={r} cy={-y} r={(on ? 7 : 6) * u} {...props} />
          )
        })}
      </svg>
    </div>
  )
}
