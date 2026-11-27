import { FRITS } from '../config.js';
import { PAL, backdrop, box, text, button, banner, pipe, pieceProfile, gaugeH, rgbStr, glassRgb } from '../draw.js';
import { falloff } from '../scoring.js';
import { addStress, addOff } from '../heat.js';
import { workingOrder, pieceStyle, hit } from './common.js';

const BINS = FRITS.map((f, i) => ({ x: 70 + i * 140, y: 70, w: 118, h: 96, frit: f }));
const TABLE = { x: 180, y: 410, w: 600, h: 130 };
const PATCH = { x: 300, y: 440, w: 360, h: 70 };
const MOUTH = { x: 10, y: 220, w: 200, h: 160 };

export const color = {
  buttons: [],
  st: null,

  state(o) {
    const key = `${o.id}:${o.step}:${o.restarts}`;
    if (!this.st || this.st.key !== key) {
      this.st = { key, rolling: false, lastX: 0, bounceWarned: false, holding: false, pending: 0, puffs: 0, uneven: false, particles: [] };
    }
    return this.st;
  },

  update(dt, game) {
    const w = workingOrder(game, 'color');
    if (!w) return;
    const { o, step } = w;
    const s = this.state(o);
    const p = o.piece;
    const cfg = game.cfg;

    if (step.id === 'frit' && s.rolling && !game.busy) {
      game.contact = 'marver';
      game.work(dt);
    }

    if (step.id === 'blow') {
      const b = cfg.blow;
      if (s.holding && !game.busy) { s.pending += b.AIR_RATE * dt; game.work(dt); }
      // Air keeps expanding the bubble after release (lag), with a time constant TAU.
      const grow = s.pending * Math.min(1, dt / b.TAU_S);
      s.pending -= grow;
      const mult = p.heat > b.HOT ? b.HOT_MULT : p.heat < b.COLD ? b.COLD_MULT : 1;
      p.b += grow * mult;
      if (p.b > b.BLOWOUT) {
        game.sound('pop');
        game.lose(o, 'Blowout! The bubble popped. Start that one over.');
      }
    }

    s.particles = s.particles.filter((q) => (q.t += dt) < 0.6);
  },

  down(x, y, game) {
    if (game.busy) return;
    const w = workingOrder(game, 'color');
    if (!w) return;
    const { o, step } = w;
    const s = this.state(o);
    const p = o.piece;
    const cfg = game.cfg;

    if (step.id === 'frit') {
      const bin = BINS.find((b) => hit(b, x, y));
      if (bin) {
        if (p.doses >= cfg.frit.MAX_DOSES) return game.toast('That’s plenty of frit on the table.');
        p.doses++;
        p.doseRgbs.push(bin.frit.rgb);
        p.fritRgb = avg(p.doseRgbs);
        game.sound('sprinkle');
        return;
      }
      if (hit(TABLE, x, y)) {
        if (!p.doses) return game.toast('Pour some frit first: click a bin.');
        s.rolling = true;
        s.lastX = x;
      }
    }

    if (step.id === 'blow' && hit(MOUTH, x, y)) {
      const b = cfg.blow;
      s.holding = true;
      s.puffs++;
      game.sound('puff');
      if (p.heat < b.COLD) { addStress(p, cfg.stressEvents.coldPuff); game.toast('Too stiff to blow. Reheat!'); }
      if (p.heat > b.HOT) addOff(p, cfg.offEvents.hotPuff);
      if (p.heat < cfg.bands.blow[0] || p.heat > cfg.bands.blow[1]) s.uneven = true;
    }
  },

  move(x, y, game) {
    const s = this.st;
    if (!s?.rolling || game.busy) return;
    const w = workingOrder(game, 'color');
    if (!w || w.step.id !== 'frit') return;
    const p = w.o.piece;
    const cfg = game.cfg;
    const dx = Math.abs(x - s.lastX);
    s.lastX = x;
    if (!hit(PATCH, x, y)) return;
    if (p.heat >= cfg.frit.STICK_HEAT) {
      p.coverage = Math.min(1, p.coverage + dx * cfg.frit.COVERAGE_PER_PX);
      if (p.coverage >= cfg.frit.DONE_COVERAGE) {
        s.rolling = false;
        game.complete(100 * p.coverage);
      }
    } else {
      if (dx > 4 && Math.random() < 0.4) s.particles.push({ x, y: y - 10, t: 0, rgb: p.fritRgb });
      if (!s.bounceWarned) { s.bounceWarned = true; game.toast('Frit is bouncing off. It needs heat ≥ 75. Reheat!'); }
    }
  },

  up(x, y, game) {
    const s = this.st;
    if (!s) return;
    s.rolling = false;
    if (s.holding) s.holding = false;
  },

  finishBlow(game, o) {
    const cfg = game.cfg;
    const p = o.piece;
    const s = this.state(o);
    const v = p.b * p.sizeK;
    let acc = falloff(v - 1, cfg.blow.PERFECT, cfg.blow.ZERO_AT);
    if (s.uneven) acc -= cfg.blow.UNEVEN_PENALTY;
    if (p.rough) acc = Math.min(acc, cfg.frit.ROUGH_CAP);
    game.complete(Math.max(0, acc));
    if (v < 0.95) game.toast('A bit small.');
    else if (v > 1.05) game.toast('A bit big.');
    else game.toast('Right on size!');
  },

  draw(g, game, t) {
    this.buttons = [];
    backdrop(g);
    const cfg = game.cfg;

    BINS.forEach((b) => {
      box(g, b.x, b.y, b.w, b.h, '#5a4a42', 10);
      g.fillStyle = rgbStr(b.frit.rgb);
      for (let k = 0; k < 60; k++) g.fillRect(b.x + 12 + ((k * 37) % (b.w - 24)), b.y + 14 + ((k * 23) % 44), 4, 4);
      text(g, b.frit.name, b.x + b.w / 2, b.y + b.h - 12, { size: 14, align: 'center', color: PAL.paper });
    });
    text(g, 'FRIT', 20, 60, { size: 15, color: PAL.paper });

    const blowing = game.handOrder?.step === 5;
    if (!blowing) {
      box(g, TABLE.x, TABLE.y, TABLE.w, TABLE.h, PAL.steel, 6);
      g.fillStyle = PAL.steelHi; g.fillRect(TABLE.x + 4, TABLE.y + 4, TABLE.w - 8, 10);
    }

    const w = workingOrder(game, 'color', g);
    if (!w) { for (const b of this.buttons) button(g, b); return; }
    const { o, step } = w;
    const s = this.state(o);
    const p = o.piece;
    const st = pieceStyle(o);

    if (step.id === 'frit' || step.id === 'meltin') {
      Object.assign(st, pieceStyle(o, { zoom: 1.5 }));
      // Frit patch on the table.
      if (p.doseRgbs.length && step.id === 'frit') {
        g.save();
        g.globalAlpha = 1 - p.coverage * 0.8;
        p.doseRgbs.forEach((rgb, i) => {
          g.fillStyle = rgbStr(rgb);
          for (let k = 0; k < 130; k++) {
            const u = ((k * 0.618 + i * 0.31) % 1), v = ((k * 0.414 + i * 0.17) % 1);
            g.fillRect(PATCH.x + u * PATCH.w, PATCH.y + v * PATCH.h, 5, 4);
          }
        });
        g.restore();
        g.setLineDash([6, 6]); g.strokeStyle = 'rgba(43,30,26,0.6)'; g.lineWidth = 2;
        g.strokeRect(PATCH.x, PATCH.y, PATCH.w, PATCH.h); g.setLineDash([]);
      }
      const py = TABLE.y - st.R + 2;
      pipe(g, 0, py, 360);
      pieceProfile(g, 360, py, 1, st);
      for (const q of s.particles) {
        g.fillStyle = rgbStr(q.rgb || [200, 200, 200], 1 - q.t / 0.6);
        g.fillRect(q.x + q.t * 30, q.y - q.t * 80 + q.t * q.t * 200, 5, 5);
      }
      gaugeH(g, 800, 300, 140, 30, p.coverage, [cfg.frit.DONE_COVERAGE, 1], { label: 'Coverage' });
      text(g, `Doses: ${p.doses} / ticket ${o.ticket.doses}`, 800, 360, { size: 15, color: PAL.paper });
      if (step.id === 'frit') {
        banner(g, p.doses ? (p.heat >= cfg.frit.STICK_HEAT ? 'Drag across the frit patch to roll the gather in it.' : 'Too cold for frit to stick: reheat (≥ 75).') : 'Click a frit bin to pour. One click = one dose.');
      } else {
        const melt = p.meltT / cfg.frit.MELT_S;
        banner(g, 'Hold the GLORY HOLE to melt the frit in (heat ≥ 85).', PAL.glory);
        gaugeH(g, 800, 410, 140, 30, melt, null, { label: 'Melt-in', color: PAL.glory });
        this.buttons.push({ x: 790, y: 470, w: 160, h: 44, label: 'Blow anyway', size: 16, color: PAL.amber, onClick: () => { p.rough = true; game.toast('Rough frit: it may pit and tear.'); game.complete(70, { noHeat: true }); } });
      }
    }

    if (step.id === 'blow') {
      const py = 300;
      box(g, MOUTH.x, MOUTH.y, MOUTH.w, MOUTH.h, s.holding ? 'rgba(255,212,92,0.35)' : 'rgba(43,30,26,0.35)', 16, 2);
      text(g, s.holding ? 'Blowing…' : 'Hold here', MOUTH.x + MOUTH.w / 2, MOUTH.y + 30, { size: 17, align: 'center', color: PAL.paper });
      text(g, 'to blow', MOUTH.x + MOUTH.w / 2, MOUTH.y + 52, { size: 15, align: 'center', color: PAL.paper });
      pipe(g, 40, py, 430);
      box(g, 34, py - 12, 26, 24, PAL.sawdust, 6);

      // Target ghost at v = 1.
      const R1 = 14 + 56;
      g.save(); g.setLineDash([8, 6]);
      g.strokeStyle = PAL.paper; g.lineWidth = 2;
      g.beginPath(); g.ellipse(430 + R1 * 1.1, py, R1 * 1.1, R1, 0, 0, Math.PI * 2); g.stroke();
      g.restore();
      pieceProfile(g, 430, py, 1, { ...st, cone: Math.min(st.cone, 0.2) });

      const v = p.b * p.sizeK;
      gaugeH(g, 640, 470, 280, 30, v, [1 - cfg.blow.PERFECT, 1 + cfg.blow.PERFECT], { label: `Size: ${Math.round(v * 100)}% of target`, max: 1.4 });
      const canFinish = v >= 0.6 && s.pending < 0.02 && !s.holding;
      this.buttons.push({ x: 700, y: 530, w: 190, h: 46, label: 'Done blowing', enabled: canFinish, color: PAL.green, textColor: '#fff', onClick: () => canFinish && this.finishBlow(game, o) });
      banner(g, p.heat < cfg.blow.COLD ? 'Too stiff to blow. Reheat in the glory hole!' : 'Hold to blow in puffs. Air keeps expanding after you let go, so release early!');
      if (p.rough) text(g, 'rough frit', 640, 450, { size: 14, color: PAL.amber });
    }

    for (const b of this.buttons) button(g, b);
  },
};

function avg(list) {
  const n = list.length;
  return [0, 1, 2].map((i) => Math.round(list.reduce((a, c) => a + c[i], 0) / n));
}
