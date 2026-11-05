// "My Parts": drawings saved in this browser for reuse across designs. A design keeps
// its own copy of each drawing it uses, so editing or deleting a saved part never
// changes a piece that's already made from it.

import type { CustomShape } from '../model/types';

export interface MyPart {
  id: string;
  name: string;
  shape: CustomShape;
  updatedAt: number;
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;
const KEY = 'glass-cad:parts';

export function listParts(store: Store): MyPart[] {
  try {
    const list = JSON.parse(store.getItem(KEY) ?? '[]') as MyPart[];
    return Array.isArray(list) ? list.filter((p) => p?.shape && Array.isArray(p.shape.points)) : [];
  } catch {
    return [];
  }
}

export function savePart(store: Store, part: MyPart): MyPart[] {
  const list = [part, ...listParts(store).filter((p) => p.id !== part.id)];
  store.setItem(KEY, JSON.stringify(list));
  return list;
}

export function deletePart(store: Store, id: string): MyPart[] {
  const list = listParts(store).filter((p) => p.id !== id);
  store.setItem(KEY, JSON.stringify(list));
  return list;
}
