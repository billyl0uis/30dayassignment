import type { Section } from '../geometry/section';
import type { CustomShape, ImportedMesh } from '../model/types';

export type Params = Record<string, number>;

export interface ParamSpec {
  key: string;
  label: string;
  kind: 'length' | 'ratio' | 'count';
  default: number; // mm for lengths
  min: number;
  max: number;
  hint?: string;
  /** Ratio and count sliders: step size and what to print after the number (e.g. °). */
  step?: number;
  suffix?: string;
  /** Kept out of the generic inspector list (the inspector shows its own control). */
  hidden?: boolean;
  /** Puts a drag handle on the part for this length. See geometry/handles.ts. */
  handle?: HandleSpec;
}

/**
 * x / z: the value is a full width across the axis, so the handle sits at value / 2,
 * `level` of the way up the part. y: the value is a height measured from the floor.
 */
export interface HandleSpec {
  axis: 'x' | 'y' | 'z';
  level?: number;
}

export interface PresetDef {
  id: string;
  family: 'basic' | 'glass' | 'organic' | 'custom';
  label: string;
  params: ParamSpec[];
  /** Custom presets also take the drawing; built-in presets ignore it. */
  section(p: Params, shape?: CustomShape, mesh?: ImportedMesh): Section;
}

export function defaultParams(def: PresetDef): Params {
  return Object.fromEntries(def.params.map((s) => [s.key, s.default]));
}

/** Fills any missing keys with defaults, so older saved designs keep working. */
export function withDefaults(def: PresetDef, params: Params): Params {
  return { ...defaultParams(def), ...params };
}
