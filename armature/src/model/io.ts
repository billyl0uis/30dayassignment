import { METALS } from '../config/materials';
import { DEFAULT_SETTINGS, type GlassKind, type GlassPart, type Join, type JoinType, type Sculpture, type Vec3 } from './types';
import { uid } from './frame';

export function exportJSON(s: Sculpture): string {
  return JSON.stringify(s, null, 2);
}

const isVec3 = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && isFinite(x));

/** Parse and sanity-check a sculpture file. Throws an Error with a plain-language message. */
export function importJSON(text: string): Sculpture {
  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (!raw || raw.version !== 1) throw new Error('This is not an Armature sculpture file (version 1).');
  for (const key of ['nodes', 'rods', 'parts', 'joins'] as const) {
    if (!Array.isArray(raw[key])) throw new Error(`The file is missing its "${key}" list.`);
  }
  const nodeIds = new Set<string>();
  for (const n of raw.nodes) {
    if (typeof n.id !== 'string' || !isVec3(n.p)) throw new Error('A frame node is missing its id or position.');
    nodeIds.add(n.id);
  }
  for (const r of raw.rods) {
    if (!nodeIds.has(r.a) || !nodeIds.has(r.b)) throw new Error(`Rod ${r.id} points at a node that isn't in the file.`);
    if (!(r.material in METALS)) throw new Error(`Rod ${r.id} uses an unknown metal "${r.material}".`);
    if (!(r.diameterMm > 0)) throw new Error(`Rod ${r.id} needs a diameter above 0.`);
  }
  const partIds = new Set<string>();
  for (const p of raw.parts) {
    if (typeof p.id !== 'string' || !isVec3(p.position) || !p.geom) throw new Error('A glass part is missing its id, position or shape.');
    p.rotationDeg = isVec3(p.rotationDeg) ? p.rotationDeg : [0, 0, 0];
    p.scale = isVec3(p.scale) ? p.scale : [1, 1, 1];
    p.glass = p.glass ?? 'soda_lime_96';
    p.isInclusion = !!p.isInclusion;
    partIds.add(p.id);
  }
  raw.joins = raw.joins.filter((j: Join) => partIds.has(j.partId));
  return {
    version: 1,
    name: typeof raw.name === 'string' ? raw.name : 'Imported',
    wall: { enabled: !!raw.wall?.enabled, z: Number(raw.wall?.z) || 0 },
    nodes: raw.nodes,
    rods: raw.rods,
    panels: Array.isArray(raw.panels) ? raw.panels : [],
    cages: Array.isArray(raw.cages) ? raw.cages : [],
    parts: raw.parts,
    joins: raw.joins,
    settings: { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) },
  };
}

export function clone(s: Sculpture): Sculpture {
  return JSON.parse(JSON.stringify(s));
}

export function newPart(kind: GlassKind, position: Vec3, name?: string): GlassPart {
  const base = { id: uid('g'), name: name ?? kind[0].toUpperCase() + kind.slice(1), glass: 'soda_lime_96' as const, position: [...position] as Vec3, rotationDeg: [0, 0, 0] as Vec3, scale: [1, 1, 1] as Vec3, isInclusion: false };
  switch (kind) {
    case 'blown':
      return { ...base, geom: { kind, outerRadiusMm: 45, wallMm: 6 } };
    case 'solid':
      return { ...base, geom: { kind, shape: 'sphere', radiusMm: 30 } };
    case 'cast':
      return { ...base, geom: { kind, shape: 'slab', sizeMm: [200, 150, 12] } };
    case 'leaf':
      return { ...base, geom: { kind, lengthMm: 60, widthMm: 28, thicknessMm: 4 } };
  }
}

export function newJoin(type: JoinType, partId: string): Join {
  const j: Join = { id: uid('j'), type, partId, anchor: { kind: 'none' }, madeHot: type === 'cage_capture' || type === 'fused' };
  if (type === 'clip') j.contact = 'padded';
  if (type === 'standoff') j.gasket = 'neoprene';
  if (type === 'bolt') Object.assign(j, { holeDiameterMm: 8, edgeDistanceMm: 30, washer: 'neoprene' });
  if (type === 'wire_wrap') j.metal = 'copper';
  return j;
}
