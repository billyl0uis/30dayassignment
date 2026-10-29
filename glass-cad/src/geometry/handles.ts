// Drag handles that edit a preset's numbers directly on the part. The math is pure
// so it can be tested: where a handle sits for a value, and what value a drag gives.

import type { HandleSpec } from '../presets/types';

export type V3 = [number, number, number];

const AXIS = { x: 0, y: 1, z: 2 } as const;

/** Where the handle for `value` sits, in the part's own (unplaced) space. */
export function handlePosition(spec: HandleSpec, value: number, partHeight: number): V3 {
  const p: V3 = [0, 0, 0];
  if (spec.axis === 'y') {
    p[1] = value;
  } else {
    p[AXIS[spec.axis]] = value / 2;
    p[1] = (spec.level ?? 0.5) * partHeight;
  }
  return p;
}

/** The line a handle slides along: through its rest position, along its axis. */
export function handleLine(spec: HandleSpec, value: number, partHeight: number): { origin: V3; dir: V3 } {
  const origin = handlePosition(spec, value, partHeight);
  const dir: V3 = [0, 0, 0];
  dir[AXIS[spec.axis]] = 1;
  origin[AXIS[spec.axis]] = 0;
  return { origin, dir };
}

/**
 * How far along a line the point closest to a ray lies. The pointer's ray almost never
 * crosses the handle's line exactly, so this is the usual way to drag along an axis.
 * Returns null when the ray runs parallel to the line and there is no single answer.
 */
export function closestOnLine(origin: V3, dir: V3, rayOrigin: V3, rayDir: V3): number | null {
  const w = sub(origin, rayOrigin);
  const a = dot(dir, dir);
  const b = dot(dir, rayDir);
  const c = dot(rayDir, rayDir);
  const d = dot(dir, w);
  const e = dot(rayDir, w);
  const denom = a * c - b * b;
  if (Math.abs(denom) < 1e-9 * a * c) return null;
  return (b * e - c * d) / denom;
}

/** Turns a position along the handle's line back into the parameter value. */
export function valueAt(spec: HandleSpec, along: number): number {
  return spec.axis === 'y' ? along : 2 * Math.abs(along);
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
