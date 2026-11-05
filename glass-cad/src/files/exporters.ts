// Exporting what's on screen: every visible body with its placement baked in.
// STL and OBJ are in millimetres (what slicers and most CAD expect); GLB follows the
// glTF convention of metres and carries the glass look (transmission, IOR, color).

import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import type { Body } from '../engine/evaluate';
import type { Design } from '../model/types';

function bakedGroup(bodies: Body[], design: Design, names: (b: Body) => string): THREE.Group {
  const group = new THREE.Group();
  for (const b of bodies) {
    const glass = design.materials[b.materialId];
    const material = new THREE.MeshPhysicalMaterial({
      name: glass?.name ?? 'Glass',
      color: glass?.color ?? '#ffffff',
      roughness: glass?.roughness ?? 0.05,
      ior: glass?.ior ?? 1.5,
      transmission: glass?.finish === 'opaque' ? 0 : 1,
      thickness: b.thickness_mm / 1000,
    });
    const mesh = new THREE.Mesh(b.geometry.clone().applyMatrix4(b.matrix), material);
    mesh.name = names(b);
    group.add(mesh);
  }
  return group;
}

const labelOf = (design: Design) => (b: Body) => design.ops.find((o) => o.id === b.owners[0])?.label ?? 'part';

function dispose(group: THREE.Group) {
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  });
}

export function exportStl(bodies: Body[], design: Design): Blob {
  const group = bakedGroup(bodies, design, labelOf(design));
  const data = new STLExporter().parse(group, { binary: true }) as DataView;
  dispose(group);
  return new Blob([data.buffer as ArrayBuffer], { type: 'model/stl' });
}

export function exportObj(bodies: Body[], design: Design): Blob {
  const group = bakedGroup(bodies, design, labelOf(design));
  const text = new OBJExporter().parse(group);
  dispose(group);
  return new Blob([`# ${design.name} from Glass CAD, millimetres\n${text}`], { type: 'text/plain' });
}

export async function exportGlb(bodies: Body[], design: Design): Promise<Blob> {
  const group = bakedGroup(bodies, design, labelOf(design));
  group.scale.setScalar(0.001); // glTF is in metres
  group.name = design.name;
  const result = await new GLTFExporter().parseAsync(group, { binary: true });
  dispose(group);
  return new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' });
}

export function exportDesignJson(design: Design): Blob {
  return new Blob([JSON.stringify(design, null, 2)], { type: 'application/json' });
}
