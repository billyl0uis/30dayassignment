// Replays the op list into bodies: one placed mesh per visible piece of glass. Each
// primitive's geometry is cached under a key built from its inputs, so changing one
// part's numbers rebuilds only that part; stacks and arrays only move copies around,
// and booleans and shells (combine.ts) cache their results the same way.

import * as THREE from 'three';
import type { ArrayOp, BlendOp, BooleanOp, DeformOp, MatId, OpId, OpNode, PrimitiveOp, ShellOp, StackOp, Transform } from '../model/types';
import { getPreset } from '../presets/registry';
import { withDefaults } from '../presets/types';
import { buildSection } from '../geometry/build';
import { glassThickness, sectionSize, sectionVolume } from '../geometry/section';
import { sectionSdf, type Sdf } from '../geometry/sdf';
import { meshSignedVolume } from '../geometry/measure';
import { blendResult, booleanResult, deformResult, disposeCombined, shellResult, type Combined } from './combine';

export interface Body {
  key: string;
  /** Inner to outer: the primitive, then each stack or array that placed it. */
  owners: OpId[];
  /**
   * Index in `owners` of the outermost array that made this body a copy, or -1. Lets
   * selecting a part highlight just the part while selecting its array shows them all.
   */
  copyLevel: number;
  materialId: MatId;
  geometry: THREE.BufferGeometry;
  matrix: THREE.Matrix4; // part space → world
  volume_mm3: number;
  thickness_mm: number;
  height_mm: number; // unplaced part height, for drag handles
  bounds: THREE.Box3; // world space
  /** Distance to the surface in world space, negative inside. Shells need it. */
  sdf: Sdf | null;
  /** For a boolean or shell result, the bodies it was made from, placed the same way. */
  inputs?: Body[];
}

export interface Evaluation {
  bodies: Body[]; // everything visible, in op order
  errors: Map<OpId, string>; // ops that couldn't be built, and why
}

interface Cached {
  key: string;
  geometry: THREE.BufferGeometry;
  volume_mm3: number;
  thickness_mm: number;
  height_mm: number;
  sdf: Sdf | null;
}

const cache = new Map<string, Cached>();

export interface EvaluateOptions {
  /** Coarser melts, for while something is being dragged. */
  draft?: boolean;
}

export function evaluateOps(ops: OpNode[], options: EvaluateOptions = {}): Evaluation {
  const out = new Map<OpId, Body[]>();
  const used = new Set<OpId>();
  const errors = new Map<OpId, string>();
  for (const op of ops) {
    if (op.suppressed) continue;
    try {
      if (op.type === 'primitive') out.set(op.id, [primitiveBody(op)]);
      else if (op.type === 'stack') out.set(op.id, stackBodies(op, out, used));
      else if (op.type === 'array') out.set(op.id, arrayBodies(op, out, used));
      else if (op.type === 'boolean') out.set(op.id, booleanBodies(op, out, used));
      else if (op.type === 'shell') out.set(op.id, shellBodies(op, out, used));
      else if (op.type === 'deform') out.set(op.id, deformBodies(op, out, used, options.draft ?? false));
      else out.set(op.id, blendBodies(op, out, used, options.draft ?? false));
    } catch (e) {
      errors.set(op.id, e instanceof Error ? e.message : String(e));
    }
  }
  disposeUnused(ops);
  disposeCombined(ops);
  return { bodies: ops.flatMap((op) => (used.has(op.id) ? [] : (out.get(op.id) ?? []))), errors };
}

/** Takes an op's inputs off the board, failing if any is missing (suppressed or broken). */
function take(ids: OpId[], out: Map<OpId, Body[]>, used: Set<OpId>, what: string): Body[][] {
  const groups = ids.map((id) => out.get(id));
  if (groups.some((g) => !g?.length)) throw new Error(`Turn the ${what} back on (or fix it) to build this.`);
  ids.forEach((id) => used.add(id));
  return groups as Body[][];
}

function booleanBodies(op: BooleanOp, out: Map<OpId, Body[]>, used: Set<OpId>): Body[] {
  const [target, ...toolGroups] = take([op.target, ...op.tools], out, used, 'target and tools');
  const tools = toolGroups.flat();
  if (!tools.length) throw new Error('Add a tool part to combine with.');
  return [combinedBody(op.id, target, booleanResult(op, target, tools), [...target, ...tools])];
}

function shellBodies(op: ShellOp, out: Map<OpId, Body[]>, used: Set<OpId>): Body[] {
  const [source] = take([op.source], out, used, 'source part');
  return [combinedBody(op.id, source, shellResult(op, source), source)];
}

function deformBodies(op: DeformOp, out: Map<OpId, Body[]>, used: Set<OpId>, draft: boolean): Body[] {
  const [source] = take([op.source], out, used, 'source part');
  return [combinedBody(op.id, source, deformResult(op, source, draft), source)];
}

function blendBodies(op: BlendOp, out: Map<OpId, Body[]>, used: Set<OpId>, draft: boolean): Body[] {
  const groups = take(op.inputs, out, used, 'parts in this melt');
  if (groups.length < 2) throw new Error('A melt needs at least two parts.');
  const inputs = groups.flat();
  return [combinedBody(op.id, inputs, blendResult(op, inputs, draft), inputs)];
}

function combinedBody(id: OpId, from: Body[], result: Combined, inputs: Body[]): Body {
  const bounds = result.geometry.boundingBox!.clone();
  return {
    key: id,
    owners: [id],
    copyLevel: -1,
    materialId: from[0].materialId, // the result is one piece of glass, in the target's color
    geometry: result.geometry,
    matrix: new THREE.Matrix4(),
    volume_mm3: result.volume_mm3,
    thickness_mm: result.thickness_mm ?? from[0].thickness_mm,
    height_mm: bounds.max.y - bounds.min.y,
    bounds,
    sdf: result.sdf,
    inputs,
  };
}

function primitiveBody(op: PrimitiveOp): Body {
  const built = build(op);
  const matrix = composeTransform(op.transform);
  return {
    key: op.id,
    owners: [op.id],
    copyLevel: -1,
    materialId: op.materialId,
    geometry: built.geometry,
    matrix,
    volume_mm3: built.volume_mm3 * Math.abs(matrix.determinant()),
    thickness_mm: built.thickness_mm,
    height_mm: built.height_mm,
    bounds: worldBounds(built.geometry, matrix),
    sdf: built.sdf && placeSdf(built.sdf, matrix),
  };
}

function stackBodies(op: StackOp, out: Map<OpId, Body[]>, used: Set<OpId>): Body[] {
  const placed: Body[] = [];
  let top: number | null = null;
  for (const id of op.children) {
    const group = out.get(id);
    if (!group?.length || used.has(id)) continue;
    used.add(id);
    const box = unionBounds(group);
    const c = box.getCenter(new THREE.Vector3());
    // Centre each child on the stack's axis and sit it on the one below.
    const floor: number = top === null ? 0 : top - op.overlap;
    const shift = new THREE.Matrix4().makeTranslation(-c.x, floor - box.min.y, -c.z);
    placed.push(...group.map((b) => moved(b, shift)));
    top = box.max.y + floor - box.min.y;
  }
  const m = composeTransform(op.transform);
  return placed.map((b) => ({ ...moved(b, m), owners: [...b.owners, op.id] }));
}

function arrayBodies(op: ArrayOp, out: Map<OpId, Body[]>, used: Set<OpId>): Body[] {
  const source = out.get(op.source);
  if (!source || used.has(op.source)) return [];
  used.add(op.source);
  const level = source[0]?.owners.length ?? 0; // where this array lands in owners
  return arrayMatrices(op).flatMap((m, i) =>
    source.map((b) => ({
      ...moved(b, m),
      key: `${b.key}/${op.id}:${i}`,
      owners: [...b.owners, op.id],
      copyLevel: i > 0 ? level : b.copyLevel,
    })),
  );
}

/** One matrix per copy; the first copy is always the source where it stands. */
export function arrayMatrices(op: ArrayOp): THREE.Matrix4[] {
  const count = Math.max(1, Math.round(op.count));
  return Array.from({ length: count }, (_, i) => {
    if (op.mode === 'linear') return new THREE.Matrix4().makeTranslation(op.step[0] * i, op.step[1] * i, op.step[2] * i);
    const full = Math.abs(op.angle) >= 359.999;
    const stepDeg = full ? op.angle / count : count > 1 ? op.angle / (count - 1) : 0;
    const [cx, cz] = op.center;
    return new THREE.Matrix4()
      .makeTranslation(cx, 0, cz)
      .multiply(new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(stepDeg * i)))
      .multiply(new THREE.Matrix4().makeTranslation(-cx, 0, -cz));
  });
}

function moved(b: Body, m: THREE.Matrix4): Body {
  const matrix = m.clone().multiply(b.matrix);
  return {
    ...b,
    matrix,
    volume_mm3: b.volume_mm3 * Math.abs(m.determinant()),
    bounds: worldBounds(b.geometry, matrix),
    sdf: b.sdf && placeSdf(b.sdf, m),
    inputs: b.inputs?.map((i) => moved(i, m)),
  };
}

/**
 * An SDF moved by a matrix: look the point up back in the shape's own space. Under a
 * stretch, distances are scaled by the smallest stretch, which keeps them conservative.
 */
function placeSdf(sdf: Sdf, m: THREE.Matrix4): Sdf {
  const inv = m.clone().invert().elements;
  const s = new THREE.Vector3().setFromMatrixScale(m);
  const k = Math.min(Math.abs(s.x), Math.abs(s.y), Math.abs(s.z));
  return (x, y, z) =>
    sdf(inv[0] * x + inv[4] * y + inv[8] * z + inv[12], inv[1] * x + inv[5] * y + inv[9] * z + inv[13], inv[2] * x + inv[6] * y + inv[10] * z + inv[14]) * k;
}

export function composeTransform({ position, rotation, scale }: Transform): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(...scale),
  );
}

/** Tight world bounds from the vertices: a turned part's box corners overshoot once it's tilted. */
function worldBounds(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4): THREE.Box3 {
  const pos = geometry.getAttribute('position');
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) box.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(matrix));
  return box;
}

export function unionBounds(bodies: Body[]): THREE.Box3 {
  const box = new THREE.Box3();
  for (const b of bodies) box.union(b.bounds);
  return box;
}

/**
 * The bodies that are "this op" on screen; for a part inside an array, just the
 * original. Parts used up by a boolean or shell are found among its inputs.
 */
export function bodiesOf(bodies: Body[], id: OpId): Body[] {
  const own = (b: Body) => {
    const at = b.owners.indexOf(id);
    return at >= 0 && b.copyLevel <= at;
  };
  const found = bodies.filter(own);
  const inputs = bodies.flatMap((b) => b.inputs ?? []);
  return found.length || !inputs.length ? found : bodiesOf(inputs, id);
}

/**
 * Faint outlines of what went into a boolean or shell, shown while it or one of its
 * parts is selected, so tools that were cut away can still be seen and moved.
 */
export function ghostsFor(bodies: Body[], selection: OpId[]): Body[] {
  // A result is "selected" only by its own op, not by a stack around it, or every
  // boolean in a big stack would light up at once.
  const picked = (b: Body) => (b.inputs ? selection.includes(b.owners[0]) : b.owners.some((o) => selection.includes(o)));
  const involved = (b: Body): boolean => picked(b) || (b.inputs ?? []).some(involved);
  const out: Body[] = [];
  const walk = (b: Body) => {
    if (!b.inputs) return;
    if (involved(b)) out.push(...b.inputs);
    b.inputs.forEach(walk);
  };
  bodies.forEach(walk);
  return out;
}

function build(op: PrimitiveOp): Cached {
  const key = JSON.stringify([op.preset, op.params, op.shape ?? null, op.mesh?.id ?? null]);
  const hit = cache.get(op.id);
  if (hit?.key === key) return hit;
  hit?.geometry.dispose();
  const def = getPreset(op.preset);
  const section = def.section(withDefaults(def, op.params), op.shape, op.mesh);
  const entry = {
    key,
    geometry: buildSection(section),
    volume_mm3: 0,
    thickness_mm: glassThickness(section),
    height_mm: sectionSize(section).height,
    sdf: sectionSdf(section),
  };
  // Sweeps and implicit shapes have no closed-form volume; measure the mesh instead.
  entry.volume_mm3 = sectionVolume(section) ?? meshSignedVolume(entry.geometry.getAttribute('position').array);
  cache.set(op.id, entry);
  return entry;
}

// Suppressed parts keep their geometry, so switching one back on is instant.
function disposeUnused(ops: OpNode[]) {
  const live = new Set(ops.map((o) => o.id));
  for (const [id, entry] of cache) {
    if (!live.has(id)) {
      entry.geometry.dispose();
      cache.delete(id);
    }
  }
}
