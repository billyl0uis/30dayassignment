import { createScene } from './scene.js';
import { replay } from './ops.js';
import { surfaceNets } from './mesher.js';
import { sigmaFromTint } from './glass.js';
import { analyze } from './analysis.js';
import { MATERIAL, ANNEAL } from './config.js';

const $ = (s) => document.querySelector(s);
const view = createScene($('#view'));

const state = {
  n: 128,
  size: 24,          // cm: the grid spans a 24 cm cube
  history: [{ type: 'gather', diameter: 8 }],
  future: [],        // redo stack
  vol: null,
};

function rebuild() {
  const t0 = performance.now();
  state.vol = replay(state.history, state.n, state.size);
  const t1 = performance.now();
  const mesh = surfaceNets(state.vol);
  const t2 = performance.now();
  view.setMesh(mesh);
  view.setPunty(state.vol.meta.puntyMark);
  // Thickness-view colour scale: full dark at the piece's longest chord.
  view.glassMat.uniforms.maxT.value = Math.max(2, 0.6 * boundsDiameter(mesh.positions));

  state.analysis = analyze(state.vol, mesh);
  const t3 = performance.now();
  showReadouts();

  const v = state.vol;
  $('#status').textContent =
    `${v.n}³ grid · voxel ${(v.h * 10).toFixed(1)} mm · ` +
    `build ${(t1 - t0).toFixed(0)} ms · mesh ${(t2 - t1).toFixed(0)} ms · ` +
    `measure ${(t3 - t2).toFixed(0)} ms · ${(mesh.indices.length / 3 / 1000).toFixed(0)}k tris`;
  $('#undo').disabled = state.history.length <= 1;
  $('#redo').disabled = state.future.length === 0;
}

// ── Readouts ──
const show = { thickest: true, com: true };
function fmtHours(hrs) {
  if (hrs < 1) return `~${Math.round(hrs * 60)} min`;
  if (hrs < 48) return `~${hrs.toFixed(hrs < 10 ? 1 : 0)} h`;
  return `~${(hrs / 24).toFixed(1)} days`;
}
function showReadouts() {
  const a = state.analysis;
  const weight = a.volume * MATERIAL.density;
  $('#r-weight').textContent = weight >= 1000 ? `${(weight / 1000).toFixed(2)} kg` : `${weight.toFixed(0)} g`;
  $('#r-volume').textContent = `${a.volume.toFixed(1)} cm³`;
  $('#r-thickest').textContent = `${a.thickest.diameter.toFixed(2)} cm`;
  $('#r-anneal').textContent = fmtHours(a.annealHours);
  $('#r-anneal').classList.toggle('warn', a.annealHours > ANNEAL.warnAboveHours);
  $('#r-com').textContent = a.com ? `${a.com[1].toFixed(2)} cm up` : '—';

  let tip, note = '';
  const onPunty = !!state.vol.meta.puntyMark;
  if (a.tip.deg === null) {
    tip = '—';
    note = onPunty ? 'Still on the punty, so it has no base yet.'
      : a.support.contactCount ? 'Touches the floor at a point or a line, so there is no base area to stand on.'
      : 'Not touching the floor.';
  } else if (a.tip.deg < 0) {
    tip = 'falls over';
    note = 'The centre of mass is outside the base.';
  } else {
    tip = `${a.tip.deg.toFixed(1)}°`;
  }
  $('#r-tip').textContent = tip;
  $('#r-note').textContent = note + (ANNEAL.calibrated ? '' : ' Anneal time uses placeholder constants. Calibrate them in src/config.js before relying on it.');
  view.setMarkers(a, show);
}
$('#show-thickest').addEventListener('change', (e) => { show.thickest = e.target.checked; showReadouts(); });
$('#show-com').addEventListener('change', (e) => { show.com = e.target.checked; showReadouts(); });
$('#density').addEventListener('input', (e) => {
  const d = +e.target.value;
  if (d > 0) { MATERIAL.density = d; showReadouts(); }
});

function boundsDiameter(p) {
  let a = [Infinity, Infinity, Infinity], b = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) {
    if (p[i + k] < a[k]) a[k] = p[i + k];
    if (p[i + k] > b[k]) b[k] = p[i + k];
  }
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
}

// ── Base glass colour ──
// Tint = what white light looks like after 1 cm of this glass.
const glass = { tint: '#5a7fe0', strength: 0.35 };
function applyTint() {
  sigmaFromTint(glass.tint, glass.strength, view.glassMat.uniforms.sigma.value);
  $('#tint').value = glass.tint;
  $('#strength-out').textContent = glass.strength.toFixed(2);
  document.querySelectorAll('[data-tint]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.tint === glass.tint));
}
$('#tint').addEventListener('input', (e) => { glass.tint = e.target.value; applyTint(); });
$('#strength').addEventListener('input', (e) => { glass.strength = +e.target.value; applyTint(); });
document.querySelectorAll('[data-tint]').forEach((b) => b.addEventListener('click', () => { glass.tint = b.dataset.tint; applyTint(); }));

// ── Calibration shapes ──
$('#test-sphere').addEventListener('click', () => { state.history = [{ type: 'testSphere', diameter: 8 }]; state.future = []; rebuild(); });
$('#test-wedge').addEventListener('click', () => { state.history = [{ type: 'testWedge', length: 16, height: 5, width: 7 }]; state.future = []; rebuild(); });

// ── Thickness probe: read the measured path length under the cursor ──
const canvas = $('#view');
canvas.addEventListener('pointermove', (e) => {
  const r = canvas.getBoundingClientRect();
  const t = view.thicknessAt(e.clientX - r.left, e.clientY - r.top);
  const probe = $('#probe');
  probe.hidden = t <= 0.005;
  probe.textContent = `${t.toFixed(2)} cm of glass`;
  probe.style.transform = `translate(${e.clientX - r.left + 14}px, ${e.clientY - r.top + 14}px)`;
});
canvas.addEventListener('pointerleave', () => { $('#probe').hidden = true; });

function push(op) {
  state.history.push(op);
  state.future = [];
  rebuild();
}

$('#diameter').addEventListener('input', (e) => {
  $('#diameter-out').textContent = `${(+e.target.value).toFixed(1)} cm`;
});
$('#layer').addEventListener('input', (e) => {
  $('#layer-out').textContent = `${(+e.target.value).toFixed(1)} cm`;
});
$('#new-gather').addEventListener('click', () => {
  state.history = [{ type: 'gather', diameter: +$('#diameter').value }];
  state.future = [];
  rebuild();
});
$('#add-gather').addEventListener('click', () => push({ type: 'addGather', thickness: +$('#layer').value }));
$('#undo').addEventListener('click', undo);
$('#redo').addEventListener('click', redo);
$('#res').addEventListener('change', (e) => { state.n = +e.target.value; rebuild(); });
for (const b of document.querySelectorAll('[data-view]')) {
  b.addEventListener('click', () => {
    document.querySelectorAll('[data-view]').forEach((x) => x.setAttribute('aria-pressed', x === b));
    view.setView(b.dataset.view);
  });
}

function undo() {
  if (state.history.length <= 1) return;
  state.future.push(state.history.pop());
  rebuild();
}
function redo() {
  if (!state.future.length) return;
  state.history.push(state.future.pop());
  rebuild();
}
addEventListener('keydown', (e) => {
  if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
  e.preventDefault();
  e.shiftKey ? redo() : undo();
});

view.setView('hot');
applyTint();
rebuild();
window.mass = { state, view, rebuild }; // for poking at in devtools
