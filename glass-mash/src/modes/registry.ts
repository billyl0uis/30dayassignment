import { inflateMode } from './inflate/inflate';
import type { ModeDef, ModeId, ParamValues } from './types';

/** Every mode that can build geometry. Add new modes here. */
export const MODES: ModeDef[] = [inflateMode];

/** Shown in the UI as "coming soon" until they land in MODES. */
export const PLANNED: { id: ModeId; label: string }[] = [
  { id: 'spin', label: 'Spin' },
  { id: 'extrude', label: 'Extrude' },
  { id: 'sweep', label: 'Sweep' },
  { id: 'twoView', label: 'Two-view' },
];

export function getMode(id: ModeId): ModeDef {
  return MODES.find((m) => m.id === id) ?? MODES[0];
}

export function defaultParams(): Partial<Record<ModeId, ParamValues>> {
  const out: Partial<Record<ModeId, ParamValues>> = {};
  for (const m of MODES) out[m.id] = Object.fromEntries(m.params.map((p) => [p.key, p.default]));
  return out;
}
