import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createDesign, createMaterial, identityTransform } from '../src/model/design';
import type { ArrayOp, Design, OpNode, PrimitiveOp, StackOp } from '../src/model/types';
import { createArray, createStack, duplicateOp, moveToStack, normalizeOrder, removeOps } from '../src/model/tree';
import { arrayMatrices, bodiesOf, evaluateOps, unionBounds } from '../src/engine/evaluate';
import { inch } from '../src/model/units';
import { closestOnLine, handleLine, handlePosition, valueAt } from '../src/geometry/handles';
import { deleteDesign, listDesigns, loadCurrent, loadDesign, saveDesign } from '../src/store/library';

function part(id: string, preset: string, params: Record<string, number>, x = 0): PrimitiveOp {
  return { id, type: 'primitive', label: id, preset, params, transform: { ...identityTransform(), position: [x, 0, 0] }, materialId: `m_${id}` };
}

function designWith(...ops: OpNode[]): Design {
  const d = createDesign();
  d.ops = ops;
  for (const op of ops) if (op.type === 'primitive') d.materials[op.materialId] = createMaterial({ id: op.materialId });
  return d;
}

const cyl = (id: string, h: number, x = 0) => part(id, 'cylinder', { height: h, diameter: 50 }, x);
const ids = (d: Design) => d.ops.map((o) => o.id);
const size = (box: THREE.Box3) => box.getSize(new THREE.Vector3());

describe('stacking', () => {
  it('piles children up the axis, lowest first, whatever their x', () => {
    const { design } = createStack(designWith(cyl('a', 30, 0), cyl('b', 20, 200), cyl('c', 10, -90)), ['a', 'b', 'c']);
    const { bodies } = evaluateOps(design.ops);
    const box = unionBounds(bodies);
    expect(box.min.y).toBeCloseTo(0);
    expect(box.max.y).toBeCloseTo(60);
    expect(size(box).x).toBeCloseTo(50, 0); // all centred on one axis
    const b = unionBounds(bodiesOf(bodies, 'b'));
    expect(b.min.y).toBeCloseTo(30);
    expect(b.max.y).toBeCloseTo(50);
  });

  it('sinks each part into the one below by the overlap', () => {
    const { design, id } = createStack(designWith(cyl('a', 30), cyl('b', 20)), ['a', 'b']);
    const ops = design.ops.map((o) => (o.id === id ? { ...(o as StackOp), overlap: 5 } : o));
    expect(unionBounds(evaluateOps(ops).bodies).max.y).toBeCloseTo(45);
  });

  it('reorders when a part is moved on top of another', () => {
    const { design, id } = createStack(designWith(cyl('a', 30), cyl('b', 20), cyl('c', 10)), ['a', 'b', 'c']);
    const moved = moveToStack(design, 'a', id, 'c'); // a goes to the top
    expect((moved.ops.find((o) => o.id === id) as StackOp).children).toEqual(['b', 'c', 'a']);
    const back = moveToStack(moved, 'a', id, 'b'); // a sits right on b
    expect((back.ops.find((o) => o.id === id) as StackOp).children).toEqual(['b', 'a', 'c']);
  });

  it('keeps inputs before consumers when a later part joins an earlier stack', () => {
    const { design, id } = createStack(designWith(cyl('a', 30), cyl('b', 20)), ['a']);
    const later = { ...design, ops: [...design.ops, cyl('z', 5)] };
    const joined = moveToStack(later, 'z', id);
    expect(ids(joined).indexOf('z')).toBeLessThan(ids(joined).indexOf(id));
  });

  it('refuses to put a stack inside itself', () => {
    const { design, id } = createStack(designWith(cyl('a', 30)), ['a']);
    const outer = createStack(design, [id]);
    expect(moveToStack(outer.design, outer.id, id)).toBe(outer.design);
  });
});

describe('arrays', () => {
  it('spaces a full circle evenly and a partial sweep end to end', () => {
    const base: ArrayOp = { id: 'r', type: 'array', label: '', source: 'a', mode: 'radial', count: 4, angle: 360, center: [0, 0], step: [0, 0, 0] };
    const angle = (m: THREE.Matrix4) => Math.round(THREE.MathUtils.radToDeg(new THREE.Euler().setFromRotationMatrix(m, 'YXZ').y));
    expect(arrayMatrices({ ...base, angle: 360, center: [0, 0] }).map((m) => new THREE.Vector3(10, 0, 0).applyMatrix4(m).toArray().map((v) => Math.round(v) + 0))).toEqual([
      [10, 0, 0],
      [0, 0, -10],
      [-10, 0, 0],
      [0, 0, 10],
    ]);
    expect(arrayMatrices({ ...base, angle: 90, center: [0, 0], count: 3 }).map(angle)).toEqual([0, 45, 90]);
  });

  it('counts every copy in the volume and selects copies with the array, not the part', () => {
    const one = evaluateOps([part('p', 'sphere', { diameter: 20 }, 60)]).bodies[0].volume_mm3;
    const { design, id } = createArray(designWith(part('p', 'sphere', { diameter: 20 }, 60)), 'p', 'radial', 0);
    const { bodies } = evaluateOps(design.ops);
    expect(bodies).toHaveLength(6);
    expect(bodies.reduce((s, b) => s + b.volume_mm3, 0)).toBeCloseTo(one * 6, 3);
    expect(bodiesOf(bodies, 'p')).toHaveLength(1);
    expect(bodiesOf(bodies, id)).toHaveLength(6);
    expect(size(unionBounds(bodies)).x).toBeCloseTo(140, 0); // ring of radius 60 plus the sphere
  });

  it('copies in a row for linear arrays', () => {
    const { design } = createArray(designWith(cyl('a', 10)), 'a', 'linear', 70);
    const box = unionBounds(evaluateOps(design.ops).bodies);
    expect(size(box).x).toBeCloseTo(50 + 2 * 70);
  });

  it('takes the place of its source inside a stack', () => {
    const { design, id } = createStack(designWith(cyl('a', 30), cyl('b', 20)), ['a', 'b']);
    const arr = createArray(design, 'b', 'radial', 0);
    expect((arr.design.ops.find((o) => o.id === id) as StackOp).children).toEqual(['a', arr.id]);
  });
});

describe('removing and duplicating', () => {
  it('drops arrays left without a source and frees a stack’s children', () => {
    const { design, id } = createStack(designWith(cyl('a', 30), cyl('b', 20)), ['a', 'b']);
    const arr = createArray(design, 'a', 'linear', 10);
    const out = removeOps(arr.design, ['a']);
    expect(ids(out)).toEqual(['b', id]);
    expect((out.ops.find((o) => o.id === id) as StackOp).children).toEqual(['b']);
    expect(Object.keys(out.materials)).toEqual(['m_b']);
  });

  it('copies a whole stack with new ids, beside the original', () => {
    const { design, id } = createStack(designWith(cyl('a', 30), cyl('b', 20)), ['a', 'b']);
    const dup = duplicateOp(design, id, [100, 0, 0]);
    expect(dup.design.ops).toHaveLength(6);
    expect(new Set(ids(dup.design)).size).toBe(6);
    const box = unionBounds(bodiesOf(evaluateOps(dup.design.ops).bodies, dup.id));
    expect(box.getCenter(new THREE.Vector3()).x).toBeCloseTo(100);
  });

  it('puts a copied stack child right on top of the original', () => {
    const { design, id } = createStack(designWith(cyl('a', 30), cyl('b', 20)), ['a', 'b']);
    const dup = duplicateOp(design, 'a', [0, 0, 0]);
    expect((dup.design.ops.find((o) => o.id === id) as StackOp).children).toEqual(['a', dup.id, 'b']);
    expect(unionBounds(evaluateOps(dup.design.ops).bodies).max.y).toBeCloseTo(80);
  });

  it('normalizeOrder leaves a valid order alone', () => {
    const ops = createStack(designWith(cyl('a', 30), cyl('b', 20)), ['a', 'b']).design.ops;
    expect(normalizeOrder(ops)).toEqual(ops);
  });
});

describe('drag handles', () => {
  it('turns a drag along the side into a diameter, and up into a height', () => {
    const side = { axis: 'x', level: 0.5 } as const;
    const line = handleLine(side, 50, 100);
    // Looking straight down at x = 40: the closest point on the line is 40 along, so diameter 80.
    expect(valueAt(side, closestOnLine(line.origin, line.dir, [40, 500, 3], [0, -1, 0])!)).toBeCloseTo(80);
    const up = handleLine({ axis: 'y' }, 100, 100);
    expect(valueAt({ axis: 'y' }, closestOnLine(up.origin, up.dir, [300, 120, 0], [-1, 0, 0])!)).toBeCloseTo(120);
    expect(handlePosition(side, 50, 100)).toEqual([25, 50, 0]);
  });

  it('gives up on a ray parallel to the handle', () => {
    expect(closestOnLine([0, 0, 0], [1, 0, 0], [0, 5, 0], [1, 0, 0])).toBeNull();
  });
});

describe('design library', () => {
  const memory = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
  };

  it('saves, lists newest first, reopens and deletes', () => {
    const store = memory();
    const a = { ...designWith(cyl('a', 30)), name: 'Goblet' };
    const b = { ...designWith(cyl('b', 30)), name: 'Bone vase' };
    saveDesign(store, a, 1);
    saveDesign(store, b, 2);
    expect(listDesigns(store).map((e) => e.name)).toEqual(['Bone vase', 'Goblet']);
    expect(loadDesign(store, a.id)?.name).toBe('Goblet');
    expect(loadCurrent(store)?.id).toBe(b.id);
    deleteDesign(store, a.id);
    expect(listDesigns(store).map((e) => e.name)).toEqual(['Bone vase']);
  });

  it('moves a step 1 save into the library', () => {
    const store = memory();
    const old = designWith(part('x', 'sphere', { diameter: inch(4) }));
    store.setItem('glass-cad:design', JSON.stringify(old));
    expect(loadCurrent(store)?.id).toBe(old.id);
    expect(store.getItem('glass-cad:design')).toBeNull();
    expect(listDesigns(store)).toHaveLength(1);
  });
});
