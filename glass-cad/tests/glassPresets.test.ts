import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PRESETS, getPreset } from '../src/presets/registry';
import { defaultParams, type Params } from '../src/presets/types';
import { sectionSize, sectionVolume } from '../src/geometry/section';
import { buildSection } from '../src/geometry/build';
import { meshSignedVolume } from '../src/geometry/measure';
import { sectionSdf } from '../src/geometry/sdf';
import { initCsg, toManifold } from '../src/engine/csg';

beforeAll(() => initCsg());

const { PI } = Math;
const section = (id: string, p: Params = {}) => {
  const def = getPreset(id);
  return def.section({ ...defaultParams(def), ...p });
};
const meshVol = (geo: THREE.BufferGeometry) => meshSignedVolume(geo.getAttribute('position').array, geo.getIndex()?.array);
// A 32-sided rod holds n·sin(2π/n)/2π of a true circle's area.
const RING = (32 * Math.sin((2 * PI) / 32)) / (2 * PI);

describe('every preset', () => {
  for (const def of PRESETS) {
    it(`${def.id}: closed, outward, on the floor, and the size it reports`, () => {
      const s = def.section(defaultParams(def));
      const geo = buildSection(s);
      const v = meshVol(geo);
      expect(v).toBeGreaterThan(0);
      const exact = sectionVolume(s);
      if (exact !== null) expect(Math.abs(v - exact) / exact).toBeLessThan(0.01);

      const box = geo.boundingBox!;
      const size = sectionSize(s);
      const tol = s.kind === 'implicit' ? 0.04 : 0.02; // level-set surfaces sit a hair inside
      expect(box.min.y).toBeGreaterThan(-0.05 * size.height);
      expect(box.min.y).toBeLessThan(tol * size.height + 0.5);
      expect(Math.abs(box.max.y - box.min.y - size.height) / size.height).toBeLessThan(tol + 0.01);
      expect(Math.abs(box.max.x - box.min.x - size.width) / size.width).toBeLessThan(tol + 0.01);

      // manifold-3d has to accept it, or booleans, shells and melts will fail on it.
      const m = toManifold(geo, new THREE.Matrix4());
      expect(String(m.status())).toBe('NoError');
      expect(m.volume() / v).toBeCloseTo(1, 2);
      m.delete();
    });
  }
});

describe('glass parts', () => {
  it('neck is an open tube with an exact frustum-shell volume', () => {
    const s = section('neck', { height: 60, bottom: 40, top: 30, wall: 3 });
    const frustum = (r1: number, r2: number) => (PI * 60 / 3) * (r1 * r1 + r1 * r2 + r2 * r2);
    expect(sectionVolume(s)).toBeCloseTo(frustum(20, 15) - frustum(17, 12), 6);
    expect(sectionSdf(s)!(0, 30, 0)).toBeGreaterThan(0); // the middle is air: it's open
  });

  it('straight rod matches a cylinder with rounded ends', () => {
    const geo = buildSection(section('rod', { length: 100, diameter: 10, bend: 0 }));
    const exact = (PI * 25 * 100 + (4 / 3) * PI * 125) * RING;
    expect(meshVol(geo) / exact).toBeCloseTo(1, 1);
    expect(sectionSize(section('rod', { length: 100, diameter: 10, bend: 0 }))).toMatchObject({ height: 10 });
  });

  it('coil volume is the rod area times its length along the helix', () => {
    const p = { diameter: 60, thread: 8, turns: 3, rise: 12 };
    const R = 26;
    const length = 3 * Math.hypot(2 * PI * R, 12);
    const exact = (PI * 16 * length + (4 / 3) * PI * 64) * RING;
    expect(meshVol(buildSection(section('coil', p))) / exact).toBeCloseTo(1, 1);
  });

  it('stem knop widens it only when bigger than the stem', () => {
    const plain = sectionSize(section('stem', { knop: 0 })).width;
    const knopped = sectionSize(section('stem', { knop: 40 })).width;
    expect(knopped).toBeGreaterThan(plain);
    expect(knopped).toBeCloseTo(40, 0);
  });

  it('flat-ended sweeps are cut square in their distance function', () => {
    const s = section('horn', { length: 100, base: 40, curl: 0, spiral: 0, tip: 0.5 });
    const sdf = sectionSdf(s)!;
    expect(sdf(0, 1, 0)).toBeLessThan(0); // just inside the flat base
    expect(sdf(0, -2, 0)).toBeCloseTo(2, 0); // just below it, outside
  });
});

describe('organic parts', () => {
  it('blob lumps are repeatable for a seed and change with it', () => {
    const a = section('blob', { seed: 7 });
    const b = section('blob', { seed: 7 });
    const c = section('blob', { seed: 8 });
    expect(sectionSize(a)).toEqual(sectionSize(b));
    expect(sectionSize(a)).not.toEqual(sectionSize(c));
  });

  it('tooth is longer than wide and stands on its root', () => {
    const size = sectionSize(section('tooth'));
    expect(size.height).toBeGreaterThan(size.width * 2);
  });
});

describe('drawn parts', () => {
  const draw = (mode: 'revolve' | 'extrude' | 'inflate', points: [number, number][], smooth = false, p: Params = {}) => {
    const def = getPreset(`custom-${mode}`);
    return def.section({ ...defaultParams(def), ...p }, { mode, points, smooth });
  };

  it('a revolved line is closed to the axis, runs upward and sits on the floor', () => {
    // Drawn top-down, floating, and never touching the axis: still makes a closed cylinder.
    const s = draw('revolve', [[30, 150], [30, 50]]);
    expect(s.kind).toBe('lathe');
    if (s.kind !== 'lathe') return;
    expect(s.profile).toEqual([[0, 0], [30, 0], [30, 100], [0, 100]]);
    expect(sectionVolume(s)).toBeCloseTo(PI * 900 * 100, 6);
  });

  it('points left of the axis are pulled onto it', () => {
    const s = draw('revolve', [[-10, 0], [20, 10], [-5, 30]]);
    if (s.kind !== 'lathe') throw new Error('expected a lathe');
    expect(Math.min(...s.profile.map((q) => q[0]))).toBe(0);
  });

  it('an extruded outline is area × depth, either winding', () => {
    const square: [number, number][] = [[0, 0], [40, 0], [40, 40], [0, 40]];
    expect(sectionVolume(draw('extrude', square, false, { depth: 10 }))).toBeCloseTo(16000);
    expect(sectionVolume(draw('extrude', [...square].reverse(), false, { depth: 10 }))).toBeCloseTo(16000);
    expect(meshVol(buildSection(draw('extrude', [...square].reverse(), false, { depth: 10 }))) / 16000).toBeCloseTo(1, 6);
  });

  it('scale grows the drawing', () => {
    const one = sectionSize(draw('extrude', [[0, 0], [40, 0], [20, 30]], false, { scale: 1 }));
    const two = sectionSize(draw('extrude', [[0, 0], [40, 0], [20, 30]], false, { scale: 2 }));
    expect(two.width).toBeCloseTo(one.width * 2);
  });

  it('an inflated outline is a pillow: thinner than a slab, full thickness in the middle', () => {
    const square: [number, number][] = [[-40, 0], [40, 0], [40, 80], [-40, 80]];
    const s = draw('inflate', square, false, { thickness: 20, round: 15 });
    const v = meshVol(buildSection(s));
    expect(v).toBeLessThan(80 * 80 * 20);
    expect(v).toBeGreaterThan(80 * 80 * 20 * 0.7);
    expect(sectionSdf(s)!(0, 40, 9.5)).toBeLessThan(0); // the middle is the full 20 thick
    expect(sectionSdf(s)!(39, 40, 9.5)).toBeGreaterThan(0); // near the edge it has rounded off
  });

  it('a too-short drawing fails with a reason instead of crashing', () => {
    expect(() => draw('extrude', [[0, 0], [10, 0]])).toThrow(/at least 3/);
  });
});
