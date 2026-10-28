/* Vitrigraph Lab: challenges. Each unlocks after the one before it is passed. */
(function (VL) {
  const C = VL.config, M = VL.model, D = VL.draw;

  // Fill a charge from a rule (l, r, s) → color id or null, then read a slice partway through the drain.
  function targetSlice(rule, drainFrac) {
    const ch = M.newCharge();
    for (let l = 0; l < ch.L; l++) for (let r = 0; r < ch.R; r++) for (let s = 0; s < ch.S; s++) {
      const c = rule(l, r, s);
      if (c) ch.cells[M.idx(ch, l, r, s)] = { c, coe: C.coeDefault, form: 'chunk' };
    }
    const d = M.melt(ch);
    M.drain(d, d.total * (drainFrac || 0.3));
    return M.slice(d);
  }

  const RECIPES = [
    { name: 'Bullseye', rule: (l, r) => r < 2 ? 'yellow' : r < 4 ? 'black' : 'white' },
    { name: 'Half moon', rule: (l, r, s) => [6, 7, 0, 1].includes(s) ? 'amber' : 'turq' },
    { name: 'Striped core', rule: (l, r, s) => r < 2 ? 'cobalt' : s === 0 ? 'ruby' : 'white' },
  ];

  const LIST = [
    { id: 'free', name: 'Free play', goal: 'No target. Load anything and see what comes out.' },
    { id: 'stringer', name: '1 · Even stringer',
      goal: () => { const t = C.challenges.stringer; return `Pull at least ${t.minLenCm} cm in one go, ${t.minD}–${t.maxD} mm thick, with diameter spread (CV) under ${Math.round(t.maxCv * 100)}%.`; } },
    { id: 'change', name: '2 · Color change',
      goal: () => `Get one color, then another, along the length: each must run at least ${C.challenges.colorChange.minRunCm} cm.` },
    { id: 'core', name: '3 · Core in a casing',
      goal: 'Make a slice with a cobalt core inside an opal white casing. Chop to check.',
      target: () => targetSlice((l, r) => r < 3 ? 'cobalt' : 'white') },
    { id: 'recipe', name: '4 · Recipe match',
      goal: 'Reverse-engineer this slice: figure out the loading that makes it, then chop to check.',
      target: () => RECIPES[VL.store.get('recipe', 0) % RECIPES.length] && targetSlice(RECIPES[VL.store.get('recipe', 0) % RECIPES.length].rule) },
  ];

  const unlocked = () => VL.store.get('unlocked', 1);   // index into LIST of the highest open challenge
  const byId = id => LIST.find(x => x.id === id) || LIST[0];

  function bindSelect(app, sel) {
    app.challenge = 'free';
    app._challengeSelect = sel;
    const fill = () => {
      const u = unlocked();
      sel.innerHTML = LIST.map((x, i) => `<option value="${x.id}" ${i > u ? 'disabled' : ''}>${x.name}${i > u ? ' (locked)' : ''}</option>`).join('');
      sel.value = app.challenge;
    };
    fill();
    app._refillChallenges = fill;
    sel.addEventListener('change', () => { app.challenge = sel.value; app.restart(true); });
  }

  function goalCard(app) {
    const ch = byId(app.challenge);
    const el = VL.h(`<div class="vg-goal"><div class="vg-kicker">${ch.name}</div><p>${typeof ch.goal === 'function' ? ch.goal() : ch.goal}</p></div>`);
    if (ch.target) {
      const cv = document.createElement('canvas');
      el.insertBefore(cv, el.firstChild);
      requestAnimationFrame(() => { const { ctx, w, h } = D.fit(cv); D.drawSlice(ctx, ch.target(), w / 2, h / 2, Math.min(w, h) / 2 - 4, 0, 1, {}); });
      el.appendChild(VL.h(`<div style="clear:both"></div>`));
    }
    return el;
  }

  function bestMatch(A, chops, target) {
    let best = 0, at = 0;
    for (const mm of chops) {
      const m = M.sliceMatch(VL.segSlice(A.segs[A.at(mm)]), target);
      if (m > best) { best = m; at = mm; }
    }
    return { best, at };
  }

  function evaluate(app, A, chops) {
    const ch = byId(app.challenge);
    if (ch.id === 'free') return null;
    const T = C.challenges;
    if (!A.segs.length) return { name: ch.name, pass: false, text: 'Nothing was pulled.' };

    if (ch.id === 'stringer') {
      const t = T.stringer; let best = null, run = [];
      const close = () => {
        const len = run.reduce((a, s) => a + s.len, 0);
        if (len / 10 >= t.minLenCm) {
          const mean = run.reduce((a, s) => a + s.d * s.len, 0) / len;
          const cv = Math.sqrt(run.reduce((a, s) => a + (s.d - mean) ** 2 * s.len, 0) / len) / mean;
          if (!best || cv < best.cv) best = { cv, mean, len };
        }
        run = [];
      };
      for (const s of A.segs) {
        if (isFinite(s.d) && s.d >= t.minD && s.d <= t.maxD) run.push(s); else close();
        if (s.flags.snap || s.flags.drop) close();
      }
      close();
      if (!best) return { name: ch.name, pass: false, text: `No unbroken ${t.minLenCm} cm stretch stayed between ${t.minD} and ${t.maxD} mm.` };
      return { name: ch.name, pass: best.cv <= t.maxCv,
        text: `Best stretch: ${(best.len / 10).toFixed(0)} cm averaging ${best.mean.toFixed(1)} mm, spread ${Math.round(best.cv * 100)}% (target under ${Math.round(t.maxCv * 100)}%).` };
    }

    if (ch.id === 'change') {
      const runs = {}; let cur = null, len = 0;
      for (const s of A.segs) {
        const dom = M.dominantColor(VL.segSlice(s));
        if (dom !== cur) { if (cur) runs[cur] = Math.max(runs[cur] || 0, len); cur = dom; len = 0; }
        len += s.len;
      }
      if (cur) runs[cur] = Math.max(runs[cur] || 0, len);
      const ok = Object.keys(runs).filter(k => runs[k] / 10 >= T.colorChange.minRunCm);
      return { name: ch.name, pass: ok.length >= 2,
        text: ok.length >= 2 ? `The strand runs ${ok.map(k => M.colorById(k).name).join(' then ')}.`
          : `Only ${ok.map(k => M.colorById(k).name).join('') || 'no color'} held for ${T.colorChange.minRunCm} cm. A side-by-side load won't do it; think about what drains first.` };
    }

    const target = ch.target();
    const need = ch.id === 'core' ? T.targetMatch : T.recipeMatch;
    if (!chops.length) return { name: ch.name, pass: false, text: 'Chop the strand to compare slices with the target.' };
    const { best, at } = bestMatch(A, chops, target);
    return { name: ch.name, pass: best >= need,
      text: `Closest slice, at ${(at / 10).toFixed(0)} cm, is a ${Math.round(best * 100)}% match (need ${Math.round(need * 100)}%).` };
  }

  function markPassed(app) {
    if (app._passMarked === app.run) return;   // once per pull
    app._passMarked = app.run;
    const i = LIST.findIndex(x => x.id === app.challenge);
    if (app.challenge === 'recipe') VL.store.set('recipe', VL.store.get('recipe', 0) + 1);  // next recipe next time
    if (i >= unlocked()) { VL.store.set('unlocked', Math.min(LIST.length - 1, i + 1)); app._refillChallenges(); }
  }

  VL.challenges = { LIST, bindSelect, goalCard, evaluate, markPassed, targetSlice };
})(window.VitrigraphLab);
