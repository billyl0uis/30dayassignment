import { getMode, MODES, PLANNED } from '../modes/registry';
import { selectPiece, useScene, type Background } from '../scene/store';
import { Slider } from './Slider';

const SWATCHES: { name: string; hex: string }[] = [
  { name: 'Clear', hex: '#e8eef0' },
  { name: 'Steel blue', hex: '#7fb8c9' },
  { name: 'Cobalt', hex: '#2446c8' },
  { name: 'Amber', hex: '#c9821f' },
  { name: 'Oxblood', hex: '#7a1420' },
  { name: 'Uranium', hex: '#9fe03a' },
  { name: 'Bone', hex: '#e7dcc3' },
  { name: 'Smoke', hex: '#2b2a2c' },
];

export function Inspector() {
  const piece = useScene(selectPiece);
  const { setMode, setParam, setGlass, checkpoint, background, setBackground, turntable, toggleTurntable } = useScene();
  const mode = getMode(piece.mode);
  const values = piece.params[piece.mode] ?? {};
  const g = piece.glass;

  return (
    <aside className="inspector">
      <section>
        <h2>Form</h2>
        <div className="modes">
          {MODES.map((m) => (
            <button key={m.id} className={m.id === piece.mode ? 'on' : ''} onClick={() => setMode(m.id)}>
              {m.label}
            </button>
          ))}
          {PLANNED.map((m) => (
            <button key={m.id} disabled title="Coming in a later step">
              {m.label}
            </button>
          ))}
        </div>
        <p className="blurb">{mode.blurb}</p>
        {mode.params.map((ps) => (
          <Slider key={ps.key} label={ps.label} min={ps.min} max={ps.max} step={ps.step} value={values[ps.key] ?? ps.default} onChange={(v) => setParam(ps.key, v)} />
        ))}
      </section>

      <section>
        <h2>Glass</h2>
        <div className="swatches">
          {SWATCHES.map((s) => (
            <button
              key={s.hex}
              title={s.name}
              aria-label={s.name}
              className={g.tint === s.hex ? 'on' : ''}
              style={{ background: s.hex }}
              onClick={() => {
                checkpoint();
                setGlass({ tint: s.hex });
              }}
            />
          ))}
          <label className="swatch-custom" title="Custom colour">
            <input type="color" value={g.tint} onPointerDown={checkpoint} onChange={(e) => setGlass({ tint: e.target.value })} />
          </label>
        </div>
        <Slider label="Colour depth" min={0} max={1} step={0.01} value={g.density} onChange={(v) => setGlass({ density: v })} />
        <Slider label="Frost" min={0} max={0.6} step={0.01} value={g.roughness} onChange={(v) => setGlass({ roughness: v })} />
        <Slider label="Refraction" min={0} max={3} step={0.01} value={g.thickness} onChange={(v) => setGlass({ thickness: v })} />
        <div className="seg">
          <button
            className={!g.opaque ? 'on' : ''}
            onClick={() => {
              checkpoint();
              setGlass({ opaque: false });
            }}
          >
            Transparent
          </button>
          <button
            className={g.opaque ? 'on' : ''}
            onClick={() => {
              checkpoint();
              setGlass({ opaque: true });
            }}
          >
            Opaque
          </button>
        </div>
      </section>

      <section>
        <h2>View</h2>
        <div className="seg">
          {(['black', 'white', 'gallery'] as Background[]).map((b) => (
            <button key={b} className={background === b ? 'on' : ''} onClick={() => setBackground(b)}>
              {b[0].toUpperCase() + b.slice(1)}
            </button>
          ))}
        </div>
        <button className={`toggle ${turntable ? 'on' : ''}`} onClick={toggleTurntable}>
          {turntable ? 'Stop turntable' : 'Turntable spin'}
        </button>
      </section>
    </aside>
  );
}
