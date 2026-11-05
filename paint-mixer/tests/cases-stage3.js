// Stage 3: swatch capture, white balance, tinting-strength fit, measured colors.
// "Photos" here are synthetic ImageData-like objects with a known color cast.

import { sampleAverage, whiteBalance, measureLab, paperProblems, swatchProblems, fitTintingStrength, PAPER_REFLECTANCE } from '../src/capture.js';
import { deltaE2000, labToXyz, xyzToLinearRgb, linearToSrgb, labToHex } from '../src/color.js';
import { predictMix } from '../src/mixer.js';
import { flattenLibrary, usablePaints } from '../src/library.js';
import { solve } from '../src/solver.js';
import * as store from '../src/store.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/** w x h image filled by fn(x, y) -> [r,g,b] 0..255 */
function makeImage(w, h, fn) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = fn(x, y);
    data.set([r, g, b, 255], (y * w + x) * 4);
  }
  return { width: w, height: h, data };
}

const labToLinear = (lab) => xyzToLinearRgb(labToXyz(lab)).map((c) => Math.min(1, Math.max(0, c)));
const encode = (lin) => lin.map((c) => Math.round(linearToSrgb(Math.min(1, Math.max(0, c))) * 255));

// A warm, dim light: red boosted, blue cut, 75% exposure.
const CAST = [1.12, 1.0, 0.78];
const EXPOSURE = 0.75;
const underLight = (lin) => lin.map((c, i) => c * CAST[i] * EXPOSURE);
const PAPER_LIN = underLight([PAPER_REFLECTANCE, PAPER_REFLECTANCE, PAPER_REFLECTANCE]);

export function makeStage3Cases(libraryJson) {
  const flat = flattenLibrary(libraryJson);
  const golden = usablePaints(flat);
  const byName = (n) => golden.find((p) => p.name === n);
  const sw = (label, lab) => ({ label, hex: labToHex(lab) });

  return [
    // ---------------- Sampling ----------------
    {
      group: 'Capture',
      name: '9×9 sample of a flat patch returns that color; edges are clamped',
      run() {
        const img = makeImage(40, 30, () => [200, 120, 40]);
        const s = sampleAverage(img, 20, 15);
        assert(s.rgb.every((v, i) => Math.abs(v - [200, 120, 40][i]) < 0.01), `got ${s.rgb}`);
        assert(s.spread === 0 && !s.clipped, 'flat patch should have no spread');
        const corner = sampleAverage(img, 0, 0);
        assert(Math.abs(corner.rgb[0] - 200) < 0.01, 'corner sample failed');
      },
    },
    {
      group: 'Capture',
      name: 'Averaging is done in linear light (a black/white checker is not #808080)',
      run() {
        const img = makeImage(20, 20, (x, y) => ((x + y) % 2 ? [255, 255, 255] : [0, 0, 0]));
        const s = sampleAverage(img, 10, 10);
        // 41 white / 40 black of 81 -> linear ≈ 0.506 -> sRGB ≈ 188
        assert(s.rgb[0] > 180 && s.rgb[0] < 195, `got ${s.rgb[0].toFixed(1)}`);
        assert(s.clipped, 'pure white pixels should flag clipping');
        assert(s.spread > 100, 'checker should have a large spread');
        return { detail: `checker average ${s.rgb[0].toFixed(0)} (gamma-space average would be 128)` };
      },
    },

    // ---------------- White balance ----------------
    {
      group: 'Capture',
      name: 'White balance: the paper itself comes out neutral at L≈96',
      run() {
        const lab = measureLab(PAPER_LIN, PAPER_LIN);
        assert(Math.abs(lab[1]) < 0.5 && Math.abs(lab[2]) < 0.5, `paper not neutral: ${lab.map((v) => v.toFixed(2))}`);
        assert(Math.abs(lab[0] - 96) < 1, `paper L ${lab[0].toFixed(1)}`);
      },
    },
    {
      group: 'Capture',
      name: 'White balance removes a warm, dim light cast (Golden colors, ΔE < 0.5)',
      run() {
        const names = ['Ultramarine Blue', 'Cadmium Yellow Light', 'Burnt Sienna', 'Permanent Green Light', 'Quinacridone Magenta'];
        const rows = names.map((n) => {
          const truth = byName(n).lab;
          const truthClipped = measureLab(labToLinear(truth), [PAPER_REFLECTANCE, PAPER_REFLECTANCE, PAPER_REFLECTANCE]);
          const photographed = underLight(labToLinear(truth));
          const raw = measureLab(photographed, [PAPER_REFLECTANCE, PAPER_REFLECTANCE, PAPER_REFLECTANCE]); // no correction
          const got = measureLab(photographed, PAPER_LIN);
          return { n, truthClipped, raw, got, dE: deltaE2000(truthClipped, got), dERaw: deltaE2000(truthClipped, raw) };
        });
        const bad = rows.filter((r) => r.dE >= 0.5);
        assert(bad.length === 0, bad.map((r) => `${r.n}: ΔE ${r.dE.toFixed(2)}`).join('; '));
        return {
          swatches: rows.flatMap((r) => [sw(`${r.n.split(' ')[0]} under light`, r.raw), sw('corrected', r.got)]),
          detail: rows.map((r) => `${r.n}: uncorrected ΔE ${r.dERaw.toFixed(1)} → ${r.dE.toFixed(2)}`).join(' · '),
        };
      },
    },
    {
      group: 'Capture',
      name: 'Full pipeline: 8-bit photo → tap paper → tap swatch → measured color',
      run() {
        const truth = byName('Burnt Sienna').lab;
        const paperPx = encode(PAPER_LIN);
        const swatchPx = encode(underLight(labToLinear(truth)));
        // left half paper, right half swatch
        const img = makeImage(60, 30, (x) => (x < 30 ? paperPx : swatchPx));
        const paper = sampleAverage(img, 10, 15);
        const swatch = sampleAverage(img, 45, 15);
        assert(paperProblems(paper).length === 0, `paper flagged: ${paperProblems(paper)}`);
        const lab = measureLab(swatch.linear, paper.linear);
        const target = measureLab(labToLinear(truth), [PAPER_REFLECTANCE, PAPER_REFLECTANCE, PAPER_REFLECTANCE]);
        const dE = deltaE2000(lab, target);
        assert(dE < 1, `ΔE ${dE.toFixed(2)} after 8-bit quantization`);
        return { swatches: [sw('true', target), sw('measured', lab)], detail: `ΔE ${dE.toFixed(2)}` };
      },
    },
    {
      group: 'Capture',
      name: 'Warns about overexposed, colored, dark or uneven "paper"',
      run() {
        const flatImg = (rgb) => makeImage(20, 20, () => rgb);
        assert(paperProblems(sampleAverage(flatImg(encode(PAPER_LIN)), 10, 10)).length === 0, 'good paper flagged');
        assert(paperProblems(sampleAverage(flatImg([255, 255, 255]), 10, 10)).some((p) => /overexposed/.test(p)), 'clipping not flagged');
        assert(paperProblems(sampleAverage(flatImg([200, 40, 40]), 10, 10)).some((p) => /colored/.test(p)), 'red not flagged');
        assert(paperProblems(sampleAverage(flatImg([40, 40, 40]), 10, 10)).some((p) => /dark/.test(p)), 'dark not flagged');
        const edge = makeImage(20, 20, (x) => (x < 10 ? [230, 230, 230] : [60, 60, 60]));
        assert(swatchProblems(sampleAverage(edge, 10, 10)).some((p) => /uneven/.test(p)), 'edge not flagged');
      },
    },

    // ---------------- Tinting strength ----------------
    ...[0.4, 1, 2.5, 6].map((ts) => ({
      group: 'Capture',
      name: `Fits tinting strength ${ts} from a 1:1 tint with Titanium White`,
      run() {
        const white = byName('Titanium White');
        const blue = byName('Phthalo Blue (Green Shade)');
        const tint = predictMix([white, { ...blue, tintingStrength: ts }], [1, 1]).lab;
        const fit = fitTintingStrength(blue.lab, white, tint);
        assert(Math.abs(fit.tintingStrength - ts) / ts < 0.03, `fitted ${fit.tintingStrength}`);
        assert(fit.deltaE < 0.2, `residual ΔE ${fit.deltaE.toFixed(2)}`);
        return { swatches: [sw('paint', blue.lab), sw(`tint @ ${ts}`, tint)], detail: `fitted ${fit.tintingStrength}, residual ΔE ${fit.deltaE.toFixed(3)}` };
      },
    })),

    // ---------------- Measured colors in the store ----------------
    {
      group: 'Capture',
      name: 'Saving a measurement: status measured, overrides manufacturer data, survives export',
      run() {
        const s = store.emptyState();
        const g = byName('Ultramarine Blue');
        store.setMeasuredColor(s, g.id, { lab: [21, 16, -42], tintLab: [60, 2, -30], whitePaintId: byName('Titanium White').id, tintingStrength: 1.7, fitDeltaE: 0.8, junk: 'x' });
        let r = store.resolvePaints(flat, s).find((p) => p.id === g.id);
        assert(r.status === 'measured' && r.lab[0] === 21 && r.tintingStrength === 1.7, 'not applied');
        const back = store.importState(store.exportState(s));
        assert(back.paintSettings[g.id].color.tintLab[0] === 60 && !('junk' in back.paintSettings[g.id].color), 'export/import');
        store.clearMeasuredColor(s, g.id);
        r = store.resolvePaints(flat, s).find((p) => p.id === g.id);
        assert(r.status === 'manufacturer_lab' && r.tintingStrength === 1.7, 'clear should keep tinting strength, restore manufacturer color');
        let threw = false;
        try { store.setMeasuredColor(s, g.id, { lab: [1, 2] }); } catch { threw = true; }
        assert(threw, 'invalid lab accepted');
      },
    },
    {
      group: 'Capture',
      name: 'A "needs swatch" paint becomes usable in the solver once measured',
      run() {
        const s = store.emptyState();
        const gam = flat.find((p) => p.brand === 'Gamblin' && p.name === 'Ivory Black');
        assert(!gam.lab, 'expected needs_swatch');
        store.setMeasuredColor(s, gam.id, { lab: [22, 0.5, -1] });
        const resolved = store.resolvePaints(flat, s);
        const palette = usablePaints(resolved).filter((p) => p.id === gam.id || p.name === 'Titanium White');
        assert(palette.some((p) => p.id === gam.id), 'measured paint not usable');
        const { best } = solve([50, 0, 0], palette);
        assert(best.paints.some((p) => p.id === gam.id), 'solver did not use the measured black for a gray');
        return { detail: `gray recipe: ${best.paints.map((p) => `${p.brand} ${p.name}`).join(' + ')} ${best.ratio}, ΔE ${best.deltaE.toFixed(2)}` };
      },
    },
  ];
}
