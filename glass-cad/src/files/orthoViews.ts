// Front, side and top views for the shop sheet, drawn off screen: flat light-gray
// shading with crease edges in dark line, all three at the same scale so they can
// be measured against each other.

import * as THREE from 'three';
import type { Body } from '../engine/evaluate';

export interface OrthoView {
  name: 'Front' | 'Side' | 'Top';
  url: string;
  /** The image covers [u0, u0 + size] across and [v0, v0 + size] up, in mm. */
  u0: number;
  v0: number;
  size: number;
  /** The piece's extent in this view, in mm. */
  uMin: number;
  uMax: number;
  vMin: number;
  vMax: number;
}

const PX = 720;

export function renderOrthoViews(bodies: Body[]): OrthoView[] {
  const box = new THREE.Box3();
  bodies.forEach((b) => box.union(b.bounds));
  const c = box.getCenter(new THREE.Vector3());
  const s = box.getSize(new THREE.Vector3());
  const size = Math.max(s.x, s.y, s.z) * 1.3 || 10;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#ffffff');
  scene.add(new THREE.AmbientLight('#ffffff', 1.6));
  const sun = new THREE.DirectionalLight('#ffffff', 1.6);
  scene.add(sun);
  const fill = new THREE.MeshLambertMaterial({ color: '#d9dad6' });
  const ink = new THREE.LineBasicMaterial({ color: '#2b2b2b' });
  const made: THREE.BufferGeometry[] = [];
  for (const b of bodies) {
    const mesh = new THREE.Mesh(b.geometry, fill);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(b.matrix);
    scene.add(mesh);
    const edges = new THREE.EdgesGeometry(b.geometry, 30);
    made.push(edges);
    const lines = new THREE.LineSegments(edges, ink);
    lines.matrixAutoUpdate = false;
    lines.matrix.copy(b.matrix);
    scene.add(lines);
  }

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(PX, PX, false);
  const camera = new THREE.OrthographicCamera(-size / 2, size / 2, size / 2, -size / 2, 0.1, size * 20);

  // Each view: where the camera sits, which way is up, and how world axes map to the image (u right, v up).
  const views = [
    { name: 'Front' as const, dir: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0), u: (p: THREE.Vector3) => p.x, v: (p: THREE.Vector3) => p.y },
    { name: 'Side' as const, dir: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0), u: (p: THREE.Vector3) => -p.z, v: (p: THREE.Vector3) => p.y },
    { name: 'Top' as const, dir: new THREE.Vector3(0, 1, 0), up: new THREE.Vector3(0, 0, -1), u: (p: THREE.Vector3) => p.x, v: (p: THREE.Vector3) => -p.z },
  ];

  const out = views.map((view) => {
    camera.position.copy(c).addScaledVector(view.dir, size * 5);
    camera.up.copy(view.up);
    camera.lookAt(c);
    camera.updateMatrixWorld();
    sun.position.copy(camera.position).add(new THREE.Vector3(size, size * 2, size * 0.5));
    renderer.render(scene, camera);
    const corners = [box.min, box.max].flatMap((a) => [box.min, box.max].flatMap((b) => [box.min, box.max].map((z) => new THREE.Vector3(a.x, b.y, z.z))));
    const us = corners.map(view.u);
    const vs = corners.map(view.v);
    return {
      name: view.name,
      url: renderer.domElement.toDataURL('image/png'),
      u0: view.u(c) - size / 2,
      v0: view.v(c) - size / 2,
      size,
      uMin: Math.min(...us),
      uMax: Math.max(...us),
      vMin: Math.min(...vs),
      vMax: Math.max(...vs),
    };
  });

  renderer.dispose();
  renderer.forceContextLoss();
  made.forEach((g) => g.dispose());
  fill.dispose();
  ink.dispose();
  return out;
}
