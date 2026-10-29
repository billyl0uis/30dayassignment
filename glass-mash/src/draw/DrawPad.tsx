import { getStroke } from 'perfect-freehand';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { dist, type Vec2 } from '../geom2d/polygon';
import { selectPiece, useScene } from '../scene/store';
import { cleanupStroke } from './stroke';

const PAPER = '#ece5d8';
const INK = '#1f1b17';
const CLOSE_RADIUS = 0.07; // click this close to the first pen point to close the shape

/**
 * The sketchbook page. Brush: one continuous stroke, auto-closed on release.
 * Pen: click points; click the first point, double-click or press Enter to close.
 * Either way the new shape replaces the selected piece's drawing.
 */
export function DrawPad() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState(400);
  const tool = useScene((s) => s.tool);
  const outline = useScene((s) => selectPiece(s).drawing?.outline ?? null);
  const setDrawing = useScene((s) => s.setDrawing);

  const brush = useRef<number[][]>([]); // [x, y, pressure]
  const brushDown = useRef(false);
  const [penPts, setPenPts] = useState<Vec2[]>([]);
  const hover = useRef<Vec2 | null>(null);
  const [rejected, setRejected] = useState(false);

  useEffect(() => {
    const el = wrapRef.current!;
    const ro = new ResizeObserver(([e]) => setSize(Math.floor(Math.min(e.contentRect.width, e.contentRect.height))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== size * dpr) {
      canvas.width = canvas.height = size * dpr;
    }
    const g = canvas.getContext('2d')!;
    const k = (size * dpr) / 2;
    g.setTransform(k, 0, 0, -k, k, k); // drawing space: [-1, 1], y up
    const px = 2 / size; // one CSS pixel in drawing units

    g.fillStyle = PAPER;
    g.fillRect(-1, -1, 2, 2);
    g.fillStyle = 'rgba(31,27,23,0.16)';
    for (let x = -0.9; x < 0.95; x += 0.1) for (let y = -0.9; y < 0.95; y += 0.1) g.fillRect(x - px, y - px, 2 * px, 2 * px);
    g.strokeStyle = 'rgba(31,27,23,0.12)';
    g.lineWidth = px;
    g.setLineDash([4 * px, 6 * px]);
    g.beginPath();
    g.moveTo(0, -1);
    g.lineTo(0, 1);
    g.stroke();
    g.setLineDash([]);

    const drawing = brushDown.current || penPts.length > 0;
    if (outline) {
      g.beginPath();
      outline.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
      g.globalAlpha = drawing ? 0.25 : 1;
      g.fillStyle = 'rgba(70,120,140,0.14)';
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = 2.2 * px;
      g.lineJoin = 'round';
      g.stroke();
      g.globalAlpha = 1;
    }

    if (brush.current.length > 1) {
      const poly = getStroke(brush.current, { size: 7 * px, thinning: 0.55, smoothing: 0.5, streamline: 0.35, simulatePressure: brush.current[0][2] === 0.5 });
      g.beginPath();
      poly.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
      g.fillStyle = INK;
      g.fill();
    }

    if (penPts.length) {
      g.strokeStyle = INK;
      g.lineWidth = 2 * px;
      g.beginPath();
      penPts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.stroke();
      if (hover.current) {
        const last = penPts[penPts.length - 1];
        g.setLineDash([5 * px, 5 * px]);
        g.beginPath();
        g.moveTo(last[0], last[1]);
        g.lineTo(hover.current[0], hover.current[1]);
        g.stroke();
        g.setLineDash([]);
      }
      const nearStart = hover.current && penPts.length >= 3 && dist(hover.current, penPts[0]) < CLOSE_RADIUS;
      penPts.forEach(([x, y], i) => {
        const r = (i === 0 ? (nearStart ? 8 : 5) : 3.5) * px;
        g.fillStyle = i === 0 ? (nearStart ? '#e8692c' : PAPER) : INK;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
        if (i === 0) g.stroke();
      });
    }
  }, [size, outline, penPts]);

  useLayoutEffect(paint, [paint]);

  const toDrawing = (e: { clientX: number; clientY: number }): Vec2 => {
    const r = canvasRef.current!.getBoundingClientRect();
    const clamp = (v: number) => Math.max(-0.98, Math.min(0.98, v));
    return [clamp(((e.clientX - r.left) / r.width) * 2 - 1), clamp(1 - ((e.clientY - r.top) / r.height) * 2)];
  };

  const commit = (raw: Vec2[], kind: 'brush' | 'pen') => {
    const clean = cleanupStroke(raw, kind);
    setRejected(!clean);
    if (clean) setDrawing(clean);
  };

  const finishPen = useCallback(() => {
    if (penPts.length >= 3) commit(penPts, 'pen');
    setPenPts([]);
  }, [penPts]);

  useEffect(() => {
    if (tool !== 'pen') setPenPts([]);
  }, [tool]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!penPts.length) return;
      if (e.key === 'Enter') finishPen();
      else if (e.key === 'Escape') setPenPts([]);
      else if (e.key === 'Backspace') setPenPts((p) => p.slice(0, -1));
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [penPts, finishPen]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const p = toDrawing(e);
    if (tool === 'brush') {
      try {
        e.currentTarget.setPointerCapture(e.pointerId); // keep the stroke going if it leaves the page
      } catch {
        /* pointer already gone; the stroke still works inside the page */
      }
      brushDown.current = true;
      brush.current = [[p[0], p[1], e.pointerType === 'pen' ? e.pressure : 0.5]];
      paint();
    } else if (penPts.length >= 3 && dist(p, penPts[0]) < CLOSE_RADIUS) {
      finishPen();
    } else {
      setPenPts((pts) => [...pts, p]);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (tool === 'brush' && brushDown.current) {
      const coalesced = e.nativeEvent.getCoalescedEvents?.() ?? [];
      const events = coalesced.length ? coalesced : [e.nativeEvent];
      for (const ev of events) {
        const p = toDrawing(ev);
        brush.current.push([p[0], p[1], e.pointerType === 'pen' ? ev.pressure : 0.5]);
      }
      paint();
    } else if (tool === 'pen') {
      hover.current = toDrawing(e);
      if (penPts.length) paint();
    }
  };

  const onPointerUp = () => {
    if (!brushDown.current) return;
    brushDown.current = false;
    const raw = brush.current.map(([x, y]) => [x, y] as Vec2);
    brush.current = [];
    if (raw.length > 6) commit(raw, 'brush');
    paint();
  };

  return (
    <div className="pad-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className={`pad tool-${tool}`}
        style={{ width: size, height: size }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => tool === 'pen' && finishPen()}
      />
      {rejected && <p className="pad-note">Too small to inflate. Draw a bigger loop.</p>}
    </div>
  );
}
