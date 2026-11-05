import * as THREE from 'three';
import { unionBounds } from '../engine/evaluate';
import { weightGrams } from '../geometry/measure';
import { formatLength, formatVolume, formatWeight } from '../model/units';
import { useDesign } from '../store/designStore';
import { useEvaluation } from '../store/useEvaluation';
import { shopRows } from '../engine/shop';
import { useState } from 'react';
import { ShopSheet } from './ShopSheet';

export function ShopPanel() {
  const { bodies } = useEvaluation();
  const ops = useDesign((s) => s.design.ops);
  const units = useDesign((s) => s.design.displayUnits);
  const density = useDesign((s) => s.design.density_g_cm3);
  const setDensity = useDesign((s) => s.setDensity);
  const select = useDesign((s) => s.select);

  const size = unionBounds(bodies).getSize(new THREE.Vector3());
  const totalVolume = bodies.reduce((sum, b) => sum + b.volume_mm3, 0);
  const rows = shopRows(ops, bodies);
  const [sheet, setSheet] = useState(false);

  return (
    <>
    <section className="panel shop">
      <h2>Shop info</h2>
      {bodies.length === 0 ? (
        <p className="empty">Nothing on the bench yet.</p>
      ) : (
        <>
          <dl className="overall">
            <div>
              <dt>W</dt>
              <dd>{formatLength(size.x, units)}</dd>
            </div>
            <div>
              <dt>D</dt>
              <dd>{formatLength(size.z, units)}</dd>
            </div>
            <div>
              <dt>H</dt>
              <dd>{formatLength(size.y, units)}</dd>
            </div>
          </dl>
          <table className="parts-table">
            <thead>
              <tr>
                <th>Part</th>
                <th>Volume</th>
                <th>Weight</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.op.id} onClick={() => select(r.op.id)}>
                  <td>
                    {r.op.label}
                    {r.qty > 1 && <span className="qty"> ×{r.qty}</span>}
                  </td>
                  <td>{formatVolume(r.volume_mm3)}</td>
                  <td>{formatWeight(weightGrams(r.volume_mm3, density), units)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td>{formatVolume(totalVolume)}</td>
                <td>{formatWeight(weightGrams(totalVolume, density), units)}</td>
              </tr>
            </tfoot>
          </table>
        </>
      )}
      <div className="density">
        <label htmlFor="density">Density</label>
        <input
          id="density"
          type="number"
          className="num"
          min={2}
          max={4}
          step={0.05}
          value={density}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (v >= 1 && v <= 6) setDensity(v);
          }}
        />
        <span>g/cm³</span>
      </div>
      <p className="note">
        Estimates. Separate parts that overlap are counted twice; Union them to count the shared glass once.
      </p>
      <button className="btn small draw-btn sheet-btn" disabled={!bodies.length} onClick={() => setSheet(true)}>
        Shop sheet…
      </button>
      {sheet && <ShopSheet onClose={() => setSheet(false)} />}
    </section>
    <NotesPanel />
    </>
  );
}

/** A to-do list for the piece: color to pull, parts to make ahead, things to try. */
function NotesPanel() {
  const notes = useDesign((s) => s.design.shop.notes);
  const { addNote, updateNote, removeNote } = useDesign.getState();
  const [draft, setDraft] = useState('');
  const add = () => {
    if (draft.trim()) addNote(draft.trim());
    setDraft('');
  };
  return (
    <section className="panel">
      <h2>Notes</h2>
      <ul className="notes">
        {notes.map((n) => (
          <li key={n.id} className={n.done ? 'done' : undefined}>
            <input type="checkbox" checked={n.done} onChange={(e) => updateNote(n.id, { done: e.target.checked })} aria-label={`Done: ${n.text}`} />
            <input className="note-text" value={n.text} onChange={(e) => updateNote(n.id, { text: e.target.value })} aria-label="Note" />
            <button className="icon-btn" onClick={() => removeNote(n.id)} aria-label={`Remove ${n.text}`}>
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="note-add">
        <input
          className="name-input"
          value={draft}
          placeholder="Pull 2 lb cobalt cane…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          aria-label="New note"
        />
        <button className="btn small" onClick={add} disabled={!draft.trim()}>
          Add
        </button>
      </div>
    </section>
  );
}
