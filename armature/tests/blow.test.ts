import { describe, expect, it } from 'vitest';
import { generateCage } from '../src/model/frame';
import { newJoin, newPart } from '../src/model/io';
import { emptySculpture } from '../src/model/types';
import { analyzeCapture, applyBlow, blowTo, startBlow } from '../src/physics/blow';
import { partVolume } from '../src/physics/glass';
import { analyze } from '../src/physics/checks';

function setup(ribs: number, rings: number, taper: number, radius = 90) {
  const s = emptySculpture();
  const cage = generateCage(s, { center: [0, 200, 0], ribs, rings, radiusMm: radius, heightMm: 200, wireMm: 3, material: 'copper', taper });
  const part = newPart('blown', [0, 200, 0]);
  part.geom = { kind: 'blown', outerRadiusMm: 45, wallMm: 14 };
  s.parts.push(part);
  const j = newJoin('cage_capture', part.id);
  j.anchor = { kind: 'cage', cageId: cage.id };
  s.joins.push(j);
  return { s, cage, part };
}

describe('blowing into a cage', () => {
  it('bulges between wires and stays clamped on them', () => {
    const { s, cage, part } = setup(8, 3, 0.45);
    const session = blowTo(s, part, cage, 125);
    const g = part.geom as Extract<typeof part.geom, { kind: 'blown' }>;
    const { theta } = session.field;
    let onWire = -Infinity, between = -Infinity;
    // side band of the cage: compare directions right on a wire with the middle of a gap
    const lat = g.profile!.lat, lon = g.profile!.lon;
    for (let i = Math.round(lat * 0.3); i <= Math.round(lat * 0.7); i++) {
      for (let j = 0; j < lon; j++) {
        const v = i * lon + j;
        if (theta[v] < 0.02) onWire = Math.max(onWire, g.profile!.radii[v]);
        if (theta[v] > 0.2) between = Math.max(between, g.profile!.radii[v]);
      }
    }
    expect(between - onWire).toBeGreaterThan(10);
    expect(analyzeCapture(s, part, cage).bulgeMm).toBeGreaterThan(10);
  });

  it('conserves glass volume (wall thins as it grows)', () => {
    const { s, cage, part } = setup(8, 3, 0.45);
    const v0 = partVolume(part);
    const session = startBlow(s, part, cage);
    applyBlow(session, part, 80);
    const g = part.geom as Extract<typeof part.geom, { kind: 'blown' }>;
    expect(partVolume(part)).toBeCloseTo(v0, -1);
    expect(g.wallMm).toBeLessThan(14);
  });

  it('captures in a tight cage once blown', () => {
    const { s, cage, part } = setup(8, 3, 0.45);
    blowTo(s, part, cage, 125);
    const r = analyze(s).results.find((x) => x.check === 'capture')!;
    expect(r.status).toBe('OK');
  });

  it('does not capture when the gaps are wider than the glass', () => {
    // straight cylinder (open ends the full width) — an unblown gather slides out the end
    const { s } = setup(3, 2, 1);
    const r = analyze(s).results.find((x) => x.check === 'capture')!;
    expect(r.status).toBe('BAD');
    expect(r.reason).toMatch(/could slip back out/);
  });

  it('does not capture in a 2-rib cage even after blowing', () => {
    const { s, cage, part } = setup(2, 2, 1, 160);
    blowTo(s, part, cage, 200);
    const r = analyze(s).results.find((x) => x.check === 'capture')!;
    expect(r.status).toBe('BAD');
  });

  it('always carries a hot-contact note', () => {
    const { s } = setup(8, 3, 0.45);
    expect(analyze(s).results.some((x) => x.check === 'hot' && x.status === 'NOTE')).toBe(true);
  });
});
