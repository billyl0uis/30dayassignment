import { useEffect } from 'react';
import { DrawPad } from './draw/DrawPad';
import { Stage } from './render/Stage';
import { useScene } from './scene/store';
import { Inspector } from './ui/Inspector';
import { PieceBar } from './ui/PieceBar';

const HINTS = {
  brush: 'Draw one loop and let go. Each new shape lands on the last one and melts into it.',
  pen: 'Click points; click the first point again (or press Enter) to finish. Esc cancels.',
};

export default function App() {
  const { tool, setTool, undo, redo, past, future, clearAll, setGizmo } = useScene();
  const hasPieces = useScene((s) => s.pieces.length > 0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement && e.target.type !== 'range') return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (!mod && e.key === 'b') setTool('brush');
      else if (!mod && e.key === 'p') setTool('pen');
      else if (!mod && e.key === 'w') setGizmo('translate');
      else if (!mod && e.key === 'e') setGizmo('rotate');
      else if (!mod && e.key === 'r') setGizmo('scale');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, setTool, setGizmo]);

  return (
    <div className="app">
      <section className="sketch">
        <header className="brand">
          <h1>Glass Mash</h1>
          <p>draw it flat · get it hot</p>
        </header>
        <div className="toolbar">
          <div className="seg">
            <button className={tool === 'brush' ? 'on' : ''} onClick={() => setTool('brush')} title="Brush (B)">
              Brush
            </button>
            <button className={tool === 'pen' ? 'on' : ''} onClick={() => setTool('pen')} title="Pen (P)">
              Pen
            </button>
          </div>
          <div className="seg">
            <button onClick={undo} disabled={!past.length} title="Undo (⌘Z)">
              Undo
            </button>
            <button onClick={redo} disabled={!future.length} title="Redo (⇧⌘Z)">
              Redo
            </button>
            <button onClick={clearAll} disabled={!hasPieces} title="Remove every piece (you can undo this)">
              Start over
            </button>
          </div>
        </div>
        <DrawPad />
        <p className="hint">{HINTS[tool]}</p>
      </section>
      <main className="stage">
        <Stage />
        <Inspector />
        <PieceBar />
      </main>
    </div>
  );
}
