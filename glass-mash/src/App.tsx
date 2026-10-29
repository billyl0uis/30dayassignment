import { useEffect } from 'react';
import { DrawPad } from './draw/DrawPad';
import { Stage } from './render/Stage';
import { useScene } from './scene/store';
import { Inspector } from './ui/Inspector';

const HINTS = {
  brush: 'Draw one loop. It closes itself when you let go.',
  pen: 'Click points. Click the first point, double-click or press Enter to close. Esc cancels.',
};

export default function App() {
  const { tool, setTool, undo, redo, past, future, setDrawing } = useScene();

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
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, setTool]);

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
            <button onClick={() => setDrawing(null)} title="Clear the page">
              Clear
            </button>
          </div>
        </div>
        <DrawPad />
        <p className="hint">{HINTS[tool]}</p>
      </section>
      <main className="stage">
        <Stage />
        <Inspector />
      </main>
    </div>
  );
}
