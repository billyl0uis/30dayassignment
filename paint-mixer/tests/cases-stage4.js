// Stage 4: reference photo sampling, key colors (k-means in Lab), saved targets.

import { extractKeyColors, kmeans, samplePixels } from '../src/keycolors.js';
import { sampleAverage } from '../src/capture.js';
import { rgbToLab, deltaE2000, labToHex, linearRgbToLab } from '../src/color.js';
import * as store from '../src/store.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function makeImage(w, h, fn) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = fn(x, y);
    data.set([r, g, b, 255], (y * w + x) * 4);
  }
  return { width: w, height: h, data };
}

// Six vertical bands with known widths (shares): sky, foliage, earth, skin, shadow, accent.
const BANDS = [
  { rgb: [120, 170, 220], w: 60 },
  { rgb: [60, 110, 50], w: 50 },
  { rgb: [150, 100, 60], w: 40 },
  { rgb: [230, 190, 160], w: 25 },
  { rgb: [35, 35, 50], w: 15 },
  { rgb: [200, 40, 50], w: 10 },
];
const bandImage = (noise = 0, seed = 7) => {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648 - 0.5) * 2 * noise;
  return makeImage(200, 120, (x) => {
    let acc = 0;
    for (const b of BANDS) {
      acc += b.w;
      if (x < acc) return b.rgb.map((v) => Math.max(0, Math.min(255, Math.round(v + rnd()))));
    }
    return BANDS.at(-1).rgb;
  });
};
const bandAt = (x) => {
  let acc = 0;
  for (const b of BANDS) if (x < (acc += b.w)) return b;
  return BANDS.at(-1);
};

export function makeStage4Cases() {
  return [
    {
      group: 'Reference',
      name: 'Sample sizes 1 px, 3×3, 5×5, 9×9 all work; 1 px is the exact pixel',
      run() {
        const img = makeImage(30, 30, (x, y) => [x * 8, y * 8, 100]);
        const one = sampleAverage(img, 12, 7, 1);
        assert(one.rgb.every((v, i) => Math.abs(v - [96, 56, 100][i]) < 0.01), `1px got ${one.rgb.map((v) => v.toFixed(1))}`);
        for (const n of [3, 5, 9]) {
          const s = sampleAverage(img, 15, 15, n);
          assert(Math.abs(s.rgb[2] - 100) < 0.01, `${n}×${n} channel B should stay 100`);
        }
        // A larger box over a gradient averages more: red spread grows with size
        assert(sampleAverage(img, 15, 15, 9).spread > sampleAverage(img, 15, 15, 3).spread, 'spread should grow with sample size');
      },
    },
    {
      group: 'Reference',
      name: 'Key colors: finds all 6 known colors of a test image, biggest first',
      run() {
        const keys = extractKeyColors(bandImage());
        assert(keys.length >= 5 && keys.length <= 8, `${keys.length} key colors`);
        for (const b of BANDS) {
          const lab = rgbToLab(b.rgb);
          const best = Math.min(...keys.map((k) => deltaE2000(k.lab, lab)));
          assert(best < 1, `${labToHex(lab)} missing (closest ΔE ${best.toFixed(2)})`);
        }
        for (let i = 1; i < keys.length; i++) assert(keys[i - 1].share >= keys[i].share, 'not sorted by share');
        const sky = keys.find((k) => deltaE2000(k.lab, rgbToLab(BANDS[0].rgb)) < 1);
        assert(Math.abs(sky.share - 60 / 200) < 0.03, `sky share ${sky.share.toFixed(3)}`);
        return { swatches: keys.map((k) => ({ label: `${Math.round(k.share * 100)}%`, hex: k.hex })), detail: `${keys.length} colors` };
      },
    },
    {
      group: 'Reference',
      name: 'Key colors cope with photo noise and stay within 5–8',
      run() {
        const keys = extractKeyColors(bandImage(18));
        assert(keys.length >= 5 && keys.length <= 8, `${keys.length} key colors`);
        const found = BANDS.filter((b) => keys.some((k) => deltaE2000(k.lab, rgbToLab(b.rgb)) < 3)).length;
        assert(found >= 5, `only ${found}/6 band colors recovered`);
        return { swatches: keys.map((k) => ({ label: `${Math.round(k.share * 100)}%`, hex: k.hex })), detail: `${found}/6 recovered within ΔE 3` };
      },
    },
    {
      group: 'Reference',
      name: 'A smooth gradient (e.g. a sky) keeps its dark and light ends',
      run() {
        const img = makeImage(200, 60, (x) => {
          const t = x / 199;
          return [Math.round(20 + t * 180), Math.round(40 + t * 170), Math.round(90 + t * 150)];
        });
        const keys = extractKeyColors(img);
        assert(keys.length >= 5 && keys.length <= 8, `${keys.length} key colors`);
        const Ls = keys.map((k) => k.lab[0]);
        const range = Math.max(...Ls) - Math.min(...Ls);
        assert(range > 45, `chips only span L ${range.toFixed(0)} of the gradient`);
        return { swatches: [...keys].sort((a, b) => a.lab[0] - b.lab[0]).map((k) => ({ label: `L ${k.lab[0].toFixed(0)}`, hex: k.hex })), detail: `${keys.length} chips spanning L ${Math.min(...Ls).toFixed(0)}–${Math.max(...Ls).toFixed(0)}` };
      },
    },
    {
      group: 'Reference',
      name: 'Each key color points at a real pixel of that color (for its marker)',
      run() {
        const img = bandImage();
        for (const k of extractKeyColors(img)) {
          const pixLab = rgbToLab(bandAt(k.x).rgb);
          assert(deltaE2000(pixLab, k.lab) < 1, `marker for ${k.hex} lands on ${labToHex(pixLab)}`);
          assert(k.x >= 0 && k.x < img.width && k.y >= 0 && k.y < img.height, 'marker outside image');
        }
      },
    },
    {
      group: 'Reference',
      name: 'Same photo → same chips (deterministic); simple photo → no fake duplicates',
      run() {
        const a = extractKeyColors(bandImage(10)).map((k) => k.hex).join();
        const b = extractKeyColors(bandImage(10)).map((k) => k.hex).join();
        assert(a === b, 'results differ between runs');
        const two = extractKeyColors(makeImage(50, 50, (x) => (x < 25 ? [250, 250, 245] : [20, 60, 140])));
        assert(two.length === 2, `two-color image gave ${two.length} chips`);
        const flat = extractKeyColors(makeImage(10, 10, () => [128, 128, 128]));
        assert(flat.length === 1, `flat image gave ${flat.length}`);
      },
    },
    {
      group: 'Reference',
      name: 'k-means handles more clusters than distinct colors',
      run() {
        const pts = samplePixels(makeImage(10, 10, (x) => (x < 5 ? [0, 0, 0] : [255, 255, 255])));
        const cl = kmeans(pts, 8);
        assert(cl.length === 2, `${cl.length} clusters`);
      },
    },
    {
      group: 'Reference',
      name: 'Saved targets keep their photo position; survive export/import',
      run() {
        const s = store.emptyState();
        const ref = store.setReference(s, { name: 'still life.jpg', width: 1600, height: 1200 });
        const lab = linearRgbToLab([0.2, 0.3, 0.1]);
        const t = store.addTarget(s, { lab, hex: labToHex(lab), refId: ref.id, x: 0.25, y: 0.75, sampleSize: 5, source: 'tap' });
        assert(t.refId === ref.id && t.x === 0.25 && t.y === 0.75, 'position lost');
        const h = store.addTarget(s, { lab: [50, 10, 10], hex: '#8a6f69', source: 'hex' });
        assert(h.refId === null && h.x === null, 'hex target should have no marker');
        const back = store.importState(store.exportState(s));
        assert(back.targets.length === 2 && back.targets[0].x === 0.25 && back.reference.id === ref.id && back.reference.name === 'still life.jpg', 'round trip');
        store.removeTarget(back, t.id);
        assert(back.targets.length === 1, 'remove');
        let threw = false;
        try { store.addTarget(s, { lab: [1, 2] }); } catch { threw = true; }
        assert(threw, 'invalid lab accepted');
      },
    },
    {
      group: 'Reference',
      name: 'Bad marker positions are dropped on import (no stray markers)',
      run() {
        const data = { app: 'color-mixer', version: 1, targets: [
          { id: 'a', lab: [50, 0, 0], hex: '#777777', refId: 'r', x: 1.5, y: 0.2 },
          { id: 'b', lab: [50, 0, 0], hex: '#777777', refId: 'r', x: 0.5, y: 0.5 },
          { id: 'c', lab: 'nope' },
        ] };
        const s = store.importState(JSON.stringify(data));
        assert(s.targets.length === 2, `${s.targets.length} targets`);
        assert(s.targets[0].refId === null && s.targets[0].x === null, 'out-of-range position should drop the marker');
        assert(s.targets[1].refId === 'r' && s.targets[1].x === 0.5, 'valid marker kept');
      },
    },
    {
      group: 'Reference',
      name: 'Reference photo storage: kept on device, failure reported not thrown',
      run() {
        const m = new Map();
        const mem = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
        assert(store.saveReferenceImage('data:image/jpeg;base64,AAA', mem).ok, 'save');
        assert(store.loadReferenceImage(mem) === 'data:image/jpeg;base64,AAA', 'load');
        const full = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => {} };
        const r = store.saveReferenceImage('data:x', full);
        assert(!r.ok && /too big/.test(r.error), 'quota error should be reported');
        assert(!store.exportState(store.emptyState()).includes('data:image'), 'export must not include the photo');
      },
    },
  ];
}
