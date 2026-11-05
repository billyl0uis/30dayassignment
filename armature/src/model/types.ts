import type { GlassId, MetalId } from '../config/materials';

/** All lengths are millimetres. y is up. The floor is y = 0. The wall plane is z = wall.z, facing +z. */
export type Vec3 = [number, number, number];

export interface FrameNode {
  id: string;
  p: Vec3;
}

export interface Rod {
  id: string;
  a: string;
  b: string;
  material: MetalId;
  diameterMm: number;
}

export interface Panel {
  id: string;
  nodes: [string, string, string, string];
  material: MetalId;
  thicknessMm: number;
}

/** A ring-and-rib cage made by the cage generator. Keeps its topology so the blow and capture checks can find its gaps. */
export interface Cage {
  id: string;
  name: string;
  center: Vec3;
  ribs: number;
  rings: number;
  radiusMm: number;
  heightMm: number;
  /** end-opening radius as a fraction of the radius (1 = straight cylinder) */
  taper: number;
  wireMm: number;
  material: MetalId;
  /** grid[ring][rib] = node id where that rib crosses that ring */
  grid: string[][];
  /** each rib's full ordered node path, bottom to top */
  ribPaths: string[][];
  /** each ring's full ordered node path (closed loop, first node not repeated) */
  ringPaths: string[][];
  rodIds: string[];
}

export type GlassKind = 'blown' | 'solid' | 'cast' | 'leaf';
export type SolidShape = 'sphere' | 'ellipsoid' | 'teardrop';
export type CastShape = 'box' | 'slab';

/** Outer radius sampled on a lat/lon grid of directions, saved after a blow. */
export interface BlownProfile {
  lat: number;
  lon: number;
  /** (lat + 1) * lon radii in mm, row-major from the -y pole */
  radii: number[];
  /** the free bubble radius the blow reached */
  freeR: number;
}

export type GlassGeom =
  | { kind: 'blown'; outerRadiusMm: number; wallMm: number; profile?: BlownProfile }
  | { kind: 'solid'; shape: SolidShape; radiusMm: number }
  | { kind: 'cast'; shape: CastShape; sizeMm: Vec3 }
  | { kind: 'leaf'; lengthMm: number; widthMm: number; thicknessMm: number };

export interface GlassPart {
  id: string;
  name: string;
  glass: GlassId;
  position: Vec3;
  /** Euler XYZ, degrees */
  rotationDeg: Vec3;
  scale: Vec3;
  geom: GlassGeom;
  /** true if this part is an inclusion: thin foil or fine wire fully encased in the glass */
  isInclusion: boolean;
}

export type JoinType = 'clip' | 'standoff' | 'bolt' | 'wire_wrap' | 'cage_capture' | 'fused';
export type Washer = 'rubber' | 'neoprene' | 'nylon';

export type Anchor =
  | { kind: 'none' }
  | { kind: 'node'; nodeId: string }
  | { kind: 'wall'; point: Vec3 }
  | { kind: 'cage'; cageId: string };

export interface Join {
  id: string;
  type: JoinType;
  partId: string;
  anchor: Anchor;
  /** joined while the glass was hot */
  madeHot: boolean;
  /** metal touching the glass if it isn't obvious from the anchor */
  metal?: MetalId;
  // clip
  contact?: 'point' | 'padded';
  // standoff
  gasket?: string;
  // bolt
  holeDiameterMm?: number;
  edgeDistanceMm?: number;
  washer?: Washer;
}

export interface Settings {
  POINT_LOAD_KG: number;
  THIN_GLASS_MM: number;
  HOLE_EDGE_FACTOR: number;
  TIP_MARGIN: number;
  ANCHOR_KG: number;
  CANTILEVER_MM: number;
}

export const DEFAULT_SETTINGS: Settings = {
  POINT_LOAD_KG: 0.5,
  THIN_GLASS_MM: 5,
  HOLE_EDGE_FACTOR: 2,
  TIP_MARGIN: 0.1,
  ANCHOR_KG: 2,
  CANTILEVER_MM: 150,
};

export interface Sculpture {
  version: 1;
  name: string;
  wall: { enabled: boolean; z: number };
  nodes: FrameNode[];
  rods: Rod[];
  panels: Panel[];
  cages: Cage[];
  parts: GlassPart[];
  joins: Join[];
  settings: Settings;
}

export function emptySculpture(name = 'Untitled'): Sculpture {
  return {
    version: 1,
    name,
    wall: { enabled: false, z: 0 },
    nodes: [],
    rods: [],
    panels: [],
    cages: [],
    parts: [],
    joins: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}
