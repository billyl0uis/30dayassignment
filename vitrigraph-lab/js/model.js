/* Vitrigraph Lab: the simplified flow model. Pure functions, no DOM.
 *
 * The pot is a polar grid: rings (center → wall) × sectors (around) × layers
 * (bottom → top). When the glass melts each (ring, sector) column slumps down,
 * then drains through the orifice. Columns near the center move faster than
 * columns at the wall (a parabolic profile), so upper glass "tunnels" down the
 * middle before lower glass near the wall is used up. Every assumption here is
 * listed in KNOWN_UNCERTAINTIES.md.
 */
(function (VL) {
  const M = {};

  M.colorById = function (id) {
    return VL.config.colors.find(c => c.id === id) || VL.config.colors[0];
  };

  // ---------- temperature & flow index ----------

  M.toDisplay = function (f) {
    const c = Math.round((f - 32) * 5 / 9);
    return VL.config.units === 'C' ? `${c}°C` : `${Math.round(f)}°F · ${c}°C`;
  };

  // 0 (stiff) → 1 (runny). A logistic stand-in, not a viscosity curve.
  M.flowIndex = function (tempF, soft) {
    const fl = VL.config.flow;
    const x = 1 / (1 + Math.exp(-(tempF - fl.midTemp) / fl.width));
    return Math.max(0, Math.min(1, x + (soft || 0)));
  };

  M.band = function (index) {
    let b = VL.config.flow.bands[0];
    for (const x of VL.config.flow.bands) if (index >= x.from) b = x;
    return b.label;
  };

  // Advance kiln air and glass temps by `minutes`.
  M.kilnStep = function (k, setpoint, minutes) {
    const K = VL.config.kiln;
    if (k.air < setpoint) k.air = Math.min(setpoint, k.air + K.rampPerHour * minutes / 60);
    else k.air = Math.max(setpoint, k.air - K.coolPerHour * minutes / 60);
    k.glass += (k.air - k.glass) * (1 - Math.exp(-minutes / K.glassLagMinutes));
    k.minutes += minutes;
    return k;
  };

  // ---------- the charge ----------

  M.newCharge = function () {
    const P = VL.config.pot;
    return { L: P.layers, R: P.rings, S: P.sectors, cells: new Array(P.layers * P.rings * P.sectors).fill(null) };
  };
  M.idx = (ch, l, r, s) => (l * ch.R + r) * ch.S + s;

  M.chargeSummary = function (ch) {
    const coes = new Set(), colors = new Set(), forms = new Set();
    let filled = 0;
    for (const c of ch.cells) if (c) { filled++; coes.add(c.coe); colors.add(c.c); forms.add(c.form); }
    return { filled, frac: filled / ch.cells.length, coes: [...coes], colors: [...colors], forms: [...forms] };
  };

  // Describe the load so the debrief can name what you built.
  M.loadShape = function (ch) {
    const { L, R, S } = ch;
    const layerColor = [], ringsVary = [], sidesVary = [];
    for (let l = 0; l < L; l++) {
      const set = new Set(); let ringDiff = false, sideDiff = false;
      for (let r = 0; r < R; r++) for (let s = 0; s < S; s++) {
        const c = ch.cells[M.idx(ch, l, r, s)];
        if (!c) continue;
        set.add(c.c);
        const inner = ch.cells[M.idx(ch, l, 0, s)], other = ch.cells[M.idx(ch, l, r, (s + S / 2) % S)];
        if (inner && inner.c !== c.c) ringDiff = true;
        if (other && other.c !== c.c) sideDiff = true;
      }
      layerColor.push(set.size === 1 ? [...set][0] : set.size ? 'mixed' : null);
      ringsVary.push(ringDiff); sidesVary.push(sideDiff);
    }
    const layered = new Set(layerColor.filter(Boolean)).size > 1;
    return { layered, cored: ringsVary.some(Boolean), sideBySide: sidesVary.some(Boolean), layerColor };
  };

  // ---------- melting & draining ----------

  // Slump each column (drop the gaps) and give it a base speed.
  M.melt = function (ch) {
    const P = VL.config.pot, { L, R, S } = ch;
    const cols = [], v = [], len = [], pos = [];
    for (let r = 0; r < R; r++) for (let s = 0; s < S; s++) {
      const col = [];
      for (let l = 0; l < L; l++) { const c = ch.cells[M.idx(ch, l, r, s)]; if (c) col.push(c); }
      const soft = col.length ? col.reduce((a, c) => a + M.colorById(c.c).soft, 0) / col.length : 0;
      const rr = (r + 0.5) / R;
      cols.push(col); len.push(col.length); pos.push(0);
      v.push(Math.max(0.05, (1 - P.wallSlow * rr * rr) * (1 + P.softGain * soft * 10)));
    }
    const total = len.reduce((a, b) => a + b, 0);
    return { R, S, cols, v, len, pos, total, out: 0 };
  };

  M.remaining = d => d.total ? 1 - d.out / d.total : 0;

  // Remove `cells` worth of glass, split across live columns by their speed.
  M.drain = function (d, cells) {
    let left = cells, guard = 0;
    while (left > 1e-9 && guard++ < 8) {
      let sum = 0;
      for (let i = 0; i < d.v.length; i++) if (d.pos[i] < d.len[i]) sum += d.v[i];
      if (!sum) break;
      const u = left / sum;
      left = 0;
      for (let i = 0; i < d.v.length; i++) {
        if (d.pos[i] >= d.len[i]) continue;
        const want = d.v[i] * u, room = d.len[i] - d.pos[i];
        if (want > room) { d.pos[i] = d.len[i]; left += want - room; d.out += room; }
        else { d.pos[i] += want; d.out += want; }
      }
    }
    return cells - left;
  };

  // What is leaving the orifice right now: color per (ring, sector) and its flux weight.
  M.slice = function (d) {
    const n = d.R * d.S, cells = new Array(n), forms = new Array(n), w = new Float32Array(n);
    for (let r = 0; r < d.R; r++) for (let s = 0; s < d.S; s++) {
      const i = r * d.S + s;
      if (d.pos[i] < d.len[i]) {
        const c = d.cols[i][Math.floor(d.pos[i])];
        cells[i] = c.c; forms[i] = c.form;
        w[i] = d.v[i] * (2 * r + 1);   // speed × ring area
      } else cells[i] = null;
    }
    return { R: d.R, S: d.S, cells, forms, w };
  };

  // Turn a slice into drawable wedges. Each sector gets an angle by its share of
  // the flux, and rings inside it get area-proportional radii (0–1).
  M.sliceGeometry = function (sl) {
    const secTotal = new Float32Array(sl.S);
    let total = 0;
    for (let s = 0; s < sl.S; s++) { for (let r = 0; r < sl.R; r++) secTotal[s] += sl.w[r * sl.S + s]; total += secTotal[s]; }
    const out = [];
    if (!total) return out;
    let a = -Math.PI / sl.S;   // sector 0 centered on angle 0
    for (let s = 0; s < sl.S; s++) {
      const span = (secTotal[s] / total) * Math.PI * 2;
      let cum = 0;
      for (let r = 0; r < sl.R; r++) {
        const i = r * sl.S + s;
        if (!sl.w[i]) continue;
        const r0 = Math.sqrt(cum / secTotal[s]);
        cum += sl.w[i];
        out.push({ a0: a, a1: a + span, r0, r1: Math.sqrt(cum / secTotal[s]), c: sl.cells[i], form: sl.forms[i] });
      }
      a += span;
    }
    return out;
  };

  // Sample a slice onto an N×N grid of color ids (null outside the disc).
  M.sliceGrid = function (sl, N, rot) {
    const geo = M.sliceGeometry(sl), g = new Array(N * N).fill(null);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const px = (x + 0.5) / N * 2 - 1, py = (y + 0.5) / N * 2 - 1, rr = Math.hypot(px, py);
      if (rr > 1) continue;
      let ang = Math.atan2(py, px) - (rot || 0);
      for (const w of geo) {
        let t = ang;
        while (t < w.a0) t += Math.PI * 2;
        while (t >= w.a0 + Math.PI * 2) t -= Math.PI * 2;
        if (t < w.a1 && rr >= w.r0 && rr <= w.r1 + 1e-6) { g[y * N + x] = w.c; break; }
      }
    }
    return g;
  };

  // Fraction of disc pixels that match, best over a few rotations.
  M.sliceMatch = function (a, target) {
    const N = 24, tg = M.sliceGrid(target, N, 0);
    let best = 0;
    for (let k = 0; k < 16; k++) {
      const g = M.sliceGrid(a, N, k * Math.PI / 8);
      let same = 0, n = 0;
      for (let i = 0; i < g.length; i++) { if (tg[i] === null && g[i] === null) continue; n++; if (tg[i] === g[i]) same++; }
      best = Math.max(best, n ? same / n : 0);
    }
    return best;
  };

  M.dominantColor = function (sl) {
    const tally = {};
    for (let i = 0; i < sl.cells.length; i++) if (sl.cells[i]) tally[sl.cells[i]] = (tally[sl.cells[i]] || 0) + sl.w[i];
    let best = null, bw = 0;
    for (const k in tally) if (tally[k] > bw) { bw = tally[k]; best = k; }
    return best;
  };

  // ---------- pulling ----------

  M.orifice = id => VL.config.orifices.find(o => o.id === id) || VL.config.orifices[0];

  // mm³/s leaving the hole.
  M.outputRate = function (index, orificeId, remainingFrac) {
    const P = VL.config.pull, fl = VL.config.flow;
    if (index < fl.flowStart || remainingFrac <= 0) return 0;
    const o = M.orifice(orificeId);
    const sizeK = Math.pow(o.inches / VL.config.orificeRefInches, 4);
    const head = P.headMin + (1 - P.headMin) * remainingFrac;
    const live = (index - fl.flowStart) / (1 - fl.flowStart);
    return P.maxFlowMm3PerSec * Math.pow(live, P.flowExponent) * sizeK * head;
  };

  // Mass conservation: what goes in per second comes out as strand.
  M.diameterFor = function (q, speedCmS) {
    if (speedCmS <= 0.01) return Infinity;
    return Math.sqrt(4 * q / (Math.PI * speedCmS * 10));
  };

  M.snapSpeed = function (index) {
    const P = VL.config.pull;
    return P.snapSpeedAtFull * Math.pow(Math.max(index, 0.01), P.snapExponent);
  };

  M.cellVolumeMm3 = function () {
    const P = VL.config.pot;
    return P.chargeVolumeCm3 * 1000 / (P.layers * P.rings * P.sectors);
  };

  VL.model = M;
})(window.VitrigraphLab);
