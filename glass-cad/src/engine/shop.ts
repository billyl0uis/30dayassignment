// The numbers a shop sheet needs, from an evaluated design: one row per piece of
// glass you'd actually make (arrays count copies instead of listing each one).

import * as THREE from 'three';
import type { OpNode } from '../model/types';
import type { Body } from './evaluate';

export interface ShopRow {
  op: OpNode;
  qty: number;
  volume_mm3: number; // all copies together
  size: THREE.Vector3; // one copy's W (x), H (y), D (z)
  materialId: string;
}

export function shopRows(ops: OpNode[], bodies: Body[]): ShopRow[] {
  return ops.flatMap((op) => {
    const mine = bodies.filter((b) => b.owners[0] === op.id);
    if (!mine.length) return [];
    return [
      {
        op,
        qty: mine.length,
        volume_mm3: mine.reduce((sum, b) => sum + b.volume_mm3, 0),
        size: mine[0].bounds.getSize(new THREE.Vector3()),
        materialId: mine[0].materialId,
      },
    ];
  });
}
