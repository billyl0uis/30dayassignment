import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createDesign, createMaterial, identityTransform } from '../src/model/design';
import type { Design, PrimitiveOp } from '../src/model/types';
import { createBoolean } from '../src/model/tree';
import { evaluateOps } from '../src/engine/evaluate';
import { initCsg } from '../src/engine/csg';
import { shopRows } from '../src/engine/shop';
import { exportDesignJson, exportObj, exportStl } from '../src/files/exporters';
import { parseMeshFile } from '../src/files/importMesh';
import { decodePositions, encodePositions } from '../src/files/meshData';
import { fileStem } from '../src/files/download';
import { parseDesign } from '../src/store/library';
import { inch } from '../src/model/units';

beforeAll(() => initCsg());

const part = (id: string, preset: string, params: Record<string, number>, x = 0): PrimitiveOp => ({
  id, type: 'primitive', label: id, preset, params, transform: { ...identityTransform(), position: [x, 0, 0] }, materialId: 'm',
});
const designWith = (...ops: Design['ops']): Design => ({ ...createDesign(), ops, materials: { m: createMaterial({ id: 'm', name: 'Cobalt' }) } });

/** Exports a design, reads the file back as an imported part, and evaluates it. */
async function roundTrip(d: Design, kind: 'stl' | 'obj') {
  const { bodies } = evaluateOps(d.ops);
  const blob = kind === 'stl' ? exportStl(bodies, d) : exportObj(bodies, d);
  const parsed = parseMeshFile(`piece.${kind}`, await blob.arrayBuffer());
  const mesh = { id: `mesh_${kind}`, name: `piece.${kind}`, triangles: parsed.triangles, data: encodePositions(parsed.positions) };
  const imported: PrimitiveOp = { ...part('imp', 'imported', { scale: 1, units: 0 }), mesh };
  return { original: bodies, imported: evaluateOps([imported]), parsed };
}

describe('export and import', () => {
  it('an STL round trip keeps the volume and comes back on the floor, centred', async () => {
    const d = designWith(part('c', 'cylinder', { height: 100, diameter: 60 }, 40));
    const { original, imported } = await roundTrip(d, 'stl');
    expect(imported.errors.size).toBe(0);
    // The original's volume is the exact formula; the reimport measures the 96-sided mesh.
    expect(imported.bodies[0].volume_mm3 / original[0].volume_mm3).toBeCloseTo(1, 2);
    const box = imported.bodies[0].bounds;
    expect(box.min.y).toBeCloseTo(0, 3);
    expect((box.min.x + box.max.x) / 2).toBeCloseTo(0, 3);
  });

  it('an OBJ round trip does too, and the result still cuts in a boolean', async () => {
    const d = designWith(part('s', 'sphere', { diameter: 80 }));
    const { original, parsed } = await roundTrip(d, 'obj');
    const mesh = { id: 'mesh_b', name: 'b.obj', triangles: parsed.triangles, data: encodePositions(parsed.positions) };
    const imported: PrimitiveOp = { ...part('imp', 'imported', { scale: 1, units: 0 }), mesh };
    const bore = part('b', 'cylinder', { height: 120, diameter: 20 });
    const cut = createBoolean(designWith(imported, { ...bore, transform: { ...bore.transform, position: [0, -20, 0] } }), ['imp', 'b'], 'subtract');
    const out = evaluateOps(cut.design.ops);
    expect(out.errors.size).toBe(0);
    expect(out.bodies[0].volume_mm3).toBeLessThan(original[0].volume_mm3 * 0.95);
  });

  it('file units scale an import', async () => {
    const d = designWith(part('c', 'cylinder', { height: 4, diameter: 2 })); // a part "drawn in inches"
    const { parsed } = await roundTrip(d, 'stl');
    expect(parsed.unitsGuess).toBe(2);
    const mesh = { id: 'mesh_in', name: 'x.stl', triangles: parsed.triangles, data: encodePositions(parsed.positions) };
    const asInches = evaluateOps([{ ...part('i', 'imported', { scale: 1, units: 2 }), mesh }]).bodies[0];
    expect(asInches.bounds.getSize(new THREE.Vector3()).y).toBeCloseTo(inch(4), 2);
  });

  it('rejects files it can’t read, with a reason', () => {
    expect(() => parseMeshFile('piece.3mf', new ArrayBuffer(8))).toThrow(/\.stl and \.obj/);
  });

  it('base64 mesh storage is lossless', () => {
    const p = new Float32Array([1.5, -2.25, 3.125, 1e-7, 12345.5, -0.5]);
    expect(Array.from(decodePositions('t', encodePositions(p)))).toEqual(Array.from(p));
  });
});

describe('design files and the shop sheet', () => {
  it('a saved design file opens again unchanged', async () => {
    const d = designWith(part('a', 'gourd', {}), part('b', 'coil', {}, 150));
    d.shop.notes.push({ id: 'n1', text: 'Pull cobalt cane', done: false });
    const back = parseDesign(await exportDesignJson(d).text());
    expect(back).toEqual(d);
    expect(parseDesign('{"schemaVersion":1,"ops":[{"type":"primitive","preset":"nope"}]}')).toBeNull();
    expect(parseDesign('not json')).toBeNull();
  });

  it('shop rows count array copies once with a quantity', () => {
    const d = designWith(part('p', 'sphere', { diameter: 20 }, 60));
    d.ops.push({ id: 'arr', type: 'array', label: 'ring', source: 'p', mode: 'radial', count: 5, angle: 360, center: [0, 0], step: [0, 0, 0] });
    const rows = shopRows(d.ops, evaluateOps(d.ops).bodies);
    expect(rows).toHaveLength(1);
    expect(rows[0].qty).toBe(5);
    expect(rows[0].size.x).toBeCloseTo(20, 0);
  });

  it('file names are tidy', () => {
    expect(fileStem('Bone Vase #3 / blue')).toBe('bone-vase-3-blue');
    expect(fileStem('   ')).toBe('glass-piece');
  });
});
