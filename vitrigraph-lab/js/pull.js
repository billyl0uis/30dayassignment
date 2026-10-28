/* Vitrigraph Lab, stage 3: PULL. Drag to pull; speed and heat set the diameter. */
(function (VL) {
  const C = VL.config, M = VL.model, D = VL.draw;

  VL.stages.pull = {
    mount(app) {
      const run = app.run, PL = C.pull, P = app.panel;
      const st = run.pull = run.pull || {
        segments: [], snaps: 0, drops: 0, holding: false, speed: 0, twist: 0, twistOn: false, auto: 0,
        gob: run.heat.gob, trail: [], events: [], maxSpeed: 0, idleHot: 0, turn: [],
      };
      const canvas = document.createElement('canvas');
      app.wrap.classList.add('dark');
      app.wrap.appendChild(canvas);
      const hint = VL.h(`<div class="vg-hint"></div>`); app.wrap.appendChild(hint);

      const mGlass = VL.meter('Glass'), mFlow = VL.flowMeter(), mSpeed = VL.meter('Pull speed'), mD = VL.meter('Diameter');
      [mGlass, mFlow, mSpeed, mD].forEach(m => app.meters.appendChild(m.el));

      P.appendChild(VL.challenges.goalCard(app));
      P.appendChild(VL.h(`<div><div class="vg-kicker">Stage 3 · Pull</div><h2>Pull</h2>
        <p>Press on the gob to grab it, then drag away to pull. <b>Faster or cooler</b> = thinner, stiffer, and it can tear. <b>Slower or hotter</b> = thicker, droopier. Drag in circles to coil it down.</p></div>`));
      const setLbl = VL.h(`<label class="vg-field">Kiln setpoint <b></b></label>`);
      const set = VL.h(`<input type="range" min="${C.kiln.setMin}" max="${C.kiln.setMax}" step="10">`); set.value = run.setpoint;
      const autoLbl = VL.h(`<label class="vg-field">Steady pull (instead of dragging) <b></b></label>`);
      const auto = VL.h(`<input type="range" min="0" max="${PL.autoSpeedMax}" step="1" value="${st.auto}">`);
      const toggles = VL.h(`<div class="vg-row"><button class="vg-btn" data-a="twist">Twist while pulling</button></div>`);
      [setLbl, set, autoLbl, auto, toggles].forEach(x => P.appendChild(x));
      const stats = VL.h(`<div></div>`); P.appendChild(stats);
      const log = VL.h(`<div style="font-size:12.5px;color:var(--muted);margin-top:8px"></div>`); P.appendChild(log);
      const done = VL.h(`<button class="vg-btn primary" style="width:100%;margin-top:12px">Cut free · see the result →</button>`); P.appendChild(done);

      const say = (t, cls) => { st.events.push(t); log.insertBefore(VL.h(`<div class="${cls || ''}">${t}</div>`), log.firstChild); };

      let hand = null, travel = 0, pressing = false, raf = 0, prev = 0, t = 0;
      const lenCm = () => st.segments.reduce((a, s) => a + s.len, 0) / 10;
      let lastD = 0;

      function geo() { const w = canvas.clientWidth, h = canvas.clientHeight; return { w, h, hx: w / 2, hy: 46 }; }
      function gobR() { return Math.max(4, Math.cbrt(Math.max(st.gob, 0)) * 0.5); }

      function snap(why) {
        st.holding = false; st.snaps++; hand = null;
        if (st.segments.length) st.segments[st.segments.length - 1].flags.snap = true;
        say(why, 'warn');
      }

      function frame(dt) {
        t += dt;
        M.kilnStep(run.kiln, run.setpoint, dt * C.kiln.pullGameMinutesPerSecond * 60);
        run.heat.maxGlass = Math.max(run.heat.maxGlass, run.kiln.glass);
        const ix = VL.orificeIndex(run), rem = M.remaining(run.drain);
        const q = M.outputRate(ix, run.orifice, rem);
        const cellV = M.cellVolumeMm3();

        // pull speed: pointer travel, or the steady-pull slider
        let raw = 0;
        if (st.holding && st.auto > 0) raw = st.auto;
        else if (st.holding && pressing) raw = travel * PL.mmPerPixel / Math.max(dt, 1e-3) / 10;
        travel = 0;
        st.speed += (raw - st.speed) * Math.min(1, PL.speedSmoothing * dt * 60);
        if (st.speed < 0.2) st.speed = Math.max(0, raw ? st.speed : st.speed * 0.8);

        // glass leaving the pot
        const outCells = M.drain(run.drain, q * dt / cellV);
        const out = outCells * cellV;

        if (!st.holding || st.speed < 0.5) {
          st.gob += out;
          if (ix > PL.droopIndex) st.idleHot += dt;
          if (st.gob > PL.gobDropMm3) {
            st.drops++; run.heat.purgedCells += st.gob / cellV; st.gob = 0;
            if (st.holding) { st.holding = false; hand = null; if (st.segments.length) st.segments[st.segments.length - 1].flags.drop = true; }
            say('The gob got too heavy and fell. Keep it moving, or turn the heat down.', 'bad');
          }
          return;
        }
        // pulling: the gob bleeds into the strand first, so the start is thick
        const bleed = Math.min(st.gob, st.gob * 2.5 * dt);
        st.gob -= bleed;
        const feed = out + bleed, len = st.speed * 10 * dt;
        let d = Math.sqrt(4 * feed / (Math.PI * Math.max(len, 1e-6)));
        const flags = {};
        if (ix > PL.droopIndex && st.speed < PL.droopSpeed) {
          d *= 1 + 0.35 * Math.sin(t * 9) * (ix - PL.droopIndex) / (1 - PL.droopIndex);
          flags.droop = true;
        }
        st.maxSpeed = Math.max(st.maxSpeed, st.speed);
        if (st.twistOn) st.twist += PL.twistDegPerCm * len / 10 * Math.PI / 180;
        // coiling: how sharply the hand is turning
        const turnRate = st.turn.length ? st.turn.reduce((a, b) => a + b, 0) : 0;
        if (Math.abs(turnRate) > Math.PI * 1.2) flags.coil = true;

        if (rem > 0) {
          const sl = M.slice(run.drain);
          st.segments.push({ len, d, cells: sl.cells, forms: sl.forms, w: sl.w, twist: st.twist, ix, speed: st.speed, flags });
        }
        lastD = d;
        // tearing needs the overstretch to last a moment, not one jittery frame
        const over = st.speed > M.snapSpeed(ix) || d < PL.minDiameterMm;
        st.strain = over ? (st.strain || 0) + dt : Math.max(0, (st.strain || 0) - dt);
        if (st.strain > PL.tearGraceSec && rem < 0.03) {
          // the last glass thins out on its own: not the player's tear
          st.strain = 0; st.holding = false; hand = null;
          say('The pot ran dry and the last of the strand thinned and broke off.', 'ok');
        } else if (st.strain > PL.tearGraceSec) {
          st.strain = 0;
          snap(d < PL.minDiameterMm ? 'Pulled so thin it broke.' : `Torn: ${st.speed.toFixed(0)} cm/s is faster than glass this ${M.band(ix)} can stretch.`);
        }
        if (rem <= 0 && st.holding) { say('The pot is empty.', 'ok'); st.holding = false; }
      }

      function render() {
        const ix = VL.orificeIndex(run);
        mGlass.set((run.kiln.glass - C.kiln.roomTemp) / (C.kiln.setMax - C.kiln.roomTemp), M.toDisplay(run.kiln.glass), VL.glowColor(run.kiln.glass));
        mFlow.set(ix);
        const lim = M.snapSpeed(ix);
        mSpeed.set(st.speed / Math.max(lim, 1), `${st.speed.toFixed(0)} cm/s · tears ≈${lim.toFixed(0)}`, st.speed > lim * 0.8 ? '#8e2c25' : '#221f1d');
        mD.set(st.holding && st.speed > 0.5 ? Math.min(1, lastD / 8) : 0, st.holding && st.speed > 0.5 && isFinite(lastD) ? `${lastD.toFixed(1)} mm` : '–');
        setLbl.querySelector('b').textContent = M.toDisplay(run.setpoint);
        autoLbl.querySelector('b').textContent = st.auto ? `${st.auto} cm/s` : 'off';
        toggles.querySelector('[data-a=twist]').classList.toggle('on', st.twistOn);
        stats.innerHTML = `
          <div class="vg-stat"><span>Pulled</span><b>${lenCm().toFixed(0)} cm</b></div>
          <div class="vg-stat"><span>Glass left in pot</span><b>${Math.round(M.remaining(run.drain) * 100)}%</b></div>
          <div class="vg-stat"><span>Tears · dropped gobs</span><b>${st.snaps} · ${st.drops}</b></div>`;
        done.disabled = lenCm() < 3;
        hint.textContent = !st.holding
          ? (M.remaining(run.drain) <= 0 ? 'The pot is empty. Cut free to see what you made.' : 'Press on the glowing gob under the hole to grab it.')
          : st.auto ? 'Steady pull is on. Set it to 0 to drag by hand.'
          : pressing ? 'Pulling. Drag faster for thinner, slower for thicker.' : 'Holding the strand. Drag to keep pulling, or the gob keeps growing.';
        draw(ix);
      }

      function draw(ix) {
        const { ctx, w, h } = D.fit(canvas), g = geo();
        ctx.clearRect(0, 0, w, h);
        // kiln underside
        ctx.fillStyle = '#5b4a40'; ctx.fillRect(0, 0, w, g.hy - 10);
        ctx.fillStyle = VL.glowColor(run.kiln.air); ctx.fillRect(g.hx - 14, 0, 28, g.hy - 10);
        ctx.fillStyle = 'rgba(238,234,226,.55)'; ctx.font = '600 11px ui-monospace, Menlo, monospace'; ctx.textAlign = 'left';
        ctx.fillText(`kiln floor · hole ${M.orifice(run.orifice).label}`, 12, 18);
        const sl = M.slice(run.drain), col = D.sideColor(sl, st.twist);
        // laid-down strand (trail)
        const tr = st.trail;
        for (let k = 1; k < tr.length; k++) {
          const a = tr[k - 1], b = tr[k];
          if (b.gap) continue;
          ctx.strokeStyle = b.c; ctx.globalAlpha = Math.max(0.15, k / tr.length);
          ctx.lineWidth = b.wpx; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        // gob
        const r = gobR(), gy = g.hy - 10;
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(g.hx - 10, gy); ctx.quadraticCurveTo(g.hx - r * 1.2, gy + r, g.hx, gy + r * 2.1);
        ctx.quadraticCurveTo(g.hx + r * 1.2, gy + r, g.hx + 10, gy); ctx.fill();
        ctx.fillStyle = `rgba(255,140,50,${0.15 + 0.35 * ix})`; ctx.fill();
        // live strand from gob to hand, sagging more when runny
        if (st.holding && hand) {
          const wpx = strandPx(isFinite(lastD) ? lastD : 6);
          ctx.strokeStyle = col; ctx.lineWidth = wpx; ctx.lineCap = 'round';
          const mx = (g.hx + hand.x) / 2 + (ix - 0.4) * 60, my = (gy + r * 2 + hand.y) / 2 + ix * 50;
          ctx.beginPath(); ctx.moveTo(g.hx, gy + r * 2); ctx.quadraticCurveTo(mx, my, hand.x, hand.y); ctx.stroke();
          ctx.strokeStyle = `rgba(255,150,60,${0.4 * ix})`; ctx.lineWidth = Math.max(1, wpx * 0.4); ctx.stroke();
          // tweezers
          ctx.strokeStyle = '#c9c4bb'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(hand.x - 4, hand.y); ctx.lineTo(hand.x - 10, hand.y + 26); ctx.moveTo(hand.x + 4, hand.y); ctx.lineTo(hand.x + 10, hand.y + 26); ctx.stroke();
        } else if (M.remaining(run.drain) > 0) {
          ctx.strokeStyle = 'rgba(255,220,160,.6)'; ctx.setLineDash([3, 4]); ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(g.hx, gy + r, r + 14, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        }
        // current cross-section preview
        const pr = Math.min(42, w * 0.08);
        D.drawSlice(ctx, sl, w - pr - 16, h - pr - 30, pr, st.twist, M.orifice(run.orifice).aspect || 1, {});
        ctx.fillStyle = 'rgba(238,234,226,.7)'; ctx.textAlign = 'center';
        ctx.fillText('leaving the hole now', w - pr - 16, h - 12);
      }

      const strandPx = d => Math.max(1.2, Math.min(16, d * 2.2));

      function addTrail() {
        if (!st.holding || !hand || st.speed < 0.5) return;
        const last = st.trail[st.trail.length - 1];
        if (last && Math.hypot(last.x - hand.x, last.y - hand.y) < 3) return;
        const sl = M.slice(run.drain);
        st.trail.push({ x: hand.x, y: hand.y, c: D.sideColor(sl, st.twist), wpx: strandPx(isFinite(lastD) ? lastD : 6), gap: !last || last.cut });
        if (last && last.x !== undefined) {
          const a = Math.atan2(hand.y - last.y, hand.x - last.x);
          if (st.lastAng !== undefined) {
            let da = a - st.lastAng; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
            st.turn.push(da); if (st.turn.length > 24) st.turn.shift();
          }
          st.lastAng = a;
        }
        if (st.trail.length > 900) st.trail.shift();
      }

      function loop(now) {
        const dt = Math.min(0.05, (now - prev) / 1000 || 0); prev = now;
        if (st.holding && st.auto > 0) {
          // steady pull: the hand walks down and wraps, or circles if it was coiling
          const g = geo();
          if (!hand) hand = { x: g.hx, y: g.hy + 60 };
          hand = { x: g.hx + Math.sin(t * 0.7) * g.w * 0.25, y: g.hy + 80 + ((t * st.auto * 3) % (g.h - 160)) };
        }
        frame(dt); addTrail(); render();
        raf = requestAnimationFrame(loop);
      }

      function pt(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
      canvas.addEventListener('pointerdown', e => {
        canvas.setPointerCapture(e.pointerId);
        const p = pt(e), g = geo();
        if (!st.holding) {
          const near = Math.hypot(p.x - g.hx, p.y - (g.hy + gobR())) < gobR() + 70;
          if (!near || M.remaining(run.drain) <= 0) return;
          if (st.gob < C.pull.gobReadyMm3 * 0.3) { say('Not enough glass hanging there yet. Wait a moment.'); return; }
          st.holding = true; st.turn = []; st.lastAng = undefined;
          if (st.trail.length) st.trail[st.trail.length - 1].cut = true;
          say(st.segments.length ? 'Grabbed a new gob.' : 'Grabbed the gob.');
        }
        pressing = true; hand = p;
      });
      canvas.addEventListener('pointermove', e => {
        if (!pressing) return;
        const p = pt(e);
        if (hand) travel += Math.hypot(p.x - hand.x, p.y - hand.y);
        hand = p;
      });
      const up = () => { pressing = false; };
      canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);

      set.addEventListener('input', () => { run.setpoint = +set.value; });
      auto.addEventListener('input', () => { st.auto = +auto.value; });
      toggles.addEventListener('click', e => { if (e.target.closest('[data-a=twist]')) st.twistOn = !st.twistOn; });
      done.addEventListener('click', () => app.go('result'));

      raf = requestAnimationFrame(loop);
      this._stop = () => cancelAnimationFrame(raf);
    },
    unmount() { this._stop && this._stop(); },
  };
})(window.VitrigraphLab);
