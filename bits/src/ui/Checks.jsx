import { runChecks } from '../model/checks.js'
import { memoLast, useLiquid } from '../model/derived.js'
import { useStore } from '../model/store.js'

// Shared across every panel that shows checks, so they run once per change.
const checksShared = memoLast((m, worst, bits, glasses, bodyGlass, units) => runChecks({ m, worst, bits, glasses, bodyGlass, units }))
const countsShared = memoLast((results) => {
  const n = {}
  for (const r of results) if (r.level === 'warn') for (const id of r.bits) n[id] = (n[id] ?? 0) + 1
  return n
})

export function useChecks() {
  const { empty: m, worst } = useLiquid()
  const bits = useStore((s) => s.bits)
  const glasses = useStore((s) => s.glasses)
  const bodyGlass = useStore((s) => s.bodyGlass)
  const units = useStore((s) => s.units)
  return checksShared(m, worst, bits, glasses, bodyGlass, units)
}

// How many warnings are about each bit, for the list and the 3D tags.
export const useWarnCounts = () => countsShared(useChecks())

const NAMES = { 1: 'Bit vs wall', 2: 'Too thin', 3: 'Snag / break-off', 4: 'Glass compatibility', 5: 'Annealing', 6: 'Stability' }

export default function Checks() {
  const results = useChecks()
  const setView = useStore((s) => s.setView)
  const warns = results.filter((r) => r.level === 'warn').length
  // Warnings first, then notes, each in check order.
  const sorted = [...results].sort((a, b) => (a.level === b.level ? a.check - b.check : a.level === 'warn' ? -1 : 1))
  return (
    <div className="block checks">
      <h3>
        Heuristic checks
        <span className="muted">{warns ? `${warns} warning${warns > 1 ? 's' : ''}` : 'no warnings'}</span>
      </h3>
      <p className="hint">
        Warnings, not predictions: rules of thumb against placeholder thresholds (src/config/checks.js). Calibrate them from your own bench experience.
      </p>
      <ul>
        {sorted.map((r) => (
          <li key={r.id} className={r.level}>
            <details>
              <summary title={r.why} onClick={() => r.bits[0] && setView({ selected: r.bits[0] })}>
                <i aria-label={r.level === 'warn' ? 'Warning' : 'Note'} />
                <span>
                  <small>{NAMES[r.check]}</small>
                  <b>{r.title}</b>
                  <em>{r.detail}</em>
                </span>
              </summary>
              <p className="why"><b>Why:</b> {r.why}</p>
            </details>
          </li>
        ))}
      </ul>
    </div>
  )
}
