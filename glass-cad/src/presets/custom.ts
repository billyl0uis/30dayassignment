// Presets for hand-drawn parts. The drawing (a CustomShape) rides along on the op;
// these turn it into a section, with a few numbers on top: an overall scale and the
// thickness or wall that the drawing itself can't say.

import { inch } from '../model/units';
import type { CustomShape } from '../model/types';
import { cleanProfile, onFloor, polygonArea, smoothThrough, type Vec2 } from '../geometry/profile';
import { outlineDistance } from '../geometry/sdf';
import { clampWall, len, wall } from './basic';
import type { ParamSpec, PresetDef } from './types';

const scale: ParamSpec = { key: 'scale', label: 'Scale', kind: 'ratio', default: 1, min: 0.1, max: 5, hint: 'of the drawing', step: 0.05, suffix: '×' };

/** The drawn points, smoothed if asked and scaled, as the preset will use them. */
export function drawnPoints(shape: CustomShape, k = 1): Vec2[] {
  const pts = shape.points.map(([x, y]): Vec2 => [x * k, y * k]);
  const closed = shape.mode !== 'revolve';
  return shape.smooth && pts.length >= 3 ? smoothThrough(pts, 8, closed) : pts;
}

function need(shape: CustomShape | undefined, min: number): CustomShape {
  if (!shape || shape.points.length < min) throw new Error(`This drawing needs at least ${min} points.`);
  return shape;
}

/**
 * Turns a drawn line into a lathe profile: radii can't go below the axis, it has to run
 * bottom to top, and both ends are brought in to the axis so the part closes.
 */
export function revolveProfile(points: Vec2[]): Vec2[] {
  let pts = points.map(([x, y]): Vec2 => [Math.max(0, x), y]);
  if (pts[0][1] > pts[pts.length - 1][1]) pts = pts.reverse();
  if (pts[0][0] > 0) pts.unshift([0, pts[0][1]]);
  if (pts[pts.length - 1][0] > 0) pts.push([0, pts[pts.length - 1][1]]);
  return cleanProfile(onFloor(pts));
}

export const customRevolve: PresetDef = {
  id: 'custom-revolve',
  family: 'custom',
  label: 'Drawn (revolved)',
  params: [scale, wall],
  section: (p, shape) => {
    const profile = revolveProfile(drawnPoints(need(shape, 2), p.scale));
    const maxR = Math.max(...profile.map((q) => q[0]));
    const h = Math.max(...profile.map((q) => q[1]));
    return { kind: 'lathe', profile, wall: clampWall(p.wall, maxR, h / 2) };
  },
};

export const customExtrude: PresetDef = {
  id: 'custom-extrude',
  family: 'custom',
  label: 'Drawn (extruded)',
  params: [scale, len('depth', 'Depth', inch(0.5), 1, inch(12))],
  section: (p, shape) => ({ kind: 'extrude', outline: onFloor(drawnPoints(need(shape, 3), p.scale)), depth: p.depth }),
};

export const customInflate: PresetDef = {
  id: 'custom-inflate',
  family: 'custom',
  label: 'Drawn (inflated)',
  params: [scale, len('thickness', 'Thickness', inch(1), 1, inch(8)), len('round', 'Edge round', inch(0.5), 0.5, inch(6), undefined)],
  section: (p, shape) => {
    // Pillow: full thickness in the middle, easing to a thin rounded edge within `round` of the outline.
    let outline = onFloor(drawnPoints(need(shape, 3), p.scale));
    if (polygonArea(outline) < 0) outline = [...outline].reverse();
    const flat = outlineDistance(outline, true);
    const half = p.thickness / 2;
    const R = Math.max(0.5, p.round);
    const sdf = (x: number, y: number, z: number) => {
      const d = flat(x, y);
      const e = Math.min(Math.max(-d, 0), R) / R;
      const h = half * Math.sqrt(1 - (1 - e) * (1 - e));
      return Math.max(d, Math.abs(z) - h);
    };
    const xs = outline.map((q) => q[0]);
    const ys = outline.map((q) => q[1]);
    return {
      kind: 'implicit',
      sdf,
      min: [Math.min(...xs), 0, -half],
      max: [Math.max(...xs), Math.max(...ys), half],
      bulge: 0,
      thickness: p.thickness,
      icon: [],
      iconOutline: outline,
      cells: 90,
    };
  },
};

export const CUSTOM_PRESETS = [customRevolve, customExtrude, customInflate];

export const customPresetFor = (mode: CustomShape['mode']) => `custom-${mode}`;
