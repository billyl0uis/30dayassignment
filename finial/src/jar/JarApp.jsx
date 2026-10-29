import { useEffect, useMemo, useState } from 'react'
import { capacityTo, measure } from '@core/model/measure'
import { thicknessJumps, thicknessRange } from '@core/model/thickness'
import { buildSection } from '@core/model/wall'
import { LengthField } from '@core/ui/LengthField'
import { Preview3D } from '@core/ui/Preview3D'
import { ProfileEditor } from '@core/ui/ProfileEditor'
import { UnitsSwitch } from '@core/ui/UnitsSwitch'
import { usePrefs } from '@core/ui/usePrefs'
import { useUnits } from '@core/ui/useUnits'
import { startingDesign } from './design'
import { loadDraft, saveDraft } from './draft'
import { FileBar } from './panels/FileBar'
import { ShopSheetView } from './sheet/ShopSheetView'
import { fitLid } from './lid'
import { planSteps } from './process'
import { ColourPanel } from './panels/ColourPanel'
import { LidPanel } from './panels/LidPanel'
import { MeasuresPanel } from './panels/MeasuresPanel'
import { Panel } from './panels/Panel'
import { PlanPanel } from './panels/PlanPanel'
import { PointPanel } from './panels/PointPanel'
import { ThicknessPanel } from './panels/ThicknessPanel'
import { jumpRuleStore, unitsStore } from './stores'
import { bodyBands, coeCheck, zonesInUse } from './zones'

// How far "Lift lid" raises it, to see the fit.
const LIFT_MM = 30

export function JarApp() {
  const units = useUnits(unitsStore)
  const rule = usePrefs(jumpRuleStore)
  // The whole design (design.js), from where you left off in this browser.
  const [design, setDesign] = useState(() => loadDraft() ?? startingDesign())
  const { body, lid, zones, density } = design
  // null while the plan follows the design; the steps once you edit them.
  const editedPlan = design.plan
  const change = (key) => (value) =>
    setDesign((d) => ({ ...d, [key]: typeof value === 'function' ? value(d[key]) : value }))
  const setBody = change('body')
  const setLid = change('lid')
  const setZones = change('zones')
  const setEditedPlan = change('plan')
  const [part, setPart] = useState('body')
  const [selected, setSelected] = useState({ body: null, lid: null })
  const [cutaway, setCutaway] = useState(true)
  const [lifted, setLifted] = useState(false)
  const [view, setView] = useState('shape')
  // Counts designs loaded, so the 3D view frames each one fresh.
  const [loads, setLoads] = useState(0)
  const [sheetOpen, setSheetOpen] = useState(false)

  const section = useMemo(() => buildSection(body.points, { wall: body.wall }), [body])
  const m = useMemo(() => measure(section, { density }), [section, density])

  useEffect(() => saveDraft(design), [design])

  // A whole design replacing this one: a preset, a file or a fresh start.
  const replaceDesign = (next) => {
    setDesign(next)
    setSelected({ body: null, lid: null })
    setLoads((n) => n + 1)
  }
  const jumps = useMemo(() => thicknessJumps(section, rule), [section, rule])
  const fitted = useMemo(() => fitLid(section, lid), [section, lid])

  const lidNumbers = useMemo(() => {
    const all = fitted.parts.flat()
    const lowest = Math.min(fitted.lowestInside, section.brim)
    return {
      diameter: 2 * Math.max(...all.map((p) => p[0])),
      heightOn: fitted.seat + Math.max(...all.map((p) => p[1])),
      capacityUnderMl: capacityTo(section, lowest),
      weightG: fitted.glassCm3 * density,
    }
  }, [fitted, section, density])

  const range = thicknessRange(section)
  const hasKnob = fitted.knobPart !== null
  const inUse = useMemo(() => zonesInUse(zones, { hasKnob }), [zones, hasKnob])
  const coe = coeCheck(zones, inUse)

  const parts = useMemo(() => {
    const lift = fitted.seat + (lifted ? LIFT_MM : 0)
    const lidGlass = fitted.parts.filter((poly) => poly !== fitted.knobPart)
    return [
      ...bodyBands(section.glass, m.height, zones, inUse),
      { polygons: lidGlass, lift, color: zones.lid.swatch },
      ...(fitted.knobPart ? [{ polygons: [fitted.knobPart], lift, color: zones.knob.swatch }] : []),
    ]
  }, [section, m.height, fitted, lifted, zones, inUse])

  const steps =
    editedPlan ??
    planSteps({ section, m, range, lid, fitted, lidWeightG: lidNumbers.weightG, zones, inUse, units })
  // The body, seen from the lid's own frame, so the fit shows as you draw.
  const ghost = useMemo(() => [section.glass.map(([r, z]) => [r, z - fitted.seat])], [section, fitted.seat])

  const select = (index) => setSelected((s) => ({ ...s, [part]: index }))
  const setBodyPoints = (points) => setBody((b) => ({ ...b, points }))
  const setLidPoints = (points) => setLid((l) => ({ ...l, points }))

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-line px-4 py-2 sm:px-6">
        <h1 className="text-lg font-semibold tracking-tight">Finial</h1>
        <FileBar design={design} onRename={change('name')} onReplace={replaceDesign} />
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="rounded bg-accent px-3 py-1 text-sm font-semibold text-accent-ink"
        >
          Shop sheet
        </button>
        <UnitsSwitch units={units} onChange={unitsStore.set} />
      </header>

      <main className="grid flex-1 gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_20rem] lg:items-start">
        <section
          className="flex h-[min(80dvh,40rem)] min-h-[26rem] flex-col rounded-lg border border-line bg-panel lg:sticky lg:top-3 lg:h-[calc(100dvh-4.5rem)]"
          aria-label={part === 'body' ? 'Body profile' : 'Lid profile'}
        >
          <div className="flex items-center gap-1 px-2 pt-2" role="tablist" aria-label="Which piece to draw">
            {[
              ['body', 'Body'],
              ['lid', 'Lid'],
            ].map(([key, name]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={part === key}
                onClick={() => setPart(key)}
                className={`rounded px-3 py-1 text-sm font-semibold ${part === key ? 'bg-raise text-ink' : 'text-mute hover:text-ink'}`}
              >
                {name}
              </button>
            ))}
            {part === 'lid' && <span className="ml-auto pr-1 text-xs text-faint">Dashed: the body, where the lid sits</span>}
          </div>
          <div className="min-h-0 flex-1 p-1">
            {part === 'body' ? (
              <ProfileEditor
                key="body"
                label="Body profile"
                points={body.points}
                onChange={setBodyPoints}
                section={section}
                units={units}
                selected={selected.body}
                onSelect={select}
                highlights={jumps}
              />
            ) : (
              <ProfileEditor
                key="lid"
                label="Lid profile"
                points={fitted.points}
                onChange={setLidPoints}
                section={fitted.section}
                units={units}
                selected={selected.lid}
                onSelect={select}
                extras={fitted.parts.slice(1)}
                ghost={ghost}
                lockLastR={fitted.edgeR !== null}
              />
            )}
          </div>
          <p className="px-3 pb-2 text-xs text-faint">
            {part === 'lid' ? 'Draw the top of the lid; the glass hangs below the line. ' : ''}
            Drag points · click the line to add · double-click or Delete to remove · C for a sharp corner · arrows nudge · Shift
            snaps
          </p>
        </section>

        <section
          className="flex h-[min(80dvh,40rem)] min-h-[26rem] flex-col overflow-hidden rounded-lg border border-line bg-panel lg:sticky lg:top-3 lg:h-[calc(100dvh-4.5rem)]"
          aria-label="3D preview"
        >
          <div className="flex items-center justify-between gap-3 px-3 pt-2">
            <h2 className="text-sm font-semibold text-mute">3D</h2>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm text-mute">
                <input type="checkbox" checked={lifted} onChange={(e) => setLifted(e.target.checked)} className="accent-accent" />
                Lift lid
              </label>
              <label className="flex items-center gap-2 text-sm text-mute">
                <input type="checkbox" checked={cutaway} onChange={(e) => setCutaway(e.target.checked)} className="accent-accent" />
                Cutaway
              </label>
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <Preview3D parts={parts} cutaway={cutaway} frameKey={loads} snapshotName={design.name} />
          </div>
        </section>

        <aside className="grid content-start gap-3">
          <div className="flex gap-1 rounded-lg border border-line bg-panel p-1" role="tablist" aria-label="Side panel">
            {[
              ['shape', 'Shape'],
              ['colour', coe.mismatch.length ? 'Colour ⚠' : 'Colour'],
              ['plan', 'Plan'],
            ].map(([key, name]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={view === key}
                onClick={() => setView(key)}
                className={`flex-1 rounded px-2 py-1 text-sm font-semibold ${view === key ? 'bg-raise text-ink' : 'text-mute hover:text-ink'}`}
              >
                {name}
              </button>
            ))}
          </div>
          {view === 'shape' && (
            <>
            {part === 'body' ? (
              <>
                <Panel title="Body wall">
                  <LengthField
                    label="Thickness everywhere else"
                    mm={body.wall}
                    units={units}
                    min={0.5}
                    onChange={(wall) => setBody((b) => ({ ...b, wall }))}
                  />
                  <p className="text-xs text-faint">
                    Set a point’s own thickness to make a heavier base or a thinner lip; the wall changes smoothly between points.
                  </p>
                </Panel>
                <PointPanel
                  points={body.points}
                  selected={selected.body}
                  onChange={setBodyPoints}
                  units={units}
                  wall={body.wall}
                  names={{ first: 'Base center', last: 'Rim' }}
                />
                <ThicknessPanel jumps={jumps} rule={rule} units={units} />
              </>
            ) : (
              <>
                <LidPanel lid={lid} onChange={setLid} fitted={fitted} units={units} />
                <PointPanel
                  points={fitted.points}
                  selected={selected.lid}
                  onChange={setLidPoints}
                  units={units}
                  wall={lid.wall}
                  names={{ first: 'Top center', last: 'Edge' }}
                  lockLastR={fitted.edgeR !== null}
                />
              </>
            )}
              <MeasuresPanel m={m} range={range} lid={lidNumbers} units={units} density={density} onDensity={change('density')} />
            </>
          )}
          {view === 'colour' && (
            <ColourPanel zones={zones} onChange={setZones} inUse={inUse} hasKnob={hasKnob} coe={coe} units={units} />
          )}
          {view === 'plan' && <PlanPanel steps={steps} edited={editedPlan !== null} onChange={setEditedPlan} onRebuild={() => setEditedPlan(null)} />}
        </aside>
      </main>
      {sheetOpen && (
        <ShopSheetView
          d={{
            name: design.name,
            units,
            section,
            m,
            range,
            lid,
            fitted,
            lidNumbers,
            zones,
            inUse,
            coe,
            jumps,
            steps,
            edited: editedPlan !== null,
            density,
          }}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </div>
  )
}
