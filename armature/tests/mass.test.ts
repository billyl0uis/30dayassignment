import { describe, expect, it } from 'vitest';
import { addNode, addRod } from '../src/model/frame';
import { newPart } from '../src/model/io';
import { emptySculpture } from '../src/model/types';
import { computeMass, formatWeight } from '../src/physics/mass';
import { partVolume, shellVolume, wallForVolume } from '../src/physics/glass';

describe('weight and centre of mass — hand calculation', () => {
  /*
   * One mild-steel rod, Ø10 mm, from (0,0,0) to (0,100,0):
   *   V = π · 5² · 100 = 7853.98 mm³ = 7.85398 cm³
   *   m = 7.85398 × 7.85 g/cm³ = 61.654 g, COM (0, 50, 0)
   *
   * One solid soda-lime sphere, r = 20 mm, centred at (100, 50, 0):
   *   V = 4/3 · π · 20³ = 33510.32 mm³ = 33.51032 cm³
   *   m = 33.51032 × 2.5 g/cm³ = 83.776 g, COM (100, 50, 0)
   *
   * Total 145.430 g. COM x = (61.654·0 + 83.776·100) / 145.430 = 57.605 mm, y = 50, z = 0.
   */
  const s = emptySculpture();
  const a = addNode(s, [0, 0, 0]);
  const b = addNode(s, [0, 100, 0]);
  addRod(s, a, b, 'mild_steel', 10);
  const sphere = newPart('solid', [100, 50, 0]);
  sphere.geom = { kind: 'solid', shape: 'sphere', radiusMm: 20 };
  s.parts.push(sphere);
  const m = computeMass(s);

  it('weighs the steel rod', () => expect(m.metalG).toBeCloseTo(61.654, 2));
  it('weighs the glass sphere', () => expect(m.glassG).toBeCloseTo(83.776, 2));
  it('totals', () => expect(m.totalG).toBeCloseTo(145.43, 1));
  it('puts the centre of mass where the hand calc does', () => {
    expect(m.com![0]).toBeCloseTo(57.605, 2);
    expect(m.com![1]).toBeCloseTo(50, 6);
    expect(m.com![2]).toBeCloseTo(0, 6);
  });
  it('formats lb/oz', () => {
    expect(formatWeight(453.59237)).toBe('454 g · 1 lb 0.0 oz');
  });
});

describe('blown shell volume', () => {
  it('matches the exact sphere shell for an unblown part', () => {
    const p = newPart('blown', [0, 0, 0]);
    p.geom = { kind: 'blown', outerRadiusMm: 40, wallMm: 5 };
    const exact = (4 / 3) * Math.PI * (40 ** 3 - 35 ** 3);
    expect(partVolume(p)).toBeCloseTo(exact, 0);
  });
  it('solves wall thickness back from volume', () => {
    const A = 4 * Math.PI * 60 * 60;
    const v = shellVolume(A, 3.2);
    expect(wallForVolume(A, v)).toBeCloseTo(3.2, 6);
  });
});
