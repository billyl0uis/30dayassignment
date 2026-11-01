import { COLORS, ORDER_TYPES } from '../config';
import type { NightReport } from '../studio/economy';
import { h, inches, money } from './dom';

export function mountResults(root: HTMLElement, rep: NightReport, onDone: () => void) {
  const rows = rep.sales.map((s) => {
    const fp = s.piece;
    const what = `${fp.color ? COLORS[fp.color].label.toLowerCase() + ' ' : ''}${fp.type}`;
    return h('tr', {},
      h('td', {}, h('strong', {}, what), h('small', {}, `${inches(fp.D)} × ${inches(fp.H)} · wall ${fp.type === 'paperweight' ? 'solid' : inches(fp.wall)}`)),
      h('td', { class: `grade g-${s.grade}` }, s.grade),
      h('td', {}, s.order ? `${ORDER_TYPES[s.order.type].label} for ${s.order.client}` : 'Seconds table'),
      h('td', { class: 'mono num' }, money(s.price)));
  });

  const btn = h('button', { class: 'btn primary big', type: 'button', onclick: () => onDone() }, 'Back to the studio');
  root.replaceChildren(h('section', { class: 'results card' },
    h('h2', {}, `Morning, day ${rep.day}`),
    h('p', {}, rep.sales.length
      ? 'The annealer came down overnight. Here’s what sold.'
      : 'The annealer is empty this morning.'),
    rep.sales.length
      ? h('table', { class: 'sales' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Piece'), h('th', {}, 'Grade'), h('th', {}, 'Sold to'), h('th', { class: 'num' }, 'Paid'))),
        h('tbody', {}, ...rows))
      : null,
    h('dl', { class: 'totals' },
      h('dt', {}, 'Earned'), h('dd', { class: 'mono' }, money(rep.earned)),
      h('dt', {}, 'Reputation'), h('dd', { class: 'mono' }, `+${rep.repGained}`),
      h('dt', {}, 'Cullet bucket'), h('dd', { class: 'mono' }, `${rep.cullet} piece${rep.cullet === 1 ? '' : 's'}`)),
    btn));
  btn.focus();
}
