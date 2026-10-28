/* Vitrigraph Lab, stage 1: LOAD. Paint glass into the pot's cross-section and top view. */
(function (VL) {
  const C = VL.config, M = VL.model, D = VL.draw;

  const tool = { form: 'chunk', color: 'cobalt', coe: C.coeDefault, brush: 'ring', sliceRot: 0, layer: 0, erase: false };

  VL.stages.load = {
    mount(app) {
      const run = app.run, ch = run.charge;
      const canvas = document.createElement('canvas');
      app.wrap.appendChild(canvas);
      const hint = VL.h(`<div class="vg-hint">Pick a glass, then tap or drag in the pot. The side view is one slice through the pot (L and R); the round view is one layer from above.</div>`);
      app.wrap.appendChild(hint);
      const fl = VL.h(`<div class="vg-float">
          <button class="vg-chip" data-a="rot" title="Turn the slice plane">Turn slice ⟳</button>
          <button class="vg-chip" data-a="up" title="Layer up">Layer ▲</button>
          <button class="vg-chip" data-a="down" title="Layer down">Layer ▼</button>
        </div>`);
      app.wrap.appendChild(fl);

      const P = app.panel;
      P.appendChild(VL.challenges.goalCard(app));
      P.appendChild(VL.h(`<div><div class="vg-kicker">Stage 1 · Load the pot</div><h2>What goes in, and where</h2>
        <p>Glass leaves through the hole in the bottom. Where you put each color decides where it shows up along the cane and in its cross-section.</p></div>`));

      const formSeg = VL.h(`<div class="vg-seg">${C.forms.map(f => `<button data-f="${f.id}" title="${f.note}">${f.name}</button>`).join('')}</div>`);
      const sw = VL.h(`<div class="vg-swatches">${C.colors.map(c => `<button class="vg-sw" data-c="${c.id}"><i style="background:${c.hex}"></i>${c.name}</button>`).join('')}
        <button class="vg-sw" data-c="erase"><i style="background:repeating-linear-gradient(45deg,#fff 0 3px,#ccc 3px 6px)"></i>Remove</button></div>`);
      const coeSel = VL.h(`<select class="vg-challenge">${C.coes.map(x => `<option value="${x.id}">${x.label}</option>`).join('')}</select>`);
      const brushSeg = VL.h(`<div class="vg-seg">
          <button data-b="ring" title="Fill the whole ring all the way around">Ring (all around)</button>
          <button data-b="half" title="Fill half the ring, on the side you tap">Half</button>
          <button data-b="wedge" title="Fill one wedge">Wedge</button></div>`);
      const oriSel = VL.h(`<select class="vg-challenge">${C.orifices.map(o => `<option value="${o.id}">${o.label}</option>`).join('')}</select>`);

      P.appendChild(VL.h(`<h3>Glass form</h3>`)); P.appendChild(formSeg);
      const formNote = VL.h(`<div class="vg-note"></div>`); P.appendChild(formNote);
      P.appendChild(VL.h(`<h3>Color</h3>`)); P.appendChild(sw);
      const coeRow = VL.h(`<div class="vg-row"><span style="font-size:12.5px;color:var(--muted)">This glass is</span></div>`);
      coeRow.appendChild(coeSel); P.appendChild(coeRow);
      P.appendChild(VL.h(`<h3>Brush</h3>`)); P.appendChild(brushSeg);
      const actions = VL.h(`<div class="vg-row">
          <button class="vg-btn" data-a="fill">Fill this layer</button>
          <button class="vg-btn" data-a="clear">Empty the pot</button></div>`);
      P.appendChild(actions);
      P.appendChild(VL.h(`<h3>Hole in the pot</h3>`));
      const oriRow = VL.h(`<div class="vg-row"></div>`); oriRow.appendChild(oriSel); P.appendChild(oriRow);
      const summary = VL.h(`<div></div>`); P.appendChild(summary);
      const fire = VL.h(`<button class="vg-btn primary" style="margin-top:12px;width:100%">Fire the kiln →</button>`);
      P.appendChild(fire);

      function sync() {
        formSeg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.f === tool.form));
        sw.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', tool.erase ? b.dataset.c === 'erase' : b.dataset.c === tool.color));
        brushSeg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.b === tool.brush));
        formNote.textContent = C.forms.find(f => f.id === tool.form).note;
        coeSel.value = tool.coe; oriSel.value = run.orifice;
        const s = M.chargeSummary(ch);
        const coeWarn = s.coes.length > 1 || s.coes.includes('?');
        summary.innerHTML = `
          <h3>In the pot</h3>
          <div class="vg-stat"><span>Filled</span><b>${Math.round(s.frac * 100)}% · ${(s.frac * C.pot.chargeVolumeCm3).toFixed(0)} cm³</b></div>
          <div class="vg-stat"><span>Colors</span><b>${s.colors.map(id => M.colorById(id).name).join(', ') || 'none'}</b></div>
          <div class="vg-stat"><span>COE</span><b>${s.coes.map(c => C.coes.find(x => x.id === c)?.label || c).join(' + ') || '–'}</b></div>
          ${coeWarn ? `<div class="vg-warn"><b>Compatibility warning.</b> ${s.coes.includes('?') ? 'Some of this glass has an unknown COE. ' : ''}${s.coes.length > 1 ? `You've mixed ${s.coes.join(' and ')}. ` : ''}Glass from different systems shrinks by different amounts as it cools, so the cane can crack, sometimes days later. Only mix glass you know is compatible (and test it).</div>` : ''}
          ${s.frac < 0.15 ? `<div class="vg-note">Load at least 15% of the pot to fire.</div>` : ''}`;
        fire.disabled = s.frac < 0.15;
        hint.hidden = s.filled > 0;
      }

      formSeg.addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        tool.form = b.dataset.f;
        if (tool.form === 'scrap') tool.coe = '?';
        else if (tool.coe === '?') tool.coe = C.coeDefault;
        sync();
      });
      sw.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; tool.erase = b.dataset.c === 'erase'; if (!tool.erase) tool.color = b.dataset.c; sync(); });
      brushSeg.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; tool.brush = b.dataset.b; sync(); draw(); });
      coeSel.addEventListener('change', () => { tool.coe = coeSel.value; sync(); });
      oriSel.addEventListener('change', () => { run.orifice = oriSel.value; });
      actions.addEventListener('click', e => {
        const a = e.target.closest('button')?.dataset.a;
        if (a === 'fill') for (let r = 0; r < ch.R; r++) paint(tool.layer, r, [...Array(ch.S).keys()]);
        if (a === 'clear') ch.cells.fill(null);
        sync(); draw();
      });
      fl.addEventListener('click', e => {
        const a = e.target.closest('button')?.dataset.a;
        if (a === 'rot') tool.sliceRot = (tool.sliceRot + 1) % (ch.S / 2);
        if (a === 'up') tool.layer = Math.min(ch.L - 1, tool.layer + 1);
        if (a === 'down') tool.layer = Math.max(0, tool.layer - 1);
        draw();
      });
      fire.addEventListener('click', () => app.go('heat'));

      let scrapSeed = 1;
      function paint(l, r, sectors) {
        for (const s of sectors) {
          const i = M.idx(ch, l, r, s);
          if (tool.erase) { ch.cells[i] = null; continue; }
          let c = tool.color;
          if (tool.form === 'scrap') { scrapSeed = (scrapSeed * 9301 + 49297) % 233280; c = C.colors[scrapSeed % C.colors.length].id; }
          ch.cells[i] = { c, coe: tool.coe, form: tool.form };
        }
      }
      function sectorsFor(s) {
        const S = ch.S;
        if (tool.brush === 'ring') return [...Array(S).keys()];
        if (tool.brush === 'half') return [-2, -1, 0, 1].map(k => (s + k + S) % S);  // centered on the tapped side
        return [s];
      }

      // layout
      let L = null, hover = null, topHover = null;
      function layout() {
        const { w, h } = { w: canvas.clientWidth, h: canvas.clientHeight };
        const wide = w > h * 1.05;
        const potW = wide ? w * 0.62 : w, potH = wide ? h : h * 0.68;
        const g = D.potGeo(potW, potH - 24);
        g.ox = 0; g.oy = 30;
        const topR = wide ? Math.min(w * 0.15, h * 0.28) : Math.min(w * 0.22, h * 0.13);
        const top = wide ? { cx: potW + (w - potW) / 2, cy: h * 0.42, r: topR } : { cx: w / 2, cy: potH + (h - potH) / 2 - 6, r: topR };
        L = { g, top };
      }

      function draw() {
        const { ctx, w, h } = D.fit(canvas);
        layout();
        ctx.clearRect(0, 0, w, h);
        const { g, top } = L;
        ctx.save(); ctx.translate(g.ox, g.oy);
        D.drawPot(ctx, g, D.chargeStacks(ch), tool.sliceRot, { grid: true, hover, brush: tool.brush });
        // current-layer marker
        const y = g.bottom - (tool.layer + 0.5) * g.rowH;
        ctx.fillStyle = '#8e2c25'; ctx.font = '600 11px ui-monospace, Menlo, monospace'; ctx.textAlign = 'right';
        ctx.fillText('▸', g.cx - g.halfAt(y) - 14, y + 4);
        ctx.textAlign = 'center'; ctx.fillStyle = '#5e5852';
        ctx.fillText('L', g.cx - g.topW / 2 - 4, g.top - 12); ctx.fillText('R', g.cx + g.topW / 2 + 4, g.top - 12);
        ctx.fillText(`side view · slice ${tool.sliceRot * 45}°`, g.cx, g.bottom + 26);
        ctx.restore();
        D.drawTop(ctx, ch, tool.layer, top.cx, top.cy, top.r, tool.sliceRot, topHover);
        ctx.fillStyle = '#5e5852'; ctx.font = '600 11px ui-monospace, Menlo, monospace'; ctx.textAlign = 'center';
        ctx.fillText(`from above · layer ${tool.layer + 1} of ${ch.L}`, top.cx, top.cy + top.r + 30);
      }

      function at(e) {
        const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
        const ph = L.g.hit(x - L.g.ox, y - L.g.oy);
        if (ph) return { kind: 'pot', ...ph, sectors: sectorsFor(D.sideSector(tool.sliceRot, ph.side)) };
        const th = D.topHit(x, y, L.top.cx, L.top.cy, L.top.r);
        if (th) return { kind: 'top', l: tool.layer, r: th.r, sectors: sectorsFor(th.s) };
        return null;
      }
      let down = false, last = '';
      function apply(hit) {
        const key = `${hit.l}:${hit.r}:${hit.sectors.join(',')}`;
        if (key === last) return;
        last = key; tool.layer = hit.l; paint(hit.l, hit.r, hit.sectors); sync();
      }
      function onMove(e) {
        const hit = at(e);
        hover = hit && hit.kind === 'pot' ? hit : null;
        topHover = hit && hit.kind === 'top' ? { r: hit.r, sectors: hit.sectors } : null;
        if (down && hit) apply(hit);
        draw();
      }
      canvas.addEventListener('pointerdown', e => { down = true; last = ''; canvas.setPointerCapture(e.pointerId); const hit = at(e); if (hit) apply(hit); draw(); });
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerup', () => { down = false; });
      canvas.addEventListener('pointerleave', () => { hover = topHover = null; draw(); });

      this._ro = new ResizeObserver(draw); this._ro.observe(canvas);
      sync(); draw();
    },
    unmount() { this._ro && this._ro.disconnect(); },
  };
})(window.VitrigraphLab);
