// A Section is the pure, three.js-free description a preset produces. Volume and
// bounds come from it directly, and geometry/build.ts turns it into a mesh, so the
// numbers in the shop panel and the shape on screen always come from one source.
//
// Turned shapes (lathe), boxes and extrusions have exact volumes here. Sweeps (rods,
// coils, horns) and implicit shapes (bone ends, blobs, inflated drawings) are measured
// from their finished mesh instead, so sectionVolume returns null for them.

import { offsetInward, polygonArea, revolvedVolume, type Vec2 } from './profile';
import type { Sdf } from './sdf';

export type V3 = [number, number, number];
export type Cap = 'round' | 'flat';

export type Section =
  | { kind: 'lathe'; profile: Vec2[]; wall: number }
  | { kind: 'lathe-loop'; loop: Vec2[] }
  | { kind: 'box'; width: number; depth: number; height: number; wall: number }
  /** A round rod of varying radius along a path, like a pulled cane or a coil. */
  | { kind: 'sweep'; path: V3[]; radii: number[]; closed: boolean; caps: [Cap, Cap] }
  /** A closed outline in the XY plane, pushed `depth` along Z (centred). */
  | { kind: 'extrude'; outline: Vec2[]; depth: number }
  /**
   * A shape defined only by its distance function, meshed by the level-set mesher.
   * `min`/`max` are its size; `bulge` is how far melting may push past that, so the
   * mesher leaves room. `icon` is a few circles (x, y, r) to sketch it in the palette.
   */
  /** Raw triangles from an imported file (three corners per triangle). */
  | { kind: 'mesh'; positions: Float32Array }
  | {
      kind: 'implicit';
      sdf: Sdf;
      min: V3;
      max: V3;
      bulge: number;
      thickness: number;
      icon: [number, number, number][];
      iconOutline?: Vec2[];
      cells?: number;
    };

export interface Size {
  width: number; // X
  depth: number; // Z
  height: number; // Y
}

export function innerProfile(section: Extract<Section, { kind: 'lathe' }>): Vec2[] | null {
  return section.wall > 0 ? offsetInward(section.profile, section.wall) : null;
}

export function sectionVolume(section: Section): number | null {
  switch (section.kind) {
    case 'sweep':
    case 'implicit':
    case 'mesh':
      return null;
    case 'extrude':
      return Math.abs(polygonArea(section.outline)) * section.depth;
    case 'lathe': {
      const inner = innerProfile(section);
      return revolvedVolume(section.profile) - (inner ? revolvedVolume(inner) : 0);
    }
    case 'lathe-loop':
      return revolvedVolume(section.loop);
    case 'box': {
      const { width: w, depth: d, height: h, wall: t } = section;
      const cavity = t > 0 ? (w - 2 * t) * (d - 2 * t) * (h - 2 * t) : 0;
      return w * d * h - cavity;
    }
  }
}

export function sectionSize(section: Section): Size {
  switch (section.kind) {
    case 'box':
      return { width: section.width, depth: section.depth, height: section.height };
    case 'sweep': {
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      // A ring square to the path reaches r·√(1 − tₐ²) along each axis; a rounded end, the full radius.
      const { path, radii, closed, caps } = section;
      const n = path.length;
      path.forEach((p, i) => {
        const a0 = closed ? path[(i - 1 + n) % n] : path[Math.max(0, i - 1)];
        const b0 = closed ? path[(i + 1) % n] : path[Math.min(n - 1, i + 1)];
        const t = [b0[0] - a0[0], b0[1] - a0[1], b0[2] - a0[2]];
        const l = Math.hypot(t[0], t[1], t[2]) || 1;
        const roundEnd = !closed && ((i === 0 && caps[0] === 'round') || (i === n - 1 && caps[1] === 'round'));
        for (let a = 0; a < 3; a++) {
          const reach = roundEnd ? radii[i] : radii[i] * Math.sqrt(Math.max(0, 1 - (t[a] / l) ** 2));
          min[a] = Math.min(min[a], p[a] - reach);
          max[a] = Math.max(max[a], p[a] + reach);
        }
      });
      return { width: max[0] - min[0], height: max[1] - min[1], depth: max[2] - min[2] };
    }
    case 'extrude': {
      const xs = section.outline.map((p) => p[0]);
      const ys = section.outline.map((p) => p[1]);
      return { width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys), depth: section.depth };
    }
    case 'mesh': {
      const p = section.positions;
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < p.length; i++) {
        min[i % 3] = Math.min(min[i % 3], p[i]);
        max[i % 3] = Math.max(max[i % 3], p[i]);
      }
      return p.length ? { width: max[0] - min[0], height: max[1] - min[1], depth: max[2] - min[2] } : { width: 0, height: 0, depth: 0 };
    }
    case 'implicit':
      return { width: section.max[0] - section.min[0], height: section.max[1] - section.min[1], depth: section.max[2] - section.min[2] };
  }
  const pts = section.kind === 'lathe' ? section.profile : section.loop;
  let maxR = 0;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [r, y] of pts) {
    maxR = Math.max(maxR, r);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { width: 2 * maxR, depth: 2 * maxR, height: maxY - minY };
}

/** Rough path length of light through the glass, fed to the material's `thickness`. */
export function glassThickness(section: Section): number {
  if (section.kind === 'sweep') return 2 * (section.radii.reduce((a, b) => a + b, 0) / section.radii.length);
  if (section.kind === 'implicit') return section.thickness;
  if (section.kind === 'mesh') {
    const { width, height, depth } = sectionSize(section);
    return Math.min(width, height, depth) * 0.5;
  }
  if ((section.kind === 'lathe' || section.kind === 'box') && section.wall > 0) return section.wall * 2;
  const { width, height } = sectionSize(section);
  return Math.min(width, height) * 0.5;
}
