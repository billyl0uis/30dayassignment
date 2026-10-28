/* Vitrigraph Lab, stage 2: HEAT. Run the kiln clock until a gob forms under the pot. */
(function (VL) {
  const C = VL.config, M = VL.model, D = VL.draw;

  // 0 (no visible glow) → 1 (bright orange-yellow). Visual only.
  VL.kilnGlow = t => Math.max(0, Math.min(1, (t - 900) / 1000));
  VL.glowColor = function (t) {
    const g = VL.kilnGlow(t);
    const r = Math.round(40 + 215 * Math.min(1, g * 1.6)), gg = Math.round(28 + 170 * Math.max(0, g - 0.25)), b = Math.round(22 + 80 * Math.max(0, g - 0.75));
    return `rgb(${r},${gg},${b})`;
  };

  // Flow index meter with band ticks; reused by the PULL stage.
  VL.flowMeter = function () {
    const el = VL.h(`<div class="vg-meter"><div class="vg-lbl"><span>Flow (relative, simplified)</span><b></b></div>
      <div class="vg-flowbar">${C.flow.bands.slice(1).map(b => `<s style="left:${b.from * 100}%"></s>`).join('')}<i></i></div></div>`);
    return { el, set(ix) { el.querySelector('i').style.left = `${ix * 100}%`; el.querySelector('b').textContent = M.band(ix); } };
  };

  // Index at the orifice: glass temp plus the softness of what sits lowest in the pot.
  VL.orificeIndex = function (run) {
    let soft = 0, n = 0;
    if (run.drain) {
      const sl = M.slice(run.drain);
      sl.cells.forEach((c, i) => { if (c) { soft += M.colorById(c).soft * sl.w[i]; n += sl.w[i]; } });
    } else {
      run.charge.cells.forEach(c => { if (c) { soft += M.colorById(c.c).soft; n++; } });
    }
    return M.flowIndex(run.kiln.glass, n ? soft / n : 0);
  };

  VL.stages.heat = {
    mount(app) {
      const run = app.run, H = run.heat, P = app.panel;
      const canvas = document.createElement('canvas');
      app.wrap.classList.add('dark');
      app.wrap.appendChild(canvas);
      const hint = VL.h(`<div class="vg-hint"></div>`); app.wrap.appendChild(hint);

      const mAir = VL.meter('Kiln'), mGlass = VL.meter('Glass in pot'), mFlow = VL.flowMeter(), mClock = VL.meter('Clock');
      [mAir, mGlass, mFlow, mClock].forEach(m => app.meters.appendChild(m.el));

      P.appendChild(VL.challenges.goalCard(app));
      P.appendChild(VL.h(`<div><div class="vg-kicker">Stage 2 · Heat</div><h2>Bring it up to flow</h2>
        <p>Set the kiln and run the clock. The glass in the pot lags behind the kiln air. Nothing moves until it softens; then a gob forms under the hole.</p></div>`));
      const setLbl = VL.h(`<label class="vg-field">Kiln setpoint <b></b></label>`);
      const set = VL.h(`<input type="range" min="${C.kiln.setMin}" max="${C.kiln.setMax}" step="10">`);
      set.value = run.setpoint;
      P.appendChild(setLbl); P.appendChild(set);
      const clock = VL.h(`<div class="vg-row">
          <button class="vg-btn" data-a="play">▶ Run clock</button>
          <button class="vg-btn" data-a="15">+15 min</button>
          <button class="vg-btn" data-a="60">+1 hr</button></div>`);
      P.appendChild(clock);
      const status = VL.h(`<div class="vg-note"></div>`); P.appendChild(status);
      const grab = VL.h(`<button class="vg-btn primary" style="width:100%;margin-top:6px" disabled>Grab the gob →</button>`);
      P.appendChild(grab);
      P.appendChild(VL.h(`<h3>Kiln log</h3>`));
      const log = VL.h(`<div style="font-size:12.5px;color:var(--muted)"></div>`); P.appendChild(log);
      P.appendChild(VL.h(`<p style="font-size:12px;margin-top:14px">Temperatures, ramp rate and glass lag are placeholders in <code>config.js</code>. Real kilns, pots and glass differ.</p>`));

      const say = (t, cls) => { log.insertBefore(VL.h(`<div class="${cls || ''}"><span style="font:11px var(--mono);color:var(--dim)">${fmtClock(run.kiln.minutes)}</span> ${t}</div>`), log.firstChild); };
      const fmtClock = m => `${Math.floor(m / 60)}h ${String(Math.floor(m % 60)).padStart(2, '0')}m`;

      let playing = false, raf = 0, prev = 0;
      const flowing = () => !!run.drain && run.kiln.glass > 0 && VL.orificeIndex(run) >= C.flow.flowStart;

      function chunkDelay() {
        const s = M.chargeSummary(run.charge);
        const chunks = run.charge.cells.filter(c => c && c.form === 'chunk').length;
        return s.filled ? C.flow.chunkMeltDelay * chunks / s.filled : 0;
      }

      let lastBand = M.band(VL.orificeIndex(run));
      function step(minutes) {
        // break big skips into small steps so nothing jumps past a threshold
        const n = Math.max(1, Math.ceil(minutes / 0.5));
        for (let k = 0; k < n; k++) {
          tick(minutes / n);
          if (minutes > 1 && flowing()) { say('Clock stopped: glass is moving.'); playing = false; break; }
        }
        const b = M.band(VL.orificeIndex(run));
        if (b !== lastBand) { say(`Glass is now <b>${b}</b>.`); lastBand = b; }
      }
      function tick(minutes) {
        M.kilnStep(run.kiln, run.setpoint, minutes);
        H.maxGlass = Math.max(H.maxGlass, run.kiln.glass);
        const ix = VL.orificeIndex(run);
        if (!run.drain) {
          const start = C.flow.flowStart - 0.1 + chunkDelay();
          H.slump = Math.max(H.slump, Math.min(1, (ix - start) / 0.1));
          if (H.slump >= 1) { run.drain = M.melt(run.charge); say('The charge has slumped into the bottom of the pot.'); }
          return;
        }
        const q = M.outputRate(ix, run.orifice, M.remaining(run.drain));
        if (q <= 0) return;
        const mm3 = q * minutes * 60;
        M.drain(run.drain, mm3 / M.cellVolumeMm3());
        if (H.gob === 0) say('Glass is coming through the hole.');
        H.gob += mm3;
        if (H.gob > C.pull.gobDropMm3) {
          H.gobDrops++; H.purgedCells += H.gob / M.cellVolumeMm3(); H.gob = 0;
          say('The gob got too heavy and dropped onto the catch tray. That glass is gone.', 'warn');
        }
      }

      function loop(t) {
        const dt = Math.min(0.1, (t - prev) / 1000 || 0); prev = t;
        if (playing) {
          // While the gob grows the clock runs just fast enough to fill it in a few seconds; once it's ready, real time.
          let rate = C.kiln.heatGameMinutesPerSecond * 60;
          if (flowing()) {
            const q = M.outputRate(VL.orificeIndex(run), run.orifice, M.remaining(run.drain));
            rate = H.gob >= C.pull.gobReadyMm3 ? C.pull.flowingSecondsPerSecond
              : Math.max(C.pull.flowingSecondsPerSecond, Math.min(rate, C.pull.gobReadyMm3 / (Math.max(q, 0.1) * 6)));
          }
          const minutes = dt * rate / 60;
          step(minutes);
          if (run.drain && M.remaining(run.drain) <= 0) { playing = false; say('The pot ran empty before you pulled.', 'warn'); }
        }
        render();
        raf = requestAnimationFrame(loop);
      }

      function render() {
        const ix = VL.orificeIndex(run);
        mAir.set((run.kiln.air - C.kiln.roomTemp) / (C.kiln.setMax - C.kiln.roomTemp), M.toDisplay(run.kiln.air), VL.glowColor(run.kiln.air));
        mGlass.set((run.kiln.glass - C.kiln.roomTemp) / (C.kiln.setMax - C.kiln.roomTemp), M.toDisplay(run.kiln.glass), VL.glowColor(run.kiln.glass));
        mFlow.set(ix);
        mClock.set(Math.min(1, run.kiln.minutes / 240), fmtClock(run.kiln.minutes));
        setLbl.querySelector('b').textContent = M.toDisplay(run.setpoint);
        const fl = flowing();
        clock.querySelector('[data-a=play]').textContent = playing ? '❚❚ Pause' : '▶ Run clock';
        clock.querySelectorAll('[data-a="15"],[data-a="60"]').forEach(b => { b.disabled = fl; b.title = fl ? 'Glass is moving: the clock runs in seconds now' : ''; });
        const ready = H.gob >= C.pull.gobReadyMm3;
        grab.disabled = !ready;
        let s;
        if (!run.drain && H.slump <= 0) s = `Glass is ${M.band(ix)}. Pieces sit where you put them.`;
        else if (!run.drain) s = `The charge is slumping (${Math.round(H.slump * 100)}%).`;
        else if (!fl) s = 'Slumped, but too stiff to come through the hole. More heat.';
        else if (!ready) s = 'A gob is forming under the hole. The clock now runs in seconds.';
        else s = '<b>Gob ready.</b> Grab it and start pulling. Leave it and it drops.';
        status.innerHTML = s;
        hint.textContent = run.drain ? 'Glass is moving. Watch the colors near the hole: the middle drains first.' : 'Run the clock or skip ahead. The orange tint shows kiln heat (visual only).';
        draw();
      }

      function draw() {
        const { ctx, w, h } = D.fit(canvas);
        ctx.clearRect(0, 0, w, h);
        // kiln box
        const kw = Math.min(w * 0.86, h * 0.95), kh = Math.min(h * 0.62, kw * 0.8), kx = (w - kw) / 2, ky = 18;
        ctx.fillStyle = '#5b4a40'; ctx.fillRect(kx - 12, ky - 12, kw + 24, kh + 24);
        ctx.fillStyle = VL.glowColor(run.kiln.air); ctx.fillRect(kx, ky, kw, kh);
        ctx.strokeStyle = `rgba(255,${Math.round(120 + 100 * VL.kilnGlow(run.kiln.air))},60,${0.3 + 0.6 * VL.kilnGlow(run.kiln.air)})`; ctx.lineWidth = 3;
        for (let k = 0; k < 4; k++) { ctx.beginPath(); for (let x = 0; x <= kw; x += 8) ctx.lineTo(kx + x, ky + 10 + k * 7 + Math.sin(x / 6) * 2); ctx.stroke(); }
        // pot
        const g = D.potGeo(kw, kh - 30);
        ctx.save(); ctx.translate(kx, ky + 4);
        const stacks = run.drain ? D.drainStacks(run.drain) : D.slumpStacks(run.charge, Math.max(0, H.slump));
        const holeW = D.drawPot(ctx, g, stacks, 0, { melted: !!run.drain, glow: VL.kilnGlow(run.kiln.glass) });
        ctx.restore();
        // kiln floor with hole
        const fy = ky + kh, hx = kx + g.cx;
        ctx.fillStyle = '#5b4a40'; ctx.fillRect(kx - 12, fy, kw + 24, 16);
        ctx.fillStyle = '#1f1b19'; ctx.fillRect(hx - holeW, fy, holeW * 2, 16);
        // gob
        if (run.drain && H.gob > 0) {
          const r = Math.max(2, Math.cbrt(H.gob) * 0.45);
          const sl = M.slice(run.drain);
          ctx.fillStyle = D.sideColor(sl, 0);
          ctx.beginPath(); ctx.moveTo(hx - holeW * 0.4, fy + 16); ctx.quadraticCurveTo(hx - r, fy + 16 + r, hx, fy + 16 + r * 2);
          ctx.quadraticCurveTo(hx + r, fy + 16 + r, hx + holeW * 0.4, fy + 16); ctx.fill();
          ctx.fillStyle = 'rgba(255,150,60,.35)'; ctx.fill();
        }
        // catch tray
        const ty = h - 22;
        ctx.fillStyle = '#6d6560'; ctx.fillRect(hx - 70, ty, 140, 8);
        for (let k = 0; k < H.gobDrops; k++) { ctx.fillStyle = '#c9b27a'; ctx.beginPath(); ctx.ellipse(hx - 40 + k * 18, ty - 3, 9, 5, 0, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = 'rgba(238,234,226,.6)'; ctx.font = '600 11px ui-monospace, Menlo, monospace'; ctx.textAlign = 'center';
        ctx.fillText('catch tray', hx, ty + 20);
      }

      set.addEventListener('input', () => { run.setpoint = +set.value; });
      clock.addEventListener('click', e => {
        const a = e.target.closest('button')?.dataset.a;
        if (a === 'play') playing = !playing;
        if (a === '15' || a === '60') step(+a);
      });
      grab.addEventListener('click', () => app.go('pull'));

      say(`Kiln loaded. Hole: ${M.orifice(run.orifice).label}.`);
      raf = requestAnimationFrame(loop);
      this._stop = () => cancelAnimationFrame(raf);
    },
    unmount() { this._stop && this._stop(); },
  };
})(window.VitrigraphLab);
