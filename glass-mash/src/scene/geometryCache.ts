import type { BufferGeometry } from 'three';
import { getMode } from '../modes/registry';
import type { Drawing, ModeId, ParamValues } from '../modes/types';
import { meshToSdf } from '../sdf/meshToSdf';
import type { SdfGrid } from '../sdf/grid';
import type { Piece } from './store';

interface Entry {
  drawing: Drawing;
  mode: ModeId;
  params: ParamValues;
  geometry: BufferGeometry;
  sdf?: SdfGrid;
}

/**
 * One built mesh (and, when the mash needs it, one distance grid) per piece.
 * Rebuilt only when the drawing, mode or that mode's sliders change, so moving
 * a piece or changing its glass never re-inflates it.
 */
const cache = new Map<string, Entry>();

function entry(p: Piece): Entry | null {
  const params = p.params[p.mode];
  if (!p.drawing || !params) return null;
  const hit = cache.get(p.id);
  if (hit && hit.drawing === p.drawing && hit.mode === p.mode && hit.params === params) return hit;
  hit?.geometry.dispose();
  const fresh: Entry = { drawing: p.drawing, mode: p.mode, params, geometry: getMode(p.mode).build(p.drawing, params) };
  cache.set(p.id, fresh);
  return fresh;
}

export function pieceGeometry(p: Piece): BufferGeometry | null {
  return entry(p)?.geometry ?? null;
}

export function pieceSdf(p: Piece): SdfGrid | null {
  const e = entry(p);
  if (!e) return null;
  e.sdf ??= meshToSdf(e.geometry);
  return e.sdf;
}
