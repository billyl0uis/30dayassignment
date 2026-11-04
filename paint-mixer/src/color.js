// Color math: sRGB <-> linear RGB <-> XYZ (D65) <-> CIELAB, and CIEDE2000.
// Pure functions, no dependencies, so they run in pages, workers and Node.

// D65 reference white, Y normalised to 1 (matches sRGB / IEC 61966-2-1).
export const D65 = [0.95047, 1.0, 1.08883];

// ---- sRGB transfer function ------------------------------------------------

export const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
export const linearToSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

// ---- hex ---------------------------------------------------------------------

/** "#rgb" | "#rrggbb" (with or without #) -> [r,g,b] in 0..255, or null if invalid. */
export function parseHex(hex) {
  if (typeof hex !== 'string') return null;
  let h = hex.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.replace(/./g, (c) => c + c);
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

/** [r,g,b] 0..255 (clipped) -> "#rrggbb" */
export function rgbToHex(rgb) {
  return '#' + rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
}

// ---- linear RGB <-> XYZ (sRGB primaries, D65) -----------------------------------

export function linearRgbToXyz([r, g, b]) {
  return [
    0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
    0.2126729 * r + 0.7151522 * g + 0.072175 * b,
    0.0193339 * r + 0.119192 * g + 0.9503041 * b,
  ];
}

export function xyzToLinearRgb([x, y, z]) {
  return [
    3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
    -0.969266 * x + 1.8760108 * y + 0.041556 * z,
    0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
  ];
}

// ---- XYZ <-> CIELAB -------------------------------------------------------------

const EPS = 216 / 24389; // (6/29)^3
const KAPPA = 24389 / 27;

export function xyzToLab([x, y, z], white = D65) {
  const f = (t) => (t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116);
  const fx = f(x / white[0]);
  const fy = f(y / white[1]);
  const fz = f(z / white[2]);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function labToXyz([L, a, b], white = D65) {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const inv = (t) => (t ** 3 > EPS ? t ** 3 : (116 * t - 16) / KAPPA);
  const yr = L > KAPPA * EPS ? fy ** 3 : L / KAPPA;
  return [inv(fx) * white[0], yr * white[1], inv(fz) * white[2]];
}

// ---- convenience ------------------------------------------------------------------

export const linearRgbToLab = (lrgb) => xyzToLab(linearRgbToXyz(lrgb));

/** [r,g,b] 0..255 -> Lab */
export const rgbToLab = (rgb) => linearRgbToLab(rgb.map((v) => srgbToLinear(v / 255)));

export function hexToLab(hex) {
  const rgb = parseHex(hex);
  if (!rgb) throw new Error(`Invalid hex color: ${hex}`);
  return rgbToLab(rgb);
}

/**
 * Lab -> [r,g,b] 0..255. Colors outside the sRGB gamut are clipped per channel
 * (in linear light). `inGamut` tells the caller whether that happened.
 */
export function labToRgb(lab) {
  const lin = xyzToLinearRgb(labToXyz(lab));
  const inGamut = lin.every((c) => c >= -1e-4 && c <= 1 + 1e-4);
  const rgb = lin.map((c) => linearToSrgb(Math.min(1, Math.max(0, c))) * 255);
  return { rgb, inGamut };
}

export const labToHex = (lab) => rgbToHex(labToRgb(lab).rgb);

/** Lab -> LCh (hue in degrees 0..360) */
export function labToLch([L, a, b]) {
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return [L, Math.hypot(a, b), h];
}

// ---- CIEDE2000 ----------------------------------------------------------------------
// Sharma, Wu & Dalal (2005), "The CIEDE2000 color-difference formula:
// implementation notes, supplementary test data, and mathematical observations".
// kL = kC = kH = 1.

const deg = (r) => (r * 180) / Math.PI;
const rad = (d) => (d * Math.PI) / 180;
const POW25_7 = 25 ** 7;

export function deltaE2000(lab1, lab2) {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;

  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar7 = ((C1 + C2) / 2) ** 7;
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + POW25_7)));

  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);

  const hp = (a, b) => {
    if (a === 0 && b === 0) return 0;
    const h = deg(Math.atan2(b, a));
    return h < 0 ? h + 360 : h;
  };
  const h1p = hp(a1p, b1);
  const h2p = hp(a2p, b2);

  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  let dhp;
  if (C1p * C2p === 0) dhp = 0;
  else if (Math.abs(h2p - h1p) <= 180) dhp = h2p - h1p;
  else if (h2p - h1p > 180) dhp = h2p - h1p - 360;
  else dhp = h2p - h1p + 360;
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp / 2));

  const Lbarp = (L1 + L2) / 2;
  const Cbarp = (C1p + C2p) / 2;

  let hbarp;
  if (C1p * C2p === 0) hbarp = h1p + h2p;
  else if (Math.abs(h1p - h2p) <= 180) hbarp = (h1p + h2p) / 2;
  else if (h1p + h2p < 360) hbarp = (h1p + h2p + 360) / 2;
  else hbarp = (h1p + h2p - 360) / 2;

  const T =
    1 -
    0.17 * Math.cos(rad(hbarp - 30)) +
    0.24 * Math.cos(rad(2 * hbarp)) +
    0.32 * Math.cos(rad(3 * hbarp + 6)) -
    0.2 * Math.cos(rad(4 * hbarp - 63));

  const dTheta = 30 * Math.exp(-(((hbarp - 275) / 25) ** 2));
  const Cbarp7 = Cbarp ** 7;
  const RC = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + POW25_7));
  const SL = 1 + (0.015 * (Lbarp - 50) ** 2) / Math.sqrt(20 + (Lbarp - 50) ** 2);
  const SC = 1 + 0.045 * Cbarp;
  const SH = 1 + 0.015 * Cbarp * T;
  const RT = -Math.sin(rad(2 * dTheta)) * RC;

  return Math.sqrt(
    (dLp / SL) ** 2 + (dCp / SC) ** 2 + (dHp / SH) ** 2 + RT * (dCp / SC) * (dHp / SH)
  );
}
