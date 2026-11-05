import { GLASS, METALS, type MetalId } from '../config/materials';
import { cageById, isBaseContact, isWallAnchor, nodeById, nodeMetal } from '../model/frame';
import type { GlassPart, Join, Sculpture, Vec3 } from '../model/types';
import { analyzeCapture, type CaptureResult } from './blow';
import { partThickness } from './glass';
import { computeMass, type MassReport } from './mass';
import { convexHull, minWidth, polygonArea, rotateEulerXYZ, signedDistanceToHull, sub, type Vec2 } from './vec';

export type Status = 'OK' | 'NOTE' | 'WARN' | 'BAD';
export const STATUS_RANK: Record<Status, number> = { OK: 0, NOTE: 1, WARN: 2, BAD: 3 };
export const worst = (a: Status, b: Status): Status => (STATUS_RANK[a] >= STATUS_RANK[b] ? a : b);

export interface CheckResult {
  check: 'cold' | 'point_load' | 'hole_edge' | 'tip' | 'wall' | 'hot' | 'capture';
  status: Status;
  title: string;
  reason: string;
  partId?: string;
  joinId?: string;
}

export interface BaseInfo {
  wallPiece: boolean;
  contacts: Vec2[];
  hull: Vec2[];
  /** COM distance inside the hull edge (negative = outside) */
  comEdgeMm?: number;
  baseWidthMm?: number;
  status: Status;
}

export interface Analysis {
  mass: MassReport;
  results: CheckResult[];
  partStatus: Map<string, Status>;
  holdingJoins: Map<string, Join[]>;
  joinLoadKg: Map<string, number>;
  captures: Map<string, CaptureResult>;
  base: BaseInfo;
  wallAnchors: Vec3[];
  overall: Status;
}

const fmt = (n: number, d = 0) => n.toFixed(d);
const glassCte = (p: GlassPart) => GLASS[p.glass].cte;

/** The metal a join touches, if we can tell. */
export function joinMetal(s: Sculpture, j: Join): MetalId | undefined {
  if (j.metal) return j.metal;
  if (j.anchor.kind === 'cage') return cageById(s, j.anchor.cageId)?.material;
  if (j.anchor.kind === 'node') return nodeMetal(s, j.anchor.nodeId);
  return undefined;
}

export function joinHolds(s: Sculpture, j: Join, part: GlassPart): boolean {
  if (j.type === 'fused') return part.isInclusion && j.anchor.kind !== 'none';
  if (j.type === 'cage_capture') return j.anchor.kind === 'cage' && !!cageById(s, j.anchor.cageId);
  if (j.anchor.kind === 'node') return !!nodeById(s, j.anchor.nodeId);
  if (j.anchor.kind === 'wall') return s.wall.enabled;
  return false;
}

/**
 * Bolt hole centre → nearest glass edge. Measured from geometry when the bolt is anchored to a node
 * and the part is a cast slab/box (the node is taken as the hole position); otherwise the stored value.
 */
export function boltEdgeDistance(s: Sculpture, j: Join, part: GlassPart): { mm: number; measured: boolean } {
  if (j.anchor.kind === 'node' && part.geom.kind === 'cast') {
    const n = nodeById(s, j.anchor.nodeId);
    if (n) {
      const inv = invRotate(sub(n.p, part.position), part.rotationDeg);
      const hx = (part.geom.sizeMm[0] * part.scale[0]) / 2, hy = (part.geom.sizeMm[1] * part.scale[1]) / 2;
      const mm = Math.min(hx - Math.abs(inv[0]), hy - Math.abs(inv[1]));
      return { mm, measured: true };
    }
  }
  return { mm: j.edgeDistanceMm ?? Infinity, measured: false };
}

/** Inverse of Euler XYZ (R = Rx·Ry·Rz → R⁻¹ = Rz⁻¹·Ry⁻¹·Rx⁻¹). */
function invRotate(v: Vec3, deg: Vec3): Vec3 {
  let p = rotateEulerXYZ(v, [-deg[0], 0, 0]);
  p = rotateEulerXYZ(p, [0, -deg[1], 0]);
  return rotateEulerXYZ(p, [0, 0, -deg[2]]);
}

export function hotNote(s: Sculpture, j: Join, part: GlassPart): string {
  const m = joinMetal(s, j);
  const metal = m ? `${METALS[m].label.toLowerCase()} ≈ ${METALS[m].cte}` : 'the metal (unknown here)';
  return `Glass touched hot metal here. Metal and glass shrink at different rates as they cool (glass ≈ ${glassCte(part)}, ${metal} ×10⁻⁶/°C). Preheat the frame and anneal it together with the glass; soft copper usually forgives more than steel. Confirm with your shop.`;
}

export function analyze(s: Sculpture): Analysis {
  const mass = computeMass(s);
  const set = s.settings;
  const results: CheckResult[] = [];
  const holdingJoins = new Map<string, Join[]>();
  const joinLoadKg = new Map<string, number>();
  const captures = new Map<string, CaptureResult>();

  for (const part of s.parts) {
    const joins = s.joins.filter((j) => j.partId === part.id);
    const holding = joins.filter((j) => joinHolds(s, j, part));
    holdingJoins.set(part.id, holding);
    const kg = (mass.partGrams.get(part.id) ?? 0) / 1000;
    const thick = partThickness(part);

    // 1. cold connection
    for (const j of joins.filter((j) => j.type === 'fused' && !part.isInclusion)) {
      const m = joinMetal(s, j);
      results.push({
        check: 'cold', status: 'BAD', partId: part.id, joinId: j.id,
        title: 'Glass fused to metal',
        reason: `Fused glass-to-metal joints usually crack as they cool because the two shrink at different rates (glass ≈ ${glassCte(part)}${m ? `, ${METALS[m].label.toLowerCase()} ≈ ${METALS[m].cte}` : ''} ×10⁻⁶/°C); fusing is only for an inclusion — thin foil or fine wire fully inside the glass.`,
      });
    }
    if (holding.length === 0) {
      const dangling = joins.some((j) => j.anchor.kind === 'none');
      results.push({
        check: 'cold', status: 'BAD', partId: part.id,
        title: 'No cold connection',
        reason: joins.length === 0
          ? 'Nothing holds this part — give it a clip, standoff, bolt, wire wrap or cage.'
          : dangling
            ? 'This part has a join, but the join is not attached to the frame or the wall.'
            : 'None of this part’s joins can hold it.',
      });
    }

    // 2 + 3. point loads and holes
    const share = holding.length ? kg / holding.length : 0;
    for (const j of holding) {
      joinLoadKg.set(j.id, share);
      const isPoint = (j.type === 'clip' && j.contact !== 'padded') || j.type === 'bolt' || j.type === 'standoff';
      if (isPoint && share > set.POINT_LOAD_KG && thick < set.THIN_GLASS_MM) {
        const what = j.type === 'clip' ? 'A point-contact clip' : j.type === 'bolt' ? 'A bolt' : 'A standoff';
        results.push({
          check: 'point_load', status: 'WARN', partId: part.id, joinId: j.id,
          title: 'Point load on thin glass',
          reason: `${what} carries about ${fmt(share, 2)} kg on glass only ${fmt(thick, 1)} mm thick — spread the load with more joins, a pad, or thicker glass.`,
        });
      }
      if (j.type === 'bolt') {
        const e = boltEdgeDistance(s, j, part);
        const min = set.HOLE_EDGE_FACTOR * thick;
        if (e.mm < min) {
          results.push({
            check: 'hole_edge', status: 'WARN', partId: part.id, joinId: j.id,
            title: 'Hole too close to edge',
            reason: `This bolt hole is ${fmt(Math.max(0, e.mm))} mm from the edge; keep it at least ${fmt(min)} mm (${set.HOLE_EDGE_FACTOR} × the ${fmt(thick, 1)} mm thickness) so the edge doesn't chip or crack.`,
          });
        }
      }
    }

    // 6. hot contact + 7. capture
    for (const j of joins) {
      if (j.type === 'cage_capture' && j.anchor.kind === 'cage') {
        const cage = cageById(s, j.anchor.cageId);
        if (cage) {
          const cap = analyzeCapture(s, part, cage);
          captures.set(part.id, cap);
          const o = cap.tightest.opening;
          if (!cap.inside) {
            results.push({ check: 'capture', status: 'BAD', partId: part.id, joinId: j.id, title: 'Not in the cage', reason: `This part is set to cage capture, but its centre isn't inside ${cage.name}.` });
          } else if (cap.escape) {
            results.push({
              check: 'capture', status: 'BAD', partId: part.id, joinId: j.id, title: 'No capture',
              reason: `The glass is about ${fmt(cap.escape.glassWidth)} mm across but the ${cap.escape.opening.label} is ${fmt(cap.escape.opening.diameter)} mm, so it could slip back out — blow bigger or close the gaps.`,
            });
          } else if (!cap.touching) {
            results.push({
              check: 'capture', status: 'WARN', partId: part.id, joinId: j.id, title: 'Captured but loose',
              reason: `It can't get out, but it never reached the wires, so it will rattle in the cage and may chip.`,
            });
          } else {
            results.push({
              check: 'capture', status: 'OK', partId: part.id, joinId: j.id, title: 'Captured',
              reason: `Its narrowest way out is the ${o.label} (${fmt(o.diameter)} mm) and the glass is ${fmt(cap.tightest.glassWidth)} mm across there, with pillows up to ${fmt(cap.bulgeMm)} mm past the wires.`,
            });
          }
        }
      }
      if (j.type === 'cage_capture' || j.madeHot) {
        results.push({ check: 'hot', status: 'NOTE', partId: part.id, joinId: j.id, title: 'Hot contact', reason: hotNote(s, j, part) });
      }
    }
  }

  // 4 / 5. stability
  const wallAnchors: Vec3[] = s.nodes.filter((n) => isWallAnchor(s, n)).map((n) => n.p);
  if (s.wall.enabled) for (const j of s.joins) if (j.anchor.kind === 'wall') wallAnchors.push(j.anchor.point);
  const contacts: Vec2[] = s.nodes.filter(isBaseContact).map((n) => [n.p[0], n.p[2]]);
  const hull = convexHull(contacts);
  const base: BaseInfo = { wallPiece: wallAnchors.length > 0, contacts, hull, status: 'OK' };
  const com = mass.com;

  if (base.wallPiece) {
    const totalKg = mass.totalG / 1000;
    const per = totalKg / wallAnchors.length;
    let st: Status = 'OK';
    if (per > set.ANCHOR_KG) {
      st = 'WARN';
      results.push({ check: 'wall', status: 'WARN', title: 'Wall anchor overloaded', reason: `Each of the ${wallAnchors.length} wall anchors carries about ${fmt(per, 2)} kg (shared evenly), over the ${set.ANCHOR_KG} kg setting — add anchors or check the wall fixing.` });
    }
    if (com && com[2] - s.wall.z > set.CANTILEVER_MM) {
      st = 'WARN';
      results.push({ check: 'wall', status: 'WARN', title: 'Heavy cantilever', reason: `The centre of mass sits ${fmt(com[2] - s.wall.z)} mm out from the wall (over ${set.CANTILEVER_MM} mm), so the top anchors get pulled hard — bring the mass closer to the wall.` });
    }
    if (st === 'OK') {
      results.push({ check: 'wall', status: 'OK', title: 'Wall mounting', reason: `${wallAnchors.length} wall anchor${wallAnchors.length === 1 ? '' : 's'} at about ${fmt(per, 2)} kg each, centre of mass ${com ? fmt(com[2] - s.wall.z) : '—'} mm from the wall.` });
    }
    base.status = st;
  } else if (com) {
    const area = Math.abs(polygonArea(hull));
    if (hull.length < 3 || area < 1) {
      base.status = 'BAD';
      results.push({ check: 'tip', status: 'BAD', title: 'No stable base', reason: contacts.length === 0 ? 'Nothing touches the floor, so this would fall — add feet at y = 0 or turn on the wall.' : `Only ${contacts.length} floor contact${contacts.length === 1 ? '' : 's'} (or all in a line) — a freestanding piece needs at least 3 feet that aren't in a line.` });
    } else {
      const d = signedDistanceToHull([com[0], com[2]], hull);
      const w = minWidth(hull);
      base.comEdgeMm = d;
      base.baseWidthMm = w;
      if (d < 0) {
        base.status = 'BAD';
        results.push({ check: 'tip', status: 'BAD', title: 'Tips over', reason: `The centre of mass is ${fmt(-d)} mm outside the base footprint, so the piece will tip — widen the base or move weight back over it.` });
      } else if (d < set.TIP_MARGIN * w) {
        base.status = 'WARN';
        results.push({ check: 'tip', status: 'WARN', title: 'Close to tipping', reason: `The centre of mass is only ${fmt(d)} mm inside the edge of the base (less than ${fmt(set.TIP_MARGIN * 100)}% of the ${fmt(w)} mm base width) — a bump could tip it.` });
      } else {
        results.push({ check: 'tip', status: 'OK', title: 'Stands up', reason: `The centre of mass is ${fmt(d)} mm inside the edge of a ${fmt(w)} mm-wide base.` });
      }
    }
  }

  const partStatus = new Map<string, Status>();
  for (const p of s.parts) partStatus.set(p.id, 'OK');
  let overall: Status = 'OK';
  for (const r of results) {
    overall = worst(overall, r.status);
    if (r.partId) partStatus.set(r.partId, worst(partStatus.get(r.partId) ?? 'OK', r.status));
  }
  return { mass, results, partStatus, holdingJoins, joinLoadKg, captures, base, wallAnchors, overall };
}
