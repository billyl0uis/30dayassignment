import './styles.css';
import { Session } from './session/session';
import {
  anneal, buyColor, buyUpgrade, deliver, nextVisitGap, pass, scrap, setPrice, shelve, unloadAnnealer, unshelve, visit,
} from './studio/economy';
import type { PieceType } from './sim/piece';
import { clearStudio, freshStudio, loadStudio, modsOf, saveStudio, type Studio } from './studio/state';
import { mountBench } from './ui/benchScreen';
import { renderHeader, type PanelId } from './ui/header';
import { Panels } from './ui/panels';

// One studio, always open: the bench in front, the shop and gallery as panels over it.
const header = document.getElementById('header')!;
const main = document.getElementById('main')!;
document.body.dataset.screen = 'session';

let studio = loadStudio();

const session = new Session(modsOf(studio), studio.colors, {
  onFinished(fp) {
    commit(anneal(studio, fp, Date.now()));
  },
  onColorUsed(c) {
    commit({ ...studio, colors: { ...studio.colors, [c]: Math.max(0, studio.colors[c] - 1) } });
  },
});

const panels = new Panels({
  buyColor: (c) => commit(buyColor(studio, c)),
  buyUpgrade: (u) => commit(buyUpgrade(studio, u)),
  deliver: (c, p) => {
    const next = deliver(studio, c, p);
    if (next) {
      commit(next);
      bench.notify(next.log[0]);
    }
  },
  pass: (c) => commit(pass(studio, c)),
  setPrice: (id, price) => commit(setPrice(studio, id, price)),
  shelve: (id) => commit(shelve(studio, id, Date.now())),
  unshelve: (id) => commit(unshelve(studio, id)),
  scrap: (id) => commit(scrap(studio, id)),
  reset: () => {
    clearStudio();
    commit(freshStudio());
    panels.hide();
  },
  close: () => panels.hide(),
});

// ── Pause: the bench freezes, visitors wait, and the annealer's clock stops ──
let paused = false;
let pausedAt = 0;
function togglePause() {
  paused = !paused;
  bench.setPaused(paused);
  if (paused) pausedAt = Date.now();
  else {
    const held = Date.now() - pausedAt;
    commit({ ...studio, annealer: studio.annealer.map((a) => ({ ...a, ready: a.ready + held })) });
  }
  renderHeader(header, studio, headerActions());
}
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Escape') return;
  if (panels.current && !paused) panels.hide();
  else togglePause();
});
const headerActions = () => ({ setMaking: (t: PieceType) => commit({ ...studio, making: t }), open, togglePause, paused });

function open(p: PanelId) {
  if (panels.current === p) panels.hide();
  else panels.show(p, studio);
}

/** Every studio change goes through here: save, keep the bench's jars and tools current, redraw. */
function commit(next: Studio | null) {
  if (!next) return;
  studio = next;
  saveStudio(studio);
  session.colors = studio.colors;
  session.mods = modsOf(studio);
  renderHeader(header, studio, headerActions());
  panels.render(studio);
}

const bench = mountBench(main, session, () => studio.making);
bench.onResume = () => togglePause();
main.append(panels.el);
commit(studio);

// ── The studio clock: the annealer comes down and visitors drop by, in real time ──
let visitIn = nextVisitGap(studio.rep);
let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = (now - last) / 1000;
  last = now;
  if (paused) return;

  const { studio: unloaded, out } = unloadAnnealer(studio, now);
  if (out.length) {
    commit(unloaded);
    bench.notify(unloaded.log[0]);
  }

  visitIn -= dt;
  if (visitIn <= 0) {
    visitIn = nextVisitGap(studio.rep);
    const r = visit(studio, now);
    if (r.text) {
      commit(r.studio);
      bench.notify(r.text);
    }
  }
  panels.tick(now);
}, 1000);
