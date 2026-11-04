// Swatch capture dialog: load a photo (never uploaded - it stays in this page's
// memory and is discarded when the dialog closes), tap the white paper, tap the
// swatch, optionally tap a 1:1 tint with white, then save the measured color.

import { sampleAverage, measureLab, paperProblems, swatchProblems, fitTintingStrength, SAMPLE_SIZE } from './capture.js';
import { labToHex } from './color.js';

const MAX_DIM = 1600; // downscale big phone photos; 9x9 at this size is a small, steady patch
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const STEPS = [
  { key: 'paper', label: '1 · White paper', prompt: 'Tap a plain area of the white paper.' },
  { key: 'swatch', label: '2 · Swatch', prompt: 'Tap the middle of the full-strength swatch.' },
  { key: 'tint', label: '3 · Tint (optional)', prompt: 'Tap the 1:1 mix with white, if you painted one.' },
];
// Checking a mix: same photo flow, but only paper + the mix, no tint.
const MIX_STEPS = [
  STEPS[0],
  { key: 'swatch', label: '2 · Your mix', prompt: 'Tap the middle of your mixed paint (a flat, even patch).' },
];
const MARK_COLOR = { paper: '#ffffff', swatch: '#ffcc00', tint: '#00d0ff' };

/**
 * @param {HTMLDialogElement} dialog
 * @param {object} opts
 * @param {object} opts.paint            paint being measured
 * @param {object[]} opts.whites         paints with a color usable as "the white I mixed with"
 * @param {string|null} opts.defaultWhiteId
 * @param {(m: {lab, tintLab?, whitePaintId?, tintingStrength?, fitDeltaE?}) => void} opts.onSave
 */
export function openCapture(dialog, { paint, whites = [], defaultWhiteId, onSave, mode = 'paint' }) {
  const mix = mode === 'mix';
  const steps = mix ? MIX_STEPS : STEPS;
  const st = { img: null, step: 'paper', paper: null, swatch: null, tint: null, whiteId: defaultWhiteId ?? whites[0]?.id ?? null };

  dialog.innerHTML = `<div class="dlg">
    <div class="dlg-head">
      <div class="grow">${mix
        ? '<h3>Photograph your mix</h3><div class="muted small">to compare it with the target</div>'
        : `<h3>Swatch for ${esc(paint.name)}</h3><div class="muted small">${esc(paint.brand)} · ${esc(paint.line)}</div>`}</div>
      <button class="icon-btn" data-cap="close" aria-label="Close">✕</button>
    </div>
    ${mix ? `<ol class="small muted howto">
      <li>Dab some of your mix onto white paper (or put the paper right next to your palette).</li>
      <li>Photograph it in even daylight with plain paper in the frame. Avoid glare and shadows. Use the same light every time you check.</li>
    </ol>` : `<ol class="small muted howto">
      <li>On white paper, paint a full-strength patch, plus a 1:1 mix with titanium white if you can.</li>
      <li>Let it dry if the color shifts as it dries, then photograph it in even daylight with plain paper in the frame. Avoid glare and shadows.</li>
    </ol>`}
    <label class="btn primary file-btn">Choose or take photo<input type="file" accept="image/*" data-cap="file" hidden></label>
    <span class="muted small"> The photo stays on this device and is not saved.</span>
    <div class="cap-body" hidden>
      <div class="cap-steps" role="group" aria-label="Sample step">${steps.map((s) => `<button class="btn small" data-cap="step" data-step="${s.key}"></button>`).join('')}</div>
      <p class="cap-prompt"></p>
      <div class="canvas-wrap"><canvas class="cap-canvas" aria-label="Photo: tap to sample"></canvas></div>
      <div class="cap-warn banner" hidden></div>
      <div class="cap-result"></div>
      <div class="row" style="margin-top:12px">
        <button class="btn primary" data-cap="save" disabled>${mix ? 'Check this color' : 'Save measured color'}</button>
        <button class="btn" data-cap="close">Cancel</button>
      </div>
    </div>
  </div>`;

  const q = (sel) => dialog.querySelector(sel);
  const canvas = q('.cap-canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  async function loadFile(file) {
    const url = URL.createObjectURL(file);
    try {
      const im = new Image();
      im.decoding = 'async';
      im.src = url;
      await im.decode(); // browsers apply EXIF orientation when drawing <img>
      const scale = Math.min(1, MAX_DIM / Math.max(im.naturalWidth, im.naturalHeight));
      canvas.width = Math.round(im.naturalWidth * scale);
      canvas.height = Math.round(im.naturalHeight * scale);
      ctx.drawImage(im, 0, 0, canvas.width, canvas.height);
      // keep the canvas's aspect ratio (so taps map to pixels) while fitting 60% of the screen height
      canvas.style.maxWidth = `calc(60vh * ${canvas.width / canvas.height})`;
      st.img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      Object.assign(st, { step: 'paper', paper: null, swatch: null, tint: null });
      q('.cap-body').hidden = false;
      render();
    } catch {
      alert('That image could not be opened. Try a JPEG or PNG.');
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function redraw() {
    ctx.putImageData(st.img, 0, 0);
    const r = Math.max(SAMPLE_SIZE, canvas.width / 80);
    for (const key of ['paper', 'swatch', 'tint']) {
      const s = st[key];
      if (!s) continue;
      ctx.lineWidth = Math.max(2, canvas.width / 400);
      ctx.strokeStyle = '#000';
      ctx.strokeRect(s.x - r - 1, s.y - r - 1, 2 * r + 2, 2 * r + 2);
      ctx.strokeStyle = MARK_COLOR[key];
      ctx.strokeRect(s.x - r, s.y - r, 2 * r, 2 * r);
    }
  }

  function computed() {
    if (!st.paper || !st.swatch) return null;
    const lab = measureLab(st.swatch.linear, st.paper.linear);
    const out = { lab };
    if (st.tint && !mix) {
      out.tintLab = measureLab(st.tint.linear, st.paper.linear);
      const white = whites.find((w) => w.id === st.whiteId);
      if (white) {
        out.whitePaintId = white.id;
        const fit = fitTintingStrength(lab, white, out.tintLab);
        out.tintingStrength = fit.tintingStrength;
        out.fitDeltaE = fit.deltaE;
      }
    }
    return out;
  }

  function render() {
    for (const b of dialog.querySelectorAll('[data-cap="step"]')) {
      const s = steps.find((x) => x.key === b.dataset.step);
      b.textContent = `${st[s.key] ? '✓ ' : ''}${s.label}`;
      b.classList.toggle('primary', st.step === s.key);
      b.setAttribute('aria-pressed', String(st.step === s.key));
    }
    q('.cap-prompt').textContent = steps.find((s) => s.key === st.step).prompt;
    redraw();

    const warns = [...(st.paper ? paperProblems(st.paper) : []), ...(st.swatch ? swatchProblems(st.swatch) : []), ...(st.tint ? swatchProblems(st.tint) : [])];
    const m = computed();
    if (m?.fitDeltaE > 6) warns.push(`The tint doesn't match any tinting strength well (ΔE ${m.fitDeltaE.toFixed(1)}). Check that the tint is 1:1 and that the white chosen below is the one you used.`);
    q('.cap-warn').hidden = !warns.length;
    q('.cap-warn').innerHTML = warns.map((w) => `<div>⚠ ${esc(w)}</div>`).join('');

    q('[data-cap="save"]').disabled = !m;
    if (!m) {
      q('.cap-result').innerHTML = '';
      return;
    }
    const chip = (label, lab) => `<div class="cap-chip"><span class="sw big" style="background:${labToHex(lab)}"></span><div class="small">${esc(label)}<br><span class="muted">L ${lab[0].toFixed(1)} a ${lab[1].toFixed(1)} b ${lab[2].toFixed(1)}</span></div></div>`;
    let html = `<div class="cap-chips">${chip(mix ? 'Your mix' : 'Measured color', m.lab)}${m.tintLab ? chip('Measured tint', m.tintLab) : ''}</div>`;
    if (st.tint) {
      html += `<div class="row" style="margin-top:8px"><label for="cap-white" class="small">White used for the tint</label>
        <select id="cap-white" data-cap="white">${whites.length ? whites.map((w) => `<option value="${esc(w.id)}" ${w.id === st.whiteId ? 'selected' : ''}>${esc(w.name)} (${esc(w.brand)})</option>`).join('') : '<option value="">No white with a color yet</option>'}</select></div>`;
      html += m.tintingStrength
        ? `<p class="small">Fitted tinting strength: <strong>${m.tintingStrength}</strong> <span class="muted">(predicted vs photographed tint ΔE ${m.fitDeltaE.toFixed(1)})</span></p>`
        : `<p class="small muted">To fit tinting strength, first give a white paint a color (measure your white).</p>`;
    }
    q('.cap-result').innerHTML = html;
  }

  function tap(e) {
    if (!st.img) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    st[st.step] = { ...sampleAverage(st.img, x, y), x, y };
    // advance: paper -> swatch -> tint
    if (st.step === 'paper' && !st.swatch) st.step = 'swatch';
    else if (st.step === 'swatch' && !st.tint && !mix) st.step = 'tint';
    render();
  }

  canvas.addEventListener('click', tap);
  dialog.onclick = (e) => {
    const t = e.target.closest('[data-cap]');
    if (!t) return;
    const a = t.dataset.cap;
    if (a === 'close') dialog.close();
    if (a === 'step') (st.step = t.dataset.step), render();
    if (a === 'save') {
      const m = computed();
      if (!m) return;
      onSave(m);
      dialog.close();
    }
  };
  dialog.onchange = (e) => {
    const t = e.target.closest('[data-cap]');
    if (t?.dataset.cap === 'file' && t.files[0]) loadFile(t.files[0]);
    if (t?.dataset.cap === 'white') (st.whiteId = t.value), render();
  };
  dialog.addEventListener('close', () => {
    st.img = null; // drop the photo
    dialog.innerHTML = '';
  }, { once: true });

  dialog.showModal();
}
