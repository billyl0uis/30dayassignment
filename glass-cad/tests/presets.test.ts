import { describe, expect, it } from 'vitest';
import { BASIC_PRESETS, box, capsule, cone, cylinder, disc, egg, sphere, torus } from '../src/presets/basic';
import { defaultParams, type Params, type PresetDef } from '../src/presets/types';
import { sectionSize, sectionVolume } from '../src/geometry/section';
import { offsetInward } from '../src/geometry/profile';
import { buildSection } from '../src/geometry/build';
import { meshSignedVolume } from '../src/geometry/measure';

const { PI } = Math;
const vol = (def: PresetDef, p: Params) => sectionVolume(def.section({ ...defaultParams(def), ...p }))!;
const size = (def: PresetDef, p: Params) => sectionSize(def.section({ ...defaultParams(def), ...p }));

/** Relative closeness: curved profiles are polygons, so allow a small shortfall. */
function near(actual: number, expected: number, rel: number) {
  expect(Math.abs(actual - expected) / expected).toBeLessThan(rel);
}

describe('preset volumes match closed-form formulas', () => {
  it('sphere', () => near(vol(sphere, { diameter: 100 }), (4 / 3) * PI * 50 ** 3, 0.003));
  it('hollow sphere', () => near(vol(sphere, { diameter: 100, wall: 5 }), (4 / 3) * PI * (50 ** 3 - 45 ** 3), 0.005));
  it('ellipsoid with no egg skew', () => near(vol(egg, { height: 120, diameter: 80, egg: 0 }), (4 / 3) * PI * 40 * 40 * 60, 0.003));
  it('cylinder (exact)', () => near(vol(cylinder, { height: 120, diameter: 70 }), PI * 35 ** 2 * 120, 1e-12));
  it('hollow cylinder keeps an even wall (exact)', () =>
    near(vol(cylinder, { height: 120, diameter: 70, wall: 5 }), PI * (35 ** 2 * 120 - 30 ** 2 * 110), 1e-12));
  it('cone frustum (exact)', () =>
    near(vol(cone, { height: 90, base: 80, top: 30 }), (PI * 90 / 3) * (40 ** 2 + 40 * 15 + 15 ** 2), 1e-12));
  it('pointed cone (exact)', () => near(vol(cone, { height: 90, base: 80, top: 0 }), (PI / 3) * 40 ** 2 * 90, 1e-12));
  it('torus', () => near(vol(torus, { diameter: 120, tube: 20 }), 2 * PI ** 2 * 50 * 10 ** 2, 0.003));
  it('square-edged disc (exact)', () => near(vol(disc, { diameter: 90, thickness: 8, round: 0 }), PI * 45 ** 2 * 8, 1e-12));
  it('box and hollow box (exact)', () => {
    near(vol(box, { width: 40, depth: 50, height: 60 }), 40 * 50 * 60, 1e-12);
    near(vol(box, { width: 40, depth: 50, height: 60, wall: 4 }), 40 * 50 * 60 - 32 * 42 * 52, 1e-12);
  });
  it('capsule', () => near(vol(capsule, { height: 140, diameter: 60 }), PI * 30 ** 2 * 80 + (4 / 3) * PI * 30 ** 3, 0.003));
});

describe('preset dimensions', () => {
  it('report the size you typed', () => {
    expect(size(sphere, { diameter: 100 })).toMatchObject({ width: 100, height: 100 });
    expect(size(cylinder, { height: 120, diameter: 70 })).toMatchObject({ width: 70, depth: 70, height: 120 });
    expect(size(cone, { height: 90, base: 30, top: 80 }).width).toBeCloseTo(80);
    expect(size(torus, { diameter: 120, tube: 20 })).toMatchObject({ width: 120, height: 20 });
    expect(size(capsule, { height: 140, diameter: 60 }).height).toBeCloseTo(140);
  });
  it('egg skew keeps the overall diameter', () => {
    expect(size(egg, { height: 120, diameter: 80, egg: 0.4 }).width).toBeCloseTo(80);
  });
  it('sits on the floor', () => {
    for (const def of BASIC_PRESETS) {
      const s = def.section(defaultParams(def));
      const ys = s.kind === 'lathe' ? s.profile.map((p) => p[1]) : s.kind === 'lathe-loop' ? s.loop.map((p) => p[1]) : [0];
      expect(Math.min(...ys)).toBeCloseTo(0, 9);
    }
  });
});

describe('inward offset', () => {
  it('mitres square corners exactly', () => {
    expect(offsetInward([[0, 0], [35, 0], [35, 120], [0, 120]], 5)).toEqual([[0, 5], [30, 5], [30, 115], [0, 115]]);
  });
  it('lands the apex of a cone on the axis', () => {
    const inner = offsetInward([[0, 0], [40, 0], [0, 90]], 3);
    expect(inner[0]).toEqual([0, 3]);
    expect(inner[inner.length - 1][0]).toBe(0);
    expect(inner[inner.length - 1][1]).toBeLessThan(90 - 3);
  });
});

describe('meshes', () => {
  for (const def of BASIC_PRESETS) {
    for (const wall of [0, 4]) {
      it(`${def.id}${wall ? ' (hollow)' : ''} faces outward and matches the section volume`, () => {
        const section = def.section({ ...defaultParams(def), wall });
        const geo = buildSection(section);
        const v = meshSignedVolume(geo.getAttribute('position').array, geo.getIndex()?.array);
        expect(v).toBeGreaterThan(0);
        near(v, sectionVolume(section)!, 0.01);
      });
    }
  }
});
