import { useLiquid } from '../model/derived.js'
import { clockOf } from '../model/physics.js'
import { useStore } from '../model/store.js'
import { fmtLen, fmtMass, fmtVol } from '../model/units.js'

// Under half a millimetre off the axis is "centered": finer than that is
// below anything a drawn plan can promise.
const CENTERED = 0.05

function tipText(tip, com) {
  if (tip.deg < 0) return { big: 'won’t stand', small: 'over the foot’s edge' }
  const off = Math.hypot(com[0], com[2])
  return {
    big: `${Math.round(tip.deg)}°`,
    small: off < CENTERED || tip.toward == null ? 'about the same every way' : `toward ${clockOf(tip.toward)}`,
  }
}

function comText(com, units) {
  const off = Math.hypot(com[0], com[2])
  return {
    big: `${fmtLen(com[1], units, { digits: units === 'in' ? 2 : 0 })} up`,
    small: off < CENTERED ? 'on the axis' : `${fmtLen(off, units, { digits: 1 })} off · ${clockOf(Math.atan2(com[0], com[2]))}`,
  }
}

// Always on screen, over the 3D view: what the piece weighs, where its
// weight sits, and how far it leans before it goes over, empty and with
// liquid in it, side by side.
export default function Readout() {
  const units = useStore((s) => s.units)
  const fill = useStore((s) => s.fill)
  const { empty: m, filled: f, worst } = useLiquid()
  const bitsMass = m.bits.reduce((a, b) => a + b.mass, 0)
  const holds = f.capacity > 0.5
  const pct = Math.round(fill * 100)
  const cols = [
    { head: 'Empty', total: m.total, tip: m.tip },
    ...(holds ? [{ head: `${pct}% full`, sub: fmtVol(f.water.volume, units), total: f.total, tip: f.tip }] : []),
  ]
  const rows = [
    ['Total', (c) => ({ big: fmtMass(c.total.mass), small: c === cols[0] ? `body ${fmtMass(m.body.mass)} · bits ${fmtMass(bitsMass)}` : `water ${fmtMass(f.water.mass)}` })],
    ['Center of mass', (c) => comText(c.total.com, units)],
    ['Tips at', (c) => tipText(c.tip, c.total.com)],
  ]

  return (
    <div className="readout" aria-live="polite">
      <div className="card">
        {holds && (
          <label className="fill">
            <span>Fill</span>
            <input type="range" min={0} max={100} step={1} value={pct} aria-label="Fill level, percent of capacity"
              onPointerDown={() => useStore.getState().checkpoint()}
              onKeyDown={() => useStore.getState().checkpoint()}
              onChange={(e) => useStore.getState().live({ fill: Number(e.target.value) / 100 })} />
            <b>{pct}%</b>
            <small>of {fmtVol(f.capacity, units)} to the brim</small>
          </label>
        )}
        <table className="compare">
          <thead>
            <tr>
              <th />
              {cols.map((c) => (
                <th key={c.head}>
                  {c.head}
                  {c.sub && <small> · {c.sub}</small>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, cell]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                {cols.map((c) => {
                  const v = cell(c)
                  const bad = label === 'Tips at' && c.tip.deg < 0
                  return (
                    <td key={c.head} className={bad ? 'bad' : ''}>
                      <b>{v.big}</b>
                      <small>{v.small}</small>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {holds && worst && (
          <p className="worst">
            Least steady at <b>{Math.round(worst.fill * 100)}% full</b>: tips at {worst.tip.deg < 0 ? 'rest' : `${Math.round(worst.tip.deg)}°`} (checked every 10%).
          </p>
        )}
      </div>
      <p className="estimate">
        Estimates from the drawn shape, not a weighed piece. Water stays level as it tilts; spilling isn’t modeled.
      </p>
    </div>
  )
}
