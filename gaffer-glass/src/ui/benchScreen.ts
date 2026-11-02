import { BLOW, COLORS, COOL, GLORY, LOOP, PRODUCTS, SAG } from '../config';
import { Scene, STATION_LABEL } from '../render/scene';
import { bindHoldButton, bindKeyboard, COLOR_ORDER, HOLD_KEYS, TAP_KEYS } from '../session/input';
import { Session } from '../session/session';
import { canHold, dropAt, type HoldAction, type TapAction } from '../sim/actions';
import { geometry, pieceType, type PieceType } from '../sim/piece';
import { goalState } from '../studio/goals';
import { h, inches, pct } from './dom';

const GAUGE_MAX = 2400;
const ZONES: [number, number, string, string][] = [
  [0, COOL.coldCheckF, 'crack', 'Crack'],
  [COOL.coldCheckF, COOL.stiffF, 'stiff', 'Stiff'],
  [COOL.stiffF, COOL.fluidF, 'work', 'Working'],
  [COOL.fluidF, COOL.hotF, 'hot', 'Hot'],
  [COOL.hotF, GAUGE_MAX, 'toohot', 'Too hot'],
];

export interface Bench {
  /** Called when the player resumes from the paused veil. */
  onResume: () => void;
  /** Show a studio event (a sale, a piece out of the annealer) on the ticker. */
  notify(text: string): void;
  /** Freeze or unfreeze the bench; the Paused veil shows only when asked for. */
  setPaused(paused: boolean, veil?: boolean): void;
  dispose(): void;
}

/** The bench: the 3D shop, the step goals for what you're making, the readouts and the thumb controls. */
export function mountBench(root: HTMLElement, session: Session, making: () => PieceType): Bench {
  const canvas = h('canvas', { class: 'stage', 'aria-label': 'The piece on the pipe' });
  const scene = new Scene(canvas);

  // ── Readouts ──
  const val = () => h('span', { class: 'val' });
  const r = {
    temp: val(), V: val(), D: val(), H: val(), wall: val(), centered: val(), even: val(),
    neck: val(), neckLabel: h('span', {}, 'Jack line'), color: val(), type: val(),
  };
  const marker = h('div', { class: 'gauge-marker' });
  const gauge = h('div', { class: 'gauge', role: 'img', 'aria-label': 'Temperature gauge' },
    ...ZONES.map(([a, b, cls, label]) =>
      h('div', { class: `zone ${cls}`, style: `left:${(a / GAUGE_MAX) * 100}%;width:${((b - a) / GAUGE_MAX) * 100}%`, title: `${label}: ${a}–${b}°F` },
        h('span', {}, label))),
    marker);
  const row = (label: Node | string, v: HTMLElement) => h('div', { class: 'readout' }, h('span', { class: 'lbl' }, label), v);
  const rail = h('aside', { class: 'rail float' },
    h('div', { class: 'temp' }, h('span', { class: 'lbl' }, 'Temperature'), r.temp),
    gauge,
    h('div', { class: 'readouts' },
      row('Glass', r.V), row('Diameter', r.D), row('Height', r.H), row('Wall', r.wall),
      row('Centered', r.centered), row('Even', r.even), row(r.neckLabel, r.neck),
      row('Color', r.color), row('Would be', r.type)),
  );

  // ── Color jars ──
  const jarButtons = COLOR_ORDER.map((c, i) => {
    const b = h('button', { class: 'jar', type: 'button', title: `${COLORS[c].label} (${i + 1})`, 'aria-label': `${COLORS[c].label} jar` },
      h('span', { class: 'swatch', style: `background:rgb(${COLORS[c].rgb.join(',')})` }),
      h('span', { class: 'jar-count' }));
    b.addEventListener('click', () => session.selectColor(c));
    return b;
  });
  const jars = h('div', { class: 'jars' }, ...jarButtons);

  // ── Tools ──
  // Glory hole and blow get the big thumb buttons; the rest sit in a cluster beside them.
  const BIG: HoldAction[] = ['glory', 'blow'];
  const holdBtns = new Map<HoldAction, HTMLButtonElement>();
  for (const a of Object.keys(HOLD_KEYS) as HoldAction[]) {
    const k = HOLD_KEYS[a];
    const b = h('button', { class: `tool hold tool-${a}${BIG.includes(a) ? ' big' : ''}`, type: 'button' },
      h('span', { class: 'tl' }, k.label), h('kbd', {}, k.key));
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
  const hb = (a: HoldAction) => holdBtns.get(a)!;
  const rotate = h('button', { class: 'tool hold tool-rotate', type: 'button', 'aria-pressed': 'true' },
    h('span', { class: 'tl' }, 'Rotating'), h('kbd', {}, 'Space'));
  rotate.addEventListener('click', () => session.toggleRotation());
  // Tip the pipe: hold to let gravity stretch the glass (down) or slump it short (up).
  const tipBtn = (dir: -1 | 1, label: string, key: string) => {
    const b = h('button', { class: `tool hold tool-tip tip-${dir < 0 ? 'up' : 'down'}`, type: 'button', title: dir < 0 ? 'Tip up: soft glass slumps short and fat' : 'Tip down: soft glass runs long' },
      h('span', { class: 'tl' }, label), h('kbd', {}, key));
    bindHoldButton(b, () => (session.tiltTarget = dir), () => session.tiltTarget === dir && (session.tiltTarget = 0));
    return b;
  };
  const tipUp = tipBtn(-1, 'Tip up', '↑');
  const tipDown = tipBtn(1, 'Tip down', '↓');
  const padLeft = h('div', { class: 'pad pad-left' }, hb('glory'), hb('gather'), rotate, tipUp, tipDown);
  const padRight = h('div', { class: 'pad pad-right' }, hb('blow'), hb('marver'), hb('block'), hb('jacks'));
  // Breath pressure: harder blows faster and tears at a thicker wall.
  const pressureVal = h('span', { class: 'val' });
  const pressure = h('input', {
    type: 'range', min: String(Math.round(BLOW.pressureMin * 100)), max: '100', step: '5',
    value: String(Math.round(session.pressure * 100)), 'aria-label': 'Blow pressure',
  });
  pressure.addEventListener('input', () => (session.pressure = Number(pressure.value) / 100));
  const pressureBox = h('label', { class: 'pressure float' }, h('span', { class: 'lbl' }, 'Pressure'), pressure, pressureVal);
  const taps = h('div', { class: 'taps' }, ...tapBtns.values());

  const msg = h('p', { class: 'message', role: 'status', 'aria-live': 'polite' });
  // Compact numbers for the phone, where the full readout panel is folded away.
  const hudTemp = h('span', { class: 'hud-temp' });
  const hudNeck = h('span', {});
  const hudCenter = h('span', {});
  const hud = h('div', { class: 'hud', 'aria-hidden': 'true' }, hudTemp, hudNeck, hudCenter);
  // Step goals for what you're making, Glassworks-style: segments, then the next thing to do.
  const goalKind = h('strong', {});
  const goalBar = h('div', { class: 'goal-steps' });
  const goalNext = h('p', { class: 'goal-next' });
  const goalList = h('ol', { class: 'goal-list' });
  const goal = h('details', { class: 'goal-panel float' },
    h('summary', {}, h('span', { class: 'lbl' }, 'Making'), goalKind, goalBar, goalNext),
    goalList);
  const ticker = h('p', { class: 'ticker', role: 'status', 'aria-live': 'polite' });
  const pauseVeil = h('div', { class: 'pause-veil', hidden: true },
    h('div', { class: 'pause-card' }, h('h2', {}, 'Paused'), h('p', { class: 'note' }, 'The glass is holding still. Press Esc or Resume to carry on.'),
      h('button', { class: 'btn primary', type: 'button', onclick: () => onResume() }, 'Resume')));
  let onResume = () => {};
  let tickerAt = -Infinity;
  const viewBtn = h('button', { class: 'btn small view-btn', type: 'button', title: 'Drag the shop to look around; double-click also resets' }, 'Reset view');
  viewBtn.addEventListener('click', () => scene.resetView());
  const chip = h('div', { class: 'station-chip', 'aria-hidden': 'true' });
  const more = h('button', { class: 'more', type: 'button', 'aria-expanded': 'false' }, 'Details');
  more.addEventListener('click', () => {
    const open = rail.classList.toggle('open');
    more.setAttribute('aria-expanded', String(open));
  });
  rail.prepend(more);
  rail.append(viewBtn);

  const screen = h('section', { class: 'session' },
    canvas,
    h('div', { class: 'vignette', 'aria-hidden': 'true' }),
    goal,
    chip,
    ticker,
    pauseVeil,
    rail,
    hud,
    msg,
    h('div', { class: 'controls' }, padLeft, h('div', { class: 'middle' }, jars, taps), h('div', { class: 'right-stack' }, pressureBox, padRight)));
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
      turning: session.turning, mods: session.mods, time: now / 1000, tilt: session.tilt,
    }, dt);
    sinceReadout += dt;
    if (sinceReadout >= 1 / LOOP.readoutHz) {
      sinceReadout = 0;
      refresh();
    }
    raf = requestAnimationFrame(frame);
  };

  function refresh() {
    const p = session.piece;
    renderGoal();
    pressureVal.textContent = `${pressure.value}%`;
    ticker.classList.toggle('show', performance.now() - tickerAt < 6000);
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
    r.type.textContent = has && !p!.failed ? PRODUCTS[pieceType(p!)].label : '—';

    for (const [a, b] of holdBtns) {
      const ok = canHold(p, a);
      b.classList.toggle('off', !ok.ok);
      b.title = ok.ok ? `${HOLD_KEYS[a].label} — hold ${HOLD_KEYS[a].key}` : ok.reason;
      b.classList.toggle('active', session.tool === a);
      b.querySelector('.tl')!.textContent = a === 'block' && session.mods.pad ? 'Pad' : HOLD_KEYS[a].label;
    }
    const t = session.tool;
    chip.textContent = t ? (t === 'block' && session.mods.pad ? 'Newspaper pad' : STATION_LABEL[t]) : '';
    tipUp.classList.toggle('active', session.tiltTarget < 0);
    tipDown.classList.toggle('active', session.tiltTarget > 0);
    rotate.classList.toggle('active', session.rotating);
    rotate.setAttribute('aria-pressed', String(session.rotating));
    rotate.querySelector('.tl')!.textContent = session.rotating ? 'Rotating' : 'Stopped';
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
    const fresh = m && (session.clock - m.at < 5 || (m.kind === 'fail' && session.piece?.failed));
    msg.textContent = fresh ? m.text : '';
    msg.dataset.kind = m?.kind ?? 'info';

  }

  let goalKey = '';
  function renderGoal() {
    const st = goalState(making(), session.piece);
    const key = `${st.label}|${st.steps.map((x) => +x.done).join('')}|${st.next}`;
    if (key === goalKey) return;
    goalKey = key;
    goalKind.textContent = st.label;
    goalBar.replaceChildren(...st.steps.map((x) => h('i', { class: x.done ? 'done' : '' })));
    goalNext.textContent = st.next ? `Next: ${st.next}` : 'Ready to knock off';
    goalList.replaceChildren(...st.steps.map((x) => h('li', { class: x.done ? 'done' : '' }, x.label)));
  }

  refresh();
  raf = requestAnimationFrame(frame);
  return {
    setPaused(paused: boolean, veil = true) {
      session.paused = paused;
      if (paused && session.held) session.release(session.held);
      session.tiltTarget = 0;
      pauseVeil.hidden = !(paused && veil);
    },
    set onResume(fn: () => void) {
      onResume = fn;
    },
    notify(text: string) {
      ticker.textContent = text;
      tickerAt = performance.now();
      ticker.classList.add('show');
    },
    dispose() {
      cancelAnimationFrame(raf);
      unbindKeys();
      scene.dispose();
    },
  };
}
