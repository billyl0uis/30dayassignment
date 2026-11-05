// Shapes from bone, teeth and growth: a horn or tusk, a canine tooth, the knuckle end
// of a long bone, and a lumpy blob. The last two are implicit: defined by a distance
// function (smoothly melted spheres and rods) and meshed by the level-set mesher.

import { inch } from '../model/units';
import { smoothThrough, type Vec2 } from '../geometry/profile';
import { smoothUnion, sweepSdf, type Bounded } from '../geometry/sdf';
import type { Section, V3 } from '../geometry/section';
import { len } from './basic';
import { bentPath, sweepOnFloor } from './sweeps';
import type { ParamSpec, PresetDef } from './types';

const ratio = (key: string, label: string, def: number, min: number, max: number, hint?: string, step?: number, suffix?: string): ParamSpec => ({
  key, label, kind: 'ratio', default: def, min, max, hint, step, suffix,
});
const count = (key: string, label: string, def: number, min: number, max: number, hint?: string): ParamSpec => ({ key, label, kind: 'count', default: def, min, max, hint });

export const horn: PresetDef = {
  id: 'horn',
  family: 'organic',
  label: 'Horn / tusk',
  params: [
    len('length', 'Length', inch(7), 10, inch(36)),
    len('base', 'Base diameter', inch(1.75), 3, inch(8)),
    ratio('curl', 'Curl', 110, 0, 330, 'how far it bends', 5, '°'),
    len('spiral', 'Spiral', 0, 0, inch(6), undefined),
    ratio('tip', 'Tip', 0.06, 0, 0.5, 'tip thickness, as a share of the base'),
  ],
  section: (p) => {
    // Stands on its flat base and bends toward +X; the radius tapers to the tip.
    const path = bentPath(p.length, (p.curl * Math.PI) / 180, p.spiral, 80);
    const n = path.length - 1;
    const radii = path.map((_, i) => (p.base / 2) * (1 - (1 - p.tip) * Math.pow(i / n, 0.85)));
    return sweepOnFloor(path, radii, ['flat', 'round']);
  },
};

export const tooth: PresetDef = {
  id: 'tooth',
  family: 'organic',
  label: 'Tooth',
  params: [
    len('length', 'Length', inch(3), 5, inch(16)),
    len('width', 'Crown width', inch(0.9), 2, inch(6)),
    ratio('root', 'Root', 0.55, 0.3, 0.75, 'share of the length that is root'),
    len('curve', 'Curve', inch(0.2), 0, inch(3), undefined),
  ],
  section: (p) => {
    // A canine: root tip on the floor, widening to the gum line, a full crown, then the cusp.
    const w = p.width / 2;
    const rt = p.root;
    const shape = smoothThrough(
      [
        [0, 0.12],
        [rt * 0.5, 0.5],
        [rt, 0.8],
        [rt + (1 - rt) * 0.18, 1],
        [rt + (1 - rt) * 0.55, 0.72],
        [rt + (1 - rt) * 0.85, 0.32],
        [1, 0.03],
      ] as Vec2[],
      12,
    );
    const path: V3[] = shape.map(([s]) => [p.curve * Math.sin(Math.PI * s), s * p.length, 0]);
    const radii = shape.map(([, r]) => Math.max(0.2, r * w));
    return sweepOnFloor(path, radii, ['round', 'round']);
  },
};

/** Packs the bounds and palette sketch for an implicit shape made of rods and balls. */
function implicitOf(items: Bounded[], k: number, icon: [number, number, number][], thickness: number): Section {
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const it of items) for (let a = 0; a < 3; a++) {
    min[a] = Math.min(min[a], it.min[a]);
    max[a] = Math.max(max[a], it.max[a]);
  }
  return { kind: 'implicit', sdf: smoothUnion(items, k), min, max, bulge: k / 4, thickness, icon };
}

const ball = (c: V3, r: number): Bounded => ({
  sdf: (x, y, z) => Math.hypot(x - c[0], y - c[1], z - c[2]) - r,
  min: [c[0] - r, c[1] - r, c[2] - r],
  max: [c[0] + r, c[1] + r, c[2] + r],
});

export const boneEnd: PresetDef = {
  id: 'bone',
  family: 'organic',
  label: 'Bone end / knuckle',
  params: [
    len('length', 'Length', inch(5), 10, inch(24)),
    len('shaft', 'Shaft diameter', inch(0.9), 3, inch(4)),
    len('knuckle', 'Knuckle size', inch(1.1), 3, inch(5)),
    len('spread', 'Knuckle spread', inch(1.1), 0, inch(5)),
    len('melt', 'Melt', inch(0.4), 0.5, inch(2)),
  ],
  section: (p) => {
    // Two condyles side by side on the floor, the shaft rising out of them and flaring to meet them.
    const rk = p.knuckle / 2;
    const rs = p.shaft / 2;
    const half = p.spread / 2;
    const top = Math.max(p.length - rs, rk * 2);
    const path: V3[] = [[0, rk * 1.1, 0], [0, rk * 1.1 + (top - rk) * 0.35, 0], [0, top, 0]];
    const radii = [Math.max(rs, rk * 0.95), rs, rs * 1.08];
    const shaft: Bounded = {
      sdf: sweepSdf(path, radii, false, ['round', 'round']),
      min: [-radii[0], rk * 1.1 - radii[0], -radii[0]],
      max: [radii[0], top + radii[2], radii[0]],
    };
    const items = [ball([-half, rk, 0], rk), ball([half, rk * 0.92, 0], rk * 0.92), shaft];
    const icon: [number, number, number][] = [[-half, rk, rk], [half, rk * 0.92, rk * 0.92], [0, (rk + top) / 2, rs], [0, top, rs * 1.08]];
    return implicitOf(items, p.melt, icon, rs * 2);
  },
};

/** A tiny seeded random generator, so a blob's lumps come back the same every rebuild. */
function mulberry32(seed: number) {
  let a = Math.floor(seed) * 2654435761;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const blob: PresetDef = {
  id: 'blob',
  family: 'organic',
  label: 'Blob',
  params: [
    len('size', 'Size', inch(3.5), 5, inch(24)),
    count('lumps', 'Lumps', 4, 0, 10),
    ratio('lumpy', 'Lumpiness', 0.5, 0, 1),
    count('seed', 'Variation', 1, 1, 99, 'try another arrangement'),
    len('melt', 'Melt', inch(0.3), 0.5, inch(3)),
  ],
  section: (p) => {
    const rand = mulberry32(p.seed);
    const R = (p.size / 2) * 0.5;
    const balls: [V3, number][] = [[[0, R, 0], R]];
    for (let i = 0; i < Math.round(p.lumps); i++) {
      // A random direction, kept off the very bottom so the blob still sits.
      const u = rand() * 2 - 1;
      const a = rand() * Math.PI * 2;
      const dir: V3 = [Math.sqrt(1 - u * u) * Math.cos(a), Math.abs(u) * 0.8 + 0.1, Math.sqrt(1 - u * u) * Math.sin(a)];
      // Lumpier means bigger lumps set further out, so they read as lumps, not swelling.
      const r = R * (0.35 + 0.4 * p.lumpy * rand() + 0.15 * rand());
      const d = R * (0.6 + 0.5 * p.lumpy + 0.2 * rand());
      balls.push([[dir[0] * d, R + dir[1] * d - (rand() * 0.6 - 0.1) * R, dir[2] * d], r]);
    }
    const lift = -Math.min(...balls.map(([c, r]) => c[1] - r));
    const placed = balls.map(([c, r]): [V3, number] => [[c[0], c[1] + lift, c[2]], r]);
    return implicitOf(
      placed.map(([c, r]) => ball(c, r)),
      p.melt,
      placed.map(([c, r]) => [c[0], c[1], r]),
      R,
    );
  },
};

export const ORGANIC_PRESETS = [horn, tooth, boneEnd, blob];
