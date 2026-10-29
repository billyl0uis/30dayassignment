import { useMemo, useState } from 'react'
import { measure } from '@core/model/measure'
import { formatLength, formatVolume, formatWeight } from '@core/model/units'
import { buildSection } from '@core/model/wall'
import { LengthField } from '@core/ui/LengthField'
import { Preview3D } from '@core/ui/Preview3D'
import { ProfileEditor } from '@core/ui/ProfileEditor'
import { UnitsSwitch } from '@core/ui/UnitsSwitch'
import { useUnits } from '@core/ui/useUnits'
import { STARTING_BODY } from './startingJar'
import { unitsStore } from './stores'

export function JarApp() {
  const units = useUnits(unitsStore)
  const [body, setBody] = useState(STARTING_BODY)
  const [selected, setSelected] = useState(null)
  const [cutaway, setCutaway] = useState(true)

  const section = useMemo(() => buildSection(body.points, { wall: body.wall }), [body])
  const m = useMemo(() => measure(section), [section])
  const setPoints = (points) => setBody((b) => ({ ...b, points }))
  const point = selected == null ? null : body.points[selected]
  const updatePoint = (patch) => setPoints(body.points.map((p, i) => (i === selected ? { ...p, ...patch } : p)))

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-line px-4 py-2 sm:px-6">
        <h1 className="text-lg font-semibold tracking-tight">Finial</h1>
        <UnitsSwitch units={units} onChange={unitsStore.set} />
      </header>

      <main className="grid flex-1 gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_17rem]">
        <section className="flex min-h-[26rem] flex-col rounded-lg border border-line bg-panel" aria-label="Body profile">
          <h2 className="px-3 pt-2 text-sm font-semibold text-mute">Body profile</h2>
          <div className="min-h-0 flex-1 p-1">
            <ProfileEditor
              label="Body profile"
              points={body.points}
              onChange={setPoints}
              section={section}
              units={units}
              selected={selected}
              onSelect={setSelected}
            />
          </div>
          <p className="px-3 pb-2 text-xs text-faint">
            Drag points · click the wall to add · double-click or Delete to remove · C for a sharp corner · arrows nudge · Shift
            snaps
          </p>
        </section>

        <section className="flex min-h-[26rem] flex-col overflow-hidden rounded-lg border border-line bg-panel" aria-label="3D preview">
          <div className="flex items-center justify-between px-3 pt-2">
            <h2 className="text-sm font-semibold text-mute">3D</h2>
            <label className="flex items-center gap-2 text-sm text-mute">
              <input type="checkbox" checked={cutaway} onChange={(e) => setCutaway(e.target.checked)} className="accent-accent" />
              Cutaway
            </label>
          </div>
          <div className="min-h-0 flex-1">
            <Preview3D section={section} cutaway={cutaway} />
          </div>
        </section>

        <aside className="grid content-start gap-3">
          <section className="grid gap-3 rounded-lg border border-line bg-panel p-3">
            <h2 className="text-sm font-semibold text-mute">Wall</h2>
            <LengthField label="Thickness" mm={body.wall} units={units} min={0.5} onChange={(wall) => setBody((b) => ({ ...b, wall }))} />
          </section>

          <section className="grid gap-3 rounded-lg border border-line bg-panel p-3">
            <h2 className="text-sm font-semibold text-mute">
              {point ? (selected === 0 ? 'Base center' : selected === body.points.length - 1 ? 'Rim' : `Point ${selected}`) : 'Point'}
            </h2>
            {point ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <LengthField label="Out from axis" mm={point.r} units={units} disabled={selected === 0} onChange={(r) => updatePoint({ r })} />
                  <LengthField label="Height" mm={point.z} units={units} onChange={(z) => updatePoint({ z })} />
                </div>
                {selected > 0 && selected < body.points.length - 1 && (
                  <label className="flex items-center gap-2 text-sm text-mute">
                    <input type="checkbox" checked={!!point.corner} onChange={(e) => updatePoint({ corner: e.target.checked })} className="accent-accent" />
                    Sharp corner
                  </label>
                )}
              </>
            ) : (
              <p className="text-sm text-faint">Select a point on the drawing to type its position.</p>
            )}
          </section>

          <section className="rounded-lg border border-line bg-panel p-3">
            <h2 className="mb-2 text-sm font-semibold text-mute">Measures</h2>
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
              {[
                ['Height', formatLength(m.height, units)],
                ['Widest', formatLength(m.maxDiameter, units)],
                ['Opening', formatLength(m.openingDiameter, units)],
                ['Rim, outside', formatLength(m.rimOuterDiameter, units)],
                ['Foot', formatLength(m.footDiameter, units)],
                ['Capacity, brimful', formatVolume(m.capacityMl, units)],
                ['Glass', formatWeight(m.weightG, units)],
              ].map(([name, value]) => (
                <div key={name} className="contents">
                  <dt className="text-faint">{name}</dt>
                  <dd className="text-right font-mono">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-xs text-faint">Glass weight at 2.5 g/cm³ (soda-lime); editable in a later step.</p>
          </section>
        </aside>
      </main>
    </div>
  )
}
