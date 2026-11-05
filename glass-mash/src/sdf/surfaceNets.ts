import { BufferAttribute, BufferGeometry } from 'three';

// The 12 cube edges as pairs of corner numbers; corner n sits at (n&1, n>>1&1, n>>2&1).
const EDGES: [number, number][] = [];
for (let n = 0; n < 8; n++) for (const bit of [1, 2, 4]) if (!(n & bit)) EDGES.push([n, n | bit]);

/**
 * Turns a distance field into a mesh with "surface nets": one vertex per grid
 * cell that the surface passes through (at the average of its edge crossings),
 * then one quad for every grid edge the surface crosses. A close cousin of
 * marching cubes that gives smoother, more even triangles, which glass shows off.
 * Normals come from the field's gradient, so shading is smooth too.
 */
export function surfaceNets(
  f: Float32Array,
  nx: number,
  ny: number,
  nz: number,
  min: [number, number, number],
  h: number,
): BufferGeometry {
  const sy = nx, sz = nx * ny;
  const at = (i: number, j: number, k: number) => i + j * sy + k * sz;

  // Field gradient at every grid point (central differences, one-sided at the borders).
  const N = nx * ny * nz;
  const gx = new Float32Array(N), gy = new Float32Array(N), gz = new Float32Array(N);
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const o = at(i, j, k);
        gx[o] = f[at(Math.min(i + 1, nx - 1), j, k)] - f[at(Math.max(i - 1, 0), j, k)];
        gy[o] = f[at(i, Math.min(j + 1, ny - 1), k)] - f[at(i, Math.max(j - 1, 0), k)];
        gz[o] = f[at(i, j, Math.min(k + 1, nz - 1))] - f[at(i, j, Math.max(k - 1, 0))];
      }

  const cellVert = new Int32Array(N).fill(-1);
  const pos: number[] = [];
  const nrm: number[] = [];
  const corner = new Float32Array(8);

  for (let k = 0; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0;
        for (let n = 0; n < 8; n++) {
          corner[n] = f[at(i + (n & 1), j + ((n >> 1) & 1), k + ((n >> 2) & 1))];
          if (corner[n] < 0) mask |= 1 << n;
        }
        if (mask === 0 || mask === 255) continue;

        let lx = 0, ly = 0, lz = 0, count = 0;
        for (const [a, b] of EDGES) {
          const va = corner[a], vb = corner[b];
          if (va < 0 === vb < 0) continue;
          const t = va / (va - vb);
          lx += (a & 1) + ((b & 1) - (a & 1)) * t;
          ly += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t;
          lz += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t;
          count++;
        }
        lx /= count;
        ly /= count;
        lz /= count;

        // Trilinear gradient at the vertex.
        let nxv = 0, nyv = 0, nzv = 0;
        for (let n = 0; n < 8; n++) {
          const wx = n & 1 ? lx : 1 - lx, wy = (n >> 1) & 1 ? ly : 1 - ly, wz = (n >> 2) & 1 ? lz : 1 - lz;
          const w = wx * wy * wz;
          const o = at(i + (n & 1), j + ((n >> 1) & 1), k + ((n >> 2) & 1));
          nxv += gx[o] * w;
          nyv += gy[o] * w;
          nzv += gz[o] * w;
        }
        const len = Math.hypot(nxv, nyv, nzv) || 1;

        cellVert[at(i, j, k)] = pos.length / 3;
        pos.push(min[0] + (i + lx) * h, min[1] + (j + ly) * h, min[2] + (k + lz) * h);
        nrm.push(nxv / len, nyv / len, nzv / len);
      }

  const index: number[] = [];
  const quad = (c0: number, c1: number, c2: number, c3: number, axis: number, insideFirst: boolean) => {
    const a = cellVert[c0], b = cellVert[c1], c = cellVert[c2], d = cellVert[c3];
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    // Wind so the face points from inside to outside along the crossed edge.
    const e1 = [pos[b * 3] - pos[a * 3], pos[b * 3 + 1] - pos[a * 3 + 1], pos[b * 3 + 2] - pos[a * 3 + 2]];
    const e2 = [pos[c * 3] - pos[a * 3], pos[c * 3 + 1] - pos[a * 3 + 1], pos[c * 3 + 2] - pos[a * 3 + 2]];
    const cross = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const pointsUp = cross[axis] > 0;
    if (pointsUp === insideFirst) index.push(a, b, c, a, c, d);
    else index.push(a, d, c, a, c, b);
  };

  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const v0 = f[at(i, j, k)];
        const in0 = v0 < 0;
        if (i < nx - 1 && j > 0 && k > 0 && in0 !== f[at(i + 1, j, k)] < 0)
          quad(at(i, j - 1, k - 1), at(i, j, k - 1), at(i, j, k), at(i, j - 1, k), 0, in0);
        if (j < ny - 1 && i > 0 && k > 0 && in0 !== f[at(i, j + 1, k)] < 0)
          quad(at(i - 1, j, k - 1), at(i, j, k - 1), at(i, j, k), at(i - 1, j, k), 1, in0);
        if (k < nz - 1 && i > 0 && j > 0 && in0 !== f[at(i, j, k + 1)] < 0)
          quad(at(i - 1, j - 1, k), at(i, j - 1, k), at(i, j, k), at(i - 1, j, k), 2, in0);
      }

  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('normal', new BufferAttribute(new Float32Array(nrm), 3));
  geo.setIndex(index);
  geo.computeBoundingSphere();
  return geo;
}
