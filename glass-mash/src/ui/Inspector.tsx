import { getMode, MODES, PLANNED } from '../modes/registry';
import { mashMembers, selectPiece, useScene, type Background, type Gizmo, type JoinMode } from '../scene/store';
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

const JOINS: { id: JoinMode; label: string; tip: string }[] = [
  { id: 'melt', label: 'Melt', tip: 'Fuse into the mash' },
  { id: 'carve', label: 'Carve', tip: 'Cut this shape out of the mash' },
  { id: 'intersect', label: 'Overlap', tip: 'Keep only where this overlaps the mash' },
  { id: 'solo', label: 'Solo', tip: 'Keep separate' },
];

const GIZMOS: { id: Gizmo; label: string; key: string }[] = [
  { id: 'translate', label: 'Move', key: 'W' },
  { id: 'rotate', label: 'Turn', key: 'E' },
  { id: 'scale', label: 'Size', key: 'R' },
];

export function Inspector() {
  const piece = useScene(selectPiece);
  const s = useScene();
  const mode = getMode(piece.mode);
  const values = piece.params[piece.mode] ?? {};
  const members = mashMembers(s.pieces);
  const inMash = members.some((m) => m.id === piece.id);
  // The mash is one piece of glass, so its colour lives on its first melted piece.
  const glassOwner = inMash ? members[0] : piece;
  const g = glassOwner.glass;
  const setGlass = (patch: Parameters<typeof s.setGlass>[0]) => s.setGlass(patch, glassOwner.id);

  return (
    <aside className="inspector">
      <section>
        <h2>Pieces</h2>
        <ul className="pieces">
          {s.pieces.map((p) => (
            <li key={p.id}>
              <button className={p.id === piece.id ? 'on' : ''} onClick={() => s.select(p.id)}>
                <span>{p.name}</span>
                <small>{p.drawing ? JOINS.find((j) => j.id === p.join)!.label : 'empty'}</small>
              </button>
            </li>
          ))}
        </ul>
        <div className="seg">
          <button onClick={s.addPiece} title="Start a new piece, then draw it on the page (N)">
            + New
          </button>
          <button onClick={s.duplicatePiece} disabled={!piece.drawing} title="Copy this piece">
            Duplicate
          </button>
          <button onClick={s.deletePiece} title="Delete this piece">
            Delete
          </button>
        </div>
        <div className="seg">
          {JOINS.map((j) => (
            <button key={j.id} className={piece.join === j.id ? 'on' : ''} title={j.tip} onClick={() => s.setJoin(j.id)}>
              {j.label}
            </button>
          ))}
        </div>
        <div className="seg">
          {GIZMOS.map((m) => (
            <button key={m.id} className={s.gizmo === m.id ? 'on' : ''} title={`${m.label} (${m.key})`} onClick={() => s.setGizmo(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
      </section>

      {members.length > 0 && (
        <section>
          <h2>Mash</h2>
          <Slider label="Melt" min={0} max={0.6} step={0.01} value={s.blend} onChange={s.setBlend} />
          <Slider label="Mash detail" min={48} max={140} step={1} value={s.mashDetail} onChange={s.setMashDetail} />
          <p className="blurb">0 is a hard seam; higher slumps the pieces together like hot glass.</p>
        </section>
      )}

      <section>
        <h2>Form</h2>
        <div className="modes">
          {MODES.map((m) => (
            <button key={m.id} className={m.id === piece.mode ? 'on' : ''} onClick={() => s.setMode(m.id)}>
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
          <Slider key={ps.key} label={ps.label} min={ps.min} max={ps.max} step={ps.step} value={values[ps.key] ?? ps.default} onChange={(v) => s.setParam(ps.key, v)} />
        ))}
      </section>

      <section>
        <h2>{inMash ? 'Glass (whole mash)' : 'Glass'}</h2>
        <div className="swatches">
          {SWATCHES.map((sw) => (
            <button
              key={sw.hex}
              title={sw.name}
              aria-label={sw.name}
              className={g.tint === sw.hex ? 'on' : ''}
              style={{ background: sw.hex }}
              onClick={() => {
                s.checkpoint();
                setGlass({ tint: sw.hex });
              }}
            />
          ))}
          <label className="swatch-custom" title="Custom colour">
            <input type="color" value={g.tint} onPointerDown={s.checkpoint} onChange={(e) => setGlass({ tint: e.target.value })} />
          </label>
        </div>
        <Slider label="Colour depth" min={0} max={1} step={0.01} value={g.density} onChange={(v) => setGlass({ density: v })} />
        <Slider label="Frost" min={0} max={0.6} step={0.01} value={g.roughness} onChange={(v) => setGlass({ roughness: v })} />
        <Slider label="Refraction" min={0} max={3} step={0.01} value={g.thickness} onChange={(v) => setGlass({ thickness: v })} />
        <div className="seg">
          {[false, true].map((opaque) => (
            <button
              key={String(opaque)}
              className={g.opaque === opaque ? 'on' : ''}
              onClick={() => {
                s.checkpoint();
                setGlass({ opaque });
              }}
            >
              {opaque ? 'Opaque' : 'Transparent'}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>View</h2>
        <div className="seg">
          {(['black', 'white', 'gallery'] as Background[]).map((b) => (
            <button key={b} className={s.background === b ? 'on' : ''} onClick={() => s.setBackground(b)}>
              {b[0].toUpperCase() + b.slice(1)}
            </button>
          ))}
        </div>
        <button className={`toggle ${s.turntable ? 'on' : ''}`} onClick={s.toggleTurntable}>
          {s.turntable ? 'Stop turntable' : 'Turntable spin'}
        </button>
      </section>
    </aside>
  );
}
