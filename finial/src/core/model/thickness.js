// Where the wall changes thickness suddenly. Glass that's thick next to
// thin cools unevenly, and that's where blown pieces tend to crack; this
// only points at the places, it doesn't judge your annealing.
//
// "Sudden" is your rule: the wall getting `ratio` times thicker (or
// thinner) within `within` mm along the wall.

// A starting rule to edit, not a published limit.
// TODO(source): set from your own shop practice or a reference you trust.
export const DEFAULT_JUMP_RULE = { ratio: 2, within: 10 }

// Distance along a polyline to each of its points.
export function distanceAlong(pts) {
  const s = [0]
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
  return s
}

// Thinnest and thickest the wall is set anywhere, in mm.
export function thicknessRange(section) {
  return { thinnest: Math.min(...section.thickness), thickest: Math.max(...section.thickness) }
}

// The stretches of wall that break the rule, each as
//   { from, to }        sample indexes along section.outer
//   { thin, thick }     the two thicknesses that make the worst jump
//   ratio               thick / thin
//   distance            how far apart along the wall those two are, mm
//   zLow, zHigh         the heights the stretch spans, mm
export function thicknessJumps(section, rule = DEFAULT_JUMP_RULE) {
  const { outer, thickness: t } = section
  const s = distanceAlong(outer)
  const worst = new Array(outer.length).fill(null)
  for (let i = 0; i < outer.length; i++) {
    for (let j = i + 1; j < outer.length && s[j] - s[i] <= rule.within; j++) {
      const thin = Math.min(t[i], t[j])
      const thick = Math.max(t[i], t[j])
      const ratio = thick / thin
      if (ratio < rule.ratio) continue
      const jump = { ratio, thin, thick, distance: s[j] - s[i] }
      for (let k = i; k <= j; k++) if (!worst[k] || worst[k].ratio < ratio) worst[k] = jump
    }
  }
  // Runs of flagged samples, each reported by its worst jump.
  const zones = []
  for (let i = 0; i < outer.length; i++) {
    if (!worst[i]) continue
    let j = i
    let pick = worst[i]
    while (j + 1 < outer.length && worst[j + 1]) {
      j++
      if (worst[j].ratio > pick.ratio) pick = worst[j]
    }
    const zs = outer.slice(i, j + 1).map((p) => p[1])
    zones.push({ from: i, to: j, ...pick, zLow: Math.min(...zs), zHigh: Math.max(...zs) })
    i = j
  }
  return zones
}
