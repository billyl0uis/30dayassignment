import { useEffect, useState } from 'react';
import { GLASS_SWATCHES } from '../model/design';
import type { ArrayOp, BlendOp, BooleanOp, DeformOp, GlassEffect, GlassMaterial, OpNode, PrimitiveOp, ShellOp, StackOp, Transform, Units, Vec3 } from '../model/types';
import { formatInput, fromDisplay, inch, parseLength, sliderStep, toDisplay } from '../model/units';
import { placedByStack } from '../model/tree';
import { getPreset } from '../presets/registry';
import { withDefaults, type ParamSpec } from '../presets/types';
import { FILE_UNITS } from '../presets/imported';
import { bodiesOf, unionBounds } from '../engine/evaluate';
import { endDrag, useDesign } from '../store/designStore';
import { useEvaluation } from '../store/useEvaluation';

export function Inspector() {
  const op = useDesign((s) => s.design.ops.find((o) => o.id === s.selectedId));
  const count = useDesign((s) => s.selection.length);
  const { errors } = useEvaluation();
  const error = op && errors.get(op.id);

  if (!op) {
    return (
      <section className="panel">
        <h2>Part</h2>
        <p className="empty">Click a part in the view or the tree to edit its size, placement and glass.</p>
      </section>
    );
  }
  return (
    <>
      {count > 1 && <p className="multi-note">{count} selected. Editing the last one picked; combine buttons use the first picked as the target.</p>}
      {error && (
        <p className="op-error" role="alert">
          {error}
        </p>
      )}
      {op.type === 'primitive' && <PrimitivePanel op={op} />}
      {op.type === 'stack' && <StackPanel op={op} />}
      {op.type === 'array' && <ArrayPanel op={op} />}
      {op.type === 'boolean' && <BooleanPanel op={op} />}
      {op.type === 'shell' && <ShellPanel op={op} />}
      {op.type === 'blend' && <BlendPanel op={op} />}
      {op.type === 'deform' && <DeformPanel op={op} />}
      {(op.type === 'primitive' || op.type === 'stack') && <PlacementPanel op={op} />}
      {op.type === 'primitive' && <MaterialFor op={op} />}
      {op.type === 'boolean' && <MaterialOfInput id={op.target} />}
      {op.type === 'shell' && <MaterialOfInput id={op.source} />}
      {op.type === 'blend' && <MaterialOfInput id={op.inputs[0]} />}
      {op.type === 'deform' && <MaterialOfInput id={op.source} />}
    </>
  );
}

function NameInput({ op }: { op: OpNode }) {
  const rename = useDesign((s) => s.rename);
  return <input className="name-input" value={op.label} onChange={(e) => rename(op.id, e.target.value)} aria-label="Name" />;
}

function PrimitivePanel({ op }: { op: PrimitiveOp }) {
  const units = useDesign((s) => s.design.displayUnits);
  const setParam = useDesign((s) => s.setParam);
  const def = getPreset(op.preset);
  const params = withDefaults(def, op.params);
  return (
    <section className="panel">
      <h2>
        {def.label}
        <span className="units-tag">{units}</span>
      </h2>
      <NameInput op={op} />
      {op.mesh && <ImportedControls op={op} />}
      {def.params.filter((spec) => !spec.hidden).map((spec) =>
        spec.kind === 'length' ? (
          <LengthField key={spec.key} spec={spec} mm={params[spec.key]} units={units} onChange={(v) => setParam(op.id, spec.key, v)} />
        ) : (
          <RatioField key={spec.key} spec={spec} value={params[spec.key]} onChange={(v) => setParam(op.id, spec.key, v)} />
        ),
      )}
      {def.params.some((p) => p.handle) && <p className="note">Drag the orange dots on the part to resize it.</p>}
      {op.shape && <DrawnActions op={op} />}
    </section>
  );
}

/** For an imported mesh: what units the file was in, and how big it is. */
function ImportedControls({ op }: { op: PrimitiveOp }) {
  const setParam = useDesign((s) => s.setParam);
  const units = Math.round(op.params.units ?? 0);
  return (
    <div className="field">
      <label>
        File units
        <span className="hint">{op.mesh!.triangles.toLocaleString()} triangles</span>
      </label>
      <div className="segmented" role="radiogroup" aria-label="File units">
        {FILE_UNITS.map((u, i) => (
          <button key={u.label} role="radio" aria-checked={units === i} className={units === i ? 'on' : undefined} onClick={() => setParam(op.id, 'units', i)}>
            {u.label}
          </button>
        ))}
      </div>
      <p className="note flush">Imported meshes work with booleans and deform; shell and melt need parts made here.</p>
    </div>
  );
}

/** For a hand-drawn part: reopen the drawing, or keep a copy in My Parts. */
function DrawnActions({ op }: { op: PrimitiveOp }) {
  const { openEditor, saveToMyParts, myParts } = useDesign.getState();
  const [saved, setSaved] = useState(false);
  return (
    <div className="button-row">
      <button className="btn small" onClick={() => openEditor({ kind: 'op', id: op.id })}>
        Edit drawing…
      </button>
      <button
        className="btn small"
        disabled={saved}
        onClick={() => {
          saveToMyParts(op.shape!, op.label);
          setSaved(true);
        }}
        title={myParts.some((p) => p.name === op.label) ? 'A saved part already has this name; this adds another' : undefined}
      >
        {saved ? 'Saved' : 'Save to My Parts'}
      </button>
    </div>
  );
}

function MaterialFor({ op }: { op: PrimitiveOp }) {
  const material = useDesign((s) => s.design.materials[op.materialId]);
  return material ? <MaterialPanel material={material} /> : null;
}

/** A boolean or shell is one piece of glass in the color of the part it was made from. */
function MaterialOfInput({ id }: { id: string }) {
  const ops = useDesign((s) => s.design.ops);
  const byId = new Map(ops.map((o) => [o.id, o]));
  let op = byId.get(id);
  // Walk down to the first real part: a boolean's target, a shell's source, a stack's base.
  while (op && op.type !== 'primitive') {
    const next: string | undefined =
      op.type === 'boolean' ? op.target : op.type === 'stack' ? op.children[0] : op.type === 'blend' ? op.inputs[0] : op.source;
    op = next ? byId.get(next) : undefined;
  }
  return op ? <MaterialFor op={op} /> : null;
}

const MODES: { mode: BooleanOp['mode']; label: string; hint: string }[] = [
  { mode: 'union', label: 'Union', hint: 'fused into one piece' },
  { mode: 'subtract', label: 'Subtract', hint: 'tools cut away from the target' },
  { mode: 'intersect', label: 'Intersect', hint: 'only where they all overlap' },
];

function BooleanPanel({ op }: { op: BooleanOp }) {
  const ops = useDesign((s) => s.design.ops);
  const patchOp = useDesign((s) => s.patchOp);
  const select = useDesign((s) => s.select);
  const name = (id: string) => ops.find((o) => o.id === id)?.label ?? '?';
  const current = MODES.find((m) => m.mode === op.mode)!;
  return (
    <section className="panel">
      <h2>Boolean</h2>
      <NameInput op={op} />
      <div className="segmented" role="radiogroup" aria-label="Boolean kind">
        {MODES.map((m) => (
          <button key={m.mode} role="radio" aria-checked={op.mode === m.mode} className={op.mode === m.mode ? 'on' : undefined} onClick={() => patchOp(op.id, { mode: m.mode }, 'mode')}>
            {m.label}
          </button>
        ))}
      </div>
      <p className="note flush">{current.hint[0].toUpperCase() + current.hint.slice(1)}.</p>
      <dl className="io-list">
        <dt>Target</dt>
        <dd>
          <button className="link" onClick={() => select(op.target)}>
            {name(op.target)}
          </button>
        </dd>
        <dt>{op.tools.length === 1 ? 'Tool' : 'Tools'}</dt>
        <dd>
          {op.tools.map((t) => (
            <button key={t} className="link" onClick={() => select(t)}>
              {name(t)}
            </button>
          ))}
        </dd>
      </dl>
      <button
        className="btn small"
        disabled={op.tools.length !== 1}
        onClick={() => patchOp(op.id, { target: op.tools[0], tools: [op.target] }, 'swap')}
        title="Make the tool the target (keeps its glass color, flips what gets cut)"
      >
        Swap target and tool
      </button>
      <p className="note">Select a tool to move or resize it; the cut follows live.</p>
    </section>
  );
}

function BlendPanel({ op }: { op: BlendOp }) {
  const units = useDesign((s) => s.design.displayUnits);
  const patchOp = useDesign((s) => s.patchOp);
  return (
    <section className="panel">
      <h2>
        Melt
        <span className="units-tag">{units}</span>
      </h2>
      <NameInput op={op} />
      <LengthField
        spec={span('radius', 'Melt radius', 0.5, inch(2), 'how far the glass flows between parts')}
        mm={op.radius}
        units={units}
        onChange={(v) => patchOp(op.id, { radius: v }, 'radius')}
      />
      <div className="segmented" role="radiogroup" aria-label="Smoothness">
        {(['normal', 'fine'] as const).map((q) => (
          <button key={q} role="radio" aria-checked={op.quality === q} className={op.quality === q ? 'on' : undefined} onClick={() => patchOp(op.id, { quality: q }, 'quality')}>
            {q === 'normal' ? 'Normal' : 'Fine (slower)'}
          </button>
        ))}
      </div>
      <p className="note flush">
        {op.inputs.length} parts. While you drag a slider, gizmo or handle the melt previews coarse, then sharpens when you let go. Fine takes a few seconds on big pieces.
      </p>
    </section>
  );
}

function DeformPanel({ op }: { op: DeformOp }) {
  const units = useDesign((s) => s.design.displayUnits);
  const { patchOp, randomizeDeform } = useDesign.getState();
  const set = (patch: Partial<DeformOp>, field: string) => patchOp(op.id, patch, field);
  const ratio = (key: keyof DeformOp, label: string, min: number, max: number, step: number, suffix: string, hint?: string) => (
    <RatioField
      key={key}
      spec={{ key, label, kind: 'ratio', default: 0, min, max, step, suffix, hint }}
      value={op[key] as number}
      onChange={(v) => set({ [key]: v }, key)}
    />
  );
  const length = (key: keyof DeformOp, label: string, max: number, hint?: string) => (
    <LengthField key={key} spec={span(key, label, 0, max, hint)} mm={op[key] as number} units={units} onChange={(v) => set({ [key]: v }, key)} />
  );
  return (
    <section className="panel">
      <h2>
        Deform
        <span className="units-tag">{units}</span>
      </h2>
      <NameInput op={op} />
      <button className="btn small draw-btn" onClick={() => randomizeDeform(op.id)} title="Rolls a new random mix of the settings below (undo to go back)">
        Try a variation
      </button>
      {ratio('pinch', 'Pinch', -0.6, 0.6, 0.01, '', 'waist in, or swell out')}
      {ratio('ribs', 'Ribs', 0, 36, 1, '', 'optic-mold ribs, 0 = none')}
      {op.ribs > 0 && length('ribDepth', 'Rib depth', inch(0.5))}
      {ratio('twist', 'Twist', -720, 720, 5, '°', 'bottom to top')}
      {length('sag', 'Sag', inch(3), 'how far the top settles')}
      {ratio('bend', 'Bend', -120, 120, 1, '°', 'leans toward +X')}
      {length('noise', 'Lumpiness', inch(0.5), 'uneven, hand-worked surface')}
      {op.noise > 0 && length('noiseScale', 'Lump size', inch(4))}
      {op.noise > 0 && ratio('seed', 'Lump pattern', 1, 99, 1, '')}
      <p className="note flush">Twist shows on ribs or anything not round. Shell and melt need to come before a deform, not after.</p>
    </section>
  );
}

function ShellPanel({ op }: { op: ShellOp }) {
  const units = useDesign((s) => s.design.displayUnits);
  const patchOp = useDesign((s) => s.patchOp);
  return (
    <section className="panel">
      <h2>
        Shell
        <span className="units-tag">{units}</span>
      </h2>
      <NameInput op={op} />
      <LengthField
        spec={span('thickness', 'Wall', 0.5, inch(1.5), 'measured in from the outside')}
        mm={op.thickness}
        units={units}
        onChange={(v) => patchOp(op.id, { thickness: v }, 'thickness')}
      />
      <div className="segmented" role="radiogroup" aria-label="Opening">
        {(['top', 'bottom', 'none'] as const).map((o) => (
          <button key={o} role="radio" aria-checked={op.opening === o} className={op.opening === o ? 'on' : undefined} onClick={() => patchOp(op.id, { opening: o }, 'opening')}>
            {o === 'none' ? 'Closed' : o === 'top' ? 'Open top' : 'Open bottom'}
          </button>
        ))}
      </div>
      {op.opening !== 'none' && (
        <LengthField
          spec={span('openingDiameter', 'Opening', 1, inch(24), 'diameter, on the center axis')}
          mm={op.openingDiameter}
          units={units}
          onChange={(v) => patchOp(op.id, { openingDiameter: v }, 'openingDiameter')}
        />
      )}
    </section>
  );
}

const span = (key: string, label: string, min: number, max: number, hint?: string): ParamSpec => ({ key, label, kind: 'length', default: 0, min, max, hint });

function StackPanel({ op }: { op: StackOp }) {
  const units = useDesign((s) => s.design.displayUnits);
  const patchOp = useDesign((s) => s.patchOp);
  return (
    <section className="panel">
      <h2>
        Stack
        <span className="units-tag">{units}</span>
      </h2>
      <NameInput op={op} />
      <LengthField
        spec={span('overlap', 'Overlap', 0, inch(2), 'sinks each part into the one below')}
        mm={op.overlap}
        units={units}
        onChange={(v) => patchOp(op.id, { overlap: v }, 'overlap')}
      />
      <p className="note">
        {op.children.length} part{op.children.length === 1 ? '' : 's'}, bottom to top in the order they appear in the tree (top of the piece listed first). Drag rows to
        reorder.
      </p>
    </section>
  );
}

function ArrayPanel({ op }: { op: ArrayOp }) {
  const units = useDesign((s) => s.design.displayUnits);
  const patchOp = useDesign((s) => s.patchOp);
  const set = (patch: Partial<ArrayOp>, field: string) => patchOp(op.id, patch, field);
  const far = inch(48);
  return (
    <section className="panel">
      <h2>
        {op.mode === 'radial' ? 'Radial array' : 'Linear array'}
        <span className="units-tag">{units}</span>
      </h2>
      <NameInput op={op} />
      <div className="segmented" role="radiogroup" aria-label="Array kind">
        {(['radial', 'linear'] as const).map((m) => (
          <button key={m} role="radio" aria-checked={op.mode === m} className={op.mode === m ? 'on' : undefined} onClick={() => set({ mode: m }, 'mode')}>
            {m === 'radial' ? 'Radial' : 'Linear'}
          </button>
        ))}
      </div>
      <Slider label="Count" min={1} max={48} step={1} value={op.count} display={String(op.count)} onChange={(v) => set({ count: v }, 'count')} />
      {op.mode === 'radial' ? (
        <>
          <Slider
            label="Sweep"
            hint="360° spaces them evenly"
            min={10}
            max={360}
            step={5}
            value={op.angle}
            display={`${op.angle}°`}
            onChange={(v) => set({ angle: v }, 'angle')}
          />
          {(['X', 'Z'] as const).map((axis, i) => (
            <LengthField
              key={axis}
              spec={span(`c${axis}`, `Axis ${axis}`, -far, far, i === 0 ? 'copies spin around this vertical line' : undefined)}
              mm={op.center[i]}
              units={units}
              onChange={(v) => set({ center: (i === 0 ? [v, op.center[1]] : [op.center[0], v]) as [number, number] }, `center${i}`)}
            />
          ))}
        </>
      ) : (
        (['X', 'Y', 'Z'] as const).map((axis, i) => (
          <LengthField
            key={axis}
            spec={span(`s${axis}`, `Step ${axis}`, -far, far, i === 0 ? 'from one copy to the next' : undefined)}
            mm={op.step[i]}
            units={units}
            onChange={(v) => set({ step: op.step.map((s, j) => (j === i ? v : s)) as Vec3 }, `step${i}`)}
          />
        ))
      )}
    </section>
  );
}

/** Exact numbers for where a part or stack sits; the gizmo in the view edits the same values. */
function PlacementPanel({ op }: { op: PrimitiveOp | StackOp }) {
  const units = useDesign((s) => s.design.displayUnits);
  const ops = useDesign((s) => s.design.ops);
  const setTransform = useDesign((s) => s.setTransform);
  const { bodies } = useEvaluation();
  const stack = placedByStack(ops, op.id);
  const t = op.transform;
  const far = inch(48);
  const set = (patch: Partial<Transform>, field: string) => setTransform(op.id, { ...t, ...patch }, `xform:${op.id}:${field}`);
  const bounds = unionBounds(bodiesOf(bodies, op.id));
  const nudge = (d: Vec3) => set({ position: t.position.map((v, i) => v + d[i]) as Vec3 }, 'nudge');

  return (
    <section className="panel">
      <h2>
        Placement
        <span className="units-tag">{units}</span>
      </h2>
      {stack ? (
        <p className="note flush">{stack.label} decides where this sits. Rotation and size below still apply.</p>
      ) : (
        <>
          {(['X', 'Y', 'Z'] as const).map((axis, i) => (
            <LengthField
              key={axis}
              spec={span(`p${axis}`, axis === 'Y' ? 'Y (height off floor)' : axis, axis === 'Y' ? -far / 4 : -far, far)}
              mm={t.position[i]}
              units={units}
              onChange={(v) => set({ position: t.position.map((p, j) => (j === i ? v : p)) as Vec3 }, `p${i}`)}
            />
          ))}
          <div className="button-row">
            <button className="btn small" disabled={bounds.isEmpty()} onClick={() => nudge([0, -bounds.min.y, 0])} title="Rest the lowest point on the floor">
              Drop to floor
            </button>
            <button
              className="btn small"
              disabled={bounds.isEmpty()}
              onClick={() => nudge([-(bounds.min.x + bounds.max.x) / 2, 0, -(bounds.min.z + bounds.max.z) / 2])}
              title="Center on the vertical axis at the middle of the grid"
            >
              Center on axis
            </button>
          </div>
        </>
      )}
      {(['X', 'Y', 'Z'] as const).map((axis, i) => (
        <Slider
          key={axis}
          label={`Tilt ${axis}`}
          hint={axis === 'Y' ? 'spin' : undefined}
          min={-180}
          max={180}
          step={1}
          value={Math.round((t.rotation[i] * 180) / Math.PI)}
          display={`${Math.round((t.rotation[i] * 180) / Math.PI)}°`}
          onChange={(deg) => set({ rotation: t.rotation.map((r, j) => (j === i ? (deg * Math.PI) / 180 : r)) as Vec3 }, `r${i}`)}
        />
      ))}
      <Slider
        label="Scale"
        hint="uniform"
        min={0.1}
        max={4}
        step={0.01}
        value={t.scale[1]}
        display={`${t.scale[1].toFixed(2)}×`}
        onChange={(v) => set({ scale: [v, v, v] }, 'scale')}
      />
    </section>
  );
}

/** Holding a slider is a drag too: melts preview coarse until it's let go. */
const draftWhileHeld = {
  onPointerDown: () => useDesign.setState({ dragging: true }),
  onPointerUp: endDrag,
  onBlur: endDrag,
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Typed value and slider stay in sync; typing accepts fractions and unit suffixes. */
function LengthField({ spec, mm, units, onChange }: { spec: ParamSpec; mm: number; units: Units; onChange: (mm: number) => void }) {
  const [text, setText] = useState(formatInput(mm, units));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(formatInput(mm, units));
  }, [mm, units, editing]);

  const commit = () => {
    setEditing(false);
    const parsed = parseLength(text, units);
    if (parsed === null) setText(formatInput(mm, units));
    else onChange(clamp(parsed, spec.min, spec.max));
  };

  return (
    <div className="field">
      <label htmlFor={`f-${spec.key}`}>
        {spec.label}
        {spec.hint && <span className="hint">{spec.hint}</span>}
      </label>
      <div className="field-row">
        <input
          type="range"
          {...draftWhileHeld}
          min={toDisplay(spec.min, units)}
          max={toDisplay(spec.max, units)}
          step={sliderStep(units)}
          value={toDisplay(mm, units)}
          onChange={(e) => onChange(fromDisplay(Number(e.target.value), units))}
          aria-label={`${spec.label} slider`}
        />
        <input
          id={`f-${spec.key}`}
          className="num"
          value={text}
          onFocus={(e) => {
            setEditing(true);
            e.target.select();
          }}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setText(formatInput(mm, units));
              setEditing(false);
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
      </div>
    </div>
  );
}

function RatioField({ spec, value, onChange }: { spec: ParamSpec; value: number; onChange: (v: number) => void }) {
  return (
    <Slider
      label={spec.label}
      hint={spec.hint}
      min={spec.min}
      max={spec.max}
      step={spec.step ?? (spec.kind === 'count' ? 1 : 0.01)}
      value={value}
      onChange={onChange}
      display={`${spec.kind === 'count' || (spec.step ?? 0.01) >= 1 ? Math.round(value) : value.toFixed(2)}${spec.suffix ?? ''}`}
    />
  );
}

function Slider(props: {
  label: string;
  hint?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  display: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="field">
      <label>
        {props.label}
        {props.hint && <span className="hint">{props.hint}</span>}
      </label>
      <div className="field-row">
        <input
          type="range"
          {...draftWhileHeld}
          min={props.min}
          max={props.max}
          step={props.step}
          value={props.value}
          onChange={(e) => props.onChange(Number(e.target.value))}
          aria-label={props.label}
        />
        <output className="num">{props.display}</output>
      </div>
    </div>
  );
}

const EFFECTS: { effect: GlassEffect; label: string; hint: string }[] = [
  { effect: 'none', label: 'Plain', hint: '' },
  { effect: 'optic', label: 'Optic', hint: 'ribs from an optic mold' },
  { effect: 'twist', label: 'Twist', hint: 'optic ribs, twisted as it was pulled' },
  { effect: 'frit', label: 'Frit', hint: 'chips of color picked up on the gather' },
  { effect: 'frosted', label: 'Frosted', hint: 'sandblasted or acid-etched' },
  { effect: 'iridescent', label: 'Iridescent', hint: 'fumed or carnival sheen' },
];

/** The surface treatment. Optic, twist and frit are drawn by the shader, not modelled. */
function EffectControls({ material, set }: { material: GlassMaterial; set: (patch: Partial<GlassMaterial>) => void }) {
  const effect = material.effect ?? 'none';
  const info = EFFECTS.find((e) => e.effect === effect)!;
  return (
    <div className="effects">
      <div className="field">
        <label>
          Finish
          {info.hint && <span className="hint">{info.hint}</span>}
        </label>
        <div className="chips" role="radiogroup" aria-label="Surface finish">
          {EFFECTS.map((e) => (
            <button key={e.effect} role="radio" aria-checked={effect === e.effect} className={`chip${effect === e.effect ? ' on' : ''}`} onClick={() => set({ effect: e.effect })}>
              {e.label}
            </button>
          ))}
        </div>
      </div>
      {(effect === 'optic' || effect === 'twist') && (
        <Slider label="Ribs" min={4} max={48} step={1} value={material.ribs ?? 12} display={String(material.ribs ?? 12)} onChange={(v) => set({ ribs: v })} />
      )}
      {effect === 'twist' && (
        <Slider label="Twist" hint="per inch of height" min={-180} max={180} step={5} value={material.twist ?? 45} display={`${material.twist ?? 45}°`} onChange={(v) => set({ twist: v })} />
      )}
      {effect === 'frit' && (
        <>
          <div className="field">
            <label htmlFor="frit-color">Frit color</label>
            <input id="frit-color" type="color" value={material.fritColor ?? '#f4f1ea'} onChange={(e) => set({ fritColor: e.target.value })} />
          </div>
          <Slider
            label="Coverage"
            min={0.05}
            max={0.9}
            step={0.01}
            value={material.fritAmount ?? 0.3}
            display={`${Math.round((material.fritAmount ?? 0.3) * 100)}%`}
            onChange={(v) => set({ fritAmount: v })}
          />
          <Slider label="Chip size" hint="mm" min={0.5} max={12} step={0.5} value={material.fritSize ?? 3} display={`${material.fritSize ?? 3}`} onChange={(v) => set({ fritSize: v })} />
        </>
      )}
    </div>
  );
}

function MaterialPanel({ material }: { material: GlassMaterial }) {
  const setMaterial = useDesign((s) => s.setMaterial);
  const set = (patch: Partial<GlassMaterial>) => setMaterial(material.id, patch);

  return (
    <section className="panel">
      <h2>Glass</h2>
      <div className="swatches">
        {GLASS_SWATCHES.map((sw) => (
          <button
            key={sw.name}
            className={`swatch ${sw.finish}${material.color === sw.color ? ' on' : ''}`}
            style={{ background: sw.color }}
            title={`${sw.name}${sw.finish === 'opaque' ? ' (opaque)' : ''}`}
            aria-label={sw.name}
            onClick={() => set({ name: sw.name, color: sw.color, finish: sw.finish })}
          />
        ))}
        <label className="swatch custom" title="Custom color">
          <input type="color" value={material.color} onChange={(e) => set({ color: e.target.value, name: 'Custom' })} />
        </label>
      </div>
      <div className="segmented" role="radiogroup" aria-label="Finish">
        {(['transparent', 'opaque'] as const).map((f) => (
          <button key={f} role="radio" aria-checked={material.finish === f} className={material.finish === f ? 'on' : undefined} onClick={() => set({ finish: f })}>
            {f === 'transparent' ? 'Transparent' : 'Opaque'}
          </button>
        ))}
      </div>
      {material.finish === 'transparent' && (
        <Slider
          label="Color density"
          hint="how dark thick glass gets"
          min={0}
          max={1}
          step={0.01}
          value={material.colorDensity}
          display={`${Math.round(material.colorDensity * 100)}%`}
          onChange={(v) => set({ colorDensity: v })}
        />
      )}
      <Slider
        label="Surface"
        hint="polished → frosted"
        min={0}
        max={1}
        step={0.01}
        value={material.roughness}
        display={material.roughness.toFixed(2)}
        onChange={(v) => set({ roughness: v })}
      />
      <Slider label="IOR" min={1.4} max={1.7} step={0.005} value={material.ior} display={material.ior.toFixed(3)} onChange={(v) => set({ ior: v })} />
      <EffectControls material={material} set={set} />
    </section>
  );
}
