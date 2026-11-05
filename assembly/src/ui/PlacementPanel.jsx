import { useStore } from '../store.js'
import { NumField, Segmented, Slider } from './fields.jsx'

// Where the selected part is: resting, leaning or hanging, and how it's
// turned. Height is never typed in; it always comes from snap-to-rest or the
// hanging line.
export default function PlacementPanel() {
  const { scene, selectedId, placePart } = useStore()
  const part = scene.parts.find((p) => p.id === selectedId)
  if (!part) return null
  const p = part.pose
  const place = (patch, live) => placePart(part.id, patch, { live })
  const others = scene.parts.filter((q) => q.id !== part.id && q.pose.mount !== 'hung')
  const how = p.mount === 'hung' ? 'hung' : p.lean ? 'lean' : 'rest'

  return (
    <section className="panel">
      <h3>Placement</h3>
      <Segmented
        small
        value={how}
        options={[['rest', 'Rest'], ['lean', 'Lean'], ['hung', 'Hang']]}
        onChange={(v) => {
          if (v === 'rest') place({ mount: 'rest', lean: null })
          if (v === 'lean') place({ mount: 'rest', lean: p.lean ?? 'wall', tilt: p.tilt || 8 })
          if (v === 'hung') place({ mount: 'hung', lean: null, tilt: 0 })
        }}
      />
      <div className="row2">
        <NumField label="Across (x)" min={-5000} value={p.x} onChange={(x) => place({ x }, true)} />
        <NumField label="Front–back (z)" min={-5000} value={p.z} onChange={(z) => place({ z }, true)} />
      </div>
      <Slider label="Turn" shown={`${Math.round(p.yaw)}°`} value={p.yaw} min={-180} max={180} step={1} onChange={(yaw) => place({ yaw }, true)} />

      {how === 'rest' && (
        <>
          <Slider label="Tip over" shown={`${Math.round(p.tilt)}°`} value={p.tilt} min={0} max={85} step={1} onChange={(tilt) => place({ tilt }, true)} />
          {p.tilt > 0 && <Slider label="Tip towards" shown={`${Math.round(p.tiltDir)}°`} value={p.tiltDir} min={0} max={359} step={1} onChange={(tiltDir) => place({ tiltDir }, true)} />}
          <small className="hint">Drag it in the view; it drops onto whatever is below. Tip it 90° to lay it down.</small>
        </>
      )}

      {how === 'lean' && (
        <>
          <label className="num">
            <span className="field-label">Leans against</span>
            <select value={p.lean} onChange={(e) => place({ lean: e.target.value })}>
              <option value="wall">The wall</option>
              {others.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
            </select>
          </label>
          <Slider label="Lean angle" shown={`${Math.round(p.tilt)}°`} value={p.tilt} min={1} max={45} step={0.5} onChange={(tilt) => place({ tilt }, true)} />
          <small className="hint">Foot on the base; it slides in until its top touches. Whether it holds is checked in step 3.</small>
        </>
      )}

      {how === 'hung' && (
        <>
          <NumField label="Line length" value={p.lineMm} min={0} step={10} onChange={(lineMm) => place({ lineMm }, true)} />
          {!part.hang && <small className="hint warn-text">No hanging point set: choose one under Hanging point.</small>}
        </>
      )}
    </section>
  )
}

// The stage the group is arranged on.
export function StagePanel() {
  const { scene, setStage, settleAll } = useStore()
  const st = scene.stage
  return (
    <section className="panel">
      <div className="panel-head">
        <h3>Stage</h3>
        <button onClick={settleAll} title="Drop every part onto what's below it, bottom-up">Settle all</button>
      </div>
      <div className="row3">
        <NumField label="Base W" value={st.baseW} step={10} onChange={(baseW) => setStage({ baseW }, { live: true })} />
        <NumField label="Base D" value={st.baseD} step={10} onChange={(baseD) => setStage({ baseD }, { live: true })} />
        <NumField label="Armature" value={st.armatureY} step={10} onChange={(armatureY) => setStage({ armatureY }, { live: true })} hint="height" />
      </div>
      <small className="hint">The wall stands along the back edge of the base.</small>
    </section>
  )
}
