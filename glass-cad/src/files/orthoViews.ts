// Line drawings of the standard views for the shop sheet and image export: flat
// light-gray shading with crease edges in dark line, every view at the same scale
// so they can be measured against each other.

import * as THREE from 'three';
import type { Body } from '../engine/evaluate';
import { frameFor, sharedSize, VIEWS, type ViewFrame } from '../viewport/views';

export interface OrthoView extends ViewFrame {
  name: string;
  measured: boolean;
  /** A square PNG covering [u0, u0 + size] across and [v0, v0 + size] up, in mm. */
  url: string;
}

const PX = 900;

export function renderOrthoViews(bodies: Body[]): OrthoView[] {
  const box = new THREE.Box3();
  bodies.forEach((b) => box.union(b.bounds));
  const size = sharedSize(box);

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
  const out = VIEWS.map((view) => {
    const frame = frameFor(view, box, size);
    const camera = orthoCameraFor(view, frame, 1);
    sun.position.copy(camera.position).addScaledVector(frame.up, size).addScaledVector(frame.right, -size * 0.5);
    renderer.render(scene, camera);
    return { ...frame, name: view.name, measured: view.measured, url: renderer.domElement.toDataURL('image/png') };
  });

  renderer.dispose();
  renderer.forceContextLoss();
  made.forEach((g) => g.dispose());
  fill.dispose();
  ink.dispose();
  return out;
}

/**
 * An orthographic camera that shows exactly the frame's square window when the image
 * is `aspect` wide per unit of height (wider images show extra on the sides).
 */
export function orthoCameraFor(view: { dir: THREE.Vector3; up: THREE.Vector3 }, frame: ViewFrame, aspect: number): THREE.OrthographicCamera {
  const h = frame.size / 2;
  const w = aspect >= 1 ? h * aspect : h;
  const v = aspect >= 1 ? h : h / aspect;
  const camera = new THREE.OrthographicCamera(-w, w, v, -v, 1, frame.size * 40);
  camera.position.copy(frame.center).addScaledVector(view.dir, frame.size * 10);
  camera.up.copy(view.up);
  camera.lookAt(frame.center);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  return camera;
}
