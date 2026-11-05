import { radiusAt } from '../geometry/build.js'

// How far `upper` sinks down into `lower` when it's stacked on it, in cm.
// 0 means the bottom of the upper part sits exactly on the top of the lower one.
// Sinks the upper part just far enough that the seam doesn't pinch. Across the
// overlap, the outline of the two together (the wider of the two at each height)
// has to stay nearly as wide as the narrower part is near the join. A bubble
// settles onto a stem, a neck rises out of a shoulder, and a flat-bottomed lip
// sits flush on a neck.
export function joinDepth(lower, upper) {
  const lh = lower.params.h
  const uh = upper.params.h
  const widest = (part, a, b) => Math.max(...[0, 1, 2, 3, 4, 5].map((k) => radiusAt(part, a + ((b - a) * k) / 5)))
  const target = 0.85 * Math.min(widest(lower, 0.75 * lh, lh), widest(upper, 0, 0.25 * uh))
  const pinch = (d) =>
    Math.min(...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => {
      const y = (d * k) / 7 // height above the upper part's base
      return Math.max(radiusAt(lower, lh - d + y), radiusAt(upper, y))
    }))

  const max = 0.6 * Math.min(lh, uh)
  const STEPS = 48
  for (let i = 0; i <= STEPS; i++) {
    const d = (max * i) / STEPS
    // ...and the lower part has to be wide enough where the upper one's base
    // lands, so nothing perches on a dome's single top point.
    if (pinch(d) >= target && radiusAt(lower, lh - d) >= target) return d
  }
  return max
}

// Where each stacked part sits on the center axis. Parts keep one list order;
// free parts are skipped here (they carry their own position) but keep their
// slot, so switching one back to the stack returns it where it was.
export function stackLayout(parts) {
  const ys = {}
  let top = 0
  let below = null
  for (const p of parts) {
    if (p.mode !== 'stack') continue
    const y = below ? Math.max(0, ys[below.id] + below.params.h - joinDepth(below, p)) : 0
    ys[p.id] = y
    top = Math.max(top, y + p.params.h)
    below = p
  }
  return { ys, height: top }
}

export { radiusAt }

// Top of the whole piece, free parts included (roughly, ignoring their tilt).
export function pieceHeight(parts) {
  const free = parts.filter((p) => p.mode === 'free').map((p) => p.position[1] + p.params.h)
  return Math.max(stackLayout(parts).height, ...free)
}
