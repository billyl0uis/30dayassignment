import Delaunator from 'delaunator';
import { BufferAttribute, BufferGeometry } from 'three';
import {
  bbox,
  distToPolygon,
  nearestOnPolygon,
  pointInPolygon,
  resampleClosed,
  type Vec2,
} from '../../geom2d/polygon';
import type { ModeDef } from '../types';
import { centerOnFloor } from '../util';
import { heightProfile } from './profile';

export const inflateMode: ModeDef = {
  id: 'inflate',
  label: 'Inflate',
  blurb: 'Puff the drawing up like a balloon.',
  params: [
    { key: 'amount', label: 'Inflation', min: 0, max: 1, step: 0.01, default: 0.55 },
    { key: 'detail', label: 'Detail', min: 24, max: 96, step: 1, default: 60 },
  ],
  build(drawing, p) {
    return buildInflated(drawing.outline, p.amount, p.detail);
  },
};

/**
 * Teddy / Monster Mash-style inflation:
 *  1. fill the outline with points (rim ring, two inner rings, a triangular lattice)
 *  2. measure each point's distance to the edge — the distance field
 *  3. height = heightProfile(distance), mirrored front and back
 *  4. Delaunay-triangulate once and reuse the triangles for both halves,
 *     sharing the rim vertices so the two sides seal into one closed skin.
 */
export function buildInflated(outline: Vec2[], amount: number, detail: number): BufferGeometry {
  const [minX, minY, maxX, maxY] = bbox(outline);
  const s = Math.max(maxX - minX, maxY - minY) / detail; // lattice spacing

  const ring = resampleClosed(outline, s * 0.55);
  const nB = ring.length;
  const pts: Vec2[] = ring.slice();
  const dists: number[] = new Array(nB).fill(0);

  // Two rings just inside the rim, so the steep part of the profile has vertices to bend on.
  for (const off of [0.3, 0.75]) {
    for (let i = 0; i < nB; i++) {
      const a = ring[(i - 1 + nB) % nB], b = ring[(i + 1) % nB];
      const tx = b[0] - a[0], ty = b[1] - a[1];
      const len = Math.hypot(tx, ty) || 1;
      const q: Vec2 = [ring[i][0] - (ty / len) * off * s, ring[i][1] + (tx / len) * off * s];
      const d = distToPolygon(q, outline);
      if (d > off * s * 0.8 && pointInPolygon(q, outline)) {
        pts.push(q);
        dists.push(d);
      }
    }
  }
  // Triangular lattice for the interior.
  const rowH = (s * Math.sqrt(3)) / 2;
  for (let row = 0, y = minY; y <= maxY; y += rowH, row++) {
    for (let x = minX + (row % 2 ? s / 2 : 0); x <= maxX; x += s) {
      const q: Vec2 = [x, y];
      if (!pointInPolygon(q, outline)) continue;
      const d = distToPolygon(q, outline);
      if (d > s * 1.15) {
        pts.push(q);
        dists.push(d);
      }
    }
  }

  const maxD = Math.max(...dists, 1e-6);
  const h = dists.map((d, i) => (i < nB ? 0 : Math.max(0, heightProfile(d, maxD, amount))));

  // Triangulate, dropping triangles that bridge across a concave notch.
  const del = Delaunator.from(pts);
  const tris: number[] = [];
  const isRingNeighbour = (i: number, j: number) => i < nB && j < nB && (Math.abs(i - j) === 1 || Math.abs(i - j) === nB - 1);
  const mid = (i: number, j: number): Vec2 => [(pts[i][0] + pts[j][0]) / 2, (pts[i][1] + pts[j][1]) / 2];
  for (let t = 0; t < del.triangles.length; t += 3) {
    const a = del.triangles[t], b = del.triangles[t + 1], c = del.triangles[t + 2];
    const centroid: Vec2 = [(pts[a][0] + pts[b][0] + pts[c][0]) / 3, (pts[a][1] + pts[b][1] + pts[c][1]) / 3];
    if (!pointInPolygon(centroid, outline)) continue;
    const edgeOk = ([i, j]: [number, number]) =>
      i >= nB || j >= nB || isRingNeighbour(i, j) || pointInPolygon(mid(i, j), outline);
    if (!edgeOk([a, b]) || !edgeOk([b, c]) || !edgeOk([c, a])) continue;
    // Make every front triangle counter-clockwise seen from +z.
    const cross = (pts[b][0] - pts[a][0]) * (pts[c][1] - pts[a][1]) - (pts[b][1] - pts[a][1]) * (pts[c][0] - pts[a][0]);
    if (cross > 0) tris.push(a, b, c);
    else tris.push(a, c, b);
  }

  smoothInterior(h, tris, nB, dists, s);

  // Front skin uses every point; back skin re-uses the rim and mirrors the rest.
  const n = pts.length;
  const back = (i: number) => (i < nB ? i : n + (i - nB));
  const pos = new Float32Array((n + n - nB) * 3);
  for (let i = 0; i < n; i++) {
    pos.set([pts[i][0], pts[i][1], h[i]], i * 3);
    if (i >= nB) pos.set([pts[i][0], pts[i][1], -h[i]], back(i) * 3);
  }
  const index: number[] = tris.slice();
  for (let t = 0; t < tris.length; t += 3) index.push(back(tris[t]), back(tris[t + 2]), back(tris[t + 1]));

  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setIndex(index);
  centerOnFloor(geo);
  geo.computeVertexNormals();
  smoothRimNormals(geo, pts, dists, nB, outline, s, (d) => heightProfile(d, maxD, amount), back);
  return geo;
}

/**
 * Near the rim the profile turns vertical, and normals averaged from the thin
 * triangles there alternate direction, which shows up as a zig-zag highlight
 * along the seam. Close to the edge, replace them with the true normal of the
 * height field: straight out at the rim, tipping up as the surface flattens.
 */
function smoothRimNormals(
  geo: BufferGeometry,
  pts: Vec2[],
  dists: number[],
  nB: number,
  outline: Vec2[],
  s: number,
  height: (d: number) => number,
  back: (i: number) => number,
) {
  const normals = geo.getAttribute('normal') as BufferAttribute;
  const band = s * 1.6; // past this, the averaged normals are already smooth
  const slope = (d: number) => {
    const lo = Math.max(d - d * 0.25, 0), hi = d + Math.max(d * 0.25, 1e-5);
    return (height(hi) - height(lo)) / (hi - lo);
  };

  for (let i = 0; i < pts.length; i++) {
    const d = dists[i];
    if (d >= band) continue;
    let nx: number, ny: number, nz: number;
    if (i < nB) {
      // On the rim: horizontal, pointing out of the drawing (the outline is CCW).
      const a = pts[(i - 1 + nB) % nB], b = pts[(i + 1) % nB];
      const tx = b[0] - a[0], ty = b[1] - a[1];
      const len = Math.hypot(tx, ty) || 1;
      [nx, ny, nz] = [ty / len, -tx / len, 0];
    } else {
      // Inside: the distance grows away from the nearest edge point, so the
      // surface z = h(d) leans outward along that direction.
      const q = nearestOnPolygon(pts[i], outline);
      const gx = (pts[i][0] - q[0]) / d, gy = (pts[i][1] - q[1]) / d;
      const k = slope(d);
      [nx, ny, nz] = [-k * gx, -k * gy, 1];
    }
    // Fade from the exact normal at the rim to the averaged one at the band's edge.
    const u = Math.min(1, Math.max(0, (d - band * 0.4) / (band * 0.6)));
    const w = 1 - u * u * (3 - 2 * u);
    const len = Math.hypot(nx, ny, nz) || 1;
    for (const [vi, sign] of [[i, 1], [back(i), -1]] as const) {
      const bx = normals.getX(vi) * (1 - w) + (nx / len) * w;
      const by = normals.getY(vi) * (1 - w) + (ny / len) * w;
      const bz = normals.getZ(vi) * (1 - w) + ((sign * nz) / len) * w;
      const bl = Math.hypot(bx, by, bz) || 1;
      normals.setXYZ(vi, bx / bl, by / bl, bz / bl);
      if (i < nB) break; // rim vertices are shared by both skins
    }
  }
  normals.needsUpdate = true;
}

/** A couple of gentle Laplacian passes over the lattice heights to hide the grid. */
function smoothInterior(h: number[], tris: number[], nB: number, dists: number[], s: number) {
  const nbrs: Set<number>[] = h.map(() => new Set());
  for (let t = 0; t < tris.length; t += 3) {
    const [a, b, c] = [tris[t], tris[t + 1], tris[t + 2]];
    nbrs[a].add(b).add(c);
    nbrs[b].add(a).add(c);
    nbrs[c].add(a).add(b);
  }
  for (let pass = 0; pass < 2; pass++) {
    const prev = h.slice();
    for (let i = nB; i < h.length; i++) {
      if (dists[i] < s * 1.1 || nbrs[i].size === 0) continue; // leave the rim profile alone
      let sum = 0;
      for (const j of nbrs[i]) sum += prev[j];
      h[i] = prev[i] * 0.5 + (sum / nbrs[i].size) * 0.5;
    }
  }
}
