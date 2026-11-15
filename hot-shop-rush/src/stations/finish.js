import { PAL, backdrop, box, text, button, banner, pipe, pieceProfile, gaugeV, steam, juno, glow, rgbStr, glassRgb } from '../draw.js';
import { falloff } from '../scoring.js';
import { addStress, addOff } from '../heat.js';
import { heatToF } from '../config.js';
import { workingOrder, pieceStyle, hit } from './common.js';

const OX = 300;   // opening / pipe end of the piece
const AY = 280;
const ANNEALER = { x: 740, y: 120, w: 200, h: 330 };

export const finish = {
  buttons: [],
  st: null,

  state(o) {
    const key = `${o.id}:${o.step}:${o.restarts}`;
    if (!this.st || this.st.key !== key) {
      this.st = { key, dragging: false, tip: null, dripped: false, dripT: 0, taps: 0, lipDrag: false, lastDist: 0, dropped: false };
    }
    return this.st;
  },

  puntyRest(o) {
    const st = pieceStyle(o);
    return { x: OX + st.L + 150, y: AY + 60 };
  },

  update(dt, game) {
    const w = workingOrder(game, 'finish');
    if (!w) return;
    const s = this.state(w.o);
    if (s.dripped) s.dripT += dt;
    if (w.step.id === 'lip' && s.lipDrag && !game.busy) { game.contact = 'tool'; game.work(dt); }
  },

  down(x, y, game) {
    if (game.busy) return;
    const w = workingOrder(game, 'finish');
    if (!w) return;
    const { o, step } = w;
    const s = this.state(o);
    const cfg = game.cfg;
    const p = o.piece;
    const st = pieceStyle(o);

    if (step.id === 'punty' && game.punty.state === 'ready') {
      const tip = s.tip || this.puntyRest(o);
      if (Math.hypot(x - tip.x, y - tip.y) < 70) { s.dragging = true; s.tip = { x, y }; }
    }

    if (step.id === 'crackoff' && x < OX && Math.abs(y - AY) < 30) {
      if (!s.dripped) return game.toast('Drip water on the jack line first.');
      s.taps++;
      game.sound('tap');
      const needed = p.shallow ? cfg.crackoff.SHALLOW_TAPS : 1;
      if (s.taps >= needed) {
        const extra = s.taps - 1;
        if (extra) addStress(p, cfg.stressEvents.extraTap * extra);
        if (p.shallow && Math.random() < cfg.crackoff.CHIP_CHANCE) { p.shapePenalty += cfg.crackoff.CHIP_PENALTY; game.toast('It chipped at the break.'); }
        p.lipHeat = p.heat;
        p.onPunty = true;
        game.complete(100 - 10 * extra, { noHeat: true });
      }
    }

    if (step.id === 'lip' && x < OX + st.L * 0.4 && x > OX - 80 && Math.abs(y - AY) < st.R + 60) {
      if (p.weakPunty && Math.random() < cfg.punty.WEAK_DROP_CHANCE) {
        return game.lose(o, 'The punty let go! Weak punty, so the piece fell. Start over.');
      }
      if (p.lipHeat < cfg.lip.MIN_HEAT) {
        addStress(p, cfg.stressEvents.forcedFlare);
        if (Math.random() < cfg.lip.FORCE_CRACK_CHANCE) { p.shapePenalty += cfg.lip.CRACK_PENALTY; game.toast('Forced a cold lip and it cracked!'); game.sound('crack'); }
        else game.toast('The lip is too stiff. Reheat the lip!');
        return;
      }
      s.lipDrag = true;
      s.lastDist = Math.abs(y - AY);
      game.sound('scrape');
    }
  },

  move(x, y, game) {
    const s = this.st;
    if (!s) return;
    if (s.dragging) s.tip = { x, y };
    if (s.lipDrag) {
      const w = workingOrder(game, 'finish');
      if (!w || game.busy) return;
      const p = w.o.piece;
      const cfg = game.cfg;
      const d = Math.abs(y - AY);
      const delta = Math.max(0, d - s.lastDist);
      s.lastDist = Math.max(s.lastDist, d);
      if (p.lipHeat >= cfg.lip.MIN_HEAT) p.open = Math.min(1.5, p.open + delta / cfg.lip.PX_PER_UNIT);
      if (p.open > cfg.lip.DROP_AT && !s.dropped) {
        s.dropped = true;
        p.shapePenalty += cfg.lip.DROP_PENALTY;
        game.toast('Over-opened: the lip dropped.');
      }
    }
  },

  up(x, y, game) {
    const s = this.st;
    if (!s) return;
    s.lipDrag = false;
    if (!s.dragging) return;
    s.dragging = false;
    const w = workingOrder(game, 'finish');
    if (!w || w.step.id !== 'punty') return;
    const { o } = w;
    const cfg = game.cfg;
    const st = pieceStyle(o);
    const cross = { x: OX + st.L, y: AY };
    const dist = Math.hypot(x - cross.x, y - cross.y);
    if (dist > cfg.punty.SNAP_PX) { s.tip = null; return; }
    const p = o.piece;
    if (dist > cfg.punty.OFF_PX) { addOff(p, cfg.offEvents.puntyOff); game.toast('Off-center punty. It’ll wobble.'); }
    p.weakPunty = game.punty.heat < cfg.punty.WEAK_BELOW;
    if (p.weakPunty) game.toast('The punty gather was cold. Weak punty!');
    game.punty = { state: 'none', t: 0, heat: 0 };
    game.sound('clank');
    game.complete(falloff(dist, 7, 50));
  },

  draw(g, game, t) {
    this.buttons = [];
    backdrop(g);
    const cfg = game.cfg;
    const pu = game.punty;
    const an = game.annealer;

    // Juno + punty rack.
    juno(g, 90, 300, t * 2);
    box(g, 20, 420, 190, 44, PAL.wood, 8);
    text(g, pu.state === 'ready' ? `Punty ready · ${Math.round(pu.heat)}` : pu.state === 'prepping' ? `Gathering… ${Math.ceil(cfg.punty.PREP_S - pu.t)}s` : 'Punty rack', 115, 448, { size: 15, align: 'center', color: PAL.paper });
    this.buttons.push({ x: 20, y: 476, w: 190, h: 46, label: 'Ask for a punty', size: 16, enabled: pu.state === 'none', onClick: () => game.requestPunty() });

    // Annealer.
    box(g, ANNEALER.x, ANNEALER.y, ANNEALER.w, ANNEALER.h, '#6f7a80', 12);
    text(g, 'ANNEALER', ANNEALER.x + ANNEALER.w / 2, ANNEALER.y + 28, { size: 17, align: 'center', color: PAL.paper });
    box(g, ANNEALER.x + 30, ANNEALER.y + 44, 140, 34, '#1f2a22', 6);
    text(g, `${heatToF(20) - 50}°F`, ANNEALER.x + 100, ANNEALER.y + 68, { size: 17, align: 'center', color: '#7CFF8A' });
    const doorRect = { x: ANNEALER.x + 20, y: ANNEALER.y + 92, w: 160, h: 220 };
    if (an.open) {
      box(g, doorRect.x, doorRect.y, doorRect.w, doorRect.h, '#3a2420', 8);
      glow(g, doorRect.x + 80, doorRect.y + 120, 100, 60);
      an.pieces.forEach((pc, i) => {
        g.fillStyle = rgbStr(glassRgb(45, pc.fritRgb));
        g.strokeStyle = PAL.soot; g.lineWidth = 2;
        g.beginPath(); g.roundRect(doorRect.x + 14 + (i % 4) * 36, doorRect.y + 170 - Math.floor(i / 4) * 50, 28, 40, 6); g.fill(); g.stroke();
      });
      if (an.openT > cfg.anneal.DOOR_FREE_S) text(g, 'Door open too long!', ANNEALER.x + 100, ANNEALER.y + ANNEALER.h + 24, { size: 15, align: 'center', color: PAL.amber });
    } else {
      box(g, doorRect.x, doorRect.y, doorRect.w, doorRect.h, '#8d989e', 8);
      box(g, doorRect.x + 40, doorRect.y + 40, 80, 60, '#2a2020', 6);
      text(g, `${an.pieces.length} inside`, doorRect.x + 80, doorRect.y + 150, { size: 15, align: 'center', color: PAL.soot });
    }
    this.buttons.push({ x: ANNEALER.x + 20, y: ANNEALER.y + ANNEALER.h + 34, w: 160, h: 44, label: an.open ? 'Close door' : 'Open door', size: 16, onClick: () => (an.open ? game.closeAnnealer() : game.openAnnealer()) });

    const w = workingOrder(game, 'finish', g);
    if (!w) { for (const b of this.buttons) button(g, b); return; }
    const { o, step } = w;
    const s = this.state(o);
    const p = o.piece;
    const st = pieceStyle(o);
    const bottomX = OX + st.L;

    // Pipe (until crack-off) and punty (after transfer).
    const onPunty = step.id !== 'punty';
    if (!p.onPunty) pipe(g, 0, AY, OX);
    if (onPunty) pipe(g, bottomX, AY, bottomX + 210);
    pieceProfile(g, OX, AY, 1, st);

    if (step.id === 'punty') {
      g.strokeStyle = PAL.glory; g.lineWidth = 2;
      g.beginPath(); g.arc(bottomX, AY, 10, 0, Math.PI * 2); g.moveTo(bottomX - 18, AY); g.lineTo(bottomX + 18, AY); g.moveTo(bottomX, AY - 18); g.lineTo(bottomX, AY + 18); g.stroke();
      if (pu.state === 'ready') {
        const tip = s.tip || this.puntyRest(o);
        pipe(g, tip.x, tip.y, tip.x + 260);
        glow(g, tip.x, tip.y, 26, pu.heat);
        g.beginPath(); g.arc(tip.x, tip.y, 10, 0, Math.PI * 2);
        g.fillStyle = rgbStr(glassRgb(pu.heat)); g.fill(); g.strokeStyle = PAL.soot; g.lineWidth = 3; g.stroke();
        banner(g, 'Drag the punty’s hot tip onto the crosshair at the bottom.');
      } else {
        banner(g, pu.state === 'prepping' ? 'Juno is gathering a punty…' : 'Ask Juno for a punty.');
      }
    }

    if (step.id === 'crackoff') {
      const jx = OX + 0.1 * st.L;
      if (s.dripped && s.dripT < 1.5) steam(g, jx, AY - st.R, s.dripT, 5);
      this.buttons.push({ x: 240, y: 470, w: 230, h: 46, label: s.dripped ? 'Water on ✓' : 'Drip water on jack line', size: 16, enabled: !s.dripped, onClick: () => { s.dripped = true; s.dripT = 0; game.sound('hiss'); } });
      banner(g, s.dripped ? 'Now click the pipe to tap it off.' : 'Drip water on the jack line, then tap the pipe.');
    }

    if (step.id === 'lip') {
      // Target width markers.
      const r0 = st.R * 0.92 * cfg.lip.TARGET;
      g.strokeStyle = PAL.green; g.lineWidth = 4;
      g.beginPath(); g.moveTo(OX - 20, AY - r0); g.lineTo(OX + 6, AY - r0); g.moveTo(OX - 20, AY + r0); g.lineTo(OX + 6, AY + r0); g.stroke();
      gaugeV(g, 560, 380, 30, 140, p.open / 1.5, [(cfg.lip.TARGET - cfg.lip.TOL) / 1.5, (cfg.lip.TARGET + cfg.lip.TOL) / 1.5], { label: 'Opening' });
      const lipOk = p.lipHeat >= cfg.bands.lip[0];
      banner(g, lipOk ? 'Drag outward (up or down) from the opening to open it to the green marks.' : 'Reheat the LIP in the glory hole (lip heat 70–88).', lipOk ? PAL.paper : PAL.glory);
      const canDone = p.open > 0.3;
      this.buttons.push({ x: 240, y: 470, w: 180, h: 46, label: 'Finish lip', enabled: canDone, color: PAL.green, textColor: '#fff', onClick: () => canDone && game.complete(falloff(p.open - cfg.lip.TARGET, cfg.lip.TOL, cfg.lip.ZERO_AT)) });
    }

    if (step.id === 'anneal') {
      const [lo, hi] = cfg.bands.anneal;
      const hint = p.heat > hi ? 'Still soft. You can load now or let it firm up a little.' : p.heat < 25 ? 'Too cold! Reheat before loading.' : p.heat < lo ? 'Getting cold: load it now!' : 'Perfect loading heat.';
      banner(g, an.open ? `${hint}  Tap the punty to drop it in.` : 'Open the annealer door.');
      this.buttons.push({ x: 240, y: 470, w: 200, h: 46, label: 'Tap off punty', enabled: an.open, color: PAL.green, textColor: '#fff', onClick: () => game.loadAnnealer() });
    }

    for (const b of this.buttons) button(g, b);
  },
};
