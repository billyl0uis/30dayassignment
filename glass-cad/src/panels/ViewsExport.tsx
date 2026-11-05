import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { unionBounds } from '../engine/evaluate';
import { renderOrthoViews } from '../files/orthoViews';
import { composeSheet, composeView } from '../files/viewSheet';
import { downloadUrl, fileStem } from '../files/download';
import { formatLength } from '../model/units';
import { captureGlassViews } from '../viewport/CameraRig';
import { useDesign } from '../store/designStore';
import { useEvaluation } from '../store/useEvaluation';

type Style = 'glass' | 'line';
type Layout = 'sheet' | 'separate';

/**
 * Saves the standard views as pictures: the glass as it renders, or clean line
 * drawings; all four on one sheet, or one file per view.
 */
export function ViewsExport({ onClose }: { onClose: () => void }) {
  const { bodies } = useEvaluation();
  const [style, setStyle] = useState<Style>('glass');
  const [layout, setLayout] = useState<Layout>('sheet');
  const [dims, setDims] = useState(true);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [busy, onClose]);

  const save = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const { design } = useDesign.getState();
      const views = style === 'glass' ? await captureGlassViews?.(bodies) : renderOrthoViews(bodies);
      if (!views) throw new Error('The 3D view isn’t ready yet. Try again in a moment.');
      const stem = fileStem(design.name);
      const units = design.displayUnits;
      if (layout === 'sheet') {
        const size = unionBounds(bodies).getSize(new THREE.Vector3());
        const date = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
        const overall = `${formatLength(size.x, units)} W × ${formatLength(size.z, units)} D × ${formatLength(size.y, units)} H`;
        const url = await composeSheet(views, { title: design.name || 'Untitled piece', subtitle: `${date} · ${overall}`, units, dims });
        downloadUrl(url, `${stem}-views.png`);
      } else {
        for (const v of views) {
          downloadUrl(await composeView(v, units, dims), `${stem}-${v.name.replace('/', '-').toLowerCase()}.png`);
          await new Promise((r) => setTimeout(r, 250)); // browsers drop downloads fired all at once
        }
      }
      onClose();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="export-backdrop" role="dialog" aria-modal="true" aria-labelledby="views-export-title">
      <div className="export-dialog">
        <h2 id="views-export-title">Save views</h2>
        <p className="note flush">Front, side, top and 3/4, all at one scale, drawn flat the way design drawings are.</p>
        <fieldset>
          <legend>Look</legend>
          <label className="menu-check">
            <input type="radio" name="vx-style" checked={style === 'glass'} onChange={() => setStyle('glass')} />
            Glass render <span className="hint">as it looks on screen</span>
          </label>
          <label className="menu-check">
            <input type="radio" name="vx-style" checked={style === 'line'} onChange={() => setStyle('line')} />
            Line drawing <span className="hint">clean outlines on white</span>
          </label>
        </fieldset>
        <fieldset>
          <legend>Files</legend>
          <label className="menu-check">
            <input type="radio" name="vx-layout" checked={layout === 'sheet'} onChange={() => setLayout('sheet')} />
            One sheet <span className="hint">four views with a title block</span>
          </label>
          <label className="menu-check">
            <input type="radio" name="vx-layout" checked={layout === 'separate'} onChange={() => setLayout('separate')} />
            Separate images <span className="hint">one PNG per view</span>
          </label>
        </fieldset>
        <label className="menu-check">
          <input type="checkbox" checked={dims} onChange={(e) => setDims(e.target.checked)} />
          Dimensions on front, side and top
        </label>
        {problem && (
          <p className="op-error" role="alert">
            {problem}
          </p>
        )}
        <div className="editor-foot">
          <button className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={busy || !bodies.length}>
            {busy ? 'Rendering…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
