import { COLORS, COOL, GLORY, LOOP, SAG } from '../config';
import { Scene } from '../render/scene';
import { bindHoldButton, bindKeyboard, COLOR_ORDER, HOLD_KEYS, TAP_KEYS } from '../session/input';
import { Session } from '../session/session';
import { canHold, dropAt, type HoldAction, type TapAction } from '../sim/actions';
import { geometry, pieceType } from '../sim/piece';
import { h, inches, pct } from './dom';

const GAUGE_MAX = 2400;
const ZONES: [number, number, string, string][] = [
  [0, COOL.coldCheckF, 'crack', 'Crack'],
  [COOL.coldCheckF, COOL.stiffF, 'stiff', 'Stiff'],
  [COOL.stiffF, COOL.fluidF, 'work', 'Working'],
  [COOL.fluidF, COOL.hotF, 'hot', 'Hot'],
  [COOL.hotF, GAUGE_MAX, 'toohot', 'Too hot'],
];

/** Builds the session screen and runs its frame loop until the night closes. */
export function mountSession(root: HTMLElement, session: Session, onClose: () => void): () => void {
  const canvas = h('canvas', { class: 'stage', 'aria-label': 'The piece on the pipe' });
  const scene = new Scene(canvas);

  // ── Readouts ──
  const val = () => h('span', { class: 'val' });
  const r = {
    time: val(), temp: val(), V: val(), D: val(), H: val(), wall: val(), centered: val(), even: val(),
    neck: val(), neckLabel: h('span', {}, 'Jack line'), color: val(), type: val(), annealed: val(),
  };
  const marker = h('div', { class: 'gauge-marker' });
  const gauge = h('div', { class: 'gauge', role: 'img', 'aria-label': 'Temperature gauge' },
    ...ZONES.map(([a, b, cls, label]) =>
      h('div', { class: `zone ${cls}`, style: `left:${(a / GAUGE_MAX) * 100}%;width:${((b - a) / GAUGE_MAX) * 100}%`, title: `${label}: ${a}–${b}°F` },
        h('span', {}, label))),
    marker);
  const row = (label: Node | string, v: HTMLElement) => h('div', { class: 'readout' }, h('span', { class: 'lbl' }, label), v);
  const rail = h('aside', { class: 'rail' },
    h('div', { class: 'temp' }, h('span', { class: 'lbl' }, 'Temperature'), r.temp),
    gauge,
    h('div', { class: 'readouts' },
      row('Glass', r.V), row('Diameter', r.D), row('Height', r.H), row('Wall', r.wall),
      row('Centered', r.centered), row('Even', r.even), row(r.neckLabel, r.neck),
      row('Color', r.color), row('Would be', r.type), row('In annealer', r.annealed)),
  );

  // ── Color jars ──
  const jarButtons = COLOR_ORDER.map((c, i) => {
    const b = h('button', { class: 'jar', type: 'button', title: `${COLORS[c].label} (${i + 1})` },
      h('span', { class: 'swatch', style: `background:rgb(${COLORS[c].rgb.join(',')})` }),
      h('span', { class: 'jar-name' }, COLORS[c].label), h('span', { class: 'jar-count' }));
    b.addEventListener('click', () => session.selectColor(c));
    return b;
  });
  const jars = h('div', { class: 'jars' }, h('span', { class: 'lbl' }, 'Color jar'), ...jarButtons);

  // ── Tools ──
  const holdBtns = new Map<HoldAction, HTMLButtonElement>();
  for (const a of Object.keys(HOLD_KEYS) as HoldAction[]) {
    const k = HOLD_KEYS[a];
    const b = h('button', { class: `tool hold tool-${a}`, type: 'button' }, h('span', { class: 'tl' }, k.label), h('kbd', {}, k.key));
    bindHoldButton(b, () => session.press(a), () => session.release(a));
    holdBtns.set(a, b);
  }
  const tapBtns = new Map<TapAction, HTMLButtonElement>();
  for (const a of Object.keys(TAP_KEYS) as TapAction[]) {
    const k = TAP_KEYS[a];
    const b = h('button', { class: `tool tap tool-${a}`, type: 'button' }, h('span', { class: 'tl' }, k.label), h('kbd', {}, k.key));
    b.addEventListener('click', () => session.tap(a));
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    tapBtns.set(a, b);
  }
  const tools = h('div', { class: 'tools' },
    h('div', { class: 'tool-group' }, h('h3', {}, 'Hold'), h('div', { class: 'grid' }, ...holdBtns.values())),
    h('div', { class: 'tool-group' }, h('h3', {}, 'Tap'), h('div', { class: 'grid' }, ...tapBtns.values())));

  const msg = h('p', { class: 'message', role: 'status', 'aria-live': 'polite' });
  // Phone-only heads-up numbers on the canvas, since the rail sits below the tools there.
  const hudTemp = h('span', { class: 'hud-temp' });
  const hudNeck = h('span', {});
  const hudCenter = h('span', {});
  const hud = h('div', { class: 'hud', 'aria-hidden': 'true' }, hudTemp, hudNeck, hudCenter);
  const endBtn = h('button', { class: 'btn ghost', type: 'button' }, 'End session early');
  endBtn.addEventListener('click', () => {
    if (confirm('End the session now? A piece still on the pipe goes in the cullet.')) session.endEarly();
  });

  const overlay = h('div', { class: 'overlay', hidden: true },
    h('div', { class: 'overlay-card' },
      h('h2', {}, "Time's up"),
      h('p', { class: 'overlay-text' }),
      h('button', { class: 'btn primary', type: 'button', onclick: () => onClose() }, 'Close up for the night')));

  const screen = h('section', { class: 'session' },
    h('div', { class: 'session-bar' }, h('div', { class: 'clock' }, h('span', { class: 'lbl' }, 'Time left'), r.time), endBtn),
    h('div', { class: 'bench' }, h('div', { class: 'stage-wrap' }, canvas, hud, msg), rail),
    jars,
    tools,
    overlay);
  root.replaceChildren(screen);

  const unbindKeys = bindKeyboard(session);

  // ── Loop ──
  let last = performance.now();
  let sinceReadout = Infinity;
  let raf = 0;
  const frame = (now: number) => {
    const dt = (now - last) / 1000;
    last = now;
    session.update(dt);
    scene.draw({
      piece: session.piece, tool: session.tool, turnPhase: session.turnPhase,
      turning: session.turning, mods: session.mods, time: now / 1000,
    }, dt);
    sinceReadout += dt;
    if (sinceReadout >= 1 / LOOP.readoutHz || session.over) {
      sinceReadout = 0;
      refresh();
    }
    raf = requestAnimationFrame(frame);
  };

  function refresh() {
    const p = session.piece;
    const mins = Math.ceil(session.timeLeft);
    r.time.textContent = `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;
    r.time.classList.toggle('low', session.timeLeft < 20);
    const has = !!p && p.V > 0;
    const g = p ? geometry(p) : null;
    const T = has ? p!.T : null;
    r.temp.textContent = T === null ? '—' : `${Math.round(T)}°F`;
    marker.style.left = `${Math.min(100, ((T ?? 0) / GAUGE_MAX) * 100)}%`;
    marker.hidden = T === null;
    marker.classList.toggle('danger', T !== null && (T < COOL.coldCheckF + 100 || T > GLORY.floppyF));
    r.V.textContent = has ? `${p!.V.toFixed(1)} in³` : '—';
    r.D.textContent = has ? inches(g!.D) : '—';
    r.H.textContent = has ? inches(g!.H) : '—';
    r.wall.textContent = has ? (p!.blown ? inches(g!.wall) : 'solid') : '—';
    r.centered.textContent = has ? pct(Math.max(0, 1 - SAG.centeredK * p!.s)) : '—';
    r.even.textContent = has ? pct(Math.max(0, 1 - p!.uneven)) : '—';
    if (p?.punty) {
      r.neckLabel.textContent = 'Opening';
      r.neck.textContent = pct(p.o);
    } else {
      r.neckLabel.textContent = 'Jack line';
      r.neck.textContent = p ? `${pct(p.n)} / ${pct(dropAt(session.mods))}` : '—';
    }
    hudTemp.textContent = r.temp.textContent;
    hudTemp.dataset.zone = T === null ? '' : ZONES.find(([a, b]) => T >= a && T < b)?.[2] ?? 'toohot';
    hudNeck.textContent = has ? `${r.neckLabel.textContent} ${p!.punty ? pct(p!.o) : pct(p!.n)}` : '';
    hudCenter.textContent = has ? `Centered ${r.centered.textContent}` : '';
    r.color.textContent = p?.color ? COLORS[p.color].label : 'Clear';
    r.type.textContent = has && !p!.failed ? pieceType(p!) : '—';
    r.annealed.textContent = String(session.annealed.length);

    for (const [a, b] of holdBtns) {
      const ok = canHold(p, a);
      b.classList.toggle('off', !ok.ok);
      b.title = ok.ok ? `${HOLD_KEYS[a].label} — hold ${HOLD_KEYS[a].key}` : ok.reason;
      b.classList.toggle('active', session.tool === a);
      b.querySelector('.tl')!.textContent = a === 'block' && session.mods.pad ? 'Pad' : HOLD_KEYS[a].label;
    }
    for (const [a, b] of tapBtns) {
      const ok = session.canTap(a);
      b.classList.toggle('off', !ok.ok);
      b.title = ok.ok ? `${TAP_KEYS[a].label} — ${TAP_KEYS[a].key}` : ok.reason;
    }
    COLOR_ORDER.forEach((c, i) => {
      const b = jarButtons[i];
      b.classList.toggle('selected', session.selectedColor === c);
      b.classList.toggle('empty', session.colors[c] <= 0);
      b.querySelector('.jar-count')!.textContent = `${session.colors[c]}`;
    });

    // Messages fade after a few seconds; a fail stays up while the failed piece is on the pipe.
    const m = session.message;
    const fresh = m && (session.clock - m.at < 5 || (m.kind === 'fail' && (session.piece?.failed || session.over)));
    msg.textContent = fresh ? m.text : '';
    msg.dataset.kind = m?.kind ?? 'info';

    if (session.over && overlay.hidden) {
      overlay.hidden = false;
      const n = session.annealed.length;
      overlay.querySelector('.overlay-text')!.textContent =
        `${n} piece${n === 1 ? '' : 's'} in the annealer, ${session.cullet} in the cullet. They come out in the morning.`;
      (overlay.querySelector('button') as HTMLButtonElement).focus();
    }
  }

  refresh();
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    unbindKeys();
  };
}
