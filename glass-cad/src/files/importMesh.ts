// Reading STL and OBJ files into triangle positions: everything flattened to plain
// triangles, centred on the vertical axis and set down on the floor.

import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

export interface ParsedMesh {
  positions: Float32Array;
  triangles: number;
  /** Best guess at the file's units from its size: 0 = mm, 2 = inches. */
  unitsGuess: 0 | 2;
}

export function parseMeshFile(name: string, data: ArrayBuffer): ParsedMesh {
  const ext = name.toLowerCase().split('.').pop();
  let geometries: THREE.BufferGeometry[];
  if (ext === 'stl') {
    geometries = [new STLLoader().parse(data)];
  } else if (ext === 'obj') {
    const group = new OBJLoader().parse(new TextDecoder().decode(data));
    group.updateMatrixWorld(true);
    geometries = [];
    group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) geometries.push((o as THREE.Mesh).geometry.clone().applyMatrix4(o.matrixWorld));
    });
  } else {
    throw new Error('Glass CAD can import .stl and .obj files.');
  }
  const parts = geometries.map((g) => (g.index ? g.toNonIndexed() : g).getAttribute('position').array as Float32Array);
  const total = parts.reduce((n, p) => n + p.length, 0);
  if (!total) throw new Error('That file has no triangles in it.');
  const positions = new Float32Array(total);
  let at = 0;
  for (const p of parts) {
    positions.set(p, at);
    at += p.length;
  }
  return { positions: settle(positions), triangles: total / 9, unitsGuess: guessUnits(positions) };
}

/** Centres the mesh on the vertical axis and rests it on y = 0. */
function settle(p: Float32Array): Float32Array {
  const box = new THREE.Box3().setFromArray(p);
  const cx = (box.min.x + box.max.x) / 2;
  const cz = (box.min.z + box.max.z) / 2;
  for (let i = 0; i < p.length; i += 3) {
    p[i] -= cx;
    p[i + 1] -= box.min.y;
    p[i + 2] -= cz;
  }
  return p;
}

/** STL has no units. Something under an inch across is far more likely drawn in inches than in mm. */
function guessUnits(p: Float32Array): 0 | 2 {
  const s = new THREE.Box3().setFromArray(p).getSize(new THREE.Vector3());
  return Math.max(s.x, s.y, s.z) < 25 ? 2 : 0;
}
