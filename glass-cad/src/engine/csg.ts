// The bridge to manifold-3d, a WebAssembly CSG kernel that guarantees watertight
// results. It loads once at startup; after that every call is synchronous, so the
// evaluator can stay a plain function.

import Module, { type Manifold, type ManifoldToplevel } from 'manifold-3d';
import * as THREE from 'three';
import { mergeVertices, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

let wasm: ManifoldToplevel | null = null;

/** Pass the .wasm file's URL in the browser; Node finds it on its own. */
export async function initCsg(wasmUrl?: string): Promise<void> {
  if (wasm) return;
  const m = await Module(wasmUrl ? { locateFile: () => wasmUrl } : undefined);
  m.setup();
  wasm = m;
}

export function csg(): ManifoldToplevel {
  if (!wasm) throw new Error('The geometry engine is still loading.');
  return wasm;
}

interface Welded {
  verts: Float32Array;
  tris: Uint32Array;
}

const welded = new WeakMap<THREE.BufferGeometry, Welded>();

/**
 * Render meshes split vertices at every crease and seam, and turned parts pinch to a
 * point at the axis. Manifold needs each corner shared once and no zero-area slivers,
 * so this welds by position and drops the pinched triangles. Cached per geometry.
 */
function weld(geometry: THREE.BufferGeometry): Welded {
  const hit = welded.get(geometry);
  if (hit) return hit;
  const bare = new THREE.BufferGeometry();
  bare.setAttribute('position', geometry.getAttribute('position').clone());
  if (geometry.index) bare.setIndex(geometry.index.clone());
  const merged = mergeVertices(bare, 1e-4);
  const index = merged.index!.array;
  const tris: number[] = [];
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i];
    const b = index[i + 1];
    const c = index[i + 2];
    if (a !== b && b !== c && a !== c) tris.push(a, b, c);
  }
  const out = { verts: new Float32Array(merged.getAttribute('position').array), tris: new Uint32Array(tris) };
  bare.dispose();
  merged.dispose();
  welded.set(geometry, out);
  return out;
}

/** A placed body as a manifold. The caller owns the result and must `delete()` it. */
export function toManifold(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4): Manifold {
  const { Manifold, Mesh } = csg();
  const { verts, tris } = weld(geometry);
  const placed = new Float32Array(verts.length);
  const v = new THREE.Vector3();
  for (let i = 0; i < verts.length; i += 3) {
    v.set(verts[i], verts[i + 1], verts[i + 2]).applyMatrix4(matrix);
    placed[i] = v.x;
    placed[i + 1] = v.y;
    placed[i + 2] = v.z;
  }
  let triVerts = tris;
  if (matrix.determinant() < 0) {
    // A mirror turns the faces inside out; swap two corners to turn them back.
    triVerts = tris.slice();
    for (let i = 0; i < triVerts.length; i += 3) [triVerts[i + 1], triVerts[i + 2]] = [triVerts[i + 2], triVerts[i + 1]];
  }
  const mesh = new Mesh({ numProp: 3, vertProperties: placed, triVerts });
  mesh.merge();
  return new Manifold(mesh);
}

const CREASE = Math.PI / 6; // same as presets: sharp cut edges stay crisp

export function toGeometry(m: Manifold): THREE.BufferGeometry {
  const mesh = m.getMesh();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(mesh.vertProperties), 3));
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(mesh.triVerts), 1));
  const out = toCreasedNormals(geo, CREASE);
  geo.dispose();
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

/** Unions a list of manifolds, deleting the inputs. */
export function unionAll(parts: Manifold[]): Manifold {
  const { Manifold } = csg();
  if (parts.length === 1) return parts[0];
  const out = Manifold.union(parts);
  parts.forEach((p) => p.delete());
  return out;
}

/** Turns manifold's error codes into something a glassblower can act on. */
export function describeStatus(m: Manifold): string | null {
  const status = String(m.status());
  return status === 'NoError' ? null : `The geometry engine couldn't use this shape (${status}).`;
}
