import { useEffect, useState } from 'react'
import { useDerived } from '../model/derived.js'
import {
  GRAINS, KINDS, KIND_LABEL, addSeam, colorInUse, colorOf, newColor, newRegion, pointAtS, removeRegion, removeSeam, reorderRegion, updateRegion,
} from '../model/color.js'
import { useStore } from '../model/store.js'
import { fmtLen } from '../model/units.js'
import Slider from './Slider.jsx'

const NEW = '__new'
const ADD = [
  ['overlay', 'Overlay (outside)'],
  ['underlay', 'Underlay (inside, cased)'],
  ['frit', 'Frit (speckle)'],
  ['powder', 'Powder (even)'],
  ['wrap:lip', 'Lip wrap'],
  ['wrap:foot', 'Colored foot'],
  ['seam', 'Incalmo seam'],
]

// Adds a library color and returns its id. Colors are user-entered and
// start untested; the checks will say so until they're filled in.
function createColor() {
  const st = useStore.getState()
  const c = newColor({ name: `Color ${st.studio.library.length + 1}` })
  st.setStudio({ library: [...st.studio.library, c] })
  return c.id
}

function ColorSelect({ value, onChange, clear }) {
  const library = useStore((s) => s.studio.library)
  const clearName = useStore((s) => s.studio.clear.name)
  const pick = (v) => onChange(v === NEW ? createColor() : v === '' ? null : v)
  return (
    <select className="color-select" value={value ?? ''} onChange={(e) => pick(e.target.value)}>
      {clear && <option value="">{clearName}</option>}
      {!clear && value == null && <option value="">Pick a color…</option>}
      {library.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
      <option value={NEW}>＋ New color…</option>
    </select>
  )
}

export default function ColorPanel() {
  const colors = useStore((s) => s.colors)
  const studio = useStore((s) => s.studio)
  const sel = useStore((s) => s.colorSel)
  const units = useStore((s) => s.units)
  const { change, setView } = useStore.getState()
  const { sec } = useDerived()
  const at = (s) => fmtLen(pointAtS(sec, s)[1], units)

  const add = (what) => {
    if (!what) return
    const colorId = studio.library.at(-1)?.id ?? createColor()
    if (what === 'seam') {
      // Split the longest section in half.
      const b = [0, ...colors.incalmo.seams, 1]
      let i = 0
      for (let k = 1; k < b.length - 1; k++) if (b[k + 1] - b[k] > b[i + 1] - b[i]) i = k
      change({ colors: { ...colors, incalmo: addSeam(colors.incalmo, (b[i] + b[i + 1]) / 2, colorId) }, colorSel: null })
      return
    }
    const [kind, zone] = what.split(':')
    const r = newRegion(kind, colorId, { zone })
    change({ colors: { ...colors, regions: [...colors.regions, r] }, colorSel: r.id })
  }

  return (
    <section className="panel color-panel">
      <div className="panel-head">
        <h3>Color</h3>
        <select className="add-color" value="" onChange={(e) => add(e.target.value)} aria-label="Add color">
          <option value="">＋ Add…</option>
          {ADD.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>

      {colors.regions.length === 0 && colors.incalmo.seams.length === 0 && (
        <p className="hint">Add a band, then drag its ends along the profile. Hover the wall to see its layers.</p>
      )}

      {colors.regions.length > 0 && (
        <ol className="bands">
          {colors.regions.map((r, i) => {
            const c = colorOf(studio, r.colorId)
            const on = sel === r.id
            return (
              <li key={r.id} className={on ? 'on' : ''}>
                <button className="band-row" onClick={() => setView({ colorSel: on ? null : r.id })}>
                  <span className="order">{i + 1}</span>
                  <i className={'dot' + (r.kind === 'frit' ? ' speckle' : '')} style={{ '--c': c?.hex ?? 'transparent' }} />
                  <span className="band-name">
                    {r.kind === 'wrap' ? (r.zone === 'foot' ? 'Colored foot' : 'Lip wrap') : KIND_LABEL[r.kind]}
                    <small>{c?.name ?? 'missing color'}</small>
                  </span>
                  <small className="span">
                    {at(r.s0)}–{at(r.s1)}
                  </small>
                </button>
                {on && <RegionEditor r={r} i={i} n={colors.regions.length} />}
              </li>
            )
          })}
        </ol>
      )}

      {colors.incalmo.seams.length > 0 && <Incalmo at={at} />}

      <Library />
    </section>
  )
}

function RegionEditor({ r, i, n }) {
  const colors = useStore((s) => s.colors)
  const wall = useStore((s) => s.wall)
  const units = useStore((s) => s.units)
  const { change, live } = useStore.getState()
  const edit = (patch) => change({ colors: updateRegion(colors, r.id, patch) })
  const slide = (key) => (v) => live({ colors: updateRegion(useStore.getState().colors, r.id, { [key]: v }) })

  return (
    <div className="region-editor sub">
      <div className="field-row">
        <select value={r.kind} onChange={(e) => edit({ kind: e.target.value })} aria-label="Color type">
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
        <ColorSelect value={r.colorId} onChange={(colorId) => edit({ colorId })} />
      </div>
      {r.kind === 'wrap' && (
        <div className="segmented small">
          {['lip', 'foot'].map((z) => (
            <button key={z} className={r.zone === z ? 'on' : ''} onClick={() => edit({ zone: z })}>
              {z === 'lip' ? 'At the rim' : 'At the foot'}
            </button>
          ))}
        </div>
      )}
      {r.pct != null && (
        <Slider
          label="Layer"
          value={r.pct}
          shown={`${Math.round(r.pct * 100)}% of wall · ${fmtLen(r.pct * wall, units, 2)}`}
          min={0.02}
          max={0.5}
          step={0.01}
          onChange={slide('pct')}
        />
      )}
      {r.kind === 'frit' && (
        <>
          <div className="segmented small">
            {GRAINS.map((g) => (
              <button key={g} className={r.grain === g ? 'on' : ''} onClick={() => edit({ grain: g })}>
                {g}
              </button>
            ))}
          </div>
          <Slider label="Coverage" value={r.density} shown={`${Math.round(r.density * 100)}%`} min={0.05} max={1} step={0.01} onChange={slide('density')} />
        </>
      )}
      <div className="field-row">
        <button disabled={i === 0} onClick={() => change({ colors: reorderRegion(colors, r.id, -1) })} title="First applied sits nearest the glass">
          Apply earlier
        </button>
        <button disabled={i === n - 1} onClick={() => change({ colors: reorderRegion(colors, r.id, 1) })}>
          Apply later
        </button>
        <button className="danger" onClick={() => change({ colors: removeRegion(colors, r.id), colorSel: null })}>
          Remove
        </button>
      </div>
    </div>
  )
}

// Sections listed foot to rim, each its own bubble, with the seams between.
function Incalmo({ at }) {
  const colors = useStore((s) => s.colors)
  const sel = useStore((s) => s.colorSel)
  const { change } = useStore.getState()
  const inc = colors.incalmo
  const setSection = (i, id) => change({ colors: { ...colors, incalmo: { ...inc, sections: inc.sections.map((c, j) => (j === i ? id : c)) } } })

  return (
    <div className="incalmo">
      <h4>Incalmo · {inc.sections.length} bubbles</h4>
      <ol>
        {inc.sections.map((id, i) => (
          <li key={i}>
            <div className="field-row">
              <span className="sec-label">{i === 0 ? 'Foot' : i === inc.sections.length - 1 ? 'Rim' : `Section ${i + 1}`}</span>
              <ColorSelect value={id} clear onChange={(v) => setSection(i, v)} />
            </div>
            {i < inc.seams.length && (
              <div className={'seam-row' + (sel === `seam:${i}` ? ' on' : '')}>
                <span>Seam at {at(inc.seams[i])}</span>
                <button onClick={() => change({ colors: { ...colors, incalmo: removeSeam(inc, i) }, colorSel: null })}>Remove seam</button>
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}

// The studio's color library: user-entered, brand-neutral. Not part of undo.
function Library() {
  const studio = useStore((s) => s.studio)
  const colors = useStore((s) => s.colors)
  const setStudio = useStore((s) => s.setStudio)
  const edit = (id, patch) => setStudio({ library: studio.library.map((c) => (c.id === id ? { ...c, ...patch } : c)) })
  const num = (v) => (v === '' ? null : Number(v))

  return (
    <details className="library">
      <summary>Color library ({studio.library.length})</summary>
      <label className="lib-field">
        <span>{studio.clear.name} COE</span>
        <input type="number" step="0.1" value={studio.clear.coe ?? ''} placeholder="enter" onChange={(e) => setStudio({ clear: { ...studio.clear, coe: num(e.target.value) } })} />
      </label>
      {studio.library.map((c) => {
        const used = colorInUse(colors, c.id)
        return (
          <div key={c.id} className="lib-color">
            <div className="field-row">
              <input type="color" value={c.hex} onChange={(e) => edit(c.id, { hex: e.target.value })} aria-label="Color" />
              <input className="lib-name" value={c.name} onChange={(e) => edit(c.id, { name: e.target.value })} aria-label="Name" />
              {c.example && <span className="tag">example</span>}
            </div>
            <div className="segmented small">
              <button className={!c.opaque ? 'on' : ''} onClick={() => edit(c.id, { opaque: false })}>Transparent</button>
              <button className={c.opaque ? 'on' : ''} onClick={() => edit(c.id, { opaque: true })}>Opaque</button>
            </div>
            {!c.opaque && (
              <label className="range">
                <span className="field-label">
                  Strength <b>{c.strength.toFixed(1)} / mm</b>
                </span>
                <input type="range" min={0.1} max={6} step={0.1} value={c.strength} onChange={(e) => edit(c.id, { strength: Number(e.target.value) })} />
              </label>
            )}
            <div className="lib-grid">
              <label className="lib-field">
                <span>COE</span>
                <input type="number" step="0.1" value={c.coe ?? ''} placeholder="enter" onChange={(e) => edit(c.id, { coe: num(e.target.value) })} />
              </label>
              <label className="lib-field">
                <span>Bar weight (g)</span>
                <input type="number" min="0" value={c.barWeight ?? ''} placeholder="enter" onChange={(e) => edit(c.id, { barWeight: num(e.target.value) })} />
              </label>
            </div>
            <label className="lib-field">
              <span>Reactive tags</span>
              <TagsInput tags={c.reactive} onChange={(reactive) => edit(c.id, { reactive })} />
            </label>
            <div className="field-row">
              <label className="check">
                <input type="checkbox" checked={c.tested} onChange={(e) => edit(c.id, { tested: e.target.checked })} />
                Tested with my studio clear
              </label>
              <button
                className="danger"
                disabled={used}
                title={used ? 'In use on this piece' : undefined}
                onClick={() => setStudio({ library: studio.library.filter((x) => x.id !== c.id) })}
              >
                Delete
              </button>
            </div>
          </div>
        )
      })}
      <button onClick={createColor}>＋ New color</button>
    </details>
  )
}

// Comma-separated tags, kept as typed and split when you leave the field,
// so a half-typed comma isn't swallowed.
function TagsInput({ tags, onChange }) {
  const joined = tags.join(', ')
  const [text, setText] = useState(joined)
  useEffect(() => setText(joined), [joined])
  const commit = () => onChange(text.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))
  return (
    <input
      value={text}
      placeholder="e.g. copper, sulfur-selenium"
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  )
}
