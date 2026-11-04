// Reference tab: load a photo, tap to sample (with a magnifier loupe and an
// adjustable sample size), automatic key colors, and saved targets with
// markers showing where they were picked. The photo stays on this device.

import { sampleAverage } from './capture.js';
import { linearRgbToLab, labToHex } from './color.js';
import { extractKeyColors } from './keycolors.js';
import * as store from './store.js';

const MAX_DIM = 1600;
const LOUPE_PX = 160; // loupe size on screen (CSS px)
const LOUPE_SPAN = 21; // image pixels shown across the loupe
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * @param {object} deps
 * @param {() => object} deps.getState
 * @param {() => void} deps.commit         save + re-render everything
 * @param {(msg: string|null) => void} deps.showBanner
 * @param {(hex: string) => void} deps.useTarget  send a color to the Mix tab
 * @param {() => Storage|null} deps.storage
 */
export function initReference({ getState, commit, showBanner, useTarget, storage }) {
  const $ = (id) => document.getElementById(id);
  const canvas = $('ref-canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const loupe = $('ref-loupe');
  const lctx = loupe.getContext('2d');
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  loupe.width = loupe.height = Math.round(LOUPE_PX * dpr);
  loupe.style.width = loupe.style.height = `${LOUPE_PX}px`;

  const ui = { img: null, size: 5, current: null, keys: [], dragging: false };

  // ---- loading -------------------------------------------------------------

  async function decode(src) {
    const im = new Image();
    im.decoding = 'async';
    im.src = src;
    await im.decode();
    return im;
  }

  /** Draw an image into the working canvas (downscaled) and read its pixels. */
  function useImage(im) {
    const scale = Math.min(1, MAX_DIM / Math.max(im.naturalWidth, im.naturalHeight));
    canvas.width = Math.round(im.naturalWidth * scale);
    canvas.height = Math.round(im.naturalHeight * scale);
    canvas.style.maxWidth = `calc(70vh * ${canvas.width / canvas.height})`;
    ctx.drawImage(im, 0, 0, canvas.width, canvas.height);
    ui.img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    ui.keys = extractKeyColors(ui.img);
    ui.current = null;
    $('ref-stage').hidden = false;
  }

  async function loadFile(file) {
    const url = URL.createObjectURL(file);
    try {
      const im = await decode(url);
      // Re-encode once at working size, and work from that copy, so samples are
      // identical after a reload (the stored copy is what gets reloaded).
      const scale = Math.min(1, MAX_DIM / Math.max(im.naturalWidth, im.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(im.naturalWidth * scale);
      c.height = Math.round(im.naturalHeight * scale);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      const dataUrl = c.toDataURL('image/jpeg', 0.92);
      useImage(await decode(dataUrl));
      const state = getState();
      store.setReference(state, { name: file.name, width: canvas.width, height: canvas.height });
      const saved = store.saveReferenceImage(dataUrl, storage());
      commit();
      if (saved.error) showBanner(saved.error);
    } catch {
      alert('That image could not be opened. Try a JPEG or PNG.');
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function restore() {
    const state = getState();
    const dataUrl = state.reference && store.loadReferenceImage(storage());
    if (!dataUrl) return;
    try {
      useImage(await decode(dataUrl));
      render();
    } catch {
      /* stored image unreadable - user can load a new one */
    }
  }

  // ---- sampling -------------------------------------------------------------------

  function toImageXY(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.min(canvas.width - 1, Math.max(0, ((e.clientX - rect.left) / rect.width) * canvas.width)),
      y: Math.min(canvas.height - 1, Math.max(0, ((e.clientY - rect.top) / rect.height) * canvas.height)),
    };
  }

  function sampleAt(x, y) {
    const s = sampleAverage(ui.img, x, y, ui.size);
    const lab = linearRgbToLab(s.linear);
    ui.current = { lab, hex: labToHex(lab), x: Math.round(x), y: Math.round(y), sampleSize: ui.size, source: 'tap' };
    render();
  }

  function drawLoupe(e, x, y) {
    const stage = $('ref-stage').getBoundingClientRect();
    const cx = Math.round(x), cy = Math.round(y);
    const half = Math.floor(LOUPE_SPAN / 2);
    const cell = loupe.width / LOUPE_SPAN;

    lctx.imageSmoothingEnabled = false;
    lctx.fillStyle = '#000';
    lctx.fillRect(0, 0, loupe.width, loupe.height);
    lctx.drawImage(canvas, cx - half, cy - half, LOUPE_SPAN, LOUPE_SPAN, 0, 0, loupe.width, loupe.height);
    // outline the pixels that will be averaged
    const n = ui.size, o = (half - Math.floor(n / 2)) * cell;
    lctx.lineWidth = Math.max(1, dpr);
    lctx.strokeStyle = '#000';
    lctx.strokeRect(o - 1, o - 1, n * cell + 2, n * cell + 2);
    lctx.strokeStyle = '#fff';
    lctx.strokeRect(o, o, n * cell, n * cell);

    // place it above-left of the finger/cursor, kept inside the stage
    const px = e.clientX - stage.left, py = e.clientY - stage.top;
    const lift = e.pointerType === 'touch' ? 110 : 24;
    let left = px - LOUPE_PX / 2, top = py - LOUPE_PX - lift;
    if (top < 0) top = py + lift; // no room above: go below
    left = Math.max(0, Math.min(stage.width - LOUPE_PX, left));
    loupe.style.left = `${left}px`;
    loupe.style.top = `${top}px`;
    loupe.hidden = false;
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!ui.img) return;
    ui.dragging = true;
    canvas.setPointerCapture(e.pointerId);
    const { x, y } = toImageXY(e);
    drawLoupe(e, x, y);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!ui.img) return;
    if (!ui.dragging && e.pointerType !== 'mouse') return;
    const { x, y } = toImageXY(e);
    drawLoupe(e, x, y);
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!ui.img || !ui.dragging) return;
    ui.dragging = false;
    const { x, y } = toImageXY(e);
    sampleAt(x, y); // sample where the finger was lifted, so you can drag to adjust
    if (e.pointerType !== 'mouse') loupe.hidden = true;
  });
  canvas.addEventListener('pointercancel', () => ((ui.dragging = false), (loupe.hidden = true)));
  canvas.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse' && !ui.dragging) loupe.hidden = true;
  });

  // ---- rendering ---------------------------------------------------------------------

  function drawMarkers() {
    if (!ui.img) return;
    ctx.putImageData(ui.img, 0, 0);
    const state = getState();
    const r = Math.max(10, canvas.width / 70);
    ctx.font = `bold ${Math.round(r * 1.1)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    state.targets.forEach((t, i) => {
      if (!state.reference || t.refId !== state.reference.id) return;
      const x = t.x * canvas.width, y = t.y * canvas.height;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = t.hex;
      ctx.fill();
      ctx.lineWidth = Math.max(2, r / 5);
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#000';
      ctx.stroke();
      ctx.fillStyle = t.lab[0] > 55 ? '#000' : '#fff';
      ctx.fillText(String(i + 1), x, y + 1);
    });
    if (ui.current) {
      const { x, y } = ui.current;
      ctx.lineWidth = Math.max(2, r / 4);
      for (const [color, rad] of [['#000', r * 1.5 + 2], ['#fff', r * 1.5]]) {
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  const chipFor = (lab, hex, label, attrs) =>
    `<button class="chip" ${attrs}><span class="sw" style="background:${hex}"></span><span class="nm">${label}</span></button>`;

  function render() {
    const state = getState();
    $('ref-name').textContent = state.reference ? (ui.img ? `${state.reference.name} · tap or drag on the photo to sample` : `${state.reference.name} (not available - load it again)`) : '';
    document.querySelectorAll('#ref-size button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.size) === ui.size)));
    drawMarkers();

    // current sample
    const cur = ui.current;
    $('ref-current').hidden = !cur;
    if (cur) {
      $('ref-current').innerHTML = `<span class="sw big" style="background:${cur.hex}"></span>
        <div class="grow"><strong>${cur.hex}</strong><div class="muted small">L ${cur.lab[0].toFixed(1)} · a ${cur.lab[1].toFixed(1)} · b ${cur.lab[2].toFixed(1)}${cur.sampleSize ? ` · ${cur.sampleSize === 1 ? '1 px' : `${cur.sampleSize}×${cur.sampleSize} average`}` : ' · key color'}</div></div>
        <div class="row"><button class="btn" data-ref="save">Save color</button><button class="btn primary" data-ref="mix">Mix this</button></div>`;
    }

    // key colors
    $('ref-keys').innerHTML = ui.keys.length
      ? ui.keys.map((k, i) => chipFor(k.lab, k.hex, `${k.hex} <span class="muted small">${Math.round(k.share * 100)}%</span>`, `data-ref="key" data-i="${i}"`)).join('')
      : `<span class="muted small">${ui.img ? 'No key colors found.' : 'Choose a photo and the app picks out its main colors.'}</span>`;

    // saved targets
    $('ref-targets').innerHTML = state.targets.length
      ? state.targets
          .map((t, i) => {
            const where = t.refId && state.reference && t.refId === state.reference.id ? '' : t.refId ? ' <span class="muted small">(earlier photo)</span>' : '';
            return `<span class="chip target"><button class="chip-main" data-ref="pick" data-id="${esc(t.id)}"><span class="num">${i + 1}</span><span class="sw" style="background:${t.hex}"></span><span class="nm">${t.hex}${where}</span></button><button class="x" data-ref="del" data-id="${esc(t.id)}" aria-label="Delete target ${i + 1}">×</button></span>`;
          })
          .join('')
      : '<span class="muted small">None yet. Tap the photo, then "Save color" to keep colors you want to mix.</span>';
  }

  // ---- events ------------------------------------------------------------------------

  $('ref-file').addEventListener('change', (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) loadFile(f);
  });
  $('ref-size').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-size]');
    if (!b) return;
    ui.size = Number(b.dataset.size);
    if (ui.current?.source === 'tap') sampleAt(ui.current.x, ui.current.y); // resample same spot
    else render();
  });
  document.getElementById('tab-reference').addEventListener('click', (e) => {
    const t = e.target.closest('[data-ref]');
    if (!t) return;
    const state = getState();
    try {
      switch (t.dataset.ref) {
        case 'key': {
          const k = ui.keys[Number(t.dataset.i)];
          ui.current = { lab: k.lab, hex: k.hex, x: k.x, y: k.y, sampleSize: null, source: 'key' };
          render();
          break;
        }
        case 'save': {
          const c = ui.current;
          store.addTarget(state, {
            lab: c.lab,
            hex: c.hex,
            refId: state.reference?.id ?? null,
            x: c.x / canvas.width,
            y: c.y / canvas.height,
            sampleSize: c.sampleSize,
            source: c.source,
          });
          commit();
          break;
        }
        case 'mix':
          useTarget(ui.current.hex);
          break;
        case 'pick': {
          const tg = state.targets.find((x) => x.id === t.dataset.id);
          const onPhoto = tg.refId && state.reference && tg.refId === state.reference.id && ui.img;
          ui.current = { lab: tg.lab, hex: tg.hex, x: onPhoto ? tg.x * canvas.width : 0, y: onPhoto ? tg.y * canvas.height : 0, sampleSize: tg.sampleSize, source: 'saved' };
          if (!onPhoto) ui.current.x = ui.current.y = -9999; // no ring off-photo
          render();
          break;
        }
        case 'del':
          store.removeTarget(state, t.dataset.id);
          commit();
          break;
      }
    } catch (err) {
      alert(err.message);
    }
  });

  restore();
  return { render };
}
