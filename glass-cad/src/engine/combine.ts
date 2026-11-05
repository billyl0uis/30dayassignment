// Booleans and shells. Both turn placed bodies into one new piece of glass, so their
// results are cached per op under a key made from the inputs' geometry and placement:
// moving an unrelated part doesn't redo a cut.

import * as THREE from 'three';
import type { BlendOp, BooleanOp, DeformOp, OpNode, OpId, ShellOp } from '../model/types';
import { deformer, deformParamsOf, type Vec3 } from '../geometry/deform';
import { cylinderSdf, intersect, smoothUnion, subtract, union, type Sdf } from '../geometry/sdf';
import { csg, describeStatus, toGeometry, toManifold, unionAll } from './csg';
import type { Body } from './evaluate';

export interface Combined {
  geometry: THREE.BufferGeometry; // world space
  volume_mm3: number;
  thickness_mm?: number;
  sdf: Sdf | null;
}

const cache = new Map<OpId, { key: string; result: Combined }>();

const signature = (bodies: Body[]) => bodies.map((b) => `${b.geometry.uuid}@${b.matrix.elements.map((v) => v.toFixed(4)).join(',')}`).join('|');

function cached(id: OpId, key: string, make: () => Combined): Combined {
  const hit = cache.get(id);
  if (hit?.key === key) return hit.result;
  const result = make();
  hit?.result.geometry.dispose();
  cache.set(id, { key, result });
  return result;
}

const unionSdf = (bodies: Body[]): Sdf | null =>
  bodies.every((b) => b.sdf) ? bodies.map((b) => b.sdf!).reduce((a, b) => union(a, b)) : null;

export function booleanResult(op: BooleanOp, target: Body[], tools: Body[]): Combined {
  const key = `${op.mode}#${signature(target)}#${signature(tools)}`;
  return cached(op.id, key, () => {
    const a = unionAll(target.map((b) => toManifold(b.geometry, b.matrix)));
    const b = unionAll(tools.map((t) => toManifold(t.geometry, t.matrix)));
    const m = op.mode === 'union' ? a.add(b) : op.mode === 'subtract' ? a.subtract(b) : a.intersect(b);
    a.delete();
    b.delete();
    try {
      const problem = describeStatus(m);
      if (problem) throw new Error(problem);
      if (m.isEmpty()) throw new Error(op.mode === 'intersect' ? "The parts don't overlap, so nothing is left." : 'Nothing is left after this cut.');
      const sa = unionSdf(target);
      const sb = unionSdf(tools);
      const sdf = sa && sb ? (op.mode === 'union' ? union : op.mode === 'subtract' ? subtract : intersect)(sa, sb) : null;
      return { geometry: toGeometry(m), volume_mm3: m.volume(), sdf };
    } finally {
      m.delete();
    }
  });
}

/** Grid cells across the longest side when finding a shell's cavity: finer is smoother but slower. */
const SHELL_CELLS = 100;

/**
 * Hollows the source: the cavity is every point deeper than the wall thickness, found
 * from the source's distance function and meshed by manifold's level-set mesher. The
 * outside surface is the original mesh, untouched; only the inside is resampled.
 */
export function shellResult(op: ShellOp, source: Body[]): Combined {
  const key = `${op.thickness}|${op.opening}|${op.openingDiameter}#${signature(source)}`;
  return cached(op.id, key, () => {
    const sdf = unionSdf(source);
    if (!sdf) throw new Error("Shell can't measure this shape. Put Shell before any Deform, and note imported meshes can't be shelled.");
    const { Manifold } = csg();
    const box = new THREE.Box3();
    source.forEach((b) => box.union(b.bounds));
    const size = box.getSize(new THREE.Vector3());
    const t = op.thickness;
    const edge = Math.max(t * 0.6, Math.max(size.x, size.y, size.z) / SHELL_CELLS);
    const cavity = Manifold.levelSet((p) => -sdf(p[0], p[1], p[2]), { min: box.min.toArray(), max: box.max.toArray() }, edge, t);
    if (cavity.isEmpty()) {
      cavity.delete();
      throw new Error('The wall is thicker than the part, so there is nothing to hollow.');
    }

    let cut = cavity;
    let shellSdf: Sdf = (x, y, z) => {
      const d = sdf(x, y, z);
      return Math.max(d, -(d + t));
    };
    if (op.opening !== 'none') {
      const cb = cavity.boundingBox();
      const mid = (cb.min[1] + cb.max[1]) / 2;
      const [y0, y1] = op.opening === 'top' ? [mid, box.max.y + 1] : [box.min.y - 1, mid];
      const cx = (box.min.x + box.max.x) / 2;
      const cz = (box.min.z + box.max.z) / 2;
      const r = Math.max(0.5, op.openingDiameter / 2);
      // Manifold's cylinders run up Z; turn it to stand on Y.
      const hole = Manifold.cylinder(y1 - y0, r, r, 96).rotate([-90, 0, 0]).translate([cx, y0, cz]);
      cut = cavity.add(hole);
      cavity.delete();
      hole.delete();
      shellSdf = subtract(shellSdf, cylinderSdf(cx, cz, r, y0, y1));
    }

    const solid = unionAll(source.map((b) => toManifold(b.geometry, b.matrix)));
    const m = solid.subtract(cut);
    solid.delete();
    cut.delete();
    try {
      const problem = describeStatus(m);
      if (problem) throw new Error(problem);
      return { geometry: toGeometry(m), volume_mm3: m.volume(), thickness_mm: 2 * t, sdf: shellSdf };
    } finally {
      m.delete();
    }
  });
}

/** Grid cells across the longest side of a melt. Draft is used while dragging. */
const MELT_CELLS = { draft: 56, normal: 100, fine: 150 };

/**
 * Melts bodies together with a smooth minimum of their distance functions, then meshes
 * the result with manifold's level-set mesher (marching tetrahedra, a sturdier cousin
 * of marching cubes that always closes up). Unlike a shell, the whole outside is
 * resampled, so resolution shows: Fine is smoother but several times slower.
 */
export function blendResult(op: BlendOp, bodies: Body[], draft: boolean): Combined {
  const quality = draft ? 'draft' : op.quality;
  const key = `${op.radius}|${quality}#${signature(bodies)}`;
  return cached(op.id, key, () => {
    if (!bodies.every((b) => b.sdf)) throw new Error("Melt can't measure one of these parts. Melt before any Deform, and note imported meshes can't be melted.");
    const k = Math.max(op.radius, 0.01);
    const sdf = smoothUnion(
      bodies.map((b) => ({ sdf: b.sdf!, min: b.bounds.min.toArray(), max: b.bounds.max.toArray() })),
      k,
    );
    const box = new THREE.Box3();
    bodies.forEach((b) => box.union(b.bounds));
    const size = box.getSize(new THREE.Vector3());
    const edge = Math.max(size.x, size.y, size.z) / MELT_CELLS[quality];
    // The fillet can bulge a little past the parts (k/4 at most), and the mesher needs a
    // margin of empty space all round to close the surface.
    box.expandByScalar(k / 4 + 2 * edge);
    const m = csg().Manifold.levelSet((p) => -sdf(p[0], p[1], p[2]), { min: box.min.toArray(), max: box.max.toArray() }, edge, 0);
    try {
      const problem = describeStatus(m);
      if (problem) throw new Error(problem);
      if (m.isEmpty()) throw new Error('Nothing came out of the melt.');
      return { geometry: toGeometry(m), volume_mm3: m.volume(), sdf };
    } finally {
      m.delete();
    }
  });
}

/**
 * Deforms the source. Turned parts can have long straight edges (a cylinder's side is
 * one span top to bottom), which can't twist or bend, so the mesh is first split until
 * no edge is longer than a fraction of the piece, then every vertex is moved.
 * The result has no distance function, so shell and melt need to come before a deform.
 */
export function deformResult(op: DeformOp, source: Body[], draft: boolean): Combined {
  const params = deformParamsOf(op);
  const key = `${JSON.stringify(params)}|${draft}#${signature(source)}`;
  return cached(op.id, key, () => {
    const box = new THREE.Box3();
    source.forEach((b) => box.union(b.bounds));
    const size = box.getSize(new THREE.Vector3());
    const cx = (box.min.x + box.max.x) / 2;
    const cz = (box.min.z + box.max.z) / 2;
    const solid = unionAll(source.map((b) => toManifold(b.geometry, b.matrix)));
    const refined = solid.refineToLength(Math.max(size.x, size.y, size.z) / (draft ? 40 : 90));
    solid.delete();
    const move = deformer(params, { cx, cz, y0: box.min.y, height: size.y, radius: Math.max(size.x, size.z) / 2 });
    const m = refined.warp((v) => move(v as Vec3));
    refined.delete();
    try {
      const problem = describeStatus(m);
      if (problem) throw new Error(problem);
      return { geometry: toGeometry(m), volume_mm3: m.volume(), sdf: null };
    } finally {
      m.delete();
    }
  });
}

export function disposeCombined(ops: OpNode[]) {
  const live = new Set(ops.map((o) => o.id));
  for (const [id, entry] of cache) {
    if (!live.has(id)) {
      entry.result.geometry.dispose();
      cache.delete(id);
    }
  }
}
