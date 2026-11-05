import { GLASS, METALS, gramsFromMm3 } from '../config/materials';
import { nodeById } from '../model/frame';
import type { Sculpture, Vec3 } from '../model/types';
import { partCom, partVolume } from './glass';
import { add, cross, dist, len, lerp, scale, sub } from './vec';

export interface MassItem {
  kind: 'metal' | 'glass';
  id: string;
  grams: number;
  com: Vec3;
}

export interface MassReport {
  metalG: number;
  glassG: number;
  totalG: number;
  /** null when the sculpture has no mass */
  com: Vec3 | null;
  items: MassItem[];
  partGrams: Map<string, number>;
}

/**
 * Weight and centre of mass.
 * Rods are solid cylinders (π·(d/2)²·L), panels are flat plates, glass is per-kind (see glass.ts).
 * Clips, bolts and washers are not weighed — they are usually a few grams.
 */
export function computeMass(s: Sculpture): MassReport {
  const items: MassItem[] = [];
  for (const r of s.rods) {
    const a = nodeById(s, r.a), b = nodeById(s, r.b);
    if (!a || !b) continue;
    const L = dist(a.p, b.p);
    const v = Math.PI * (r.diameterMm / 2) ** 2 * L;
    items.push({ kind: 'metal', id: r.id, grams: gramsFromMm3(v, METALS[r.material].density), com: lerp(a.p, b.p, 0.5) });
  }
  for (const pnl of s.panels) {
    const pts = pnl.nodes.map((id) => nodeById(s, id)?.p);
    if (pts.some((p) => !p)) continue;
    const [p0, p1, p2, p3] = pts as Vec3[];
    const a1 = len(cross(sub(p1, p0), sub(p2, p0))) / 2;
    const a2 = len(cross(sub(p2, p0), sub(p3, p0))) / 2;
    const c1 = scale(add(add(p0, p1), p2), 1 / 3);
    const c2 = scale(add(add(p0, p2), p3), 1 / 3);
    const area = a1 + a2;
    const com = area > 0 ? scale(add(scale(c1, a1), scale(c2, a2)), 1 / area) : p0;
    items.push({ kind: 'metal', id: pnl.id, grams: gramsFromMm3(area * pnl.thicknessMm, METALS[pnl.material].density), com });
  }
  const partGrams = new Map<string, number>();
  for (const p of s.parts) {
    const g = gramsFromMm3(partVolume(p), GLASS[p.glass].density);
    partGrams.set(p.id, g);
    items.push({ kind: 'glass', id: p.id, grams: g, com: partCom(p) });
  }
  let metalG = 0, glassG = 0;
  let m: Vec3 = [0, 0, 0];
  for (const it of items) {
    if (it.kind === 'metal') metalG += it.grams;
    else glassG += it.grams;
    m = add(m, scale(it.com, it.grams));
  }
  const totalG = metalG + glassG;
  return { metalG, glassG, totalG, com: totalG > 0 ? scale(m, 1 / totalG) : null, items, partGrams };
}

export function formatWeight(g: number): string {
  const oz = g / 28.349523125;
  const lb = Math.floor(oz / 16);
  const rem = oz - lb * 16;
  const metric = g >= 1000 ? `${(g / 1000).toFixed(2)} kg` : `${g.toFixed(0)} g`;
  return `${metric} · ${lb > 0 ? `${lb} lb ` : ''}${rem.toFixed(1)} oz`;
}
