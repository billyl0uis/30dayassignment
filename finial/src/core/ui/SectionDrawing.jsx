// A vessel in section, as SVG in model units (mm, z up, so the parent
// flips y). Both halves: the right is the one you edit, the left its
// mirror, so you see the whole silhouette the way you'd judge it at the
// bench. Used by the profile editor and the shop sheet.
const path = (pts, close) => `M${pts.map(([r, z]) => `${r},${-z}`).join('L')}${close ? 'Z' : ''}`

export function SectionDrawing({ section, glassFill = 'var(--glass-fill)', line = 'var(--glass-line)', mirror = true }) {
  const glass = path(section.glass, true)
  const outer = path(section.outer)
  const inner = path(section.inner)
  const half = (
    <>
      <path d={glass} fill={glassFill} stroke="none" />
      <path d={outer} fill="none" stroke={line} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <path d={inner} fill="none" stroke={line} strokeWidth={1} strokeOpacity={0.7} vectorEffect="non-scaling-stroke" />
    </>
  )
  return (
    <g>
      {mirror && <g transform="scale(-1 1)" opacity={0.55}>{half}</g>}
      {half}
    </g>
  )
}
