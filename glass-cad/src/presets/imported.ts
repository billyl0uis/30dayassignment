// A mesh brought in from a file, as a part. The file's units are a choice the user
// makes after import (STL has no units of its own), so they're a parameter here.

import type { PresetDef } from './types';
import { decodePositions } from '../files/meshData';

/** File units, by the `units` param: 0 = mm, 1 = cm, 2 = inches. */
export const FILE_UNITS = [
  { label: 'mm', mm: 1 },
  { label: 'cm', mm: 10 },
  { label: 'in', mm: 25.4 },
] as const;

export const importedMesh: PresetDef = {
  id: 'imported',
  family: 'custom',
  label: 'Imported mesh',
  params: [
    { key: 'scale', label: 'Scale', kind: 'ratio', default: 1, min: 0.05, max: 20, step: 0.05, suffix: '×' },
    { key: 'units', label: 'File units', kind: 'count', default: 0, min: 0, max: 2, hidden: true },
  ],
  section: (p, _shape, mesh) => {
    if (!mesh) throw new Error('This imported part has lost its mesh data.');
    const raw = decodePositions(mesh.id, mesh.data);
    const k = p.scale * (FILE_UNITS[Math.round(p.units)]?.mm ?? 1);
    const positions = new Float32Array(raw.length);
    for (let i = 0; i < raw.length; i++) positions[i] = raw[i] * k;
    return { kind: 'mesh', positions };
  },
};
