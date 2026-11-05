import { getStroke } from 'perfect-freehand';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { dist, type Vec2 } from '../geom2d/polygon';
import { useScene } from '../scene/store';
import { cleanupStroke } from './stroke';

const PAPER = '#ece5d8';
const INK = '#1f1b17';
const CLOSE_RADIUS = 0.07; // click this close to the first pen point to close the shape

/**
 * The sketchbook page. Brush: one continuous stroke, auto-closed on release.
 * Pen: click points; click the first point, double-click or press Enter to close.
 * Every finished shape is added to the scene as a new piece, and the page
 * clears for the next one, keeping a faint trace of the last shape for scale.
 */
export function DrawPad() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState(400);
  const tool = useScene((s) => s.tool);
  const addShape = useScene((s) => s.addShape);
  const isEmpty = useScene((s) => s.pieces.length === 0);
  const [last, setLast] = useState<Vec2[] | null>(null);
  const [stroking, setStroking] = useState(false);

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

    if (last && !isEmpty) {
      g.beginPath();
      last.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
      g.strokeStyle = 'rgba(31,27,23,0.22)';
      g.lineWidth = 1.5 * px;
      g.setLineDash([3 * px, 4 * px]);
      g.stroke();
      g.setLineDash([]);
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
  }, [size, last, isEmpty, penPts]);

  useLayoutEffect(paint, [paint]);

  const toDrawing = (e: { clientX: number; clientY: number }): Vec2 => {
    const r = canvasRef.current!.getBoundingClientRect();
    const clamp = (v: number) => Math.max(-0.98, Math.min(0.98, v));
    return [clamp(((e.clientX - r.left) / r.width) * 2 - 1), clamp(1 - ((e.clientY - r.top) / r.height) * 2)];
  };

  const commit = (raw: Vec2[], kind: 'brush' | 'pen') => {
    const clean = cleanupStroke(raw, kind);
    setRejected(!clean);
    if (clean) {
      addShape(clean);
      setLast(clean);
    }
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
      setStroking(true);
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
    setStroking(false);
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
      {isEmpty && !stroking && penPts.length === 0 && (
        <p className="pad-empty">
          Draw a shape here.
          <br />
          It becomes glass on the right.
        </p>
      )}
      {rejected && <p className="pad-note">Too small to inflate. Draw a bigger loop.</p>}
    </div>
  );
}
