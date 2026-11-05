import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createDesign, createMaterial, identityTransform } from '../src/model/design';
import type { DeformOp, Design, PrimitiveOp } from '../src/model/types';
import { createDeform, createShell } from '../src/model/tree';
import { evaluateOps } from '../src/engine/evaluate';
import { initCsg } from '../src/engine/csg';
import { deformer, NO_DEFORM, randomDeform, valueNoise, type DeformParams } from '../src/geometry/deform';

beforeAll(() => initCsg());

const cyl: PrimitiveOp = { id: 'c', type: 'primitive', label: 'c', preset: 'cylinder', params: { height: 120, diameter: 60 }, transform: identityTransform(), materialId: 'm' };
const designOf = (...ops: Design['ops']) => ({ ...createDesign(), ops, materials: { m: createMaterial({ id: 'm' }) } });
const frame = { cx: 0, cz: 0, y0: 0, height: 100, radius: 30 };
const at = (p: Partial<DeformParams>, v: [number, number, number]) => {
  const out: [number, number, number] = [...v];
  deformer({ ...NO_DEFORM, ...p }, frame)(out);
  return out;
};

describe('deformers', () => {
  it('leave everything alone at zero', () => {
    at({}, [12, 40, -7]).forEach((v, i) => expect(v).toBeCloseTo([12, 40, -7][i], 9));
  });

  it('twist turns the top by the full angle and the bottom not at all', () => {
    const top = at({ twist: 90 }, [30, 100, 0]);
    expect(top[0]).toBeCloseTo(0);
    expect(top[2]).toBeCloseTo(30);
    expect(at({ twist: 90 }, [30, 0, 0])).toEqual([30, 0, 0]);
  });

  it('pinch draws in the middle only', () => {
    expect(at({ pinch: 0.5 }, [30, 50, 0])[0]).toBeCloseTo(15);
    expect(at({ pinch: 0.5 }, [30, 0, 0])[0]).toBeCloseTo(30);
  });

  it('sag drops the top by the amount and leaves the base', () => {
    expect(at({ sag: 10 }, [0, 100, 0])[1]).toBeCloseTo(90);
    expect(at({ sag: 10 }, [0, 0, 0])[1]).toBeCloseTo(0);
  });

  it('bend keeps the axis length and leans the top toward +X', () => {
    const top = at({ bend: 90 }, [0, 100, 0]);
    // A 90° arc of length 100 has radius 200/π: the top ends that far over and up.
    expect(top[0]).toBeCloseTo(200 / Math.PI, 3);
    expect(top[1]).toBeCloseTo(200 / Math.PI, 3);
  });

  it('noise is repeatable and stays in range', () => {
    const n = valueNoise(3);
    expect(n(1.3, 2.2, 0.4)).toBe(valueNoise(3)(1.3, 2.2, 0.4));
    for (let i = 0; i < 200; i++) expect(Math.abs(n(i * 0.37, i * 0.11, i * 0.53))).toBeLessThanOrEqual(1);
  });

  it('variations are bounded by the piece size', () => {
    let s = 0.3;
    const rand = () => (s = (s * 9301 + 49297) % 233280 / 233280);
    for (let i = 0; i < 50; i++) {
      const p = randomDeform(rand, 100);
      expect(Math.abs(p.pinch)).toBeLessThanOrEqual(0.3);
      expect(p.sag).toBeLessThanOrEqual(12);
    }
  });
});

describe('deform op', () => {
  it('ribs keep a closed solid whose volume barely changes; pinch takes glass away', () => {
    const base = evaluateOps([cyl]).bodies[0].volume_mm3;
    const { design, id } = createDeform(designOf(cyl), 'c', 30);
    const set = (patch: Partial<DeformOp>) => design.ops.map((o) => (o.id === id ? { ...(o as DeformOp), ...patch } : o));
    const t0 = performance.now();
    const ribbed = evaluateOps(set({ ribs: 12, ribDepth: 2, twist: 90 }));
    const ms = performance.now() - t0;
    expect(ribbed.errors.size).toBe(0);
    expect(ribbed.bodies[0].volume_mm3 / base).toBeCloseTo(1, 1);
    expect(ms).toBeLessThan(2000);
    const pinched = evaluateOps(set({ pinch: 0.4 }));
    expect(pinched.bodies[0].volume_mm3).toBeLessThan(base * 0.85);
    const size = pinched.bodies[0].bounds.getSize(new THREE.Vector3());
    expect(size.y).toBeCloseTo(120, 0);
  });

  it('a bent piece has the same glass and leans over', () => {
    const { design, id } = createDeform(designOf(cyl), 'c', 30);
    const bent = evaluateOps(design.ops.map((o) => (o.id === id ? { ...(o as DeformOp), bend: 60 } : o))).bodies[0];
    const straight = evaluateOps([cyl]).bodies[0];
    expect(bent.volume_mm3 / straight.volume_mm3).toBeCloseTo(1, 1);
    expect(bent.bounds.max.x).toBeGreaterThan(straight.bounds.max.x + 20);
  });

  it('explains that shell has to come before a deform', () => {
    const d = createDeform(designOf(cyl), 'c', 30);
    const s = createShell(d.design, d.id, 3, 40);
    expect(evaluateOps(s.design.ops).errors.get(s.id)).toMatch(/before any Deform/);
  });
});
