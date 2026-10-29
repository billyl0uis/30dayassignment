import type { Design, GlassMaterial, OpId, OpNode, Transform } from './types';

export const newId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 9)}`;

export const identityTransform = (): Transform => ({ position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });

/** Shop colors: a starting point, not a color-compatibility chart. */
export const GLASS_SWATCHES: Pick<GlassMaterial, 'name' | 'color' | 'finish'>[] = [
  { name: 'Clear', color: '#f2f6f5', finish: 'transparent' },
  { name: 'Cobalt', color: '#1f4fd1', finish: 'transparent' },
  { name: 'Amber', color: '#c9781c', finish: 'transparent' },
  { name: 'Emerald', color: '#1f9a5b', finish: 'transparent' },
  { name: 'Gold ruby', color: '#c2224f', finish: 'transparent' },
  { name: 'Amethyst', color: '#7a3fa8', finish: 'transparent' },
  { name: 'Aqua', color: '#3fb6c2', finish: 'transparent' },
  { name: 'Smoke', color: '#5b5650', finish: 'transparent' },
  { name: 'Opal white', color: '#eceae3', finish: 'opaque' },
  { name: 'Bone', color: '#d8ccb0', finish: 'opaque' },
  { name: 'Oxblood', color: '#5a1414', finish: 'opaque' },
  { name: 'Black', color: '#141414', finish: 'opaque' },
];

export function createMaterial(partial: Partial<GlassMaterial> = {}): GlassMaterial {
  return {
    id: newId('mat'),
    name: 'Clear',
    color: '#f2f6f5',
    finish: 'transparent',
    colorDensity: 0.5,
    roughness: 0.03,
    ior: 1.5,
    ...partial,
  };
}

export function createDesign(): Design {
  return {
    schemaVersion: 1,
    id: newId('design'),
    name: 'Untitled piece',
    displayUnits: 'in',
    density_g_cm3: 2.5,
    ops: [],
    materials: {},
    scene: { background: 'studio', turntable: false },
    shop: { notes: [] },
  };
}

export function updateOp(design: Design, id: OpId, fn: (op: OpNode) => OpNode): Design {
  return { ...design, ops: design.ops.map((op) => (op.id === id ? fn(op) : op)) };
}
