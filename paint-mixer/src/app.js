// UI for stage 2: tabs, paint library, palettes, custom paints, export/import,
// and the Mix tab (solver in a Web Worker).

import { flattenLibrary, searchPaints, samePigmentPaints, statusLabel, STATUS } from './library.js';
import { hexToLab, labToHex, parseHex } from './color.js';
import * as store from './store.js';
import { PRESETS } from './presets.js';
import { openCapture } from './capture-ui.js';
import { initReference } from './reference-ui.js';
import { initCheck } from './check-ui.js';

export const APP_NAME = 'Paint Mixer';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---- state --------------------------------------------------------------------

let libraryFlat = [];
let paints = []; // resolved: library + custom, with user settings applied
let paintById = new Map();
let { state, error: loadError } = store.loadState(safeStorage());
let reference = null; // Reference tab controller
let check = null; // Check-my-mix panel controller
const ui = { query: '', brand: '', usableOnly: false, fillingRole: null, detailId: null, partsMode: 'ratio' };

function safeStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function refreshPaints() {
  paints = store.resolvePaints(libraryFlat, state);
  paintById = new Map(paints.map((p) => [p.id, p]));
}

function persist() {
  const { error } = store.saveState(state, safeStorage());
  showBanner(error);
}

function commit() {
  persist();
  refreshPaints();
  renderAll();
}

function showBanner(msg) {
  $('banner').hidden = !msg;
  $('banner').textContent = msg ?? '';
}

// ---- small render helpers ---------------------------------------------------------

const swatch = (p, cls = '') =>
  p?.lab
    ? `<span class="sw ${cls}" style="background:${labToHex(p.lab)}"></span>`
    : `<span class="sw none ${cls}" title="needs swatch"></span>`;

const OP_TITLE = { opaque: 'Opaque', 'semi-opaque': 'Semi-opaque', 'semi-transparent': 'Semi-transparent', transparent: 'Transparent', unknown: 'Opacity not published' };
const opacityIcon = (op) => {
  const k = op ?? 'unknown';
  return `<span class="op" data-op="${k}" title="${OP_TITLE[k]}" aria-label="${OP_TITLE[k]}" role="img"></span>`;
};

const pigmentChips = (p) => (p.pigments.length ? p.pigments.map((x) => `<span class="pig">${esc(x)}</span>`).join('') : '<span class="muted small">pigments unknown</span>');

function statusBadge(p) {
  const cls = p.status === 'manufacturer_lab' ? 'approx' : p.status === 'needs_swatch' ? 'need' : 'ok';
  return `<span class="badge ${cls}">${esc(statusLabel(p.status))}</span>`;
}

// ---- tabs & theme ----------------------------------------------------------------------

function setTab(name) {
  if (!['reference', 'paints', 'mix'].includes(name)) name = 'paints';
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  document.querySelectorAll('section.tab').forEach((s) => s.classList.toggle('active', s.id === `tab-${name}`));
  if (location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`);
  if (name === 'mix') renderMixPalette();
  renderGuide();
  window.scrollTo({ top: 0 });
}

const THEMES = ['auto', 'light', 'dark'];
function applyTheme(t) {
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  $('theme').title = `Theme: ${t}`;
}
function initTheme() {
  let t = 'auto';
  try { t = localStorage.getItem('color-mixer:theme') || 'auto'; } catch {}
  applyTheme(t);
  $('theme').onclick = () => {
    t = THEMES[(THEMES.indexOf(t) + 1) % THEMES.length];
    applyTheme(t);
    try { localStorage.setItem('color-mixer:theme', t); } catch {}
  };
}

// ---- icons (one stroke family, drawn not typed) -------------------------------------

const svg = (d, size = 20) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON = {
  plus: svg('<path d="M12 5v14M5 12h14"/>', 22),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 22),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>', 18),
  camera: svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', 18),
  ready: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 16),
};

// ---- palette ------------------------------------------------------------------------------

function renderPalette() {
  const sel = $('palette-select');
  sel.innerHTML = state.palettes.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  sel.value = state.activePaletteId ?? '';
  const pal = store.getPalette(state);
  const hasPal = !!pal;
  for (const a of ['rename-palette', 'delete-palette']) document.querySelector(`[data-action="${a}"]`).disabled = !hasPal;

  if (!pal) {
    $('palette-info').textContent = 'No palette yet. Tap New or choose a classic palette.';
    $('palette-chips').innerHTML = '';
    return;
  }

  const inPal = pal.paintIds.map((id) => paintById.get(id)).filter(Boolean);
  const ready = inPal.filter((p) => p.lab).length;
  $('palette-info').textContent = inPal.length
    ? `${inPal.length} paint${inPal.length === 1 ? '' : 's'} · ${ready} ready to mix` + (ready < inPal.length ? ` · ${inPal.length - ready} need${inPal.length - ready === 1 ? 's' : ''} a swatch photo` : '')
    : '';

  const row = (p, roleLabel) => `<li class="pal-row${p.lab ? '' : ' needs'}">
      <button class="pal-main" data-action="detail" data-id="${esc(p.id)}" aria-label="Details for ${esc(p.name)}">
        ${swatch(p)}
        <span class="pal-txt"><span class="pal-nm">${roleLabel ? `<span class="muted">${esc(roleLabel)}:</span> ` : ''}${esc(p.name)}</span>
        <span class="pal-sub">${esc(p.brand)}${p.custom ? '' : ` · ${esc(p.line)}`}</span></span>
      </button>
      ${p.lab
        ? `<span class="pal-ready" title="${esc(statusLabel(p.status))}">${ICON.ready}<span>Ready</span></span>`
        : `<button class="btn small primary pal-shoot" data-action="capture" data-id="${esc(p.id)}" aria-label="Add swatch photo for ${esc(p.name)}">${ICON.camera}<span>Add swatch photo</span></button>`}
      <button class="pal-x" data-action="remove" data-id="${esc(p.id)}" aria-label="Remove ${esc(p.name)} from palette" title="Remove from palette">${ICON.x}</button>
    </li>`;

  const roleIds = new Set();
  const roleRows = pal.roles.map((r, i) => {
    const p = r.paintId && paintById.get(r.paintId);
    if (p) {
      roleIds.add(p.id);
      return row(p, r.label);
    }
    const active = ui.fillingRole === i ? ' active' : '';
    return `<li class="pal-row role${active}"><button class="pal-main" data-action="pick-role" data-role="${i}">${swatch(null)}<span class="pal-txt"><span class="pal-nm">${esc(r.label)}</span><span class="pal-sub">${ui.fillingRole === i ? 'Choosing now: pick one below' : 'Tap to choose a paint'}</span></span></button></li>`;
  });
  const others = inPal.filter((p) => !roleIds.has(p.id)).map((p) => row(p));
  $('palette-chips').innerHTML = [...roleRows, ...others].join('') || '<li class="pal-empty">Your palette is empty. Open <strong>Add paints</strong> below and tap + on the paints you own.</li>';

  const role = ui.fillingRole !== null ? pal.roles[ui.fillingRole] : null;
  $('role-banner').hidden = !role;
  if (role) {
    $('role-banner').innerHTML = `Choosing <strong>${esc(role.label)}</strong>. ${esc(role.hint)} Tap "Use" on a paint. <button class="btn small" data-action="cancel-role">Cancel</button>`;
  }
  // Show the library when there is something to add or choose.
  if (!inPal.length || role) $('add-paints').open = true;
}

// ---- next-step guide ------------------------------------------------------------------------

const SWATCH_HOWTO = `<details class="howto-sheet"><summary>How to make a swatch sheet</summary>
  <ol>
    <li>On white paper, paint a solid patch of each paint, straight from the tube.</li>
    <li>Next to it, paint 1 part of that paint mixed with 1 part titanium white. This shows how strong the paint is.</li>
    <li>Let it dry, then take one photo of the whole sheet in daylight, with blank paper showing. Reuse that photo for every paint.</li>
  </ol></details>`;

/** One card that always says what to do next, based on where the painter is. */
function renderGuide() {
  const tab = document.querySelector('.tabs [aria-selected="true"]')?.dataset.tab;
  const pal = store.getPalette(state);
  const inPal = (pal?.paintIds ?? []).map((id) => paintById.get(id)).filter(Boolean);
  const missing = inPal.filter((p) => !p.lab);
  let html = '';

  if (!inPal.length) {
    html = `<div class="guide-txt"><h3>Start by adding the paints you own</h3>
      <p>Recipes only use paints in your palette, so the app never asks for a tube you don't have.</p></div>
      <div class="guide-act"><button class="btn primary" data-action="open-library">Add paints</button></div>`;
  } else if (missing.length) {
    const next = missing[0];
    html = `<div class="guide-txt"><h3>${missing.length} of ${inPal.length} paints need a swatch photo</h3>
      <p>The app can't mix with a paint until it has measured its color from a photo.${inPal.length > missing.length ? ` Until then, recipes use only your ${inPal.length - missing.length} ready paint${inPal.length - missing.length === 1 ? '' : 's'}.` : ''}</p>
      ${SWATCH_HOWTO}</div>
      <div class="guide-act"><button class="btn primary" data-action="capture" data-id="${esc(next.id)}">${ICON.camera}<span>Photograph ${esc(next.name)}</span></button></div>`;
  } else if (tab === 'paints' && !state.targets.length) {
    html = `<div class="guide-txt"><h3>Your palette is ready</h3>
      <p>Next, choose a color to match: sample it from a photo, or pick it directly.</p></div>
      <div class="guide-act"><a class="btn primary" href="#reference">Use a photo</a><a class="btn" href="#mix">Pick a color</a></div>`;
  }
  const g = $('guide');
  g.hidden = !html;
  if (html) g.innerHTML = html;
}

// ---- library ---------------------------------------------------------------------------------

function renderLibrary() {
  const pal = store.getPalette(state);
  const inPal = new Set(pal?.paintIds ?? []);
  // Paints with a color first: only they can be mixed, and most of the library
  // has no published color, so otherwise the first screen is all blank swatches.
  const list = searchPaints(paints, ui.query, { brand: ui.brand, usableOnly: ui.usableOnly })
    .map((p, i) => [p, i])
    .sort(([a, i], [b, j]) => !a.lab - !b.lab || i - j)
    .map(([p]) => p);
  const colored = list.filter((p) => p.lab).length;
  $('lib-count').textContent =
    `${list.length} of ${paints.length} paints` +
    (colored < list.length ? ` · ${colored} with a known color, shown first. The rest need a swatch photo once added.` : '');
  const filling = ui.fillingRole !== null;
  $('library').innerHTML = list
    .map((p) => {
      const on = inPal.has(p.id);
      const action = filling
        ? `<button class="toggle fill" data-action="fill" data-id="${esc(p.id)}">Use</button>`
        : `<button class="toggle" data-action="toggle" data-id="${esc(p.id)}" aria-pressed="${on}" aria-label="${on ? 'Remove' : 'Add'} ${esc(p.name)} ${on ? 'from' : 'to'} palette" title="${on ? 'In your palette: tap to remove' : 'Add to palette'}">${on ? ICON.check : ICON.plus}</button>`;
      return `<li>
        <button class="main" data-action="detail" data-id="${esc(p.id)}">
          ${swatch(p)}
          <span class="txt">
            <span class="nm">${esc(p.name)}</span> ${opacityIcon(p.opacity)}
            <div class="sub">${esc(p.brand)} · ${esc(p.line)}</div>
            <div>${pigmentChips(p)} ${statusBadge(p)}</div>
            ${p.note ? `<div class="note">⚠ ${esc(p.note)}</div>` : ''}
          </span>
        </button>
        ${action}
      </li>`;
    })
    .join('');
}

function renderBrandFilter() {
  const brands = [...new Set(paints.map((p) => p.brand))];
  $('brand-filter').innerHTML = '<option value="">All brands</option>' + brands.map((b) => `<option>${esc(b)}</option>`).join('');
  $('brand-filter').value = ui.brand;
}

// ---- detail dialog ------------------------------------------------------------------------------

function openDetail(id) {
  ui.detailId = id;
  renderDetail();
  if (!$('detail').open) $('detail').showModal();
}

function renderDetail() {
  const p = paintById.get(ui.detailId);
  if (!p) return $('detail').open && $('detail').close();
  const pal = store.getPalette(state);
  const on = pal?.paintIds.includes(p.id);
  const same = samePigmentPaints(p, paints);
  const opac = p.opacity ?? 'not published';

  $('detail-body').innerHTML = `
    <div class="dlg-head">
      ${swatch(p, 'big')}
      <div class="grow">
        <h3>${esc(p.name)}</h3>
        <div class="muted small">${esc(p.brand)} · ${esc(p.line)}${p.medium ? ` · ${esc(p.medium)}` : ''}</div>
        <div style="margin-top:6px">${statusBadge(p)}</div>
      </div>
      <button class="icon-btn" data-action="close-detail" aria-label="Close">✕</button>
    </div>
    <dl>
      <dt>Pigments</dt><dd>${pigmentChips(p)}</dd>
      <dt>Opacity</dt><dd>${opacityIcon(p.opacity)} ${esc(opac)}</dd>
      ${p.productCode ? `<dt>Product code</dt><dd>${esc(p.productCode)}</dd>` : ''}
      <dt>Color</dt><dd>${esc(STATUS[p.status]?.long ?? '')}${p.lab ? ` <span class="muted small">(Lab ${p.lab.map((v) => v.toFixed(1)).join(', ')})</span>` : ''}</dd>
      ${p.colorNote ? `<dt>Color note</dt><dd>${esc(p.colorNote)}</dd>` : ''}
      ${p.note ? `<dt>Note</dt><dd class="note">⚠ ${esc(p.note)}</dd>` : ''}
      ${p.sourceUrl ? `<dt>Source</dt><dd><a href="${esc(p.sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(new URL(p.sourceUrl).hostname)}</a></dd>` : ''}
      <dt><label for="ts">Tinting strength</label></dt>
      <dd><input type="number" id="ts" min="${store.TS_MIN}" max="${store.TS_MAX}" step="0.1" value="${p.tintingStrength}" style="width:6em"> <span class="muted small">1 = normal. Raise it for strong tinters (e.g. phthalos) so the solver uses less.</span></dd>
    </dl>
    <div class="row">
      <button class="btn ${on ? '' : 'primary'}" data-action="toggle" data-id="${esc(p.id)}" ${pal ? '' : 'disabled'}>${on ? 'Remove from palette' : 'Add to palette'}</button>
      <button class="btn" data-action="capture" data-id="${esc(p.id)}">${p.status === 'measured' ? 'Re-measure swatch' : 'Add swatch photo'}</button>
      ${state.paintSettings[p.id]?.color ? `<button class="btn" data-action="clear-measured" data-id="${esc(p.id)}">Remove my measurement</button>` : ''}
      ${p.custom ? `<button class="btn danger" data-action="delete-custom" data-id="${esc(p.id)}">Delete paint</button>` : ''}
    </div>
    <h2 style="margin-top:18px">Same pigments (${same.length})</h2>
    ${same.length
      ? `<p class="muted small">These use exactly the same pigments, so they usually behave alike.</p><ul class="same">${same
          .map((s) => `<li><button data-action="detail" data-id="${esc(s.id)}">${swatch(s)}<span><strong>${esc(s.name)}</strong> <span class="muted small">${esc(s.brand)} · ${esc(s.line)}</span></span></button></li>`)
          .join('')}</ul>`
      : `<p class="muted small">${p.pigments.length ? 'No other library paint has exactly this pigment list.' : 'Pigments unknown, so nothing to compare.'}</p>`}
  `;
  $('ts').onchange = (e) => {
    try {
      const v = store.setTintingStrength(state, p.id, e.target.value);
      e.target.value = v;
      commit();
    } catch (err) {
      alert(err.message);
    }
  };
}

// ---- mix tab ---------------------------------------------------------------------------------------

function mixPalette() {
  const pal = store.getPalette(state);
  const inPal = (pal?.paintIds ?? []).map((id) => paintById.get(id)).filter(Boolean);
  return { pal, usable: inPal.filter((p) => p.lab), missing: inPal.filter((p) => !p.lab) };
}

function renderMixPalette() {
  const { pal, usable, missing } = mixPalette();
  if (!pal) return ($('mix-palette').textContent = 'Create a palette in My Paints first.');
  let txt = `Using ${usable.length} paint${usable.length === 1 ? '' : 's'} from "${pal.name}".`;
  if (missing.length) txt += ` ${missing.length} more will join once they have a swatch photo.`;
  $('mix-palette').textContent = txt;
}

const worker = new Worker(new URL('./solver.worker.js', import.meta.url), { type: 'module' });
let reqId = 0;
let lastTarget = null;
// A worker that fails to load or crashes reports here, not via onmessage.
worker.onerror = (e) => {
  e.preventDefault?.();
  mixProblem(`The recipe search could not run (${e.message || 'worker failed to load'}). Try reloading the page with Cmd+Shift+R.`);
};

/** Show a problem on the Mix tab as a visible warning, not small grey text. */
function mixProblem(html) {
  $('mix-status').className = 'banner';
  $('mix-status').innerHTML = html;
}
function mixStatus(text) {
  $('mix-status').className = 'muted small';
  $('mix-status').textContent = text;
}

worker.onmessage = ({ data }) => {
  if (data.id !== reqId) return; // a newer request replaced this one
  if (data.type === 'progress') $('mix-status').textContent = `Searching… ${Math.round(data.value * 100)}%`;
  if (data.type === 'error') mixProblem(`Something went wrong while searching: ${data.message}`);
  if (data.type === 'result') renderResults(data.result);
};

function runSolver() {
  const hex = $('hex').value.trim();
  const rgb = parseHex(hex);
  if (!rgb) return mixProblem('Enter a hex color like #5a7d6a.');
  const { pal, usable, missing } = mixPalette();
  if (!usable.length) {
    $('results').innerHTML = '';
    return mixProblem(
      (pal?.paintIds.length
        ? `None of the ${missing.length} paint${missing.length === 1 ? '' : 's'} in "${esc(pal.name)}" has a color yet, so there is nothing to mix with.`
        : `Your palette "${esc(pal?.name ?? '')}" is empty.`) +
        ` Go to <a href="#paints">My Paints</a> and tap <strong>+</strong> on paints with a colored circle (the Golden ones at the top), or add a swatch photo for your own paints.`
    );
  }
  lastTarget = labToHex(hexToLab(hex));
  check?.setTarget(lastTarget);
  $('results').innerHTML = '';
  mixStatus('Searching…');
  worker.postMessage({
    id: ++reqId,
    type: 'solve',
    targetLab: hexToLab(hex),
    paints: usable,
    options: { level: $('level').value, allow4: $('allow4').checked, suggestFrom: paints.filter((p) => p.lab) },
  });
}

function renderResults(res) {
  mixStatus(`${res.combosSearched} combinations searched in ${res.ms} ms.` + (res.fallback ? ' Nothing met this level, so here is the closest available.' : ''));
  const box = $('results');
  box.innerHTML = '';
  for (const r of res.recipes) box.append(recipeCard(r));
  if (res.suggestion) {
    const s = document.createElement('div');
    s.className = 'recipe';
    const sp = res.suggestion.paint;
    s.innerHTML = `<strong>Suggest a paint:</strong> adding <strong>${esc(sp.brand)} ${esc(sp.name)}</strong> would bring this to ΔE ${res.suggestion.deltaE.toFixed(1)} (${esc(res.suggestion.recipe.label)}).`;
    s.append(recipeCard(res.suggestion.recipe));
    box.append(s);
  }
}

const matchWords = (label) => ({ 'very close': 'Very close match', close: 'Close match', rough: 'Rough match', 'out of reach': 'Out of reach' })[label] ?? label;

function recipeCard(r) {
  const el = document.createElement('div');
  el.className = 'recipe';
  const names = r.paints.map((p) => p.name).join(' : ');
  el.innerHTML = `
    <div class="pair"><div style="background:${r.mixHex}"><span>predicted ${r.mixHex}</span></div><div style="background:${lastTarget}"><span>target ${lastTarget}</span></div></div>
    <div class="meta"><span class="match match-${r.label.replace(/ /g, '-')}">${esc(matchWords(r.label))}</span><span class="muted small" title="Color difference (CIEDE2000). Under 2 is hard to see.">ΔE ${r.deltaE.toFixed(1)}</span><button class="parts" data-action="parts" title="Tap to switch ratio / percent"></button><span class="muted small">${esc(names)}</span></div>
    <ol class="steps">${r.steps
      .map((s) => `<li>${esc(s.text)}${s.tinyAmounts ? ' <span class="warn">⚠ tiny amounts: strong tinter</span>' : ''}</li>`)
      .join('')}</ol>
    <button class="btn small" data-role="mixed">I mixed this: check it</button>`;
  el.querySelector('[data-role="mixed"]').onclick = () => check?.setRecipe(r);
  const btn = el.querySelector('.parts');
  btn.dataset.ratio = r.ratio;
  btn.dataset.percent = r.percent;
  btn.textContent = ui.partsMode === 'ratio' ? r.ratio : r.percent;
  return el;
}

// ---- events -----------------------------------------------------------------------------------------

function onAction(e) {
  const t = e.target.closest('[data-action]');
  if (!t) return;
  const { action, id } = t.dataset;
  const pal = store.getPalette(state);
  try {
    switch (action) {
      case 'toggle':
        if (!pal) store.createPalette(state, 'My palette');
        store.togglePaint(state, state.activePaletteId, id);
        commit();
        if ($('detail').open) renderDetail();
        break;
      case 'remove':
        store.togglePaint(state, pal.id, id);
        commit();
        break;
      case 'detail':
        openDetail(id);
        break;
      case 'close-detail':
        $('detail').close();
        break;
      case 'pick-role': {
        const i = Number(t.dataset.role);
        ui.fillingRole = ui.fillingRole === i ? null : i;
        if (ui.fillingRole !== null) {
          ui.query = pal.roles[i].query;
          $('search').value = ui.query;
        }
        renderAll();
        $('add-paints').open = true;
        $('search').scrollIntoView({ behavior: 'smooth', block: 'start' });
        break;
      }
      case 'open-library':
        setTab('paints');
        $('add-paints').open = true;
        $('add-paints').scrollIntoView({ behavior: 'smooth', block: 'start' });
        setTimeout(() => $('search').focus({ preventScroll: true }), 300);
        break;
      case 'cancel-role':
        ui.fillingRole = null;
        renderAll();
        break;
      case 'fill':
        store.fillRole(state, pal.id, ui.fillingRole, id);
        ui.fillingRole = null;
        commit();
        break;
      case 'new-palette': {
        const name = prompt('Palette name', `Palette ${state.palettes.length + 1}`);
        if (name === null) break;
        store.createPalette(state, name);
        ui.fillingRole = null;
        commit();
        break;
      }
      case 'rename-palette': {
        const name = prompt('Rename palette', pal.name);
        if (name) store.renamePalette(state, pal.id, name);
        commit();
        break;
      }
      case 'delete-palette':
        if (confirm(`Delete palette "${pal.name}"? Paints stay in the library.`)) {
          store.deletePalette(state, pal.id);
          ui.fillingRole = null;
          commit();
        }
        break;
      case 'delete-custom': {
        const p = paintById.get(id);
        if (confirm(`Delete custom paint "${p.name}"? It will be removed from all palettes.`)) {
          store.removeCustomPaint(state, id);
          $('detail').close();
          commit();
        }
        break;
      }
      case 'use-target':
        useTarget(t.dataset.hex);
        break;
      case 'capture':
        startCapture(id);
        break;
      case 'clear-measured': {
        const p = paintById.get(id);
        if (confirm(`Remove your measured color for "${p.name}"?`)) {
          store.clearMeasuredColor(state, id);
          commit();
          renderDetail();
        }
        break;
      }
      case 'export':
        download(`color-mixer-${new Date().toISOString().slice(0, 10)}.json`, store.exportState(state));
        break;
      case 'import':
        $('import-file').click();
        break;
      case 'parts':
        ui.partsMode = ui.partsMode === 'ratio' ? 'percent' : 'ratio';
        document.querySelectorAll('.parts').forEach((b) => (b.textContent = b.dataset[ui.partsMode]));
        break;
    }
  } catch (err) {
    alert(err.message);
  }
}

/** White paints with a color, the palette's own whites first. */
function whiteCandidates() {
  const pal = store.getPalette(state);
  const inPal = new Set(pal?.paintIds ?? []);
  return paints
    .filter((p) => p.lab && /white/i.test(p.name))
    .sort((a, b) => inPal.has(b.id) - inPal.has(a.id) || (b.status === 'measured') - (a.status === 'measured'));
}

function startCapture(id) {
  const paint = paintById.get(id);
  const whites = whiteCandidates().filter((w) => w.id !== id);
  if ($('detail').open) $('detail').close();
  openCapture($('capture'), {
    paint,
    whites,
    defaultWhiteId: whites[0]?.id ?? null,
    onSave: (m) => {
      store.setMeasuredColor(state, id, m);
      commit();
      openDetail(id);
    },
  });
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function bindEvents() {
  document.addEventListener('click', onAction);
  document.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => setTab(b.dataset.tab)));
  window.addEventListener('hashchange', () => setTab(location.hash.slice(1)));

  $('palette-select').onchange = (e) => {
    state.activePaletteId = e.target.value;
    ui.fillingRole = null;
    commit();
  };
  $('preset-select').onchange = (e) => {
    const key = e.target.value;
    e.target.value = '';
    if (!key) return;
    store.createPalette(state, PRESETS[key].name, key);
    ui.fillingRole = 0;
    ui.query = PRESETS[key].roles[0].query;
    $('search').value = ui.query;
    commit();
  };

  let t;
  $('search').oninput = (e) => {
    clearTimeout(t);
    t = setTimeout(() => {
      ui.query = e.target.value;
      renderLibrary();
    }, 80);
  };
  $('brand-filter').onchange = (e) => ((ui.brand = e.target.value), renderLibrary());
  $('usable-only').onchange = (e) => ((ui.usableOnly = e.target.checked), renderLibrary());

  const form = $('custom-form');
  form.picker.oninput = () => (form.hex.value = form.picker.value);
  form.onsubmit = (e) => {
    e.preventDefault();
    try {
      const paint = store.addCustomPaint(state, { name: form.pname.value, pigments: form.pigments.value, hex: form.hex.value });
      form.reset();
      commit();
      openDetail(paint.id);
    } catch (err) {
      alert(err.message);
    }
  };

  $('import-file').onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const next = store.importState(await file.text());
      if (!confirm(`Replace your current data with this file? (${next.palettes.length} palettes, ${next.customPaints.length} custom paints)`)) return;
      state = next;
      ui.fillingRole = null;
      commit();
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    }
  };

  $('picker').oninput = () => ($('hex').value = $('picker').value);
  $('hex').onchange = () => {
    const rgb = parseHex($('hex').value);
    if (rgb) $('picker').value = labToHex(hexToLab($('hex').value));
  };
  $('go').onclick = runSolver;
  $('save-target').onclick = () => {
    const hex = $('hex').value.trim();
    if (!parseHex(hex)) return mixProblem('Enter a hex color like #5a7d6a.');
    try {
      const lab = hexToLab(hex);
      store.addTarget(state, { lab, hex: labToHex(lab), source: 'hex' });
      commit();
      mixStatus('Color saved.');
    } catch (err) {
      alert(err.message);
    }
  };
  $('detail').addEventListener('close', () => (ui.detailId = null));
}

function renderAll() {
  renderPalette();
  renderGuide();
  renderLibrary();
  renderMixPalette();
  renderMixTargets();
  reference?.render();
}

/** Saved targets as quick chips on the Mix tab. */
function renderMixTargets() {
  $('mix-targets').innerHTML = state.targets.length
    ? '<span class="muted small" style="align-self:center">Saved:</span>' +
      state.targets
        .map((t, i) => `<button class="chip" data-action="use-target" data-hex="${esc(t.hex)}" title="Use ${esc(t.hex)}"><span class="num">${i + 1}</span><span class="sw" style="background:${esc(t.hex)}"></span></button>`)
        .join('')
    : '';
}

/** Put a color in the Mix tab's target and run the solver. */
function useTarget(hex) {
  $('hex').value = hex;
  $('picker').value = hex;
  setTab('mix');
  runSolver();
}

// ---- boot ---------------------------------------------------------------------------------------------

async function boot() {
  document.title = APP_NAME;
  $('app-name').textContent = APP_NAME;
  initTheme();
  try {
    const res = await fetch('paint-library.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    libraryFlat = flattenLibrary(await res.json());
  } catch (err) {
    showBanner(`Could not load paint-library.json (${err.message}). Open the app through a local server, not as a file.`);
    return;
  }
  if (!state.palettes.length) {
    store.createPalette(state, 'My palette');
    if (!loadError) persist(); // never overwrite data we failed to read
  }
  refreshPaints();
  renderBrandFilter();
  bindEvents();
  check = initCheck({
    root: $('check'),
    getPalette: () => mixPalette().usable,
    capture: (onLab) => openCapture($('capture'), { mode: 'mix', onSave: (m) => onLab(m.lab) }),
  });
  reference = initReference({ getState: () => state, commit, showBanner, useTarget, storage: safeStorage });
  renderAll();
  setTab(location.hash.slice(1) || 'paints');
  if (loadError) showBanner(loadError);
}

boot();

// Offline support (and "Add to Home Screen" on iPhone). Skipped on localhost so
// development always loads fresh files.
if ('serviceWorker' in navigator && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
