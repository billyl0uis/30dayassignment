/* Hot Shop Atlas — map + directory of US glass studios.
   Plain JS, no build step. Data lives in studios.json (see README). */

// ---------- Vocabulary ----------
// JSON uses short snake_case keys (easy to type, no em dashes to get wrong);
// these tables turn them into the labels people see.
// `code` is the family prefix on the chart (HS-027); `short` labels the
// family strip; `lightText` marks dark swatches that need white text on top,
// `darkText` light ones that must stay ink in every palette.
const TYPES = {
  hot_shop:     { label: 'Hot shop',          short: 'Hot shop', code: 'HS', color: 'var(--t-hot)' },
  flameworking: { label: 'Flameworking',      short: 'Flame',    code: 'FW', color: 'var(--t-flame)', lightText: true },
  kiln:         { label: 'Kiln / warm glass', short: 'Kiln',     code: 'KG', color: 'var(--t-kiln)', lightText: true },
  neon:         { label: 'Neon',              short: 'Neon',     code: 'NE', color: 'var(--t-neon)', darkText: true },
  mixed:        { label: 'Mixed',             short: 'Mixed',    code: 'MX', color: 'var(--t-mixed)' },
};
const chartCode = (s) => TYPES[s.type].code + (s.no ? '-' + String(s.no).padStart(3, '0') : '');
const ACCESS = {
  public_rental:       'Public rental',
  classes:             'Classes',
  open_visits:         'Open studio visits',
  private_appointment: 'Private — by appointment',
  private_closed:      'Private — closed',
};
const OFFERS = {
  rentals:             'Rentals',
  classes:             'Classes',
  glory_hole_rental:   'Glory hole rental',
  gallery:             'Gallery',
  residencies:         'Residencies',
  assistant_positions: 'TA / assistant positions',
};
const US_CENTER = [39.5, -98.35];

// ---------- State ----------
const state = {
  studios: [],          // normalized, valid entries
  byId: new Map(),
  markers: new Map(),   // id -> L.Marker
  filtered: [],
  q: '',
  types: new Set(),     // empty = all
  st: '',
  access: '',
  offers: new Set(),    // must have all
  sort: 'name',
  you: null,            // {lat, lng} once "Near me" is used
  activeId: null,
  lastId: null,         // last studio opened; outlined when you go back to the list
};

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k === 'style') n.style.cssText = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) n.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) n.append(kid);
  return n;
};
const isPhone = () => matchMedia('(max-width: 760px)').matches;
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const ICONS = {
  back: 'M13 8H3M7 4L3 8l4 4',
  prev: 'M10 3L5 8l5 5',
  next: 'M6 3l5 5-5 5',
  out: 'M3 8h10M9 4l4 4-4 4',
};
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16'); svg.setAttribute('class', 'ico'); svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICONS[name]); svg.append(path);
  return svg;
}

// ---------- Map ----------
const map = L.map('map', {
  zoomControl: !isPhone(),
  attributionControl: false,
  worldCopyJump: true,
}).setView(US_CENTER, 4);

L.control.attribution({ position: isPhone() ? 'topright' : 'bottomright', prefix: false }).addTo(map);

// Standard OpenStreetMap tiles: free, no key, fine for a low-traffic hobby
// site under OSM's tile usage policy as long as the attribution stays visible.
// The tiles are partly desaturated in CSS (.leaflet-tile-pane) so the swatch
// colours on the pins carry the meaning.
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

// animate: false — pins jump straight to their spot instead of sliding out of
// clusters. A slide that gets paused (background tab, slow phone) can leave a
// pin frozen part-way, miles from its studio.
const clusters = L.markerClusterGroup({
  animate: false,
  disableClusteringAtZoom: 15, // at street level every studio gets its own pin
  showCoverageOnHover: false,
  maxClusterRadius: 45,
  spiderfyOnMaxZoom: true,
  iconCreateFunction: (c) => L.divIcon({
    html: `<div>${c.getChildCount()}</div>`,
    className: 'marker-cluster',
    iconSize: [42, 42],
  }),
});
map.addLayer(clusters);
let youMarker = null;

function pinIcon(s, active = false) {
  // The pin is a small swatch carrying its family code, so type reads by text
  // as well as colour. The selected pin also shows its full chart code.
  // Pin label style comes from <html data-pin>: "code" (HS), "number" (027) or "dot".
  const t = TYPES[s.type];
  const mode = document.documentElement.dataset.pin || 'code';
  const cls = ['pin', s.precision === 'city' && 'approx', t.darkText && 'dark-text', t.lightText && 'light-text',
    active && 'active', mode === 'dot' && 'as-dot'].filter(Boolean).join(' ');
  const text = mode === 'number' && s.no ? String(s.no).padStart(3, '0') : mode === 'dot' ? '' : t.code;
  const label = active ? `<span class="pin-label">${chartCode(s)}</span>` : '';
  // On phones the tappable area is at least 44x44 around the swatch.
  const [w, h] = isPhone() ? [44, 44] : mode === 'dot' ? [20, 20] : [42, 24];
  return L.divIcon({
    className: '',
    html: `<div class="pin-hit"><div class="${cls}" style="--c:${t.color}">${text}${label}</div></div>`,
    iconSize: [w, h],
    iconAnchor: [w / 2, h / 2],
  });
}

// ---------- Data loading + validation ----------
function cleanUrl(u) {
  if (!u || typeof u !== 'string') return null;
  try {
    const url = new URL(u.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch { return null; }
}
function instagramUrl(v) {
  if (!v) return null;
  if (/^https?:/i.test(v)) return cleanUrl(v);
  const handle = v.trim().replace(/^@/, '');
  return /^[\w.]{1,30}$/.test(handle) ? `https://www.instagram.com/${handle}/` : null;
}

/* Turns one raw JSON entry into the shape the app uses, or returns a list of
   problems. Privacy rule: anything not explicitly "exact" is treated as
   city-level — the street address is hidden and coordinates are rounded to
   2 decimals (~1 km), so a home studio entered with exact coordinates by
   mistake still doesn't get a doorstep pin. */
function normalize(raw) {
  const problems = [];
  if (!raw || typeof raw !== 'object') return { problems: ['not an object'] };
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!/^[a-z0-9-]+$/.test(id)) problems.push('id must be lowercase-with-dashes');
  if (!raw.name) problems.push('missing name');
  if (!TYPES[raw.type]) problems.push(`unknown type "${raw.type}"`);
  const lat = Number(raw.lat), lng = Number(raw.lng);
  if (raw.lat === '' || raw.lat == null || !Number.isFinite(lat) || Math.abs(lat) > 90) problems.push('bad lat');
  if (raw.lng === '' || raw.lng == null || !Number.isFinite(lng) || Math.abs(lng) > 180) problems.push('bad lng');
  if (raw.access && !ACCESS[raw.access]) problems.push(`unknown access "${raw.access}"`);
  if (problems.length) return { problems };

  const precision = raw.location_precision === 'exact' ? 'exact' : 'city';
  const round = (n) => Math.round(n * 100) / 100;
  const offers = (Array.isArray(raw.offers) ? raw.offers : []).filter((o) => OFFERS[o]);

  const no = Number.isInteger(raw.no) && raw.no > 0 ? raw.no : null;

  return {
    studio: {
      id,
      no,
      name: String(raw.name),
      type: raw.type,
      access: raw.access || '',
      city: raw.city || '',
      state: (raw.state || '').toUpperCase(),
      address: precision === 'exact' ? (raw.address || '') : '',
      lat: precision === 'exact' ? lat : round(lat),
      lng: precision === 'exact' ? lng : round(lng),
      precision,
      website: cleanUrl(raw.website),
      instagram: instagramUrl(raw.instagram),
      shop_url: cleanUrl(raw.shop_url),
      other_links: (Array.isArray(raw.other_links) ? raw.other_links : [])
        .map((l) => (typeof l === 'string' ? { label: 'Link', url: cleanUrl(l) } : { label: l?.label || 'Link', url: cleanUrl(l?.url) }))
        .filter((l) => l.url),
      offers,
      description: raw.description || '',
      founded: raw.founded || '',
      last_verified: raw.last_verified || '',
      source: raw.source || '',
    },
  };
}

async function load() {
  let raw;
  try {
    const res = await fetch('studios.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    raw = await res.json();
  } catch (err) {
    const fileHint = location.protocol === 'file:'
      ? 'Browsers block loading data from a file opened directly. Run a local server (see README).'
      : `Couldn't read studios.json (${err.message}). Check it for a missing comma or bracket.`;
    showStatus(fileHint);
    raw = [];
  }
  const list = Array.isArray(raw) ? raw : (raw.studios || []);

  const skipped = [];
  list.forEach((entry, i) => {
    const { studio, problems } = normalize(entry);
    if (problems) { skipped.push(`#${i + 1} ${entry?.name || entry?.id || ''}: ${problems.join(', ')}`); return; }
    if (state.byId.has(studio.id)) { skipped.push(`#${i + 1} ${studio.name}: duplicate id "${studio.id}"`); return; }
    state.byId.set(studio.id, studio);
    state.studios.push(studio);
  });
  if (skipped.length) {
    console.warn('[Hot Shop Atlas] Skipped entries in studios.json:\n' + skipped.join('\n'));
    showStatus(`${skipped.length} entr${skipped.length === 1 ? 'y' : 'ies'} in studios.json skipped — open the browser console for details.`);
  }

  for (const s of state.studios) {
    const m = L.marker([s.lat, s.lng], { icon: pinIcon(s), title: s.name, keyboard: true });
    m.on('click', () => select(s.id));
    state.markers.set(s.id, m);
  }

  const n = state.studios.length;
  $('tagline').replaceChildren(el('span', { class: 'long' }, 'Chart of US glass studios · '), el('span', { class: 'count' }, `${n} swatch${n === 1 ? '' : 'es'}`));

  buildFilters();
  apply();

  if (state.studios.length) {
    const sheetH = isPhone() ? $('panel').getBoundingClientRect().height : 0;
    map.fitBounds(L.latLngBounds(state.studios.map((s) => [s.lat, s.lng])), {
      paddingTopLeft: [40, 40], paddingBottomRight: [40, 40 + sheetH], maxZoom: 9, animate: false,
    });
  }
  openFromUrl();
}

function showStatus(msg) {
  const s = $('status');
  s.textContent = msg;
  s.hidden = !msg;
}

// ---------- Filters ----------
function buildFilters() {
  const typeChips = $('typeChips');
  for (const [key, t] of Object.entries(TYPES)) {
    const n = state.studios.filter((s) => s.type === key).length;
    const chip = el('button', {
      class: `fam${n ? '' : ' zero'}`, type: 'button', 'aria-pressed': 'false', style: `--c:${t.color}`,
      'aria-label': `${t.label}: ${n} studio${n === 1 ? '' : 's'}`,
      onclick: () => { toggle(state.types, key, chip); apply(); },
    }, t.short, el('span', { class: 'code' }, `${t.code} ${n}`));
    typeChips.append(chip);
  }
  const offerChips = $('offerChips');
  for (const [key, label] of Object.entries(OFFERS)) {
    const chip = el('button', { class: 'chip', type: 'button', 'aria-pressed': 'false', onclick: () => {
      toggle(state.offers, key, chip); apply();
    } }, label);
    offerChips.append(chip);
  }
  // Only list states that actually have studios.
  const states = [...new Set(state.studios.map((s) => s.state).filter(Boolean))].sort();
  for (const st of states) $('stateSel').append(el('option', { value: st }, st));
  for (const [key, label] of Object.entries(ACCESS)) $('accessSel').append(el('option', { value: key }, label));

  $('q').addEventListener('input', (e) => { state.q = e.target.value; apply(); });
  $('q').addEventListener('focus', () => { if (isPhone() && sheet() === 'peek') setSheet('half'); });
  $('stateSel').addEventListener('change', (e) => { state.st = e.target.value; apply(); });
  $('accessSel').addEventListener('change', (e) => { state.access = e.target.value; apply(); });
  $('sortSel').addEventListener('change', (e) => { state.sort = e.target.value; apply(); });
  $('clearFilters').addEventListener('click', () => clearFilters());
}
function clearFilters() {
  {
    state.types.clear(); state.offers.clear(); state.st = ''; state.access = ''; state.q = '';
    $('q').value = ''; $('stateSel').value = ''; $('accessSel').value = '';
    document.querySelectorAll('.chip, .fam').forEach((c) => c.setAttribute('aria-pressed', 'false'));
    apply();
  }
}
function toggle(set, key, chip) {
  set.has(key) ? set.delete(key) : set.add(key);
  chip.setAttribute('aria-pressed', String(set.has(key)));
}

const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function haystack(s) {
  return fold([s.name, chartCode(s), s.city, s.state, s.description, TYPES[s.type].label, ACCESS[s.access] || '', ...s.offers.map((o) => OFFERS[o])].join(' '));
}

function apply() {
  const words = fold(state.q).split(/\s+/).filter(Boolean);
  state.filtered = state.studios.filter((s) => {
    if (state.types.size && !state.types.has(s.type)) return false;
    if (state.st && s.state !== state.st) return false;
    if (state.access && s.access !== state.access) return false;
    for (const o of state.offers) if (!s.offers.includes(o)) return false;
    if (words.length) { const h = haystack(s); if (!words.every((w) => h.includes(w))) return false; }
    return true;
  });

  const byName = (a, b) => a.name.localeCompare(b.name);
  const sorters = {
    name: byName,
    state: (a, b) => a.state.localeCompare(b.state) || a.city.localeCompare(b.city) || byName(a, b),
    code: (a, b) => (a.no ?? 1e9) - (b.no ?? 1e9) || byName(a, b),
    distance: (a, b) => distance(a) - distance(b),
  };
  state.filtered.sort(sorters[state.sort] || byName);

  const n = state.types.size + state.offers.size + (state.st ? 1 : 0) + (state.access ? 1 : 0);
  $('filterCount').textContent = n ? `· ${n}` : '';

  clusters.clearLayers();
  clusters.addLayers(state.filtered.map((s) => state.markers.get(s.id)));
  renderList();
}

// ---------- List ----------
function renderList() {
  const list = $('list');
  list.replaceChildren();
  const total = state.studios.length;
  $('count').textContent = total
    ? (state.filtered.length === total ? `${total} studio${total === 1 ? '' : 's'}` : `${state.filtered.length} of ${total} studios`)
    : '';
  $('count').classList.toggle('filtered', state.filtered.length !== total);

  if (!total) {
    list.append(el('li', { class: 'empty' },
      el('strong', {}, 'No studios yet'),
      'Add entries to ', el('code', {}, 'studios.json'), ' and refresh. The README shows the format.'));
    return;
  }
  if (!state.filtered.length) {
    const fams = [...state.types].map((k) => TYPES[k].label.toLowerCase());
    const none = fams.length && state.studios.every((s) => !state.types.has(s.type));
    list.append(el('li', { class: 'empty' },
      el('strong', {}, none ? `No ${fams.join(' or ')} studios yet` : 'No swatches match'),
      el('p', {}, none
        ? 'The chart only lists studios checked against their own website, and none of this type have been added yet.'
        : 'Nothing on the chart fits these filters.'),
      el('button', { class: 'btn', type: 'button', onclick: () => clearFilters() }, 'Clear filters')));
    return;
  }
  for (const s of state.filtered) {
    const t = TYPES[s.type];
    const where = [s.city, s.state].filter(Boolean).join(', ');
    const meta = [where, ACCESS[s.access]].filter(Boolean).join(' · ');
    const btn = el('button', {
      class: ['item', s.id === state.lastId && 'sel', t.lightText && 'light-text', t.darkText && 'dark-text'].filter(Boolean).join(' '),
      type: 'button', style: `--c:${t.color}`,
      'data-id': s.id,
      'aria-label': `${s.name}, ${t.label}${where ? ', ' + where : ''}`,
      onclick: (e) => choose(s.id, e.currentTarget),
      onmouseenter: () => highlight(s.id, true),
      onmouseleave: () => highlight(s.id, false),
    },
      el('span', { class: `swatch${s.precision === 'city' ? ' approx' : ''}`, 'aria-hidden': 'true' }),
      el('span', { class: 'code', 'aria-hidden': 'true' }, chartCode(s)),
      el('span', { class: 'txt' },
        el('span', { class: 'name' }, s.name),
        el('span', { class: 'meta' }, meta || t.label)),
      state.you ? el('span', { class: 'dist' }, formatMiles(distance(s))) : null);
    list.append(el('li', {}, btn));
  }
}

// Signature move: the chosen row's swatch floods across the row, then the
// studio opens under a band of the same colour.
function choose(id, row) {
  if (reduceMotion()) { select(id); return; }
  row.classList.add('flooding');
  setTimeout(() => select(id), 280);
}

function highlight(id, on) {
  const m = state.markers.get(id);
  if (m && id !== state.activeId) m.setIcon(pinIcon(state.byId.get(id), on));
}

// ---------- Detail ----------
function select(id, { push = true } = {}) {
  const s = state.byId.get(id);
  if (!s) return;
  if (state.activeId && state.activeId !== id) {
    const prev = state.markers.get(state.activeId);
    prev?.setIcon(pinIcon(state.byId.get(state.activeId)));
  }
  state.activeId = id;
  state.lastId = id;
  const m = state.markers.get(id);
  m.setIcon(pinIcon(s, true));

  renderDetail(s);
  $('listView').hidden = true;
  $('detailView').hidden = false;
  $('detail').scrollTop = 0;
  if (isPhone()) setSheet('half');

  // If the studio is hidden by filters it isn't on the map; add it back
  // temporarily so a shared link always shows its pin.
  if (!clusters.hasLayer(m)) clusters.addLayer(m);
  // Jump (no animation) so this never races another zoom in progress. At
  // zoom 15+ clustering is off, so the studio's own pin is always visible.
  centerOn(m.getLatLng(), Math.max(map.getZoom(), s.precision === 'city' ? 11 : 15));

  if (push) setUrl(id);
  document.title = `${s.name} — Hot Shop Atlas`;
}

function closeDetail({ push = true } = {}) {
  if (state.activeId) {
    state.markers.get(state.activeId)?.setIcon(pinIcon(state.byId.get(state.activeId)));
  }
  state.activeId = null;
  $('detailView').hidden = true;
  $('listView').hidden = false;
  apply(); // drops a temporarily-added marker if filters hide it
  if (push) setUrl(null);
  document.title = 'Hot Shop Atlas';
  document.querySelector(`.item[data-id="${CSS.escape(state.lastId || '')}"]`)?.scrollIntoView({ block: 'center' });
}

// On phones the sheet covers the bottom of the map, so aim above it.
function centerOn(latlng, zoom) {
  const z = zoom ?? map.getZoom();
  const offset = isPhone() ? $('panel').getBoundingClientRect().height / 2 : 0;
  const pt = map.project(latlng, z).add([0, offset]);
  map.setView(map.unproject(pt, z), z, { animate: false });
}

function renderDetail(s) {
  const t = TYPES[s.type];
  const where = [s.city, s.state].filter(Boolean).join(', ');
  const links = [
    s.website && ['Website', s.website],
    s.instagram && ['Instagram', s.instagram],
    s.shop_url && ['Shop', s.shop_url],
    ...s.other_links.map((l) => [l.label, l.url]),
  ].filter(Boolean);

  // Previous / next follow the list as currently filtered and sorted.
  const i = state.filtered.findIndex((x) => x.id === s.id);
  const prev = i > 0 ? state.filtered[i - 1] : null;
  const next = i >= 0 && i < state.filtered.length - 1 ? state.filtered[i + 1] : null;
  const spec = [
    ['Type', t.label],
    s.access && ['Access', ACCESS[s.access]],
    s.offers.length && ['Offers', s.offers.map((o) => OFFERS[o]).join(', ')],
    s.founded && ['Founded', s.founded],
  ].filter(Boolean);

  const parts = [
    el('nav', { class: 'd-nav', 'aria-label': 'Studio navigation' },
      el('button', { type: 'button', onclick: () => closeDetail() }, icon('back'), 'All studios'),
      el('span', { class: 'step' },
        el('button', { type: 'button', disabled: !prev, 'aria-label': 'Previous studio', onclick: () => prev && select(prev.id) }, icon('prev'), 'Prev'),
        el('button', { type: 'button', disabled: !next, 'aria-label': 'Next studio', onclick: () => next && select(next.id) }, 'Next', icon('next')))),
    el('div', { class: `band${s.precision === 'city' ? ' approx' : ''}`, style: `--c:${t.color}`, 'aria-hidden': 'true' },
      el('span', { class: 'code' }, chartCode(s))),
    el('div', { class: 'd-body' },
      el('h2', {}, s.name),
      where ? el('p', { class: 'where' }, s.address ? `${s.address}, ${where}` : where) : null,
      s.precision === 'city'
        ? el('p', { class: 'approx-note' }, 'The pin shows the city only, not the studio’s exact location.')
        : null,
      el('dl', { class: 'spec' }, spec.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)])),
      s.description ? el('p', { class: 'desc' }, s.description) : null,
      links.length
        ? el('ul', { class: 'links', 'aria-label': 'See their work' }, links.map(([label, url], n) =>
            el('li', {}, el('a', { href: url, target: '_blank', rel: 'noopener noreferrer' },
              el('b', {}, n === 0 && label === 'Website' ? 'Visit website' : label, icon('out')), el('span', {}, prettyUrl(url))))))
        : null,
      el('button', { class: 'btn share', type: 'button', onclick: (e) => copyLink(e.currentTarget) }, 'Copy link to this studio'),
      el('div', { class: 'fine' },
        s.last_verified ? el('p', {}, `Last verified ${formatDate(s.last_verified)}`) : null,
        s.source ? el('p', {}, `Source: ${s.source}`) : null)),
  ];
  $('detail').replaceChildren(...parts.flat(2).filter(Boolean));
}

const prettyUrl = (u) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
function formatDate(v) {
  const d = new Date(`${v}T12:00:00`);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
async function copyLink(btn) {
  try {
    await navigator.clipboard.writeText(location.href);
    btn.textContent = 'Link copied';
  } catch {
    btn.textContent = 'Copy failed — use the address bar';
  }
  setTimeout(() => { btn.textContent = 'Copy link to this studio'; }, 2000);
}

// ---------- Shareable URLs (?studio=id) ----------
function setUrl(id) {
  const url = new URL(location.href);
  if (id) url.searchParams.set('studio', id); else url.searchParams.delete('studio');
  history.pushState({ studio: id }, '', url);
}
function openFromUrl() {
  const id = new URLSearchParams(location.search).get('studio');
  if (id && state.byId.has(id)) select(id, { push: false });
  else if (id) { showStatus(`No studio with the id "${id}".`); if (state.activeId) closeDetail({ push: false }); }
  else if (state.activeId) closeDetail({ push: false });
}
window.addEventListener('popstate', openFromUrl);

// ---------- Near me ----------
const toRad = (d) => (d * Math.PI) / 180;
function distance(s) {
  if (!state.you) return 0;
  const R = 3958.8; // miles
  const dLat = toRad(s.lat - state.you.lat), dLng = toRad(s.lng - state.you.lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(state.you.lat)) * Math.cos(toRad(s.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
const formatMiles = (mi) => (mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi).toLocaleString()} mi`);

// Location is requested only when this button is pressed, used in the page,
// and never stored or sent anywhere.
$('nearMe').addEventListener('click', () => {
  if (!('geolocation' in navigator)) { showStatus('Your browser can’t share location.'); return; }
  const btn = $('nearMe');
  btn.textContent = 'Locating…';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      state.you = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      btn.textContent = 'Near me';
      btn.classList.add('on');
      showStatus('');
      const sortOpt = $('sortSel').querySelector('[value="distance"]');
      sortOpt.disabled = false;
      $('sortSel').value = state.sort = 'distance';
      youMarker?.remove();
      youMarker = L.marker([state.you.lat, state.you.lng], {
        icon: L.divIcon({ className: '', html: '<div class="you"></div>', iconSize: [20, 20], iconAnchor: [10, 10] }),
        interactive: false,
      }).addTo(map);
      if (state.activeId) closeDetail();
      apply();
      // Frame you plus the nearest few studios.
      const near = state.filtered.slice(0, 5).map((s) => [s.lat, s.lng]);
      if (near.length) map.fitBounds(L.latLngBounds([[state.you.lat, state.you.lng], ...near]), { padding: [50, 50], maxZoom: 11 });
      else map.setView([state.you.lat, state.you.lng], 9);
    },
    (err) => {
      btn.textContent = 'Near me';
      showStatus(err.code === err.PERMISSION_DENIED ? 'Location permission was declined.' : 'Couldn’t get your location.');
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
  );
});

// Redraw every pin (used by the design-options panel in tweaks.js).
window.atlasRefreshPins = () => {
  for (const [id, m] of state.markers) m.setIcon(pinIcon(state.byId.get(id), id === state.activeId));
};

// ---------- Phone bottom sheet ----------
const ORDER = ['peek', 'half', 'full'];
const sheet = () => $('panel').dataset.sheet;
function setSheet(v) { $('panel').dataset.sheet = v; }
$('sheetHandle').addEventListener('click', () => {
  setSheet(ORDER[(ORDER.indexOf(sheet()) + 1) % ORDER.length]);
});
// Touching the map makes room for it.
map.on('dragstart', () => { if (isPhone() && sheet() !== 'peek') setSheet('peek'); });

load();
