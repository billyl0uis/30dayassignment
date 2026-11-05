import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createDesign, createMaterial, identityTransform } from '../src/model/design';
import type { BlendOp, BooleanOp, Design, OpNode, PrimitiveOp, ShellOp, StackOp } from '../src/model/types';
import { createBlend, createBoolean, createShell, createStack, duplicateOp, removeOps } from '../src/model/tree';
import { bodiesOf, evaluateOps, ghostsFor, unionBounds } from '../src/engine/evaluate';
import { initCsg } from '../src/engine/csg';
import { getPreset } from '../src/presets/registry';
import { sectionSdf, smoothMin, smoothUnion } from '../src/geometry/sdf';
import { meshSignedVolume } from '../src/geometry/measure';

beforeAll(() => initCsg());

function part(id: string, preset: string, params: Record<string, number>, at: [number, number, number] = [0, 0, 0]): PrimitiveOp {
  return { id, type: 'primitive', label: id, preset, params, transform: { ...identityTransform(), position: at }, materialId: `m_${id}` };
}
function designWith(...ops: OpNode[]): Design {
  const d = createDesign();
  d.ops = ops;
  for (const op of ops) if (op.type === 'primitive') d.materials[op.materialId] = createMaterial({ id: op.materialId });
  return d;
}
const sdfOf = (preset: string, params: Record<string, number>) => sectionSdf(getPreset(preset).section({ ...params }))!;
// 96-sided render meshes hold a touch less than the true circle: n·sin(2π/n) / 2π.
const POLY = (96 * Math.sin((2 * Math.PI) / 96)) / (2 * Math.PI);

describe('distance functions', () => {
  it('match the closed forms for a sphere, cylinder, torus and hollow sphere', () => {
    const s = sdfOf('sphere', { diameter: 40, wall: 0 });
    expect(s(0, 20, 0)).toBeCloseTo(-20, 1);
    expect(s(30, 20, 0)).toBeCloseTo(10, 1);
    const c = sdfOf('cylinder', { height: 100, diameter: 60, wall: 0 });
    expect(c(0, 50, 0)).toBeCloseTo(-30);
    expect(c(0, 103, 0)).toBeCloseTo(3);
    expect(c(0, 0, 40)).toBeCloseTo(10);
    const t = sdfOf('torus', { diameter: 100, tube: 20 });
    expect(t(40, 10, 0)).toBeCloseTo(-10, 1);
    expect(t(0, 10, 0)).toBeCloseTo(30, 1);
    const h = sdfOf('sphere', { diameter: 40, wall: 4 });
    expect(h(0, 20, 0)).toBeCloseTo(16, 1); // centre of the bubble is air
    expect(h(18, 20, 0)).toBeCloseTo(-2, 1); // mid-wall
  });
});

describe('booleans', () => {
  it('subtracts a bore through a cylinder', () => {
    const d = designWith(part('a', 'cylinder', { height: 100, diameter: 80 }), part('b', 'cylinder', { height: 140, diameter: 40 }, [0, -20, 0]));
    const { design, id } = createBoolean(d, ['a', 'b'], 'subtract');
    const { bodies, errors } = evaluateOps(design.ops);
    expect(errors.size).toBe(0);
    expect(bodies).toHaveLength(1);
    expect(bodies[0].owners).toEqual([id]);
    const exact = Math.PI * (40 ** 2 - 20 ** 2) * 100 * POLY;
    expect(bodies[0].volume_mm3 / exact).toBeCloseTo(1, 3);
    const pos = bodies[0].geometry.getAttribute('position').array as Float32Array;
    expect(meshSignedVolume(pos) / bodies[0].volume_mm3).toBeCloseTo(1, 3); // faces still point out
  });

  it('counts overlapping glass once in a union', () => {
    const one = evaluateOps([part('a', 'sphere', { diameter: 50 })]).bodies[0].volume_mm3;
    const d = designWith(part('a', 'sphere', { diameter: 50 }), part('b', 'sphere', { diameter: 50 }, [25, 0, 0]));
    const { bodies } = evaluateOps(createBoolean(d, ['a', 'b'], 'union').design.ops);
    // Two unit spheres a radius apart share 5/16 of a sphere.
    expect(bodies[0].volume_mm3 / (one * (2 - 5 / 16))).toBeCloseTo(1, 2);
  });

  it('keeps only the overlap in an intersect, and says so when there is none', () => {
    const d = designWith(part('a', 'box', { width: 40, depth: 40, height: 40 }), part('b', 'box', { width: 40, depth: 40, height: 40 }, [20, 20, 0]));
    const both = evaluateOps(createBoolean(d, ['a', 'b'], 'intersect').design.ops);
    expect(both.bodies[0].volume_mm3).toBeCloseTo(20 * 20 * 40, 3);
    const far = designWith(part('a', 'sphere', { diameter: 20 }), part('b', 'sphere', { diameter: 20 }, [100, 0, 0]));
    const { design, id } = createBoolean(far, ['a', 'b'], 'intersect');
    const out = evaluateOps(design.ops);
    expect(out.bodies).toHaveLength(0);
    expect(out.errors.get(id)).toMatch(/overlap/);
  });

  it('fails with a reason when a tool is switched off', () => {
    const d = designWith(part('a', 'sphere', { diameter: 50 }), { ...part('b', 'sphere', { diameter: 20 }), suppressed: true });
    const { design, id } = createBoolean(d, ['a', 'b'], 'subtract');
    expect(evaluateOps(design.ops).errors.get(id)).toMatch(/back on/);
  });

  it('shows the cut-away tool as a ghost and finds it for selection', () => {
    const d = designWith(part('a', 'sphere', { diameter: 50 }), part('b', 'sphere', { diameter: 20 }, [20, 10, 0]));
    const { design, id } = createBoolean(d, ['a', 'b'], 'subtract');
    const { bodies } = evaluateOps(design.ops);
    expect(ghostsFor(bodies, [id]).map((g) => g.owners[0])).toEqual(['a', 'b']);
    expect(ghostsFor(bodies, [])).toHaveLength(0);
    expect(bodiesOf(bodies, 'b')).toHaveLength(1);
  });

  it('takes the target’s place in a stack, and drops when the target is deleted', () => {
    const base = designWith(part('foot', 'disc', { diameter: 80, thickness: 10, round: 2 }), part('cup', 'cylinder', { height: 60, diameter: 70 }), part('cut', 'sphere', { diameter: 60 }));
    const stacked = createStack(base, ['foot', 'cup']);
    const bool = createBoolean(stacked.design, ['cup', 'cut'], 'subtract');
    expect((bool.design.ops.find((o) => o.id === stacked.id) as StackOp).children).toEqual(['foot', bool.id]);
    const gone = removeOps(bool.design, ['cup']);
    expect(gone.ops.some((o) => o.id === bool.id)).toBe(false);
    expect((gone.ops.find((o) => o.id === stacked.id) as StackOp).children).toEqual(['foot']);
    const dup = duplicateOp(bool.design, bool.id, [0, 0, 0]);
    const copy = dup.design.ops.find((o) => o.id === dup.id) as BooleanOp;
    expect([copy.target, ...copy.tools].every((t) => !['cup', 'cut'].includes(t))).toBe(true);
  });
});

describe('shell', () => {
  it('hollows a cylinder to an even wall, open at the top', () => {
    const d = designWith(part('a', 'cylinder', { height: 100, diameter: 80 }));
    const { design, id } = createShell(d, 'a', 4, 72);
    const t0 = performance.now();
    const { bodies, errors } = evaluateOps(design.ops);
    const ms = performance.now() - t0;
    expect(errors.size).toBe(0);
    const outer = Math.PI * 40 ** 2 * 100 * POLY;
    const cavity = Math.PI * 36 ** 2 * 96; // floor 4 mm thick, open all the way up
    expect(bodies[0].volume_mm3 / (outer - cavity)).toBeCloseTo(1, 1);
    expect(bodies[0].thickness_mm).toBe(8);
    expect((design.ops.find((o) => o.id === id) as ShellOp).opening).toBe('top');
    expect(ms).toBeLessThan(3000);
  });

  it('closes the cavity when there is no opening', () => {
    const d = designWith(part('a', 'sphere', { diameter: 80 }));
    const { design, id } = createShell(d, 'a', 5, 30);
    const closed = design.ops.map((o) => (o.id === id ? { ...(o as ShellOp), opening: 'none' as const } : o));
    const { bodies } = evaluateOps(closed);
    const exact = (4 / 3) * Math.PI * (40 ** 3 - 35 ** 3);
    expect(bodies[0].volume_mm3 / exact).toBeCloseTo(1, 1);
    // still a closed solid: the body's bounds are the sphere's
    expect(unionBounds(bodies).getSize(new THREE.Vector3()).y).toBeCloseTo(80, 0);
  });

  it('refuses a wall thicker than the part', () => {
    const d = designWith(part('a', 'sphere', { diameter: 20 }));
    const { design, id } = createShell(d, 'a', 15, 10);
    expect(evaluateOps(design.ops).errors.get(id)).toMatch(/thicker/);
  });

  it('can hollow the result of a boolean', () => {
    const d = designWith(part('a', 'cylinder', { height: 80, diameter: 80 }), part('b', 'sphere', { diameter: 80 }, [0, 50, 0]));
    const u = createBoolean(d, ['a', 'b'], 'union');
    const s = createShell(u.design, u.id, 4, 50);
    const { bodies, errors } = evaluateOps(s.design.ops);
    expect(errors.size).toBe(0);
    expect(bodies).toHaveLength(1);
    expect(bodies[0].volume_mm3).toBeGreaterThan(0);
  });
});

describe('melt', () => {
  const sphereVol = (d: number) => (Math.PI * d ** 3) / 6;
  const twoBalls = (gap: number) => designWith(part('a', 'sphere', { diameter: 40 }), part('b', 'sphere', { diameter: 40 }, [40 + gap, 0, 0]));
  const melt = (d: Design, radius: number, quality: BlendOp['quality'] = 'normal', draft = false) => {
    const { design, id } = createBlend(d, ['a', 'b'], radius);
    const ops = design.ops.map((o) => (o.id === id ? { ...(o as BlendOp), quality } : o));
    return { id, ops, result: evaluateOps(ops, { draft }) };
  };

  it('smoothMin is min far apart and dips k/4 where the surfaces meet', () => {
    expect(smoothMin(0, 20, 5)).toBe(0);
    expect(smoothMin(3, 3, 8)).toBeCloseTo(1);
    const both = smoothUnion(
      [
        { sdf: (x) => x, min: [-1e9, -1e9, -1e9], max: [1e9, 1e9, 1e9] },
        { sdf: (x) => 100 - x, min: [90, -1, -1], max: [110, 1, 1] },
      ],
      4,
    );
    expect(both(0, 0, 0)).toBe(0); // the far part's box is skipped, and can't matter
  });

  it('fills the crease between touching parts, more with a bigger radius', () => {
    const { result: small } = melt(twoBalls(0), 2);
    const { result: big } = melt(twoBalls(0), 12);
    expect(small.errors.size).toBe(0);
    expect(small.bodies).toHaveLength(1);
    expect(small.bodies[0].volume_mm3 / (2 * sphereVol(40))).toBeCloseTo(1, 1);
    expect(big.bodies[0].volume_mm3).toBeGreaterThan(small.bodies[0].volume_mm3 * 1.02);
  });

  it('bridges a gap narrower than the radius, but not a wider one', () => {
    // A bridge across the gap means the middle of the gap is inside the glass.
    const inside = (r: ReturnType<typeof melt>['result']) => r.bodies[0].sdf!(40, 20, 0) < 0;
    expect(inside(melt(twoBalls(4), 16).result)).toBe(true);
    expect(inside(melt(twoBalls(20), 8).result)).toBe(false);
    const apart = melt(twoBalls(20), 8).result.bodies[0];
    expect(apart.volume_mm3 / (2 * sphereVol(40))).toBeCloseTo(1, 1);
  });

  it('draft and fine agree on volume within a couple of percent', () => {
    const draft = melt(twoBalls(0), 8, 'normal', true).result.bodies[0].volume_mm3;
    const fine = melt(twoBalls(0), 8, 'fine').result.bodies[0].volume_mm3;
    expect(draft / fine).toBeCloseTo(1, 1);
  });

  it('can be shelled into a vessel', () => {
    const d = designWith(part('a', 'egg', { height: 120, diameter: 90, egg: 0.15 }), part('b', 'cylinder', { height: 50, diameter: 30 }, [0, 105, 0]));
    const m = createBlend(d, ['a', 'b'], 10);
    const s = createShell(m.design, m.id, 4, 22);
    const { bodies, errors } = evaluateOps(s.design.ops);
    expect(errors.size).toBe(0);
    expect(bodies[0].volume_mm3).toBeGreaterThan(0);
    expect(bodies[0].volume_mm3).toBeLessThan(evaluateOps(m.design.ops).bodies[0].volume_mm3 * 0.4);
  });

  it('takes its first part’s place in a stack and goes when its parts do', () => {
    const base = createStack(twoBalls(0), ['a']);
    const m = createBlend(base.design, ['a', 'b'], 6);
    expect((m.design.ops.find((o) => o.id === base.id) as StackOp).children).toEqual([m.id]);
    const one = removeOps(m.design, ['b']);
    expect(evaluateOps(one.ops).errors.get(m.id)).toMatch(/two parts/);
    expect(removeOps(m.design, ['a', 'b']).ops.some((o) => o.id === m.id)).toBe(false);
  });
});
