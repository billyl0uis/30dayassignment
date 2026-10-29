const INF = 1e20;

/** Felzenszwalb & Huttenlocher's 1D squared distance transform, in place on `f`. */
function edt1d(f: Float64Array, n: number, out: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    out[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
  for (let q = 0; q < n; q++) f[q] = out[q];
}

/**
 * Exact Euclidean distance transform on a 3D grid, one axis at a time.
 * `f` holds 0 on feature voxels and anything ≥ INF elsewhere; on return it
 * holds the squared distance (in voxels) to the nearest feature voxel.
 */
export function edt3d(f: Float64Array, nx: number, ny: number, nz: number): void {
  const n = Math.max(nx, ny, nz);
  const line = new Float64Array(n), out = new Float64Array(n);
  const v = new Int32Array(n), z = new Float64Array(n + 1);
  const pass = (len: number, count: number, start: (c: number) => number, stride: number) => {
    for (let c = 0; c < count; c++) {
      const s0 = start(c);
      for (let q = 0; q < len; q++) line[q] = f[s0 + q * stride];
      edt1d(line, len, out, v, z);
      for (let q = 0; q < len; q++) f[s0 + q * stride] = line[q];
    }
  };
  pass(nx, ny * nz, (c) => c * nx, 1);
  pass(ny, nx * nz, (c) => (c % nx) + Math.floor(c / nx) * nx * ny, nx);
  pass(nz, nx * ny, (c) => c, nx * ny);
}

export const EDT_INF = INF;
