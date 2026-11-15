// Game state + rules. Stations read from it and call its methods; it never touches the DOM.
import { CFG, STEPS, FRITS, garageSlotsForDay } from './config.js';
import { createPiece, tickPiece, coolRate, addOff, inBand } from './heat.js';
import * as SC from './scoring.js';
import { mulberry32 } from './rng.js';
import { buildSchedule, makeCustomer, makeTicket } from './customers.js';

export const fritById = (id) => FRITS.find((f) => f.id === id);
export const stepOf = (order) => STEPS[order.step];

const SHAPE_STEPS = ['gather', 'marver', 'jacks', 'paddle', 'punty', 'crackoff', 'lip'];

export class Game {
  constructor(cfg = CFG, save = {}) {
    this.cfg = cfg;
    this.day = save.day ?? 1;
    this.coins = save.coins ?? 0;
    this.history = save.history ?? [];
    this.seed = save.seed ?? ((Math.random() * 1e9) | 0);
    this.annealerTonight = save.annealerTonight ?? [];
    this.phase = 'title';
    this.clock = 0;
    this.handlers = {};
    this.orders = [];
    this.lobby = [];
    this.garage = [];
    this.warmer = [];
    this.hand = null;
    this.gh = { in: false, t: 0 };
    this.lockout = 0;
  }

  // ---- events -------------------------------------------------------------
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); }
  emit(ev, data) { for (const fn of this.handlers[ev] || []) fn(data); }
  toast(msg) { this.emit('toast', msg); }
  sound(name) { this.emit('sound', name); }

  // ---- derived ------------------------------------------------------------
  get rep() {
    const h = this.history.slice(-20);
    return h.length ? h.reduce((a, b) => a + b, 0) / h.length : 3;
  }
  get repMult() { return 0.8 + 0.4 * (this.rep / 5); }
  get handOrder() { return this.orders.find((o) => o.id === this.hand) || null; }
  get handPiece() { return this.handOrder?.piece || null; }
  get busy() { return this.gh.in || this.lockout > 0; }
  get reheating() { return this.gh.in && this.gh.t >= this.cfg.heat.GH_TRAVEL_S / 2; }
  get activeOrders() { return this.orders.filter((o) => o.state !== 'done'); }
  get pastLastCall() { return this.clock >= this.cfg.day.LENGTH_S - this.cfg.day.LAST_CALL_S; }
  get canCloseEarly() {
    return this.phase === 'open' && this.pastLastCall && this.lobby.length === 0 &&
      this.orders.every((o) => o.state === 'done' || o.state === 'annealer');
  }
  order(id) { return this.orders.find((o) => o.id === id); }
  bandFor(step) { return this.cfg.bands[step.id] || this.cfg.heat.WORK_BAND; }
  heatForStep(p, step) { return step.id === 'lip' && p.lipHeat != null ? p.lipHeat : p.heat; }

  // ---- day ----------------------------------------------------------------
  startDay() {
    const cfg = this.cfg;
    this.rng = mulberry32(this.seed + this.day * 7919);
    this.phase = 'open';
    this.clock = 0;
    this.nextId = 1;
    this.schedule = buildSchedule(cfg, this.day, this.rng);
    this.arrivalIdx = 0;
    this.lobby = [];
    this.orders = [];
    this.warmer = Array(cfg.pipe.WARMER_SLOTS).fill(null);
    this.garage = Array(garageSlotsForDay(this.day, cfg)).fill(null);
    this.hand = null;
    this.selected = null;
    this.station = 'counter';
    this.gh = { in: false, t: 0 };
    this.lockout = 0;
    this.contact = 'air';
    this.punty = { state: 'none', t: 0, heat: 0 };
    this.annealer = { open: false, openT: 0, closeIn: null, pieces: [] };
    this.stats = { served: 0, stars: [], tips: 0, walkouts: 0, lost: 0, unfinished: 0 };
    this.emit('day');
  }

  tick(dt) {
    if (this.phase !== 'open') return;
    const cfg = this.cfg;
    this.clock += dt;

    this.tickArrivals(dt);

    // Pipe warmer.
    for (const id of this.warmer) {
      const o = id && this.order(id);
      if (o) o.pipeWarm = Math.min(1, o.pipeWarm + dt / cfg.pipe.WARM_S);
    }

    // Juno's punty prep.
    const pu = this.punty;
    if (pu.state === 'prepping') {
      pu.t += dt;
      if (pu.t >= cfg.punty.PREP_S) { pu.state = 'ready'; pu.heat = cfg.punty.START_HEAT; this.sound('ding'); this.toast('Juno: punty’s ready!'); }
    } else if (pu.state === 'ready') {
      pu.heat -= coolRate(cfg.heat, pu.heat, 'S', 'air') * cfg.punty.COOL_MULT * dt;
      if (pu.heat < 40) { pu.state = 'none'; this.toast('Juno: the punty went cold, I knocked it off.'); }
    }

    // Annealer door.
    const an = this.annealer;
    if (an.open) {
      an.openT += dt;
      if (an.openT > cfg.anneal.DOOR_FREE_S) for (const p of this.annealerToday()) p.doorS += dt;
      if (an.closeIn != null) { an.closeIn -= dt; if (an.closeIn <= 0) this.closeAnnealer(); }
    }

    // Glory hole travel.
    if (this.gh.in) this.gh.t += dt;
    if (this.lockout > 0) this.lockout = Math.max(0, this.lockout - dt);

    // The piece in hand.
    const o = this.handOrder;
    const p = o?.piece;
    if (p) {
      const step = stepOf(o);
      tickPiece(cfg, p, dt, { reheating: this.reheating, lipMode: step.id === 'lip', contact: this.gh.in ? 'air' : this.contact });
      if (!this.gh.in) {
        p.handT += dt;
        if (inBand(this.heatForStep(p, step), this.bandFor(step))) p.handIn += dt;
      }
      if (step.id === 'meltin' && this.reheating && p.heat >= cfg.frit.MELT_HEAT) {
        p.meltT += dt;
        if (p.meltT >= cfg.frit.MELT_S) { this.toast('Frit melted in smooth.'); this.complete(100, { noHeat: true }); }
      }
      if (p.cracked) this.lose(o, 'It got too cold and checked. Start that one over.');
    }
    this.contact = 'air';

    // Garage.
    for (const id of this.garage) {
      const g = id && this.order(id);
      if (!g?.piece) continue;
      const gp = g.piece;
      tickPiece(cfg, gp, dt, { garage: true });
      gp.garageSession += dt;
      if (gp.garageSession > cfg.garage.GRACE_S) gp.decay = Math.min(cfg.garage.DECAY_CAP, gp.decay + dt / cfg.garage.DECAY_EVERY_S);
      if (gp.garageSession >= cfg.garage.SAG_S && !gp.sagged) {
        gp.sagged = true;
        addOff(gp, cfg.offEvents.garageSag);
        this.toast(`${g.customer.name}’s piece is sagging in the garage!`);
      }
    }

    if (this.clock >= cfg.day.LENGTH_S) this.closeDay();
  }

  tickArrivals(dt) {
    const d = this.cfg.day;
    if (!this.pastLastCall) {
      while (this.arrivalIdx < this.schedule.length && this.clock >= this.schedule[this.arrivalIdx] && this.lobby.length < d.LOBBY_MAX) {
        this.lobby.push({ customer: makeCustomer(this.rng, this.nextId++), waited: 0 });
        this.arrivalIdx++;
        this.sound('bell');
      }
    } else if (this.lobby.length) {
      this.lobby = [];
      this.toast('Last call! The lobby heads home.');
    }
    for (const c of this.lobby) c.waited += dt;
    const before = this.lobby.length;
    this.lobby = this.lobby.filter((c) => c.waited < d.LOBBY_PATIENCE_S);
    const left = before - this.lobby.length;
    if (left > 0) {
      this.stats.walkouts += left;
      for (let i = 0; i < left; i++) this.history.push(2);
      this.toast('A customer got tired of waiting and left.');
    }
  }

  // ---- counter ------------------------------------------------------------
  takeOrder() {
    const d = this.cfg.day;
    if (!this.lobby.length) return;
    if (this.activeOrders.length >= d.RAIL_MAX) return this.toast('The ticket rail is full.');
    const { customer } = this.lobby.shift();
    const ticket = makeTicket(this.cfg, this.day, this.rng);
    const o = { id: customer.id, customer, ticket, takenAt: this.clock, state: 'ticket', step: 0, pipeWarm: 0, piece: null, restarts: 0 };
    this.orders.push(o);
    if (!this.selected || !this.order(this.selected) || this.order(this.selected).state === 'done') this.selected = o.id;
    this.sound('print');
    this.emit('rail');
  }

  select(id) {
    const o = this.order(id);
    if (!o) return;
    this.selected = id;
    if (o.state === 'garage' && this.hand == null) this.retrieve(this.garage.indexOf(id));
    this.emit('rail');
  }

  // ---- furnace: pipes -----------------------------------------------------
  grabPipe() {
    const free = this.warmer.indexOf(null);
    if (free < 0) return this.toast('Both pipe warmer slots are full.');
    let o = this.order(this.selected);
    if (!o || o.state !== 'ticket') o = this.orders.find((x) => x.state === 'ticket');
    if (!o) return this.toast('No ticket is waiting for a pipe. Take an order at the counter.');
    o.state = 'warming';
    o.pipeWarm = 0;
    this.warmer[free] = o.id;
    this.selected = o.id;
    this.sound('clank');
    this.emit('rail');
  }

  clickWarmer(i) {
    const id = this.warmer[i];
    const ho = this.handOrder;
    if (id == null) {
      if (ho && !ho.piece) { this.warmer[i] = ho.id; ho.state = 'warming'; this.hand = null; this.emit('rail'); }
      return;
    }
    if (ho) return this.toast('Your hands are full! Garage or annealer first.');
    const o = this.order(id);
    this.warmer[i] = null;
    o.state = 'hand';
    this.hand = id;
    this.selected = id;
    if (o.step === 0) this.complete(100, { noHeat: true, silent: true });
    if (o.pipeWarm < 1) this.toast('That pipe isn’t fully warm. The gather may slip.');
    this.emit('rail');
  }

  // ---- step bookkeeping --------------------------------------------------
  startPiece(gatherAmt, acc) {
    const o = this.handOrder;
    const cfg = this.cfg;
    const p = Object.assign(createPiece(cfg, o.ticket.size), {
      scores: {}, work: { t: 0, in: 0 }, handT: 0, handIn: 0,
      gatherAmt, sizeK: 1, cone: 0.55, b: cfg.blow.START, neck: 0, flat: 0, open: 0, onPunty: false,
      fritRgb: null, doses: 0, doseRgbs: [], coverage: 0, meltT: 0, rough: false,
      shallow: false, weakPunty: false, shapePenalty: 0,
      decay: 0, garageSession: 0, sagged: false, phase: 0,
    });
    const target = cfg.gather.target[o.ticket.size];
    p.sizeK = Math.cbrt(Math.max(0.5, gatherAmt / target));
    if (gatherAmt > target + this.gatherHalfBand()) p.massMult = cfg.heat.HEAVY_GATHER_COOL;
    o.piece = p;
    this.complete(acc, { noHeat: true });
  }

  gatherHalfBand() {
    const g = this.cfg.gather;
    const t = Math.min(1, (this.day - 1) / 9);
    return g.bandDay1 + (g.bandDay10 - g.bandDay1) * t;
  }

  work(dt) {
    const o = this.handOrder;
    const p = o?.piece;
    if (!p) return;
    const step = stepOf(o);
    p.work.t += dt;
    if (inBand(this.heatForStep(p, step), this.bandFor(step))) p.work.in += dt;
  }

  complete(accuracy, opts = {}) {
    const o = this.handOrder;
    if (!o) return;
    const step = stepOf(o);
    const p = o.piece;
    if (p) {
      let frac = 1;
      if (!opts.noHeat) {
        frac = p.work.t > 0 ? p.work.in / p.work.t : inBand(this.heatForStep(p, step), this.bandFor(step)) ? 1 : 0;
      }
      p.scores[step.id] = SC.stepScore(this.cfg, accuracy, frac);
      p.work = { t: 0, in: 0 };
      if (step.id === 'paddle') p.offFloor = p.offPeak * this.cfg.heat.OFF_FLOOR_FRACTION;
    }
    o.step++;
    if (!opts.silent) this.sound('step');
    this.emit('step', { order: o, step, score: p?.scores[step.id] });
    this.emit('rail');
  }

  lose(o, reason) {
    o.piece = null;
    o.step = 0;
    o.pipeWarm = 0;
    o.state = 'ticket';
    o.restarts++;
    if (this.hand === o.id) { this.hand = null; this.gh.in = false; }
    const gi = this.garage.indexOf(o.id);
    if (gi >= 0) this.garage[gi] = null;
    this.stats.lost++;
    this.sound('crack');
    this.toast(reason);
    this.emit('rail');
  }

  // ---- glory hole & garage -----------------------------------------------
  ghEnter() {
    if (this.phase !== 'open' || this.gh.in) return;
    if (!this.handPiece) return this.toast(this.hand ? 'There’s no glass on that pipe yet.' : 'You’re not holding anything.');
    this.gh = { in: true, t: 0 };
    this.sound('whoosh');
  }

  ghExit() {
    if (!this.gh.in) return;
    this.gh.in = false;
    this.lockout = this.cfg.heat.GH_TRAVEL_S / 2;
  }

  park(slot) {
    const o = this.handOrder;
    if (!o) return;
    if (!o.piece) return this.toast('Only glass goes in the garage. Put the pipe back in the warmer.');
    if (this.garage[slot] != null) return;
    this.ghExit();
    this.garage[slot] = o.id;
    o.state = 'garage';
    o.piece.garageSession = 0;
    o.piece.sagged = false;
    this.hand = null;
    this.sound('clank');
    this.emit('rail');
  }

  retrieve(slot) {
    const id = this.garage[slot];
    if (id == null) return;
    if (this.hand != null) return this.toast('Your hands are full! Garage or annealer first.');
    const o = this.order(id);
    this.garage[slot] = null;
    o.state = 'hand';
    this.hand = id;
    this.selected = id;
    this.sound('clank');
    this.emit('rail');
  }

  clickGarage(slot) {
    if (this.garage[slot] == null) this.park(slot);
    else this.retrieve(slot);
  }

  // ---- finish: punty & annealer -----------------------------------------
  requestPunty() {
    if (this.punty.state !== 'none') return;
    this.punty = { state: 'prepping', t: 0, heat: 0 };
    this.toast('Juno is gathering a punty…');
  }

  openAnnealer() {
    const an = this.annealer;
    if (an.open) return;
    an.open = true;
    an.openT = 0;
    an.closeIn = null;
    this.sound('door');
  }

  closeAnnealer() {
    const an = this.annealer;
    an.open = false;
    an.closeIn = null;
    this.sound('door');
  }

  annealerToday() { return this.annealer.pieces; }

  loadAnnealer() {
    const o = this.handOrder;
    const p = o?.piece;
    if (!p || stepOf(o).id !== 'anneal' || !this.annealer.open) return;
    const cfg = this.cfg;
    const t = o.ticket;
    const frit = fritById(t.frit);
    const loadHeat = p.heat;
    const frac = inBand(loadHeat, cfg.bands.anneal) ? 1 : 0;
    p.scores.anneal = SC.stepScore(cfg, 100, frac);

    const res = SC.handoff(cfg, {
      shapeSteps: SHAPE_STEPS.map((k) => p.scores[k] ?? 0),
      off: p.off,
      shapePenalty: p.shapePenalty,
      hue: SC.hueMatch(cfg, p.fritRgb, frit.rgb),
      coverage: p.coverage,
      doses: p.doses,
      targetDoses: t.doses,
      sizeErrPct: (p.b * p.sizeK - 1) * 100,
      heatFrac: p.handT > 0 ? p.handIn / p.handT : 1,
      stress: p.stress,
      waitRatio: (this.clock - o.takenAt) / t.patienceS,
      garageDecay: p.decay,
    }, o.customer.weights);
    const tipAmt = SC.tip(t.price, res.total, this.repMult, o.customer.tipMult);

    this.annealer.pieces.push({
      orderId: o.id, name: o.customer.name, look: o.customer.look, ticket: t,
      fritRgb: p.fritRgb, coverage: p.coverage, cone: p.cone, neck: p.neck, open: p.open, b: p.b * p.sizeK,
      stress: p.stress, loadHeat, loadedAt: this.clock, doorS: 0, coldSeals: 0,
      stars: res.stars, total: res.total, tip: tipAmt,
    });

    this.coins = Math.round((this.coins + tipAmt) * 10) / 10;
    this.stats.served++;
    this.stats.stars.push(res.stars);
    this.stats.tips += tipAmt;
    this.history.push(res.stars);
    o.state = 'annealer';
    o.step++;
    this.hand = null;
    this.annealer.closeIn = cfg.anneal.DOOR_AUTOCLOSE_S;
    this.sound('clunk');
    if (loadHeat < 25) this.toast('That went in cold. Fingers crossed for the morning…');
    this.emit('handoff', { order: o, result: res, tip: tipAmt, loadHeat });
    this.emit('rail');
  }

  finishHandoff(id) {
    const o = this.order(id);
    if (o) o.state = 'done';
    this.emit('rail');
  }

  // ---- closing & morning --------------------------------------------------
  closeDay() {
    if (this.phase !== 'open') return;
    this.phase = 'closed';
    this.ghExit();
    for (const o of this.orders) {
      if (o.state !== 'done' && o.state !== 'annealer') {
        this.stats.unfinished++;
        this.history.push(1);
      }
    }
    for (const p of this.annealer.pieces) p.soakS = this.clock - p.loadedAt;
    this.annealerTonight = this.annealer.pieces;
    this.lobby = [];
    this.emit('closed', { stats: this.stats, tonight: this.annealerTonight });
  }

  sleep() {
    this.day++;
    this.phase = 'morning';
    this.emit('save');
  }

  // Rolls the crack chance for every piece in the annealer (GDD §7.3).
  reveal() {
    const cfg = this.cfg;
    const rng = mulberry32(this.seed + this.day * 31);
    const out = this.annealerTonight.map((piece) => {
      const p = SC.crackChance(cfg, { stress: piece.stress, loadHeat: piece.loadHeat, soakS: piece.soakS ?? 0, solid: false, coldSeals: piece.coldSeals, doorS: piece.doorS });
      const cracked = rng() < p;
      const delta = cracked ? -piece.tip : Math.round(piece.tip * cfg.scoring.CLEAN_TIP_BONUS * 10) / 10;
      return { piece, p, cracked, pity: cracked && p < cfg.anneal.PITY_BELOW, delta };
    });
    for (const r of out) {
      this.coins = Math.round((this.coins + r.delta) * 10) / 10;
      if (r.cracked) this.history.push(1);
    }
    this.annealerTonight = [];
    this.emit('save');
    return out;
  }

  toSave() {
    return { day: this.day, coins: this.coins, history: this.history.slice(-40), seed: this.seed, annealerTonight: this.annealerTonight };
  }
}
