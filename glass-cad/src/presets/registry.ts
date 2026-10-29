import { BASIC_PRESETS } from './basic';
import { GLASS_PRESETS } from './glass';
import { ORGANIC_PRESETS } from './organic';
import { CUSTOM_PRESETS } from './custom';
import { importedMesh } from './imported';
import type { PresetDef } from './types';

/** Presets shown in the palette. Custom ones are only reached through a drawing. */
export const PRESETS: PresetDef[] = [...BASIC_PRESETS, ...GLASS_PRESETS, ...ORGANIC_PRESETS];

const byId = new Map([...PRESETS, ...CUSTOM_PRESETS, importedMesh].map((p) => [p.id, p]));

export function getPreset(id: string): PresetDef {
  const def = byId.get(id);
  if (!def) throw new Error(`Unknown preset "${id}"`);
  return def;
}
