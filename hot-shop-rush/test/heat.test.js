import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG } from '../src/config.js';
import { createPiece, tickPiece, addStress } from '../src/heat.js';

function timeToCool(from, to, env) {
  const p = createPiece(CFG, 'M');
  p.heat = from;
  let t = 0;
  while (p.heat > to) { tickPiece(CFG, p, 0.01, env); t += 0.01; }
  return t;
}

test('M tumbler cools 90 → 65 in about 9.5 s in air (GDD §4.2)', () => {
  const t = timeToCool(90, 65, {});
  assert.ok(t > 9 && t < 10, `got ${t.toFixed(2)} s`);
});

test('marver contact cools 90 → 65 in about 6 s', () => {
  const t = timeToCool(90, 65, { contact: 'marver' });
  assert.ok(t > 5.5 && t < 6.5, `got ${t.toFixed(2)} s`);
});

test('glory hole reheat slows near the top and never passes GH_TARGET', () => {
  const p = createPiece(CFG, 'M');
  p.heat = 70;
  for (let i = 0; i < 2000; i++) tickPiece(CFG, p, 0.01, { reheating: true });
  assert.ok(p.heat < CFG.heat.GH_TARGET && p.heat > 98);
});

test('reheating relieves stress, but never below half its peak', () => {
  const p = createPiece(CFG, 'M');
  addStress(p, 40);
  p.heat = 85;
  for (let i = 0; i < 3000; i++) { tickPiece(CFG, p, 0.01, { reheating: true }); p.heat = 85; }
  assert.equal(p.stress, 20);
});

test('running cold builds stress and eventually checks the piece', () => {
  const p = createPiece(CFG, 'M');
  p.heat = 35;
  for (let i = 0; i < 12000 && !p.cracked; i++) tickPiece(CFG, p, 0.01, {});
  assert.ok(p.stress > 0);
  assert.ok(p.cracked);
});

test('garage drifts heat toward H_GARAGE without stress', () => {
  const p = createPiece(CFG, 'M');
  p.heat = 88;
  for (let i = 0; i < 1500; i++) tickPiece(CFG, p, 0.01, { garage: true });
  assert.equal(p.heat, CFG.garage.H_GARAGE);
  assert.equal(p.stress, 0);
});

test('overheating builds off-center, slower while turning in the glory hole', () => {
  const air = createPiece(CFG, 'M');
  air.heat = 97;
  tickPiece(CFG, air, 0.5, {});
  const gh = createPiece(CFG, 'M');
  gh.heat = 97;
  tickPiece(CFG, gh, 0.5, { reheating: true });
  assert.ok(air.off > 1.9);
  assert.ok(gh.off > 0 && gh.off < air.off / 3);
});
