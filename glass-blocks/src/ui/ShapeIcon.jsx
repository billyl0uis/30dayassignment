import { useMemo } from 'react'
import { silhouette } from '../geometry/silhouette.js'

export default function ShapeIcon({ preset, size = 34 }) {
  const s = useMemo(() => silhouette(preset), [preset])
  return (
    <svg className="shape-icon" viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
      {s.stroke ? (
        <path d={s.d} fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d={s.d} fill="currentColor" fillRule={s.fillRule} />
      )}
    </svg>
  )
}
