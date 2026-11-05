// "Check my mix" panel on the Mix tab: photograph (or type) the color of the
// paint you mixed, see how it differs from the target, and get the single
// paint to add next. Each "I added it" updates the mix so the next check
// builds on it: photograph → compare → add → photograph again.

import { mixDirections, suggestAddition } from './check.js';
import { hexToLab, labToHex, parseHex } from './color.js';
import { formatParts } from './solver.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const MAX_SUGGESTIONS = 3;

/**
 * @param {object} o
 * @param {HTMLElement} o.root          container (hidden until there is a target)
 * @param {() => object[]} o.getPalette paints with a color in the active palette
 * @param {(onLab: (lab) => void) => void} o.capture  opens the photo dialog
 */
export function initCheck({ root, getPalette, capture }) {
  const st = {
    target: null, // { lab, hex }
    recipe: null, // { paints, parts } the user is mixing, or null for freehand
    mixParts: 4, // freehand only: how many parts the current pile is
    checks: [], // [{ lab, deltaE }] this session, oldest first
    last: null, // latest { lab, dirs, sugg }
  };

  root.innerHTML = `
    <h2>Check my mix</h2>
    <p class="muted small check-for"></p>
    <div class="row">
      <button class="btn primary" data-chk="photo">Photograph my mix</button>
      <input type="text" class="chk-hex" placeholder="or type its #hex" aria-label="Color of your mix (hex)" style="width:9em">
      <button class="btn" data-chk="hex">Check</button>
    </div>
    <div class="row chk-parts-row" style="margin-top:8px">
      <label class="small">My mix is about <input type="number" class="chk-parts" min="1" max="60" step="1" style="width:4.5em"> parts</label>
      <span class="muted small">Used to size "add 1 part". Pick a recipe's "I mixed this" for better advice.</span>
    </div>
    <div class="chk-result"></div>
    <div class="chk-history muted small"></div>`;

  const q = (sel) => root.querySelector(sel);

  function run(lab) {
    if (!st.target) return;
    const palette = getPalette();
    // Use each recipe paint's current color and strength (it may have been
    // re-measured since the recipe was picked); keep the snapshot if it left the palette.
    const current = new Map(palette.map((p) => [p.id, p]));
    const recipe = st.recipe && { paints: st.recipe.paints.map((p) => current.get(p.id) ?? p), parts: st.recipe.parts };
    const dirs = mixDirections(lab, st.target.lab);
    const sugg = suggestAddition(lab, st.target.lab, palette, { recipe, mixParts: st.mixParts });
    st.last = { lab, dirs, sugg };
    st.checks.push({ lab, deltaE: dirs.deltaE });
    render();
  }

  function addedPaint(paintId) {
    const paint = getPalette().find((p) => p.id === paintId);
    if (!paint) return;
    if (st.recipe) {
      const at = st.recipe.paints.findIndex((p) => p.id === paintId);
      if (at >= 0) st.recipe.parts = st.recipe.parts.map((v, i) => (i === at ? v + 1 : v));
      else {
        st.recipe.paints = [...st.recipe.paints, { ...paint }];
        st.recipe.parts = [...st.recipe.parts, 1];
      }
    } else {
      st.mixParts = Math.min(60, st.mixParts + 1);
    }
    st.last = null; // the old photo no longer shows the paint on the palette
    render();
    q('[data-chk="photo"]').focus();
  }

  function recipeText() {
    if (!st.recipe) return null;
    return `${st.recipe.paints.map((p) => esc(p.name)).join(' : ')} <strong>${formatParts(st.recipe.parts, 'ratio')}</strong>`;
  }

  function render() {
    root.hidden = !st.target;
    if (!st.target) return;
    q('.check-for').innerHTML =
      `Target <span class="sw tiny" style="background:${st.target.hex}"></span> ${st.target.hex}` +
      (st.recipe ? ` · your mix: ${recipeText()}` : ' · freehand mix (no recipe chosen)');
    q('.chk-parts-row').hidden = !!st.recipe;
    q('.chk-parts').value = st.mixParts;

    const box = q('.chk-result');
    if (!st.last) {
      box.innerHTML = st.checks.length
        ? '<p class="small">Mix it in fully, then photograph it again.</p>'
        : '<p class="muted small">Mix your paint, then photograph a dab of it next to white paper.</p>';
    } else {
      const { lab, dirs, sugg } = st.last;
      const hex = labToHex(lab);
      let html = `<div class="recipe">
        <div class="pair"><div style="background:${hex}"><span>your mix ${hex}</span></div><div style="background:${st.target.hex}"><span>target ${st.target.hex}</span></div></div>
        <div class="meta"><span>ΔE <strong>${dirs.deltaE.toFixed(1)}</strong>, ${esc(dirs.label)}</span></div>`;
      if (dirs.deltaE < 2) {
        html += `<p><strong>That's a match.</strong> Differences this small are within what a photo can tell apart. Stop here.</p>`;
      } else {
        html += dirs.directions.length
          ? `<p class="small" style="margin:8px 0 4px">To match the target, your mix needs to be:</p><ul class="dirs">${dirs.directions.map((d) => `<li>${esc(d.text)}</li>`).join('')}</ul>`
          : '';
        const opts = sugg.options.slice(0, MAX_SUGGESTIONS);
        if (opts.length) {
          html += `<p class="small" style="margin:10px 0 4px">Add <strong>1 part</strong> of one of these${st.recipe ? ' (1 part = the amount you used for 1 part of the recipe)' : ''}:</p>
            <ul class="adds">${opts
              .map(
                (o, i) => `<li><span class="sw" style="background:${labToHex(o.paint.lab)}"></span>
                  <span class="grow"><strong>${esc(o.paint.name)}</strong> <span class="muted small">${esc(o.paint.brand ?? '')}</span><br>
                  <span class="small">→ <span class="sw tiny" style="background:${o.hex}"></span> predicted ΔE ${o.deltaE.toFixed(1)}${i === 0 ? ' · best' : ''}</span></span>
                  <button class="btn small" data-chk="added" data-id="${esc(o.paint.id)}">I added it</button></li>`
              )
              .join('')}</ul>`;
          if (opts[0].deltaE > 5) html += `<p class="muted small">Even the best single addition leaves it far off. Adding it several times, or starting a fresh mix with "Find recipe", may work better.</p>`;
        } else {
          html += `<p class="small">No paint in your palette brings this closer when 1 part is added. If the photo light differs from before, retake it; otherwise start a fresh mix with "Find recipe".</p>`;
        }
        html += `<p class="muted small">${sugg.model === 'recipe'
          ? 'Predictions start from your recipe and correct for how your real mix came out.'
          : 'Freehand mix: predictions are rougher. Choose "I mixed this" on a recipe for better advice.'}</p>`;
      }
      box.innerHTML = html + '</div>';
    }

    q('.chk-history').innerHTML = st.checks.length > 1
      ? 'Progress: ' + st.checks.map((c, i) => `<span title="check ${i + 1}">${i ? ' → ' : ''}ΔE ${c.deltaE.toFixed(1)}</span>`).join('')
      : '';
  }

  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-chk]');
    if (!t) return;
    const a = t.dataset.chk;
    if (a === 'photo') capture((lab) => run(lab));
    if (a === 'hex') {
      const hex = q('.chk-hex').value.trim();
      if (!parseHex(hex)) return alert('Type a hex color like #6a8f72.');
      run(hexToLab(hex));
    }
    if (a === 'added') addedPaint(t.dataset.id);
  });
  root.addEventListener('change', (e) => {
    if (e.target.classList.contains('chk-parts')) {
      const v = Math.round(Number(e.target.value));
      st.mixParts = Number.isFinite(v) && v >= 1 ? Math.min(60, v) : 4;
      if (st.last) {
        st.checks.pop(); // same photo, re-sized mix: replace that check
        run(st.last.lab);
      } else render();
    }
  });

  return {
    /** New target: start a fresh check (old checks were against another color). */
    setTarget(hex) {
      const lab = hexToLab(hex);
      if (st.target?.hex === labToHex(lab)) return;
      Object.assign(st, { target: { lab, hex: labToHex(lab) }, recipe: null, mixParts: 4, checks: [], last: null });
      render();
    },
    /** The user is mixing this recipe (from a recipe card). */
    setRecipe(recipe) {
      st.recipe = { paints: recipe.paints.map((p) => ({ ...p })), parts: [...recipe.parts] };
      st.checks = [];
      st.last = null;
      render();
      root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    render,
  };
}
