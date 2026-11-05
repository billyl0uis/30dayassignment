import { useStore } from '../store.js'
import { useChecks } from '../useChecks.js'
import { Segmented } from './fields.jsx'

// The live issue list. Click an issue to select and light up its part(s).
export default function ChecksPanel() {
  const { issues } = useChecks()
  const { select, flashParts, selectedId } = useStore()
  const bad = issues.filter((i) => i.level === 'bad').length
  const warn = issues.length - bad
  return (
    <section className="checks-panel">
      <h2>
        Checks
        <span className={`tally ${bad ? 'bad' : warn ? 'warn' : 'good'}`}>{bad ? `${bad} bad` : warn ? 'no bad' : 'all clear'}{warn ? ` · ${warn} warn` : ''}</span>
      </h2>
      {!issues.length && <p className="muted small">Nothing will tip, slide or fall, and every part fits the annealer. (Checks use the estimates in settings.)</p>}
      <ul className="checks">
        {issues.map((i, n) => (
          <li key={n}>
            <button
              className={`issue ${i.level}${i.partIds.includes(selectedId) ? ' on' : ''}`}
              onClick={() => {
                select(i.focus ?? i.partIds[0])
                flashParts(i.partIds)
              }}
            >
              <i />
              <span>
                <b>{i.title}</b>
                <small>{i.detail}</small>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

const TYPE_OPTS = [['bare', 'Bare'], ['pad', 'Pad'], ['adhesive', 'Adhesive']]
const KIND = { support: 'rests on', lean: 'leans on' }

// The selected part's contacts, each with its type.
export function ContactsPanel() {
  const { scene, selectedId, setContactType, setContactTypes } = useStore()
  const { contacts } = useChecks()
  const part = scene.parts.find((p) => p.id === selectedId)
  if (!part || part.pose.mount === 'hung') return null
  const mine = contacts.filter((c) => c.a === part.id || c.b === part.id)
  const nameOf = (id) => (id === 'base' ? 'the base' : id === 'wall' ? 'the wall' : scene.parts.find((p) => p.id === id)?.name ?? '?')
  const label = (c) => (c.a === part.id ? `${KIND[c.kind]} ${nameOf(c.b)}` : `holds up ${nameOf(c.a)}`)
  return (
    <section className="panel">
      <div className="panel-head">
        <h3>Contacts</h3>
        {contacts.length > 1 && (
          <button onClick={() => setContactTypes(contacts.map((c) => c.key), 'pad')} title="Set every contact in the scene to pads">All pads</button>
        )}
      </div>
      {!mine.length && <p className="muted small">Not touching anything.</p>}
      {mine.map((c) => (
        <div key={c.key} className="contact-row">
          <span className="field-label">
            {label(c)} <b>{Math.round(c.areaMm2)} mm²</b>
          </span>
          <Segmented small value={c.type} options={TYPE_OPTS} onChange={(t) => setContactType(c.key, t)} />
        </div>
      ))}
      <small className="hint">Bare glass on glass chips and slides. Pads (felt/silicone) are removable; UV-cure adhesive is permanent and treated as no-slide (it isn’t counted on to stop tipping).</small>
    </section>
  )
}
