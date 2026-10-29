import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { frameFor, sharedSize, VIEWS, viewById } from '../src/viewport/views';
import { orthoCameraFor } from '../src/files/orthoViews';

// A piece 100 wide (x), 200 tall (y), 50 deep (z), sitting on the floor off-centre.
const box = new THREE.Box3(new THREE.Vector3(20, 0, -10), new THREE.Vector3(120, 200, 40));
const span = (f: { uMin: number; uMax: number; vMin: number; vMax: number }) => [f.uMax - f.uMin, f.vMax - f.vMin];

describe('view framing', () => {
  it('front, side and top show the true width, depth and height', () => {
    expect(span(frameFor(viewById('front'), box))).toEqual([100, 200]);
    expect(span(frameFor(viewById('side'), box))).toEqual([50, 200]);
    expect(span(frameFor(viewById('top'), box))).toEqual([100, 50]);
  });

  it('side looks from +X with the back of the piece on the right, top has the back up', () => {
    const side = frameFor(viewById('side'), box);
    expect(side.right.toArray()).toEqual([0, 0, -1]);
    const top = frameFor(viewById('top'), box);
    expect(top.up.toArray().map((v) => v + 0)).toEqual([0, 0, -1]);
  });

  it('every view of a piece shares one scale, and the window holds the piece', () => {
    const size = sharedSize(box);
    for (const v of VIEWS) {
      const f = frameFor(v, box, size);
      expect(f.size).toBe(size);
      expect(f.uMin).toBeGreaterThanOrEqual(f.u0);
      expect(f.uMax).toBeLessThanOrEqual(f.u0 + f.size);
      expect(f.vMin).toBeGreaterThanOrEqual(f.v0);
      expect(f.vMax).toBeLessThanOrEqual(f.v0 + f.size);
    }
  });

  it('the export camera puts every corner of the piece inside the square it crops', () => {
    for (const aspect of [1, 1.6, 0.7]) {
      for (const v of VIEWS) {
        const f = frameFor(v, box);
        const cam = orthoCameraFor(v, f, aspect);
        const sx = aspect >= 1 ? 1 / aspect : 1; // the centred square's half-width in NDC
        const sy = aspect >= 1 ? 1 : aspect;
        for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
          const p = new THREE.Vector3(x, y, z).project(cam);
          expect(Math.abs(p.x)).toBeLessThanOrEqual(sx + 1e-9);
          expect(Math.abs(p.y)).toBeLessThanOrEqual(sy + 1e-9);
          expect(Math.abs(p.z)).toBeLessThan(1);
        }
      }
    }
  });

  it('a point lands in the cropped image where the frame says it should', () => {
    const v = viewById('front');
    const f = frameFor(v, box);
    const cam = orthoCameraFor(v, f, 1);
    const p = new THREE.Vector3(120, 200, 0).project(cam); // top right corner of the front face
    expect((p.x + 1) / 2).toBeCloseTo((120 - f.u0) / f.size, 9);
    expect((p.y + 1) / 2).toBeCloseTo((200 - f.v0) / f.size, 9);
  });
});
