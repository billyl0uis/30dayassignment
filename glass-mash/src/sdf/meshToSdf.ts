import type { BufferGeometry } from 'three';
import { Vector3 } from 'three';
import { MeshBVH, type HitPointInfo } from 'three-mesh-bvh';
import { EDT_INF, edt3d } from './edt';
import type { SdfGrid } from './grid';

/**
 * Turns a closed mesh into a signed distance grid in its own local space.
 *  1. inside/outside: shoot a ray along +x through every grid row and fill
 *     between alternate surface crossings
 *  2. rough distance everywhere: a 3D distance transform of that mask
 *  3. exact distance near the surface: closest point on the mesh (via a BVH),
 *     so melted surfaces stay as smooth as the originals
 */
export function meshToSdf(geo: BufferGeometry, cellsAcross = 64): SdfGrid {
  geo.computeBoundingBox();
  const b = geo.boundingBox!;
  const ext = Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z, 1e-3);
  const h = ext / cellsAcross;
  const pad = 4 * h + 0.08;
  const min: [number, number, number] = [b.min.x - pad, b.min.y - pad, b.min.z - pad];
  const nx = Math.ceil((b.max.x - b.min.x + 2 * pad) / h) + 1;
  const ny = Math.ceil((b.max.y - b.min.y + 2 * pad) / h) + 1;
  const nz = Math.ceil((b.max.z - b.min.z + 2 * pad) / h) + 1;
  const N = nx * ny * nz;

  const inside = insideMask(geo, min, h, nx, ny, nz);

  // Squared voxel distance to the nearest inside voxel, and to the nearest outside one.
  const toIn = new Float64Array(N), toOut = new Float64Array(N);
  let any = false;
  for (let i = 0; i < N; i++) {
    toIn[i] = inside[i] ? 0 : EDT_INF;
    toOut[i] = inside[i] ? EDT_INF : 0;
    any ||= inside[i] === 1;
  }
  const data = new Float32Array(N);
  if (!any) {
    data.fill(ext);
    return { min, h, nx, ny, nz, data };
  }
  edt3d(toIn, nx, ny, nz);
  edt3d(toOut, nx, ny, nz);
  for (let i = 0; i < N; i++) {
    data[i] = inside[i] ? -(Math.sqrt(toOut[i]) - 0.5) * h : (Math.sqrt(toIn[i]) - 0.5) * h;
  }

  const bvh = new MeshBVH(geo, { indirect: true });
  const p = new Vector3();
  const hit = {} as HitPointInfo;
  const band = 2.5 * h;
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const idx = i + nx * (j + ny * k);
        if (Math.abs(data[idx]) > band) continue;
        p.set(min[0] + i * h, min[1] + j * h, min[2] + k * h);
        if (bvh.closestPointToPoint(p, hit, 0, band * 1.6)) {
          data[idx] = inside[idx] ? -hit.distance : hit.distance;
        }
      }
    }
  }
  return { min, h, nx, ny, nz, data };
}

function insideMask(
  geo: BufferGeometry,
  min: [number, number, number],
  h: number,
  nx: number,
  ny: number,
  nz: number,
): Uint8Array {
  const pos = geo.getAttribute('position').array;
  const index = geo.getIndex()!.array;
  const rows: number[][] = Array.from({ length: ny * nz }, () => []);
  const eps = h * 1e-4; // nudge rays off grid-aligned edges so no crossing is counted twice

  for (let t = 0; t < index.length; t += 3) {
    const a = index[t] * 3, b = index[t + 1] * 3, c = index[t + 2] * 3;
    const ay = pos[a + 1], az = pos[a + 2], by = pos[b + 1], bz = pos[b + 2], cy = pos[c + 1], cz = pos[c + 2];
    const det = (by - ay) * (cz - az) - (cy - ay) * (bz - az);
    if (Math.abs(det) < 1e-12) continue; // edge-on to the rays
    const j0 = Math.max(0, Math.ceil((Math.min(ay, by, cy) - min[1] - eps) / h));
    const j1 = Math.min(ny - 1, Math.floor((Math.max(ay, by, cy) - min[1] - eps) / h));
    const k0 = Math.max(0, Math.ceil((Math.min(az, bz, cz) - min[2] - eps) / h));
    const k1 = Math.min(nz - 1, Math.floor((Math.max(az, bz, cz) - min[2] - eps) / h));
    for (let k = k0; k <= k1; k++) {
      const pz = min[2] + k * h + eps;
      for (let j = j0; j <= j1; j++) {
        const py = min[1] + j * h + eps;
        const u = ((py - ay) * (cz - az) - (cy - ay) * (pz - az)) / det;
        const v = ((by - ay) * (pz - az) - (py - ay) * (bz - az)) / det;
        if (u < 0 || v < 0 || u + v > 1) continue;
        rows[j + ny * k].push(pos[a] + u * (pos[b] - pos[a]) + v * (pos[c] - pos[a]));
      }
    }
  }

  const inside = new Uint8Array(nx * ny * nz);
  for (let r = 0; r < rows.length; r++) {
    const xs = rows[r].sort((p, q) => p - q);
    let next = 0;
    for (let i = 0; i < nx; i++) {
      const x = min[0] + i * h;
      while (next < xs.length && xs[next] < x) next++;
      if (next % 2 === 1) inside[r * nx + i] = 1;
    }
  }
  return inside;
}
