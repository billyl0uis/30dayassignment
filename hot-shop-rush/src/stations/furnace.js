import { PAL, backdrop, box, text, button, banner, pipe, pieceProfile, gaugeV, glow, rgbStr } from '../draw.js';
import { gatherAccuracy } from '../scoring.js';
import { addStress, addOff, correctOff, inBand } from '../heat.js';
import { workingOrder, pieceStyle, hit } from './common.js';
import { stepOf } from '../game.js';

const FURNACE = { x: 400, y: 70, w: 320, h: 270 };
const MARVER = { x: 330, y: 430, w: 590, h: 120 };
const RACK = { x: 30, y: 120, w: 140, h: 250 };
const WARMER = [{ x: 30, y: 470, w: 125, h: 100 }, { x: 165, y: 470, w: 125, h: 100 }];
const INSET = { cx: 860, cy: 160, r: 62 };

export const furnace = {
  buttons: [],
  st: null,

  state(o) {
    const key = `${o.id}:${o.step}:${o.restarts}`;
    if (!this.st || this.st.key !== key) {
      const a = Math.random() * Math.PI * 2;
      this.st = {
        key, holding: false, g: 0, overT: 0,
        engaged: false, lastX: 0, dxAcc: 0, speed: 0, coneTarget: 0.55,
        ecc: { x: Math.cos(a) * 0.7, y: Math.sin(a) * 0.7 }, ringT: 0, rollT: 0, stallT: 0,
        stalled: false, chilled: false, chatterWarned: false,
      };
    }
    return this.st;
  },

  update(dt, game) {
    const w = workingOrder(game, 'furnace');
    if (!w) { if (this.st) this.st.holding = this.st.engaged = false; return; }
    const { o, step } = w;
    const s = this.state(o);
    const cfg = game.cfg;

    if (step.id === 'gather' && s.holding) {
      s.g = Math.min(1, s.g + dt / cfg.gather.FILL_S);
      if (s.g >= 1) s.overT += dt;
    }

    if (step.id === 'marver') {
      const p = o.piece;
      const m = cfg.marver;
      const ring = m.RING * (p.massMult < 1 ? 0.8 : 1);
      const mag = Math.hypot(s.ecc.x, s.ecc.y);
      if (s.engaged && !game.busy) {
        s.speed = s.speed * 0.6 + (s.dxAcc / Math.max(dt, 1e-3)) * 0.4;
        s.dxAcc = 0;
        game.contact = 'marver';
        game.work(dt);
        const rolling = s.speed > m.STALL_SPEED;
        if (rolling) {
          s.rollT += dt;
          s.stallT = 0;
          p.cone += Math.sign(s.coneTarget - p.cone) * Math.min(Math.abs(s.coneTarget - p.cone), 0.9 * dt);
          const ang = Math.atan2(s.ecc.y, s.ecc.x) + s.speed * 0.004 * dt;
          let nm = mag;
          if (s.speed >= m.GOOD_SPEED[0] && s.speed <= m.GOOD_SPEED[1]) nm *= Math.exp(-1.4 * dt);
          if (s.speed > m.CHATTER_SPEED) {
            nm = Math.min(1, nm + 1.2 * dt);
            if (!s.chatterWarned) { s.chatterWarned = true; game.toast('Too fast! The gather is chattering.'); }
          }
          s.ecc = { x: Math.cos(ang) * nm, y: Math.sin(ang) * nm };
          if (nm <= ring) s.ringT += dt;
          if (inBand(p.heat, cfg.heat.WORK_BAND)) correctOff(cfg, p, dt);
          if (p.heat < m.CHILL_HEAT && !s.chilled) {
            s.chilled = true;
            addStress(p, cfg.stressEvents.marverCold);
            game.toast('Chill mark! It was too cold for the marver.');
          }
        } else {
          s.stallT += dt;
          if (s.stallT > m.STALL_S && !s.stalled) {
            s.stalled = true;
            addOff(p, cfg.offEvents.marverStall);
            s.ecc = { x: s.ecc.x + 0.35, y: s.ecc.y };
            game.toast('It flattened on one side. Keep it rolling!');
          }
        }
      } else if (p.heat > 80) {
        // Hot glass sags off-center when nobody's turning it on the marver.
        const ang = Math.atan2(s.ecc.y, s.ecc.x);
        const nm = Math.min(1, mag + 0.08 * dt);
        s.ecc = { x: Math.cos(ang) * nm, y: Math.sin(ang) * nm };
      }

      const overlap = this.overlap(o, cfg);
      if (s.ringT >= m.RING_S && overlap >= m.MIN_OVERLAP) {
        const centering = Math.min(100, 40 + 60 * (s.ringT / Math.max(s.rollT, s.ringT)));
        const sil = Math.min(overlap, s.chilled ? m.SILHOUETTE_CAP_CHILLED : 100);
        s.engaged = false;
        game.complete(0.6 * centering + 0.4 * sil);
      }
    }
  },

  overlap(o, cfg) {
    const target = cfg.marver.targetCone[o.ticket.form];
    return Math.max(0, Math.min(100, 100 - Math.abs(o.piece.cone - target) * 250));
  },

  down(x, y, game) {
    if (game.busy) return;
    const wi = WARMER.findIndex((r) => hit(r, x, y));
    if (wi >= 0) return game.clickWarmer(wi);
    const w = workingOrder(game, 'furnace');
    if (!w || game.busy) return;
    const { o, step } = w;
    const s = this.state(o);
    if (step.id === 'gather' && hit(FURNACE, x, y)) { s.holding = true; s.g = 0; s.overT = 0; game.sound('dip'); }
    if (step.id === 'marver' && hit(MARVER, x, y)) {
      s.engaged = true; s.lastX = x; s.dxAcc = 0; s.speed = 0; s.stallT = 0; s.stalled = false;
      this.setCone(y);
    }
  },

  move(x, y) {
    const s = this.st;
    if (s?.engaged) {
      s.dxAcc += Math.abs(x - s.lastX);
      s.lastX = x;
      this.setCone(y);
    }
  },

  setCone(y) {
    const u = (y - (MARVER.y + 10)) / (MARVER.h - 20);
    this.st.coneTarget = Math.max(0, Math.min(1, 1 - u));
  },

  up(x, y, game) {
    const s = this.st;
    if (!s) return;
    if (s.engaged) s.engaged = false;
    if (!s.holding) return;
    s.holding = false;
    const w = workingOrder(game, 'furnace');
    if (!w || w.step.id !== 'gather') return;
    if (s.g < 0.08) return;
    const cfg = game.cfg;
    const o = w.o;
    const target = cfg.gather.target[o.ticket.size];
    let acc = gatherAccuracy(s.g, target, game.gatherHalfBand(), cfg.gather.ZERO_AT);
    if (o.pipeWarm < 1) acc = Math.min(acc, cfg.pipe.UNDERWARM_CAP);
    const drip = s.overT > cfg.gather.DRIP_AFTER_S;
    game.startPiece(s.g, acc);
    if (drip) { addOff(o.piece, cfg.offEvents.drip); game.toast('It dripped! Too much time in the pot.'); }
    else if (s.g < target - game.gatherHalfBand()) game.toast('A little light on glass.');
    else if (s.g > target + game.gatherHalfBand()) game.toast('Heavy gather: slower to cool, harder to center.');
    else game.toast('Nice gather!');
  },

  draw(g, game, t) {
    this.buttons = [];
    backdrop(g);
    const cfg = game.cfg;
    const ho = game.handOrder;
    const step = ho && stepOf(ho);

    // Pipe rack.
    box(g, RACK.x, RACK.y, RACK.w, RACK.h, PAL.wood, 8);
    for (let i = 0; i < 5; i++) {
      g.strokeStyle = PAL.soot; g.lineWidth = 9; g.lineCap = 'round';
      g.beginPath(); g.moveTo(RACK.x + 22 + i * 24, RACK.y + 18); g.lineTo(RACK.x + 22 + i * 24, RACK.y + RACK.h - 18); g.stroke();
      g.strokeStyle = PAL.steel; g.lineWidth = 5;
      g.beginPath(); g.moveTo(RACK.x + 22 + i * 24, RACK.y + 18); g.lineTo(RACK.x + 22 + i * 24, RACK.y + RACK.h - 18); g.stroke();
    }
    this.buttons.push({ x: 30, y: 384, w: 200, h: 46, label: 'Warm a pipe', size: 17, onClick: () => game.grabPipe() });

    // Pipe warmer.
    text(g, 'Pipe warmer', 30, 462, { size: 15, color: PAL.paper });
    WARMER.forEach((r, i) => {
      box(g, r.x, r.y, r.w, r.h, '#4a3a33', 10);
      const id = game.warmer[i];
      const o = id != null && game.order(id);
      if (o) {
        const f = o.pipeWarm;
        g.lineWidth = 8;
        g.strokeStyle = 'rgba(0,0,0,0.35)';
        g.beginPath(); g.arc(r.x + r.w / 2, r.y + 42, 24, 0, Math.PI * 2); g.stroke();
        g.strokeStyle = f >= 1 ? PAL.green : PAL.hotOrange;
        g.beginPath(); g.arc(r.x + r.w / 2, r.y + 42, 24, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); g.stroke();
        text(g, f >= 1 ? 'Ready' : `${Math.ceil((1 - f) * cfg.pipe.WARM_S)}s`, r.x + r.w / 2, r.y + 48, { size: 15, align: 'center', color: PAL.paper });
        text(g, `#${o.id} ${o.customer.name}`, r.x + r.w / 2, r.y + 88, { size: 14, align: 'center', color: PAL.paper });
      } else {
        text(g, 'empty', r.x + r.w / 2, r.y + 56, { size: 14, align: 'center', color: 'rgba(255,255,255,0.5)' });
      }
    });

    // Furnace.
    box(g, FURNACE.x, FURNACE.y, FURNACE.w, FURNACE.h, '#6b4a3c', 40);
    const doorOpen = step?.id === 'gather';
    const dc = { x: FURNACE.x + FURNACE.w / 2, y: FURNACE.y + 150 };
    glow(g, dc.x, dc.y, 140, doorOpen ? 98 : 75);
    g.beginPath(); g.arc(dc.x, dc.y, 78, 0, Math.PI * 2);
    g.fillStyle = doorOpen ? PAL.glory : PAL.ember; g.fill();
    g.lineWidth = 4; g.strokeStyle = PAL.soot; g.stroke();
    if (doorOpen) {
      // Crucible cross-section.
      g.beginPath(); g.arc(dc.x, dc.y + 10, 60, 0, Math.PI);
      g.fillStyle = PAL.hotOrange; g.fill(); g.stroke();
      const wave = Math.sin(t * 3) * 3;
      g.fillStyle = PAL.glory;
      g.fillRect(dc.x - 58, dc.y + 8 + wave, 116, 4);
    } else {
      box(g, dc.x - 82, dc.y - 82, 164, 164, 'rgba(90,60,50,0.92)', 30);
      text(g, 'FURNACE', dc.x, dc.y + 6, { size: 18, align: 'center', color: PAL.sawdust });
    }

    // Marver.
    box(g, MARVER.x, MARVER.y, MARVER.w, MARVER.h, PAL.steel, 6);
    g.fillStyle = PAL.steelHi; g.fillRect(MARVER.x + 4, MARVER.y + 4, MARVER.w - 8, 10);
    text(g, 'MARVER', MARVER.x + MARVER.w - 14, MARVER.y + MARVER.h - 12, { size: 14, align: 'right', color: '#3d474d' });

    const w = workingOrder(game, 'furnace', g);
    if (!w) {
      if (ho && !ho.piece) {
        banner(g, step?.id === 'gather' ? 'Hold on the furnace to gather.' : 'Put the pipe back in a warmer slot.');
      }
      for (const b of this.buttons) button(g, b);
      return;
    }
    const { o } = w;
    const s = this.state(o);

    if (w.step.id === 'gather') {
      banner(g, 'Hold on the furnace to gather. Release in the green band.');
      const target = cfg.gather.target[o.ticket.size];
      const hb = game.gatherHalfBand();
      gaugeV(g, 750, 90, 44, 240, s.g, [target - hb, target + hb], { label: 'Gather' });
      // Pipe into the furnace while holding.
      if (s.holding) pipe(g, 200, dc.y, dc.x + 20);
      else pipe(g, 200, dc.y + 40, dc.x - 90);
      if (s.overT > 0) text(g, 'Drip!', dc.x, FURNACE.y + FURNACE.h + 24, { size: 18, align: 'center', color: PAL.glory });
    }

    if (w.step.id === 'marver') {
      const p = o.piece;
      const st = pieceStyle(o, { zoom: 1.5 });
      const py = MARVER.y - st.R + 2;
      const ax = 560;
      pipe(g, 250, py, ax);
      // Target silhouette (dashed).
      g.save(); g.setLineDash([8, 6]); g.globalAlpha = 0.9;
      const tgt = { ...st, cone: cfg.marver.targetCone[o.ticket.form], heat: 0, coverage: 0 };
      drawOutline(g, ax, py, tgt);
      g.restore();
      pieceProfile(g, ax, py, 1, st);

      // Shape scale (nose ↔ even).
      const sx = MARVER.x + 14;
      box(g, sx, MARVER.y + 10, 26, MARVER.h - 20, '#3a2a24', 6);
      const tc = cfg.marver.targetCone[o.ticket.form];
      const ty = (c) => MARVER.y + 10 + (1 - c) * (MARVER.h - 20);
      g.fillStyle = 'rgba(79,166,90,0.8)';
      g.fillRect(sx + 3, ty(tc + 0.06), 20, ty(tc - 0.06) - ty(tc + 0.06));
      g.fillStyle = PAL.glory;
      g.fillRect(sx - 4, ty(p.cone) - 3, 34, 6);
      text(g, 'nose', sx + 34, MARVER.y + 28, { size: 13, color: '#2b2b2b' });
      text(g, 'even', sx + 34, MARVER.y + MARVER.h - 14, { size: 13, color: '#2b2b2b' });

      // End-view inset: centering dot.
      const ring = cfg.marver.RING * (p.massMult < 1 ? 0.8 : 1);
      box(g, INSET.cx - INSET.r - 14, INSET.cy - INSET.r - 34, INSET.r * 2 + 28, INSET.r * 2 + 64, 'rgba(43,30,26,0.85)', 12, 0);
      text(g, 'End view', INSET.cx, INSET.cy - INSET.r - 12, { size: 14, align: 'center', color: PAL.paper });
      g.beginPath(); g.arc(INSET.cx, INSET.cy, INSET.r, 0, Math.PI * 2); g.fillStyle = '#3a2a24'; g.fill();
      g.beginPath(); g.arc(INSET.cx, INSET.cy, INSET.r * ring, 0, Math.PI * 2);
      g.fillStyle = 'rgba(79,166,90,0.6)'; g.fill(); g.strokeStyle = PAL.green; g.lineWidth = 2; g.stroke();
      g.beginPath(); g.arc(INSET.cx + s.ecc.x * INSET.r, INSET.cy + s.ecc.y * INSET.r, 9, 0, Math.PI * 2);
      g.fillStyle = PAL.glory; g.fill(); g.strokeStyle = PAL.soot; g.lineWidth = 3; g.stroke();
      const prog = Math.min(1, s.ringT / cfg.marver.RING_S);
      g.fillStyle = PAL.green; g.fillRect(INSET.cx - INSET.r, INSET.cy + INSET.r + 12, prog * INSET.r * 2, 8);
      g.strokeStyle = PAL.paper; g.lineWidth = 1; g.strokeRect(INSET.cx - INSET.r, INSET.cy + INSET.r + 12, INSET.r * 2, 8);

      const ov = this.overlap(o, cfg);
      banner(g, s.engaged
        ? `Rolling ${s.speed > cfg.marver.CHATTER_SPEED ? 'TOO FAST' : s.speed < cfg.marver.STALL_SPEED ? '— keep moving!' : '✓'}   shape ${Math.round(ov)}%`
        : 'Drag left/right on the marver to roll. Height sets the shape: match the dashed outline.');
    }
    for (const b of this.buttons) button(g, b);
  },
};

function drawOutline(g, x, y, st) {
  const N = 30;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    let r = st.R * (1 - st.cone * 0.55 * u);
    if (u > 0.7) r *= Math.sqrt(Math.max(0, 1 - ((u - 0.7) / 0.3) ** 2));
    pts.push([x + u * st.L, r]);
  }
  g.beginPath();
  pts.forEach(([px, r], i) => (i ? g.lineTo(px, y - r) : g.moveTo(px, y - r)));
  for (let i = pts.length - 1; i >= 0; i--) g.lineTo(pts[i][0], y + pts[i][1]);
  g.strokeStyle = PAL.paper;
  g.lineWidth = 2;
  g.stroke();
}

export { WARMER };
