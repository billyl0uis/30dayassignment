// Edits to the feature tree. The op list is flat, but stacks, arrays, booleans,
// shells and melts consume other ops, which makes it a tree. Every function here is pure and keeps two rules:
//   1. an op only ever has one consumer, and
//   2. an op comes before whatever consumes it, so replaying the list in order works.

import type { ArrayOp, BlendOp, BooleanOp, DeformOp, ConsumerOp, Design, OpId, OpNode, ShellOp, StackOp, Vec3 } from './types';
import { identityTransform, newId } from './design';

export function inputsOf(op: OpNode): OpId[] {
  if (op.type === 'stack') return op.children;
  if (op.type === 'blend') return op.inputs;
  if (op.type === 'array' || op.type === 'shell' || op.type === 'deform') return [op.source];
  if (op.type === 'boolean') return [op.target, ...op.tools];
  return [];
}

/** child id → the op that uses it. */
export function consumers(ops: OpNode[]): Map<OpId, ConsumerOp> {
  const map = new Map<OpId, ConsumerOp>();
  for (const op of ops) if (op.type !== 'primitive') for (const id of inputsOf(op)) map.set(id, op);
  return map;
}

/** The op itself and everything under it. */
export function subtree(ops: OpNode[], id: OpId): Set<OpId> {
  const byId = new Map(ops.map((o) => [o.id, o]));
  const out = new Set<OpId>();
  const walk = (oid: OpId) => {
    const op = byId.get(oid);
    if (!op || out.has(oid)) return;
    out.add(oid);
    inputsOf(op).forEach(walk);
  };
  walk(id);
  return out;
}

/** True when the op is placed by a stack somewhere above it, so it can't be moved freely. */
export function placedByStack(ops: OpNode[], id: OpId): StackOp | null {
  const cons = consumers(ops);
  for (let c = cons.get(id); c; c = cons.get(c.id)) if (c.type === 'stack') return c;
  return null;
}

/**
 * Reorders ops so every input comes before its consumer, otherwise keeping the
 * current order. Edits like moving a part into a stack can break that, so they
 * all finish here.
 */
export function normalizeOrder(ops: OpNode[]): OpNode[] {
  const byId = new Map(ops.map((o) => [o.id, o]));
  const placed = new Set<OpId>();
  const out: OpNode[] = [];
  const visit = (op: OpNode, path: Set<OpId>) => {
    if (placed.has(op.id) || path.has(op.id)) return;
    path.add(op.id);
    for (const id of inputsOf(op)) {
      const child = byId.get(id);
      if (child) visit(child, path);
    }
    placed.add(op.id);
    out.push(op);
  };
  ops.forEach((op) => visit(op, new Set()));
  return out;
}

/**
 * Removes ops and tidies up after them: stacks and booleans forget removed children,
 * arrays, shells and booleans left without their source or target go too, and
 * materials no part uses any more are dropped.
 */
export function removeOps(design: Design, ids: OpId[]): Design {
  const gone = new Set(ids);
  let ops = design.ops;
  const orphan = (op: OpNode) => {
    const needs = op.type === 'array' || op.type === 'shell' || op.type === 'deform' ? op.source : op.type === 'boolean' ? op.target : null;
    return needs !== null && (gone.has(needs) || !ops.some((o) => o.id === needs));
  };
  for (;;) {
    ops.forEach((op) => orphan(op) && gone.add(op.id));
    const next = ops.filter((o) => !gone.has(o.id));
    if (next.length === ops.length) break;
    ops = next;
  }
  ops = ops.map((op) => {
    if (op.type === 'stack' && op.children.some((c) => gone.has(c))) return { ...op, children: op.children.filter((c) => !gone.has(c)) };
    if (op.type === 'boolean' && op.tools.some((c) => gone.has(c))) return { ...op, tools: op.tools.filter((c) => !gone.has(c)) };
    if (op.type === 'blend' && op.inputs.some((c) => gone.has(c))) return { ...op, inputs: op.inputs.filter((c) => !gone.has(c)) };
    return op;
  });
  ops = ops.filter((op) => op.type !== 'blend' || op.inputs.length > 0);
  return pruneMaterials({ ...design, ops });
}

function pruneMaterials(design: Design): Design {
  const used = new Set(design.ops.flatMap((o) => (o.type === 'primitive' ? [o.materialId] : [])));
  const materials = Object.fromEntries(Object.entries(design.materials).filter(([id]) => used.has(id)));
  return Object.keys(materials).length === Object.keys(design.materials).length ? design : { ...design, materials };
}

/** Takes an op out of whatever stack or array uses it, so it stands on its own. */
function detach(ops: OpNode[], id: OpId): OpNode[] {
  return ops.map((op) => (op.type === 'stack' && op.children.includes(id) ? { ...op, children: op.children.filter((c) => c !== id) } : op));
}

/** Wraps top-level ops in a new stack, lowest first. Returns the new design and stack id. */
export function createStack(design: Design, ids: OpId[]): { design: Design; id: OpId } {
  const cons = consumers(design.ops);
  const picked = design.ops.filter((o) => ids.includes(o.id) && !cons.has(o.id));
  const id = newId('stack');
  if (!picked.length) return { design, id };
  const y = (o: OpNode) => ('transform' in o ? o.transform.position[1] : 0);
  const children = [...picked].sort((a, b) => y(a) - y(b)).map((o) => o.id);
  const base = picked.find((o) => o.id === children[0]);
  const position: Vec3 = base && 'transform' in base ? [base.transform.position[0], 0, base.transform.position[2]] : [0, 0, 0];
  const stack: StackOp = {
    id,
    type: 'stack',
    label: `Stack ${design.ops.filter((o) => o.type === 'stack').length + 1}`,
    children,
    overlap: 0,
    transform: { ...identityTransform(), position },
  };
  return { design: { ...design, ops: normalizeOrder([...design.ops, stack]) }, id };
}

/** In a stack, a new op that wraps `oldId` takes its place. */
function replaceInStacks(ops: OpNode[], oldId: OpId, newId: OpId): OpNode[] {
  return ops.map((op) => (op.type === 'stack' && op.children.includes(oldId) ? { ...op, children: op.children.map((c) => (c === oldId ? newId : c)) } : op));
}

/** Makes an array of a top-level op. Radial arrays spin around the world's vertical axis. */
export function createArray(design: Design, sourceId: OpId, mode: ArrayOp['mode'], spacing: number): { design: Design; id: OpId } {
  const id = newId('array');
  const array: ArrayOp = {
    id,
    type: 'array',
    label: `${mode === 'radial' ? 'Radial' : 'Linear'} array ${design.ops.filter((o) => o.type === 'array').length + 1}`,
    source: sourceId,
    mode,
    count: mode === 'radial' ? 6 : 3,
    angle: 360,
    center: [0, 0],
    step: [spacing, 0, 0],
  };
  return { design: { ...design, ops: normalizeOrder([...replaceInStacks(design.ops, sourceId, id), array]) }, id };
}

/**
 * Combines the first id (the target, whose glass color the result keeps) with the
 * rest (the tools). Tools have to be free-standing, since a stack would otherwise be
 * placing something that's no longer there. Needs a target and at least one tool.
 */
export function createBoolean(design: Design, ids: OpId[], mode: BooleanOp['mode']): { design: Design; id: OpId } {
  const cons = consumers(design.ops);
  const exists = (id: OpId) => design.ops.some((o) => o.id === id);
  const [target, ...rest] = ids.filter(exists);
  const tools = rest.filter((t) => t !== target && !cons.has(t));
  const id = newId('bool');
  if (!target || !tools.length || (cons.has(target) && cons.get(target)!.type !== 'stack')) return { design, id };
  const names = { union: 'Union', subtract: 'Subtract', intersect: 'Intersect' };
  const op: BooleanOp = { id, type: 'boolean', label: `${names[mode]} ${design.ops.filter((o) => o.type === 'boolean').length + 1}`, mode, target, tools };
  return { design: { ...design, ops: normalizeOrder([...replaceInStacks(design.ops, target, id), op]) }, id };
}

/**
 * Melts the selected ops into one piece. Like a boolean, the first one may sit in a
 * stack (the melt takes its place); the rest have to be free-standing.
 */
export function createBlend(design: Design, ids: OpId[], radius: number): { design: Design; id: OpId } {
  const cons = consumers(design.ops);
  const exists = (id: OpId) => design.ops.some((o) => o.id === id);
  const [first, ...rest] = ids.filter(exists);
  const others = rest.filter((t) => t !== first && !cons.has(t));
  const id = newId('melt');
  if (!first || !others.length || (cons.has(first) && cons.get(first)!.type !== 'stack')) return { design, id };
  const op: BlendOp = {
    id,
    type: 'blend',
    label: `Melt ${design.ops.filter((o) => o.type === 'blend').length + 1}`,
    inputs: [first, ...others],
    radius,
    quality: 'normal',
  };
  return { design: { ...design, ops: normalizeOrder([...replaceInStacks(design.ops, first, id), op]) }, id };
}

/** Wraps an op in a deform with everything at zero, ready to push around. */
export function createDeform(design: Design, sourceId: OpId, noiseScale: number): { design: Design; id: OpId } {
  const id = newId('deform');
  const cons = consumers(design.ops).get(sourceId);
  if (cons && cons.type !== 'stack') return { design, id };
  const op: DeformOp = {
    id,
    type: 'deform',
    label: `Deform ${design.ops.filter((o) => o.type === 'deform').length + 1}`,
    source: sourceId,
    pinch: 0,
    ribs: 0,
    ribDepth: 2,
    twist: 0,
    sag: 0,
    bend: 0,
    noise: 0,
    noiseScale,
    seed: 1,
  };
  return { design: { ...design, ops: normalizeOrder([...replaceInStacks(design.ops, sourceId, id), op]) }, id };
}

/** Hollows an op to an even wall, open at the top by default. */
export function createShell(design: Design, sourceId: OpId, thickness: number, openingDiameter: number): { design: Design; id: OpId } {
  const id = newId('shell');
  const cons = consumers(design.ops).get(sourceId);
  if (cons && cons.type !== 'stack') return { design, id };
  const op: ShellOp = {
    id,
    type: 'shell',
    label: `Shell ${design.ops.filter((o) => o.type === 'shell').length + 1}`,
    source: sourceId,
    thickness,
    opening: 'top',
    openingDiameter,
  };
  return { design: { ...design, ops: normalizeOrder([...replaceInStacks(design.ops, sourceId, id), op]) }, id };
}

/**
 * Moves an op into a stack, sitting right on top of `belowId` (or on top of the whole
 * stack when that's missing), or out to the top level when `stackId` is null.
 */
export function moveToStack(design: Design, id: OpId, stackId: OpId | null, belowId?: OpId): Design {
  if (id === belowId) return design;
  if (stackId && subtree(design.ops, id).has(stackId)) return design; // can't put a stack inside itself
  const cons = consumers(design.ops).get(id);
  if (cons && cons.type !== 'stack') return design; // an array's, boolean's or shell's input belongs to it
  let ops = detach(design.ops, id);
  if (stackId) {
    ops = ops.map((op) => {
      if (op.id !== stackId || op.type !== 'stack') return op;
      const children = [...op.children];
      const at = belowId ? children.indexOf(belowId) + 1 : 0;
      children.splice(at > 0 ? at : children.length, 0, id);
      return { ...op, children };
    });
  }
  return { ...design, ops: normalizeOrder(ops) };
}

/**
 * Copies an op and everything under it with fresh ids (and fresh materials, so the
 * copy can be recolored on its own). A copy of a stack child joins the same stack
 * right above the original. `offset` shifts top-level copies so they don't overlap.
 */
export function duplicateOp(design: Design, id: OpId, offset: Vec3): { design: Design; id: OpId } {
  const ids = subtree(design.ops, id);
  const remap = new Map([...ids].map((oid) => [oid, newId(oid.split('_')[0])]));
  const materials = { ...design.materials };
  const r = (oid: OpId) => remap.get(oid) ?? oid;

  const copies: OpNode[] = design.ops
    .filter((o) => ids.has(o.id))
    .map((o) => {
      switch (o.type) {
        case 'primitive': {
          const mid = newId('mat');
          materials[mid] = { ...design.materials[o.materialId], id: mid };
          return { ...o, id: r(o.id), materialId: mid, label: `${o.label} copy` };
        }
        case 'stack':
          return { ...o, id: r(o.id), children: o.children.map(r), label: `${o.label} copy` };
        case 'array':
        case 'shell':
        case 'deform':
          return { ...o, id: r(o.id), source: r(o.source), label: `${o.label} copy` };
        case 'boolean':
          return { ...o, id: r(o.id), target: r(o.target), tools: o.tools.map(r), label: `${o.label} copy` };
        case 'blend':
          return { ...o, id: r(o.id), inputs: o.inputs.map(r), label: `${o.label} copy` };
      }
    });

  const newRoot = r(id);
  const parent = consumers(design.ops).get(id);
  let ops = design.ops;
  if (parent?.type === 'stack') {
    ops = ops.map((op) => (op.id === parent.id && op.type === 'stack' ? { ...op, children: op.children.flatMap((c) => (c === id ? [c, newRoot] : [c])) } : op));
  } else {
    const shifted = offsetOp(copies, newRoot, offset);
    copies.splice(0, copies.length, ...shifted);
  }
  const at = Math.max(...ops.map((o, i) => (ids.has(o.id) ? i : -1))) + 1;
  ops = [...ops.slice(0, at), ...copies, ...ops.slice(at)];
  return { design: { ...design, ops: normalizeOrder(ops), materials }, id: newRoot };
}

/**
 * Moves an op by `d`. Arrays, booleans, shells and melts have no position of their own, so
 * what they're made from moves instead (and an array's axis with it).
 */
export function offsetOp(ops: OpNode[], id: OpId, d: Vec3): OpNode[] {
  const op = ops.find((o) => o.id === id);
  if (!op) return ops;
  if (op.type === 'boolean' || op.type === 'shell' || op.type === 'blend' || op.type === 'deform') return inputsOf(op).reduce((acc, input) => offsetOp(acc, input, d), ops);
  if (op.type === 'array') {
    const moved = ops.map((o) => (o.id === id && o.type === 'array' ? { ...o, center: [o.center[0] + d[0], o.center[1] + d[2]] as [number, number] } : o));
    return offsetOp(moved, op.source, d);
  }
  return ops.map((o) =>
    o.id === id && (o.type === 'primitive' || o.type === 'stack')
      ? { ...o, transform: { ...o.transform, position: o.transform.position.map((v, i) => v + d[i]) as Vec3 } }
      : o,
  );
}
