import { colorOf, offsetPath, pointAtS, spanPath } from '../model/color.js'
import { useStore } from '../model/store.js'

// Color on the profile sheet. Outside bands run in lanes just off the
// outside wall, underlays in lanes inside the cavity, in application order
// (first applied nearest the glass). Incalmo sections tint the wall itself,
// and each seam is a tick across it with a diamond to drag.

const d = (pts) => (pts.length ? 'M' + pts.map(([r, y]) => `${r.toFixed(3)} ${(-y).toFixed(3)}`).join('L') : '')
const CLEAR = '#dfe7ee'

// The way out of the glass at s: unit vector, pointing off the outside wall.
export function outwardAt(sec, s) {
  const a = pointAtS(sec, Math.max(0, s - 0.003)), b = pointAtS(sec, Math.min(1, s + 0.003))
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
  return [(b[1] - a[1]) / l, -(b[0] - a[0]) / l]
}

export default function ColorBands({ sec, u, startDrag, toS }) {
  const colors = useStore((s) => s.colors)
  const studio = useStore((s) => s.studio)
  const sel = useStore((s) => s.colorSel)
  const { checkpoint, setView } = useStore.getState()
  const hex = (id) => colorOf(studio, id)?.hex ?? CLEAR

  const outside = colors.regions.filter((r) => r.kind !== 'underlay')
  const inside = colors.regions.filter((r) => r.kind === 'underlay')
  const lane = (k) => (11 + 7 * k) * u

  const pick = (e, r, what) => {
    e.stopPropagation()
    checkpoint()
    setView({ colorSel: r.id, selected: null })
    startDrag(e, what)
  }

  const band = (r, k, side) => {
    const base = side === 'out' ? spanPath(sec.outer, sec.outerS, r.s0, r.s1) : spanPath(sec.inner, sec.innerS, r.s0, r.s1)
    if (base.length < 2) return null
    const path = offsetPath(base, side === 'out' ? -lane(k) : lane(k))
    const on = sel === r.id
    const c = colorOf(studio, r.colorId)
    const cls = `band kind-${r.kind}${on ? ' on' : ''}${c?.opaque ? ' opaque' : ''}`
    const ends = [
      r.kind === 'wrap' && r.zone === 'foot' ? null : { end: 's0', p: path[0] },
      r.kind === 'wrap' && r.zone !== 'foot' ? null : { end: 's1', p: path[path.length - 1] },
    ].filter(Boolean)
    return (
      <g key={r.id} className={cls} style={{ '--c': hex(r.colorId) }}>
        <path
          d={d(path)}
          className="band-line"
          strokeWidth={(r.kind === 'frit' ? 4.5 : r.kind === 'powder' ? 3 : 5) * u}
          strokeDasharray={r.kind === 'frit' ? `0 ${4 * u}` : undefined}
          onPointerDown={(e) => pick(e, r, { kind: 'band', id: r.id, grab: toS(e), base: useStore.getState().colors })}
        />
        <path d={d(path)} className="band-hit" strokeWidth={12 * u} onPointerDown={(e) => pick(e, r, { kind: 'band', id: r.id, grab: toS(e), base: useStore.getState().colors })} />
        {on &&
          ends.map(({ end, p }) => (
            <circle key={end} className="band-end" cx={p[0]} cy={-p[1]} r={5 * u} onPointerDown={(e) => pick(e, r, { kind: 'edge', id: r.id, end })} />
          ))}
      </g>
    )
  }

  const { seams, sections } = colors.incalmo
  const bounds = [0, ...seams, 1]
  const mid = offsetPath(sec.outer, sec.wall / 2)

  return (
    <g className="color-bands">
      {sections.map((id, i) =>
        id == null ? null : (
          <path key={'sec' + i} className="incalmo-wall" d={d(spanPath(mid, sec.outerS, bounds[i], bounds[i + 1]))} strokeWidth={sec.wall} style={{ '--c': hex(id) }} />
        ),
      )}
      {outside.map((r, k) => band(r, k, 'out'))}
      {inside.map((r, k) => band(r, k, 'in'))}
      {seams.map((s, i) => {
        const p = pointAtS(sec, s)
        const [nx, ny] = outwardAt(sec, s)
        const a = [p[0] + nx * 4 * u, p[1] + ny * 4 * u]
        const b = [p[0] - nx * (sec.wall + 4 * u), p[1] - ny * (sec.wall + 4 * u)]
        const h = [p[0] + nx * 16 * u, p[1] + ny * 16 * u]
        const on = sel === `seam:${i}`
        return (
          <g key={'seam' + i} className={'seam' + (on ? ' on' : '')}>
            <line x1={a[0]} y1={-a[1]} x2={b[0]} y2={-b[1]} />
            <rect
              x={h[0] - 5 * u}
              y={-h[1] - 5 * u}
              width={10 * u}
              height={10 * u}
              transform={`rotate(45 ${h[0]} ${-h[1]})`}
              onPointerDown={(e) => {
                e.stopPropagation()
                checkpoint()
                setView({ colorSel: `seam:${i}`, selected: null })
                startDrag(e, { kind: 'seam', i })
              }}
            />
          </g>
        )
      })}
    </g>
  )
}
