/* Design options panel. Visible only when the address has ?tweak (or after
   it has been opened once in this browser), so visitors never see it.
   Each option sets a data-* attribute on <html>; style.css does the rest.
   Choices are remembered in this browser only (localStorage). */
(function () {
  const OPTIONS = [
    { key: 'palette', label: 'Rod colours', choices: [
      ['chart', 'Chart', ['#e4572e', '#0f7fa8', '#7a3fa0', '#f2b705', '#4f8a3c']],
      ['deep', 'Deep', ['#c8102e', '#00558c', '#5b2a86', '#d99e00', '#2e6b3a']],
      ['pale', 'Pale', ['#f2967a', '#6cb8d6', '#b28fd0', '#f6d55c', '#93c07c']],
    ] },
    { key: 'font', label: 'Heading font', choices: [
      ['schibsted', 'Schibsted'], ['bricolage', 'Bricolage'], ['shoulders', 'Big Shoulders'],
    ] },
    { key: 'density', label: 'Row size', choices: [
      ['compact', 'Compact'], ['regular', 'Regular'], ['large', 'Large'],
    ] },
    { key: 'swatch', label: 'Swatch finish', choices: [
      ['flat', 'Flat'], ['chip', 'Chip'], ['tint', 'Tinted row'],
    ] },
    { key: 'map', label: 'Base map', choices: [
      ['grey', 'Soft grey'], ['color', 'Full colour'], ['ink', 'Ink'],
    ] },
    { key: 'pin', label: 'Pin label', choices: [
      ['code', 'Type (HS)'], ['number', 'No. (027)'], ['dot', 'Square'],
    ] },
  ];
  const FONT_URLS = {
    bricolage: 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&display=swap',
    shoulders: 'https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@500..900&display=swap',
  };
  const root = document.documentElement;
  const STORE = 'hsa-tweaks';
  const defaults = Object.fromEntries(OPTIONS.map((o) => [o.key, root.dataset[o.key] || o.choices[0][0]]));

  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { /* private mode */ }
  const enabled = new URLSearchParams(location.search).has('tweak') || saved.__on;
  if (!enabled) return;

  const current = { ...defaults };
  // Ignore remembered values for choices that no longer exist.
  for (const o of OPTIONS) if (o.choices.some((c) => c[0] === saved[o.key])) current[o.key] = saved[o.key];

  function apply(key, value) {
    current[key] = value;
    root.dataset[key] = value;
    if (FONT_URLS[value] && !document.querySelector(`link[data-font="${value}"]`)) {
      const l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = FONT_URLS[value]; l.dataset.font = value;
      document.head.append(l);
    }
    if (key === 'pin' && window.atlasRefreshPins) window.atlasRefreshPins();
    try { localStorage.setItem(STORE, JSON.stringify({ ...current, __on: true })); } catch { /* ignore */ }
    render();
  }

  const btn = document.createElement('button');
  btn.className = 'tweaks-btn'; btn.type = 'button'; btn.textContent = 'Tweaks';
  btn.setAttribute('aria-expanded', 'false');
  const panel = document.createElement('section');
  panel.className = 'tweaks'; panel.hidden = true; panel.setAttribute('aria-label', 'Design options');
  btn.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    btn.setAttribute('aria-expanded', String(!panel.hidden));
  });

  function render() {
    panel.replaceChildren();
    const h = document.createElement('h2');
    h.textContent = 'Design options';
    const reset = document.createElement('button');
    reset.type = 'button'; reset.textContent = 'Reset';
    reset.addEventListener('click', () => { for (const o of OPTIONS) apply(o.key, defaults[o.key]); });
    h.append(reset);
    panel.append(h);
    for (const o of OPTIONS) {
      const fs = document.createElement('fieldset');
      const lg = document.createElement('legend'); lg.textContent = o.label;
      const seg = document.createElement('div'); seg.className = 'seg';
      for (const [value, label, chips] of o.choices) {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = label;
        b.setAttribute('aria-pressed', String(current[o.key] === value));
        if (chips) {
          const cs = document.createElement('span'); cs.className = 'chipset';
          for (const c of chips) { const i = document.createElement('i'); i.style.background = c; cs.append(i); }
          b.append(cs);
        }
        b.addEventListener('click', () => apply(o.key, value));
        seg.append(b);
      }
      fs.append(lg, seg);
      panel.append(fs);
    }
    const ro = document.createElement('p');
    ro.className = 'readout';
    ro.textContent = 'Current: ' + OPTIONS.map((o) => `${o.label} ${o.choices.find((c) => c[0] === current[o.key])?.[1]}`).join(' · ');
    panel.append(ro);
  }

  for (const o of OPTIONS) if (current[o.key] !== defaults[o.key] || !root.dataset[o.key]) apply(o.key, current[o.key]);
  render();
  const host = document.querySelector('.map-wrap');
  host.append(btn, panel);
})();
