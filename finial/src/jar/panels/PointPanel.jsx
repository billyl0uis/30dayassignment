import { LengthField } from '@core/ui/LengthField'
import { Panel } from './Panel'

// The selected point of a profile, as numbers: where it is, whether it's a
// sharp corner, and its own wall thickness.
export function PointPanel({ points, selected, onChange, units, wall, names, lockLastR = false }) {
  const point = selected == null ? null : points[selected]
  const last = points.length - 1
  const name = selected === 0 ? names.first : selected === last ? names.last : `Point ${selected}`
  const update = (patch) => onChange(points.map((p, i) => (i === selected ? { ...p, ...patch } : p)))

  return (
    <Panel title={point ? name : 'Point'}>
      {point ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <LengthField
              label="Out from axis"
              mm={point.r}
              units={units}
              disabled={selected === 0 || (lockLastR && selected === last)}
              hint={lockLastR && selected === last ? 'Set by the fit' : undefined}
              onChange={(r) => update({ r })}
            />
            <LengthField label="Height" mm={point.z} units={units} onChange={(z) => update({ z })} />
          </div>
          {selected > 0 && selected < last && (
            <label className="flex items-center gap-2 text-sm text-mute">
              <input type="checkbox" checked={!!point.corner} onChange={(e) => update({ corner: e.target.checked })} className="accent-accent" />
              Sharp corner
            </label>
          )}
          <label className="flex items-center gap-2 text-sm text-mute">
            <input
              type="checkbox"
              checked={point.wall != null}
              onChange={(e) => update({ wall: e.target.checked ? wall : undefined })}
              className="accent-accent"
            />
            Own wall thickness
          </label>
          {point.wall != null && <LengthField label="Wall here" mm={point.wall} units={units} min={0.5} onChange={(w) => update({ wall: w })} />}
        </>
      ) : (
        <p className="text-sm text-faint">Select a point on the drawing to type its position or give it its own wall thickness.</p>
      )}
    </Panel>
  )
}
