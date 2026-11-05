import type { BufferGeometry } from 'three';
import type { Vec2 } from '../geom2d/polygon';

export type ModeId = 'inflate' | 'spin' | 'extrude' | 'sweep' | 'twoView';

/** What the user drew. Later modes add a sweep path and a side view here. */
export interface Drawing {
  outline: Vec2[]; // closed, CCW, drawing space [-1, 1]
}

export interface ParamSpec {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
}

export type ParamValues = Record<string, number>;

/**
 * A 2D→3D conversion. The inspector builds its sliders from `params`, so a new
 * mode only needs this object and a line in the registry. Combining pieces
 * (step 3) will add an optional `sdf()` here.
 */
export interface ModeDef {
  id: ModeId;
  label: string;
  blurb: string;
  params: ParamSpec[];
  /** Returns geometry in drawing units, centred on x/z, resting on y = 0. */
  build(drawing: Drawing, params: ParamValues): BufferGeometry;
}
