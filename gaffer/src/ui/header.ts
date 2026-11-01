import { ECONOMY } from '../config';
import type { Studio } from '../studio/state';
import { h, money } from './dom';

export function renderHeader(el: HTMLElement, s: Studio) {
  const progress = Math.min(1, s.cash / ECONOMY.goal);
  el.replaceChildren(
    h('div', { class: 'brand' }, h('span', { class: 'mark' }), 'Gaffer'),
    h('dl', { class: 'stats' },
      h('div', {}, h('dt', {}, 'Day'), h('dd', {}, s.day)),
      h('div', {}, h('dt', {}, 'Cash'), h('dd', {}, money(s.cash))),
      h('div', {}, h('dt', {}, 'Reputation'), h('dd', {}, s.rep))),
    h('div', { class: 'goal', title: `Saving ${money(ECONOMY.goal)} toward your own furnace` },
      h('div', { class: 'goal-label' }, h('span', {}, 'Own furnace'), h('span', { class: 'mono' }, `${money(s.cash)} / ${money(ECONOMY.goal)}`)),
      h('div', { class: 'goal-bar' }, h('div', { class: 'goal-fill', style: `width:${progress * 100}%` }))),
  );
}
