import { createScene } from './scene.js';
import { runOp, LABELS, CONSERVES } from './ops.js';
import { Volume } from './volume.js';
import { surfaceNets } from './mesher.js';
import { sigmaFromTint } from './glass.js';
import { analyze } from './analysis.js';
import { MATERIAL, ANNEAL } from './config.js';
import { History } from './history.js';
import { TOOLS, ToolController } from './tools.js';
import { runChecks } from './checks.js';

const $ = (s) => document.querySelector(s);
const view = createScene($('#view'));

const state = {
  n: 128,
  size: 24,          // cm: the grid spans a 24 cm cube
  vol: null,
  mesh: null,
  analysis: null,
  history: new History(),
  heat: 1,           // 1 = fresh from the glory hole, 0 = too cold to move
  lastWork: performance.now(),
  lastSag: performance.now(),
  orbiting: false,
};

// ── Start / commit / undo ───────────────────────────────────────────────────
function start(op) {
  state.vol = new Volume(state.n, state.size);
  runOp(state.vol, op);
  state.history.reset(op, state.vol);
  tools.select(null);
  state.heat = 1;
  refresh();
}

function commit(op, pv = null) {
  const t0 = performance.now();
  const oldVol = state.vol;
  let newVol, dV;
  if (pv) ({ vol: newVol, dV } = pv);
  else { newVol = oldVol.clone(); dV = runOp(newVol, op); }
  state.history.record(oldVol, newVol, op, dV);
  state.vol = newVol;
  if (op.type !== 'sag') state.lastWork = performance.now();
  refresh(performance.now() - t0, pv?.mesh);
}

function preview(op) {
  const v = state.vol.clone();
  const dV = runOp(v, op);
  return { vol: v, dV, mesh: surfaceNets(v) };
}

function undo() { if (state.history.undo(state.vol)) { tools.select(tools.key); refresh(); } }
function redo() { if (state.history.redo(state.vol)) { tools.select(tools.key); refresh(); } }

// Rebuild at a new grid resolution by replaying the op list.
function setResolution(n) {
  const ops = state.history.ops();
  state.n = n;
  const h = new History();
  let vol = new Volume(n, state.size);
  runOp(vol, ops[0]); h.reset(ops[0], vol);
  for (const op of ops.slice(1)) {
    const nv = vol.clone(); const dV = runOp(nv, op);
    h.record(vol, nv, op, dV); vol = nv;
  }
  state.history = h; state.vol = vol;
  tools.select(null);
  refresh();
}

// ── Refresh everything that depends on the volume ──────────────────────────
function refresh(opMs = 0, mesh = null) {
  const t1 = performance.now();
  state.mesh = mesh || surfaceNets(state.vol);
  const t2 = performance.now();
  view.setMesh(state.mesh);
  view.setPunty(state.vol.meta.puntyMark);
  view.setVolume(state.vol, baseSigma());
  view.glassMat.uniforms.maxT.value = Math.max(2, 0.6 * boundsDiameter(state.mesh.positions));
  state.analysis = analyze(state.vol, state.mesh);
  const t3 = performance.now();
  showReadouts();
  showChecks();
  showHistory();
  showFinish();
  view.setStand(state.vol.meta.mounted ? state.vol.meta.mountPoint : null);
  const v = state.vol;
  $('#status').textContent =
    `${v.n}³ grid · voxel ${(v.h * 10).toFixed(1)} mm · ` +
    (opMs ? `op ${opMs.toFixed(0)} ms · ` : '') +
    `mesh ${(t2 - t1).toFixed(0)} ms · measure ${(t3 - t2).toFixed(0)} ms · ${(state.mesh.indices.length / 3 / 1000).toFixed(0)}k tris`;
  $('#undo').disabled = !state.history.canUndo();
  $('#redo').disabled = !state.history.canRedo();
}

function boundsDiameter(p) {
  const a = [Infinity, Infinity, Infinity], b = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) {
    if (p[i + k] < a[k]) a[k] = p[i + k];
    if (p[i + k] > b[k]) b[k] = p[i + k];
  }
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
}

// ── Readouts ────────────────────────────────────────────────────────────────
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
  const m = state.vol.meta;
  if (m.mounted) { tip = 'on a stand'; note = 'Mounted, so no base is needed.'; }
  else if (a.tip.deg === null) {
    tip = '—';
    note = m.puntyMark ? 'Still on the punty, so it has no base yet.'
      : a.support.contactCount ? 'Touches the floor at a point or a line, so there is no base area to stand on.'
      : 'Not touching the floor.';
  } else if (a.tip.deg < 0) { tip = 'falls over'; note = 'The centre of mass is outside the base.'; }
  else tip = `${a.tip.deg.toFixed(1)}°`;
  $('#r-tip').textContent = tip;
  $('#r-note').textContent = note + (ANNEAL.calibrated ? '' : ' Anneal time uses placeholder constants. Calibrate them in src/config.js before relying on it.');
  view.setMarkers(a, show);
}
$('#show-thickest').addEventListener('change', (e) => { show.thickest = e.target.checked; showReadouts(); });
$('#show-com').addEventListener('change', (e) => { show.com = e.target.checked; showReadouts(); });
$('#density').addEventListener('input', (e) => { const d = +e.target.value; if (d > 0) { MATERIAL.density = d; showReadouts(); } });

// ── Checks: click one to highlight where the problem is ──────────────────
let selectedCheck = null;
function showChecks() {
  const checks = runChecks(state.vol, state.analysis);
  state.checks = checks;
  if (selectedCheck !== null && !checks.some((c) => c.title === selectedCheck)) selectedCheck = null;
  const lv = { bad: 'Bad', warn: 'Warn', info: 'Info', ok: 'OK' };
  $('#checks').innerHTML = checks.map((c, i) => `
    <li class="${c.level}" data-i="${i}" aria-selected="${c.title === selectedCheck}">
      <b><span class="lv">${lv[c.level]}</span>${c.title}</b>${c.detail ? `<p>${c.detail}</p>` : ''}
    </li>`).join('');
  const sel = checks.find((c) => c.title === selectedCheck);
  view.setHighlight(sel ? sel.marks : [], sel?.level === 'info' ? 0x8a8178 : 0xe0362c);
}
$('#checks').addEventListener('click', (e) => {
  const li = e.target.closest('li[data-i]');
  if (!li) return;
  const c = state.checks[+li.dataset.i];
  if (c.level === 'ok') return;
  selectedCheck = selectedCheck === c.title ? null : c.title;
  if (selectedCheck) {
    if (c.show.thickest) { show.thickest = true; $('#show-thickest').checked = true; }
    if (c.show.support) { show.com = true; $('#show-com').checked = true; }
    view.setMarkers(state.analysis, show);
    view.focus(c.focus);
  }
  showChecks();
});

// ── History list: every step with the glass it added or removed ────────────
function showHistory() {
  const fmt = (e, i) => {
    const label = LABELS[e.op.type] || e.op.type;
    const extra = e.op.type === 'sag' ? ` ×${e.op.ticks.length}` : '';
    if (i === 0) return `<li><span>${label}${extra}</span><span>${e.dV.toFixed(1)} cm³</span></li>`;
    const d = e.dV, kept = CONSERVES.has(e.op.type);
    const txt = kept ? `kept · Δ ${d >= 0 ? '+' : ''}${d.toFixed(2)}` : `${d >= 0 ? '+' : ''}${d.toFixed(1)} cm³`;
    return `<li class="${kept ? 'kept' : ''}"><span>${label}${extra}</span><span>${txt}</span></li>`;
  };
  const done = state.history.entries.map(fmt).join('');
  const undone = [...state.history.future].reverse().map((e) => `<li class="undone"><span>${LABELS[e.op.type]}</span><span>undone</span></li>`).join('');
  $('#history').innerHTML = done + undone;
  $('#history').scrollTop = 1e6;
}

// ── Base glass colour ──
const glass = { tint: '#f1f7f2', strength: 0.5 };
function baseSigma() { return sigmaFromTint(glass.tint, glass.strength, view.glassMat.uniforms.sigma.value); }
function applyTint() {
  $('#tint').value = glass.tint;
  $('#strength').value = glass.strength;
  $('#strength-out').textContent = glass.strength.toFixed(2);
  document.querySelectorAll('[data-tint]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.tint === glass.tint));
  if (state.vol) view.setVolume(state.vol, baseSigma());
}
$('#tint').addEventListener('input', (e) => { glass.tint = e.target.value; applyTint(); });
$('#strength').addEventListener('input', (e) => { glass.strength = +e.target.value; applyTint(); });
document.querySelectorAll('[data-tint]').forEach((b) => b.addEventListener('click', () => { glass.tint = b.dataset.tint; applyTint(); }));

// ── Tools ───────────────────────────────────────────────────────────────────
const tools = new ToolController(view, {
  vol: () => state.vol,
  analysis: () => state.analysis,
  preview,
  commit,
  changed: renderToolPanel,
});

const toolBar = $('#toolbar');
toolBar.innerHTML = Object.entries(TOOLS).map(([k, t]) => `<button data-tool="${k}" aria-pressed="false" title="${t.label} (${t.key})">${t.label}</button>`).join('');
toolBar.addEventListener('click', (e) => {
  const b = e.target.closest('[data-tool]');
  if (b) tools.select(tools.key === b.dataset.tool ? null : b.dataset.tool);
});

function renderToolPanel() {
  document.querySelectorAll('[data-tool]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.tool === tools.key));
  const panel = $('#tool-panel');
  const def = tools.def;
  panel.hidden = !def;
  if (!def) return;
  const p = tools.params;
  const rows = def.params.filter((q) => !q.when || q.when(p)).map((q) => {
    if (q.type === 'select') {
      return `<label class="row">${q.label}<select data-param="${q.key}">${q.options.map((o) => `<option value="${o.value}" ${o.value === p[q.key] ? 'selected' : ''}>${o.label}</option>`).join('')}</select></label>`;
    }
    const dp = q.step < 0.1 ? 2 : q.step < 1 ? 1 : 0;
    return `<label class="row">${q.label} <output>${(+p[q.key]).toFixed(dp)}${q.unit ? ' ' + q.unit : ''}</output></label>
      <input type="range" data-param="${q.key}" min="${q.min}" max="${q.max}" step="${q.step}" value="${p[q.key]}">`;
  }).join('');
  const waiting = tools.needsAnchor() && !tools.anchor;
  const pv = tools.preview;
  let status = waiting ? 'Click the glass to place it.' : pv ? '' : 'Computing preview…';
  if (pv) {
    const t = JSON.parse(pv.key).type;
    status = CONSERVES.has(t)
      ? `Preview · volume kept (Δ ${pv.dV >= 0 ? '+' : ''}${pv.dV.toFixed(2)} cm³)`
      : `Preview · ${pv.dV >= 0 ? 'adds' : 'removes'} ${Math.abs(pv.dV).toFixed(1)} cm³`;
  }
  panel.innerHTML = `
    <h2>${def.label}</h2>
    <p class="hint">${def.hint}</p>
    ${rows}
    <p class="tool-status">${status}</p>
    <div class="pair"><button id="tool-apply" class="primary" ${waiting ? 'disabled' : ''}>Apply ⏎</button><button id="tool-cancel">Cancel</button></div>`;
  panel.querySelectorAll('[data-param]').forEach((el) => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
    const q = def.params.find((x) => x.key === el.dataset.param);
    if (el.tagName !== 'SELECT') el.previousElementSibling.querySelector('output').textContent =
      (+el.value).toFixed(q.step < 0.1 ? 2 : q.step < 1 ? 1 : 0) + (q.unit ? ' ' + q.unit : '');
    tools.params[q.key] = q.type === 'select' ? el.value : +el.value;
    if (q.type === 'select') tools.setParam(q.key, el.value); // may change which rows show
    else { tools.redraw(); tools.preview = null; tools.view.setGhost(null); tools.schedule(); }
  }));
  $('#tool-apply').addEventListener('click', () => tools.apply());
  $('#tool-cancel').addEventListener('click', () => tools.select(null));
}

addEventListener('keydown', (e) => {
  if (e.target.matches('input, select')) return;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1) return;
  const hit = Object.entries(TOOLS).find(([, t]) => t.key.toLowerCase() === e.key.toLowerCase());
  if (hit) tools.select(tools.key === hit[0] ? null : hit[0]);
});

// ── Heat and gravity ────────────────────────────────────────────────────────
// Glass cools over ~2.5 min. While it's hot, on the punty, and nobody is
// working it, it sags a little every few seconds. Reheat resets the clock.
// Gentle on purpose: flavour, not punishment. All sag ticks fold into one
// undoable history entry.
const COOL_SECONDS = 150, SAG_EVERY_MS = 8000, SAG_CM = 0.12;
view.controls.addEventListener('start', () => { state.orbiting = true; });
view.controls.addEventListener('end', () => { state.orbiting = false; });
setInterval(() => {
  state.heat = Math.max(0, state.heat - 1 / COOL_SECONDS);
  view.glassMat.uniforms.heat.value = state.heat;
  $('#heat-bar').style.width = `${state.heat * 100}%`;
  $('#heat-out').textContent = state.heat > 0.66 ? 'hot' : state.heat > 0.33 ? 'cooling' : state.heat > 0.05 ? 'stiff' : 'cold';
  const now = performance.now();
  const idle = now - state.lastWork > SAG_EVERY_MS && now - state.lastSag > SAG_EVERY_MS;
  if ($('#gravity').checked && state.vol?.meta.puntyMark && state.heat > 0.05 && idle && !tools.key && !state.orbiting) {
    state.lastSag = now;
    commit({ type: 'sag', ticks: [+(SAG_CM * state.heat).toFixed(3)] });
  }
}, 1000);
$('#reheat').addEventListener('click', () => { state.heat = 1; state.lastWork = performance.now(); });

// ── Finish: set down, grind ─────────────────────────────────────────────────
function showFinish() {
  const m = state.vol.meta;
  $('#set-down').disabled = !!m.onFloor;
  $('#mounted').checked = !!m.mounted;
  $('#grind').disabled = !m.onFloor;
  $('#finish-note').textContent = m.mounted ? 'Mounted on a stand; the rod goes in at the mount point.'
    : m.puntyMark ? 'On the punty.'
    : m.groundBase ? (m.markOnPiece ? 'Base ground; the punty mark is still on the piece.' : 'Base ground flat; punty mark removed.')
    : m.onFloor ? (m.markOnPiece ? 'Standing on the floor. Punty mark not yet ground off.' : 'Standing on the floor.')
    : '';
}
$('#mounted').addEventListener('change', (e) => commit({ type: 'mount', on: e.target.checked }));
// Pick the rod's entry point by clicking the glass.
let pickingMount = false;
$('#pick-mount').addEventListener('click', () => {
  pickingMount = !pickingMount;
  $('#pick-mount').setAttribute('aria-pressed', pickingMount);
});
view.canvas.parentElement.addEventListener('pointerdown', (e) => {
  if (!pickingMount) return;
  const r = view.canvas.getBoundingClientRect();
  const hit = view.pickGlass(e.clientX - r.left, e.clientY - r.top);
  if (!hit) return;
  e.stopPropagation();
  pickingMount = false;
  $('#pick-mount').setAttribute('aria-pressed', false);
  commit({ type: 'mount', on: true, point: hit.point.map((v) => +v.toFixed(3)) });
}, true);
$('#set-down').addEventListener('click', () => commit({ type: 'setDown', orient: $('#orient').value }));
$('#grind').addEventListener('click', () => commit({ type: 'grind', depth: +$('#grind-depth').value }));
$('#grind-depth').addEventListener('input', (e) => { $('#grind-out').textContent = `${(+e.target.value).toFixed(2)} cm`; });

// ── Gather, calibration, view, resolution ───────────────────────────────────
$('#diameter').addEventListener('input', (e) => { $('#diameter-out').textContent = `${(+e.target.value).toFixed(1)} cm`; });
$('#layer').addEventListener('input', (e) => { $('#layer-out').textContent = `${(+e.target.value).toFixed(1)} cm`; });
$('#new-gather').addEventListener('click', () => start({ type: 'gather', diameter: +$('#diameter').value }));
$('#add-gather').addEventListener('click', () => commit({ type: 'addGather', thickness: +$('#layer').value }));
$('#test-sphere').addEventListener('click', () => start({ type: 'testSphere', diameter: 8 }));
$('#test-wedge').addEventListener('click', () => start({ type: 'testWedge', length: 16, height: 5, width: 7 }));
$('#undo').addEventListener('click', undo);
$('#redo').addEventListener('click', redo);
$('#res').addEventListener('change', (e) => setResolution(+e.target.value));
for (const b of document.querySelectorAll('[data-view]')) {
  b.addEventListener('click', () => {
    document.querySelectorAll('[data-view]').forEach((x) => x.setAttribute('aria-pressed', x === b));
    view.setView(b.dataset.view);
  });
}

// ── Thickness probe ──
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

view.setView('hot');
applyTint();
start({ type: 'gather', diameter: 8 });
window.mass = { state, view, tools, commit, undo, redo, preview, start }; // for poking at in devtools
