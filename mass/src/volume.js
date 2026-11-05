// Signed distance field on a cubic voxel grid. Units are centimetres.
// Convention: sdf < 0 inside the glass, > 0 outside, 0 on the surface.
// World y = 0 is the floor; the grid starts two voxels below it so a piece
// resting on the floor still has an "outside" layer underneath for meshing.
//
// color[] holds a palette index per voxel: 0 = the base glass, i > 0 =
// meta.palette[i - 1] (a colour key from colors.js). Colour only means
// something inside the glass but is carried everywhere so warps move it.

export class Volume {
  constructor(n = 128, size = 24) {
    this.n = n;
    this.size = size;                 // edge length of the cube, cm
    this.h = size / (n - 1);          // voxel spacing, cm
    this.origin = [-size / 2, -2 * this.h, -size / 2];
    this.sdf = new Float32Array(n * n * n).fill(size);
    this.color = new Uint8Array(n * n * n);
    this.meta = { palette: [], paddled: [] };
  }

  index(i, j, k) { return i + this.n * (j + this.n * k); }

  clone() {
    const v = Object.create(Volume.prototype);
    Object.assign(v, this);
    v.sdf = this.sdf.slice();
    v.color = this.color.slice();
    v.meta = structuredClone(this.meta);
    v.interior = null;
    return v;
  }

  // Evaluate fn(x, y, z, current) at every voxel and store the result.
  map(fn) {
    const { n, h, origin, sdf } = this;
    let idx = 0;
    for (let k = 0; k < n; k++) {
      const z = origin[2] + k * h;
      for (let j = 0; j < n; j++) {
        const y = origin[1] + j * h;
        for (let i = 0; i < n; i++, idx++) sdf[idx] = fn(origin[0] + i * h, y, z, sdf[idx]);
      }
    }
    this.sealBoundary();
  }

  // Voxel box {i0..i1, j0..j1, k0..k1} (inclusive) covering a world-space AABB,
  // clamped inside the sealed outer shell.
  box(min, max, margin = 0) {
    const { n, h, origin } = this;
    const c = (v, a) => Math.min(n - 2, Math.max(1, v));
    return {
      i0: c(Math.floor((min[0] - margin - origin[0]) / h)), i1: c(Math.ceil((max[0] + margin - origin[0]) / h)),
      j0: c(Math.floor((min[1] - margin - origin[1]) / h)), j1: c(Math.ceil((max[1] + margin - origin[1]) / h)),
      k0: c(Math.floor((min[2] - margin - origin[2]) / h)), k1: c(Math.ceil((max[2] + margin - origin[2]) / h)),
    };
  }

  // Box around all glass, expanded by `margin` cm.
  pieceBox(margin = 0) {
    const { n, sdf } = this;
    let i0 = n, i1 = -1, j0 = n, j1 = -1, k0 = n, k1 = -1, idx = 0;
    for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++, idx++) {
      if (sdf[idx] >= 0) continue;
      if (i < i0) i0 = i; if (i > i1) i1 = i;
      if (j < j0) j0 = j; if (j > j1) j1 = j;
      if (k < k0) k0 = k; if (k > k1) k1 = k;
    }
    if (i1 < 0) return null;
    const m = Math.ceil(margin / this.h), c = (v) => Math.min(n - 2, Math.max(1, v));
    return { i0: c(i0 - m), i1: c(i1 + m), j0: c(j0 - m), j1: c(j1 + m), k0: c(k0 - m), k1: c(k1 + m) };
  }

  boxWorld(b) {
    const { h, origin } = this;
    return {
      min: [origin[0] + b.i0 * h, origin[1] + b.j0 * h, origin[2] + b.k0 * h],
      max: [origin[0] + b.i1 * h, origin[1] + b.j1 * h, origin[2] + b.k1 * h],
    };
  }

  // Call fn(idx, x, y, z) for every voxel in a box.
  forBox(b, fn) {
    const { n, h, origin } = this;
    for (let k = b.k0; k <= b.k1; k++) {
      const z = origin[2] + k * h;
      for (let j = b.j0; j <= b.j1; j++) {
        const y = origin[1] + j * h;
        let idx = b.i0 + n * (j + n * k);
        for (let i = b.i0; i <= b.i1; i++, idx++) fn(idx, origin[0] + i * h, y, z);
      }
    }
  }

  // Force the outermost voxel shell to "outside" so the mesh is always closed.
  sealBoundary() {
    const { n, sdf, h } = this;
    const last = n - 1;
    for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      if (i === 0 || j === 0 || k === 0 || i === last || j === last || k === last) {
        const idx = i + n * (j + n * k);
        if (sdf[idx] < h) sdf[idx] = h;
      } else {
        i = last - 1; // skip the interior of this row
      }
    }
  }

  // Trilinear sample of an arbitrary per-voxel array (outside → `outside`).
  sampleArr(arr, x, y, z, outside = this.size) {
    const { n, h, origin } = this;
    const gx = (x - origin[0]) / h, gy = (y - origin[1]) / h, gz = (z - origin[2]) / h;
    if (gx < 0 || gy < 0 || gz < 0 || gx >= n - 1 || gy >= n - 1 || gz >= n - 1) return outside;
    const i = gx | 0, j = gy | 0, k = gz | 0;
    const fx = gx - i, fy = gy - j, fz = gz - k;
    const b = i + n * (j + n * k), nn = n * n;
    const c00 = arr[b] * (1 - fx) + arr[b + 1] * fx;
    const c10 = arr[b + n] * (1 - fx) + arr[b + n + 1] * fx;
    const c01 = arr[b + nn] * (1 - fx) + arr[b + nn + 1] * fx;
    const c11 = arr[b + nn + n] * (1 - fx) + arr[b + nn + n + 1] * fx;
    return (c00 * (1 - fy) + c10 * fy) * (1 - fz) + (c01 * (1 - fy) + c11 * fy) * fz;
  }

  nearestArr(arr, x, y, z) {
    const { n, h, origin } = this;
    const i = Math.round((x - origin[0]) / h), j = Math.round((y - origin[1]) / h), k = Math.round((z - origin[2]) / h);
    if (i < 0 || j < 0 || k < 0 || i >= n || j >= n || k >= n) return 0;
    return arr[i + n * (j + n * k)];
  }

  sample(x, y, z) { return this.sampleArr(this.sdf, x, y, z); }

  // Volume in cm³ with sub-voxel accuracy: each voxel contributes the fraction
  // of its cell that is inside, estimated from the distance value.
  volumeCm3() {
    const { sdf, h } = this;
    let v = 0;
    for (let i = 0; i < sdf.length; i++) {
      const f = 0.5 - sdf[i] / h;
      v += f <= 0 ? 0 : f >= 1 ? 1 : f;
    }
    return v * h * h * h;
  }

  // Palette index for a colour key, adding it if new. 0 = base glass.
  colorIndex(key) {
    if (!key || key === 'clear') return 0;
    let i = this.meta.palette.indexOf(key);
    if (i < 0) { this.meta.palette.push(key); i = this.meta.palette.length - 1; }
    return i + 1;
  }
}

export const frac = (d, h) => { const f = 0.5 - d / h; return f <= 0 ? 0 : f >= 1 ? 1 : f; };
