// Saved designs in the browser. Each design lives under its own key, with a small
// index for the menu, so a broken or huge design can't take the others with it.

import type { Design } from '../model/types';
import { getPreset } from '../presets/registry';

export interface LibraryEntry {
  id: string;
  name: string;
  updatedAt: number;
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const INDEX = 'glass-cad:designs';
const CURRENT = 'glass-cad:current';
const LEGACY = 'glass-cad:design'; // step 1 kept a single design here
const designKey = (id: string) => `glass-cad:design:${id}`;

export function listDesigns(store: Store): LibraryEntry[] {
  try {
    const list = JSON.parse(store.getItem(INDEX) ?? '[]') as LibraryEntry[];
    return Array.isArray(list) ? list.sort((a, b) => b.updatedAt - a.updatedAt) : [];
  } catch {
    return [];
  }
}

export function saveDesign(store: Store, design: Design, now = Date.now()) {
  store.setItem(designKey(design.id), JSON.stringify(design));
  const list = listDesigns(store).filter((e) => e.id !== design.id);
  store.setItem(INDEX, JSON.stringify([{ id: design.id, name: design.name, updatedAt: now }, ...list]));
  store.setItem(CURRENT, design.id);
}

export function loadDesign(store: Store, id: string): Design | null {
  return parseDesign(store.getItem(designKey(id)));
}

export function deleteDesign(store: Store, id: string) {
  store.removeItem(designKey(id));
  store.setItem(INDEX, JSON.stringify(listDesigns(store).filter((e) => e.id !== id)));
}

/** The design that was open last time, picking up a step 1 save if that's all there is. */
export function loadCurrent(store: Store): Design | null {
  const id = store.getItem(CURRENT);
  const current = id ? loadDesign(store, id) : null;
  if (current) return current;
  const legacy = parseDesign(store.getItem(LEGACY));
  if (legacy) {
    saveDesign(store, legacy);
    store.removeItem(LEGACY);
  }
  return legacy;
}

/** Reads a design from JSON text, or null if it isn't one this build can open. */
export function parseDesign(raw: string | null): Design | null {
  try {
    if (!raw) return null;
    const d = JSON.parse(raw) as Design;
    if (d?.schemaVersion !== 1 || !Array.isArray(d.ops)) return null;
    d.ops.forEach((op) => op.type === 'primitive' && getPreset(op.preset)); // throws on presets this build doesn't know
    return d;
  } catch {
    return null;
  }
}
