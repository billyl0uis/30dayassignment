import { ECONOMY, PRODUCTS } from '../config';
import type { PieceType } from '../sim/piece';
import { unlockedKinds } from '../studio/commissions';
import type { Studio } from '../studio/state';
import { h, money } from './dom';

export type PanelId = 'shop' | 'gallery' | 'help';

export interface HeaderActions {
  setMaking(t: PieceType): void;
  open(p: PanelId): void;
  togglePause(): void;
  paused: boolean;
}

const SVG = 'http://www.w3.org/2000/svg';

/** A five-point star for reputation, drawn rather than typed. */
function star() {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'star');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z');
  svg.append(path);
  return svg;
}

export function renderHeader(el: HTMLElement, s: Studio, act: HeaderActions) {
  const progress = Math.min(1, s.cash / ECONOMY.goal);
  const kinds = unlockedKinds(s);
  const making = h('select', { class: 'making', 'aria-label': 'What you are making' },
    ...(Object.keys(PRODUCTS) as PieceType[]).map((t) => {
      const open = kinds.includes(t);
      return h('option', { value: t, selected: s.making === t, disabled: !open }, open ? PRODUCTS[t].label : `${PRODUCTS[t].label} (locked)`);
    }));
  making.addEventListener('change', () => act.setMaking(making.value as PieceType));
  const waiting = s.annealer.length + s.pieces.filter((p) => !p.shelved).length;

  el.replaceChildren(
    h('div', { class: 'brand', 'aria-label': 'Gaffer Glass' },
      h('span', { class: 'mark' }),
      h('span', { class: 'brand-name' }, 'Gaffer'),
      h('span', { class: 'brand-sub' }, 'Glass')),
    h('dl', { class: 'stats' },
      h('div', {}, h('dt', { class: 'sr' }, 'Cash'), h('dd', {}, money(s.cash))),
      h('div', { title: 'Reputation' }, h('dt', { class: 'sr' }, 'Reputation'), star(), h('dd', {}, Math.floor(s.rep)))),
    making,
    h('div', { class: 'goal', title: `Saving ${money(ECONOMY.goal)} toward your own furnace` },
      h('div', { class: 'goal-label' }, h('span', {}, 'Own furnace'), h('span', { class: 'mono' }, `${money(s.cash)} / ${money(ECONOMY.goal)}`)),
      h('div', { class: 'goal-bar' }, h('div', { class: 'goal-fill', style: `width:${progress * 100}%` }))),
    h('nav', { class: 'top-actions' },
      h('button', { class: `btn small${act.paused ? ' primary' : ''}`, type: 'button', title: 'Pause (Esc)', onclick: () => act.togglePause() }, act.paused ? 'Resume' : 'Pause'),
      h('button', { class: 'btn small', type: 'button', onclick: () => act.open('gallery') },
        'Gallery', waiting ? h('span', { class: 'badge' }, waiting) : null),
      h('button', { class: 'btn small primary', type: 'button', onclick: () => act.open('shop') }, 'Shop'),
      h('button', { class: 'btn small', type: 'button', onclick: () => act.open('help') }, 'How to')),
  );
}
