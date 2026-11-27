import { CFG } from './config.js';
import { Game } from './game.js';
import { W, H, PAL, text, glow, box } from './draw.js';
import { createHud } from './hud.js';
import { showTitle, showHandoff, showSummary, showReveal, clearOverlay, toast } from './overlays.js';
import { play, toggleMute } from './audio.js';
import { hit } from './stations/common.js';
import { counter } from './stations/counter.js';
import { furnace } from './stations/furnace.js';
import { color } from './stations/color.js';
import { bench } from './stations/bench.js';
import { finish } from './stations/finish.js';

const SAVE_KEY = 'hotShopRush.v1';
const STATIONS = { counter, furnace, color, bench, finish };

function load() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch { return {}; }
}
function save(game) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(game.toSave())); } catch { /* private mode: play on without saving */ }
}

const game = new Game(CFG, load());
window.game = game; // handy for debugging in the console
window.hsr = { pause: (v) => { paused = v; } };

const canvas = document.querySelector('#stage');
const g = canvas.getContext('2d');
const dpr = window.devicePixelRatio || 1;
canvas.width = W * dpr;
canvas.height = H * dpr;
g.setTransform(dpr, 0, 0, dpr, 0, 0);

const hud = createHud(game);
let paused = false;
let speed = 1;
let debug = false;

game.on('toast', toast);
game.on('sound', play);
game.on('rail', () => hud.renderSlow());
game.on('save', () => save(game));
game.on('handoff', (e) => {
  paused = true;
  showHandoff(e, () => { clearOverlay(); paused = false; game.finishHandoff(e.order.id); });
});
game.on('closed', (e) => {
  showSummary(game, e, () => { game.sleep(); morning(); });
});

function morning() {
  const results = game.reveal();
  showReveal(game, results, () => { clearOverlay(); startDay(); }, play);
}

function startDay() {
  clearOverlay();
  game.startDay();
  hud.renderSlow();
}

// ---- input -------------------------------------------------------------
function toStage(e) {
  const r = canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
}

canvas.addEventListener('pointerdown', (e) => {
  if (game.phase !== 'open' || paused) return;
  canvas.setPointerCapture(e.pointerId);
  const { x, y } = toStage(e);
  if (game.gh.in) return;
  const st = STATIONS[game.station];
  const b = st.buttons.find((bb) => hit(bb, x, y));
  if (b) { if (b.enabled !== false) b.onClick(); return; }
  st.down?.(x, y, game);
});
canvas.addEventListener('pointermove', (e) => {
  if (game.phase !== 'open' || paused) return;
  const { x, y } = toStage(e);
  STATIONS[game.station].move?.(x, y, game);
});
const release = (e) => {
  const { x, y } = toStage(e);
  for (const st of Object.values(STATIONS)) st.up?.(x, y, game);
};
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);

document.querySelector('#mute').addEventListener('click', (e) => {
  e.currentTarget.textContent = toggleMute() ? '🔇' : '🔊';
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'd') debug = !debug;
  if (e.key === 'p' && game.phase === 'open') { paused = !paused; toast(paused ? 'Paused (debug)' : 'Resumed'); }
  if (e.key === 'f') { speed = speed === 1 ? 4 : 1; toast(speed > 1 ? 'Fast-forward ×4 (debug)' : 'Normal speed'); }
});

// ---- loop --------------------------------------------------------------
let last = performance.now();
let slowT = 0;

function simulate(sdt) {
  for (const st of Object.values(STATIONS)) st.update?.(sdt, game);
  if (game.handPiece) game.handPiece.phase += sdt * 3;
  game.tick(sdt);
}

// Test hook: run the game in simulated time (works even when the tab is hidden).
window.hsr.advance = (seconds) => {
  for (let s = 0; s < seconds && game.phase === 'open'; s += 1 / 60) simulate(1 / 60);
  render(performance.now() / 1000);
  hud.renderSlow();
};

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (game.phase === 'open' && !paused) simulate(dt * speed);
  render(now / 1000);
  slowT += dt;
  if (slowT > 0.25) { slowT = 0; hud.renderSlow(); }
  requestAnimationFrame(frame);
}

function render(t) {
  if (game.orders && game.station) {
    STATIONS[game.station].draw(g, game, t);
    if (game.gh.in) drawGloryHole(t);
  } else {
    g.fillStyle = PAL.brickShadow; g.fillRect(0, 0, W, H);
  }
  if (debug) drawDebug();
  hud.renderHeat();
}

function drawGloryHole(t) {
  g.fillStyle = 'rgba(20,10,8,0.72)';
  g.fillRect(0, 0, W, H);
  const p = game.handPiece;
  const cx = W / 2, cy = H / 2;
  glow(g, cx, cy, 260, 100);
  g.beginPath(); g.arc(cx, cy, 130, 0, Math.PI * 2);
  g.fillStyle = PAL.glory; g.fill();
  g.lineWidth = 6; g.strokeStyle = PAL.soot; g.stroke();
  for (let i = 0; i < 8; i++) {
    const a = t * 2 + i * 0.8;
    g.fillStyle = `rgba(255,${120 + i * 15},40,0.6)`;
    g.beginPath(); g.arc(cx + Math.cos(a) * 80, cy + Math.sin(a * 1.3) * 60, 26, 0, Math.PI * 2); g.fill();
  }
  const travel = game.gh.t < CFG.heat.GH_TRAVEL_S / 2;
  const lip = game.handOrder && game.handOrder.step === 10;
  text(g, travel ? 'Walking to the glory hole…' : lip ? 'Reheating the lip…' : 'Reheating… turning, turning…', cx, cy + 190, { size: 24, align: 'center', color: PAL.paper });
  if (p && p.heat > CFG.heat.SLUMP_THRESHOLD) text(g, 'Too hot! It’s slumping, pull it out!', cx, cy + 222, { size: 20, align: 'center', color: PAL.red });
  if (p && game.handOrder.step === 4) {
    box(g, cx - 120, cy - 200, 240, 22, '#3a2a24', 8);
    g.fillStyle = PAL.glory; g.fillRect(cx - 116, cy - 196, 232 * Math.min(1, p.meltT / CFG.frit.MELT_S), 14);
    text(g, 'Melt-in', cx, cy - 210, { size: 16, align: 'center', color: PAL.paper });
  }
}

function drawDebug() {
  const p = game.handPiece;
  box(g, 8, H - 120, 260, 112, 'rgba(0,0,0,0.75)', 6, 0);
  const lines = [
    `phase ${game.phase}  clock ${game.clock?.toFixed(1)}  ×${speed}`,
    p ? `heat ${p.heat.toFixed(1)}  lip ${p.lipHeat?.toFixed(1) ?? '–'}` : 'no piece',
    p ? `stress ${p.stress.toFixed(1)} (peak ${p.stressPeak.toFixed(1)})` : '',
    p ? `off ${p.off.toFixed(1)}  floor ${p.offFloor.toFixed(1)}` : '',
    p ? `work ${p.work.t.toFixed(1)}/${p.work.in.toFixed(1)}  hand ${p.handT.toFixed(1)}/${p.handIn.toFixed(1)}` : '',
  ];
  lines.forEach((l, i) => text(g, l, 16, H - 98 + i * 20, { size: 13, color: '#9BE39F', weight: 500 }));
}

// ---- boot ----------------------------------------------------------------
if (game.annealerTonight.length) morning();
else showTitle(game, startDay);
requestAnimationFrame(frame);
