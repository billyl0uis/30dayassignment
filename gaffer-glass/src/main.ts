import './styles.css';
import { Session } from './session/session';
import {
  anneal, buyColor, buyUpgrade, deliver, nextVisitGap, pass, rename, scrap, setPrice, shelve, unloadAnnealer, unshelve, visit,
} from './studio/economy';
import type { PieceType } from './sim/piece';
import { clearStudio, freshStudio, loadStudio, modsOf, saveStudio, type Studio } from './studio/state';
import { mountBench } from './ui/benchScreen';
import { renderHeader, type PanelId } from './ui/header';
import { Panels } from './ui/panels';
import { showResult } from './ui/resultCard';

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

// ── Freezing: Pause, or a finished piece's card, holds the bench, the visitors and the annealer ──
const frozenBy = new Set<'pause' | 'card'>();
let frozenAt = 0;
function freeze(reason: 'pause' | 'card', on: boolean) {
  const was = frozenBy.size > 0;
  if (on) frozenBy.add(reason);
  else frozenBy.delete(reason);
  const now = frozenBy.size > 0;
  bench.setPaused(now, frozenBy.has('pause'));
  if (!was && now) frozenAt = Date.now();
  if (was && !now) {
    const held = Date.now() - frozenAt;
    commit({ ...studio, annealer: studio.annealer.map((x) => ({ ...x, ready: x.ready + held })) });
  }
  renderHeader(header, studio, headerActions());
}
const togglePause = () => freeze('pause', !frozenBy.has('pause'));
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Escape' || frozenBy.has('card')) return;
  if (panels.current && !frozenBy.has('pause')) panels.hide();
  else togglePause();
});
const headerActions = () => ({
  setMaking: (t: PieceType) => commit({ ...studio, making: t }),
  open,
  togglePause,
  paused: frozenBy.has('pause'),
});

// ── Out of the annealer: one card per piece, in the order they come out ──
const cardQueue: number[] = [];
let closeCard: (() => void) | null = null;
function nextCard() {
  if (closeCard) return;
  const id = cardQueue.shift();
  const piece = studio.pieces.find((p) => p.id === id);
  if (!piece) {
    if (cardQueue.length) nextCard();
    return;
  }
  freeze('card', true);
  closeCard = showResult(main, studio, piece, {
    rename: (pid, name) => commit(rename(studio, pid, name)),
    shelveAt: (pid, price) => commit(shelve(setPrice(studio, pid, price), pid, Date.now())),
    deliver: (c, pid) => {
      const next = deliver(studio, c, pid);
      if (next) {
        commit(next);
        bench.notify(next.log[0]);
      }
    },
    openGallery: () => panels.show('gallery', studio),
    close: () => {
      closeCard?.();
      closeCard = null;
      freeze('card', false);
      nextCard();
    },
  });
}

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
  if (frozenBy.size) return;

  const { studio: unloaded, out } = unloadAnnealer(studio, now);
  if (out.length) {
    commit(unloaded);
    cardQueue.push(...out.map((p) => p.id));
    nextCard();
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
