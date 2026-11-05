import { useEffect, useRef, useState } from 'react';
import { useDesign } from './store/designStore';
import { FeatureTree, MyParts, PresetPalette } from './panels/LeftPanels';
import { DrawingEditor } from './panels/DrawingEditor';
import { useEvaluation } from './store/useEvaluation';
import { parseDesign } from './store/library';
import { parseMeshFile } from './files/importMesh';
import { exportDesignJson, exportGlb, exportObj, exportStl } from './files/exporters';
import { downloadBlob, fileStem } from './files/download';
import { Inspector } from './panels/Inspector';
import { ShopPanel } from './panels/ShopPanel';
import { Viewport } from './viewport/Viewport';

export default function App() {
  useShortcuts();
  return (
    <div className="app">
      <Header />
      <aside className="side left">
        <PresetPalette />
        <MyParts />
        <FeatureTree />
      </aside>
      <main className="stage">
        <Viewport />
        <EditorIfOpen />
      </main>
      <aside className="side right">
        <Inspector />
        <ShopPanel />
      </aside>
    </div>
  );
}

function EditorIfOpen() {
  const open = useDesign((s) => s.editor !== null);
  return open ? <DrawingEditor /> : null;
}

function Header() {
  const name = useDesign((s) => s.design.name);
  const units = useDesign((s) => s.design.displayUnits);
  const canUndo = useDesign((s) => s.past.length > 0);
  const canRedo = useDesign((s) => s.future.length > 0);
  const { setName, setUnits, undo, redo } = useDesign.getState();

  return (
    <header className="topbar">
      <span className="brand">Glass CAD</span>
      <DesignsMenu />
      <FileMenu />
      <input className="design-name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Design name" />
      <div className="topbar-actions">
        <button className="btn" onClick={undo} disabled={!canUndo} title="Undo (⌘Z)">
          Undo
        </button>
        <button className="btn" onClick={redo} disabled={!canRedo} title="Redo (⇧⌘Z)">
          Redo
        </button>
        <div className="segmented" role="radiogroup" aria-label="Units">
          {(['in', 'cm'] as const).map((u) => (
            <button key={u} role="radio" aria-checked={units === u} className={units === u ? 'on' : undefined} onClick={() => setUnits(u)}>
              {u}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}

/** Designs saved in this browser: switch between them, start fresh, or branch a variation. */
function DesignsMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const list = useDesign((s) => s.library);
  const currentId = useDesign((s) => s.design.id);
  const { newDesign, duplicateDesign, openDesign, deleteDesign } = useDesign.getState();

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);

  const run = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };

  return (
    <div className="menu" ref={ref}>
      <button className="btn" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}>
        Designs ▾
      </button>
      {open && (
        <div className="menu-pop" role="menu">
          <button role="menuitem" onClick={run(newDesign)}>
            New design
          </button>
          <button role="menuitem" onClick={run(duplicateDesign)} title="Saves a copy and switches to it, so you can try a variation">
            Duplicate this design
          </button>
          {list.length > 0 && <div className="menu-sep">Saved in this browser</div>}
          {list.map((entry) => (
            <div key={entry.id} className={`menu-item${entry.id === currentId ? ' current' : ''}`}>
              <button role="menuitem" onClick={run(() => openDesign(entry.id))}>
                {entry.name || 'Untitled'}
                <span className="hint">{new Date(entry.updatedAt).toLocaleDateString()}</span>
              </button>
              <button
                className="icon-btn"
                aria-label={`Delete ${entry.name}`}
                title="Delete this saved design"
                onClick={() => window.confirm(`Delete "${entry.name}"? This can't be undone.`) && deleteDesign(entry.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Saving and opening design files, importing meshes, and exporting the model. */
function FileMenu() {
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const designInput = useRef<HTMLInputElement>(null);
  const meshInput = useRef<HTMLInputElement>(null);
  const { bodies } = useEvaluation();

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);

  const run = (fn: () => void | Promise<void>) => async () => {
    setOpen(false);
    setProblem(null);
    try {
      await fn();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    }
  };
  const design = () => useDesign.getState().design;
  const stem = () => fileStem(design().name);

  return (
    <div className="menu" ref={ref}>
      <button className="btn" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}>
        File ▾
      </button>
      {open && (
        <div className="menu-pop" role="menu">
          <button role="menuitem" onClick={run(() => downloadBlob(exportDesignJson(design()), `${stem()}.glasscad.json`))}>
            Save design file
            <span className="hint">.json</span>
          </button>
          <button role="menuitem" onClick={() => designInput.current?.click()}>
            Open design file…
          </button>
          <div className="menu-sep">Import</div>
          <button role="menuitem" onClick={() => meshInput.current?.click()}>
            Import STL or OBJ…
          </button>
          <div className="menu-sep">Export the model</div>
          <button role="menuitem" disabled={!bodies.length} onClick={run(() => downloadBlob(exportStl(bodies, design()), `${stem()}.stl`))}>
            STL <span className="hint">mm, for printing molds</span>
          </button>
          <button role="menuitem" disabled={!bodies.length} onClick={run(() => downloadBlob(exportObj(bodies, design()), `${stem()}.obj`))}>
            OBJ <span className="hint">mm</span>
          </button>
          <button role="menuitem" disabled={!bodies.length} onClick={run(async () => downloadBlob(await exportGlb(bodies, design()), `${stem()}.glb`))}>
            GLB <span className="hint">with glass look</span>
          </button>
        </div>
      )}
      {problem && (
        <p className="menu-problem" role="alert" onClick={() => setProblem(null)}>
          {problem}
        </p>
      )}
      <input
        ref={designInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          setOpen(false);
          if (!file) return;
          const d = parseDesign(await file.text());
          if (d) useDesign.getState().openDesignFile(d);
          else setProblem(`"${file.name}" isn't a Glass CAD design this version can open.`);
        }}
      />
      <input
        ref={meshInput}
        type="file"
        accept=".stl,.obj"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          setOpen(false);
          if (!file) return;
          try {
            const m = parseMeshFile(file.name, await file.arrayBuffer());
            useDesign.getState().addImportedMesh(file.name, m.positions, m.unitsGuess);
            if (m.triangles > 150_000) setProblem(`Imported ${m.triangles.toLocaleString()} triangles. That's large: the design may be too big to autosave in the browser, so save a design file too.`);
          } catch (err) {
            setProblem(err instanceof Error ? err.message : String(err));
          }
        }}
      />
    </div>
  );
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable]')) return;
      const { undo, redo, removeOps, selection, selectedId, select, duplicate, setGizmo } = useDesign.getState();
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'd' && selectedId) {
        e.preventDefault();
        duplicate(selectedId);
      } else if (!mod && !e.altKey && ['1', '2', '3', '4'].includes(key)) {
        useDesign.getState().showView((['front', 'side', 'top', 'iso'] as const)[Number(key) - 1]);
      } else if (!mod && !e.altKey && key === '5') {
        useDesign.getState().setFlat(!useDesign.getState().flat);
      } else if (!mod && !e.altKey && (key === 'w' || key === 'e' || key === 'r')) {
        setGizmo(key === 'w' ? 'translate' : key === 'e' ? 'rotate' : 'scale');
      } else if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selection.length) {
        e.preventDefault();
        removeOps(selection);
      } else if (e.key === 'Escape') {
        select(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
