/* Vitrigraph Lab: shell and stage machine. LOAD → HEAT → PULL → RESULT (with debrief).
 *
 * Embed:      VitrigraphLab.mount(element, { embedded: true })
 * Stand-alone: index.html calls VitrigraphLab.mount(document.getElementById('app'))
 */
(function (VL) {
  const STAGES = [
    { id: 'load', label: '1 Load' },
    { id: 'heat', label: '2 Heat' },
    { id: 'pull', label: '3 Pull' },
    { id: 'result', label: '4 Result' },
  ];

  VL.stages = VL.stages || {};

  VL.newRun = function (charge) {
    const K = VL.config.kiln;
    return {
      charge: charge || VL.model.newCharge(),
      orifice: VL.config.orificeDefault,
      setpoint: K.setDefault,
      kiln: { air: K.roomTemp, glass: K.roomTemp, minutes: 0 },
      drain: null,
      heat: { maxGlass: K.roomTemp, purgedCells: 0, gobDrops: 0, slump: 0, gob: 0 },
      pull: null,
    };
  };

  VL.mount = function (el, opts) {
    const o = opts || {};
    el.classList.add('vg-lab');
    if (o.embedded) el.classList.add('vg-embedded');
    el.innerHTML = `
      <header class="vg-top">
        <div class="vg-brand"><b>Vitrigraph Lab</b><em>a Before The Heat bonus module</em></div>
        <ol class="vg-rail">${STAGES.map(s => `<li data-s="${s.id}">${s.label}</li>`).join('')}</ol>
        <div class="vg-top-right">
          <span class="vg-tag" title="Flow, temperatures and timings are placeholders tuned for play. See KNOWN_UNCERTAINTIES.md.">simplified model</span>
          <select class="vg-challenge" aria-label="Challenge"></select>
          <button class="vg-chip vg-safety-btn">Safety</button>
        </div>
      </header>
      <main class="vg-main">
        <section class="vg-scene">
          <div class="vg-meters"></div>
          <div class="vg-canvas-wrap"></div>
        </section>
        <aside class="vg-panel"><div class="vg-panel-body"></div></aside>
      </main>
      <div class="vg-modal" hidden></div>`;

    const app = {
      el,
      meters: el.querySelector('.vg-meters'),
      wrap: el.querySelector('.vg-canvas-wrap'),
      panel: el.querySelector('.vg-panel-body'),
      modal: el.querySelector('.vg-modal'),
      run: VL.newRun(),
      stage: null,
      current: null,
      lastResult: null,
      go(id) {
        if (this.current && this.current.unmount) this.current.unmount();
        this.stage = id;
        this.meters.innerHTML = ''; this.wrap.innerHTML = ''; this.panel.innerHTML = '';
        this.wrap.className = 'vg-canvas-wrap';
        this.panel.scrollTop = 0;
        let passed = true;
        el.querySelectorAll('.vg-rail li').forEach(li => {
          li.className = li.dataset.s === id ? 'now' : passed ? 'done' : '';
          if (li.dataset.s === id) passed = false;
        });
        this.current = VL.stages[id];
        this.current.mount(this);
      },
      restart(keepCharge) {
        const ch = keepCharge ? { ...this.run.charge, cells: this.run.charge.cells.slice() } : null;
        const orifice = this.run.orifice;
        this.run = VL.newRun(ch);
        this.run.orifice = orifice;
        this.go('load');
      },
    };

    VL.challenges.bindSelect(app, el.querySelector('.vg-challenge'));
    el.querySelector('.vg-safety-btn').addEventListener('click', () => VL.safety.show(app));
    app.go('load');
    if (!o.embedded) VL.safety.showFirstTime(app);
    return app;
  };

  // Small DOM helper used by the stages.
  VL.h = function (html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  };

  VL.meter = function (label) {
    const m = VL.h(`<div class="vg-meter"><div class="vg-lbl"><span>${label}</span><b></b></div><div class="vg-bar"><i></i></div></div>`);
    return {
      el: m,
      set(frac, text, color) {
        m.querySelector('i').style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
        if (color) m.querySelector('i').style.background = color;
        m.querySelector('b').textContent = text;
      },
    };
  };

  VL.store = {
    get(k, d) { try { const v = localStorage.getItem('vitrigraph-lab:' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('vitrigraph-lab:' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  };
})(window.VitrigraphLab);
