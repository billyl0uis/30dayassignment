import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';
import { unionBounds } from '../engine/evaluate';
import { shopRows } from '../engine/shop';
import { weightGrams } from '../geometry/measure';
import { formatLength, formatVolume, formatWeight } from '../model/units';
import type { Units } from '../model/types';
import { getPreset } from '../presets/registry';
import { renderOrthoViews, type OrthoView } from '../files/orthoViews';
import { useDesign } from '../store/designStore';
import { useEvaluation } from '../store/useEvaluation';

/**
 * A printable page for the bench: three measured views, the parts with their glass
 * and sizes, weight estimates and the notes checklist. Print hides everything else.
 */
export function ShopSheet({ onClose }: { onClose: () => void }) {
  const design = useDesign((s) => s.design);
  const { bodies } = useEvaluation();
  const units = design.displayUnits;
  const [views, setViews] = useState<OrthoView[] | null>(null);
  const rows = shopRows(design.ops, bodies);
  const size = unionBounds(bodies).getSize(new THREE.Vector3());
  const total = bodies.reduce((s, b) => s + b.volume_mm3, 0);
  const today = useMemo(() => new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }), []);

  useEffect(() => {
    // Rendering takes a moment; let the sheet appear first.
    const t = setTimeout(() => setViews(renderOrthoViews(bodies)), 30);
    return () => clearTimeout(t);
  }, [bodies]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);

  return createPortal(
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label="Shop sheet">
      <div className="sheet-toolbar">
        <button className="btn primary" onClick={() => window.print()}>
          Print
        </button>
        <button className="btn" onClick={onClose}>
          Close
        </button>
      </div>
      <article className="sheet">
        <header className="sheet-head">
          <div>
            <h1>{design.name || 'Untitled piece'}</h1>
            <p>
              {today} · {units === 'in' ? 'inches' : 'centimetres'} · glass at {design.density_g_cm3} g/cm³
            </p>
          </div>
          <dl className="sheet-overall">
            <div>
              <dt>Width</dt>
              <dd>{formatLength(size.x, units)}</dd>
            </div>
            <div>
              <dt>Depth</dt>
              <dd>{formatLength(size.z, units)}</dd>
            </div>
            <div>
              <dt>Height</dt>
              <dd>{formatLength(size.y, units)}</dd>
            </div>
            <div>
              <dt>Weight</dt>
              <dd>{formatWeight(weightGrams(total, design.density_g_cm3), units)}</dd>
            </div>
          </dl>
        </header>

        <section className="sheet-views">
          {views ? views.map((v) => <ViewWithDims key={v.name} view={v} units={units} />) : <p className="sheet-wait">Drawing views…</p>}
        </section>

        <section>
          <h2>Parts</h2>
          <table className="sheet-table">
            <thead>
              <tr>
                <th>Part</th>
                <th>Glass</th>
                <th>W × D × H</th>
                <th>Qty</th>
                <th>Volume</th>
                <th>Weight</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const m = design.materials[r.materialId];
                return (
                  <tr key={r.op.id}>
                    <td>
                      {r.op.label}
                      <span className="sheet-kind">{kindOf(r.op)}</span>
                    </td>
                    <td>
                      {m && <span className="sheet-swatch" style={{ background: m.color }} />}
                      {m ? `${m.name}${m.finish === 'opaque' ? ', opaque' : ''}${m.effect && m.effect !== 'none' ? `, ${m.effect}` : ''}` : '—'}
                    </td>
                    <td>
                      {formatLength(r.size.x, units)} × {formatLength(r.size.z, units)} × {formatLength(r.size.y, units)}
                    </td>
                    <td>{r.qty}</td>
                    <td>{formatVolume(r.volume_mm3)}</td>
                    <td>{formatWeight(weightGrams(r.volume_mm3, design.density_g_cm3), units)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>Total</td>
                <td>{formatVolume(total)}</td>
                <td>{formatWeight(weightGrams(total, design.density_g_cm3), units)}</td>
              </tr>
            </tfoot>
          </table>
          <p className="sheet-small">Volumes and weights are estimates from the model. Overlapping separate parts count twice.</p>
        </section>

        {design.shop.notes.length > 0 && (
          <section>
            <h2>Notes</h2>
            <ul className="sheet-notes">
              {design.shop.notes.map((n) => (
                <li key={n.id}>
                  <span aria-hidden>{n.done ? '☑' : '☐'}</span> {n.text}
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
    </div>,
    document.body,
  );
}

function kindOf(op: { type: string; preset?: string }): string {
  if (op.type === 'primitive' && op.preset) return getPreset(op.preset).label;
  return { stack: 'Stack', array: 'Array', boolean: 'Boolean', shell: 'Shell', blend: 'Melt', deform: 'Deform' }[op.type] ?? op.type;
}

/** One view with its overall dimensions drawn on, in the view's own millimetre space. */
function ViewWithDims({ view: v, units }: { view: OrthoView; units: Units }) {
  const gap = v.size * 0.05;
  const tick = v.size * 0.012;
  const font = v.size * 0.032;
  const y = (val: number) => -val; // SVG y runs down; the view's v runs up
  const across = v.name === 'Side' ? 'D' : 'W';
  const up = v.name === 'Top' ? 'D' : 'H';
  const bottom = v.vMin - gap;
  const right = v.uMax + gap;
  return (
    <figure className="sheet-view">
      <svg viewBox={`${v.u0} ${y(v.v0 + v.size)} ${v.size} ${v.size}`} role="img" aria-label={`${v.name} view`}>
        <image href={v.url} x={v.u0} y={y(v.v0 + v.size)} width={v.size} height={v.size} />
        {v.measured && <g className="dim" strokeWidth={v.size * 0.003}>
          <line x1={v.uMin} x2={v.uMax} y1={y(bottom)} y2={y(bottom)} />
          <line x1={v.uMin} x2={v.uMin} y1={y(bottom) - tick} y2={y(bottom) + tick} />
          <line x1={v.uMax} x2={v.uMax} y1={y(bottom) - tick} y2={y(bottom) + tick} />
          <text x={(v.uMin + v.uMax) / 2} y={y(bottom) + font * 1.25} fontSize={font} textAnchor="middle">
            {across} {formatLength(v.uMax - v.uMin, units)}
          </text>
          <line x1={right} x2={right} y1={y(v.vMin)} y2={y(v.vMax)} />
          <line x1={right - tick} x2={right + tick} y1={y(v.vMin)} y2={y(v.vMin)} />
          <line x1={right - tick} x2={right + tick} y1={y(v.vMax)} y2={y(v.vMax)} />
          <text x={right + tick * 1.5} y={y((v.vMin + v.vMax) / 2)} fontSize={font} dominantBaseline="middle">
            {up} {formatLength(v.vMax - v.vMin, units)}
          </text>
        </g>}
      </svg>
      <figcaption>{v.name}</figcaption>
    </figure>
  );
}
