import { KIND_LABEL, colorOf, layerStack, pointAtS } from '../model/color.js'
import { useStore } from '../model/store.js'
import { fmtLen } from '../model/units.js'

// What the wall is made of at one spot, inside to outside, read off the
// profile under the pointer.
export default function StackReadout({ sec, s, x, y, width }) {
  const colors = useStore((st) => st.colors)
  const studio = useStore((st) => st.studio)
  const units = useStore((st) => st.units)
  const layers = layerStack(sec, colors, studio, s)
  const inside = layers.some((l) => l.fromInside)
  const left = x + 250 > width ? x - 246 : x + 16

  return (
    <div className="stack-readout" style={{ left, top: Math.max(8, y - 20) }}>
      <div className="stack-head">
        Wall at {fmtLen(pointAtS(sec, s)[1], units)} up
        {colors.incalmo.seams.length > 0 && <span> · section {layers.find((l) => l.kind === 'body').section + 1}</span>}
      </div>
      <div className="stack-side">{inside ? 'inside' : 'solid glass (no inside here)'}</div>
      <ol>
        {layers.map((l) => {
          const c = colorOf(studio, l.colorId)
          const name = l.kind === 'body' ? (c?.name ?? studio.clear.name) : (c?.name ?? 'missing color')
          const what = l.kind === 'body' ? (colors.incalmo.seams.length ? 'Incalmo section' : 'Body') : l.kind === 'wrap' ? (l.zone === 'foot' ? 'Colored foot' : 'Lip wrap') : KIND_LABEL[l.kind]
          const note = l.hidden ? "hidden: won't show" : l.fromOutside && !l.fromInside && inside ? 'seen from outside only' : !l.fromOutside ? 'seen from inside only' : null
          return (
            <li key={l.key} className={l.hidden ? 'hidden' : ''}>
              <i className={(c ? '' : 'clear') + (c?.opaque ? ' opaque' : '') + (l.partial ? ' speckle' : '')} style={{ '--c': c?.hex ?? 'transparent' }} />
              <span>
                <b>{what}</b> {name}
                {note && <em>{note}</em>}
              </span>
              <small>{(l.t * 10).toFixed(2)} mm</small>
            </li>
          )
        })}
      </ol>
      <div className="stack-side">outside</div>
    </div>
  )
}
