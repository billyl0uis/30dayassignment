import { describe, expect, it } from 'vitest';
import { POD_ARM_ANGLES, PRESETS } from '../src/presets';
import { analyze } from '../src/physics/checks';
import { importJSON, exportJSON } from '../src/model/io';
import type { Sculpture } from '../src/model/types';

const build = (id: string) => PRESETS.find((p) => p.id === id)!.build();
const statusOf = (s: Sculpture, check: string) => analyze(s).results.filter((r) => r.check === check).map((r) => r.status);

describe('preset 1 — blown into a wire cage', () => {
  const s = build('cage');
  const a = analyze(s);
  it('is captured and stands', () => {
    expect(statusOf(s, 'capture')).toEqual(['OK']);
    expect(statusOf(s, 'tip')).toEqual(['OK']);
  });
  it('shows the hot-contact note with both expansion values', () => {
    const hot = a.results.find((r) => r.check === 'hot')!;
    expect(hot.status).toBe('NOTE');
    expect(hot.reason).toContain('9.6');
    expect(hot.reason).toContain('copper ≈ 17');
  });
  it('has nothing worse than a note', () => expect(a.overall).toBe('NOTE'));
});

describe('preset 2 — tripod with pods', () => {
  it('is OK as loaded', () => {
    const a = analyze(build('pods'));
    expect(a.overall).toBe('OK');
  });
  it('moving pod A outward goes WARN, then BAD', () => {
    const at = (out: number) => {
      const s = build('pods');
      const pod = s.parts[0];
      const t = (POD_ARM_ANGLES[0] * Math.PI) / 180;
      pod.position = [pod.position[0] + out * Math.cos(t), pod.position[1], pod.position[2] + out * Math.sin(t)];
      return statusOf(s, 'tip')[0];
    };
    expect(at(40)).toBe('OK');
    expect(at(110)).toBe('WARN');
    expect(at(180)).toBe('BAD');
  });
});

describe('preset 3 — copper tree', () => {
  const s = build('tree');
  const a = analyze(s);
  it('has 12 leaves', () => expect(s.parts.length).toBe(12));
  it('flags exactly the unattached leaf as BAD', () => {
    const bad = s.parts.filter((p) => a.partStatus.get(p.id) === 'BAD');
    expect(bad.map((p) => p.name)).toEqual(['Leaf 12']);
    expect(a.results.find((r) => r.partId === bad[0].id)!.title).toBe('No cold connection');
  });
  it('stands up', () => expect(statusOf(s, 'tip')).toEqual(['OK']));
});

describe('preset 4 — wall slab', () => {
  const s = build('wall');
  const a = analyze(s);
  it('flags one hole too close to the edge', () => expect(statusOf(s, 'hole_edge')).toEqual(['WARN']));
  it('treats it as a wall piece with OK anchors', () => {
    expect(a.base.wallPiece).toBe(true);
    expect(statusOf(s, 'wall')).toEqual(['OK']);
    expect(statusOf(s, 'tip')).toEqual([]);
  });
  it('is WARN overall', () => expect(a.overall).toBe('WARN'));
});

describe('JSON round trip', () => {
  for (const p of PRESETS) {
    it(`${p.id} survives export → import with the same verdict`, () => {
      const s = p.build();
      const back = importJSON(exportJSON(s));
      expect(analyze(back).overall).toBe(analyze(s).overall);
      expect(analyze(back).mass.totalG).toBeCloseTo(analyze(s).mass.totalG, 6);
    });
  }
  it('rejects junk with a readable message', () => {
    expect(() => importJSON('{"version":2}')).toThrow(/not an Armature/);
  });
});
