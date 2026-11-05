// The design document. Everything here is plain JSON: no three.js objects.
// All lengths are millimetres, Y is up, and the floor is y = 0.

export type Vec3 = [number, number, number];
export type Units = 'in' | 'cm';
export type OpId = string;
export type MatId = string;

export interface Transform {
  position: Vec3;
  rotation: Vec3; // Euler XYZ, radians
  scale: Vec3;
}

/**
 * A part drawn by hand: points in millimetres in the drawing plane (x across, y up).
 * revolve spins the line around the vertical axis (x is the radius), extrude pushes a
 * closed outline back into a slab, inflate puffs a closed outline up like a pillow.
 */
export interface CustomShape {
  mode: 'revolve' | 'extrude' | 'inflate';
  points: [number, number][];
  smooth: boolean;
}

/**
 * A mesh brought in from an STL or OBJ file. `data` is base64 of a Float32Array of
 * triangle corners (x, y, z per corner, three corners per triangle), already centred
 * on the axis and resting on y = 0, in the file's own units.
 */
export interface ImportedMesh {
  id: string;
  name: string;
  triangles: number;
  data: string;
}

export interface PrimitiveOp {
  id: OpId;
  type: 'primitive';
  label: string;
  suppressed?: boolean;
  preset: string;
  params: Record<string, number>;
  /** Only for custom parts: the drawing itself travels with the design. */
  shape?: CustomShape;
  /** Only for imported meshes: the triangles travel with the design. */
  mesh?: ImportedMesh;
  transform: Transform;
  materialId: MatId;
}

/**
 * Piles its children up the stack's axis, first child at the bottom. Each child sinks
 * `overlap` mm into the one below, the way hot parts are joined. Children keep their
 * own rotation and scale; the stack decides where they sit.
 */
export interface StackOp {
  id: OpId;
  type: 'stack';
  label: string;
  suppressed?: boolean;
  children: OpId[];
  overlap: number;
  transform: Transform;
}

/** Copies its source around a vertical axis (radial) or along a fixed step (linear). */
export interface ArrayOp {
  id: OpId;
  type: 'array';
  label: string;
  suppressed?: boolean;
  source: OpId;
  mode: 'radial' | 'linear';
  count: number;
  angle: number; // radial: total sweep in degrees; 360 spaces copies evenly all the way round
  center: [number, number]; // radial: x, z of the vertical axis
  step: Vec3; // linear: offset from one copy to the next
}

/**
 * Hard CSG on whole bodies. The target keeps its glass color; tools only shape it.
 * union: target + tools, subtract: target − tools, intersect: only where they all overlap.
 */
export interface BooleanOp {
  id: OpId;
  type: 'boolean';
  label: string;
  suppressed?: boolean;
  mode: 'union' | 'subtract' | 'intersect';
  target: OpId;
  tools: OpId[];
}

/**
 * Hollows its source to an even wall, measured in from the outside surface, and can
 * cut an opening through the top or bottom on the vertical axis.
 */
export interface ShellOp {
  id: OpId;
  type: 'shell';
  label: string;
  suppressed?: boolean;
  source: OpId;
  thickness: number;
  opening: 'none' | 'top' | 'bottom';
  openingDiameter: number;
}

/**
 * Melts its inputs into one piece, the way hot parts slump together: within `radius`
 * of each other the surfaces flow into a smooth fillet instead of meeting at a crease.
 */
export interface BlendOp {
  id: OpId;
  type: 'blend';
  label: string;
  suppressed?: boolean;
  inputs: OpId[];
  radius: number;
  quality: 'normal' | 'fine';
}

/**
 * Pushes the finished shape around: pinch, ribs, surface noise, twist, sag and bend,
 * all about the piece's own vertical axis. Every amount at 0 leaves it untouched.
 */
export interface DeformOp {
  id: OpId;
  type: 'deform';
  label: string;
  suppressed?: boolean;
  source: OpId;
  pinch: number;
  ribs: number;
  ribDepth: number;
  twist: number;
  sag: number;
  bend: number;
  noise: number;
  noiseScale: number;
  seed: number;
}

export type OpNode = PrimitiveOp | StackOp | ArrayOp | BooleanOp | ShellOp | BlendOp | DeformOp;
export type ConsumerOp = Exclude<OpNode, PrimitiveOp>;

export type Finish = 'transparent' | 'opaque';

export interface GlassMaterial {
  id: MatId;
  name: string;
  color: string;
  finish: Finish;
  colorDensity: number; // 0..1, how strongly thick glass darkens to `color`
  roughness: number; // 0 polished .. 1 frosted
  ior: number;
  /** A surface treatment on top of the glass. Older designs have none. */
  effect?: GlassEffect;
  ribs?: number; // optic and twist: how many ribs round the piece
  twist?: number; // twist: degrees the ribs turn per inch of height
  fritColor?: string;
  fritAmount?: number; // 0..1, how much of the surface the frit covers
  fritSize?: number; // mm, size of the chips
}

export type GlassEffect = 'none' | 'optic' | 'twist' | 'frit' | 'frosted' | 'iridescent';

export interface Note {
  id: string;
  text: string;
  done: boolean;
}

export interface Design {
  schemaVersion: 1;
  id: string;
  name: string;
  displayUnits: Units;
  density_g_cm3: number;
  ops: OpNode[];
  materials: Record<MatId, GlassMaterial>;
  scene: { background: string; turntable: boolean; grid?: boolean };
  shop: { notes: Note[] };
}
