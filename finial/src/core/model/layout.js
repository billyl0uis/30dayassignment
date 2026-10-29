// Plain layout maths for printed sheets: wrapping text to a width and
// picking a drawing scale. Text width comes from a measure function the
// caller passes in (the browser's, or a stand-in in tests).

// Words into lines no wider than maxWidth. A word too long for a line on
// its own gets a line to itself rather than being cut.
export function wrapText(text, maxWidth, measure) {
  const lines = []
  for (const paragraph of String(text).split('\n')) {
    let line = ''
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word
      if (line && measure(next) > maxWidth) {
        lines.push(line)
        line = word
      } else {
        line = next
      }
    }
    lines.push(line)
  }
  return lines
}

// Reduction scales a drawing office would use, largest first.
export const SCALES = [1, 1 / 2, 1 / 2.5, 1 / 3, 1 / 4, 1 / 5, 1 / 10]

// The largest standard scale at which `need` (mm of piece, which scales)
// plus `fixed` (mm of dimension lines and gaps, which don't) fits in
// `room`, checked across and up.
export function chooseScale({ needW, needH, fixedW = 0, fixedH = 0, roomW, roomH }) {
  const most = Math.min((roomW - fixedW) / needW, (roomH - fixedH) / needH)
  return SCALES.find((s) => s <= most) ?? SCALES[SCALES.length - 1]
}

// 0.5 → "1:2", 0.4 → "1:2.5", 1 → "1:1"
export const scaleLabel = (s) => `1:${Number((1 / s).toFixed(2))}`
