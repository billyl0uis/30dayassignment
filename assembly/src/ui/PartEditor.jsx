import { useStore } from '../store.js'
import { TINTS } from '../core/colors.js'
import { CANE_PATTERNS, partMetrics } from '../core/parts.js'
import { JACKLINE_PROFILES, cylinderProfile, sphereProfile } from '../core/jacklineProfiles.js'
import { fmtCm3, fmtMass } from '../core/units.js'
import { NumField, Segmented, Slider } from './fields.jsx'

// Blown-form starting profiles: Jackline's forms plus two generated ones.
const PROFILE_CHOICES = [
  ['sphere', 'Sphere float'],
  ['cylinder', 'Cylinder'],
  ...Object.entries(JACKLINE_PROFILES).map(([id, p]) => [id, p.name]),
]

export default function PartEditor() {
  const { scene, selectedId, patchPart, duplicate, breakLink, removePart } = useStore()
  const part = scene.parts.find((p) => p.id === selectedId)
  if (!part) return <section className="panel"><h3>Part</h3><p className="muted">Add a part from the toolbar.</p></section>

  const m = partMetrics(part, scene.settings)
  const set = (fn, opts) => patchPart(part.id, fn, opts)
  const dims = (patch, opts) => set((p) => ({ ...p, dims: { ...p.dims, ...patch } }), opts)
  const liveDims = (patch) => dims(patch, { live: true })
  const family = scene.parts.filter((p) => p.familyId === part.familyId)
  const source = scene.parts.find((p) => p.id === part.sourceId)
  const d = part.dims

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h3>{part.type === 'blown' ? 'Blown form' : part.type === 'solid' ? 'Solid shape' : 'Cane rod'}</h3>
          <button className="ghost" onClick={() => removePart(part.id)} title="Delete part">Delete</button>
        </div>
        <label className="num">
          <span className="field-label">Name</span>
          <input className="text" value={part.name} onFocus={useStore.getState().checkpoint} onChange={(e) => set((p) => ({ ...p, name: e.target.value }), { live: true })} />
        </label>

        {part.type === 'blown' && <BlownFields d={d} dims={dims} liveDims={liveDims} />}
        {part.type === 'solid' && <SolidFields d={d} dims={dims} liveDims={liveDims} />}
        {part.type === 'cane' && (
          <>
            <div className="row2">
              <NumField label="Length" value={d.lengthMm} onChange={(v) => liveDims({ lengthMm: v })} />
              <NumField label="Diameter" value={d.diameterMm} step={0.5} onChange={(v) => liveDims({ diameterMm: v })} />
            </div>
            <span className="field-label">Pattern (look only)</span>
            <Segmented small value={d.pattern} options={CANE_PATTERNS.map((p) => [p, p[0].toUpperCase() + p.slice(1)])} onChange={(pattern) => dims({ pattern })} />
          </>
        )}

        <Slider label="Scale" shown={`${Math.round(part.scale * 100)}%`} value={part.scale} min={0.2} max={3} step={0.01} onChange={(scale) => set((p) => ({ ...p, scale }), { live: true })} />

        <dl className="measures">
          <dt>Glass volume</dt><dd>{fmtCm3(m.volumeCm3)}</dd>
          <dt>Weight</dt><dd>{fmtMass(m.weightG, scene.settings.massUnit)}</dd>
          <dt>Size (W × D × H)</dt><dd>{m.size.w.toFixed(0)} × {m.size.d.toFixed(0)} × {m.size.h.toFixed(0)} mm</dd>
          <dt>Thickest section</dt><dd>{m.thickestMm.toFixed(1)} mm</dd>
          {part.type === 'blown' && !part.dims.closedTop && (<><dt>Holds (to brim)</dt><dd>{Math.round(m.capacityMl)} ml</dd></>)}
        </dl>
      </section>

      <section className="panel">
        <h3>Colour</h3>
        <div className="swatches">
          {TINTS.map((t) => (
            <button key={t.id} className={`swatch${part.color.hex === t.hex ? ' on' : ''}`} style={{ '--c': t.hex }} title={t.name} aria-label={t.name} onClick={() => set((p) => ({ ...p, color: { ...p.color, hex: t.hex } }))} />
          ))}
          <label className="swatch custom" title="Custom tint" style={{ '--c': part.color.hex }}>
            <input type="color" value={part.color.hex} onFocus={useStore.getState().checkpoint} onChange={(e) => set((p) => ({ ...p, color: { ...p.color, hex: e.target.value } }), { live: true })} />
          </label>
        </div>
        <Slider label="Tint strength" shown={`${Math.round(part.color.opacity * 100)}%`} value={part.color.opacity} min={0} max={1} step={0.01} onChange={(opacity) => set((p) => ({ ...p, color: { ...p.color, opacity } }), { live: true })} />
        <small className="hint">Swatches are named by colorant, not by maker, and are screen approximations.</small>
      </section>

      <section className="panel">
        <h3>Family</h3>
        <p className="family-line">
          {family.length > 1 ? `${family.length} parts in this family` : 'On its own'}
          {source && <> · copied from <b>{source.name}</b></>}
        </p>
        <div className="btn-row">
          <button onClick={() => duplicate(part.id)}>Duplicate</button>
          <button onClick={() => duplicate(part.id, { scale: 0.85 })}>Smaller copy</button>
          <button onClick={() => duplicate(part.id, { scale: 1.15 })}>Bigger copy</button>
        </div>
        <div className="btn-row">
          <button onClick={() => duplicate(part.id, { color: { hex: TINTS[(TINTS.findIndex((t) => t.hex === part.color.hex) + 1 + TINTS.length) % TINTS.length].hex } })}>Recoloured copy</button>
          <button onClick={() => breakLink(part.id)} disabled={family.length < 2 && !part.sourceId}>Break link</button>
        </div>
        <small className="hint">Copies stay linked so counts group by family. Then change any copy’s scale, colour or dimensions.</small>
      </section>

      <HangFields part={part} set={set} />
    </>
  )
}

function BlownFields({ d, dims, liveDims }) {
  const pid = d.profileId ?? 'custom'
  const maxR = Math.max(...d.points.map((p) => p[0]))
  const height = Math.max(...d.points.map((p) => p[1]))
  const pick = (id) => {
    if (id === 'sphere') dims({ profileId: id, points: sphereProfile(2 * maxR || 120), closedTop: true })
    else if (id === 'cylinder') dims({ profileId: id, points: cylinderProfile(2 * maxR || 80, height || 150) })
    else dims({ profileId: id, points: JACKLINE_PROFILES[id].points.map((p) => [...p]), closedTop: false })
  }
  return (
    <>
      <label className="num">
        <span className="field-label">Profile</span>
        <select value={pid} onChange={(e) => pick(e.target.value)}>
          {PROFILE_CHOICES.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          {pid === 'custom' && <option value="custom">Custom</option>}
        </select>
      </label>
      {pid === 'sphere' && <NumField label="Diameter" value={2 * maxR} onChange={(v) => liveDims({ points: sphereProfile(v) })} />}
      {pid === 'cylinder' && (
        <div className="row2">
          <NumField label="Diameter" value={2 * maxR} onChange={(v) => liveDims({ points: cylinderProfile(v, height) })} />
          <NumField label="Height" value={height} onChange={(v) => liveDims({ points: cylinderProfile(2 * maxR, v) })} />
        </div>
      )}
      <div className="row2">
        <NumField label="Wall thickness" value={d.wallMm} step={0.5} onChange={(v) => liveDims({ wallMm: v })} />
        <label className="check top-check">
          <input type="checkbox" checked={d.closedTop} onChange={(e) => dims({ closedTop: e.target.checked })} />
          Closed top
        </label>
      </div>
      <small className="hint">The profile is the outside of the glass; the inside follows at the wall thickness. Resize Jackline forms with Scale.</small>
    </>
  )
}

function SolidFields({ d, dims, liveDims }) {
  return (
    <>
      <Segmented small value={d.shape} options={[['sphere', 'Sphere'], ['egg', 'Egg / drop'], ['cylinder', 'Cylinder'], ['block', 'Block']]} onChange={(shape) => dims({ shape })} />
      {d.shape === 'sphere' && <NumField label="Diameter" value={d.diameterMm} onChange={(v) => liveDims({ diameterMm: v })} />}
      {d.shape === 'egg' && (
        <>
          <div className="row2">
            <NumField label="Widest diameter" value={d.diameterMm} onChange={(v) => liveDims({ diameterMm: v })} />
            <NumField label="Length" value={d.lengthMm} onChange={(v) => liveDims({ lengthMm: v })} />
          </div>
          <Slider label="Egg → teardrop" shown={d.point < 0.05 ? 'Egg' : d.point > 0.95 ? 'Teardrop' : `${Math.round(d.point * 100)}%`} value={d.point} min={0} max={1} step={0.01} onChange={(point) => liveDims({ point })} />
        </>
      )}
      {d.shape === 'cylinder' && (
        <div className="row2">
          <NumField label="Diameter" value={d.diameterMm} onChange={(v) => liveDims({ diameterMm: v })} />
          <NumField label="Length" value={d.lengthMm} onChange={(v) => liveDims({ lengthMm: v })} />
        </div>
      )}
      {d.shape === 'block' && (
        <div className="row3">
          <NumField label="Width" value={d.widthMm} onChange={(v) => liveDims({ widthMm: v })} />
          <NumField label="Depth" value={d.depthMm} onChange={(v) => liveDims({ depthMm: v })} />
          <NumField label="Height" value={d.heightMm} onChange={(v) => liveDims({ heightMm: v })} />
        </div>
      )}
    </>
  )
}

function HangFields({ part, set }) {
  const h = part.hang
  const kind = h?.kind ?? 'none'
  const setHang = (hang, opts) => set((p) => ({ ...p, hang }), opts)
  return (
    <section className="panel">
      <h3>Hanging point</h3>
      <Segmented
        small
        value={kind}
        options={[['none', 'None'], ['loop', 'Glass loop'], ['drilled', 'Drilled + wire'], ['cap', 'Glued cap']]}
        onChange={(k) => setHang(k === 'none' ? null : { kind: k })}
      />
      {kind === 'loop' && (
        <NumField label="Loop cross-section diameter" value={h.loopDiaMm} step={0.5} onChange={(v) => setHang({ ...h, loopDiaMm: v }, { live: true })} hint="Hot-pulled loop. Checked against a rule of thumb, not an engineering rating (step 3)." />
      )}
      {kind === 'drilled' && (
        <div className="row2">
          <NumField label="Hole diameter" value={h.holeDiaMm} step={0.5} onChange={(v) => setHang({ ...h, holeDiaMm: v }, { live: true })} />
          <NumField label="Wire rating" unit="kg" min={0} step={0.5} value={h.wireRatingKg} onChange={(v) => setHang({ ...h, wireRatingKg: v }, { live: true })} hint="From the wire maker" />
        </div>
      )}
      {kind === 'cap' && <NumField label="Cap rating" unit="kg" min={0} step={0.5} value={h.capRatingKg} onChange={(v) => setHang({ ...h, capRatingKg: v }, { live: true })} hint="From the fitting maker" />}
      {kind === 'none' && <small className="hint">Only needed if this part will hang.</small>}
    </section>
  )
}
