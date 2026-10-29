import { useEffect, useMemo, useRef, useState } from 'react';
import type { CustomShape } from '../model/types';
import { formatLength, MM_PER_CM, MM_PER_IN } from '../model/units';
import { drawnPoints, revolveProfile } from '../presets/custom';
import type { Vec2 } from '../geometry/profile';
import { useDesign } from '../store/designStore';

const MODES: { mode: CustomShape['mode']; label: string; hint: string }[] = [
  { mode: 'revolve', label: 'Revolve', hint: 'Draw half the outline, right of the dashed axis. It spins round the axis like a turned or blown form.' },
  { mode: 'extrude', label: 'Extrude', hint: 'Draw a closed outline. It becomes a flat slab, like a cut sheet or a cast bar.' },
  { mode: 'inflate', label: 'Inflate', hint: 'Draw a closed outline. It puffs up like a pillow: thick in the middle, rounding to the edge.' },
];

const ZOOMS = [4, 8, 16, 32]; // inches across the drawing area

/**
 * Draw a part by placing points on a grid. Click empty space to add a point to the end
 * of the line, drag points to move them, double-click (or ⌥-click) one to remove it.
 */
export function DrawingEditor() {
  const editor = useDesign((s) => s.editor)!;
  const units = useDesign((s) => s.design.displayUnits);
  const { closeEditor, saveEditor } = useDesign.getState();
  const [mode, setMode] = useState(editor.shape.mode);
  const [points, setPoints] = useState<Vec2[]>(editor.shape.points);
  const [smooth, setSmooth] = useState(editor.shape.smooth);
  const [name, setName] = useState(editor.name);
  const [snap, setSnap] = useState(true);
  const [zoom, setZoom] = useState(() => fitZoom(editor.shape.points));
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef<number | null>(null);

  const span = zoom * MM_PER_IN;
  const x0 = mode === 'revolve' ? -span * 0.08 : -span / 2;
  const y0 = -span * 0.06;
  const grid = units === 'in' ? MM_PER_IN / 4 : 5;
  const major = units === 'in' ? MM_PER_IN : MM_PER_CM;
  const snapStep = units === 'in' ? MM_PER_IN / 16 : 1;
  const shape: CustomShape = { mode, points, smooth };
  const closed = mode !== 'revolve';

  // What the part will actually be: smoothed, and for revolve, closed to the axis.
  const preview = useMemo(() => {
    if (points.length < (closed ? 3 : 2)) return null;
    const pts = drawnPoints({ mode, points, smooth });
    return mode === 'revolve' ? revolveProfile(pts) : pts;
  }, [mode, points, smooth, closed]);

  const size = useMemo(() => {
    if (!preview) return null;
    const xs = preview.map((p) => p[0]);
    const ys = preview.map((p) => p[1]);
    const w = mode === 'revolve' ? 2 * Math.max(...xs) : Math.max(...xs) - Math.min(...xs);
    return { w, h: Math.max(...ys) - Math.min(...ys) };
  }, [preview, mode]);

  const toWorld = (e: React.PointerEvent | PointerEvent): Vec2 => {
    const svg = svgRef.current!;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM()!.inverse());
    let x = pt.x;
    let y = -pt.y;
    if (snap) {
      x = Math.round(x / snapStep) * snapStep;
      y = Math.round(y / snapStep) * snapStep;
    }
    return [mode === 'revolve' ? Math.max(0, x) : x, y];
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const i = dragging.current;
      if (i === null) return;
      const p = toWorld(e);
      setPoints((pts) => pts.map((q, j) => (j === i ? p : q)));
    };
    const up = () => void (dragging.current = null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  });

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input')) return;
      if (e.key === 'Escape') closeEditor();
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        setPoints((pts) => pts.slice(0, -1));
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [closeEditor]);

  const remove = (i: number) => setPoints((pts) => pts.filter((_, j) => j !== i));
  const minPoints = closed ? 3 : 2;
  const ready = points.length >= minPoints;
  const forOp = editor.target.kind === 'op';
  const toPath = (pts: Vec2[], close: boolean) => `M${pts.map(([x, y]) => `${x.toFixed(2)},${(-y).toFixed(2)}`).join(' L')}${close ? ' Z' : ''}`;

  const lines: React.ReactNode[] = [];
  for (let x = Math.ceil(x0 / grid) * grid; x <= x0 + span; x += grid) {
    const isMajor = Math.abs(x / major - Math.round(x / major)) < 1e-6;
    lines.push(<line key={`x${x}`} x1={x} x2={x} y1={-(y0 + span)} y2={-y0} className={isMajor ? 'grid-major' : 'grid-minor'} />);
  }
  for (let y = Math.ceil(y0 / grid) * grid; y <= y0 + span; y += grid) {
    const isMajor = Math.abs(y / major - Math.round(y / major)) < 1e-6;
    lines.push(<line key={`y${y}`} x1={x0} x2={x0 + span} y1={-y} y2={-y} className={isMajor ? 'grid-major' : 'grid-minor'} />);
  }

  return (
    <div className="editor-backdrop" role="dialog" aria-modal="true" aria-label="Draw a part">
      <div className="editor">
        <header className="editor-head">
          <input className="name-input" value={name} onChange={(e) => setName(e.target.value)} aria-label="Part name" />
          <div className="segmented" role="radiogroup" aria-label="How the drawing becomes 3D">
            {MODES.map((m) => (
              <button key={m.mode} role="radio" aria-checked={mode === m.mode} className={mode === m.mode ? 'on' : undefined} onClick={() => setMode(m.mode)}>
                {m.label}
              </button>
            ))}
          </div>
        </header>
        <p className="note flush">{MODES.find((m) => m.mode === mode)!.hint}</p>
        <svg
          ref={svgRef}
          className="drawing"
          viewBox={`${x0} ${-(y0 + span)} ${span} ${span}`}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            setPoints((pts) => [...pts, toWorld(e)]);
            dragging.current = points.length;
          }}
        >
          {lines}
          <line x1={x0} x2={x0 + span} y1={0} y2={0} className="floor-line" />
          {mode === 'revolve' && <line x1={0} x2={0} y1={-(y0 + span)} y2={-y0} className="axis-line" />}
          {preview && mode === 'revolve' && (
            <path d={toPath([...preview, ...[...preview].reverse().map(([x, y]): Vec2 => [-x, y])], true)} className="shape-ghost" />
          )}
          {preview && <path d={toPath(preview, closed || mode === 'revolve')} className="shape-fill" />}
          {points.length > 1 && <path d={toPath(points, closed)} className="shape-line" />}
          {points.map(([x, y], i) => (
            <circle
              key={i}
              cx={x}
              cy={-y}
              r={span / 120}
              className={i === points.length - 1 ? 'pt last' : 'pt'}
              onPointerDown={(e) => {
                e.stopPropagation();
                if (e.altKey) return remove(i);
                dragging.current = i;
              }}
              onDoubleClick={() => remove(i)}
            >
              <title>{`Point ${i + 1}: drag to move, double-click to remove`}</title>
            </circle>
          ))}
        </svg>
        <div className="editor-tools">
          <label className="snap-toggle">
            <input type="checkbox" checked={smooth} onChange={(e) => setSmooth(e.target.checked)} />
            Smooth curve
          </label>
          <label className="snap-toggle" title={`Snap points to ${units === 'in' ? '1/16 in' : '1 mm'}`}>
            <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} />
            Snap
          </label>
          <label className="snap-toggle">
            View
            <select value={zoom} onChange={(e) => setZoom(Number(e.target.value))} aria-label="Drawing area size">
              {ZOOMS.map((z) => (
                <option key={z} value={z}>
                  {units === 'in' ? `${z}"` : `${Math.round(z * 2.54)} cm`} across
                </option>
              ))}
            </select>
          </label>
          <button className="btn small" disabled={!points.length} onClick={() => setPoints((p) => p.slice(0, -1))} title="Remove the last point (⌫)">
            Undo point
          </button>
          <button className="btn small" disabled={!points.length} onClick={() => setPoints([])}>
            Clear
          </button>
          <span className="editor-size">
            {size ? `${formatLength(size.w, units)} wide × ${formatLength(size.h, units)} tall` : `${minPoints - points.length} more point${minPoints - points.length === 1 ? '' : 's'} to go`}
          </span>
        </div>
        <footer className="editor-foot">
          <button className="btn" onClick={closeEditor}>
            Cancel
          </button>
          {forOp ? (
            <button className="btn primary" disabled={!ready} onClick={() => saveEditor(shape, name, false)}>
              Apply to part
            </button>
          ) : (
            <>
              <button className="btn" disabled={!ready} onClick={() => saveEditor(shape, name, false)}>
                Save to My Parts
              </button>
              <button className="btn primary" disabled={!ready} onClick={() => saveEditor(shape, name, true)}>
                Save and add to design
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}

/** The smallest drawing area that shows the whole drawing with some room to spare. */
function fitZoom(points: Vec2[]): number {
  const extent = Math.max(0, ...points.map(([x, y]) => Math.max(Math.abs(x) * 2, y))) / MM_PER_IN;
  return ZOOMS.find((z) => z >= extent * 1.3) ?? ZOOMS[ZOOMS.length - 1];
}
