import { formatLength, formatVolume, formatWeight } from '@core/model/units'
import { NumberField, Panel } from './Panel'

// The jar's numbers, body and lid.
export function MeasuresPanel({ m, range, lid, units, density, onDensity }) {
  const rows = [
    ['Body height', formatLength(m.height, units)],
    ['Height, lid on', formatLength(lid.heightOn, units)],
    ['Widest', formatLength(m.maxDiameter, units)],
    ['Opening', formatLength(m.openingDiameter, units)],
    ['Rim, outside', formatLength(m.rimOuterDiameter, units)],
    ['Foot', formatLength(m.footDiameter, units)],
    ['Lid, widest', formatLength(lid.diameter, units)],
    [
      'Body wall',
      range.thinnest === range.thickest
        ? formatLength(range.thinnest, units)
        : `${formatLength(range.thinnest, units)}–${formatLength(range.thickest, units)}`,
    ],
    ['Capacity, brimful', formatVolume(m.capacityMl, units)],
    ['Capacity, lid on', formatVolume(lid.capacityUnderMl, units)],
    ['Body glass', formatWeight(m.weightG, units)],
    ['Lid glass', formatWeight(lid.weightG, units)],
    ['Total glass', formatWeight(m.weightG + lid.weightG, units)],
  ]
  return (
    <Panel title="Measures">
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
        {rows.map(([name, value]) => (
          <div key={name} className="contents">
            <dt className="text-faint">{name}</dt>
            <dd className="text-right font-mono">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex items-end gap-3 border-t border-line pt-3">
        <NumberField label="Glass density, g/cm³" value={density} min={0.5} step={0.01} onChange={onDensity} />
        <p className="pb-1 text-xs text-faint">2.5 is a starting value for soda-lime. Use your glass’s own figure.</p>
      </div>
      <p className="text-xs text-faint">Capacity with the lid on is up to the lowest part of the lid inside the mouth.</p>
    </Panel>
  )
}
