import { getMode, MODES } from '../modes/registry';
import { mashMembers, selectPiece, useScene, type Background } from '../scene/store';
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
  const s = useScene();
  const members = mashMembers(s.pieces);
  const inMash = !!piece && members.some((m) => m.id === piece.id);
  // Melted pieces are one piece of glass, so their colour lives on the first of them.
  const glassOwner = inMash ? members[0] : piece;

  return (
    <aside className="inspector">
      {piece && <ShapeSection />}

      {members.length > 0 && (
        <section>
          <h2>Melt</h2>
          <Slider label="Gooeyness" min={0} max={0.6} step={0.01} value={s.blend} onChange={s.setBlend} />
          <p className="blurb">Low keeps a crisp seam. High slumps the pieces together like hot glass.</p>
        </section>
      )}

      {glassOwner && <GlassSection ownerId={glassOwner.id} />}

      <section>
        <h2>Background</h2>
        <div className="seg">
          {(['black', 'white', 'gallery'] as Background[]).map((b) => (
            <button key={b} className={s.background === b ? 'on' : ''} onClick={() => s.setBackground(b)}>
              {b[0].toUpperCase() + b.slice(1)}
            </button>
          ))}
        </div>
        <button className={`toggle ${s.turntable ? 'on' : ''}`} onClick={s.toggleTurntable}>
          {s.turntable ? 'Stop spinning' : 'Spin on turntable'}
        </button>
      </section>
    </aside>
  );
}

function ShapeSection() {
  const piece = useScene(selectPiece)!;
  const { setMode, setParam } = useScene.getState();
  const mode = getMode(piece.mode);
  const values = piece.params[piece.mode] ?? {};
  return (
    <section>
      <h2>Shape</h2>
      {/* Mode tabs appear once there is more than one mode to choose from. */}
      {MODES.length > 1 && (
        <div className="modes">
          {MODES.map((m) => (
            <button key={m.id} className={m.id === piece.mode ? 'on' : ''} onClick={() => setMode(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
      )}
      {mode.params
        .filter((ps) => ps.key !== 'detail')
        .map((ps) => (
          <Slider key={ps.key} label={ps.label} min={ps.min} max={ps.max} step={ps.step} value={values[ps.key] ?? ps.default} onChange={(v) => setParam(ps.key, v)} />
        ))}
    </section>
  );
}

function GlassSection({ ownerId }: { ownerId: string }) {
  const g = useScene((s) => s.pieces.find((p) => p.id === ownerId)!.glass);
  const { checkpoint } = useScene.getState();
  const setGlass = (patch: Parameters<ReturnType<typeof useScene.getState>['setGlass']>[0]) =>
    useScene.getState().setGlass(patch, ownerId);
  const pick = (patch: Parameters<typeof setGlass>[0]) => {
    checkpoint();
    setGlass(patch);
  };

  return (
    <section>
      <h2>Glass</h2>
      <div className="swatches">
        {SWATCHES.map((sw) => (
          <button
            key={sw.hex}
            title={sw.name}
            aria-label={sw.name}
            className={g.tint === sw.hex ? 'on' : ''}
            style={{ background: sw.hex }}
            onClick={() => pick({ tint: sw.hex })}
          />
        ))}
        <label className="swatch-custom" title="Any colour">
          <input type="color" value={g.tint} onPointerDown={checkpoint} onChange={(e) => setGlass({ tint: e.target.value })} />
        </label>
      </div>
      <Slider label="Frost" min={0} max={0.6} step={0.01} value={g.roughness} onChange={(v) => setGlass({ roughness: v })} />
      <div className="seg">
        <button className={!g.opaque ? 'on' : ''} onClick={() => pick({ opaque: false })}>
          See-through
        </button>
        <button className={g.opaque ? 'on' : ''} onClick={() => pick({ opaque: true })}>
          Opaque
        </button>
      </div>
      <details className="more">
        <summary>More glass</summary>
        <Slider label="Colour depth" min={0} max={1} step={0.01} value={g.density} onChange={(v) => setGlass({ density: v })} />
        <Slider label="Refraction" min={0} max={3} step={0.01} value={g.thickness} onChange={(v) => setGlass({ thickness: v })} />
      </details>
    </section>
  );
}
