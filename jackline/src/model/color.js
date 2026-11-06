// Color planned the way it's built in the hot shop, attached to the profile.
//
// Positions are `s`: how far along the outside wall, 0 at the foot edge and
// 1 at the rim (buildSection gives sec.outerS). A band is [s0, s1]; an
// incalmo seam is a single s, which on the piece is a horizontal ring.
//
// Lengths are cm like the rest of the app. Layer thickness is a share of the
// wall (`pct`), so it thins and thickens with the wall it sits in.

export const KINDS = ['overlay', 'underlay', 'frit', 'powder', 'wrap']
export const KIND_LABEL = { overlay: 'Overlay', underlay: 'Underlay', frit: 'Frit', powder: 'Powder', wrap: 'Lip wrap / foot' }
export const GRAINS = ['fine', 'medium', 'coarse']
// Speckle size on the 3D piece, in cm. Rendering only, not the materials math.
export const GRAIN_SIZE = { fine: 0.06, medium: 0.16, coarse: 0.32 }

const MIN_SPAN = 0.01
const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
let seq = 0
const uid = (p) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`

// Studio settings: saved between pieces, not part of undo. Every number is
// editable in the app; the coverage rates are rough estimates.
export const DEFAULT_STUDIO = {
  clear: { name: 'Studio clear', coe: null },
  density: 2.5, // g/cm³, soda-lime
  waste: 0.3,
  coverage: { fine: 0.02, medium: 0.035, coarse: 0.05, powder: 0.012 }, // g/cm² at full coverage
  coeTolerance: 0,
  minSeamWall: 0.3, // cm
  maxJoins: 2,
  maxStack: 3,
  reactivePairs: [['copper', 'sulfur-selenium']],
  library: [],
}

export function normalizeStudio(st = {}) {
  return {
    ...DEFAULT_STUDIO,
    ...st,
    clear: { ...DEFAULT_STUDIO.clear, ...st.clear },
    coverage: { ...DEFAULT_STUDIO.coverage, ...st.coverage },
    reactivePairs: Array.isArray(st.reactivePairs) ? st.reactivePairs : DEFAULT_STUDIO.reactivePairs,
    library: Array.isArray(st.library) ? st.library.map(newColor) : [],
  }
}

// A color in the studio library. Brand-neutral: everything is user-entered.
// `strength` is absorption per mm of glass: light through d mm keeps
// exp(-strength × d) of itself. `reactive` holds tags like 'copper'.
export function newColor(c = {}) {
  return {
    id: c.id ?? uid('c'),
    name: c.name ?? 'New color',
    hex: c.hex ?? '#3a6fd8',
    opaque: !!c.opaque,
    strength: c.strength ?? 1.5,
    coe: c.coe ?? null,
    tested: !!c.tested,
    reactive: Array.isArray(c.reactive) ? [...c.reactive] : [],
    barWeight: c.barWeight ?? null, // g per bar or rod
    example: !!c.example, // shipped with a preset; replace with your own
  }
}

export const colorOf = (studio, id) => (id == null ? null : studio.library.find((c) => c.id === id) ?? null)

// ---- Regions ---------------------------------------------------------------

export function clampSpan(r) {
  if (r.kind === 'wrap') {
    // A wrap belongs to its end of the piece; only its other edge moves.
    // Pin first, so a stale value at the pinned end can't push the free one.
    if (r.zone === 'foot') return { ...r, s0: 0, s1: clamp(r.s1, MIN_SPAN, 1) }
    return { ...r, s0: clamp(r.s0, 0, 1 - MIN_SPAN), s1: 1 }
  }
  const s0 = clamp(r.s0, 0, 1 - MIN_SPAN)
  return { ...r, s0, s1: clamp(r.s1, s0 + MIN_SPAN, 1) }
}

export function newRegion(kind, colorId, opts = {}) {
  if (!KINDS.includes(kind)) throw new Error(`Unknown color kind: ${kind}`)
  const base = { id: opts.id ?? uid('r'), kind, colorId }
  switch (kind) {
    case 'frit':
      return clampSpan({ ...base, s0: 0, s1: 0.66, grain: 'medium', density: 0.5, ...pickOpts(opts, ['s0', 's1', 'grain', 'density']) })
    case 'powder':
      return clampSpan({ ...base, s0: 0, s1: 1, ...pickOpts(opts, ['s0', 's1']) })
    case 'wrap': {
      const zone = opts.zone === 'foot' ? 'foot' : 'lip'
      const span = zone === 'foot' ? { s0: 0, s1: 0.08 } : { s0: 0.92, s1: 1 }
      return clampSpan({ ...base, zone, ...span, pct: 0.1, ...pickOpts(opts, ['s0', 's1', 'pct']) })
    }
    default: // overlay, underlay
      return clampSpan({ ...base, s0: 0, s1: 1, pct: 0.1, ...pickOpts(opts, ['s0', 's1', 'pct']) })
  }
}
const pickOpts = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] != null).map((k) => [k, o[k]]))

// ---- Incalmo ---------------------------------------------------------------
// Seams split the whole body into sections, each its own bubble. Kept as a
// partition (seams + one more section) so sections can't overlap or leave a
// gap. A null section is the studio clear.

export const NO_INCALMO = { seams: [], sections: [null] }

export function normalizeIncalmo(inc) {
  if (!inc || !Array.isArray(inc.seams)) return { seams: [], sections: [null] }
  const seams = [...new Set(inc.seams.map((s) => clamp(s, MIN_SPAN, 1 - MIN_SPAN)))].sort((a, b) => a - b)
  const sections = seams.map((_, i) => inc.sections?.[i] ?? null)
  sections.push(inc.sections?.[seams.length] ?? null)
  return { seams, sections }
}

export const sectionAt = (inc, s) => inc.seams.filter((x) => x <= s).length

export function addSeam(inc, s, colorId) {
  const i = sectionAt(inc, s)
  const lo = i > 0 ? inc.seams[i - 1] : 0, hi = i < inc.seams.length ? inc.seams[i] : 1
  if (s - lo < MIN_SPAN || hi - s < MIN_SPAN) return inc
  const seams = [...inc.seams.slice(0, i), s, ...inc.seams.slice(i)]
  // The new section above the seam takes the given color, or copies the one it split.
  const sections = [...inc.sections.slice(0, i + 1), colorId === undefined ? inc.sections[i] : colorId, ...inc.sections.slice(i + 1)]
  return { seams, sections }
}

// Remove seam i: the two sections it joined become one, keeping the lower color.
export function removeSeam(inc, i) {
  if (i < 0 || i >= inc.seams.length) return inc
  return { seams: inc.seams.filter((_, j) => j !== i), sections: inc.sections.filter((_, j) => j !== i + 1) }
}

export function moveSeam(inc, i, s) {
  const lo = (i > 0 ? inc.seams[i - 1] : 0) + MIN_SPAN
  const hi = (i < inc.seams.length - 1 ? inc.seams[i + 1] : 1) - MIN_SPAN
  const seams = [...inc.seams]
  seams[i] = clamp(s, lo, hi)
  return { ...inc, seams }
}

// ---- The piece's color plan -------------------------------------------------

export const NO_COLORS = { regions: [], incalmo: NO_INCALMO }

export function normalizeColors(c) {
  if (!c) return { regions: [], incalmo: normalizeIncalmo() }
  const regions = (c.regions ?? []).filter((r) => KINDS.includes(r?.kind)).map((r) => newRegion(r.kind, r.colorId ?? null, r))
  return { regions, incalmo: normalizeIncalmo(c.incalmo) }
}

// ---- Positions on the profile -----------------------------------------------

// The [r, y] on the outside wall at s.
export function pointAtS(sec, s) {
  const S = sec.outerS
  let lo = 0, hi = S.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (S[mid] <= s) lo = mid
    else hi = mid
  }
  const u = (s - S[lo]) / (S[hi] - S[lo] || 1)
  const a = sec.outer[lo], b = sec.outer[hi]
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]
}

// The s of the outside-wall point nearest [r, y], projected onto the segment.
export function nearestS(sec, [r, y]) {
  let best = 0, bestD = Infinity
  for (let i = 1; i < sec.outer.length; i++) {
    const a = sec.outer[i - 1], b = sec.outer[i]
    const dx = b[0] - a[0], dy = b[1] - a[1]
    const u = clamp(((r - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1), 0, 1)
    const d = Math.hypot(a[0] + dx * u - r, a[1] + dy * u - y)
    if (d < bestD) (bestD = d), (best = sec.outerS[i - 1] + (sec.outerS[i] - sec.outerS[i - 1]) * u)
  }
  return best
}

// Is there an inside surface here? Below the cavity floor the glass is solid.
export const hasInside = (sec, s) => s >= sec.innerS[0] - 1e-9

// ---- The layer stack ------------------------------------------------------

// How thick a region's layer is, in cm. Bar color is a share of the wall;
// frit and powder are however much glass sticks per cm² of surface.
export function layerThickness(r, wall, studio) {
  if (r.kind === 'frit') return (studio.coverage[r.grain] * r.density) / studio.density
  if (r.kind === 'powder') return studio.coverage.powder / studio.density
  return r.pct * wall
}

// Every layer at s, inside to outside. The first color applied is innermost
// on its side: an underlay gathered first sits under the next one, and the
// last thing rolled on the marver is the outermost skin.
//
// Opaque glass stops light from the side it's seen from, so each layer says
// whether it can be seen from outside, from inside (only where there is an
// inside), and `hidden` when neither. Frit is scattered grains, never a full
// cover, so it never hides what's under it.
export function layerStack(sec, colors, studio, s) {
  const covers = (r) => s >= r.s0 && s <= r.s1
  const inside = hasInside(sec, s)
  const wall = sec.wall
  const mk = (r, side) => {
    const c = colorOf(studio, r.colorId)
    return { key: r.id, source: 'region', regionId: r.id, kind: r.kind, zone: r.zone, grain: r.grain, density: r.density, colorId: r.colorId, side, t: layerThickness(r, wall, studio), opaque: !!c?.opaque, partial: r.kind === 'frit' }
  }
  // Application order is already inside to outside on both sides.
  const under = inside ? colors.regions.filter((r) => r.kind === 'underlay' && covers(r)).map((r) => mk(r, 'inside')) : []
  const over = colors.regions.filter((r) => r.kind !== 'underlay' && covers(r)).map((r) => mk(r, 'outside'))

  const section = sectionAt(colors.incalmo, s)
  const bodyColor = colors.incalmo.sections[section] ?? null
  const used = [...under, ...over].reduce((a, l) => a + l.t, 0)
  const body = {
    key: `body${section}`, source: 'body', kind: 'body', section, colorId: bodyColor, side: 'body',
    t: Math.max(0, wall - used), opaque: !!colorOf(studio, bodyColor)?.opaque, partial: false,
  }

  const layers = [...under, body, ...over]
  const blocks = layers.map((l) => l.opaque && !l.partial)
  const outerBlock = blocks.lastIndexOf(true)
  const innerBlock = blocks.indexOf(true)
  return layers.map((l, i) => {
    const fromOutside = outerBlock < 0 || i >= outerBlock
    const fromInside = inside && (innerBlock < 0 || i <= innerBlock)
    return { ...l, fromOutside, fromInside, hidden: !fromOutside && !fromInside }
  })
}

// Every place along the wall where the stack can change, as runs over which
// it's constant. Checks and the materials estimate walk these instead of
// sampling, so a thin band can't slip between samples.
export function stackRuns(sec, colors, studio) {
  const cuts = new Set([0, 1, clamp(sec.innerS[0], 0, 1), ...colors.incalmo.seams])
  for (const r of colors.regions) cuts.add(r.s0), cuts.add(r.s1)
  const xs = [...cuts].sort((a, b) => a - b)
  const runs = []
  for (let i = 1; i < xs.length; i++) {
    if (xs[i] - xs[i - 1] < 1e-9) continue
    runs.push({ s0: xs[i - 1], s1: xs[i], layers: layerStack(sec, colors, studio, (xs[i - 1] + xs[i]) / 2) })
  }
  return runs
}

// ---- Light through the layers ----------------------------------------------

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
export function linearRGB(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => srgbToLinear(v / 255))
}

// Absorption per mm, per channel. Chosen so that 1 mm of glass at strength 1
// lets through exactly the swatch color; strength scales it from there.
export function absorptionRGB(color) {
  if (!color) return [0, 0, 0]
  return linearRGB(color.hex).map((c) => Math.max(0, color.strength * -Math.log(Math.max(c, 0.005))))
}

// How much longer the line of sight is through a wall than the wall is thick,
// for a round wall of radius R seen at cos = |N·V|. Straight on it's 1; near
// the silhouette the sight line runs along inside the glass, which is why
// cased color reads darkest at the edges of a piece. `fromInside` is a
// concave wall seen across the cavity. Refraction is ignored; it shortens
// the path a little but doesn't change the picture.
export function pathFactor(t, R, cos, fromInside = false) {
  const c = Math.min(1, Math.max(Math.abs(cos), 0.02))
  const sin2 = 1 - c * c
  if (!(R > t * 2)) return Math.min(1 / c, 12) // a flat or tiny surface: a slab
  let path
  if (fromInside) path = Math.sqrt((R + t) ** 2 - R * R * sin2) - R * c
  else {
    const rest = (R - t) ** 2 - R * R * sin2
    path = rest >= 0 ? R * c - Math.sqrt(rest) : 2 * R * c // grazing: never reaches the cavity
  }
  return Math.min(path / t, 12)
}

// Beer–Lambert: the share of light, per channel, a transparent layer lets
// through. transmittance = exp(-absorption × thickness along the view ray).
// Opaque glass lets nothing through, however thin.
export function transmittance(color, tCm, factor = 1) {
  if (!color) return [1, 1, 1]
  if (color.opaque) return [0, 0, 0]
  return absorptionRGB(color).map((a) => Math.exp(-a * tCm * 10 * factor))
}

// What a viewer on one side sees of the stack: walk in from that side,
// summing transparent absorption, until an opaque layer stops the view.
// Frit (scattered grains) is reported apart, so it can be drawn as speckle.
export function viewOf(layers, studio, side) {
  const order = side === 'outside' ? [...layers].reverse() : layers
  const A = [0, 0, 0]
  let opaque = null, frit = null
  for (const l of order) {
    const c = colorOf(studio, l.colorId)
    if (l.partial) {
      if (!frit && c) frit = { color: c, density: l.density ?? 0, grain: l.grain }
      continue
    }
    if (c?.opaque) {
      opaque = c
      break
    }
    if (c) absorptionRGB(c).forEach((a, k) => (A[k] += a * l.t * 10))
  }
  return { A, opaque, frit }
}

// The layer stacks along the wall, packed for the 3D shader: N samples of s
// by 6 rows of RGBA floats, three rows for each side it can be seen from.
//   row 0: summed absorption (per wall crossing, rgb), a = 1 if opaque
//   row 1: the opaque layer's color (linear rgb),      a = frit coverage
//   row 2: frit absorption per mm, or its color when opaque (rgb),
//          a = grain size in cm, negative when the frit is opaque
export const PACK_ROWS = 6
export function packLayers(sec, colors, studio, N = 1024) {
  const data = new Float32Array(N * PACK_ROWS * 4)
  const runs = stackRuns(sec, colors, studio)
  let k = 0
  for (let i = 0; i < N; i++) {
    const s = (i + 0.5) / N
    while (k < runs.length - 1 && runs[k].s1 < s) k++
    const layers = runs[k].layers
    const views = [viewOf(layers, studio, 'outside'), hasInside(sec, s) ? viewOf(layers, studio, 'inside') : viewOf(layers, studio, 'outside')]
    views.forEach((v, side) => {
      const put = (row, r, g, b, a) => data.set([r, g, b, a], ((side * 3 + row) * N + i) * 4)
      put(0, ...v.A, v.opaque ? 1 : 0)
      const oc = v.opaque ? linearRGB(v.opaque.hex) : [0, 0, 0]
      put(1, ...oc, v.frit ? v.frit.density : 0)
      if (v.frit) {
        const f = v.frit
        const size = GRAIN_SIZE[f.grain] ?? GRAIN_SIZE.medium
        put(2, ...(f.color.opaque ? linearRGB(f.color.hex) : absorptionRGB(f.color)), f.color.opaque ? -size : size)
      } else put(2, 0, 0, 0, 0)
    })
  }
  return data
}

// ---- Editing --------------------------------------------------------------
// Pure updates on a color plan; the store applies them with change/live.

export function updateRegion(colors, id, patch) {
  return {
    ...colors,
    regions: colors.regions.map((r) => {
      if (r.id !== id) return r
      if (patch.kind && patch.kind !== r.kind) {
        // Changing type keeps the color and, except for a wrap (which belongs
        // at an end), the span. Fields the new type doesn't use are dropped.
        const keep = patch.kind === 'wrap' ? { zone: patch.zone } : { s0: r.s0, s1: r.s1, pct: r.pct }
        return newRegion(patch.kind, patch.colorId ?? r.colorId, { ...keep, id: r.id })
      }
      if (patch.zone && patch.zone !== r.zone) return newRegion('wrap', r.colorId, { id: r.id, zone: patch.zone, pct: r.pct })
      return clampSpan({ ...r, ...patch })
    }),
  }
}

// Slide a whole band along the wall, keeping its length.
export function shiftRegion(colors, id, ds) {
  const r = colors.regions.find((x) => x.id === id)
  if (!r || r.kind === 'wrap') return colors
  const len = r.s1 - r.s0
  const s0 = clamp(r.s0 + ds, 0, 1 - len)
  return updateRegion(colors, id, { s0, s1: s0 + len })
}

export const removeRegion = (colors, id) => ({ ...colors, regions: colors.regions.filter((r) => r.id !== id) })

// Application order matters (first applied is innermost), so bands can be
// moved earlier (-1) or later (+1) in the sequence.
export function reorderRegion(colors, id, dir) {
  const i = colors.regions.findIndex((r) => r.id === id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= colors.regions.length) return colors
  const regions = [...colors.regions]
  ;[regions[i], regions[j]] = [regions[j], regions[i]]
  return { ...colors, regions }
}

export const colorInUse = (colors, id) => colors.regions.some((r) => r.colorId === id) || colors.incalmo.sections.includes(id)

// ---- Drawing helpers --------------------------------------------------------

// The part of a sampled wall between s0 and s1, with exact ends.
export function spanPath(pts, S, s0, s1) {
  const at = (s) => {
    let i = 1
    while (i < S.length - 1 && S[i] < s) i++
    const u = clamp((s - S[i - 1]) / (S[i] - S[i - 1] || 1), 0, 1)
    return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u]
  }
  const lo = Math.max(s0, S[0]), hi = Math.min(s1, S[S.length - 1])
  if (hi <= lo) return []
  return [at(lo), ...pts.filter((_, i) => S[i] > lo && S[i] < hi), at(hi)]
}

// Push a path sideways by d: positive to the left of its direction of travel.
// Walking a wall from foot to rim, the glass is on the left of the outside
// wall, so a negative d moves off the outside; on the inside wall a positive
// d moves into the cavity.
export function offsetPath(pts, d) {
  const n = pts.length
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)]
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    return [p[0] - ((b[1] - a[1]) / l) * d, p[1] + ((b[0] - a[0]) / l) * d]
  })
}
