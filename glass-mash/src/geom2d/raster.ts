import { bbox, type Vec2 } from './polygon';

// Moore-neighbourhood directions in image space (y down), clockwise from west.
const DIRS: Vec2[] = [[-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1]];

function dirIndex(dx: number, dy: number): number {
  return DIRS.findIndex(([x, y]) => x === dx && y === dy);
}

/**
 * Fills a messy (self-crossing) outline with the nonzero rule, keeps the biggest
 * blob and traces its outer edge. This turns figure-8s and overshoot loops into
 * one clean silhouette, the way you'd read the scribble by eye.
 */
export function traceFilledOutline(poly: Vec2[], R = 384): Vec2[] | null {
  const [minX, minY, maxX, maxY] = bbox(poly);
  const pad = 4;
  const scale = (R - pad * 2) / Math.max(maxX - minX, maxY - minY, 1e-6);
  const toPx = ([x, y]: Vec2): Vec2 => [pad + (x - minX) * scale, pad + (maxY - y) * scale];
  const fromPx = (px: number, py: number): Vec2 => [(px - pad) / scale + minX, maxY - (py - pad) / scale];

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = R;
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  g.beginPath();
  poly.forEach((p, i) => {
    const [x, y] = toPx(p);
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  });
  g.closePath();
  g.fillStyle = '#fff';
  g.fill('nonzero');
  const rgba = g.getImageData(0, 0, R, R).data;

  // Label 4-connected blobs and keep the largest.
  const label = new Int32Array(R * R).fill(-1);
  let best = -1, bestSize = 0, bestStart = -1, next = 0;
  const stack: number[] = [];
  for (let i = 0; i < R * R; i++) {
    if (label[i] !== -1 || rgba[i * 4 + 3] < 128) continue;
    let size = 0;
    label[i] = next;
    stack.push(i);
    while (stack.length) {
      const k = stack.pop()!;
      size++;
      const x = k % R, y = (k / R) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= R || ny >= R) continue;
        const nk = ny * R + nx;
        if (label[nk] === -1 && rgba[nk * 4 + 3] >= 128) {
          label[nk] = next;
          stack.push(nk);
        }
      }
    }
    if (size > bestSize) {
      bestSize = size;
      best = next;
      bestStart = i; // first pixel in scan order = top-left of the blob
    }
    next++;
  }
  if (best < 0 || bestSize < 16) return null;

  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < R && y < R && label[y * R + x] === best;
  const sx = bestStart % R, sy = (bestStart / R) | 0;
  const contour: Vec2[] = [fromPx(sx + 0.5, sy + 0.5)];
  let cx = sx, cy = sy;
  let back = 0; // the west neighbour of the start pixel is always empty
  for (let guard = 0; guard < R * R * 4; guard++) {
    let moved = false;
    for (let i = 1; i <= 8; i++) {
      const d = (back + i) % 8;
      const nx = cx + DIRS[d][0], ny = cy + DIRS[d][1];
      if (!on(nx, ny)) continue;
      const prev = DIRS[(d + 7) % 8];
      back = dirIndex(cx + prev[0] - nx, cy + prev[1] - ny);
      cx = nx;
      cy = ny;
      moved = true;
      break;
    }
    if (!moved || (cx === sx && cy === sy)) break;
    contour.push(fromPx(cx + 0.5, cy + 0.5));
  }
  return contour.length >= 8 ? contour : null;
}
