// DOM HUD around the canvas: ticket rail, clock, heat meter, garage, glory hole, station tabs.
import { STEPS, STATIONS, FRITS, heatToF } from './config.js';
import { stepOf } from './game.js';
import { glassRgb, rgbStr, PAL } from './draw.js';
import { DENSITY_LABEL } from './customers.js';

const $ = (s) => document.querySelector(s);
const STATE_LABEL = { ticket: 'Waiting', warming: 'Pipe warming', hand: 'On the pipe', garage: 'In the garage', annealer: 'In the annealer', done: 'Done' };

export function createHud(game) {
  const rail = $('#rail-tickets');
  const garage = $('#garage-slots');
  const tabs = $('#tabs');
  const ghBtn = $('#gh');
  const heatCv = $('#heat');
  const hg = heatCv.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  heatCv.width = 150 * dpr;
  heatCv.height = 340 * dpr;
  hg.setTransform(dpr, 0, 0, dpr, 0, 0);

  rail.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('[data-id]');
    if (el) game.select(Number(el.dataset.id));
  });
  garage.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('[data-slot]');
    if (el && game.phase === 'open') game.clickGarage(Number(el.dataset.slot));
  });
  tabs.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('[data-station]');
    if (el) { game.station = el.dataset.station; renderSlow(); }
  });
  ghBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); game.ghEnter(); });
  window.addEventListener('pointerup', () => game.ghExit());
  window.addEventListener('pointercancel', () => game.ghExit());

  function renderSlow() {
    if (!game.orders) return;
    const cfg = game.cfg;
    // Ticket rail.
    rail.innerHTML = game.activeOrders.map((o) => {
      const f = FRITS.find((x) => x.id === o.ticket.frit);
      const ratio = Math.min(1, (game.clock - o.takenAt) / o.ticket.patienceS);
      const ringCol = ratio < 0.5 ? PAL.green : ratio < 0.85 ? PAL.amber : PAL.red;
      const next = STEPS[o.step];
      return `<div class="ticket ${o.id === game.selected ? 'sel' : ''} ${o.id === game.hand ? 'inhand' : ''}" data-id="${o.id}">
        <div class="t-top"><span class="t-name">#${o.id} ${o.customer.name}</span>
          <span class="patience" style="--p:${(1 - ratio) * 360}deg;--c:${ringCol}"></span></div>
        <div class="t-line"><span class="swatch" style="background:${rgbStr(f.rgb)}"></span>${f.name} · ${DENSITY_LABEL[o.ticket.doses]}</div>
        <div class="t-state">${STATE_LABEL[o.state]}${next && o.state !== 'annealer' ? ` → ${next.label}` : ''}</div>
      </div>`;
    }).join('') || '<div class="rail-empty">No tickets yet. Customers order at the Counter.</div>';

    // Clock.
    const hours = cfg.day.OPEN_HOUR + (game.clock / cfg.day.LENGTH_S) * (cfg.day.CLOSE_HOUR - cfg.day.OPEN_HOUR);
    const h = Math.floor(hours), m = Math.floor((hours - h) * 60);
    const h12 = ((h + 11) % 12) + 1;
    $('#clock').textContent = `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
    $('#clock').classList.toggle('lastcall', game.pastLastCall);
    $('#coins').textContent = `$${game.coins.toFixed(1)}`;
    $('#rep').textContent = `★ ${game.rep.toFixed(1)}`;
    $('#dayno').textContent = `Day ${game.day}`;

    // Garage.
    garage.innerHTML = game.garage.map((id, i) => {
      const o = id != null && game.order(id);
      if (!o) return `<button class="slot empty" data-slot="${i}" ${game.handPiece ? '' : 'disabled'}>${game.handPiece ? 'Park here' : 'Empty'}</button>`;
      const p = o.piece;
      const warn = p.garageSession > cfg.garage.WARN_S ? 'warn' : p.garageSession > cfg.garage.GRACE_S ? 'decay' : '';
      return `<button class="slot full ${warn}" data-slot="${i}">
        <span class="slot-glass" style="background:${rgbStr(glassRgb(p.heat, p.fritRgb))}"></span>
        <span>#${o.id} ${o.customer.name}</span>
        <span class="slot-t">${Math.round(p.heat)} · ${Math.floor(p.garageSession)}s${p.decay > 0 ? ` · −${Math.ceil(p.decay)}` : ''}</span>
      </button>`;
    }).join('');

    // Tabs, with dots for stations that orders need next.
    const need = new Set(game.activeOrders.filter((o) => o.state !== 'annealer').map((o) => STEPS[o.step]?.station));
    const ho = game.handOrder;
    const handNext = ho && stepOf(ho)?.station;
    tabs.querySelectorAll('[data-station]').forEach((b) => {
      const st = b.dataset.station;
      b.classList.toggle('active', st === game.station);
      b.classList.toggle('need', need.has(st) || (st === 'counter' && game.lobby.length > 0));
      b.classList.toggle('next', st === handNext);
    });
  }

  function renderHeat() {
    const g = hg;
    g.clearRect(0, 0, 150, 340);
    const o = game.handOrder;
    const p = o?.piece;
    const X = 50, Y = 24, Wd = 40, Ht = 240;
    const yOf = (h) => Y + Ht - (h / 100) * Ht;
    g.fillStyle = '#3a2a24';
    g.beginPath(); g.roundRect(X, Y, Wd, Ht, 12); g.fill();
    g.fillStyle = '#F6ECD7';
    g.font = '700 14px "Baloo 2", system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText('HEAT', X + Wd / 2, 16);
    if (!p) {
      g.fillStyle = 'rgba(246,236,215,0.6)';
      g.font = '600 13px "Baloo 2", system-ui, sans-serif';
      g.fillText(o ? 'Empty pipe' : 'Nothing', X + Wd / 2, Y + Ht + 26);
      g.fillText('in hand', X + Wd / 2, Y + Ht + 42);
      ghBtn.classList.remove('on');
      return;
    }
    const cfg = game.cfg;
    const step = stepOf(o);
    const band = game.bandFor(step);
    // Crack zone + slump zone.
    g.fillStyle = 'rgba(160,160,160,0.6)';
    g.fillRect(X + 3, yOf(cfg.heat.CRACK_INSTANT), Wd - 6, yOf(0) - yOf(cfg.heat.CRACK_INSTANT) - 3);
    g.fillStyle = 'rgba(200,50,58,0.7)';
    g.fillRect(X + 3, yOf(100) + 3, Wd - 6, yOf(cfg.heat.SLUMP_THRESHOLD) - yOf(100) - 3);
    // Fill.
    // During lip work the lip is what matters, so it drives the main reading; the body gets the side needle.
    const lipMode = p.lipHeat != null && step.id === 'lip';
    const hv = Math.max(0, Math.min(100, game.heatForStep(p, step)));
    g.fillStyle = rgbStr(glassRgb(hv, p.fritRgb));
    g.fillRect(X + 9, yOf(hv), Wd - 18, yOf(0) - yOf(hv) - 4);
    // Ideal band.
    g.strokeStyle = PAL.green; g.lineWidth = 4;
    g.fillStyle = 'rgba(79,166,90,0.35)';
    g.fillRect(X - 6, yOf(band[1]), Wd + 12, yOf(band[0]) - yOf(band[1]));
    g.strokeRect(X - 6, yOf(band[1]), Wd + 12, yOf(band[0]) - yOf(band[1]));
    // Needle.
    const inB = hv >= band[0] && hv <= band[1];
    const shake = inB ? 0 : Math.sin(performance.now() / 30) * 1.5;
    g.fillStyle = '#fff'; g.strokeStyle = PAL.soot; g.lineWidth = 2;
    g.beginPath(); g.moveTo(X - 4 + shake, yOf(hv)); g.lineTo(X - 20 + shake, yOf(hv) - 9); g.lineTo(X - 20 + shake, yOf(hv) + 9); g.closePath(); g.fill(); g.stroke();
    // Body needle while working the lip.
    if (lipMode) {
      const bv = Math.max(0, Math.min(100, p.heat));
      g.fillStyle = PAL.sawdust;
      g.beginPath(); g.moveTo(X + Wd + 4, yOf(bv)); g.lineTo(X + Wd + 20, yOf(bv) - 9); g.lineTo(X + Wd + 20, yOf(bv) + 9); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#F6ECD7'; g.font = '700 11px system-ui'; g.textAlign = 'left'; g.fillText('body', X + Wd + 22, yOf(bv) + 4); g.textAlign = 'center';
    }
    // Stress frost.
    if (p.stress > 1) {
      g.strokeStyle = `rgba(143,199,232,${Math.min(0.9, p.stress / 80)})`;
      g.lineWidth = 6;
      g.beginPath(); g.roundRect(X + 2, Y + 2, Wd - 4, Ht - 4, 10); g.stroke();
    }
    g.fillStyle = inB ? '#9BE39F' : '#F6ECD7';
    g.font = '800 26px "Baloo 2", system-ui, sans-serif';
    g.fillText(String(Math.round(hv)), X + Wd / 2, Y + Ht + 30);
    g.font = '600 12px system-ui';
    g.fillStyle = 'rgba(246,236,215,0.75)';
    g.fillText(`~${heatToF(hv)}°F`, X + Wd / 2, Y + Ht + 46);
    g.fillText(`${lipMode ? "lip " : ""}band ${band[0]}–${band[1]}`, X + Wd / 2, Y + Ht + 62);
    ghBtn.classList.toggle('on', game.gh.in);
  }

  return { renderSlow, renderHeat };
}
