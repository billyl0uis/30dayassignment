import { CLEAR_RGB, COLORS, COOL } from '../config';
import { smoothstep, type ColorId } from '../sim/piece';

export type RGB = [number, number, number];

// Incandescence: dull red → orange → yellow-white.
const STOPS: [number, RGB][] = [
  [COOL.glowStartF, [80, 10, 4]],
  [1200, [165, 32, 8]],
  [1500, [232, 86, 14]],
  [1800, [255, 148, 38]],
  [2100, [255, 208, 110]],
  [2350, [255, 246, 220]],
];

export function heatRGB(T: number): RGB {
  if (T <= STOPS[0][0]) return STOPS[0][1];
  for (let i = 1; i < STOPS.length; i++) {
    const [t1, c1] = STOPS[i];
    if (T <= t1) {
      const [t0, c0] = STOPS[i - 1];
      const k = (T - t0) / (t1 - t0);
      return [0, 1, 2].map((j) => c0[j] + (c1[j] - c0[j]) * k) as RGB;
    }
  }
  return STOPS[STOPS.length - 1][1];
}

/** How much the glow covers the glass's own color: 0 cold, 1 fully hidden. */
export const glowAmount = (T: number) => smoothstep((T - COOL.glowStartF) / 380);

export const glassRGB = (c: ColorId | null): RGB => (c ? COLORS[c].rgb : CLEAR_RGB);

/** Opal is opaque; everything else lets light through. */
export const glassAlpha = (c: ColorId | null) => (c === 'opal' ? 0.95 : c ? 0.82 : 0.32);

export const rgba = ([r, g, b]: RGB, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;
export const mix = (a: RGB, b: RGB, k: number): RGB => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * k) as RGB;
