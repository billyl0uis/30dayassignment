// Signed distance field on a cubic voxel grid. Units are centimetres.
// Convention: sdf < 0 inside the glass, > 0 outside, 0 on the surface.
// World y = 0 is the floor; the grid starts two voxels below it so a piece
// resting on the floor still has an "outside" layer underneath for meshing.

export class Volume {
  constructor(n = 128, size = 24) {
    this.n = n;
    this.size = size;                 // edge length of the cube, cm
    this.h = size / (n - 1);          // voxel spacing, cm
    this.origin = [-size / 2, -2 * this.h, -size / 2];
    this.sdf = new Float32Array(n * n * n).fill(size);
    this.meta = {};                   // punty axis, gather centre, etc.
  }

  index(i, j, k) { return i + this.n * (j + this.n * k); }

  // Evaluate fn(x, y, z, current) at every voxel and store the result.
  // Ops are written as SDF functions of world position, so they don't care
  // about grid resolution.
  map(fn) {
    const { n, h, origin, sdf } = this;
    let idx = 0;
    for (let k = 0; k < n; k++) {
      const z = origin[2] + k * h;
      for (let j = 0; j < n; j++) {
        const y = origin[1] + j * h;
        for (let i = 0; i < n; i++, idx++) {
          sdf[idx] = fn(origin[0] + i * h, y, z, sdf[idx]);
        }
      }
    }
    this.sealBoundary();
  }

  // Force the outermost voxel shell to "outside" so the mesh is always closed.
  sealBoundary() {
    const { n, sdf, h } = this;
    const last = n - 1;
    for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      if (i === 0 || j === 0 || k === 0 || i === last || j === last || k === last) {
        const idx = i + n * (j + n * k);
        if (sdf[idx] < h) sdf[idx] = h;
      } else if (j > 0 && j < last && i > 0 && i < last) {
        i = last - 1; // skip the interior of this row
      }
    }
  }

  // Trilinear sample at a world position (outside the grid → far outside).
  sample(x, y, z) {
    const { n, h, origin, sdf } = this;
    const gx = (x - origin[0]) / h, gy = (y - origin[1]) / h, gz = (z - origin[2]) / h;
    if (gx < 0 || gy < 0 || gz < 0 || gx >= n - 1 || gy >= n - 1 || gz >= n - 1) return this.size;
    const i = gx | 0, j = gy | 0, k = gz | 0;
    const fx = gx - i, fy = gy - j, fz = gz - k;
    const b = i + n * (j + n * k), nn = n * n;
    const c00 = sdf[b] * (1 - fx) + sdf[b + 1] * fx;
    const c10 = sdf[b + n] * (1 - fx) + sdf[b + n + 1] * fx;
    const c01 = sdf[b + nn] * (1 - fx) + sdf[b + nn + 1] * fx;
    const c11 = sdf[b + nn + n] * (1 - fx) + sdf[b + nn + n + 1] * fx;
    return (c00 * (1 - fy) + c10 * fy) * (1 - fz) + (c01 * (1 - fy) + c11 * fy) * fz;
  }

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
}
