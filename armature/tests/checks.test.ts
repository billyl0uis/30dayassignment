import { describe, expect, it } from 'vitest';
import { addNode, addRod } from '../src/model/frame';
import { newJoin, newPart } from '../src/model/io';
import { emptySculpture, type Sculpture } from '../src/model/types';
import { analyze } from '../src/physics/checks';

function tripodWith(partSetup: (s: Sculpture, nodeId: string) => void) {
  const s = emptySculpture();
  const top = addNode(s, [0, 200, 0]);
  for (const a of [0, 120, 240]) {
    const t = (a * Math.PI) / 180;
    addRod(s, top, addNode(s, [100 * Math.cos(t), 0, 100 * Math.sin(t)]), 'mild_steel', 8);
  }
  partSetup(s, top);
  return s;
}

describe('checks', () => {
  it('fused on a non-inclusion is BAD', () => {
    const s = tripodWith((s, n) => {
      const p = newPart('solid', [0, 240, 0]);
      s.parts.push(p);
      const j = newJoin('fused', p.id);
      j.anchor = { kind: 'node', nodeId: n };
      s.joins.push(j);
    });
    const r = analyze(s).results.filter((x) => x.check === 'cold');
    expect(r.map((x) => x.status)).toEqual(['BAD', 'BAD']);
    expect(r[0].reason).toMatch(/inclusion/);
  });

  it('fused is fine for an inclusion (with a hot note)', () => {
    const s = tripodWith((s, n) => {
      const p = newPart('solid', [0, 240, 0]);
      p.isInclusion = true;
      s.parts.push(p);
      const j = newJoin('fused', p.id);
      j.anchor = { kind: 'node', nodeId: n };
      s.joins.push(j);
    });
    const a = analyze(s);
    expect(a.results.filter((x) => x.check === 'cold')).toEqual([]);
    expect(a.results.some((x) => x.check === 'hot')).toBe(true);
  });

  it('point clip on thin heavy glass warns; padded does not', () => {
    for (const contact of ['point', 'padded'] as const) {
      const s = tripodWith((s, n) => {
        const p = newPart('cast', [0, 300, 0]);
        p.geom = { kind: 'cast', shape: 'slab', sizeMm: [300, 300, 4] }; // 900 g, 4 mm
        s.parts.push(p);
        const j = newJoin('clip', p.id);
        j.contact = contact;
        j.anchor = { kind: 'node', nodeId: n };
        s.joins.push(j);
      });
      const warns = analyze(s).results.filter((x) => x.check === 'point_load');
      expect(warns.length).toBe(contact === 'point' ? 1 : 0);
    }
  });

  it('two feet is BAD for a freestanding piece', () => {
    const s = emptySculpture();
    const top = addNode(s, [0, 100, 0]);
    addRod(s, top, addNode(s, [-50, 0, 0]), 'mild_steel', 6);
    addRod(s, top, addNode(s, [50, 0, 0]), 'mild_steel', 6);
    expect(analyze(s).results.find((r) => r.check === 'tip')!.status).toBe('BAD');
  });

  it('heavy cantilever on the wall warns', () => {
    const s = emptySculpture();
    s.wall.enabled = true;
    const w = addNode(s, [0, 500, 0]);
    const tip = addNode(s, [0, 500, 300]);
    addRod(s, w, tip, 'mild_steel', 10);
    const p = newPart('solid', [0, 500, 330]);
    s.parts.push(p);
    const j = newJoin('clip', p.id);
    j.anchor = { kind: 'node', nodeId: tip };
    s.joins.push(j);
    expect(analyze(s).results.some((r) => r.title === 'Heavy cantilever')).toBe(true);
  });
});
