import './styles.css';
import { Session } from './session/session';
import { buyColor, buyUpgrade, overnight } from './studio/economy';
import { clearStudio, freshStudio, loadStudio, modsOf, saveStudio, type Studio } from './studio/state';
import { renderHeader } from './ui/header';
import { mountResults } from './ui/resultsScreen';
import { mountSession } from './ui/sessionScreen';
import { mountStudio } from './ui/studioScreen';

const header = document.getElementById('header')!;
const main = document.getElementById('main')!;

let studio = loadStudio();
let teardown: (() => void) | null = null;

function commit(next: Studio | null) {
  if (!next) return;
  studio = next;
  saveStudio(studio);
  renderHeader(header, studio);
}

function showStudio() {
  teardown?.();
  teardown = null;
  document.body.dataset.screen = 'studio';
  renderHeader(header, studio);
  mountStudio(main, studio, {
    fireUp() {
      startSession();
    },
    buyColor(c) {
      commit(buyColor(studio, c));
      showStudio();
    },
    buyUpgrade(u) {
      commit(buyUpgrade(studio, u));
      showStudio();
    },
    reset() {
      clearStudio();
      studio = freshStudio();
      saveStudio(studio);
      showStudio();
    },
  });
  window.scrollTo(0, 0);
}

function startSession() {
  document.body.dataset.screen = 'session';
  const session = new Session(modsOf(studio), { ...studio.colors });
  teardown = mountSession(main, session, () => {
    teardown?.();
    teardown = null;
    const res = session.result();
    const { studio: next, report } = overnight({ ...studio, colors: res.colors }, res.annealed, res.cullet);
    commit(next);
    document.body.dataset.screen = 'results';
    mountResults(main, report, showStudio);
  });
  window.scrollTo(0, 0);
}

showStudio();
