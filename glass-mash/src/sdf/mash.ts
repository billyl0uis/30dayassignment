import { Euler, Matrix4, Quaternion, Vector3, type BufferGeometry } from 'three';
import { pieceSdf } from '../scene/geometryCache';
import type { JoinMode, Piece, Transform } from '../scene/store';
import { sampleGrid, type SdfGrid } from './grid';
import { carve, intersect, smin } from './ops';
import { surfaceNets } from './surfaceNets';

interface Member {
  id: string;
  join: JoinMode;
  sdf: SdfGrid;
  inv: number[]; // world → piece-local, column-major
  scale: number; // smallest scale factor, to turn local distances into world ones
  bounds: { min: Vector3; max: Vector3 }; // world box around the piece's grid
}

function toMember(p: Piece): Member | null {
  const sdf = pieceSdf(p);
  if (!sdf) return null;
  const m = matrixOf(p.transform);
  const lo = new Vector3(Infinity, Infinity, Infinity), hi = new Vector3(-Infinity, -Infinity, -Infinity);
  for (let c = 0; c < 8; c++) {
    const v = new Vector3(
      sdf.min[0] + (c & 1 ? sdf.nx - 1 : 0) * sdf.h,
      sdf.min[1] + (c & 2 ? sdf.ny - 1 : 0) * sdf.h,
      sdf.min[2] + (c & 4 ? sdf.nz - 1 : 0) * sdf.h,
    ).applyMatrix4(m);
    lo.min(v);
    hi.max(v);
  }
  const [sx, sy, sz] = p.transform.scale.map(Math.abs);
  return { id: p.id, join: p.join, sdf, inv: m.clone().invert().elements, scale: Math.min(sx, sy, sz), bounds: { min: lo, max: hi } };
}

export function matrixOf(t: Transform): Matrix4 {
  return new Matrix4().compose(
    new Vector3(...t.position),
    new Quaternion().setFromEuler(new Euler(...t.rotation)),
    new Vector3(...t.scale),
  );
}

function distance(m: Member, x: number, y: number, z: number): number {
  const e = m.inv;
  const lx = e[0] * x + e[4] * y + e[8] * z + e[12];
  const ly = e[1] * x + e[5] * y + e[9] * z + e[13];
  const lz = e[2] * x + e[6] * y + e[10] * z + e[14];
  return sampleGrid(m.sdf, lx, ly, lz) * m.scale;
}

function combine(members: Member[], x: number, y: number, z: number, k: number): number {
  let acc = distance(members[0], x, y, z);
  for (let n = 1; n < members.length; n++) {
    const d = distance(members[n], x, y, z);
    const join = members[n].join;
    acc = join === 'carve' ? carve(acc, d, k) : join === 'intersect' ? intersect(acc, d, k) : smin(acc, d, k);
  }
  return acc;
}

export interface Mash {
  geometry: BufferGeometry;
  /** Which piece's surface is closest to a world point, for click-to-select. */
  pick(point: Vector3): string;
}

/**
 * Fuses pieces (already sorted: melts, then intersects, then carves) into one
 * mesh. `res` is the number of grid cells across the longest side.
 */
export function buildMash(pieces: Piece[], blend: number, res: number): Mash | null {
  const members = pieces.map(toMember).filter((m): m is Member => !!m);
  if (members.length < 2) return null;

  const lo = members[0].bounds.min.clone(), hi = members[0].bounds.max.clone();
  for (const m of members) {
    // Carves and intersects can only remove glass, so only melts grow the box.
    if (m.join !== 'melt') continue;
    lo.min(m.bounds.min);
    hi.max(m.bounds.max);
  }
  lo.subScalar(blend);
  hi.addScalar(blend);
  const size = hi.clone().sub(lo);
  const h = Math.max(size.x, size.y, size.z) / res;
  const nx = Math.ceil(size.x / h) + 1, ny = Math.ceil(size.y / h) + 1, nz = Math.ceil(size.z / h) + 1;

  const field = new Float32Array(nx * ny * nz);
  let o = 0;
  for (let k = 0; k < nz; k++) {
    const z = lo.z + k * h;
    for (let j = 0; j < ny; j++) {
      const y = lo.y + j * h;
      for (let i = 0; i < nx; i++) field[o++] = combine(members, lo.x + i * h, y, z, blend);
    }
  }
  // Close the form at the box walls so a carve that runs off the edge still leaves a sealed skin.
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++)
        if (i === 0 || j === 0 || k === 0 || i === nx - 1 || j === ny - 1 || k === nz - 1)
          field[i + nx * (j + ny * k)] = Math.max(field[i + nx * (j + ny * k)], h * 0.5);

  const geometry = surfaceNets(field, nx, ny, nz, [lo.x, lo.y, lo.z], h);
  return {
    geometry,
    pick(p) {
      let best = members[0].id, bestD = Infinity;
      for (const m of members) {
        const d = Math.abs(distance(m, p.x, p.y, p.z));
        if (d < bestD) {
          bestD = d;
          best = m.id;
        }
      }
      return best;
    },
  };
}
