/* Vitrigraph Lab, stage 4: RESULT. The pulled length, chop marks, cross-section slices and debrief. */
(function (VL) {
  const C = VL.config, M = VL.model, D = VL.draw;

  // Segment → slice object the model can read.
  VL.segSlice = s => ({ R: C.pot.rings, S: C.pot.sectors, cells: s.cells, forms: s.forms, w: s.w });

  // Summary numbers the challenges and debrief both read.
  VL.analyse = function (run) {
    const segs = (run.pull && run.pull.segments) || [];
    const cum = []; let total = 0;
    for (const s of segs) { cum.push(total); total += s.len; }
    // Length-weighted percentiles, so the thick start where the gob bleeds in doesn't swamp the numbers.
    const pct = (key, p) => {
      const xs = segs.filter(s => isFinite(s[key])).map(s => [s[key], s.len]).sort((a, b) => a[0] - b[0]);
      const tot = xs.reduce((a, x) => a + x[1], 0); let acc = 0;
      for (const x of xs) { acc += x[1]; if (acc >= tot * p) return x[0]; }
      return xs.length ? xs[xs.length - 1][0] : 0;
    };
    const lo = pct('d', 0.05), hi = pct('d', 0.95);
    const ds = segs.filter(s => isFinite(s.d) && s.d >= lo && s.d <= hi);
    const wsum = ds.reduce((a, s) => a + s.len, 0) || 1;
    const meanD = ds.reduce((a, s) => a + s.d * s.len, 0) / wsum;
    const sdD = Math.sqrt(ds.reduce((a, s) => a + (s.d - meanD) ** 2 * s.len, 0) / wsum);
    const frac = f => segs.filter(s => s.flags[f]).reduce((a, s) => a + s.len, 0) / (total || 1);
    return {
      segs, cum, totalMm: total, meanD, cv: meanD ? sdD / meanD : 0,
      minD: lo, maxD: hi, peakD: pct('d', 1),
      minSpeed: pct('speed', 0.05), maxSpeed: pct('speed', 0.95), peakSpeed: segs.reduce((a, s) => Math.max(a, s.speed), 0),
      meanIx: segs.length ? segs.reduce((a, s) => a + s.ix * s.len, 0) / (total || 1) : 0,
      droopFrac: frac('droop'), coilFrac: frac('coil'),
      at(mm) { // segment index at a length
        let lo = 0, hi = cum.length - 1;
        while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (cum[mid] <= mm) lo = mid; else hi = mid - 1; }
        return lo;
      },
    };
  };

  VL.stages.result = {
    mount(app) {
      const run = app.run, A = VL.analyse(run), P = app.panel;
      const aspect = M.orifice(run.orifice).aspect || 1;
      const chops = [];
      const canvas = document.createElement('canvas');
      app.wrap.appendChild(canvas);
      const hint = VL.h(`<div class="vg-hint">Tap the strand to chop it there. Each chop adds a cross-section slice.</div>`); app.wrap.appendChild(hint);

      const findings = VL.debrief.findings(app, A);
      const picked = VL.debrief.pickDebrief(findings, app.challenge) || [];

      P.appendChild(VL.h(`<div><div class="vg-kicker">Stage 4 · Result</div><h2>${(A.totalMm / 10).toFixed(0)} cm pulled</h2></div>`));
      const verdictEl = VL.h(`<div></div>`); P.appendChild(verdictEl);
      P.appendChild(VL.h(`<div class="vg-debrief">${picked.map(f => `<p>${f.text}</p>`).join('') || '<p>Not enough glass was pulled to say much. Grab the gob and drag away from it.</p>'}</div>`));
      P.appendChild(VL.h(`<div>
        <div class="vg-stat"><span>Diameter (avg · middle 90%)</span><b>${A.meanD ? `${A.meanD.toFixed(1)} mm · ${A.minD.toFixed(1)}–${A.maxD.toFixed(1)}` : '–'}</b></div>
        <div class="vg-stat"><span>Diameter spread (CV)</span><b>${Math.round(A.cv * 100)}%</b></div>
        <div class="vg-stat"><span>Pull speed (middle 90%)</span><b>${A.minSpeed.toFixed(0)}–${A.maxSpeed.toFixed(0)} cm/s</b></div>
        <div class="vg-stat"><span>Tears · dropped gobs</span><b>${run.pull ? run.pull.snaps : 0} · ${(run.pull ? run.pull.drops : 0) + run.heat.gobDrops}</b></div>
        <div class="vg-stat"><span>Hottest glass</span><b>${M.toDisplay(run.heat.maxGlass)}</b></div></div>`));
      P.appendChild(VL.h(`<h3>Slices <span style="font-weight:400;color:var(--muted)">(murrini)</span></h3>`));
      const chopRow = VL.h(`<div class="vg-row"><button class="vg-btn" data-a="even">Chop every 10%</button><button class="vg-btn" data-a="none">Clear chops</button></div>`);
      P.appendChild(chopRow);
      const slices = VL.h(`<div class="vg-slices"></div>`); P.appendChild(slices);
      P.appendChild(VL.h(`<p style="font-size:12px;margin-top:12px">Slices come from the simplified model. How colors really move through the hole is an open question, listed in KNOWN_UNCERTAINTIES.md.</p>`));
      const again = VL.h(`<div class="vg-row" style="margin-top:10px"><button class="vg-btn primary" data-a="same">Same load, fire again</button><button class="vg-btn" data-a="new">New load</button></div>`);
      P.appendChild(again);

      function showVerdict() {
        const v = VL.challenges.evaluate(app, A, chops);
        if (v && v.pass) VL.challenges.markPassed(app);
        verdictEl.innerHTML = v ? `<div class="vg-goal"><div class="vg-kicker">${v.name}</div><p class="${v.pass ? 'vg-pass' : 'vg-fail'}">${v.pass ? 'Passed.' : 'Not yet.'}</p><p>${v.text}</p></div>` : '';
      }

      function addChop(mm) {
        if (!A.segs.length) return;
        chops.push(Math.max(0, Math.min(A.totalMm - 0.01, mm)));
        chops.sort((a, b) => a - b);
        hint.hidden = true;
        renderSlices(); showVerdict(); draw();
      }
      function renderSlices() {
        slices.innerHTML = '';
        for (const mm of chops) {
          const s = A.segs[A.at(mm)];
          const fig = VL.h(`<figure><canvas></canvas><figcaption>${(mm / 10).toFixed(0)} cm · ${isFinite(s.d) ? s.d.toFixed(1) : '–'} mm</figcaption></figure>`);
          slices.appendChild(fig);
          const cv = fig.querySelector('canvas');
          requestAnimationFrame(() => {
            const { ctx, w, h } = D.fit(cv);
            const rad = Math.min(w, h) / 2 - 6;
            D.drawSlice(ctx, VL.segSlice(s), w / 2, h / 2, aspect > 1 ? rad / Math.sqrt(aspect) : rad, s.twist, aspect, { seeds: true });
          });
        }
      }

      // strand wrapped into rows so long pulls still fit
      let rows = null;
      function layout(w, h) {
        const n = Math.max(1, Math.min(6, Math.ceil(A.totalMm / 10 / 120)));
        const per = A.totalMm / n, top = 54, gap = (h - top - 30) / n;
        const maxD = Math.max(2, A.maxD);
        return { n, per, top, gap, x0: 24, x1: w - 24, scale: Math.min(gap * 0.38, 26) / maxD };
      }
      const colorCache = new Map();
      const sideCol = i => { if (!colorCache.has(i)) colorCache.set(i, D.sideColor(VL.segSlice(A.segs[i]), A.segs[i].twist)); return colorCache.get(i); };

      function draw() {
        const { ctx, w, h } = D.fit(canvas);
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#5e5852'; ctx.font = '600 11px ui-monospace, Menlo, monospace'; ctx.textAlign = 'left';
        if (!A.segs.length) { ctx.fillText('Nothing was pulled.', 24, 40); return; }
        rows = layout(w, h);
        ctx.fillText(`length view · thickness exaggerated ×${(rows.scale * 2 / 3.78).toFixed(1)} · ${rows.n > 1 ? 'wrapped into rows, read left to right' : ''}`, 24, 26);
        for (let r = 0; r < rows.n; r++) {
          const cy = rows.top + rows.gap * (r + 0.5);
          const pxPerMm = (rows.x1 - rows.x0) / rows.per, maxShown = Math.max(2, A.maxD) * 1.6;
          for (let x = rows.x0; x < rows.x1; x++) {
            const mm = r * rows.per + (x - rows.x0) / pxPerMm;
            if (mm >= A.totalMm) break;
            const i = A.at(mm), s = A.segs[i];
            const half = Math.max(0.6, Math.min(isFinite(s.d) ? s.d : maxShown, maxShown) * rows.scale / 2);
            const coil = s.flags.coil ? Math.sin(mm / 6) * half * 0.6 : 0;
            ctx.fillStyle = 'rgba(34,31,29,.45)';
            ctx.fillRect(x, cy - half + coil - 1, 1.2, half * 2 + 2);
            ctx.fillStyle = sideCol(i);
            ctx.fillRect(x, cy - half + coil, 1.2, half * 2);
            if (s.flags.snap || s.flags.drop) { ctx.fillStyle = '#8e2c25'; ctx.fillRect(x - 1, cy - 14, 2, 28); }
          }
          // ruler
          ctx.fillStyle = '#8b847c';
          const step = rows.per / 10 > 200 ? 500 : rows.per / 10 > 50 ? 100 : 50;
          for (let mm = Math.ceil(r * rows.per / step) * step; mm < Math.min((r + 1) * rows.per, A.totalMm); mm += step) {
            const x = rows.x0 + (mm - r * rows.per) * pxPerMm;
            ctx.fillRect(x, cy + rows.gap * 0.32, 1, 5);
            ctx.textAlign = 'center'; ctx.fillText(`${mm / 10}`, x, cy + rows.gap * 0.32 + 16);
          }
          for (const mm of chops) {
            if (mm < r * rows.per || mm >= (r + 1) * rows.per) continue;
            const x = rows.x0 + (mm - r * rows.per) * pxPerMm;
            ctx.strokeStyle = '#221f1d'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 2]);
            ctx.beginPath(); ctx.moveTo(x, cy - rows.gap * 0.42); ctx.lineTo(x, cy + rows.gap * 0.28); ctx.stroke(); ctx.setLineDash([]);
          }
        }
        ctx.textAlign = 'left'; ctx.fillStyle = '#8e2c25';
        ctx.fillText('red tick = tear or dropped gob', 24, h - 10);
      }

      canvas.addEventListener('pointerdown', e => {
        if (!rows) return;
        const b = canvas.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
        const r = Math.floor((y - rows.top) / rows.gap);
        if (r < 0 || r >= rows.n || x < rows.x0 || x > rows.x1) return;
        addChop(r * rows.per + (x - rows.x0) / (rows.x1 - rows.x0) * rows.per);
      });
      chopRow.addEventListener('click', e => {
        const a = e.target.closest('button')?.dataset.a;
        if (a === 'even') { chops.length = 0; hint.hidden = true; for (let k = 1; k < 10; k++) chops.push(A.totalMm * k / 10); renderSlices(); showVerdict(); draw(); }
        if (a === 'none') { chops.length = 0; renderSlices(); showVerdict(); draw(); }
      });
      again.addEventListener('click', e => {
        const a = e.target.closest('button')?.dataset.a;
        if (a) app.restart(a === 'same');
      });

      showVerdict();
      this._ro = new ResizeObserver(draw); this._ro.observe(canvas);
      draw();
    },
    unmount() { this._ro && this._ro.disconnect(); },
  };
})(window.VitrigraphLab);
