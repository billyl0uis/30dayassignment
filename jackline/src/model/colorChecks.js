import { colorOf, hasInside, pointAtS, stackRuns } from './color.js'
import { fmtLen } from './units.js'

// Checks on the color plan, in the same shape as checks.js:
// { level: 'bad' | 'warn' | 'info', title, text }. Each says what's wrong,
// where on the profile, and one concrete fix. Limits live in the studio
// settings so a studio can set its own.

const EPS = 1e-6
// How sharply the outside wall may turn across a seam (over about a
// centimetre of wall) before the two openings stop being joinable.
const MAX_SEAM_TURN = 30 // degrees
const SEAM_REACH = 0.6 // cm of wall either side of the seam

export function colorChecks(sec, colors, studio, units) {
  const at = (s) => `${fmtLen(pointAtS(sec, s)[1], units)} up`
  const between = (lo, hi) => `from ${fmtLen(pointAtS(sec, lo)[1], units)} to ${fmtLen(pointAtS(sec, hi)[1], units)} up`
  const name = (id) => colorOf(studio, id)?.name ?? 'a missing color'
  const out = []
  const add = (id, level, title, text) => out.push({ id, check: { level, title, text } })
  const { seams, sections } = colors.incalmo
  const bounds = [0, ...seams, 1]
  const runs = stackRuns(sec, colors, studio)

  // ---- Incalmo seams ----------------------------------------------------
  seams.forEach((s, i) => {
    // Below the cavity floor the join is through solid glass, as thick as the piece is wide there.
    const thick = hasInside(sec, s) ? sec.wall : pointAtS(sec, s)[0]
    if (thick < studio.minSeamWall - EPS) {
      add(`seam-wall-${i}`, 'bad', 'Seam too thin to join', `The seam at ${at(s)} is only ${fmtLen(thick, units, 2)} thick; joins below ${fmtLen(studio.minSeamWall, units, 2)} tend to crack or pull apart. Thicken the wall to at least ${fmtLen(studio.minSeamWall, units, 2)}.`)
    }
    const turn = seamTurn(sec, s)
    if (turn > MAX_SEAM_TURN) {
      add(`seam-turn-${i}`, 'warn', 'Seam on a sharp turn', `The wall bends ${Math.round(turn)}° right at the seam at ${at(s)}, so the two bubbles' openings won't meet cleanly. Move the seam onto a straighter stretch of wall.`)
    }
  })
  if (seams.length > studio.maxJoins) {
    add('joins', 'warn', `${seams.length} incalmo joins`, `Each join is its own bubble and a timed handoff at the bench; more than ${studio.maxJoins} needs a full, practised team. Remove a seam, or plan the session for a full team.`)
  }

  // ---- Applications on one gather ------------------------------------------
  // Each incalmo section is its own gather; without seams the piece is one.
  sections.forEach((sectionColor, k) => {
    const lo = bounds[k], hi = bounds[k + 1]
    const on = colors.regions.filter((r) => r.colorId != null && r.s0 < hi - EPS && r.s1 > lo + EPS)
    const n = on.length + (sectionColor != null ? 1 : 0)
    if (n > studio.maxStack) {
      const where = sections.length > 1 ? `The section ${between(lo, hi)}` : 'This gather'
      add(`stack-${k}`, 'warn', `${n} color steps on one gather`, `${where} takes ${n} color applications; each one is more heat and time on the pipe. Drop or combine one (powder in place of an underlay, say), or split it with an incalmo seam.`)
    }
  })

  // ---- Compatibility -------------------------------------------------------
  const used = [...new Set([...colors.regions.map((r) => r.colorId), ...sections].filter((id) => id != null))]
  const clearCoe = studio.clear.coe
  for (const id of used) {
    const c = colorOf(studio, id)
    if (!c) continue
    if (!c.tested) {
      add(`coe-tested-${id}`, 'bad', `${c.name} not tested`, `${c.name} isn't marked tested with ${studio.clear.name}; untested color can crack the piece in the annealer or weeks later. Test a strip against your clear, then tick "tested" in the color library.`)
    } else if (c.coe != null && clearCoe != null && Math.abs(c.coe - clearCoe) > studio.coeTolerance + EPS) {
      add(`coe-${id}`, 'bad', `${c.name} COE mismatch`, `${c.name} is COE ${c.coe} against ${clearCoe} for ${studio.clear.name}, more than the ${studio.coeTolerance} you allow. Swap it for a COE ${clearCoe} color, or re-test and adjust the tolerance.`)
    }
  }
  if (used.length && clearCoe == null) {
    add('coe-clear', 'warn', 'Studio clear COE missing', `With no COE for ${studio.clear.name}, color can't be compared against it. Enter it at the top of the color library.`)
  }

  // ---- Reactive colors touching ---------------------------------------------
  const pairs = (studio.reactivePairs ?? []).filter((p) => p.length === 2)
  const tags = (id) => new Set((colorOf(studio, id)?.reactive ?? []).map((t) => t.toLowerCase()))
  const reacts = (a, b) => {
    if (a == null || b == null || a === b) return null
    const ta = tags(a), tb = tags(b)
    return pairs.find(([x, y]) => (ta.has(x) && tb.has(y)) || (ta.has(y) && tb.has(x))) ?? null
  }
  const seen = new Set()
  const touch = (a, b, s, how) => {
    const p = reacts(a, b)
    const key = [a, b].sort().join('|')
    if (!p || seen.has(key)) return
    seen.add(key)
    // Name each color with its own half of the pair.
    const [ta, tb] = tags(a).has(p[0]) && tags(b).has(p[1]) ? p : [p[1], p[0]]
    add(`react-${key}`, 'warn', 'Reactive colors touching', `${name(a)} (${ta}) ${how} ${name(b)} (${tb}) at ${at(s)}; where they meet they can strike a dark line. Put a clear layer between them, or leave a gap between the bands.`)
  }
  for (const run of runs) {
    // Layers next to each other in the wall touch face to face.
    for (let i = 1; i < run.layers.length; i++) touch(run.layers[i - 1].colorId, run.layers[i].colorId, (run.s0 + run.s1) / 2, 'lies against')
  }
  // Bands on the same surface touch edge to edge, and incalmo sections at their seam.
  const side = (r) => (r.kind === 'underlay' ? 'in' : 'out')
  for (const a of colors.regions)
    for (const b of colors.regions)
      if (a !== b && side(a) === side(b) && Math.abs(a.s1 - b.s0) < EPS) touch(a.colorId, b.colorId, a.s1, 'butts up to')
  seams.forEach((s, i) => touch(sections[i], sections[i + 1], s, 'is joined to'))

  // ---- Layers that won't be seen ---------------------------------------------
  for (const r of colors.regions) {
    const mine = runs.flatMap((run) => run.layers.filter((l) => l.key === r.id).map((l) => ({ l, run })))
    if (!mine.length) {
      add(`nowhere-${r.id}`, 'info', 'Underlay below the cavity', `The ${name(r.colorId)} underlay sits entirely below ${at(sec.innerS[0])}, where the glass is solid and there's no inside for it. Move it up into the cavity.`)
    } else if (mine.every(({ l }) => l.hidden)) {
      add(`hidden-${r.id}`, 'info', "Layer won't be visible", `The ${name(r.colorId)} ${r.kind} ${between(r.s0, r.s1)} is fully covered by opaque glass on both sides. Remove it to save glass and time, or make a covering layer transparent.`)
    }
  }
  sections.forEach((id, k) => {
    if (id == null) return
    const mine = runs.filter((run) => run.s0 >= bounds[k] - EPS && run.s1 <= bounds[k + 1] + EPS)
    if (mine.length && mine.every((run) => run.layers.find((l) => l.kind === 'body').hidden)) {
      add(`hidden-section-${k}`, 'info', "Section color won't be visible", `The ${name(id)} section ${between(bounds[k], bounds[k + 1])} is covered by opaque glass on both sides. Make it clear, or make a covering layer transparent.`)
    }
  })

  return out
}

// How many degrees the outside wall turns across a seam.
export function seamTurn(sec, s) {
  const ds = SEAM_REACH / sec.outerLen
  const dir = (a, b) => {
    const p = pointAtS(sec, Math.max(0, Math.min(1, a))), q = pointAtS(sec, Math.max(0, Math.min(1, b)))
    const l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1
    return [(q[0] - p[0]) / l, (q[1] - p[1]) / l]
  }
  const u = dir(s - ds, s), v = dir(s, s + ds)
  return (Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1]))) * 180) / Math.PI
}
