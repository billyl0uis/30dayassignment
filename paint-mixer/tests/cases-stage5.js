// Stage 5: check my mix — plain directions and "add 1 part of X" suggestions.

import { mixDirections, suggestAddition, defaultMixParts, hueName } from '../src/check.js';
import { predictMix } from '../src/mixer.js';
import { labToHex, deltaE2000 } from '../src/color.js';
import { flattenLibrary, usablePaints } from '../src/library.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
const lch = (L, C, h) => [L, C * Math.cos((h * Math.PI) / 180), C * Math.sin((h * Math.PI) / 180)];
const kinds = (r) => r.directions.map((d) => d.kind);
const texts = (r) => r.directions.map((d) => d.text).join('; ');

export function makeStage5Cases(libraryJson) {
  const golden = usablePaints(flattenLibrary(libraryJson));
  const by = (n) => golden.find((p) => p.name === n);
  const red = by('Cadmium Red Medium'), white = by('Titanium White'), blue = by('Ultramarine Blue'), yellow = by('Cadmium Yellow Medium');
  const recipe = { paints: [red, white], parts: [2, 1] };

  return [
    {
      group: 'Check my mix',
      name: 'Too dark → "lighter"; too light → "darker"; size words scale',
      run() {
        assert(texts(mixDirections([40, 10, 20], [60, 10, 20])) === 'Much lighter', texts(mixDirections([40, 10, 20], [60, 10, 20])));
        assert(texts(mixDirections([62, 10, 20], [60, 10, 20])) === 'A little darker', texts(mixDirections([62, 10, 20], [60, 10, 20])));
        assert(texts(mixDirections([55, 10, 20], [60, 10, 20])) === 'Lighter', 'medium step');
      },
    },
    {
      group: 'Check my mix',
      name: 'Too intense → "less saturated"; dull → "more saturated"',
      run() {
        const r = mixDirections(lch(60, 45, 70), lch(60, 5, 70));
        assert(kinds(r)[0] === 'chroma' && /less saturated/.test(r.directions[0].text), texts(r));
        assert(/more saturated/.test(texts(mixDirections(lch(60, 10, 70), lch(60, 40, 70)))), 'more saturated');
      },
    },
    {
      group: 'Check my mix',
      name: 'Warmer / cooler follows the hue toward orange or toward blue',
      run() {
        const w = mixDirections(lch(60, 40, 100), lch(60, 40, 70)); // yellow → orange
        assert(/warmer/i.test(texts(w)) && /orange/.test(texts(w)), texts(w));
        const c = mixDirections(lch(60, 40, 100), lch(60, 40, 130)); // yellow → yellow-green
        assert(/cooler/i.test(texts(c)) && /yellow-green/.test(texts(c)), texts(c));
        // opposite moves must never get the same word
        for (const [a, b] of [[100, 70], [200, 250], [300, 330], [150, 120]]) {
          const fwd = texts(mixDirections(lch(55, 40, a), lch(55, 40, b)));
          const back = texts(mixDirections(lch(55, 40, b), lch(55, 40, a)));
          assert(/warmer/.test(fwd) !== /warmer/.test(back) || !/warmer|cooler/.test(fwd + back), `${a}↔${b}: "${fwd}" / "${back}"`);
        }
        // moves that swing around the warm or cool pole name the hue instead
        assert(texts(mixDirections(lch(50, 40, 40), lch(50, 40, 80))) === 'Much more yellow', texts(mixDirections(lch(50, 40, 40), lch(50, 40, 80))));
        assert(/^Much more blue$/.test(texts(mixDirections(lch(50, 40, 225), lch(50, 40, 255)))), texts(mixDirections(lch(50, 40, 225), lch(50, 40, 255))));
        const v = mixDirections(lch(50, 40, 300), lch(50, 40, 330)); // violet → toward red
        assert(/warmer/i.test(texts(v)), texts(v));
        assert(hueName(40) === 'red' && hueName(95) === 'yellow' && hueName(270) === 'blue', 'hue names');
      },
    },
    {
      group: 'Check my mix',
      name: 'Greys have no hue: no warmer/cooler between two near-greys',
      run() {
        const r = mixDirections(lch(50, 2, 40), lch(50, 2, 250));
        assert(!kinds(r).includes('hue'), texts(r));
        const g = mixDirections([50, 1, 2], [50, -30, 20]); // muddy grey → green
        assert(/more saturated \(toward green\)/.test(texts(g)), texts(g));
      },
    },
    {
      group: 'Check my mix',
      name: 'A matching mix gets no directions and "very close"',
      run() {
        const r = mixDirections([50.3, 10.2, 20.1], [50, 10, 20]);
        assert(r.directions.length === 0 && r.label === 'very close', texts(r));
      },
    },
    {
      group: 'Check my mix',
      name: 'Recipe 2:1 red+white, target 2:2 → add 1 part white (exact)',
      run() {
        const mix = predictMix(recipe.paints, recipe.parts).lab;
        const target = predictMix([red, white], [2, 2]).lab;
        const s = suggestAddition(mix, target, golden, { recipe });
        assert(s.model === 'recipe', s.model);
        assert(s.options[0].paint.name === 'Titanium White', `best was ${s.options[0].paint.name}`);
        assert(s.options[0].deltaE < 0.5, `after ΔE ${s.options[0].deltaE.toFixed(2)}`);
        assert(s.options.every((o) => o.deltaE < s.before), 'only improvements listed');
        return { swatches: [{ label: 'mix', hex: labToHex(mix) }, { label: '+1 white', hex: s.options[0].hex }, { label: 'target', hex: labToHex(target) }], detail: `ΔE ${s.before.toFixed(1)} → ${s.options[0].deltaE.toFixed(2)}` };
      },
    },
    {
      group: 'Check my mix',
      name: 'Needs a new paint: suggests blue when the target has blue in it',
      run() {
        const mix = predictMix(recipe.paints, recipe.parts).lab;
        const target = predictMix([red, white, blue], [2, 1, 1]).lab;
        const s = suggestAddition(mix, target, golden, { recipe });
        assert(s.options[0].paint.name === 'Ultramarine Blue', `best was ${s.options[0].paint.name}`);
      },
    },
    {
      group: 'Check my mix',
      name: 'Real mix came out different: the photo\'s gap is carried into predictions',
      run() {
        const predicted = predictMix(recipe.paints, recipe.parts).lab;
        const photo = [predicted[0] - 4, predicted[1], predicted[2]]; // came out darker than predicted
        const target = predictMix([red, white], [8, 1]).lab; // anything: we check the maths
        const s = suggestAddition(photo, target, [white], { recipe, addParts: 1 });
        const expected = predictMix([red, white], [2, 2]).lab.map((v, i) => v + (i === 0 ? -4 : 0));
        const got = s.options[0]?.lab ?? suggestAddition(photo, [100, 0, 0], [white], { recipe }).options[0].lab;
        assert(got.every((v, i) => Math.abs(v - expected[i]) < 1e-9), `got ${got.map((v) => v.toFixed(2))}, expected ${expected.map((v) => v.toFixed(2))}`);
        const d = mixDirections(photo, predicted);
        assert(d.directions[0].text === 'Lighter', texts(d));
      },
    },
    {
      group: 'Check my mix',
      name: 'Freehand mix (no recipe): still finds the right paint; bigger pile → smaller step',
      run() {
        const mix = predictMix([yellow, white], [1, 1]).lab;
        const target = predictMix([yellow, white], [3, 1]).lab;
        const s = suggestAddition(mix, target, golden, { mixParts: 2 });
        assert(s.model === 'freehand', s.model);
        assert(s.options[0].paint.name === 'Cadmium Yellow Medium', `best was ${s.options[0].paint.name}`);
        const small = suggestAddition(mix, [0, 0, 0], [blue], { mixParts: 2 }).options[0].lab;
        const big = suggestAddition(mix, [0, 0, 0], [blue], { mixParts: 12 }).options[0].lab;
        assert(deltaE2000(big, mix) < deltaE2000(small, mix), '1 part into 12 should change less than into 2');
      },
    },
    {
      group: 'Check my mix',
      name: 'Nothing helps → empty list; recipe size sets default parts',
      run() {
        const mix = predictMix(recipe.paints, recipe.parts).lab;
        assert(suggestAddition(mix, mix, golden, { recipe }).options.length === 0, 'mix already on target');
        assert(defaultMixParts({ parts: [2, 1, 3] }) === 6 && defaultMixParts(null) === 4, 'default parts');
      },
    },
  ];
}
