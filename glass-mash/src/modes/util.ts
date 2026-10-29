import type { BufferGeometry } from 'three';

/** Centre a piece on x/z and stand it on y = 0, so every mode lands on the floor. */
export function centerOnFloor(geo: BufferGeometry): void {
  geo.computeBoundingBox();
  const b = geo.boundingBox!;
  geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
}
