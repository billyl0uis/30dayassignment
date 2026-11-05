import type { MetalId } from '../config/materials';
import { add, dist, len, norm, rotateAxis, scale, sub } from '../physics/vec';
import type { Cage, FrameNode, Rod, Sculpture, Vec3 } from './types';

/** Floor/wall contact tolerance, mm. */
export const CONTACT_TOL = 0.5;

let counter = 0;
export function uid(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

export const nodeById = (s: Sculpture, id: string) => s.nodes.find((n) => n.id === id);
export const rodById = (s: Sculpture, id: string) => s.rods.find((r) => r.id === id);
export const partById = (s: Sculpture, id: string) => s.parts.find((p) => p.id === id);
export const cageById = (s: Sculpture, id: string) => s.cages.find((c) => c.id === id);

export function addNode(s: Sculpture, p: Vec3): string {
  const id = uid('n');
  s.nodes.push({ id, p: [...p] as Vec3 });
  return id;
}

export function addRod(s: Sculpture, a: string, b: string, material: MetalId, diameterMm: number): string {
  const id = uid('r');
  s.rods.push({ id, a, b, material, diameterMm });
  return id;
}

/** Nodes + rods along a list of points. */
export function polyline(s: Sculpture, pts: Vec3[], material: MetalId, dia: number, startNode?: string) {
  const nodeIds: string[] = [];
  const rodIds: string[] = [];
  pts.forEach((p, i) => {
    if (i === 0 && startNode) nodeIds.push(startNode);
    else nodeIds.push(addNode(s, p));
    if (i > 0) rodIds.push(addRod(s, nodeIds[i - 1], nodeIds[i], material, dia));
  });
  return { nodeIds, rodIds };
}

/** Points along a circular arc from a to b bowing out by sagitta h. Includes both ends. */
export function arcPoints(a: Vec3, b: Vec3, segments: number, sagittaMm: number, angleDeg: number): Vec3[] {
  const chord = sub(b, a);
  const L = len(chord);
  const u = norm(chord);
  // base bend direction: world up perpendicular to the rod, or +x if the rod is vertical
  let perp = sub([0, 1, 0], scale(u, u[1]));
  if (len(perp) < 1e-3) perp = sub([1, 0, 0], scale(u, u[0]));
  perp = rotateAxis(norm(perp), u, (angleDeg * Math.PI) / 180);
  const mid = scale(add(a, b), 0.5);
  const n = Math.max(1, Math.round(segments));
  if (Math.abs(sagittaMm) < 1e-6 || L < 1e-6) {
    return Array.from({ length: n + 1 }, (_, i) => add(a, scale(chord, i / n)));
  }
  if (sagittaMm < 0) {
    perp = scale(perp, -1);
    sagittaMm = -sagittaMm;
  }
  const h = sagittaMm;
  const R = (L * L) / 4 / (2 * h) + h / 2;
  const center = add(mid, scale(perp, h - R));
  const alpha = Math.atan2(L / 2, R - h);
  const out: Vec3[] = [];
  for (let i = 0; i <= n; i++) {
    const phi = -alpha + (2 * alpha * i) / n;
    out.push(add(center, add(scale(perp, R * Math.cos(phi)), scale(u, R * Math.sin(phi)))));
  }
  out[0] = [...a];
  out[n] = [...b];
  return out;
}

/** Replace a rod with an arc of `segments` rods. Returns the new rod ids. */
export function bendRod(s: Sculpture, rodId: string, segments: number, sagittaMm: number, angleDeg: number): string[] {
  const rod = rodById(s, rodId);
  if (!rod) return [];
  const a = nodeById(s, rod.a)!, b = nodeById(s, rod.b)!;
  const pts = arcPoints(a.p, b.p, segments, sagittaMm, angleDeg);
  s.rods = s.rods.filter((r) => r.id !== rodId);
  const nodeIds = [rod.a];
  for (let i = 1; i < pts.length - 1; i++) nodeIds.push(addNode(s, pts[i]));
  nodeIds.push(rod.b);
  const rodIds: string[] = [];
  for (let i = 1; i < nodeIds.length; i++) rodIds.push(addRod(s, nodeIds[i - 1], nodeIds[i], rod.material, rod.diameterMm));
  for (const c of s.cages) {
    if (c.rodIds.includes(rodId)) c.rodIds = c.rodIds.filter((r) => r !== rodId).concat(rodIds);
  }
  return rodIds;
}

export interface CageOptions {
  center: Vec3;
  ribs: number;
  rings: number;
  radiusMm: number;
  heightMm: number;
  wireMm: number;
  material: MetalId;
  /** end-opening radius / radius */
  taper: number;
  name?: string;
}

/** Radius of the cage's barrel profile at normalized height v ∈ [0, 1]. */
export function cageRadiusAt(o: Pick<CageOptions, 'radiusMm' | 'taper'>, v: number): number {
  return o.radiusMm * (o.taper + (1 - o.taper) * Math.sin(Math.PI * v));
}

const RIB_SEGS = 4; // per band between rings (even, so each band has a middle node)
const RING_SEGS = 3; // per arc between ribs

/** Ring-and-rib cage around a centre. Rings sit at evenly spaced heights, ending at the top and bottom openings. */
export function generateCage(s: Sculpture, o: CageOptions): Cage {
  const ribs = Math.max(2, Math.round(o.ribs));
  const rings = Math.max(2, Math.round(o.rings));
  const H = o.heightMm;
  const y0 = o.center[1] - H / 2;
  const at = (v: number, theta: number): Vec3 => {
    const r = cageRadiusAt(o, v);
    return [o.center[0] + r * Math.cos(theta), y0 + v * H, o.center[2] + r * Math.sin(theta)];
  };
  const bands = rings - 1;
  const ribTheta = (j: number) => (2 * Math.PI * j) / ribs;
  const rodIds: string[] = [];

  // rib paths (include ring crossings + intermediate nodes)
  const ribPaths: string[][] = [];
  for (let j = 0; j < ribs; j++) {
    const path: string[] = [];
    const steps = bands * RIB_SEGS;
    for (let k = 0; k <= steps; k++) path.push(addNode(s, at(k / steps, ribTheta(j))));
    for (let k = 1; k < path.length; k++) rodIds.push(addRod(s, path[k - 1], path[k], o.material, o.wireMm));
    ribPaths.push(path);
  }
  const grid: string[][] = [];
  for (let i = 0; i < rings; i++) grid.push(ribPaths.map((p) => p[i * RIB_SEGS]));

  // ring arcs between rib crossings
  const ringPaths: string[][] = [];
  for (let i = 0; i < rings; i++) {
    const v = i / bands;
    const path: string[] = [];
    for (let j = 0; j < ribs; j++) {
      path.push(grid[i][j]);
      for (let k = 1; k < RING_SEGS; k++) path.push(addNode(s, at(v, ribTheta(j) + ((2 * Math.PI) / ribs) * (k / RING_SEGS))));
    }
    for (let k = 0; k < path.length; k++) rodIds.push(addRod(s, path[k], path[(k + 1) % path.length], o.material, o.wireMm));
    ringPaths.push(path);
  }

  const cage: Cage = {
    id: uid('cage'),
    name: o.name ?? `Cage ${s.cages.length + 1}`,
    center: [...o.center] as Vec3,
    ribs,
    rings,
    radiusMm: o.radiusMm,
    heightMm: H,
    taper: o.taper,
    wireMm: o.wireMm,
    material: o.material,
    grid,
    ribPaths,
    ringPaths,
    rodIds,
  };
  s.cages.push(cage);
  return cage;
}

export function deleteNode(s: Sculpture, id: string) {
  const deadRods = new Set(s.rods.filter((r) => r.a === id || r.b === id).map((r) => r.id));
  s.rods = s.rods.filter((r) => !deadRods.has(r.id));
  s.nodes = s.nodes.filter((n) => n.id !== id);
  s.panels = s.panels.filter((p) => !p.nodes.includes(id));
  for (const j of s.joins) if (j.anchor.kind === 'node' && j.anchor.nodeId === id) j.anchor = { kind: 'none' };
  pruneCages(s, deadRods, new Set([id]));
}

export function deleteRod(s: Sculpture, id: string) {
  s.rods = s.rods.filter((r) => r.id !== id);
  pruneCages(s, new Set([id]), new Set());
}

/** A cage that loses any of its wires or nodes stops being a cage (its gaps are no longer known). */
function pruneCages(s: Sculpture, deadRods: Set<string>, deadNodes: Set<string>) {
  const broken = s.cages.filter(
    (c) => c.rodIds.some((r) => deadRods.has(r)) || c.ringPaths.some((p) => p.some((n) => deadNodes.has(n))) || c.ribPaths.some((p) => p.some((n) => deadNodes.has(n))),
  );
  for (const c of broken) {
    for (const j of s.joins) if (j.anchor.kind === 'cage' && j.anchor.cageId === c.id) j.anchor = { kind: 'none' };
  }
  s.cages = s.cages.filter((c) => !broken.includes(c));
}

export function deletePart(s: Sculpture, id: string) {
  s.parts = s.parts.filter((p) => p.id !== id);
  s.joins = s.joins.filter((j) => j.partId !== id);
}

export const isBaseContact = (n: FrameNode) => Math.abs(n.p[1]) <= CONTACT_TOL;
export const isWallAnchor = (s: Sculpture, n: FrameNode) => s.wall.enabled && Math.abs(n.p[2] - s.wall.z) <= CONTACT_TOL;

export const rodLength = (s: Sculpture, r: Rod) => dist(nodeById(s, r.a)!.p, nodeById(s, r.b)!.p);

/** The metal a node is made of (first rod touching it), for hot-contact notes. */
export function nodeMetal(s: Sculpture, nodeId: string): MetalId | undefined {
  return s.rods.find((r) => r.a === nodeId || r.b === nodeId)?.material;
}

/** Point on the wall plane closest to p. */
export const projectToWall = (s: Sculpture, p: Vec3): Vec3 => [p[0], p[1], s.wall.z];

