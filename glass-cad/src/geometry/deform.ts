// Deformers: the ways hot glass gets pushed around after it's shaped. All of them
// work around the piece's own vertical axis (through the middle of its footprint),
// with t running 0 at the bottom to 1 at the top. Applied in a fixed order, the same
// order you'd meet them at the bench: shape the wall (pinch, ribs, noise), then twist
// it, let it sag, and finally bend the whole piece.

export interface DeformParams {
  pinch: number; // −1..1: positive draws in a waist, negative swells the middle
  ribs: number; // count of vertical ribs (0 = none)
  ribDepth: number; // mm in and out
  twist: number; // degrees from bottom to top
  sag: number; // mm the top drops; the lower wall spreads to take it
  bend: number; // degrees the piece bends over toward +X
  noise: number; // mm of lumpy surface wander
  noiseScale: number; // mm across one lump
  seed: number;
}

/** Just the deform amounts out of anything that carries them (a DeformOp, say). */
export const deformParamsOf = (o: DeformParams): DeformParams => ({
  pinch: o.pinch,
  ribs: o.ribs,
  ribDepth: o.ribDepth,
  twist: o.twist,
  sag: o.sag,
  bend: o.bend,
  noise: o.noise,
  noiseScale: o.noiseScale,
  seed: o.seed,
});

export const NO_DEFORM: DeformParams = { pinch: 0, ribs: 0, ribDepth: 0, twist: 0, sag: 0, bend: 0, noise: 0, noiseScale: 20, seed: 1 };

export interface Frame {
  cx: number;
  cz: number;
  y0: number;
  height: number;
  radius: number; // the widest the piece gets from its axis, for scaling ribs
}

export type Vec3 = [number, number, number];

/** Returns a function that moves one vertex in place. */
export function deformer(p: DeformParams, f: Frame): (v: Vec3) => void {
  const H = Math.max(f.height, 1e-6);
  const twist = (p.twist * Math.PI) / 180;
  const bend = (p.bend * Math.PI) / 180;
  const noise = valueNoise(p.seed);
  const ribs = Math.round(p.ribs);
  return (v) => {
    let x = v[0] - f.cx;
    let z = v[2] - f.cz;
    let y = v[1] - f.y0;
    const t = Math.min(1, Math.max(0, y / H));
    let r = Math.hypot(x, z);
    let a = Math.atan2(z, x);

    // Wall shape: radius changes only, so the axis stays put.
    let scale = 1 - p.pinch * Math.sin(Math.PI * t);
    if (ribs > 0 && r > 1e-6) scale += (p.ribDepth / Math.max(r, p.ribDepth)) * Math.cos(ribs * a) * Math.min(1, r / (f.radius * 0.3 + 1e-6));
    if (p.noise > 0) scale += (p.noise / Math.max(r, f.radius * 0.25 + 1e-6)) * noise(v[0] / p.noiseScale, v[1] / p.noiseScale, v[2] / p.noiseScale);
    r *= Math.max(0.05, scale);

    // Twist turns each height by its share of the total.
    a += twist * t;
    x = r * Math.cos(a);
    z = r * Math.sin(a);

    // Sag: the top settles by `sag`, falling off toward the base; the lower wall
    // bulges outward to make room, the way a slumped gather spreads at its foot.
    if (p.sag !== 0) {
      y -= p.sag * t * t;
      const spread = 1 + (p.sag / H) * 0.6 * (1 - t) * (1 - t);
      x *= spread;
      z *= spread;
    }

    // Bend about a horizontal line out at +X, so the axis curves into an arc of `bend`.
    if (Math.abs(bend) > 1e-6) {
      const rho = H / bend;
      const th = bend * Math.min(1, Math.max(0, y / H));
      const out = rho - x;
      x = rho - out * Math.cos(th);
      y = out * Math.sin(th) + (y > H ? (y - H) * Math.cos(th) : y < 0 ? y : 0);
    }

    v[0] = x + f.cx;
    v[1] = y + f.y0;
    v[2] = z + f.cz;
  };
}

/** Smooth 3D value noise in about −1..1, repeatable for a seed. */
export function valueNoise(seed: number): (x: number, y: number, z: number) => number {
  const hash = (i: number, j: number, k: number) => {
    let h = (i * 374761393 + j * 668265263 + k * 2147483647 + seed * 144665) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const fade = (t: number) => t * t * (3 - 2 * t);
  return (x, y, z) => {
    const [i, j, k] = [Math.floor(x), Math.floor(y), Math.floor(z)];
    const [u, v, w] = [fade(x - i), fade(y - j), fade(z - k)];
    let sum = 0;
    for (let di = 0; di < 2; di++)
      for (let dj = 0; dj < 2; dj++)
        for (let dk = 0; dk < 2; dk++) {
          const wgt = (di ? u : 1 - u) * (dj ? v : 1 - v) * (dk ? w : 1 - w);
          sum += wgt * hash(i + di, j + dj, k + dk);
        }
    return sum * 2 - 1;
  };
}

/** A random but tasteful set of deformations, for the "try a variation" button. */
export function randomDeform(rand: () => number, size: number): DeformParams {
  const pick = (chance: number) => rand() < chance;
  return {
    pinch: pick(0.5) ? (rand() - 0.4) * 0.5 : 0,
    ribs: pick(0.5) ? 6 + Math.floor(rand() * 14) : 0,
    ribDepth: size * (0.01 + rand() * 0.025),
    twist: pick(0.5) ? (rand() - 0.5) * 240 : 0,
    sag: pick(0.35) ? size * rand() * 0.12 : 0,
    bend: pick(0.3) ? (rand() - 0.5) * 50 : 0,
    noise: pick(0.4) ? size * (0.005 + rand() * 0.02) : 0,
    noiseScale: size * (0.15 + rand() * 0.25),
    seed: 1 + Math.floor(rand() * 999),
  };
}
