import { useCallback, useEffect, useMemo, useState } from 'react'
import { DEFAULT_DENSITY_G_CM3, capacityTo, measure } from '@core/model/measure'
import { clipBelow, solidOfRevolution } from '@core/model/revolve'
import { formatLength, formatVolume, formatWeight } from '@core/model/units'
import { buildSection } from '@core/model/wall'
import { Preview3D } from '@core/ui/Preview3D'
import { ProfileEditor } from '@core/ui/ProfileEditor'
import { UnitsSwitch } from '@core/ui/UnitsSwitch'
import { useUnits } from '@core/ui/useUnits'
import { bodyFrom, bottlePoints, neckShape } from './model/bottle.js'
import { fillHeight, fillMl } from './model/capacity.js'
import { CLOSURE_TYPES, neckWall } from './model/closures.js'
import { PRESETS } from './model/presets.js'
import { processTemplate } from './model/process.js'
import { riskZones } from './model/risks.js'
import { ViewsSheetView } from './sheet/ViewsSheetView.jsx'
import { loadDesign, newDesign, saveDesign, unitsStore } from './stores.js'
import { ClosurePanel } from './ui/ClosurePanel.jsx'
import { Note, Panel, Readout } from './ui/fields.jsx'
import { CapacityPanel, ProcessPanel, WallPanel } from './ui/panels.jsx'

export function FlaconApp() {
  const units = useUnits(unitsStore)
  const [design, setDesign] = useState(loadDesign)
  const [selected, setSelected] = useState(null)
  const [cutaway, setCutaway] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)
  useEffect(() => saveDesign(design), [design])

  const update = useCallback(
    (patch, { retemplate = false } = {}) =>
      setDesign((d) => {
        const next = { ...d, ...patch }
        return retemplate ? { ...next, process: processTemplate(next.closure.type) } : next
      }),
    [],
  )

  const neck = useMemo(() => neckShape(design), [design])
  const points = useMemo(() => bottlePoints(design.points, neck), [design.points, neck])
  const section = useMemo(() => buildSection(points, { wall: design.wall }), [points, design.wall])
  const m = useMemo(() => measure(section, { density: design.density ?? DEFAULT_DENSITY_G_CM3 }), [section, design.density])
  const measureBody = useCallback((body) => measure(buildSection(bottlePoints(body, neck), { wall: design.wall })).capacityMl, [neck, design.wall])

  // What the risk checks read: the solid base under the cavity, its share
  // of the glass, and the neck wall at the mouth.
  const floorZ = section.inner[0][1]
  const shoulderZ = design.points[design.points.length - 1].z
  const risks = useMemo(() => {
    const total = solidOfRevolution(section.glass).volume
    const base = solidOfRevolution(clipBelow(section.glass, floorZ)).volume
    const nw = neckWall({ outerD: neck.outerD, boreTopD: neck.boreTopD })
    return riskZones({ base: floorZ, wall: design.wall, baseShare: total ? base / total : null, neckWall: nw, neckZone: [shoulderZ, shoulderZ + design.neckLength] }, design.limits)
  }, [section, floorZ, neck, design.wall, design.limits, shoulderZ, design.neckLength])

  const onPoints = (next) => update({ points: bodyFrom(next) })
  const dauberRoom = shoulderZ + design.neckLength - neck.boreDepth - floorZ
  const oval = design.section.aspect !== 1

  // What the views sheet draws and lists, gathered when it's opened.
  const sheet = () => {
    const ml = design.fillPercent == null ? null : fillMl(m.capacityMl, design.fillPercent)
    return {
      name: PRESETS[design.preset]?.name ?? 'Perfume bottle',
      units,
      section,
      m,
      wall: design.wall,
      floorZ,
      fillPercent: design.fillPercent,
      fillMl: ml,
      fillZ: ml == null ? null : fillHeight((z) => capacityTo(section, z), floorZ, section.brim, ml),
      closureName: CLOSURE_TYPES[design.closure.type].name,
      stopper: design.closure.type === 'stopper',
      oval,
      placeholderNeck: neck.placeholder,
      densityTodo: design.density == null,
    }
  }

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2 sm:px-6">
        <h1 className="text-lg font-semibold tracking-tight">Flacon</h1>
        <nav className="flex flex-wrap gap-1" aria-label="Start from">
          {Object.entries(PRESETS).map(([id, p]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setDesign(newDesign(id))
                setSelected(null)
              }}
              className={`rounded border px-2.5 py-1 text-sm ${design.preset === id ? 'border-accent text-ink' : 'border-line text-mute hover:text-ink'}`}
            >
              {p.name}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setSheetOpen(true)} className="rounded border border-line px-2.5 py-1 text-sm text-mute hover:text-ink">
            Views sheet
          </button>
          <UnitsSwitch units={units} onChange={unitsStore.set} />
        </div>
      </header>
      {sheetOpen && <ViewsSheetView d={sheet()} onClose={() => setSheetOpen(false)} />}

      <main className="grid flex-1 gap-3 p-3 lg:min-h-0 lg:grid-rows-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_22rem]">
        <section className="flex min-h-[26rem] flex-col rounded-lg border border-line bg-panel" aria-label="Bottle profile">
          <h2 className="px-3 pt-2 text-sm font-semibold text-mute">Profile</h2>
          <div className="min-h-0 flex-1 p-1">
            <ProfileEditor label="Bottle profile" points={points} onChange={onPoints} section={section} units={units} selected={selected} onSelect={setSelected} />
          </div>
          <p className="px-3 pb-2 text-xs text-faint">
            Drag the body points · click the wall to add · double-click or Delete to remove · C for a sharp corner · arrows nudge · Shift snaps. The neck is
            sized in the closure panel.
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
            <Preview3D section={section} cutaway={cutaway} color="#f1e4f6" />
          </div>
          <div className="border-t border-line p-3">
            <Readout
              rows={[
                ['Height', formatLength(m.height, units)],
                ['Widest', formatLength(m.maxDiameter, units)],
                ['Mouth, inside', formatLength(m.rimInnerDiameter, units, 2)],
                ['Narrowest bore', formatLength(m.openingDiameter, units, 2)],
                ['Neck outside', formatLength(m.rimOuterDiameter, units, 2)],
                ['Brimful', formatVolume(m.capacityMl, units)],
                ['Glass', formatWeight(m.weightG, units)],
              ]}
            />
          </div>
        </section>

        <aside className="grid content-start gap-3 lg:overflow-y-auto">
          {oval && (
            <Note tone="caution">
              This form is meant to be oval ({Math.round(design.section.aspect * 100)}% as deep as it is wide), but the oval cross-section isn't built into the
              vessel core yet. Everything here, capacity included, is for a round body.
            </Note>
          )}
          {neck.placeholder && <Note tone="caution">The neck is a placeholder from the starting sketch until the closure sizes are filled in.</Note>}
          <ClosurePanel design={design} update={update} units={units} neck={neck} dauberRoom={dauberRoom} />
          <CapacityPanel design={design} update={update} units={units} section={section} m={m} measureBody={measureBody} />
          <WallPanel design={design} update={update} units={units} m={m} risks={risks} />
          <ProcessPanel design={design} update={update} />
          <Panel title="Not in this version yet">
            <p className="text-xs text-faint">
              Oval cross-sections, zooming the profile to the neck, the stopper in 3D, decorative zones on screen, save/open files and the full shop sheet (the views sheet is here). These
              wait on the vessel core or come next.
            </p>
          </Panel>
        </aside>
      </main>
    </div>
  )
}
