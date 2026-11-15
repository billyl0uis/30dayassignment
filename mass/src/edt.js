// Exact squared Euclidean distance transform, Felzenszwalb & Huttenlocher.
// Works on arbitrary initial values f (0 at seeds, BIG elsewhere, or a
// squared sub-voxel offset at seeds). Separable: one 1-D pass per axis.

export const BIG = 1e20;

export function dt1(f, n, d, v, z) {
  let k = 0;
  v[0] = 0; z[0] = -BIG; z[1] = BIG;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++; v[k] = q; z[k] = s; z[k + 1] = BIG;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const dq = q - v[k];
    d[q] = dq * dq + f[v[k]];
  }
}

// In-place 3-D transform of a Float64Array laid out x-fastest (X × Y × Z).
export function edt3(d, X, Y, Z) {
  const L = Math.max(X, Y, Z);
  const f = new Float64Array(L), out = new Float64Array(L), v = new Int32Array(L), z = new Float64Array(L + 1);
  // x
  for (let k = 0; k < Z; k++) for (let j = 0; j < Y; j++) {
    const b = X * (j + Y * k);
    for (let q = 0; q < X; q++) f[q] = d[b + q];
    dt1(f, X, out, v, z);
    for (let q = 0; q < X; q++) d[b + q] = out[q];
  }
  // y
  for (let k = 0; k < Z; k++) for (let i = 0; i < X; i++) {
    const b = i + X * Y * k;
    for (let q = 0; q < Y; q++) f[q] = d[b + X * q];
    dt1(f, Y, out, v, z);
    for (let q = 0; q < Y; q++) d[b + X * q] = out[q];
  }
  // z
  const XY = X * Y;
  for (let j = 0; j < Y; j++) for (let i = 0; i < X; i++) {
    const b = i + X * j;
    for (let q = 0; q < Z; q++) f[q] = d[b + XY * q];
    dt1(f, Z, out, v, z);
    for (let q = 0; q < Z; q++) d[b + XY * q] = out[q];
  }
}
