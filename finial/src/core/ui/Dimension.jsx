// Dimension lines for printed drawings, in the drawing's own units (mm on
// the paper). Extension lines run from the piece out to the dimension
// line; arrowheads at both ends; the label sits beside the line.

const ARROW = 1.6
const GAP = 0.8

function Arrow({ x, y, angle, color }) {
  return (
    <path
      d={`M0,0 L${-ARROW},${ARROW / 3} L${-ARROW},${-ARROW / 3} Z`}
      transform={`translate(${x} ${y}) rotate(${angle})`}
      fill={color}
    />
  )
}

// Across: from x1 to x2 at height y; ext gives where each extension line
// starts (the piece's edges), so they run from there to the line.
export function DimAcross({ x1, x2, y, from1 = y, from2 = y, label, size = 2.6, color = '#222' }) {
  const ext = (x, from) => <line x1={x} x2={x} y1={from + Math.sign(y - from) * GAP} y2={y + Math.sign(y - from || 1) * 1.2} stroke={color} strokeWidth={0.15} />
  return (
    <g>
      {from1 !== y && ext(x1, from1)}
      {from2 !== y && ext(x2, from2)}
      <line x1={x1} x2={x2} y1={y} y2={y} stroke={color} strokeWidth={0.2} />
      <Arrow x={x1} y={y} angle={180} color={color} />
      <Arrow x={x2} y={y} angle={0} color={color} />
      <text x={(x1 + x2) / 2} y={y - 0.9} fontSize={size} textAnchor="middle" fill={color} stroke="#fff" strokeWidth={0.8} paintOrder="stroke">
        {label}
      </text>
    </g>
  )
}

// Up: from y1 to y2 at x, label turned to read from below.
export function DimUp({ y1, y2, x, from1 = x, from2 = x, label, size = 2.6, color = '#222' }) {
  const ext = (y, from) => <line y1={y} y2={y} x1={from + Math.sign(x - from) * GAP} x2={x + Math.sign(x - from || 1) * 1.2} stroke={color} strokeWidth={0.15} />
  const mid = (y1 + y2) / 2
  return (
    <g>
      {from1 !== x && ext(y1, from1)}
      {from2 !== x && ext(y2, from2)}
      <line x1={x} x2={x} y1={y1} y2={y2} stroke={color} strokeWidth={0.2} />
      <Arrow x={x} y={Math.max(y1, y2)} angle={90} color={color} />
      <Arrow x={x} y={Math.min(y1, y2)} angle={-90} color={color} />
      <text
        x={x - 0.9}
        y={mid}
        fontSize={size}
        textAnchor="middle"
        transform={`rotate(-90 ${x - 0.9} ${mid})`}
        fill={color}
        stroke="#fff"
        strokeWidth={0.8}
        paintOrder="stroke"
      >
        {label}
      </text>
    </g>
  )
}
