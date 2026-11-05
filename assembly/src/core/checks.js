// The live checks. Static only: no physics engine. Each check is a plain
// statics test on the arrangement as placed, using the assumptions in the
// scene's settings (friction, safety factor, loop rule…), which are
// estimates the user can change.
//
//   BAD  tip · slide · lean won't hold · bare glass contact · hanging point
//        too weak · hung part with no hanging point · resting on nothing
//   WARN too big for the annealer · thick section · off the base plate
import { partMetrics } from './parts.js'
import { applyRot, bounds, hangPointLocal, rotationMatrix } from './placement.js'
import { detectContacts, worldPositions } from './contacts.js'
import { containsOrigin, convexHull, insideDistance } from './geom2d.js'

export const TIP_TOL_MM = 1 // centre of mass may sit this far outside the footing (map resolution)

const TYPE_NAME = { bare: 'bare glass', pad: 'pad', adhesive: 'adhesive' }

// Friction coefficient for a contact type; null means no-slide (adhesive).
export const muOf = (type, settings) => (type === 'adhesive' ? null : settings.friction[type] ?? 0.5)

// ---------------------------------------------------------------- sliding

// Can these contacts hold a weight up without anything sliding? Each contact
// can push anywhere inside its friction cone (half-angle atan μ round its
// normal). The part holds if straight up is inside the combined cone of all
// its contacts. Cones are drawn as 16 edge rays and projected onto the plane
// y = 1, where "up is inside" becomes "the origin is inside the hull".
// Adhesive holds in any direction. Rays pointing level or down are left out,
// which can only make the answer more cautious.
export function holdsAgainstSliding(contacts, muFor) {
  const pts = []
  for (const c of contacts) {
    const mu = muFor(c)
    if (mu === null) return true
    const n = c.normal
    const t1 = Math.abs(n[1]) < 0.9 ? cross(n, [0, 1, 0]) : cross(n, [1, 0, 0])
    const a = unit(t1), b = cross(n, a)
    const rays = [n]
    for (let k = 0; k < 16; k++) {
      const th = (k / 16) * Math.PI * 2
      rays.push([0, 1, 2].map((i) => n[i] + mu * (Math.cos(th) * a[i] + Math.sin(th) * b[i])))
    }
    for (const g of rays) if (g[1] > 1e-9) pts.push([g[0] / g[1], g[2] / g[1]])
  }
  return pts.length >= 1 && containsOrigin(pts, 1e-9)
}

// The smallest friction coefficient (same for every non-adhesive contact)
// that would stop the slide. For messages; 0–3 searched.
export function frictionNeeded(contacts) {
  if (holdsAgainstSliding(contacts, () => 0)) return 0
  let lo = 0, hi = 3
  if (!holdsAgainstSliding(contacts, () => hi)) return Infinity
  for (let i = 0; i < 30; i++) {
    const m = (lo + hi) / 2
    holdsAgainstSliding(contacts, () => m) ? (hi = m) : (lo = m)
  }
  return hi
}

// ---------------------------------------------------------------- leaning

// A leaning part, in the vertical plane through its lean direction: foot
// contact F on the base, top contact T on the wall or a part, weight W at
// the centre of mass G. Like a ladder: find contact forces, each inside its
// friction cone, that balance the weight and its turning moment. One unknown
// is left free (friction at both ends shares the load), so this is an
// interval check on that one unknown.
//
// Points are [s, y]: s along the lean direction, y up. Normals point from
// the support into the part. mu: number, or null for adhesive.
export function leanHolds({ F, nF, muF, T, nT, muT, G }) {
  const W = 1
  const rT = [T[0] - F[0], T[1] - F[1]], rG = [G[0] - F[0], G[1] - F[1]]
  // Unknown: top force fT = (fs, fy). Foot force fF = (0, W) − fT.
  // Moment about F: rT × fT = W·rG.s  →  rT.s·fy − rT.y·fs = W·rG.s.
  if (Math.abs(rT[1]) < 1e-6) return { holds: false, reason: 'degenerate' }
  // Parametrise by fy = t: fs = (rT.s·t − W·rG.s) / rT.y.
  const fT = (t) => [(rT[0] * t - W * rG[0]) / rT[1], t]
  const fT0 = fT(0), fT1 = [rT[0] / rT[1], 1] // fT(t) = fT0 + t·fT1
  const fF0 = [-fT0[0], W - fT0[1]], fF1 = [-fT1[0], -fT1[1]]
  let lo = -Infinity, hi = Infinity
  // a + b·t ≥ 0
  const need = (a, b) => {
    if (Math.abs(b) < 1e-12) {
      if (a < -1e-12) (lo = Infinity), (hi = -Infinity)
      return
    }
    const t = -a / b
    b > 0 ? (lo = Math.max(lo, t)) : (hi = Math.min(hi, t))
  }
  const cone = (f0, f1, n, mu) => {
    if (mu === null) return // adhesive: takes push, pull and shear
    const tn = [n[1], -n[0]]
    const dot = (f, v) => f[0] * v[0] + f[1] * v[1]
    need(dot(f0, n), dot(f1, n)) // pushes, doesn't pull
    need(mu * dot(f0, n) - dot(f0, tn), mu * dot(f1, n) - dot(f1, tn))
    need(mu * dot(f0, n) + dot(f0, tn), mu * dot(f1, n) + dot(f1, tn))
  }
  cone(fF0, fF1, nF, muF)
  cone(fT0, fT1, nT, muT)
  if (lo <= hi + 1e-12) return { holds: true }
  return { holds: false }
}

// ---------------------------------------------------------------- hanging

// What a hanging point can be trusted with, in kg, before the safety factor.
// Loops use the rule of thumb from settings (placeholder numbers — not an
// engineering rating). Wire and caps use the rating the user typed.
export function hangRatingKg(hang, settings) {
  if (!hang) return 0
  if (hang.kind === 'loop') return hang.loopDiaMm < settings.loopRule.minMm ? 0 : hang.loopDiaMm / settings.loopRule.mmPerKg
  if (hang.kind === 'drilled') return hang.wireRatingKg
  return hang.capRatingKg
}

// ---------------------------------------------------------------- annealer

// Does one part fit the annealer in some orientation? Its own bounding box
// is tried in all six axis-aligned turns (diagonal placements aren't tried,
// so a long rod that would only fit corner to corner is flagged).
export function fitsAnnealer(size, annealer) {
  const s = [size.w, size.d, size.h]
  const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]
  return perms.some(([a, b, c]) => s[a] <= annealer.w && s[b] <= annealer.d && s[c] <= annealer.h)
}

// ---------------------------------------------------------------- run all

export function worldCom(part, m) {
  const c = applyRot(rotationMatrix(part.pose), m.comMm)
  return [c[0] + part.pose.x, c[1] + part.pose.y, c[2] + part.pose.z]
}

export function runChecks(scene) {
  const st = scene.settings
  const contacts = detectContacts(scene)
  const parts = scene.parts
  const byId = new Map(parts.map((p) => [p.id, p]))
  const metrics = new Map(parts.map((p) => [p.id, partMetrics(p, st)]))
  const name = (id) => byId.get(id)?.name ?? id
  const issues = []
  const add = (level, code, partIds, title, detail, extra = {}) => issues.push({ level, code, partIds, title, detail, ...extra })

  const supports = new Map(parts.map((p) => [p.id, []])) // contacts holding a part up
  const above = new Map(parts.map((p) => [p.id, []])) // parts resting on a part
  for (const c of contacts) {
    if (c.kind === 'support') supports.get(c.a).push(c)
    if (c.kind === 'support' && byId.has(c.b)) above.get(c.b).push(c.a)
  }
  // Everything a part carries: itself plus whatever rests on it, all the way
  // up. A part resting on two others counts fully in each (cautious).
  const load = (id) => {
    const seen = new Set([id])
    const stack = [id]
    while (stack.length) for (const a of above.get(stack.pop()) ?? []) if (!seen.has(a)) seen.add(a), stack.push(a)
    let w = 0, cx = 0, cy = 0, cz = 0
    for (const pid of seen) {
      const p = byId.get(pid), m = metrics.get(pid)
      const c = worldCom(p, m)
      w += m.weightG
      cx += c[0] * m.weightG, cy += c[1] * m.weightG, cz += c[2] * m.weightG
    }
    return { ids: [...seen], weightG: w, com: [cx / w, cy / w, cz / w] }
  }
  const muFor = (c) => muOf(c.type, st)

  // Bare glass contacts.
  for (const c of contacts)
    if (c.type === 'bare') {
      const other = c.b === 'base' ? 'the base' : c.b === 'wall' ? 'the wall' : name(c.b)
      add('bad', 'bare', [c.a, ...(byId.has(c.b) ? [c.b] : [])], `Bare glass contact: ${name(c.a)} on ${other}`, 'Glass on glass chips, scratches and slides. Use a pad or adhesive.', { contactKey: c.key })
    }

  for (const p of parts) {
    const m = metrics.get(p.id)
    if (p.pose.mount === 'hung') {
      // Hanging point.
      const carried = load(p.id).weightG
      if (!p.hang) add('bad', 'no-hang', [p.id], `${p.name} hangs with no hanging point`, 'Choose a hot-pulled loop, drilled hole and wire, or glued cap.')
      else {
        const rating = hangRatingKg(p.hang, st)
        const needKg = (carried / 1000) * st.safetyFactor
        if (needKg > rating + 1e-9) {
          const how =
            p.hang.kind === 'loop'
              ? p.hang.loopDiaMm < st.loopRule.minMm
                ? `Loop is ${p.hang.loopDiaMm} mm; the rule of thumb's minimum is ${st.loopRule.minMm} mm.`
                : `Rule of thumb (not an engineering rating): ${st.loopRule.mmPerKg} mm of loop per kg → needs ${(needKg * st.loopRule.mmPerKg).toFixed(1)} mm, has ${p.hang.loopDiaMm} mm.`
              : rating === 0
                ? 'No rating entered. Enter the maker’s rating.'
                : `Rated ${rating} kg; needs ${needKg.toFixed(2)} kg.`
          add('bad', 'hang-weak', [p.id], `${p.name}: hanging point too weak`, `Carries ${Math.round(carried)} g × safety factor ${st.safetyFactor} = ${needKg.toFixed(2)} kg. ${how}`)
        }
      }
    } else if (p.pose.lean) {
      leanCheck(p, m)
    } else {
      const sup = supports.get(p.id)
      if (!sup.length) add('bad', 'floating', [p.id], `${p.name} isn’t resting on anything`, 'Something below it moved. Drag it, or press Settle all.')
      else {
        // Tip: centre of mass of everything it carries, over its footing.
        const L = load(p.id)
        const hull = convexHull(sup.flatMap((c) => c.points.map((q) => [q[0], q[2]])))
        const inside = insideDistance([L.com[0], L.com[2]], hull)
        if (inside < -TIP_TOL_MM) {
          const what = L.ids.length > 1 ? `${p.name} and the ${L.ids.length - 1} part${L.ids.length > 2 ? 's' : ''} on it` : p.name
          add('bad', 'tip', L.ids, `${p.name} tips`, `The centre of mass of ${what} is ${Math.round(-inside)} mm outside its footing.`, { focus: p.id })
        }
        // Slide.
        if (!holdsAgainstSliding(sup, muFor)) {
          const steep = sup.reduce((a, c) => (tilt(c) > tilt(a) ? c : a))
          const need = frictionNeeded(sup.filter((c) => c.type !== 'adhesive'))
          const mu = muFor(steep)
          add(
            'bad',
            'slide',
            [p.id],
            `${p.name} slides`,
            `Its contact${sup.length > 1 ? 's slope' : ' slopes'} up to ${Math.round(tilt(steep))}°. ${TYPE_NAME[steep.type]} (μ ≈ ${mu}, estimate) holds to ${Math.round((Math.atan(mu) * 180) / Math.PI)}°.${Number.isFinite(need) ? ` Needs μ ≈ ${need.toFixed(2)}.` : ''} Adhesive would hold it.`,
            { contactKey: steep.key },
          )
        }
        // Off the base plate.
        const { baseW, baseD } = scene.stage
        const offBase = sup.some((c) => c.b === 'base' && c.points.some((q) => Math.abs(q[0]) > baseW / 2 || Math.abs(q[2]) > baseD / 2))
        if (offBase) add('warn', 'off-base', [p.id], `${p.name} is off the base plate`, 'Part of its footing is beyond the base plate’s edge.')
      }
    }

    // Annealer: each part on its own.
    if (!fitsAnnealer(m.size, st.annealer)) {
      const a = st.annealer
      add('warn', 'annealer', [p.id], `${p.name} is too big for the annealer`, `Part ${Math.round(m.size.w)} × ${Math.round(m.size.d)} × ${Math.round(m.size.h)} mm; annealer ${a.w} × ${a.d} × ${a.h} mm (tried every square-on orientation).`)
    }
    // Thick sections.
    if (m.thickestMm > st.thickSectionMm) add('warn', 'thick', [p.id], `${p.name} is ${Math.round(m.thickestMm)} mm thick`, `Thicker than ${st.thickSectionMm} mm: anneal time grows with thickness. Check your annealing schedule.`)
  }

  function leanCheck(p, m) {
    const foot = contacts.find((c) => c.a === p.id && c.b === 'base')
    const top = contacts.find((c) => c.a === p.id && c.kind === 'lean')
    if (!foot || !top) {
      add('bad', 'lean-gap', [p.id], `${p.name} doesn’t reach what it leans on`, 'Increase the lean angle or move it closer.')
      return
    }
    // The lean plane: horizontal direction from the foot towards the top contact.
    let d = [top.center[0] - foot.center[0], top.center[2] - foot.center[2]]
    const l = Math.hypot(...d) || 1
    d = [d[0] / l, d[1] / l]
    const S = (q) => [q[0] * d[0] + q[2] * d[1], q[1]]
    const G = worldCom(p, m)
    const nT = top.normal
    const nTs = [nT[0] * d[0] + nT[2] * d[1], nT[1]]
    const nl = Math.hypot(...nTs) || 1
    const args = { F: S(foot.center), nF: [0, 1], muF: muFor(foot), T: S(top.center), nT: [nTs[0] / nl, nTs[1] / nl], muT: muFor(top), G: S(G) }
    if (leanHolds(args).holds) return
    // Falls away: its centre of mass is on the far side of the foot from
    // what it leans on, so nothing at the top can hold it back.
    const away = (args.G[0] - args.F[0]) * (args.T[0] - args.F[0]) <= 0
    const target = top.b === 'wall' ? 'the wall' : name(top.b)
    if (away) add('bad', 'lean-tip', [p.id], `${p.name} won’t stay leaning on ${target}`, 'Its centre of mass is behind the edge it stands on, so it rocks back (or falls away). Lean it further over.')
    else
      add('bad', 'lean-slide', [p.id], `${p.name} slides down ${target}`, `Leaning needs friction at both the foot (${TYPE_NAME[foot.type]}) and the top (${TYPE_NAME[top.type]}). Stand it more upright, or use adhesive at the foot.`, { contactKey: foot.key })
  }

  const order = { bad: 0, warn: 1 }
  issues.sort((a, b) => order[a.level] - order[b.level])
  return { contacts, issues, supports, metrics }
}

function tilt(c) {
  return (Math.acos(Math.max(-1, Math.min(1, c.normal[1]))) * 180) / Math.PI
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = (v) => {
  const l = Math.hypot(...v) || 1
  return v.map((x) => x / l)
}

export { bounds, hangPointLocal, worldPositions }
