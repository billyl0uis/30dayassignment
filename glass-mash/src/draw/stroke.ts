import {
  chaikinClosed,
  dist,
  resampleClosed,
  selfIntersects,
  signedArea,
  subdivideClosed,
  type Vec2,
} from '../geom2d/polygon';
import { traceFilledOutline } from '../geom2d/raster';

export type StrokeKind = 'brush' | 'pen';

/** Spacing of the stored outline, in drawing units (the pad is 2 units wide). */
export const OUTLINE_SPACING = 0.02;
const MIN_AREA = 0.004;

/**
 * Turns raw input into a clean closed outline: closes the gap, smooths hand
 * wobble (brush only), untangles self-crossings and normalises winding to CCW.
 * Returns null when the scribble is too small to be a shape.
 */
export function cleanupStroke(raw: Vec2[], kind: StrokeKind): Vec2[] | null {
  const pts: Vec2[] = [];
  for (const p of raw) if (!pts.length || dist(pts[pts.length - 1], p) > 1e-3) pts.push(p);
  if (pts.length < 3) return null;

  let out =
    kind === 'brush'
      ? resampleClosed(chaikinClosed(resampleClosed(pts, 0.015), 2), OUTLINE_SPACING)
      : subdivideClosed(pts, OUTLINE_SPACING);

  if (selfIntersects(out)) {
    const traced = traceFilledOutline(out);
    if (!traced) return null;
    out = resampleClosed(chaikinClosed(traced, 2), OUTLINE_SPACING);
  }

  const area = signedArea(out);
  if (Math.abs(area) < MIN_AREA) return null;
  if (area < 0) out.reverse();
  return out;
}

/** A two-rooted molar, so the 3D view isn't empty on first load. */
export function starterOutline(): Vec2[] {
  const tooth: Vec2[] = [
    [-0.5, 0.0], [-0.55, 0.35], [-0.4, 0.58], [-0.2, 0.46], [0, 0.6], [0.2, 0.46], [0.4, 0.58],
    [0.55, 0.35], [0.5, 0.0], [0.38, -0.25], [0.33, -0.72], [0.2, -0.8], [0.12, -0.45], [0, -0.28],
    [-0.12, -0.45], [-0.2, -0.8], [-0.33, -0.72], [-0.38, -0.25],
  ];
  return cleanupStroke(tooth, 'brush')!;
}
