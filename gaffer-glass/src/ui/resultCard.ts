import { CABINET, PRODUCTS } from '../config';
import { Turntable } from '../render/turntable';
import { fits, notes, pct, saleOdds, shelvedCount } from '../studio/economy';
import type { StoredPiece, Studio } from '../studio/state';
import { h, money } from './dom';

export interface ResultActions {
  rename(id: number, name: string): void;
  shelveAt(id: number, price: number): void;
  deliver(commissionId: string, pieceId: number): void;
  openGallery(): void;
  close(): void;
}

/**
 * The card that comes up when a piece leaves the annealer: the piece on a turntable, its quality and
 * worth, what a buyer will notice, a name, and what to do with it.
 */
export function showResult(host: HTMLElement, s: Studio, piece: StoredPiece, act: ResultActions): () => void {
  const canvas = h('canvas', { class: 'result-view', title: 'Drag to turn the piece' });
  const name = h('input', { class: 'result-name', maxlength: '40', value: piece.name, 'aria-label': 'Name this piece' });
  const keepName = () => act.rename(piece.id, name.value);

  const commission = s.commissions.find((c) => fits(piece, c));
  const btn = (label: string, cls: string, fn: () => void) => {
    const b = h('button', { class: `btn ${cls}`, type: 'button' }, label);
    b.addEventListener('click', fn);
    return b;
  };

  // ── Choosing what to do with it ──
  const choices = h('div', { class: 'result-acts' },
    commission ? btn(`Deliver to ${commission.customer} · ${money(commission.pay)}`, 'primary', () => {
      keepName();
      act.deliver(commission.id, piece.id);
      act.close();
    }) : null,
    btn('Shelve it', commission ? '' : 'primary', () => {
      if (shelvedCount(s) >= CABINET.slots) {
        warn.textContent = 'Your cabinet is full. Take something down in the Gallery, or keep this one in storage for now.';
        warn.hidden = false;
        return;
      }
      choices.hidden = true;
      pricing.hidden = false;
      price.select();
    }),
    btn('Keep in storage', '', () => {
      keepName();
      act.close();
    }),
    btn('Open the gallery', 'ghost', () => {
      keepName();
      act.openGallery();
      act.close();
    }));
  const warn = h('p', { class: 'note warn', hidden: true });

  // ── Pricing it for the cabinet ──
  let asking = piece.price;
  const price = h('input', { class: 'price', inputmode: 'numeric', maxlength: '4', value: String(asking), 'aria-label': 'Asking price in dollars' });
  const odds = h('p', { class: 'result-odds' });
  const setAsking = (n: number) => {
    asking = Math.max(1, Math.round(n));
    price.value = String(asking);
    odds.textContent = saleOdds(s, piece, asking);
  };
  const step = (dir: 1 | -1) => {
    const unit = asking >= 150 ? 10 : 5;
    setAsking(dir > 0 ? Math.floor(asking / unit) * unit + unit : Math.ceil(asking / unit) * unit - unit);
  };
  price.addEventListener('input', () => setAsking(Number(price.value.replace(/[^0-9]/g, '')) || 1));
  const pricing = h('div', { class: 'result-pricing', hidden: true },
    h('div', { class: 'stepper' },
      h('span', { class: 'lbl' }, 'Asking price'),
      btn('−', 'small step', () => step(-1)),
      h('label', { class: 'price-label' }, '$', price),
      btn('+', 'small step', () => step(1))),
    odds,
    h('div', { class: 'result-acts' },
      btn('Put it on the shelf', 'primary', () => {
        keepName();
        act.shelveAt(piece.id, asking);
        act.close();
      }),
      btn('Back', 'ghost', () => {
        pricing.hidden = true;
        choices.hidden = false;
      })));
  setAsking(asking);

  const card = h('div', { class: 'result-veil', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Out of the annealer' },
    h('div', { class: 'result-card' },
      h('h2', {}, 'Out of the annealer'),
      h('div', { class: 'result-body' },
        canvas,
        h('div', { class: 'result-stack' },
          h('p', { class: 'result-kind' }, PRODUCTS[piece.fp.type].label),
          h('p', { class: 'result-q' }, `Quality ${pct(piece.q)} · worth about ${money(piece.value)}`),
          h('ul', { class: 'result-notes' }, ...notes(piece.fp).map((n) => h('li', { class: n.good ? 'good' : 'bad' }, n.text))),
          h('label', { class: 'result-field' }, h('span', { class: 'lbl' }, 'Name it'), name))),
      choices,
      warn,
      pricing));
  card.addEventListener('keydown', (e) => e.stopPropagation()); // typing a name shouldn't work the glass
  host.append(card);
  const table = piece.fp.shape ? new Turntable(canvas, piece.fp.shape) : null;
  (choices.querySelector('.btn') as HTMLButtonElement | null)?.focus();

  return () => {
    table?.dispose();
    card.remove();
  };
}
