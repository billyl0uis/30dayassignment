// Surface nets: one vertex per surface-crossing cell, placed at the average of
// the edge crossings, then a quad for every grid edge that changes sign.
// Smoother than marching cubes on an SDF and needs no lookup tables.
// Normals come from the gradient of the trilinear SDF at each vertex, so
// shading follows the field, not the facets.

const EDGES = [];
for (let a = 0; a < 8; a++) for (let axis = 0; axis < 3; axis++) {
  if (!(a & (1 << axis))) EDGES.push([a, a | (1 << axis), axis]);
}

export function surfaceNets(vol) {
  const { n, sdf, h, origin } = vol;
  const m = n - 1;                       // cells per axis
  const nn = n * n;
  const OFF = [0, 1, n, n + 1, nn, nn + 1, nn + n, nn + n + 1];
  const slots = new Int32Array(2 * m * m); // vertex ids for two z-slices of cells
  const pos = [], nor = [], idx = [];
  const v = new Float32Array(8);

  for (let k = 0; k < m; k++) {
    const zs = (k & 1) * m * m, zsPrev = ((k + 1) & 1) * m * m;
    for (let j = 0; j < m; j++) {
      for (let i = 0; i < m; i++) {
        const base = i + n * (j + n * k);
        let mask = 0;
        for (let b = 0; b < 8; b++) {
          const s = sdf[base + OFF[b]];
          v[b] = s;
          if (s < 0) mask |= 1 << b;
        }
        if (mask === 0 || mask === 255) continue;

        // Vertex = mean of edge crossings, in local [0,1]³ cell coordinates.
        let sx = 0, sy = 0, sz = 0, cnt = 0;
        for (let e = 0; e < 12; e++) {
          const [a, b, axis] = EDGES[e];
          if (((mask >> a) & 1) === ((mask >> b) & 1)) continue;
          const d = v[a] - v[b];
          const t = d === 0 ? 0.5 : v[a] / d;
          let px = a & 1, py = (a >> 1) & 1, pz = (a >> 2) & 1;
          if (axis === 0) px += t; else if (axis === 1) py += t; else pz += t;
          sx += px; sy += py; sz += pz; cnt++;
        }
        const fx = sx / cnt, fy = sy / cnt, fz = sz / cnt;

        // Gradient of the trilinear interpolant → outward normal.
        const gx = (1 - fy) * (1 - fz) * (v[1] - v[0]) + fy * (1 - fz) * (v[3] - v[2]) + (1 - fy) * fz * (v[5] - v[4]) + fy * fz * (v[7] - v[6]);
        const gy = (1 - fx) * (1 - fz) * (v[2] - v[0]) + fx * (1 - fz) * (v[3] - v[1]) + (1 - fx) * fz * (v[6] - v[4]) + fx * fz * (v[7] - v[5]);
        const gz = (1 - fx) * (1 - fy) * (v[4] - v[0]) + fx * (1 - fy) * (v[5] - v[1]) + (1 - fx) * fy * (v[6] - v[2]) + fx * fy * (v[7] - v[3]);
        const gl = Math.hypot(gx, gy, gz) || 1;

        const vi = pos.length / 3;
        pos.push(origin[0] + (i + fx) * h, origin[1] + (j + fy) * h, origin[2] + (k + fz) * h);
        nor.push(gx / gl, gy / gl, gz / gl);
        const slot = zs + j * m + i;
        slots[slot] = vi;

        // Quads for the three grid edges leaving corner 0 of this cell.
        // The other three cells around each edge were visited already.
        const c = [i, j, k];
        for (let axis = 0; axis < 3; axis++) {
          if ((mask & 1) === ((mask >> (1 << axis)) & 1)) continue;
          const iu = (axis + 1) % 3, iv = (axis + 2) % 3;
          if (c[iu] === 0 || c[iv] === 0) continue;
          const su = cellSlot(c, iu, -1, m, zs, zsPrev);
          const sv = cellSlot(c, iv, -1, m, zs, zsPrev);
          const suv = cellSlot(c, iu, iv, m, zs, zsPrev);
          const a = vi, b = slots[su], cc = slots[suv], d = slots[sv];
          if (mask & 1) idx.push(a, b, cc, a, cc, d); // corner 0 inside → face points +axis
          else idx.push(a, d, cc, a, cc, b);
        }
      }
    }
  }
  return {
    positions: new Float32Array(pos),
    normals: new Float32Array(nor),
    indices: new Uint32Array(idx),
  };
}

// Ring-buffer slot of the cell offset by -1 along axis u (and along v, unless v is -1).
function cellSlot(c, u, v, m, zs, zsPrev) {
  let i = c[0], j = c[1], z = zs;
  for (const ax of v >= 0 ? [u, v] : [u]) {
    if (ax === 0) i -= 1; else if (ax === 1) j -= 1; else z = zsPrev;
  }
  return z + j * m + i;
}
