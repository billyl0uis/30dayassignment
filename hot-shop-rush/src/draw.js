// Drawing helpers: palette, chunky outlined shapes, hot glass, characters, canvas buttons.

export const W = 960;
export const H = 600;

export const PAL = {
  soot: '#2B1E1A',
  brick: '#B5563A',
  brickShadow: '#7E3627',
  wood: '#8A5A3B',
  sawdust: '#D9B48C',
  steel: '#7D8B93',
  steelHi: '#C9D3D8',
  glory: '#FFD45C',
  hotOrange: '#FF8A1F',
  ember: '#E2431B',
  dusk: '#9A3B4A',
  clear: '#BFE6EF',
  frost: '#8FC7E8',
  paper: '#F6ECD7',
  green: '#4FA65A',
  amber: '#F2A03D',
  red: '#C8323A',
  dawn: '#A9C4E0',
  floor: '#5E3F2C',
};

const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (a, b, t) => a.map((v, i) => Math.round(lerp(v, b[i], t)));
const clamp01 = (t) => Math.max(0, Math.min(1, t));
export const rgbStr = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

const HOT_STOPS = [
  [100, hexToRgb(PAL.glory)],
  [85, hexToRgb(PAL.hotOrange)],
  [70, hexToRgb(PAL.ember)],
  [50, hexToRgb(PAL.dusk)],
];

// Heat → color. Below ~75 the frit (or clear) color shows through progressively.
export function glassRgb(heat, fritRgb) {
  let hot = HOT_STOPS[HOT_STOPS.length - 1][1];
  for (let i = 1; i < HOT_STOPS.length; i++) {
    const [h0, c0] = HOT_STOPS[i - 1];
    const [h1, c1] = HOT_STOPS[i];
    if (heat >= h1) { hot = mix(c1, c0, (heat - h1) / (h0 - h1)); break; }
  }
  if (heat >= 100) hot = HOT_STOPS[0][1];
  const cold = fritRgb || hexToRgb(PAL.clear);
  return mix(hot, cold, clamp01((75 - heat) / 45));
}

export function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

export function box(g, x, y, w, h, fill, r = 10, lw = 3) {
  rr(g, x, y, w, h, r);
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = lw;
  g.strokeStyle = PAL.soot;
  g.stroke();
}

export function text(g, str, x, y, { size = 16, color = PAL.soot, align = 'left', weight = 700, baseline = 'alphabetic' } = {}) {
  g.font = `${weight} ${size}px "Baloo 2", "Trebuchet MS", system-ui, sans-serif`;
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = baseline;
  g.fillText(str, x, y);
}

export function glow(g, x, y, r, heat) {
  const a = clamp01((heat - 35) / 60) * 0.75;
  if (a <= 0) return;
  g.save();
  g.globalCompositeOperation = 'lighter';
  const grd = g.createRadialGradient(x, y, r * 0.2, x, y, r);
  grd.addColorStop(0, `rgba(255,170,60,${a})`);
  grd.addColorStop(1, 'rgba(255,120,30,0)');
  g.fillStyle = grd;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

export function backdrop(g, light = 1) {
  g.fillStyle = PAL.brick;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = PAL.brickShadow;
  g.lineWidth = 2;
  for (let y = 0; y < H * 0.62; y += 26) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
    const off = (y / 26) % 2 ? 0 : 30;
    for (let x = off; x < W; x += 60) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 26); g.stroke(); }
  }
  g.fillStyle = PAL.floor;
  g.fillRect(0, H * 0.62, W, H * 0.38);
  g.fillStyle = 'rgba(0,0,0,0.12)';
  for (let x = 0; x < W; x += 80) g.fillRect(x, H * 0.62, 3, H * 0.38);
  if (light < 1) { g.fillStyle = `rgba(20,30,60,${1 - light})`; g.fillRect(0, 0, W, H); }
}

export function pipe(g, x1, y, x2, color = PAL.steel) {
  g.lineCap = 'round';
  g.strokeStyle = PAL.soot;
  g.lineWidth = 11;
  g.beginPath(); g.moveTo(x1, y); g.lineTo(x2, y); g.stroke();
  g.strokeStyle = color;
  g.lineWidth = 6;
  g.beginPath(); g.moveTo(x1, y); g.lineTo(x2, y); g.stroke();
  g.strokeStyle = PAL.steelHi;
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(x1, y - 1.5); g.lineTo(x2, y - 1.5); g.stroke();
}

/**
 * Draw a piece in profile. Attachment end is at (x, y) and the piece extends in `dir` (+1 right, -1 left).
 * s = { R, L, cone, neck, flat, open, heat, fritRgb, off, phase, coverage, lipHeat }
 */
export function pieceProfile(g, x, y, dir, s) {
  const N = 40;
  const pipeR = 6;
  const wob = Math.sin(s.phase || 0) * (s.off || 0) * 0.25;
  const top = [], bot = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    let r = s.R * (1 - (s.cone || 0) * 0.55 * u);
    const shoulder = smooth(0, 0.2, u);
    const r0 = lerp(pipeR, s.R * 0.92, s.open || 0);
    r = lerp(r0, r, s.open ? Math.max(shoulder, s.open) : shoulder);
    const neck = (s.neck || 0) * (1 - (s.open || 0));
    r *= 1 - neck * 0.55 * Math.exp(-(((u - 0.1) / 0.06) ** 2));
    if (s.flat > 0.5) {
      if (u > 0.93) r *= lerp(1, 0.8, (u - 0.93) / 0.07);
    } else if (u > 0.7) {
      r *= Math.sqrt(Math.max(0, 1 - ((u - 0.7) / 0.3) ** 2));
    }
    const px = x + dir * u * s.L;
    const py = y + wob * u;
    top.push([px, py - r]);
    bot.push([px, py + r]);
  }
  const cx = x + dir * s.L * 0.5;
  glow(g, cx, y, Math.max(s.R, s.L * 0.6) * 1.6, s.heat);

  g.beginPath();
  g.moveTo(...top[0]);
  for (const p of top) g.lineTo(...p);
  for (let i = bot.length - 1; i >= 0; i--) g.lineTo(...bot[i]);
  g.closePath();
  const col = glassRgb(s.heat, s.coverage > 0.05 ? s.fritRgb : null);
  const grd = g.createLinearGradient(cx, y - s.R, cx, y + s.R);
  grd.addColorStop(0, rgbStr(mix(col, [255, 255, 255], 0.35)));
  grd.addColorStop(0.45, rgbStr(col));
  grd.addColorStop(1, rgbStr(mix(col, [40, 10, 10], 0.25)));
  g.fillStyle = grd;
  g.fill();

  // Turning highlights, so the piece reads as rotating.
  g.save();
  g.clip();
  g.strokeStyle = 'rgba(255,255,255,0.28)';
  g.lineWidth = 3;
  for (let k = 0; k < 3; k++) {
    const yy = y - s.R + ((((s.phase || 0) * 18 + k * (s.R * 0.66)) % (s.R * 2)) + s.R * 2) % (s.R * 2);
    g.beginPath(); g.moveTo(x, yy); g.lineTo(x + dir * s.L, yy + wob); g.stroke();
  }
  if (s.coverage > 0.02 && s.coverage < 1 && s.fritRgb && s.heat > 74) {
    g.fillStyle = rgbStr(s.fritRgb, 0.9);
    for (let k = 0; k < 40 * s.coverage; k++) {
      const u = ((k * 0.618) % 1);
      const v = ((k * 0.377 + (s.phase || 0) * 0.05) % 1) * 2 - 1;
      g.fillRect(x + dir * u * s.L, y + v * s.R * 0.8, 3, 3);
    }
  }
  g.restore();

  g.lineWidth = 3;
  g.strokeStyle = PAL.soot;
  g.beginPath();
  g.moveTo(...top[0]);
  for (const p of top) g.lineTo(...p);
  for (let i = bot.length - 1; i >= 0; i--) g.lineTo(...bot[i]);
  g.closePath();
  g.stroke();

  if (s.open > 0.05) {
    const r0 = lerp(pipeR, s.R * 0.92, s.open);
    g.beginPath();
    g.ellipse(x, y, Math.max(2, r0 * 0.28), r0 * 0.92, 0, 0, Math.PI * 2);
    g.fillStyle = rgbStr(mix(glassRgb(s.lipHeat ?? s.heat, s.fritRgb), [30, 10, 10], 0.45));
    g.fill();
    g.stroke();
  }
  return { top, bot };
}

function smooth(a, b, t) {
  const x = clamp01((t - a) / (b - a));
  return x * x * (3 - 2 * x);
}

export function customer(g, x, y, look, { scale = 1, mood = 'neutral', bob = 0 } = {}) {
  g.save();
  g.translate(x, y + Math.sin(bob) * 2);
  g.scale(scale, scale);
  g.lineWidth = 3;
  g.strokeStyle = PAL.soot;
  // Body.
  rr(g, -36, 20, 72, 90, 26);
  g.fillStyle = look.shirt; g.fill(); g.stroke();
  // Head.
  g.beginPath(); g.arc(0, -18, 40, 0, Math.PI * 2);
  g.fillStyle = look.skin; g.fill(); g.stroke();
  // Hair.
  g.fillStyle = look.hair;
  g.beginPath();
  if (look.hairStyle === 0) g.arc(0, -30, 38, Math.PI * 1.05, Math.PI * 1.95);
  else if (look.hairStyle === 1) { g.arc(0, -26, 41, Math.PI, Math.PI * 2); g.lineTo(41, -10); g.lineTo(-41, -10); }
  else { g.arc(-14, -52, 16, 0, Math.PI * 2); g.moveTo(30, -48); g.arc(14, -52, 16, 0, Math.PI * 2); }
  g.closePath(); g.fill(); g.stroke();
  // Eyes.
  g.fillStyle = PAL.soot;
  g.beginPath(); g.arc(-14, -16, 4.5, 0, Math.PI * 2); g.arc(14, -16, 4.5, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(-12.5, -17.5, 1.5, 0, Math.PI * 2); g.arc(15.5, -17.5, 1.5, 0, Math.PI * 2); g.fill();
  // Mouth.
  g.beginPath();
  if (mood === 'happy') g.arc(0, -4, 10, 0.15 * Math.PI, 0.85 * Math.PI);
  else if (mood === 'sad') g.arc(0, 8, 9, 1.2 * Math.PI, 1.8 * Math.PI);
  else { g.moveTo(-7, 2); g.lineTo(7, 2); }
  g.stroke();
  g.restore();
}

export function juno(g, x, y, bob = 0) {
  customer(g, x, y, { skin: '#C68E64', hair: '#3B3F66', shirt: '#7D8B93', hairStyle: 2 }, { scale: 0.8, mood: 'happy', bob });
  g.save();
  g.translate(x, y + Math.sin(bob) * 2);
  g.scale(0.8, 0.8);
  // Safety glasses pushed up.
  g.lineWidth = 3; g.strokeStyle = PAL.soot; g.fillStyle = 'rgba(180,220,255,0.7)';
  rr(g, -30, -50, 26, 14, 6); g.fill(); g.stroke();
  rr(g, 4, -50, 26, 14, 6); g.fill(); g.stroke();
  g.restore();
}

// Canvas buttons: stations push these each frame; main.js hit-tests them first.
export function button(g, b) {
  const enabled = b.enabled !== false;
  g.save();
  g.globalAlpha = enabled ? 1 : 0.45;
  box(g, b.x, b.y + 4, b.w, b.h, 'rgba(0,0,0,0.25)', 12, 0);
  box(g, b.x, b.y, b.w, b.h, b.color || PAL.paper, 12, 3);
  text(g, b.label, b.x + b.w / 2, b.y + b.h / 2 + 1, { size: b.size || 18, align: 'center', baseline: 'middle', color: b.textColor || PAL.soot });
  g.restore();
}

export function gaugeV(g, x, y, w, h, value, band, { color = PAL.hotOrange, label } = {}) {
  box(g, x, y, w, h, '#3a2a24', 8);
  if (band) {
    g.fillStyle = 'rgba(79,166,90,0.75)';
    g.fillRect(x + 3, y + h - band[1] * h, w - 6, (band[1] - band[0]) * h);
  }
  const v = clamp01(value);
  g.fillStyle = color;
  g.fillRect(x + 6, y + h - v * h, w - 12, v * h);
  g.strokeStyle = '#fff';
  g.lineWidth = 3;
  g.beginPath(); g.moveTo(x - 6, y + h - v * h); g.lineTo(x + w + 6, y + h - v * h); g.stroke();
  if (label) text(g, label, x + w / 2, y - 10, { size: 14, align: 'center', color: PAL.paper });
}

export function gaugeH(g, x, y, w, h, value, band, { color = PAL.hotOrange, label, max = 1 } = {}) {
  box(g, x, y, w, h, '#3a2a24', 8);
  if (band) {
    g.fillStyle = 'rgba(79,166,90,0.75)';
    g.fillRect(x + (band[0] / max) * w, y + 3, ((band[1] - band[0]) / max) * w, h - 6);
  }
  const v = clamp01(value / max);
  g.fillStyle = color;
  g.fillRect(x + 4, y + 6, Math.max(0, v * w - 8), h - 12);
  g.strokeStyle = '#fff';
  g.lineWidth = 3;
  g.beginPath(); g.moveTo(x + v * w, y - 5); g.lineTo(x + v * w, y + h + 5); g.stroke();
  if (label) text(g, label, x, y - 8, { size: 14, color: PAL.paper });
}

export function steam(g, x, y, t, n = 5) {
  g.save();
  for (let i = 0; i < n; i++) {
    const k = (t * 1.5 + i / n) % 1;
    g.globalAlpha = (1 - k) * 0.6;
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(x + Math.sin(i * 2.3 + t * 3) * 10, y - k * 60, 8 + k * 14, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

export function banner(g, msg, color = PAL.paper) {
  box(g, W / 2 - 300, 14, 600, 40, 'rgba(43,30,26,0.82)', 12, 0);
  text(g, msg, W / 2, 41, { size: 19, align: 'center', color });
}
