import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG } from '../src/config.js';
import { crackChance, handoff, hueMatch, waitScore, gatherAccuracy, heatFactor } from '../src/scoring.js';

const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} not within ${tol} of ${b}`);

test('crack chance matches the GDD ballparks (6% / 25% / 50%)', () => {
  const base = { loadHeat: 50, soakS: 100, coldSeals: 0, doorS: 0 };
  near(crackChance(CFG, { ...base, stress: 20 }), 0.063, 0.005);
  near(crackChance(CFG, { ...base, stress: 50 }), 0.247, 0.005);
  near(crackChance(CFG, { ...base, stress: 80 }), 0.501, 0.005);
});

test('cold loads and short soaks add risk; total caps at 0.95', () => {
  const ok = crackChance(CFG, { stress: 0, loadHeat: 50, soakS: 100 });
  const cold = crackChance(CFG, { stress: 0, loadHeat: 20, soakS: 100 });
  const rushed = crackChance(CFG, { stress: 0, loadHeat: 50, soakS: 0 });
  assert.equal(ok, 0);
  near(cold, 0.6, 1e-9);
  near(rushed, 0.25, 1e-9);
  assert.equal(crackChance(CFG, { stress: 100, loadHeat: 0, soakS: 0 }), 0.95);
});

test('same color scores 100, neighbor colors score lower', () => {
  assert.equal(hueMatch(CFG, [31, 79, 184], [31, 79, 184]), 100);
  assert.ok(hueMatch(CFG, [43, 179, 177], [31, 79, 184]) < 60);
});

test('wait score breakpoints', () => {
  assert.equal(waitScore(0.3), 100);
  assert.equal(waitScore(1), 30);
  assert.equal(waitScore(3), 0);
});

test('gather accuracy is 100 at center, 70 at band edge, 0 past ZERO_AT', () => {
  assert.equal(gatherAccuracy(0.62, 0.62, 0.06, 0.25), 100);
  near(gatherAccuracy(0.68, 0.62, 0.06, 0.25), 70, 1e-9);
  assert.equal(gatherAccuracy(0.9, 0.62, 0.06, 0.25), 0);
});

test('heat factor spans 0.55 → 1', () => {
  assert.equal(heatFactor(CFG, 0), 0.55);
  assert.equal(heatFactor(CFG, 1), 1);
});

test('a perfect piece earns 5 stars', () => {
  const r = handoff(CFG, {
    shapeSteps: [100, 100], off: 0, hue: 100, coverage: 1, doses: 1, targetDoses: 1,
    sizeErrPct: 0, heatFrac: 1, stress: 0, waitRatio: 0.3, garageDecay: 0,
  });
  assert.equal(r.stars, 5);
});
