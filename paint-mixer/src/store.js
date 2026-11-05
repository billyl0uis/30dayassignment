// App state: palettes, custom paints and per-paint settings (tinting strength,
// measured colors). Plain functions that mutate and return the state object, so
// they are easy to test in Node; the UI saves after each change.

import { parseHex, hexToLab } from './color.js';
import { PRESETS } from './presets.js';

export const STORAGE_KEY = 'color-mixer:v1';
export const REF_IMAGE_KEY = 'color-mixer:reference-image'; // kept apart so exports stay small
export const MAX_TARGETS = 100;
export const STATE_VERSION = 1;
export const MAX_PALETTE = 30;
export const TS_MIN = 0.05;
export const TS_MAX = 10;

const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export function emptyState() {
  return {
    version: STATE_VERSION,
    palettes: [],
    activePaletteId: null,
    customPaints: [],
    // paintId -> { tintingStrength?: number, color?: { status: 'measured', lab, ... } }
    paintSettings: {},
    // saved target colors; x/y are 0..1 positions on the reference photo they came from
    targets: [],
    // the current reference photo's metadata (the image itself is under REF_IMAGE_KEY)
    reference: null,
  };
}

// ---- persistence ---------------------------------------------------------------

/** Returns { state, error }. Never throws: private mode, blocked storage, corrupt JSON all fall back. */
export function loadState(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return { state: emptyState(), error: null };
    return { state: validateState(JSON.parse(raw)), error: null };
  } catch (err) {
    return { state: emptyState(), error: `Could not load saved data (${err.message}). Starting fresh. Export or import a backup before making changes, or the unreadable data will be replaced.` };
  }
}

/** Returns { ok, error }. */
export function saveState(state, storage = globalThis.localStorage) {
  try {
    if (!storage) throw new Error('storage unavailable');
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: `Changes could not be saved on this device (${err.message}). Use Export to keep a copy.` };
  }
}

export function exportState(state) {
  return JSON.stringify({ app: 'color-mixer', exportedAt: new Date().toISOString(), ...state }, null, 2);
}

/** Parse + validate an exported file. Throws an Error with a readable message. */
export function importState(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (data?.app !== 'color-mixer') throw new Error('That file is not a color-mixer export.');
  return validateState(data);
}

/** Coerce unknown data into a valid state, dropping anything malformed. */
export function validateState(data) {
  if (!data || typeof data !== 'object') throw new Error('Saved data has the wrong shape.');
  if (data.version > STATE_VERSION) throw new Error(`Saved data is from a newer version (${data.version}).`);
  const s = emptyState();

  for (const c of Array.isArray(data.customPaints) ? data.customPaints : []) {
    if (typeof c?.id !== 'string' || typeof c?.name !== 'string') continue;
    const lab = validLab(c.lab) ? c.lab : null;
    s.customPaints.push({
      id: c.id,
      name: c.name.slice(0, 80),
      pigments: Array.isArray(c.pigments) ? c.pigments.filter((x) => typeof x === 'string') : [],
      opacity: c.opacity ?? null,
      status: lab ? (c.status === 'measured' ? 'measured' : 'user_hex') : 'needs_swatch',
      hex: typeof c.hex === 'string' ? c.hex : null,
      lab,
    });
  }

  for (const p of Array.isArray(data.palettes) ? data.palettes : []) {
    if (typeof p?.id !== 'string') continue;
    s.palettes.push({
      id: p.id,
      name: typeof p.name === 'string' && p.name.trim() ? p.name.slice(0, 60) : 'Palette',
      paintIds: [...new Set((Array.isArray(p.paintIds) ? p.paintIds : []).filter((x) => typeof x === 'string'))].slice(0, MAX_PALETTE),
      roles: (Array.isArray(p.roles) ? p.roles : [])
        .filter((r) => typeof r?.label === 'string')
        .map((r) => ({ label: r.label, query: String(r.query ?? ''), hint: String(r.hint ?? ''), paintId: typeof r.paintId === 'string' ? r.paintId : null })),
    });
  }
  s.activePaletteId = s.palettes.some((p) => p.id === data.activePaletteId) ? data.activePaletteId : s.palettes[0]?.id ?? null;

  for (const [id, v] of Object.entries(data.paintSettings ?? {})) {
    const out = {};
    if (Number.isFinite(v?.tintingStrength)) out.tintingStrength = clampTs(v.tintingStrength);
    const color = cleanMeasured(v?.color);
    if (color) out.color = color;
    if (Object.keys(out).length) s.paintSettings[id] = out;
  }
  for (const t of Array.isArray(data.targets) ? data.targets : []) {
    const clean = cleanTarget(t);
    if (clean) s.targets.push(clean);
  }
  s.targets = s.targets.slice(0, MAX_TARGETS);
  const r = data.reference;
  if (r && typeof r.id === 'string') s.reference = { id: r.id, name: String(r.name ?? 'photo').slice(0, 120), width: Number(r.width) || 0, height: Number(r.height) || 0 };
  return s;
}

const unit = (v) => (Number.isFinite(v) && v >= 0 && v <= 1 ? v : null);

function cleanTarget(t) {
  if (!t || typeof t.id !== 'string' || !validLab(t.lab)) return null;
  const x = unit(t.x), y = unit(t.y);
  const refId = typeof t.refId === 'string' && x !== null && y !== null ? t.refId : null;
  return {
    id: t.id,
    lab: t.lab.map(Number),
    hex: typeof t.hex === 'string' ? t.hex : null,
    refId,
    x: refId ? x : null,
    y: refId ? y : null,
    sampleSize: [1, 3, 5, 9].includes(t.sampleSize) ? t.sampleSize : null,
    source: ['tap', 'key', 'hex'].includes(t.source) ? t.source : 'hex',
    createdAt: typeof t.createdAt === 'string' ? t.createdAt : null,
  };
}

/** Keep only the known fields of a measured color. */
function cleanMeasured(c) {
  if (!c || !validLab(c.lab)) return null;
  const out = { status: 'measured', lab: c.lab.map(Number) };
  if (validLab(c.tintLab)) out.tintLab = c.tintLab.map(Number);
  if (typeof c.whitePaintId === 'string') out.whitePaintId = c.whitePaintId;
  if (Number.isFinite(c.fitDeltaE)) out.fitDeltaE = c.fitDeltaE;
  if (typeof c.measuredAt === 'string') out.measuredAt = c.measuredAt;
  return out;
}

const validLab = (lab) => Array.isArray(lab) && lab.length === 3 && lab.every(Number.isFinite);
const clampTs = (v) => Math.min(TS_MAX, Math.max(TS_MIN, v));

// ---- palettes --------------------------------------------------------------------

export const getPalette = (state, id = state.activePaletteId) => state.palettes.find((p) => p.id === id) ?? null;

export function createPalette(state, name, presetKey = null) {
  const preset = presetKey ? PRESETS[presetKey] : null;
  if (presetKey && !preset) throw new Error(`Unknown preset: ${presetKey}`);
  const palette = {
    id: uid(),
    name: (name ?? '').trim() || preset?.name || `Palette ${state.palettes.length + 1}`,
    paintIds: [],
    roles: preset ? preset.roles.map((r) => ({ ...r, paintId: null })) : [],
  };
  state.palettes.push(palette);
  state.activePaletteId = palette.id;
  return palette;
}

export function renamePalette(state, id, name) {
  const p = getPalette(state, id);
  if (p && name.trim()) p.name = name.trim().slice(0, 60);
  return state;
}

export function deletePalette(state, id) {
  state.palettes = state.palettes.filter((p) => p.id !== id);
  if (state.activePaletteId === id) state.activePaletteId = state.palettes[0]?.id ?? null;
  return state;
}

/** Add or remove a paint. Returns { added: boolean } and throws when full. */
export function togglePaint(state, paletteId, paintId) {
  const p = getPalette(state, paletteId);
  if (!p) throw new Error('No palette selected.');
  const i = p.paintIds.indexOf(paintId);
  if (i >= 0) {
    p.paintIds.splice(i, 1);
    for (const r of p.roles) if (r.paintId === paintId) r.paintId = null;
    return { added: false };
  }
  if (p.paintIds.length >= MAX_PALETTE) throw new Error(`A palette holds at most ${MAX_PALETTE} paints.`);
  p.paintIds.push(paintId);
  return { added: true };
}

/** Fill a preset role with a paint (also adds it to the palette). */
export function fillRole(state, paletteId, roleIndex, paintId) {
  const p = getPalette(state, paletteId);
  const role = p?.roles[roleIndex];
  if (!role) throw new Error('No such role.');
  if (!p.paintIds.includes(paintId)) togglePaint(state, paletteId, paintId);
  role.paintId = paintId;
  return state;
}

export function clearRole(state, paletteId, roleIndex) {
  const role = getPalette(state, paletteId)?.roles[roleIndex];
  if (role) role.paintId = null;
  return state;
}

// ---- custom paints & settings ---------------------------------------------------------

/** Parse "PB29, PW6" / "PB29 PW6" -> ["PB29","PW6"] (format checked loosely). */
export function parsePigments(text) {
  return String(text ?? '')
    .split(/[\s,;/+]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/^p([a-z]{1,2})(\d.*)$/i, (_, t, n) => `P${t[0].toUpperCase()}${t.slice(1).toLowerCase()}${n}`));
}

/**
 * Add a custom paint. A hex value is optional: without it the paint is saved
 * as `needs_swatch` (the swatch photo flow comes in stage 3).
 */
export function addCustomPaint(state, { name, pigments = '', hex = '' }) {
  const n = String(name ?? '').trim();
  if (!n) throw new Error('Give the paint a name.');
  let lab = null;
  let cleanHex = null;
  if (String(hex).trim()) {
    const rgb = parseHex(hex);
    if (!rgb) throw new Error(`"${hex}" is not a hex color like #3a5f8c.`);
    cleanHex = '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');
    lab = hexToLab(cleanHex);
  }
  const paint = {
    id: `custom:${uid()}`,
    name: n.slice(0, 80),
    pigments: Array.isArray(pigments) ? pigments : parsePigments(pigments),
    opacity: null,
    status: lab ? 'user_hex' : 'needs_swatch',
    hex: cleanHex,
    lab,
  };
  state.customPaints.push(paint);
  return paint;
}

export function removeCustomPaint(state, id) {
  state.customPaints = state.customPaints.filter((c) => c.id !== id);
  for (const p of state.palettes) {
    p.paintIds = p.paintIds.filter((x) => x !== id);
    for (const r of p.roles) if (r.paintId === id) r.paintId = null;
  }
  delete state.paintSettings[id];
  return state;
}

export function setTintingStrength(state, paintId, value) {
  const v = Number(value);
  if (!Number.isFinite(v)) throw new Error('Tinting strength must be a number.');
  const s = (state.paintSettings[paintId] ??= {});
  s.tintingStrength = clampTs(v);
  return s.tintingStrength;
}

/**
 * Store a color measured from a swatch photo (status `measured`).
 * @param {{ lab, tintLab?, whitePaintId?, tintingStrength?, fitDeltaE? }} m
 */
export function setMeasuredColor(state, paintId, m) {
  const color = cleanMeasured({ ...m, measuredAt: new Date().toISOString() });
  if (!color) throw new Error('Measured color is missing or invalid.');
  const s = (state.paintSettings[paintId] ??= {});
  s.color = color;
  if (Number.isFinite(m.tintingStrength)) s.tintingStrength = clampTs(m.tintingStrength);
  return color;
}

/** Forget a measured color (the paint falls back to manufacturer data or needs a swatch). */
export function clearMeasuredColor(state, paintId) {
  const s = state.paintSettings[paintId];
  if (!s) return state;
  delete s.color;
  if (!Object.keys(s).length) delete state.paintSettings[paintId];
  return state;
}

// ---- target colors & reference photo ---------------------------------------------------

/**
 * Save a target color. From a photo, pass refId plus x/y as 0..1 fractions of
 * the image size so the marker lands in the same place at any display size.
 */
export function addTarget(state, { lab, hex = null, refId = null, x = null, y = null, sampleSize = null, source = 'hex' }) {
  const t = cleanTarget({ id: uid(), lab, hex, refId, x, y, sampleSize, source, createdAt: new Date().toISOString() });
  if (!t) throw new Error('That target color is invalid.');
  if (state.targets.length >= MAX_TARGETS) throw new Error(`You can save up to ${MAX_TARGETS} target colors. Delete some first.`);
  state.targets.push(t);
  return t;
}

export function removeTarget(state, id) {
  state.targets = state.targets.filter((t) => t.id !== id);
  return state;
}

/** Record a newly loaded reference photo (metadata only). */
export function setReference(state, { name, width, height }) {
  state.reference = { id: uid(), name: String(name ?? 'photo').slice(0, 120), width, height };
  return state.reference;
}

/** Store the reference photo (a data: URL) on this device. Returns { ok, error }. */
export function saveReferenceImage(dataUrl, storage = globalThis.localStorage) {
  try {
    if (!storage) throw new Error('storage unavailable');
    storage.setItem(REF_IMAGE_KEY, dataUrl);
    return { ok: true, error: null };
  } catch (err) {
    try { storage?.removeItem(REF_IMAGE_KEY); } catch {}
    return { ok: false, error: `The photo is too big to keep after a reload (${err.message}). It works until you close the page.` };
  }
}

export function loadReferenceImage(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(REF_IMAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

// ---- resolve ----------------------------------------------------------------------------

/**
 * Library paints + custom paints with the user's settings applied. A measured
 * color always wins over manufacturer data.
 */
export function resolvePaints(libraryFlat, state) {
  const customs = state.customPaints.map((c) => ({
    ...c,
    brand: 'Custom',
    line: 'My paints',
    medium: null,
    note: null,
    colorNote: null,
    sourceUrl: null,
    tintingStrength: 1,
    custom: true,
  }));
  return [...libraryFlat, ...customs].map((p) => {
    const s = state.paintSettings[p.id];
    if (!s) return p;
    const out = { ...p };
    if (s.tintingStrength) out.tintingStrength = s.tintingStrength;
    if (s.color?.lab) {
      out.lab = s.color.lab;
      out.status = 'measured';
      out.colorNote = null;
    }
    return out;
  });
}
