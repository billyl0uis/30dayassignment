import { inch } from '../model/units';
import { arc, cleanProfile, type Vec2 } from '../geometry/profile';
import type { HandleSpec, ParamSpec, PresetDef } from './types';

export const N = 64; // points along each curved part of a profile

export const wall: ParamSpec = { key: 'wall', label: 'Wall', kind: 'length', default: 0, min: 0, max: inch(1.5), hint: '0 = solid' };

export const len = (key: string, label: string, def: number, min: number, max: number, handle?: HandleSpec): ParamSpec => ({
  key, label, kind: 'length', default: def, min, max, handle,
});

export const Y: HandleSpec = { axis: 'y' };
export const X = (level = 0.5): HandleSpec => ({ axis: 'x', level });

/** Walls can't eat more than 45% of the thinnest dimension, or the inside turns inside out. */
export const clampWall = (w: number, ...limits: number[]) => Math.max(0, Math.min(w, 0.45 * Math.min(...limits)));

const HALF_PI = Math.PI / 2;

export const sphere: PresetDef = {
  id: 'sphere',
  family: 'basic',
  label: 'Sphere',
  params: [len('diameter', 'Diameter', inch(4), 2, inch(24), X()), wall],
  section: (p) => {
    const r = p.diameter / 2;
    return { kind: 'lathe', profile: cleanProfile(arc(0, r, r, -HALF_PI, HALF_PI, N)), wall: clampWall(p.wall, r) };
  },
};

export const egg: PresetDef = {
  id: 'egg',
  family: 'basic',
  label: 'Ellipsoid / egg',
  params: [
    len('height', 'Height', inch(5), 2, inch(24), Y),
    len('diameter', 'Diameter', inch(3.5), 2, inch(24), X(0.42)),
    { key: 'egg', label: 'Egg', kind: 'ratio', default: 0.15, min: 0, max: 0.4, hint: '0 = true ellipsoid' },
    wall,
  ],
  section: (p) => {
    // Ellipse r = sin t, skewed so the lower half bulges, then rescaled to the diameter.
    const raw: Vec2[] = [];
    for (let i = 0; i <= N * 2; i++) {
      const t = (Math.PI * i) / (N * 2);
      raw.push([Math.sin(t) * (1 + p.egg * Math.cos(t)), (p.height / 2) * (1 - Math.cos(t))]);
    }
    const maxR = Math.max(...raw.map(([r]) => r));
    const profile = cleanProfile(raw.map(([r, y]) => [(r / maxR) * (p.diameter / 2), y]));
    return { kind: 'lathe', profile, wall: clampWall(p.wall, p.diameter / 2, p.height / 2) };
  },
};

export const cylinder: PresetDef = {
  id: 'cylinder',
  family: 'basic',
  label: 'Cylinder',
  params: [len('height', 'Height', inch(5), 1, inch(36), Y), len('diameter', 'Diameter', inch(3), 1, inch(24), X()), wall],
  section: (p) => {
    const r = p.diameter / 2;
    const profile: Vec2[] = [[0, 0], [r, 0], [r, p.height], [0, p.height]];
    return { kind: 'lathe', profile, wall: clampWall(p.wall, r, p.height / 2) };
  },
};

export const cone: PresetDef = {
  id: 'cone',
  family: 'basic',
  label: 'Cone',
  params: [
    len('height', 'Height', inch(4.5), 1, inch(36), Y),
    len('base', 'Base diameter', inch(3.5), 1, inch(24), X(0)),
    len('top', 'Top diameter', inch(1), 0, inch(24), X(1)),
    wall,
  ],
  section: (p) => {
    const rb = p.base / 2;
    const rt = p.top / 2;
    const profile = cleanProfile([[0, 0], [rb, 0], [rt, p.height], [0, p.height]]);
    return { kind: 'lathe', profile, wall: clampWall(p.wall, Math.max(rb, rt), p.height / 2) };
  },
};

export const torus: PresetDef = {
  id: 'torus',
  family: 'basic',
  label: 'Torus',
  params: [len('diameter', 'Outer diameter', inch(4.5), 4, inch(24), X()), len('tube', 'Tube diameter', inch(0.75), 1, inch(8))],
  section: (p) => {
    const tube = Math.min(p.tube, p.diameter / 2);
    const r = tube / 2;
    const R = (p.diameter - tube) / 2;
    // Counter-clockwise, and the last point repeats the first so the lathe closes the seam.
    return { kind: 'lathe-loop', loop: arc(R, r, r, -Math.PI, Math.PI, N * 2) };
  },
};

export const disc: PresetDef = {
  id: 'disc',
  family: 'basic',
  label: 'Disc',
  params: [
    len('diameter', 'Diameter', inch(3.5), 2, inch(24), X()),
    len('thickness', 'Thickness', inch(0.375), 0.5, inch(4), Y),
    len('round', 'Edge round', inch(0.125), 0, inch(2)),
  ],
  section: (p) => {
    const R = p.diameter / 2;
    const T = p.thickness;
    const k = Math.min(p.round, T / 2, R);
    const profile =
      k > 0
        ? [[0, 0] as Vec2, ...arc(R - k, k, k, -HALF_PI, 0, N / 4), ...arc(R - k, T - k, k, 0, HALF_PI, N / 4), [0, T] as Vec2]
        : ([[0, 0], [R, 0], [R, T], [0, T]] as Vec2[]);
    return { kind: 'lathe', profile: cleanProfile(profile), wall: 0 };
  },
};

export const box: PresetDef = {
  id: 'box',
  family: 'basic',
  label: 'Box',
  params: [
    len('width', 'Width', inch(3), 1, inch(36), X()),
    len('depth', 'Depth', inch(3), 1, inch(36), { axis: 'z', level: 0.5 }),
    len('height', 'Height', inch(3), 1, inch(36), Y),
    wall,
  ],
  section: (p) => ({
    kind: 'box',
    width: p.width,
    depth: p.depth,
    height: p.height,
    wall: clampWall(p.wall, p.width / 2, p.depth / 2, p.height / 2),
  }),
};

export const capsule: PresetDef = {
  id: 'capsule',
  family: 'basic',
  label: 'Capsule',
  params: [len('height', 'Height', inch(5.5), 2, inch(36), Y), len('diameter', 'Diameter', inch(2.5), 2, inch(24), X()), wall],
  section: (p) => {
    const r = Math.min(p.diameter, p.height) / 2;
    const profile = [...arc(0, r, r, -HALF_PI, 0, N / 2), ...arc(0, p.height - r, r, 0, HALF_PI, N / 2)];
    return { kind: 'lathe', profile: cleanProfile(profile), wall: clampWall(p.wall, r) };
  },
};

export const BASIC_PRESETS = [sphere, egg, cylinder, cone, torus, disc, box, capsule];
