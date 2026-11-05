// Where a perfume bottle is likely to give trouble in the hot shop: a base
// much heavier than the walls (it holds heat and strains as it cools) and a
// neck wall too thin to survive finishing. The numbers are always shown;
// a zone is flagged only against limits the maker sets from their own
// experience. There are no built-in limits: an unset one is a TODO.

export const RISK_LIMITS = {
  baseToWall: { label: 'Base thicker than the wall by more than', unit: '×', value: null },
  baseShare: { label: 'Base more than this share of the glass weight', unit: '%', value: null },
  neckWall: { label: 'Neck wall thinner than', unit: 'mm', value: null },
}

export const defaultLimits = () => Object.fromEntries(Object.entries(RISK_LIMITS).map(([k, v]) => [k, v.value]))

// `m` holds what the core measures: base (mm of solid glass under the
// cavity), wall (mm), baseShare (0–1 of the glass weight that is base),
// neckWall (mm, from neckWall() in closures.js) and the heights of the
// base and neck so the zone can be drawn there.
// Each entry: { id, measured, limit, level: 'risk' | 'ok' | 'unset', zone }.
export function riskZones(m, limits) {
  const rows = [
    { id: 'baseToWall', measured: m.wall > 0 ? m.base / m.wall : null, over: true, zone: [0, m.base] },
    { id: 'baseShare', measured: m.baseShare == null ? null : m.baseShare * 100, over: true, zone: [0, m.base] },
    { id: 'neckWall', measured: m.neckWall, over: false, zone: m.neckZone ?? null },
  ]
  return rows.map(({ id, measured, over, zone }) => {
    const limit = limits[id]
    let level = 'ok'
    if (limit == null || measured == null) level = 'unset'
    else if (over ? measured > limit : measured < limit) level = 'risk'
    return { id, measured, limit, level, zone }
  })
}
