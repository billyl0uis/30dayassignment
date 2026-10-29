// Path builders for swept presets (rods, coils, handles, horns, teeth). Each returns
// points along the rod's centre line plus a radius at each point; section.ts turns
// that into a sweep and every part is then dropped onto the floor.

import type { Cap, Section, V3 } from '../geometry/section';

export type Sweep = Extract<Section, { kind: 'sweep' }>;

/** A helix around the vertical axis: `radius` to the rod's centre, `rise` per turn. */
export function helix(radius: number, turns: number, rise: number, perTurn = 72): V3[] {
  const n = Math.max(8, Math.round(turns * perTurn));
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = (2 * Math.PI * turns * i) / n;
    return [radius * Math.cos(a), (rise * turns * i) / n, radius * Math.sin(a)] as V3;
  });
}

/**
 * A rod that starts at the origin heading straight up and bends steadily toward +X
 * through `bend` radians over its length; `spiral` lifts the end out along Z, for a
 * ram's horn rather than a flat curl.
 */
export function bentPath(length: number, bend: number, spiral = 0, n = 64): V3[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const s = (length * i) / n;
    if (bend < 1e-4) return [0, s, (spiral * i) / n] as V3;
    const rho = length / bend;
    const a = s / rho;
    return [rho * (1 - Math.cos(a)), rho * Math.sin(a), (spiral * i) / n] as V3;
  });
}

/**
 * Builds the sweep and lifts it so its lowest surface point sits on y = 0. A ring
 * square to the path only reaches r·√(1 − t_y²) below its centre; a rounded end
 * reaches the full radius.
 */
export function sweepOnFloor(path: V3[], radii: number[], caps: [Cap, Cap], closed = false): Sweep {
  let low = Infinity;
  const n = path.length;
  for (let i = 0; i < n; i++) {
    const a = path[Math.max(0, i - 1)];
    const b = path[Math.min(n - 1, i + 1)];
    const t = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const l = Math.hypot(t[0], t[1], t[2]) || 1;
    const roundEnd = !closed && ((i === 0 && caps[0] === 'round') || (i === n - 1 && caps[1] === 'round'));
    const reach = roundEnd ? radii[i] : radii[i] * Math.sqrt(Math.max(0, 1 - (t[1] / l) ** 2));
    low = Math.min(low, path[i][1] - reach);
  }
  return { kind: 'sweep', path: path.map(([x, y, z]) => [x, y - low, z] as V3), radii, closed, caps };
}
