import { formatLength } from '@core/model/units'
import { stopperTaper } from '../model/closures.js'

// The stopper from the front, to scale: head, tapered shank, dauber. Drawn
// only once the head and shank sizes are in; otherwise it says what's
// missing. Model units are mm with y down from the top of the head.
export function StopperDrawing({ stopper: s, units }) {
  const need = ['headWidth', 'headHeight', 'shankTopD', 'shankBottomD', 'shankLength'].filter((k) => s[k] == null)
  if (need.length || !s.head) return <p className="text-xs text-faint">The stopper drawing appears once the head and shank sizes are in.</p>

  const dauber = s.dauber && s.dauberLength != null && s.dauberD != null ? s : null
  const w = s.headWidth / 2
  const h = s.headHeight
  const total = h + s.shankLength + (dauber ? s.dauberLength : 0)
  const reach = Math.max(w, s.shankTopD / 2)
  const pad = Math.max(total, reach * 2) * 0.12
  const font = Math.max(total, reach * 2) * 0.045
  const taper = stopperTaper(s)

  const head = {
    disc: <rect x={-w} y={0} width={2 * w} height={h} rx={Math.min(w, h) * 0.18} />,
    ball: <ellipse cx={0} cy={h / 2} rx={w} ry={h / 2} />,
    teardrop: <path d={`M0 0 C${w * 1.3} ${h * 0.45} ${w} ${h} 0 ${h} C${-w} ${h} ${-w * 1.3} ${h * 0.45} 0 0Z`} />,
    faceted: <polygon points={`${-w * 0.5},0 ${w * 0.5},0 ${w},${h * 0.35} ${w * 0.6},${h} ${-w * 0.6},${h} ${-w},${h * 0.35}`} />,
  }[s.head]
  const top = s.shankTopD / 2, bottom = s.shankBottomD / 2, shankEnd = h + s.shankLength

  return (
    <figure className="grid gap-1">
      <svg viewBox={`${-reach - pad * 3.2} ${-pad} ${2 * reach + pad * 4.4} ${total + pad * 2}`} className="max-h-72 w-full" role="img" aria-label="Stopper drawing">
        <g fill="var(--glass-fill)" stroke="var(--glass-line)" strokeWidth={1.2} vectorEffect="non-scaling-stroke">
          {head}
          <polygon points={`${-top},${h} ${top},${h} ${bottom},${shankEnd} ${-bottom},${shankEnd}`} />
          {dauber && <rect x={-s.dauberD / 2} y={shankEnd} width={s.dauberD} height={s.dauberLength} rx={s.dauberD / 2} />}
        </g>
        {/* The ground length: hatched, ground with the neck. */}
        <g stroke="var(--accent)" strokeWidth={1} vectorEffect="non-scaling-stroke">
          <line x1={-top} y1={h} x2={-bottom} y2={shankEnd} />
          <line x1={top} y1={h} x2={bottom} y2={shankEnd} />
        </g>
        <line x1={0} x2={0} y1={-pad * 0.6} y2={total + pad * 0.6} stroke="var(--axis)" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
        <g fontSize={font} className="fill-mute font-mono">
          <text x={reach + pad * 0.3} y={h + font}>⌀ {formatLength(s.shankTopD, units, 2)}</text>
          <text x={reach + pad * 0.3} y={shankEnd}>⌀ {formatLength(s.shankBottomD, units, 2)}</text>
          <text x={-reach - pad * 0.3} y={(h + shankEnd) / 2} textAnchor="end">{formatLength(s.shankLength, units)}</text>
          <text x={-reach - pad * 0.3} y={(h + shankEnd) / 2 + font * 1.2} textAnchor="end">{taper.included.toFixed(1)}°</text>
        </g>
      </svg>
      <figcaption className="text-xs text-faint">Orange: the ground length. Shank and neck are ground together to fit.</figcaption>
    </figure>
  )
}
