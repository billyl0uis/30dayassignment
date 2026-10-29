// Parts a glassblower actually makes and joins: gathers, bodies, necks, lips, feet,
// stems, wraps, coils, cane, bits and handles. Sizes default to round inch numbers
// at a scale you'd see on the bench.

import { inch } from '../model/units';
import { arc, cleanProfile, smoothThrough, type Vec2 } from '../geometry/profile';
import { N, X, Y, clampWall, len, wall } from './basic';
import { bentPath, helix, sweepOnFloor } from './sweeps';
import type { ParamSpec, PresetDef } from './types';

const ratio = (key: string, label: string, def: number, min: number, max: number, hint?: string, step?: number, suffix?: string): ParamSpec => ({
  key, label, kind: 'ratio', default: def, min, max, hint, step, suffix,
});

const deg = (d: number) => (d * Math.PI) / 180;

/** Rescales a profile's radii so its widest point is `r`. */
const widestTo = (pts: Vec2[], r: number): Vec2[] => {
  const max = Math.max(...pts.map((p) => p[0])) || 1;
  return pts.map(([x, y]) => [(x / max) * r, y]);
};

export const gather: PresetDef = {
  id: 'gather',
  family: 'glass',
  label: 'Bubble / gather',
  params: [
    len('height', 'Height', inch(4), 5, inch(24), Y),
    len('diameter', 'Diameter', inch(3.5), 5, inch(24), X(0.45)),
    ratio('sag', 'Sag', 0.2, 0, 0.45, 'heavier at the bottom'),
    len('neck', 'Pipe end', inch(0.75), 0, inch(4), undefined),
    { ...wall, default: inch(0.2) },
  ],
  section: (p) => {
    // An egg shape whose top is cut flat where it comes off the blowpipe.
    const raw: Vec2[] = [];
    for (let i = 0; i <= N * 2; i++) {
      const t = (Math.PI * i) / (N * 2);
      raw.push([Math.sin(t) * (1 + p.sag * Math.cos(t)), (p.height / 2) * (1 - Math.cos(t))]);
    }
    const body = widestTo(raw, p.diameter / 2);
    const neckR = Math.min(p.neck / 2, (p.diameter / 2) * 0.8);
    const top = body.findIndex(([r], i) => i > N && r <= neckR);
    const profile = neckR > 0 && top > 0 ? [...body.slice(0, top), [neckR, body[top][1]] as Vec2, [0, body[top][1]] as Vec2] : body;
    return { kind: 'lathe', profile: cleanProfile(profile), wall: clampWall(p.wall, p.diameter / 2, p.height / 2) };
  },
};

export const gourd: PresetDef = {
  id: 'gourd',
  family: 'glass',
  label: 'Gourd',
  params: [
    len('height', 'Height', inch(7), 10, inch(30), Y),
    len('lower', 'Lower diameter', inch(4.5), 5, inch(24)),
    len('upper', 'Upper diameter', inch(3), 5, inch(24)),
    len('waist', 'Waist diameter', inch(1.75), 3, inch(20)),
    ratio('at', 'Waist height', 0.55, 0.3, 0.75),
    { ...wall, default: inch(0.15) },
  ],
  section: (p) => {
    const H = p.height;
    const w = p.at * H;
    const [rl, ru, rw] = [p.lower / 2, p.upper / 2, Math.min(p.waist, p.lower, p.upper) / 2];
    const ctrl: Vec2[] = [
      [rl * 0.7, 0],
      [rl, w * 0.42],
      [rl * 0.82, w * 0.82],
      [rw, w],
      [ru * 0.92, w + (H - w) * 0.3],
      [ru, w + (H - w) * 0.55],
      [ru * 0.62, w + (H - w) * 0.9],
      [ru * 0.25, H],
    ];
    const curve = smoothThrough(ctrl, 10).map(([r, y]): Vec2 => [Math.max(0.5, r), y]);
    const profile = cleanProfile([[0, 0], ...curve, [0, H]]);
    return { kind: 'lathe', profile, wall: clampWall(p.wall, rw, H / 4) };
  },
};

export const teardrop: PresetDef = {
  id: 'teardrop',
  family: 'glass',
  label: 'Teardrop',
  params: [
    len('height', 'Height', inch(5), 5, inch(24), Y),
    len('diameter', 'Diameter', inch(3), 5, inch(24), X(0.35)),
    ratio('point', 'Point', 1.5, 0.5, 4, 'higher = longer, sharper tip'),
    wall,
  ],
  section: (p) => {
    // The classic teardrop curve: r = sin t · sin^m(t/2), round at the bottom, a point on top.
    const raw: Vec2[] = [];
    for (let i = 0; i <= N * 2; i++) {
      const t = Math.PI - (Math.PI * i) / (N * 2); // bottom (t = π) to tip (t = 0)
      raw.push([Math.sin(t) * Math.pow(Math.sin(t / 2), p.point), (p.height / 2) * (1 + Math.cos(t))]);
    }
    const profile = cleanProfile(widestTo(raw, p.diameter / 2));
    return { kind: 'lathe', profile, wall: clampWall(p.wall, p.diameter / 2, p.height / 4) };
  },
};

/** An open tube, as a closed loop that never touches the axis. */
function tubeLoop(outer: Vec2[], t: number): Vec2[] {
  const inner = outer.map(([r, y]): Vec2 => [Math.max(0.3, r - t), y]).reverse();
  const loop = [inner[inner.length - 1], ...outer, ...inner];
  return cleanProfile([...loop, loop[0]]); // counter-clockwise, closing point repeated
}

export const neck: PresetDef = {
  id: 'neck',
  family: 'glass',
  label: 'Neck',
  params: [
    len('height', 'Height', inch(2.5), 3, inch(24), Y),
    len('bottom', 'Bottom diameter', inch(1.5), 3, inch(12)),
    len('top', 'Top diameter', inch(1.25), 3, inch(12)),
    len('wall', 'Wall', inch(0.125), 0.5, inch(1)),
  ],
  section: (p) => {
    const t = Math.min(p.wall, p.bottom / 2 - 0.3, p.top / 2 - 0.3);
    return { kind: 'lathe-loop', loop: tubeLoop([[p.bottom / 2, 0], [p.top / 2, p.height]], t) };
  },
};

export const lip: PresetDef = {
  id: 'lip',
  family: 'glass',
  label: 'Flared lip',
  params: [
    len('height', 'Height', inch(1.5), 2, inch(12), Y),
    len('base', 'Base diameter', inch(1.5), 3, inch(16)),
    len('flare', 'Flare diameter', inch(3.5), 3, inch(24)),
    ratio('curve', 'Curve', 2.2, 1, 5, '1 = straight cone, higher = trumpet'),
    len('wall', 'Wall', inch(0.125), 0.5, inch(1)),
  ],
  section: (p) => {
    const [rb, rf] = [p.base / 2, p.flare / 2];
    const outer: Vec2[] = Array.from({ length: N + 1 }, (_, i) => {
      const s = i / N;
      return [rb + (rf - rb) * Math.pow(s, p.curve), p.height * s];
    });
    return { kind: 'lathe-loop', loop: tubeLoop(outer, Math.min(p.wall, rb - 0.3)) };
  },
};

export const foot: PresetDef = {
  id: 'foot',
  family: 'glass',
  label: 'Foot',
  params: [
    len('diameter', 'Diameter', inch(3), 5, inch(16), X(0.3)),
    len('thickness', 'Thickness', inch(0.25), 1, inch(2), Y),
    len('kick', 'Kick-up', inch(0.1), 0, inch(1.5), undefined),
    len('round', 'Edge round', inch(0.08), 0, inch(0.5)),
  ],
  section: (p) => {
    const R = p.diameter / 2;
    const T = p.thickness;
    const e = Math.min(p.round, T / 2 - 0.01, R / 4);
    const kick = Math.min(p.kick, T * 0.6);
    // The underside rises to a shallow cone in the middle so the foot stands on its rim.
    const profile: Vec2[] =
      e > 0
        ? [[0, kick], [R - e, 0], ...arc(R - e, e, e, -Math.PI / 2, 0, N / 4), ...arc(R - e, T - e, e, 0, Math.PI / 2, N / 4), [0, T]]
        : [[0, kick], [R, 0], [R, T], [0, T]];
    return { kind: 'lathe', profile: cleanProfile(profile), wall: 0 };
  },
};

export const stem: PresetDef = {
  id: 'stem',
  family: 'glass',
  label: 'Stem',
  params: [
    len('height', 'Height', inch(3), 5, inch(18), Y),
    len('diameter', 'Diameter', inch(0.5), 2, inch(4)),
    len('bottom', 'Flare at foot', inch(0.9), 2, inch(6)),
    len('top', 'Flare at bowl', inch(0.8), 2, inch(6)),
    len('knop', 'Knop', inch(1), 0, inch(4), undefined),
    ratio('at', 'Knop height', 0.45, 0.15, 0.85),
  ],
  section: (p) => {
    const H = p.height;
    const r = p.diameter / 2;
    const rk = p.knop / 2;
    const ctrl: Vec2[] = [[p.bottom / 2, 0], [r * 1.15, H * 0.12]];
    if (rk > r) {
      const kh = Math.min(rk * 0.9, H * 0.2);
      const ky = p.at * H;
      ctrl.push([r, Math.max(H * 0.16, ky - kh * 1.6)], [rk, ky], [r, Math.min(H * 0.84, ky + kh * 1.6)]);
    }
    ctrl.push([r * 1.15, H * 0.88], [p.top / 2, H]);
    const curve = smoothThrough(ctrl, 10).map(([x, y]): Vec2 => [Math.max(0.5, x), y]);
    return { kind: 'lathe', profile: cleanProfile([[0, 0], ...curve, [0, H]]), wall: 0 };
  },
};

const helixParams = (dia: number, thread: number, turns: number, rise: number): ParamSpec[] => [
  len('diameter', 'Outside diameter', dia, 5, inch(24), X(0.5)),
  len('thread', 'Thread', thread, 1, inch(2)),
  ratio('turns', 'Turns', turns, 0.25, 12, undefined, 0.25),
  len('rise', 'Rise per turn', rise, 0, inch(4), undefined),
];

const helixSection = (p: Record<string, number>) => {
  const r = p.thread / 2;
  const R = Math.max(r * 1.05, p.diameter / 2 - r);
  const path = helix(R, p.turns, Math.max(p.rise, 0));
  return sweepOnFloor(path, path.map(() => r), ['round', 'round']);
};

export const lipWrap: PresetDef = {
  id: 'lipwrap',
  family: 'glass',
  label: 'Lip wrap',
  params: helixParams(inch(3.25), inch(0.12), 2, inch(0.11)),
  section: helixSection,
};

export const coil: PresetDef = {
  id: 'coil',
  family: 'glass',
  label: 'Coil',
  params: helixParams(inch(2), inch(0.3), 5, inch(0.5)),
  section: helixSection,
};

export const rod: PresetDef = {
  id: 'rod',
  family: 'glass',
  label: 'Rod / cane',
  params: [
    len('length', 'Length', inch(6), 5, inch(48)),
    len('diameter', 'Diameter', inch(0.375), 1, inch(3)),
    ratio('bend', 'Bend', 0, 0, 300, 'lying on the floor', 5, '°'),
  ],
  section: (p) => {
    // Lies on the floor along X, bending round in the floor plane.
    const path = bentPath(p.length, deg(p.bend)).map(([x, y, z]): [number, number, number] => [y, z, x]);
    return sweepOnFloor(path, path.map(() => p.diameter / 2), ['round', 'round']);
  },
};

export const prunt: PresetDef = {
  id: 'prunt',
  family: 'glass',
  label: 'Bit / prunt',
  params: [len('diameter', 'Diameter', inch(1), 2, inch(6), X(0)), len('height', 'Height', inch(0.45), 1, inch(4), Y), ratio('spread', 'Spread', 0.5, 0, 1, 'flatter, wider skirt')],
  section: (p) => {
    // A dome of hot glass pressed onto a surface: its skirt flares where it spread.
    const R = p.diameter / 2;
    const H = p.height;
    const pts: Vec2[] = [[0, 0]];
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * (Math.PI / 2);
      const skirt = 1 + p.spread * 0.25 * Math.pow(1 - Math.sin(t), 4); // a little lip at the base
      pts.push([(R * Math.cos(t) * skirt) / (1 + p.spread * 0.25), H * Math.sin(t)]);
    }
    return { kind: 'lathe', profile: cleanProfile(pts), wall: 0 };
  },
};

export const handle: PresetDef = {
  id: 'handle',
  family: 'glass',
  label: 'Handle',
  params: [
    len('height', 'Height', inch(3.5), 10, inch(16)),
    len('reach', 'Reach', inch(1.5), 5, inch(8)),
    len('thickness', 'Thickness', inch(0.5), 2, inch(2)),
    ratio('taper', 'Taper', 0.6, 0.2, 1, 'thickness at the bottom end'),
  ],
  section: (p) => {
    // An ear handle: a half-loop out from x = 0, pulled thinner toward the bottom.
    const n = 48;
    const path: [number, number, number][] = [];
    const radii: number[] = [];
    for (let i = 0; i <= n; i++) {
      const t = Math.PI / 2 - (Math.PI * i) / n; // top to bottom
      path.push([p.reach * Math.cos(t), (p.height / 2) * (1 + Math.sin(t)), 0]);
      radii.push((p.thickness / 2) * (1 - (1 - p.taper) * (i / n)));
    }
    return sweepOnFloor(path, radii, ['round', 'round']);
  },
};

export const GLASS_PRESETS = [gather, gourd, teardrop, neck, lip, foot, stem, lipWrap, coil, rod, prunt, handle];

