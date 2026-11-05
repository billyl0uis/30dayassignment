// Test cases shared by the Node runner (all.test.js) and the browser page (run.html).
// Each case throws on failure and may return { swatches: [{label, hex}], detail }.
// Paint colors come only from paint-library.json - nothing is invented here.

import { deltaE2000, labToLch, hexToLab, labToHex } from '../src/color.js';
import { predictMix } from '../src/mixer.js';
import { flattenLibrary, usablePaints } from '../src/library.js';
import { solve, compositions, formatParts, deltaELabel, mixingSteps, suggestPaint } from '../src/solver.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// Sharma, Wu & Dalal (2005), Table 1: [L1,a1,b1, L2,a2,b2, ΔE00]
export const SHARMA = [
  [50.0, 2.6772, -79.7751, 50.0, 0.0, -82.7485, 2.0425],
  [50.0, 3.1571, -77.2803, 50.0, 0.0, -82.7485, 2.8615],
  [50.0, 2.8361, -74.02, 50.0, 0.0, -82.7485, 3.4412],
  [50.0, -1.3802, -84.2814, 50.0, 0.0, -82.7485, 1.0],
  [50.0, -1.1848, -84.8006, 50.0, 0.0, -82.7485, 1.0],
  [50.0, -0.9009, -85.5211, 50.0, 0.0, -82.7485, 1.0],
  [50.0, 0.0, 0.0, 50.0, -1.0, 2.0, 2.3669],
  [50.0, -1.0, 2.0, 50.0, 0.0, 0.0, 2.3669],
  [50.0, 2.49, -0.001, 50.0, -2.49, 0.0009, 7.1792],
  [50.0, 2.49, -0.001, 50.0, -2.49, 0.001, 7.1792],
  [50.0, 2.49, -0.001, 50.0, -2.49, 0.0011, 7.2195],
  [50.0, 2.49, -0.001, 50.0, -2.49, 0.0012, 7.2195],
  [50.0, -0.001, 2.49, 50.0, 0.0009, -2.49, 4.8045],
  [50.0, -0.001, 2.49, 50.0, 0.001, -2.49, 4.8045],
  [50.0, -0.001, 2.49, 50.0, 0.0011, -2.49, 4.7461],
  [50.0, 2.5, 0.0, 50.0, 0.0, -2.5, 4.3065],
  [50.0, 2.5, 0.0, 73.0, 25.0, -18.0, 27.1492],
  [50.0, 2.5, 0.0, 61.0, -5.0, 29.0, 22.8977],
  [50.0, 2.5, 0.0, 56.0, -27.0, -3.0, 31.903],
  [50.0, 2.5, 0.0, 58.0, 24.0, 15.0, 19.4535],
  [50.0, 2.5, 0.0, 50.0, 3.1736, 0.5854, 1.0],
  [50.0, 2.5, 0.0, 50.0, 3.2972, 0.0, 1.0],
  [50.0, 2.5, 0.0, 50.0, 1.8634, 0.5757, 1.0],
  [50.0, 2.5, 0.0, 50.0, 3.2592, 0.335, 1.0],
  [60.2574, -34.0099, 36.2677, 60.4626, -34.1751, 39.4387, 1.2644],
  [63.0109, -31.0961, -5.8663, 62.8187, -29.7946, -4.0864, 1.263],
  [61.2901, 3.7196, -5.3901, 61.4292, 2.248, -4.962, 1.8731],
  [35.0831, -44.1164, 3.7933, 35.0232, -40.0716, 1.5901, 1.8645],
  [22.7233, 20.0904, -46.694, 23.0331, 14.973, -42.5619, 2.0373],
  [36.4612, 47.858, 18.3852, 36.2715, 50.5065, 21.2231, 1.4146],
  [90.8027, -2.0831, 1.441, 91.1528, -1.6435, 0.0447, 1.4441],
  [90.9257, -0.5406, -0.9208, 88.6381, -0.8985, -0.7239, 1.5381],
  [6.7747, -0.2908, -2.4247, 5.8714, -0.0985, -2.2286, 0.6377],
  [2.0776, 0.0795, -1.135, 0.9033, -0.0636, -0.5514, 0.9082],
];

export function makeCases(libraryJson) {
  const flat = flattenLibrary(libraryJson);
  const golden = usablePaints(flat);
  const byName = (name) => {
    const p = golden.find((g) => g.name === name);
    assert(p, `Library paint "${name}" not found (or has no color)`);
    return p;
  };
  const sw = (label, hexOrLab) => ({ label, hex: typeof hexOrLab === 'string' ? hexOrLab : labToHex(hexOrLab) });

  return [
    // ---------------- CIEDE2000 ----------------
    {
      group: 'CIEDE2000',
      name: `Sharma et al. (2005): all ${SHARMA.length} test pairs to 4 decimals`,
      run() {
        const bad = [];
        SHARMA.forEach((row, i) => {
          const got = deltaE2000(row.slice(0, 3), row.slice(3, 6));
          if (Math.abs(got - row[6]) > 1e-4) bad.push(`#${i + 1}: expected ${row[6]}, got ${got.toFixed(4)}`);
        });
        assert(bad.length === 0, bad.join('; '));
        return { detail: `${SHARMA.length}/${SHARMA.length} pairs match` };
      },
    },
    {
      group: 'CIEDE2000',
      name: 'Symmetric and zero for identical colors',
      run() {
        for (const r of SHARMA) {
          const a = r.slice(0, 3), b = r.slice(3, 6);
          assert(Math.abs(deltaE2000(a, b) - deltaE2000(b, a)) < 1e-9, 'not symmetric');
          assert(deltaE2000(a, a) === 0, 'non-zero for identical');
        }
      },
    },
    {
      group: 'CIEDE2000',
      name: 'Hex ↔ Lab round trip (white is L=100, a=b=0)',
      run() {
        const w = hexToLab('#ffffff');
        assert(Math.abs(w[0] - 100) < 0.01 && Math.abs(w[1]) < 0.01 && Math.abs(w[2]) < 0.01, `white = ${w}`);
        for (const hex of ['#123456', '#ff8800', '#00ffcc', '#777777']) {
          assert(labToHex(hexToLab(hex)) === hex, `${hex} round trip failed`);
        }
      },
    },

    // ---------------- Mixing (spectral.js) ----------------
    ...[
      ['Phthalo Blue (Green Shade)', 'Cadmium Yellow Light'],
      ['Ultramarine Blue', 'Hansa Yellow Opaque'],
      ['Primary Cyan', 'Primary Yellow'],
    ].map(([blueName, yellowName]) => ({
      group: 'Mixing',
      name: `${blueName} + ${yellowName} (1:1) is green, not gray`,
      run() {
        const blue = byName(blueName), yellow = byName(yellowName);
        const mix = predictMix([blue, yellow], [1, 1]);
        const [, C, h] = labToLch(mix.lab);
        assert(h >= 100 && h <= 200, `hue ${h.toFixed(1)}° is not green (100–200°)`);
        assert(C >= 15, `chroma ${C.toFixed(1)} is too low - that's gray`);
        return {
          swatches: [sw(blueName, blue.lab), sw(yellowName, yellow.lab), sw('mix', mix.hex)],
          detail: `mix LCh = ${mix.lab[0].toFixed(1)}, C ${C.toFixed(1)}, h ${h.toFixed(1)}°`,
        };
      },
    })),
    {
      group: 'Mixing',
      name: 'Plain RGB blue + yellow would be gray - spectral.js must not be',
      run() {
        // Sanity check of the "never average RGB" rule with idealized colors.
        const mix = predictMix([{ name: 'b', lab: hexToLab('#0000ff') }, { name: 'y', lab: hexToLab('#ffff00') }], [1, 1]);
        const [, C, h] = labToLch(mix.lab);
        assert(h >= 100 && h <= 200 && C > 20, `got h ${h.toFixed(1)}, C ${C.toFixed(1)}`);
        return { swatches: [sw('#0000ff', '#0000ff'), sw('#ffff00', '#ffff00'), sw('RGB avg', '#808080'), sw('spectral', mix.hex)] };
      },
    },
    ...['Cadmium Red Medium', 'Pyrrole Red', 'Naphthol Red Light'].map((redName) => ({
      group: 'Mixing',
      name: `Titanium White + ${redName} (1:1) is pink`,
      run() {
        const white = byName('Titanium White'), red = byName(redName);
        const mix = predictMix([white, red], [1, 1]);
        const [Lr, Cr, hr] = labToLch(red.lab);
        const [Lm, Cm, hm] = labToLch(mix.lab);
        assert(Lm > Lr + 10, `mix L ${Lm.toFixed(1)} not clearly lighter than red L ${Lr.toFixed(1)}`);
        assert(Cm > 15, `mix chroma ${Cm.toFixed(1)} too low for pink`);
        const dh = Math.abs(((hm - hr + 540) % 360) - 180);
        assert(dh < 30, `hue drifted ${dh.toFixed(1)}° from the red`);
        assert(hm < 60 || hm > 300, `hue ${hm.toFixed(1)}° is not in the pink/red range`);
        return { swatches: [sw('Titanium White', white.lab), sw(redName, red.lab), sw('mix', mix.hex)], detail: `L ${Lr.toFixed(0)} → ${Lm.toFixed(0)}, hue ${hr.toFixed(0)}° → ${hm.toFixed(0)}°` };
      },
    })),
    {
      group: 'Mixing',
      name: 'Higher tintingStrength pulls the mix toward that paint',
      run() {
        const white = byName('Titanium White'), blue = byName('Phthalo Blue (Green Shade)');
        const weak = predictMix([white, { ...blue, tintingStrength: 1 }], [3, 1]);
        const strong = predictMix([white, { ...blue, tintingStrength: 3 }], [3, 1]);
        assert(strong.lab[0] < weak.lab[0] - 3, `strong ${strong.lab[0].toFixed(1)} vs weak ${weak.lab[0].toFixed(1)}`);
        return { swatches: [sw('ts=1', weak.hex), sw('ts=3', strong.hex)] };
      },
    },

    // ---------------- Solver ----------------
    {
      group: 'Solver',
      name: 'Parts search: only reduced ratios, totals ≤ 12',
      run() {
        const c2 = compositions(2, 12), c3 = compositions(3, 12);
        assert(c2.every((p) => p[0] + p[1] <= 12), 'total > 12');
        assert(!c2.some((p) => p[0] === 2 && p[1] === 2), '2:2 should be skipped');
        assert(c2.some((p) => p[0] === 11 && p[1] === 1), '11:1 missing');
        return { detail: `${c2.length} two-paint and ${c3.length} three-paint ratios` };
      },
    },
    {
      group: 'Solver',
      name: 'Ratio ↔ percent formatting and ΔE labels',
      run() {
        assert(formatParts([3, 1]) === '3:1', formatParts([3, 1]));
        assert(formatParts([3, 1], 'percent') === '75% / 25%', formatParts([3, 1], 'percent'));
        assert(formatParts([1, 1, 1], 'percent') === '34% / 33% / 33%', formatParts([1, 1, 1], 'percent'));
        assert(deltaELabel(1.2) === 'very close' && deltaELabel(3) === 'close' && deltaELabel(7) === 'rough' && deltaELabel(12) === 'out of reach', 'labels');
      },
    },
    {
      group: 'Solver',
      name: 'A paint already in the palette is found exactly (1 paint, ΔE ≈ 0)',
      run() {
        const palette = ['Titanium White', 'Cadmium Red Medium', 'Ultramarine Blue', 'Yellow Ochre', 'Bone Black'].map(byName);
        const target = byName('Yellow Ochre').lab;
        const { best } = solve(target, palette);
        assert(best.paints.length === 1 && best.paints[0].name === 'Yellow Ochre', `got ${best.paints.map((p) => p.name)}`);
        assert(best.deltaE < 0.5, `ΔE ${best.deltaE.toFixed(2)}`);
        return { swatches: [sw('target', target), sw('recipe', best.mixHex)], detail: `ΔE ${best.deltaE.toFixed(2)}` };
      },
    },
    {
      group: 'Solver',
      name: 'Recovers a known 3:1 mix (white + ultramarine)',
      run() {
        const white = byName('Titanium White'), ultra = byName('Ultramarine Blue');
        const palette = [white, ultra, byName('Cadmium Red Medium'), byName('Cadmium Yellow Medium'), byName('Burnt Umber')];
        const target = predictMix([white, ultra], [3, 1]).lab;
        const { best } = solve(target, palette);
        assert(best.deltaE < 0.5, `ΔE ${best.deltaE.toFixed(2)} for ${best.paints.map((p) => p.name)} ${best.ratio}`);
        const names = best.paints.map((p) => p.name).sort().join(' + ');
        assert(names === 'Titanium White + Ultramarine Blue', `got ${names}`);
        assert(best.ratio === '3:1', `ratio ${best.ratio}`);
        return { swatches: [sw('target', target), sw('recipe', best.mixHex)], detail: `${names} ${best.ratio}, ΔE ${best.deltaE.toFixed(2)}` };
      },
    },
    {
      group: 'Solver',
      name: 'Levels: Close only returns ΔE ≤ 5, Broader ≤ 15, Best returns one',
      run() {
        const palette = ['Titanium White', 'Cadmium Red Medium', 'Ultramarine Blue', 'Cadmium Yellow Light', 'Burnt Sienna'].map(byName);
        const target = hexToLab('#8a6f9e'); // a muted violet
        const b = solve(target, palette, { level: 'best' });
        const c = solve(target, palette, { level: 'close' });
        const r = solve(target, palette, { level: 'broader' });
        assert(b.recipes.length === 1, 'best should return 1');
        assert(c.fallback || c.recipes.every((x) => x.deltaE <= 5), 'close > 5');
        assert(r.recipes.every((x) => x.deltaE <= 15), 'broader > 15');
        assert(r.recipes.length >= c.recipes.length, 'broader should include at least as many as close');
        return { swatches: [sw('target', target), ...r.recipes.slice(0, 4).map((x) => sw(`${x.ratio} ΔE${x.deltaE.toFixed(1)}`, x.mixHex))], detail: `best ${b.best.deltaE.toFixed(2)}; close ${c.recipes.length}; broader ${r.recipes.length}` };
      },
    },
    {
      group: 'Solver',
      name: 'Mixing steps start with the most parts; dark/strong paints go last',
      run() {
        const steps = mixingSteps([
          { id: 'a', name: 'Ultramarine Blue', parts: 1, lab: byName('Ultramarine Blue').lab },
          { id: 'b', name: 'Titanium White', parts: 6, lab: byName('Titanium White').lab },
          { id: 'c', name: 'Cadmium Yellow Light', parts: 2, lab: byName('Cadmium Yellow Light').lab, tintingStrength: 2 },
        ]);
        assert(steps[0].name === 'Titanium White', 'should start with white');
        assert(steps.find((s) => s.name === 'Cadmium Yellow Light').tinyAmounts, 'strong paint should be flagged');
        assert(/little at a time/.test(steps.find((s) => s.name === 'Ultramarine Blue').text), 'dark paint should be added gradually');
        return { detail: steps.map((s) => s.text).join(' ') };
      },
    },
    {
      group: 'Solver',
      name: '"Suggest a paint" names the missing paint',
      run() {
        // Palette with no green-capable blue; target is Permanent Green Light itself.
        const palette = ['Titanium White', 'Cadmium Red Medium', 'Burnt Umber', 'Yellow Ochre'].map(byName);
        const target = byName('Permanent Green Light').lab;
        const res = solve(target, palette, { suggestFrom: golden });
        assert(res.best.deltaE > 5, `palette already reaches ΔE ${res.best.deltaE.toFixed(1)}`);
        assert(res.suggestion, 'no suggestion');
        assert(res.suggestion.deltaE < res.best.deltaE, 'suggestion should improve ΔE');
        return { swatches: [sw('target', target), sw('palette best', res.best.mixHex), sw(`+ ${res.suggestion.paint.name}`, res.suggestion.recipe.mixHex)], detail: `palette ΔE ${res.best.deltaE.toFixed(1)} → add ${res.suggestion.paint.name}: ΔE ${res.suggestion.deltaE.toFixed(1)}` };
      },
    },
    {
      group: 'Solver',
      name: 'Performance: 30-paint palette, 1–3 paint search',
      run() {
        const palette = golden.slice(0, 30);
        const t0 = Date.now();
        const res = solve(hexToLab('#5a7d6a'), palette);
        const ms = Date.now() - t0;
        return { swatches: [sw('target', '#5a7d6a'), sw(res.best.ratio, res.best.mixHex)], detail: `${res.combosSearched} combos in ${ms} ms; best: ${res.best.paints.map((p) => p.name).join(' + ')} ${res.best.ratio}, ΔE ${res.best.deltaE.toFixed(2)}` };
      },
    },
  ];
}
