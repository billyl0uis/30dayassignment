// Thin wrapper around spectral.js (Kubelka-Munk pigment mixing).
// Every mix prediction in the app goes through spectral.mix - never RGB averaging.

import * as spectral from '../vendor/spectral.js';
import { labToRgb, linearRgbToLab, rgbToHex, hexToLab } from './color.js';

/**
 * A "mix paint" is the minimal shape the engine needs:
 *   { id, name, lab: [L,a,b], tintingStrength?: number }
 * Library/palette code (stage 2) is responsible for producing these.
 */

/** Build the spectral.Color for a paint (call once per paint, not per mix). */
export function paintToColor(paint) {
  if (!paint || !Array.isArray(paint.lab)) {
    throw new Error(`Paint "${paint?.name ?? '?'}" has no color yet - add a swatch first.`);
  }
  // spectral.js reconstructs a reflectance curve from an sRGB color, so a Lab
  // value outside sRGB is clipped first. Very saturated pigments (e.g. some
  // phthalos, cadmiums) can sit just outside sRGB; the clip is small.
  const { rgb } = labToRgb(paint.lab);
  const color = new spectral.Color(rgb);
  color.tintingStrength = paint.tintingStrength ?? 1;
  return color;
}

/** Color from a hex string (used for targets and quick tests). */
export function hexToColor(hex) {
  return new spectral.Color(hex);
}

/** Lab of a spectral.Color, through the same sRGB/D65 pipeline as everything else. */
export function colorToLab(color) {
  return linearRgbToLab(color.lRGB);
}

/** Display hex of a spectral.Color (gamut-mapped by spectral.js). */
export function colorToHex(color) {
  return color.toString();
}

/**
 * Mix colors by integer (or any positive) parts.
 * @param {spectral.Color[]} colors
 * @param {number[]} parts same length as colors
 */
export function mixParts(colors, parts) {
  if (colors.length !== parts.length) throw new Error('colors and parts length mismatch');
  if (colors.length === 1) return colors[0];
  return spectral.mix(...colors.map((c, i) => [c, parts[i]]));
}

/** Convenience: mix paints and return { lab, hex }. */
export function predictMix(paints, parts) {
  const mixed = mixParts(paints.map(paintToColor), parts);
  return { lab: colorToLab(mixed), hex: colorToHex(mixed) };
}

export { hexToLab, rgbToHex };
