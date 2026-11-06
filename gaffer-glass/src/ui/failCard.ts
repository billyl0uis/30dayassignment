import { h } from './dom';

export interface FailActions {
  newPipe(): void;
  close(): void;
}

/** When a piece is lost, the shop stops so you can read why before you carry on. */
export function showFail(host: HTMLElement, reason: string, act: FailActions): () => void {
  const fresh = h('button', { class: 'btn primary', type: 'button' }, 'New pipe');
  fresh.addEventListener('click', () => {
    act.newPipe();
    act.close();
  });
  const look = h('button', { class: 'btn ghost', type: 'button' }, 'Look at it first');
  look.addEventListener('click', () => act.close());
  const card = h('div', { class: 'result-veil', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': 'Lost the piece' },
    h('div', { class: 'result-card fail-card' },
      h('h2', {}, 'Lost it'),
      h('p', { class: 'fail-reason' }, reason),
      h('p', { class: 'note' }, 'It goes in the cullet bucket. Everything is paused until you carry on.'),
      h('div', { class: 'result-acts' }, fresh, look)));
  card.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') act.close();
  });
  host.append(card);
  fresh.focus();
  return () => card.remove();
}
