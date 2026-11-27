/* Tab Shelf — saves, sorts and reopens browser tabs.
 *
 * Privacy: everything lives in this browser's localStorage and in .json files you export.
 * Nothing is fetched or sent anywhere. The only network loads are site icons that the
 * extension captured (turn off "Show site icons" to stop those too).
 *
 * Data model (one object, saved as JSON):
 *   groups   [{ id, name, c }]                          shelves you name; c = colour 0–7
 *   sessions [{ id, name, createdAt, source }]          snapshots of tabs at one moment
 *   tabs     [{ id, url, title, fav, win, sessionId, groupId, addedAt }]
 * A tab always remembers the session it came from, and can sit on one shelf (groupId),
 * or none ("Unsorted").
 */
'use strict';

// The extension's ID is fixed by the public key in extension/manifest.json.
const EXT_ID = 'odimofkaeiedjjpnablahofeoaahfgog';
const STORE_KEY = 'tabshelf:v1';
const PREFS_KEY = 'tabshelf:prefs';
const MAX_OPEN = 60; // guard against opening hundreds of tabs by accident

/* ---------------------------------------------------------------- helpers */
const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const uid = (p = 't') => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const cleanId = (v, p) => (typeof v === 'string' && /^[\w-]{1,80}$/.test(v) ? v : uid(p));
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Only http(s) links are ever stored or opened. Returns the normalised href or null. */
function safeUrl(u) {
  if (typeof u !== 'string' || u.length > 4000) return null;
  try {
    const url = new URL(u.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch { return null; }
}

/** Site icons: https images, or small inline image data the extension captured. */
function safeIcon(u) {
  if (typeof u !== 'string') return '';
  if (/^data:image\/(png|gif|jpe?g|webp|x-icon|vnd\.microsoft\.icon|svg\+xml)[;,]/i.test(u)) return u.length < 24000 ? u : '';
  if (/^https:\/\//i.test(u) && u.length < 2000) return u;
  return '';
}

function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

/** Two URLs count as duplicates if they only differ by www, #fragment, trailing slash or tracking params. */
function dupKey(url) {
  try {
    const u = new URL(url);
    const params = [...u.searchParams].filter(([k]) => !/^(utm_|fbclid$|gclid$|mc_|ref$|ref_src$)/i.test(k));
    params.sort(([a], [b]) => a.localeCompare(b));
    const q = params.length ? '?' + new URLSearchParams(params).toString() : '';
    return u.hostname.replace(/^www\./, '').toLowerCase() + u.pathname.replace(/\/+$/, '') + q;
  } catch { return url; }
}

const fmtDate = (iso) => {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/* ---------------------------------------------------------------- state */
let state = { version: 1, groups: [], sessions: [], tabs: [] };
let prefs = { theme: null, icons: true };
const ui = { view: { kind: 'all' }, query: '' };

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) { state = sanitizeShelf(JSON.parse(raw)); pruneSessions(); }
    else seed();
  } catch { seed(); }
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')); } catch {}
}
function seed() {
  state = { version: 1, sessions: [], tabs: [], groups: ['School', 'Inspo', 'Read later'].map((name, i) => ({ id: uid('g'), name, c: i })) };
}
// a session whose tabs were all deleted or merged away has nothing left to show
const pruneSessions = () => { state.sessions = state.sessions.filter((s) => state.tabs.some((t) => t.sessionId === s.id)); };
function save() {
  pruneSessions();
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    toast('Browser storage is full. Export a backup, then delete old sessions.');
  }
}
const savePrefs = () => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch {} };

/** Undo: keep the state from just before a destructive change. */
let undoSnapshot = null;
function undoable(fn, message) {
  undoSnapshot = JSON.stringify(state);
  fn();
  save(); render();
  toast(typeof message === 'function' ? message() : message, { label: 'Undo', run: () => { state = JSON.parse(undoSnapshot); undoSnapshot = null; save(); render(); } });
}

/** Turn any loosely-shaped tab into a clean record, or null if its URL isn't http(s). */
function makeTab(t, sessionId) {
  const url = safeUrl(t.url);
  if (!url) return null;
  return {
    id: cleanId(t.id, 't'),
    url,
    title: str(t.title, 300) || url,
    fav: safeIcon(t.fav ?? t.favIconUrl),
    win: Number.isInteger(t.win ?? t.windowIndex) ? (t.win ?? t.windowIndex) : 1,
    sessionId: sessionId ?? (typeof t.sessionId === 'string' ? t.sessionId : null),
    groupId: typeof t.groupId === 'string' ? t.groupId : null,
    addedAt: str(t.addedAt, 40) || new Date().toISOString(),
  };
}

/** Validate a whole shelf (from storage or an imported file). Unknown fields are dropped. */
function sanitizeShelf(d) {
  const out = { version: 1, groups: [], sessions: [], tabs: [] };
  if (!d || typeof d !== 'object') return out;
  for (const g of Array.isArray(d.groups) ? d.groups : []) {
    const name = str(g?.name, 40);
    if (name) out.groups.push({ id: cleanId(g.id, 'g'), name, c: Number.isInteger(g.c) ? Math.abs(g.c) % 8 : out.groups.length % 8 });
  }
  for (const s of Array.isArray(d.sessions) ? d.sessions : []) {
    if (!s || typeof s !== 'object') continue;
    out.sessions.push({ id: cleanId(s.id, 's'), name: str(s.name, 80) || 'Session', createdAt: str(s.createdAt, 40) || new Date().toISOString(), source: str(s.source, 20) || 'import' });
  }
  const groupIds = new Set(out.groups.map((g) => g.id));
  const sessionIds = new Set(out.sessions.map((s) => s.id));
  for (const t of Array.isArray(d.tabs) ? d.tabs : []) {
    const tab = t && makeTab(t);
    if (!tab) continue;
    if (!groupIds.has(tab.groupId)) tab.groupId = null;
    if (!sessionIds.has(tab.sessionId)) tab.sessionId = null;
    out.tabs.push(tab);
  }
  return out;
}

/** Add a new session from a list of raw tabs. Returns { added, skipped }. */
function addSession({ id, name, createdAt, source, tabs }) {
  const session = { id: id || uid('s'), name: str(name, 80) || 'Session', createdAt: createdAt || new Date().toISOString(), source };
  const clean = tabs.map((t) => makeTab({ ...t, id: undefined }, session.id)).filter(Boolean);
  if (clean.length) {
    state.sessions.push(session);
    state.tabs.push(...clean);
  }
  return { added: clean.length, skipped: tabs.length - clean.length, session };
}

const groupById = (id) => state.groups.find((g) => g.id === id);
const sessionById = (id) => state.sessions.find((s) => s.id === id);

/* ---------------------------------------------------------------- what's on screen */
function viewTabs() {
  const v = ui.view;
  let list = state.tabs;
  if (v.kind === 'unsorted') list = list.filter((t) => !t.groupId);
  else if (v.kind === 'group') list = list.filter((t) => t.groupId === v.id);
  else if (v.kind === 'session') list = list.filter((t) => t.sessionId === v.id);
  const q = ui.query.toLowerCase();
  if (q) list = list.filter((t) => t.title.toLowerCase().includes(q) || t.url.toLowerCase().includes(q));
  return list;
}

function render() {
  // a view can disappear (deleted shelf/session): fall back to All tabs
  const v = ui.view;
  if ((v.kind === 'group' && !groupById(v.id)) || (v.kind === 'session' && !sessionById(v.id))) ui.view = { kind: 'all' };
  renderSide();
  renderMain();
}

function navItem({ label, count, active, dot, onClick, drop, when }) {
  const li = el('li');
  const b = el('button', 'nav-item' + (active ? ' active' : ''));
  b.type = 'button';
  if (dot !== undefined) { const d = el('span', 'dot'); if (dot !== null) d.dataset.c = dot; b.append(d); }
  const name = el('span', 'name', label);
  if (when) name.append(el('span', 'when', when));
  b.append(name, el('span', 'count', String(count)));
  b.addEventListener('click', () => { onClick(); document.body.classList.remove('side-open'); });
  if (drop !== undefined) makeDropTarget(b, drop);
  li.append(b);
  return li;
}

function renderSide() {
  const v = ui.view;
  const shelves = $('#shelfList');
  shelves.replaceChildren(
    navItem({ label: 'All tabs', count: state.tabs.length, active: v.kind === 'all', onClick: () => go({ kind: 'all' }) }),
    navItem({ label: 'Unsorted', count: state.tabs.filter((t) => !t.groupId).length, dot: null, active: v.kind === 'unsorted', drop: null, onClick: () => go({ kind: 'unsorted' }) }),
    ...state.groups.map((g) => navItem({
      label: g.name, count: state.tabs.filter((t) => t.groupId === g.id).length, dot: g.c,
      active: v.kind === 'group' && v.id === g.id, drop: g.id, onClick: () => go({ kind: 'group', id: g.id }),
    })),
  );

  const sessions = [...state.sessions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const list = $('#sessionList');
  list.replaceChildren(...sessions.map((s) => navItem({
    label: s.name, when: fmtDate(s.createdAt), count: state.tabs.filter((t) => t.sessionId === s.id).length,
    active: v.kind === 'session' && v.id === s.id, onClick: () => go({ kind: 'session', id: s.id }),
  })));
  if (!sessions.length) list.append(el('li', 'side-note', 'No sessions yet.'));
}

function go(view) { ui.view = view; render(); window.scrollTo(0, 0); }

function renderMain() {
  const v = ui.view;
  const h1 = $('#viewName');
  const tabs = viewTabs();
  let kind = 'Shelf', name = 'All tabs', meta = '', editable = null;
  const actions = [];

  if (v.kind === 'all') { kind = 'Everything'; meta = `${plural(state.tabs.length, 'tab')} across ${plural(state.sessions.length, 'session')}`; }
  if (v.kind === 'unsorted') { name = 'Unsorted'; meta = 'Tabs not on a shelf yet. Drag them onto one in the sidebar.'; }
  if (v.kind === 'group') {
    const g = groupById(v.id);
    name = g.name; editable = (val) => { g.name = val.slice(0, 40); };
    meta = plural(tabs.length, 'tab');
    actions.push(button('Delete shelf', 'btn small danger-ghost', () => confirmDelete(
      `Delete “${g.name}”?`, 'Its tabs are kept and go back to Unsorted.',
      () => undoable(() => { state.groups = state.groups.filter((x) => x !== g); state.tabs.forEach((t) => { if (t.groupId === g.id) t.groupId = null; }); }, `Deleted shelf “${g.name}”.`),
    )));
  }
  if (v.kind === 'session') {
    const s = sessionById(v.id);
    kind = 'Session'; name = s.name; editable = (val) => { s.name = val.slice(0, 80); };
    const wins = new Set(tabs.map((t) => t.win)).size;
    meta = `${fmtDate(s.createdAt)} · ${plural(tabs.length, 'tab')}${wins > 1 ? ` in ${wins} windows` : ''} · ${{ extension: 'from the extension', paste: 'pasted', import: 'imported' }[s.source] || ''}`;
    actions.push(button('Delete session', 'btn small danger-ghost', () => {
      const sorted = state.tabs.filter((t) => t.sessionId === s.id && t.groupId).length;
      confirmDelete(`Delete “${s.name}”?`,
        sorted ? `Its unsorted tabs are deleted. ${plural(sorted, 'tab')} already on a shelf will be kept.` : 'Its tabs are deleted too.',
        () => undoable(() => {
          state.sessions = state.sessions.filter((x) => x !== s);
          state.tabs = state.tabs.filter((t) => t.sessionId !== s.id || t.groupId);
          state.tabs.forEach((t) => { if (t.sessionId === s.id) t.sessionId = null; });
        }, `Deleted session “${s.name}”.`));
    }));
  }
  if (tabs.length) actions.unshift(button(ui.query ? `Open ${tabs.length} found` : 'Open all', 'btn small primary', () => openAll(tabs, v.kind === 'session')));

  $('#viewKind').textContent = ui.query ? `Search · ${kind}` : kind;
  h1.textContent = name;
  $('#viewMeta').textContent = ui.query ? `${plural(tabs.length, 'match')} for “${ui.query}”` : meta;
  $('#viewActions').replaceChildren(...actions);

  // rename sessions and shelves by editing the heading in place
  h1.contentEditable = editable ? 'true' : 'false';
  h1.title = editable ? 'Click to rename' : '';
  h1.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); h1.blur(); } if (e.key === 'Escape') { h1.textContent = name; h1.blur(); } };
  h1.onblur = editable ? () => {
    const val = h1.textContent.replace(/\s+/g, ' ').trim();
    if (val && val !== name) { editable(val); save(); renderSide(); } else h1.textContent = name;
  } : null;

  // the list (sessions with several windows get window headings)
  const list = $('#tabList');
  list.replaceChildren();
  const byWindow = v.kind === 'session' && new Set(tabs.map((t) => t.win)).size > 1;
  let lastWin = null;
  const sorted = byWindow ? [...tabs].sort((a, b) => a.win - b.win) : [...tabs].reverse();
  for (const t of sorted) {
    if (byWindow && t.win !== lastWin) { list.append(el('li', 'win-h', `Window ${t.win}`)); lastWin = t.win; }
    list.append(tabRow(t));
  }

  const empty = $('#empty');
  empty.hidden = tabs.length > 0;
  if (!tabs.length) renderEmpty(empty);
}

function renderEmpty(box) {
  box.replaceChildren();
  if (ui.query) { box.append(el('h2', null, 'Nothing matches'), el('p', null, 'Try part of a title or a site name.')); return; }
  if (state.tabs.length) {
    box.append(el('h2', null, 'This shelf is empty'), el('p', null, 'Drag tabs onto it in the sidebar, or use the “Move to” menu on any tab.'));
    return;
  }
  const row = el('div', 'row');
  row.append(button('Get from extension', 'btn primary', openExtDialog), button('Paste URLs', 'btn', openPaste), button('Import a backup', 'btn', () => $('#importFile').click()));
  box.append(el('h2', null, 'Nothing saved yet'),
    el('p', null, 'Click “Save all tabs” in the Tab Shelf extension, paste a list of links, or import a .json backup. Your tabs stay in this browser and in files you export.'), row);
}

function button(label, cls, onClick) {
  const b = el('button', cls, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

function favicon(t) {
  const box = el('span', 'fav');
  const d = domainOf(t.url);
  box.dataset.c = [...d].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 8;
  box.textContent = (d[0] || '?').toUpperCase();
  if (prefs.icons && t.fav) {
    const img = new Image();
    img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'; img.decoding = 'async';
    img.onload = () => box.replaceChildren(img);
    img.src = t.fav; // letter tile stays if the icon fails to load
  }
  return box;
}

/** Put text in a node, wrapping search matches in <mark> (no innerHTML). */
function highlight(node, text) {
  const q = ui.query.toLowerCase();
  const i = q ? text.toLowerCase().indexOf(q) : -1;
  if (i < 0) { node.textContent = text; return node; }
  node.append(text.slice(0, i), el('mark', null, text.slice(i, i + q.length)), text.slice(i + q.length));
  return node;
}

function tabRow(t) {
  const li = el('li', 'tab');
  li.draggable = true;
  li.dataset.id = t.id;
  li.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-tabshelf', t.id); e.dataTransfer.effectAllowed = 'move'; li.classList.add('dragging'); });
  li.addEventListener('dragend', () => li.classList.remove('dragging'));

  const body = el('div', 'tab-body');
  const a = el('a', 'tab-title');
  a.href = t.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.draggable = false; a.title = t.url;
  highlight(a, t.title);
  const sub = el('div', 'tab-sub');
  sub.append(highlight(el('span', 'domain'), domainOf(t.url)));
  const g = groupById(t.groupId);
  if (g && ui.view.kind !== 'group') { const c = el('span', 'chip', g.name); c.dataset.c = g.c; sub.append(c); }
  const s = sessionById(t.sessionId);
  if (s && ui.view.kind !== 'session') sub.append(el('span', null, s.name));
  body.append(a, sub);

  const tools = el('div', 'tab-tools');
  const move = el('select', 'move');
  move.setAttribute('aria-label', 'Move to shelf');
  move.append(new Option('Unsorted', ''), ...state.groups.map((x) => new Option(x.name, x.id)));
  move.value = t.groupId || '';
  move.addEventListener('change', () => moveTab(t.id, move.value || null));
  const open = el('button', 'btn small', 'Open');
  open.type = 'button';
  open.addEventListener('click', () => openAll([t], false));
  const del = el('button', 'icon-btn del');
  del.type = 'button';
  del.setAttribute('aria-label', `Delete ${t.title}`);
  del.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5 5 15"/></svg>'; // static markup only
  del.addEventListener('click', () => undoable(() => { state.tabs = state.tabs.filter((x) => x.id !== t.id); }, 'Tab deleted.'));
  tools.append(move, open, del);

  li.append(favicon(t), body, tools);
  return li;
}

/* ---------------------------------------------------------------- drag & drop (native HTML5, no library) */
function makeDropTarget(node, groupId) {
  node.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/x-tabshelf')) { e.preventDefault(); node.classList.add('drop'); } });
  node.addEventListener('dragleave', () => node.classList.remove('drop'));
  node.addEventListener('drop', (e) => {
    e.preventDefault(); node.classList.remove('drop');
    const id = e.dataTransfer.getData('text/x-tabshelf');
    if (id) moveTab(id, groupId);
  });
}
function moveTab(id, groupId) {
  const t = state.tabs.find((x) => x.id === id);
  if (!t || t.groupId === groupId) return;
  t.groupId = groupId;
  save(); render();
  toast(`Moved to ${groupId ? groupById(groupId).name : 'Unsorted'}.`);
}

/* ---------------------------------------------------------------- opening tabs */
async function openAll(tabs, keepWindows) {
  const urls = tabs.map((t) => safeUrl(t.url)).filter(Boolean);
  if (!urls.length) return;
  if (urls.length > MAX_OPEN) { toast(`That's ${urls.length} tabs. Narrow it down to ${MAX_OPEN} or fewer (search helps).`); return; }
  if (urls.length > 15 && !confirm(`Open ${urls.length} tabs?`)) return;

  // With the extension, restore the original windows; without it, the browser opens them here.
  if (urls.length > 1 && ext.ok) {
    const byWin = new Map();
    for (const t of tabs) if (safeUrl(t.url)) byWin.set(t.win, [...(byWin.get(t.win) || []), t.url]);
    const windows = keepWindows ? [...byWin.values()] : [urls];
    const res = await extSend({ type: 'openTabs', windows });
    if (res?.ok) { toast(`Opened ${plural(res.opened, 'tab')}${windows.length > 1 ? ` in ${windows.length} windows` : ' in a new window'}.`); return; }
  }
  for (const u of urls) window.open(u, '_blank', 'noopener,noreferrer');
  // window.open with noopener can't tell us if pop-ups were blocked, so give the hint for lists
  if (urls.length > 1) toast('If only one tab opened, allow pop-ups for this page (icon in the address bar), or load the extension.');
}

/* ---------------------------------------------------------------- talking to the extension */
const ext = { ok: false };
function extSend(msg, timeout = 4000) {
  return new Promise((resolve) => {
    const rt = window.chrome?.runtime;
    if (!rt?.sendMessage) return resolve(null);
    const timer = setTimeout(() => resolve(null), timeout);
    try {
      rt.sendMessage(EXT_ID, msg, (res) => {
        clearTimeout(timer);
        void rt.lastError; // reading it silences "receiving end does not exist"
        resolve(res ?? null);
      });
    } catch { clearTimeout(timer); resolve(null); }
  });
}
async function pingExt() {
  const res = await extSend({ type: 'ping' }, 1500);
  ext.ok = !!res?.ok;
  $('#extBtn').title = ext.ok ? 'Connected to the Tab Shelf extension' : 'Extension not found: see the README to load it';
}

function snapshotToSession(snap) {
  const reason = { manual: 'Saved', auto: 'Auto-save', startup: 'Chrome opened' }[snap.reason] || 'Snapshot';
  const d = new Date(snap.createdAt);
  return addSession({
    id: 'ext-' + cleanId(snap.id, 'x'),
    name: `${reason} · ${isNaN(d) ? '' : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`,
    createdAt: str(snap.createdAt, 40) || new Date().toISOString(),
    source: 'extension',
    tabs: Array.isArray(snap.tabs) ? snap.tabs : [],
  });
}
const isImported = (snap) => !!sessionById('ext-' + snap.id);

let extSnapshots = [];
async function openExtDialog() {
  const dlg = $('#extDlg');
  const list = $('#extList');
  list.replaceChildren();
  const res = await extSend({ type: 'getSnapshots' });
  ext.ok = !!res;
  extSnapshots = Array.isArray(res?.snapshots) ? [...res.snapshots].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))) : [];
  $('#extSaveNow').hidden = !ext.ok;
  $('#extImport').hidden = !ext.ok;
  if (!ext.ok) {
    $('#extSub').textContent = 'The Tab Shelf extension isn’t connected to this page. Load it from the tab-shelf/extension folder (chrome://extensions → Developer mode → Load unpacked). No extension? Use “Download .json” in its popup and Import the file, or paste your URLs.';
  } else {
    $('#extSub').textContent = extSnapshots.length ? 'The extension keeps your last 10 snapshots. New manual saves are ticked.' : 'No snapshots yet. Save your tabs now.';
    for (const s of extSnapshots) {
      const done = isImported(s);
      const lab = el('label');
      const cb = el('input');
      cb.type = 'checkbox'; cb.value = s.id; cb.checked = !done && s.reason === 'manual'; cb.disabled = done;
      const txt = el('span');
      txt.append(el('b', null, ({ manual: 'Saved by you', auto: 'Auto-save', startup: 'When Chrome opened' }[s.reason] || 'Snapshot')), el('br'), el('span', 'sm', fmtDate(s.createdAt)));
      lab.append(cb, txt, el('span', 'sm', done ? 'Imported' : plural(s.tabs?.length || 0, 'tab')));
      const li = el('li'); li.append(lab); list.append(li);
    }
  }
  dlg.showModal();
}
$('#extDlg').addEventListener('close', async () => {
  const v = $('#extDlg').returnValue;
  if (v === 'save') {
    const res = await extSend({ type: 'saveNow' });
    if (res?.snapshot) { const r = snapshotToSession(res.snapshot); save(); go({ kind: 'session', id: r.session.id }); toast(`Saved ${plural(r.added, 'tab')}.`); }
    else toast('The extension didn’t answer. Is it loaded?');
  }
  if (v === 'import') {
    const ids = [...$('#extList').querySelectorAll('input:checked')].map((c) => c.value);
    let n = 0, last = null;
    for (const s of extSnapshots) if (ids.includes(s.id) && !isImported(s)) { const r = snapshotToSession(s); n += r.added; last = r.session; }
    save();
    if (last) go({ kind: 'session', id: last.id });
    toast(ids.length ? `Imported ${plural(n, 'tab')}.` : 'Nothing selected.');
  }
});

/** Opened by the extension's popup with ?from=extension: pull in the newest manual save. */
async function autoPullFromExtension() {
  if (new URLSearchParams(location.search).get('from') !== 'extension') return;
  history.replaceState(null, '', location.pathname);
  const res = await extSend({ type: 'getSnapshots' });
  const fresh = (res?.snapshots || []).filter((s) => s.reason === 'manual' && !isImported(s))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  if (!fresh) return;
  const r = snapshotToSession(fresh);
  save(); go({ kind: 'session', id: r.session.id });
  toast(`Saved ${plural(r.added, 'tab')} from Chrome.`);
}

/* ---------------------------------------------------------------- paste URLs */
function openPaste() {
  $('#pasteText').value = '';
  $('#pasteName').value = 'Pasted ' + new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  $('#pasteDlg').showModal();
  $('#pasteText').focus();
}
$('#pasteDlg').addEventListener('close', () => {
  if ($('#pasteDlg').returnValue !== 'ok') return;
  const found = $('#pasteText').value.match(/https?:\/\/[^\s<>"'`]+/gi) || [];
  const tabs = found.map((u) => u.replace(/[),.;:!?\]]+$/, '')).map((url) => ({ url, title: '' }));
  if (!tabs.length) { toast('No http:// or https:// links found.'); return; }
  const r = addSession({ name: $('#pasteName').value, source: 'paste', tabs });
  for (const t of state.tabs) if (t.sessionId === r.session.id && t.title === t.url) {
    // no outside lookups for real titles, so make a readable one from the address
    const u = new URL(t.url);
    const last = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || '').replace(/[-_]+/g, ' ').replace(/\.\w+$/, '');
    t.title = last ? `${last} · ${domainOf(t.url)}` : domainOf(t.url);
  }
  save(); go({ kind: 'session', id: r.session.id });
  toast(`Added ${plural(r.added, 'tab')}.`);
});

/* ---------------------------------------------------------------- duplicates */
function findDuplicates() {
  const sets = new Map();
  for (const t of state.tabs) {
    const k = dupKey(t.url);
    if (!sets.has(k)) sets.set(k, []);
    sets.get(k).push(t);
  }
  return [...sets.values()].filter((s) => s.length > 1);
}
/** Keep one copy: the one on a shelf if any, otherwise the newest. It inherits a shelf from the others. */
function mergeSet(set) {
  const keep = [...set].sort((a, b) => (!!b.groupId - !!a.groupId) || b.addedAt.localeCompare(a.addedAt))[0];
  keep.groupId ||= set.find((t) => t.groupId)?.groupId || null;
  // pasted links only have a made-up title; borrow a real one from a copy the extension saved
  const realTitle = (t) => t.title !== t.url && sessionById(t.sessionId)?.source !== 'paste';
  if (!realTitle(keep)) keep.title = set.find(realTitle)?.title || keep.title;
  const drop = new Set(set.filter((t) => t !== keep).map((t) => t.id));
  state.tabs = state.tabs.filter((t) => !drop.has(t.id));
  return drop.size;
}
function openDupDialog() {
  const sets = findDuplicates();
  const list = $('#dupList');
  list.replaceChildren();
  const extra = sets.reduce((n, s) => n + s.length - 1, 0);
  $('#dupSub').textContent = sets.length
    ? `${plural(sets.length, 'page')} saved more than once (${extra} extra ${extra === 1 ? 'copy' : 'copies'}). Merging keeps one copy, preferring one that's already on a shelf.`
    : 'No duplicates. Every saved page is unique.';
  $('#dupAll').hidden = !sets.length;
  for (const set of sets) {
    const li = el('li', 'dup');
    const top = el('div', 'dup-top');
    const body = el('div', 'tab-body');
    body.append(el('span', 'tab-title', set[0].title), el('span', 'domain', domainOf(set[0].url)));
    const b = button(`Merge ${set.length}`, 'btn small', () => {
      undoable(() => mergeSet(set), 'Merged duplicates.');
      li.remove();
      if (!list.children.length) $('#dupDlg').close();
    });
    top.append(favicon(set[0]), body, b);
    const where = set.map((t) => groupById(t.groupId)?.name || sessionById(t.sessionId)?.name || 'Unsorted');
    li.append(top, el('div', 'dup-where', 'In: ' + where.join(' · ')));
    list.append(li);
  }
  $('#dupDlg').showModal();
}
$('#dupDlg').addEventListener('close', () => {
  if ($('#dupDlg').returnValue !== 'all') return;
  let n = 0;
  undoable(() => { for (const set of findDuplicates()) n += mergeSet(set); }, () => `Removed ${plural(n, 'duplicate')}.`);
});

/* ---------------------------------------------------------------- export / import */
function download(name, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = el('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function exportAll() {
  // file name matches the tabs-*.json rule in .gitignore, so a stray export can't be committed
  const d = new Date(), p2 = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}`;
  download(`tabs-${stamp}.json`, { app: 'tab-shelf', kind: 'shelf', version: 1, exportedAt: new Date().toISOString(), ...state });
  toast(`Exported ${plural(state.tabs.length, 'tab')}. Keep the file somewhere safe (not in the repo).`);
}

let pendingImport = null;
async function readImport(file) {
  if (!file) return;
  if (file.size > 20e6) { toast('That file is too big to be a Tab Shelf backup.'); return; }
  let data;
  try { data = JSON.parse(await file.text()); } catch { toast('That file isn’t valid JSON.'); return; }

  if (data?.kind === 'extension-snapshots' && Array.isArray(data.snapshots)) {
    // a file downloaded from the extension popup: each snapshot becomes a session
    let n = 0, last = null, skipped = 0;
    for (const s of data.snapshots) {
      if (!s || typeof s !== 'object') continue;
      if (isImported({ id: cleanId(s.id, 'x') })) { skipped++; continue; }
      const r = snapshotToSession(s); n += r.added; if (r.added) last = r.session;
    }
    save();
    if (last) go({ kind: 'session', id: last.id }); else render();
    toast(`Imported ${plural(n, 'tab')} from the extension file${skipped ? ` (${skipped} already here)` : ''}.`);
    return;
  }
  if (!Array.isArray(data?.tabs)) { toast('This doesn’t look like a Tab Shelf backup.'); return; }
  pendingImport = sanitizeShelf(data);
  const p = pendingImport;
  $('#importSummary').textContent = `${file.name}: ${plural(p.tabs.length, 'tab')}, ${plural(p.sessions.length, 'session')}, ${plural(p.groups.length, 'shelf')}`.replace('shelfs', 'shelves') +
    `. Merge adds anything new to what you have (${plural(state.tabs.length, 'tab')}). Replace throws away what's here first.`;
  $('#importDlg').showModal();
}
function mergeShelf(inc) {
  const groupMap = new Map(); // incoming group id -> local id
  for (const g of inc.groups) {
    const same = state.groups.find((x) => x.id === g.id || x.name.toLowerCase() === g.name.toLowerCase());
    if (same) groupMap.set(g.id, same.id);
    else { state.groups.push(g); groupMap.set(g.id, g.id); }
  }
  for (const s of inc.sessions) if (!sessionById(s.id)) state.sessions.push(s);
  const have = new Set(state.tabs.map((t) => t.id));
  let added = 0;
  for (const t of inc.tabs) {
    if (have.has(t.id)) continue;
    state.tabs.push({ ...t, groupId: t.groupId ? groupMap.get(t.groupId) ?? null : null });
    added++;
  }
  return added;
}
$('#importDlg').addEventListener('close', () => {
  const v = $('#importDlg').returnValue;
  if (!pendingImport || (v !== 'merge' && v !== 'replace')) { pendingImport = null; return; }
  const inc = pendingImport; pendingImport = null;
  if (v === 'replace') undoable(() => { state = inc; ui.view = { kind: 'all' }; }, `Replaced with ${plural(inc.tabs.length, 'tab')} from the backup.`);
  else { let n = 0; undoable(() => { n = mergeShelf(inc); }, () => `Merged in ${plural(n, 'new tab')}.`); }
});

/* ---------------------------------------------------------------- small UI bits */
let toastTimer;
function toast(msg, action) {
  const t = $('#toast');
  t.replaceChildren(msg);
  if (action) { t.append(' '); const b = button(action.label, 'link', () => { action.run(); t.hidden = true; }); t.append(b); }
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, action ? 7000 : 3500);
}

function confirmDelete(title, text, onYes) {
  $('#confirmTitle').textContent = title;
  $('#confirmText').textContent = text;
  const dlg = $('#confirmDlg');
  dlg.onclose = () => { if (dlg.returnValue === 'ok') onYes(); };
  dlg.showModal();
}

function applyTheme() {
  if (prefs.theme) document.documentElement.dataset.theme = prefs.theme;
  else delete document.documentElement.dataset.theme;
}
function toggleTheme() {
  const dark = prefs.theme ? prefs.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  prefs.theme = dark ? 'light' : 'dark';
  savePrefs(); applyTheme();
}

/* ---------------------------------------------------------------- wire up */
load();
applyTheme();
$('#iconsToggle').checked = prefs.icons;
$('#iconsToggle').addEventListener('change', (e) => { prefs.icons = e.target.checked; savePrefs(); render(); });
$('#search').addEventListener('input', (e) => { ui.query = e.target.value.trim(); renderMain(); });
$('#extBtn').addEventListener('click', openExtDialog);
$('#pasteBtn').addEventListener('click', openPaste);
$('#dupBtn').addEventListener('click', openDupDialog);
$('#exportBtn').addEventListener('click', exportAll);
$('#sideExport').addEventListener('click', exportAll);
$('#importBtn').addEventListener('click', () => $('#importFile').click());
$('#importFile').addEventListener('change', (e) => { readImport(e.target.files[0]); e.target.value = ''; });
$('#themeBtn').addEventListener('click', toggleTheme);
$('#menuBtn').addEventListener('click', () => {
  const open = document.body.classList.toggle('side-open');
  $('#menuBtn').setAttribute('aria-expanded', String(open));
});
document.addEventListener('click', (e) => {
  if (document.body.classList.contains('side-open') && !e.target.closest('#side, #menuBtn')) document.body.classList.remove('side-open');
});
$('#newGroupForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('#newGroupName').value.trim().slice(0, 40);
  if (!name) return;
  if (state.groups.some((g) => g.name.toLowerCase() === name.toLowerCase())) { toast(`There's already a shelf called “${name}”.`); return; }
  const g = { id: uid('g'), name, c: state.groups.length % 8 };
  state.groups.push(g);
  $('#newGroupName').value = '';
  save(); go({ kind: 'group', id: g.id });
});
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !e.target.closest('input, textarea, [contenteditable="true"]')) { e.preventDefault(); $('#search').focus(); }
});
// keep tabs in sync if Tab Shelf is open in two browser tabs
window.addEventListener('storage', (e) => { if (e.key === STORE_KEY && e.newValue) { state = sanitizeShelf(JSON.parse(e.newValue)); render(); } });

render();
pingExt().then(autoPullFromExtension);
