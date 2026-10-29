// The standard drawing views, shared by the camera buttons, the image export and the
// shop sheet. Each view is a direction to look from plus which way is up; from those
// we get the image's right/up axes, so any point maps to a spot on the drawing.

import * as THREE from 'three';

export type ViewId = 'front' | 'side' | 'top' | 'iso';

export interface ViewDef {
  id: ViewId;
  name: string;
  /** Unit vector from the piece toward the camera. */
  dir: THREE.Vector3;
  up: THREE.Vector3;
  /** True views show real lengths, so they get dimension lines; the 3/4 view doesn't. */
  measured: boolean;
}

export const VIEWS: ViewDef[] = [
  { id: 'front', name: 'Front', dir: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0), measured: true },
  { id: 'side', name: 'Side', dir: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0), measured: true },
  { id: 'top', name: 'Top', dir: new THREE.Vector3(0, 1, 0), up: new THREE.Vector3(0, 0, -1), measured: true },
  { id: 'iso', name: '3/4', dir: new THREE.Vector3(1, 0.8, 1).normalize(), up: new THREE.Vector3(0, 1, 0), measured: false },
];

export const viewById = (id: ViewId) => VIEWS.find((v) => v.id === id)!;

export interface ViewFrame {
  /** The image's axes in world space. */
  right: THREE.Vector3;
  up: THREE.Vector3;
  /** Where the piece's corners land along right (u) and up (v), in mm. */
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
  /** A square window around the piece, in mm, with a margin for dimension labels. */
  u0: number;
  v0: number;
  size: number;
  /** The world point at the middle of that window. */
  center: THREE.Vector3;
}

/**
 * Frames a box for a view: the box's corners are projected onto the image axes, and a
 * square window (`margin` times the larger extent) is centred on them. Every view of
 * one piece shares `size`, so the drawings are all at one scale.
 */
export function frameFor(view: ViewDef, box: THREE.Box3, size?: number): ViewFrame {
  const right = new THREE.Vector3().crossVectors(view.up, view.dir).normalize();
  const up = new THREE.Vector3().crossVectors(view.dir, right).normalize();
  const corners: THREE.Vector3[] = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
  const us = corners.map((c) => c.dot(right));
  const vs = corners.map((c) => c.dot(up));
  const [uMin, uMax, vMin, vMax] = [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)];
  const s = size ?? sharedSize(box);
  const uc = (uMin + uMax) / 2;
  const vc = (vMin + vMax) / 2;
  // The window's centre in world space: (uc, vc) on the image plane through the box centre.
  const depth = box.getCenter(new THREE.Vector3()).dot(view.dir);
  const center = right.clone().multiplyScalar(uc).addScaledVector(up, vc).addScaledVector(view.dir, depth);
  return { right, up, uMin, uMax, vMin, vMax, u0: uc - s / 2, v0: vc - s / 2, size: s, center };
}

/** One window size for every view of a box: its longest extent in any view, plus room for labels. */
export function sharedSize(box: THREE.Box3): number {
  const s = box.getSize(new THREE.Vector3());
  // The 3/4 view can be as wide as the box's diagonal; the true views only as its longest side.
  return Math.max(Math.max(s.x, s.y, s.z) * 1.35, s.length() * 1.12, 1);
}
