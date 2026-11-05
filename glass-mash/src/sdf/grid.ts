/**
 * A signed distance field sampled on a regular grid: negative inside the
 * glass, positive outside, zero on the surface. Values sit on grid points.
 */
export interface SdfGrid {
  min: [number, number, number]; // world position of grid point (0, 0, 0)
  h: number; // spacing between grid points
  nx: number;
  ny: number;
  nz: number;
  data: Float32Array; // index = i + nx * (j + ny * k)
}

/**
 * Trilinear lookup. Outside the grid it continues from the nearest edge value
 * plus the distance to the grid, which is close enough for blending far away.
 */
export function sampleGrid(g: SdfGrid, x: number, y: number, z: number): number {
  const fx = (x - g.min[0]) / g.h, fy = (y - g.min[1]) / g.h, fz = (z - g.min[2]) / g.h;
  const cx = Math.min(Math.max(fx, 0), g.nx - 1.0001);
  const cy = Math.min(Math.max(fy, 0), g.ny - 1.0001);
  const cz = Math.min(Math.max(fz, 0), g.nz - 1.0001);
  const outside = Math.hypot(fx - cx, fy - cy, fz - cz) * g.h;

  const i = Math.floor(cx), j = Math.floor(cy), k = Math.floor(cz);
  const tx = cx - i, ty = cy - j, tz = cz - k;
  const sx = 1, sy = g.nx, sz = g.nx * g.ny;
  const o = i + j * sy + k * sz;
  const d = g.data;
  const c00 = d[o] * (1 - tx) + d[o + sx] * tx;
  const c10 = d[o + sy] * (1 - tx) + d[o + sy + sx] * tx;
  const c01 = d[o + sz] * (1 - tx) + d[o + sz + sx] * tx;
  const c11 = d[o + sz + sy] * (1 - tx) + d[o + sz + sy + sx] * tx;
  const v = (c00 * (1 - ty) + c10 * ty) * (1 - tz) + (c01 * (1 - ty) + c11 * ty) * tz;
  return v + outside;
}
