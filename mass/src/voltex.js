// Packs the volume into two RGBA8 3-D textures for the glass shader:
//   A: rgb = sqrt(σ / SIGMA_MAX) per channel (absorption per cm; sqrt keeps
//      precision for nearly-clear glass), a = how much of the voxel is glass
//   B: rgb = opaque colour (linear), a = 1 where the glass is opaque colour
// The shader marches each eye ray through these until it has crossed exactly
// the measured thickness, summing σ·ds — so colour lives where it really is.

import * as THREE from 'three';
import { COLORS } from './colors.js';
import { sigmaFromTint } from './glass.js';

export const SIGMA_MAX = 8; // cm⁻¹

export function createVolumeTextures(n) {
  const make = () => {
    const t = new THREE.Data3DTexture(new Uint8Array(n * n * n * 4), n, n, n);
    t.format = THREE.RGBAFormat;
    t.type = THREE.UnsignedByteType;
    t.minFilter = t.magFilter = THREE.LinearFilter;
    t.unpackAlignment = 1;
    t.needsUpdate = true;
    return t;
  };
  return { n, a: make(), b: make() };
}

// baseSigma: THREE.Vector3 for the base (palette 0) glass.
export function fillVolumeTextures(tex, vol, baseSigma) {
  const { sdf, color, h } = vol;
  const A = tex.a.image.data, B = tex.b.image.data;
  const enc = (s) => Math.round(255 * Math.sqrt(Math.min(1, Math.max(0, s / SIGMA_MAX))));
  // palette → encoded rows
  const pal = [{ s: [enc(baseSigma.x), enc(baseSigma.y), enc(baseSigma.z)], o: null }];
  const tmp = new THREE.Vector3(), col = new THREE.Color();
  for (const key of vol.meta.palette) {
    const c = COLORS[key];
    if (c?.kind === 'opaque') {
      col.set(c.color);
      pal.push({ s: [0, 0, 0], o: [col.r * 255, col.g * 255, col.b * 255] });
    } else if (c?.kind === 'transparent') {
      sigmaFromTint(c.tint, c.strength, tmp);
      pal.push({ s: [enc(tmp.x), enc(tmp.y), enc(tmp.z)], o: null });
    } else pal.push(pal[0]);
  }
  for (let i = 0, p = 0; i < sdf.length; i++, p += 4) {
    const e = pal[color[i]] || pal[0];
    let f = 0.5 - sdf[i] / h; f = f <= 0 ? 0 : f >= 1 ? 1 : f;
    A[p] = e.s[0]; A[p + 1] = e.s[1]; A[p + 2] = e.s[2]; A[p + 3] = f * 255;
    if (e.o) { B[p] = e.o[0]; B[p + 1] = e.o[1]; B[p + 2] = e.o[2]; B[p + 3] = 255; }
    else { B[p] = B[p + 1] = B[p + 2] = B[p + 3] = 0; }
  }
  tex.a.needsUpdate = true;
  tex.b.needsUpdate = true;
}
