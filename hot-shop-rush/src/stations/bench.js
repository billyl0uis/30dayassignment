import { PAL, backdrop, box, text, button, banner, pipe, pieceProfile, gaugeV, steam } from '../draw.js';
import { falloff } from '../scoring.js';
import { addStress, addOff, correctOff, inBand } from '../heat.js';
import { workingOrder, pieceStyle, hit } from './common.js';

const AX = 400;          // where the pipe meets the piece
const AY = 290;
const WORK = { x: 300, y: 160, w: 480, h: 280 };
const RAILS = { x: 30, y: 530, w: 900, h: 56 };

export const bench = {
  buttons: [],
  st: null,
  rail: { on: false, lastX: 0, dx: 0 },

  state(o) {
    const key = `${o.id}:${o.step}:${o.restarts}`;
    if (!this.st || this.st.key !== key) {
      this.st = { key, holding: false, jx: AX + 60, depth: 0, pad: -1, pressing: false, steamT: 0 };
    }
    return this.st;
  },

  update(dt, game) {
    const o = game.handOrder;
    const cfg = game.cfg;
    // Rail strip: roll the pipe to pull it back on center (any time at the bench).
    if (this.rail.on && o?.piece && !game.busy) {
      if (this.rail.dx > 2 && inBand(o.piece.heat, cfg.heat.WORK_BAND)) correctOff(cfg, o.piece, dt);
      this.rail.dx = 0;
    }

    const w = workingOrder(game, 'bench');
    if (!w || game.busy) return;
    const { o: wo, step } = w;
    const s = this.state(wo);
    const p = wo.piece;

    if (step.id === 'jacks' && s.holding) {
      s.depth += cfg.jacks.SQUEEZE_RATE * dt;
      p.neck = s.depth;
      game.contact = 'tool';
      game.work(dt);
      if (s.depth >= cfg.jacks.DROP_AT) {
        s.holding = false;
        game.lose(wo, 'Too deep! It dropped off the pipe into the sand bucket.');
      }
    }

    if (step.id === 'paddle' && s.pressing) {
      game.contact = 'tool';
      game.work(dt);
      s.steamT += dt;
      if (p.heat >= cfg.paddle.MIN_HEAT) {
        s.pad += cfg.paddle.RATE * dt;
        p.flat = Math.min(1, (s.pad + 1) / 1);
        if (s.pad > cfg.paddle.DISH_AT) {
          s.pressing = false;
          p.shapePenalty += cfg.paddle.DISH_PENALTY;
          game.toast('Pressed too long: the bottom dished in.');
          this.finishPaddle(game, wo);
        }
      }
    }
  },

  finishPaddle(game, o) {
    const cfg = game.cfg;
    const s = this.state(o);
    const p = o.piece;
    let acc = Math.max(0, 100 - Math.abs(s.pad) * 160);
    if (p.heat > cfg.paddle.BULGE_HEAT) { acc -= cfg.paddle.BULGE_PENALTY; game.toast('Too hot: the bottom bulged back out.'); }
    p.flat = 1;
    game.complete(Math.max(0, acc));
  },

  down(x, y, game) {
    if (game.busy) return;
    if (hit(RAILS, x, y) && game.handPiece) { this.rail = { on: true, lastX: x, dx: 0 }; return; }
    const w = workingOrder(game, 'bench');
    if (!w || !hit(WORK, x, y)) return;
    const { o, step } = w;
    const s = this.state(o);
    const cfg = game.cfg;
    if (step.id === 'jacks') { s.holding = true; s.jx = this.clampJx(o, x); game.sound('scrape'); }
    if (step.id === 'paddle') {
      if (o.piece.heat < cfg.paddle.MIN_HEAT) {
        addStress(o.piece, cfg.stressEvents.paddleCold);
        game.toast('Too stiff to paddle. Reheat!');
        return;
      }
      s.pressing = true;
      s.steamT = 0;
      game.sound('hiss');
    }
  },

  move(x, y, game) {
    if (this.rail.on) { this.rail.dx += Math.abs(x - this.rail.lastX); this.rail.lastX = x; }
    const s = this.st;
    const o = game.handOrder;
    if (s?.holding && o?.piece) s.jx = this.clampJx(o, x);
  },

  clampJx(o, x) {
    const st = pieceStyle(o);
    return Math.max(AX + 4, Math.min(AX + st.L * 0.9, x));
  },

  up(x, y, game) {
    this.rail.on = false;
    const s = this.st;
    if (!s) return;
    if (s.pressing) s.pressing = false;
    if (!s.holding) return;
    s.holding = false;
    const w = workingOrder(game, 'bench');
    if (!w || w.step.id !== 'jacks') return;
    const cfg = game.cfg;
    const j = cfg.jacks;
    const p = w.o.piece;
    if (s.depth < 0.1) { s.depth = 0; p.neck = 0; return; }
    const st = pieceStyle(w.o);
    const notchX = AX + j.NOTCH_U * st.L;
    const posErr = Math.abs(s.jx - notchX) / st.L;
    const pos = falloff(posErr, j.POS_TOL, 0.3);
    const [lo, hi] = j.DEPTH_BAND;
    const dErr = s.depth < lo ? lo - s.depth : s.depth > hi ? s.depth - hi : 0;
    const depth = falloff(dErr, 0, 0.35);
    let acc = 0.5 * pos + 0.5 * depth;
    if (p.heat > j.HOT) { addOff(p, cfg.offEvents.hotJacks); game.toast('Too hot: the neck stretched and drooped.'); }
    if (p.heat < j.COLD) { acc -= j.COLD_PENALTY; game.toast('Too stiff: the jacks dragged.'); }
    p.shallow = s.depth < lo;
    if (p.shallow) game.toast('Shallow jack line. Crack-off will be harder.');
    game.complete(Math.max(0, acc));
  },

  draw(g, game, t) {
    this.buttons = [];
    backdrop(g);
    const cfg = game.cfg;

    // Bench: rails and seat.
    box(g, 60, 340, 520, 24, PAL.wood, 6);
    box(g, 60, 372, 520, 24, PAL.wood, 6);
    box(g, 90, 396, 30, 120, PAL.wood, 4);
    box(g, 520, 396, 30, 120, PAL.wood, 4);
    box(g, 100, 420, 440, 30, PAL.sawdust, 6);
    text(g, 'BENCH', 320, 442, { size: 15, align: 'center' });

    // Tool rack.
    box(g, 800, 120, 140, 300, PAL.wood, 10);
    const ho = game.handOrder;
    const cur = ho && ho.piece ? ho.step : -1;
    const tools = [['Jacks', 6], ['Paddle', 7]];
    tools.forEach(([name, idx], i) => {
      const active = cur === idx;
      box(g, 815, 140 + i * 90, 110, 70, active ? PAL.glory : PAL.steelHi, 10);
      text(g, name, 870, 182 + i * 90, { size: 17, align: 'center' });
    });

    // Rail strip.
    box(g, RAILS.x, RAILS.y, RAILS.w, RAILS.h, this.rail.on ? 'rgba(255,212,92,0.4)' : 'rgba(43,30,26,0.45)', 12, 2);
    text(g, '⟷ Drag here to roll on the rails and re-center', RAILS.x + 20, RAILS.y + 35, { size: 16, color: PAL.paper });
    if (ho?.piece) {
      gaugeV(g, RAILS.x + RAILS.w - 40, 380, 26, 130, ho.piece.off / 100, null, { color: PAL.red, label: 'Wobble' });
    }

    const w = workingOrder(game, 'bench', g);
    if (!w) {
      if (ho?.piece) { const st = pieceStyle(ho); pipe(g, 40, AY, AX); pieceProfile(g, AX, AY, 1, st); }
      for (const b of this.buttons) button(g, b);
      return;
    }
    const { o, step } = w;
    const s = this.state(o);
    const p = o.piece;
    const st = pieceStyle(o);

    // Checklist.
    box(g, 20, 70, 230, 100, PAL.paper, 8);
    text(g, 'Shaping', 34, 96, { size: 16 });
    [['Jack line', 6], ['Paddle bottom', 7]].forEach(([label, idx], i) => {
      const done = o.step > idx;
      text(g, `${done ? '☑' : o.step === idx ? '▶' : '☐'} ${label}`, 34, 124 + i * 26, { size: 15, weight: 600, color: done ? PAL.green : PAL.soot });
    });

    pipe(g, 40, AY, AX);
    pieceProfile(g, AX, AY, 1, st);

    if (step.id === 'jacks') {
      const notchX = AX + cfg.jacks.NOTCH_U * st.L;
      g.fillStyle = PAL.glory; g.strokeStyle = PAL.soot; g.lineWidth = 2;
      g.beginPath(); g.moveTo(notchX, AY - st.R - 14); g.lineTo(notchX - 9, AY - st.R - 30); g.lineTo(notchX + 9, AY - st.R - 30); g.closePath(); g.fill(); g.stroke();
      // Jacks blades.
      const gap = st.R * (1 - s.depth * 0.55) + 4;
      g.strokeStyle = PAL.soot; g.lineWidth = 10; g.lineCap = 'round';
      g.beginPath(); g.moveTo(s.jx, AY - gap); g.lineTo(s.jx + 120, AY - gap - 110); g.moveTo(s.jx, AY + gap); g.lineTo(s.jx + 120, AY + gap + 110); g.stroke();
      g.strokeStyle = PAL.steelHi; g.lineWidth = 5;
      g.beginPath(); g.moveTo(s.jx, AY - gap); g.lineTo(s.jx + 120, AY - gap - 110); g.moveTo(s.jx, AY + gap); g.lineTo(s.jx + 120, AY + gap + 110); g.stroke();
      gaugeV(g, 720, 160, 34, 220, s.depth, cfg.jacks.DEPTH_BAND, { label: 'Depth' });
      banner(g, 'Hold on the piece to squeeze the jacks at the ▼ mark. Release in the green band.');
    }

    if (step.id === 'paddle') {
      const bx = AX + st.L + 4;
      g.fillStyle = PAL.wood; g.strokeStyle = PAL.soot; g.lineWidth = 3;
      g.beginPath(); g.roundRect(bx + (s.pressing ? 0 : 20), AY - st.R - 30, 18, st.R * 2 + 60, 6); g.fill(); g.stroke();
      g.beginPath(); g.roundRect(bx + (s.pressing ? 14 : 34), AY - 8, 110, 16, 6); g.fill(); g.stroke();
      if (s.pressing) steam(g, bx + 8, AY - st.R - 30, t, 4);
      // Level bubble.
      const L = { x: 300, y: 470, w: 300, h: 44 };
      box(g, L.x, L.y, L.w, L.h, '#d8f0c8', 22);
      g.strokeStyle = PAL.soot; g.lineWidth = 2;
      g.beginPath(); g.moveTo(L.x + L.w / 2 - 22, L.y + 4); g.lineTo(L.x + L.w / 2 - 22, L.y + L.h - 4);
      g.moveTo(L.x + L.w / 2 + 22, L.y + 4); g.lineTo(L.x + L.w / 2 + 22, L.y + L.h - 4); g.stroke();
      const bxp = L.x + L.w / 2 + Math.max(-1, Math.min(1, s.pad)) * (L.w / 2 - 22);
      g.beginPath(); g.ellipse(bxp, L.y + L.h / 2, 18, 12, 0, 0, Math.PI * 2);
      g.fillStyle = '#fff'; g.fill(); g.stroke();
      const canDone = s.pad > -0.75 && !s.pressing;
      this.buttons.push({ x: 620, y: 466, w: 170, h: 50, label: 'Done paddling', enabled: canDone, color: PAL.green, textColor: '#fff', onClick: () => canDone && this.finishPaddle(game, o) });
      banner(g, 'Hold on the piece to press the paddle. Let go when the bubble is centered.');
    }

    for (const b of this.buttons) button(g, b);
  },
};
