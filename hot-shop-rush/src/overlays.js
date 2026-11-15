// DOM overlays: title, hand-off inspection card, day summary, morning reveal, toasts.
import { glassRgb, rgbStr, PAL } from './draw.js';
import { FRITS } from './config.js';

const layer = () => document.querySelector('#overlay');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function clearOverlay() { layer().innerHTML = ''; layer().classList.remove('show'); }

function show(html) {
  const el = layer();
  el.innerHTML = html;
  el.classList.add('show');
  return el;
}

const starStr = (n) => '★'.repeat(Math.floor(n)) + (n % 1 ? '½' : '') + '☆'.repeat(5 - Math.ceil(n));

export function showTitle(game, onStart) {
  const el = show(`<div class="card title">
    <h1>Hot Shop Rush</h1>
    <p class="sub">Day ${game.day} · a cozy glassblowing rush</p>
    <ol class="howto">
      <li><b>Counter:</b> take an order. Its ticket goes on the rail.</li>
      <li><b>Furnace:</b> warm a pipe, take it from the warmer, hold to <i>gather</i>, then roll it on the <i>marver</i>.</li>
      <li><b>Color:</b> pour frit, roll it on, melt it in at the <i>glory hole</i>, then blow to size.</li>
      <li><b>Bench:</b> squeeze a <i>jack line</i>, paddle the bottom flat.</li>
      <li><b>Finish:</b> <i>punty</i> transfer, crack off, open the lip, tap it into the <i>annealer</i>.</li>
    </ol>
    <p class="tip">The piece keeps cooling. <b>Hold the Glory Hole</b> button to reheat it, and keep it in the green band. Park a piece in the <b>Garage</b> to juggle another order.</p>
    <button class="big" id="go">Open shop</button>
  </div>`);
  el.querySelector('#go').addEventListener('click', onStart);
}

const REACT = [[90, 'This is gorgeous!', 'happy'], [75, 'Oh, I love it.', 'happy'], [55, 'It’ll do nicely.', 'neutral'], [0, 'Hmm… it’s… glass.', 'sad']];

export function showHandoff({ order, result, tip, loadHeat }, onNext) {
  const c = result.categories;
  const [, line] = REACT.find(([min]) => result.total >= min);
  const bar = (label, v) => `<div class="bar"><span>${label}</span><div class="track"><div class="fill" style="width:${Math.round(v)}%;background:${v >= 75 ? PAL.green : v >= 50 ? PAL.amber : PAL.red}"></div></div><b>${Math.round(v)}</b></div>`;
  const el = show(`<div class="card handoff">
    <div class="who"><span class="face" style="background:${order.customer.look.skin};border-color:${order.customer.look.hair}"></span>
      <div><h2>${esc(order.customer.name)} peeks through the annealer window</h2><p class="quote">“${line}”</p></div></div>
    ${bar('Shape', c.shape)}${bar('Color', c.color)}${bar('Size', c.size)}${bar('Heat', c.heat)}${bar('Wait', c.wait)}
    <div class="result"><span class="stars">${starStr(result.stars)}</span><span class="tipamt">+$${tip.toFixed(1)} tip</span></div>
    <p class="fine">Loaded at heat ${Math.round(loadHeat)}. Final verdict tomorrow morning when the annealer opens.</p>
    <button class="big" id="next">Next</button>
  </div>`);
  el.querySelector('#next').addEventListener('click', onNext);
}

export function showSummary(game, { stats, tonight }, onSleep) {
  const avg = stats.stars.length ? stats.stars.reduce((a, b) => a + b, 0) / stats.stars.length : 0;
  const soakMin = game.cfg.anneal.SOAK_MIN_HOLLOW;
  const rows = tonight.map((p) => `<li><span class="swatch" style="background:${rgbStr(p.fritRgb || [191, 230, 239])}"></span>
      ${esc(p.name)}'s tumbler ${starStr(p.stars)} ${p.soakS < soakMin ? '<span class="warnchip">⏳ short soak</span>' : ''}${p.loadHeat < 40 ? '<span class="warnchip">❄ cold load</span>' : ''}</li>`).join('') || '<li>Nothing in the annealer tonight.</li>';
  const el = show(`<div class="card summary">
    <h2>Closing time · Day ${game.day}</h2>
    <div class="stats">
      <div><b>${stats.served}</b><span>served</span></div>
      <div><b>${avg.toFixed(1)}★</b><span>average</span></div>
      <div><b>$${stats.tips.toFixed(1)}</b><span>tips</span></div>
      <div><b>${stats.walkouts}</b><span>walkouts</span></div>
      <div><b>${stats.lost}</b><span>pieces lost</span></div>
      <div><b>${stats.unfinished}</b><span>unfinished</span></div>
    </div>
    <h3>In the annealer tonight</h3>
    <ul class="tonight">${rows}</ul>
    <p class="fine">The annealer starts its program now. Pieces that went in less than ${soakMin}s before closing didn't get their full soak.</p>
    <button class="big" id="sleep">Sleep</button>
  </div>`);
  el.querySelector('#sleep').addEventListener('click', onSleep);
}

// The morning ritual (GDD §7.4): pieces come out one at a time, clean or cracked.
export function showReveal(game, results, onOpen, sound) {
  const el = show(`<div class="card reveal">
    <h2>Morning · Day ${game.day}</h2>
    <p class="sub" id="rv-msg">Juno yawns, pulls on gloves, and opens the annealer…</p>
    <div class="shelf" id="shelf"></div>
    <div class="tally" id="tally"></div>
    <button class="big" id="open" style="visibility:hidden">Open shop</button>
  </div>`);
  const shelf = el.querySelector('#shelf');
  const msg = el.querySelector('#rv-msg');
  const tally = el.querySelector('#tally');
  const openBtn = el.querySelector('#open');
  openBtn.addEventListener('click', onOpen);

  if (!results.length) {
    msg.textContent = 'The annealer is empty this morning. Let’s make something!';
    openBtn.style.visibility = 'visible';
    return;
  }
  sound('door');
  let i = 0;
  const next = () => {
    if (i >= results.length) {
      const clean = results.filter((r) => !r.cracked).length;
      const rate = Math.round((clean / results.length) * 100);
      const delta = results.reduce((a, r) => a + r.delta, 0);
      tally.innerHTML = `Clean rate <b>${rate}%</b> · ${delta >= 0 ? '+' : '−'}$${Math.abs(delta).toFixed(1)} at pickup${rate === 100 && results.length >= 3 ? ' · <span class="badge">Clean Sweep!</span>' : ''}`;
      msg.textContent = rate === 100 ? 'Every single one came out clean.' : rate >= 60 ? 'Mostly clean. Not bad at all.' : 'Rough night in the annealer. Watch that heat.';
      openBtn.style.visibility = 'visible';
      return;
    }
    const r = results[i++];
    const cv = document.createElement('canvas');
    cv.width = 120; cv.height = 140;
    drawCold(cv.getContext('2d'), r.piece, r.cracked);
    const item = document.createElement('div');
    item.className = 'piece';
    item.innerHTML = `<div class="nm">${esc(r.piece.name)}</div>`;
    item.prepend(cv);
    shelf.appendChild(item);
    setTimeout(() => {
      const stamp = document.createElement('div');
      stamp.className = `stamp ${r.cracked ? 'cracked' : 'clean'}`;
      stamp.textContent = r.cracked ? 'CRACKED' : 'CLEAN';
      item.appendChild(stamp);
      if (r.cracked) {
        drawCold(cv.getContext('2d'), r.piece, true, true);
        sound('ping');
        msg.textContent = r.pity ? 'Juno: “That one was just bad luck.”' : 'Juno: “Happens to everyone. Watch the heat on that kind.”';
      } else {
        sound('ting');
        msg.textContent = `${r.piece.name}'s tumbler came out clean.`;
      }
      setTimeout(next, 700);
    }, 600);
  };
  setTimeout(next, 700);
}

// A cold, finished tumbler on the shelf.
function drawCold(g, p, cracked, showCrack = false) {
  g.clearRect(0, 0, 120, 140);
  const col = glassRgb(20, p.fritRgb ? mixClear(p.fritRgb, p.coverage) : null);
  const w = 34 + 14 * Math.min(1.3, p.b || 1), h = 92;
  const x = 60 - w, y = 128 - h;
  g.fillStyle = rgbStr(col, 0.85);
  g.strokeStyle = '#2B1E1A'; g.lineWidth = 3;
  g.beginPath(); g.roundRect(x, y, w * 2, h, [4, 4, 14, 14]); g.fill(); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.45)';
  g.fillRect(x + 8, y + 10, 6, h - 26);
  g.beginPath(); g.ellipse(60, y, w, 6, 0, 0, Math.PI * 2);
  g.fillStyle = rgbStr(col, 0.6); g.fill(); g.stroke();
  if (cracked && showCrack) {
    g.strokeStyle = '#fff'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(x + 10, y + 20); g.lineTo(x + 30, y + 38); g.lineTo(x + 22, y + 52); g.lineTo(x + 50, y + 70); g.lineTo(x + 44, y + 84); g.stroke();
  }
}

const mixClear = (rgb, cov) => rgb.map((v, i) => Math.round(v * cov + [191, 230, 239][i] * (1 - cov)));

export function toast(msg) {
  const box = document.querySelector('#toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  box.appendChild(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => el.classList.add('out'), 2400);
  setTimeout(() => el.remove(), 2900);
}

export { FRITS };
