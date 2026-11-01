import { COLOR, COLORS, ECONOMY, ORDER_TYPES, UPGRADES, type OrderSpec } from '../config';
import { COLOR_ORDER } from '../session/input';
import type { Order } from '../sim/scoring';
import type { Studio, UpgradeId } from '../studio/state';
import { h, money, range } from './dom';

export interface StudioActions {
  fireUp(): void;
  buyColor(c: keyof typeof COLORS): void;
  buyUpgrade(u: UpgradeId): void;
  reset(): void;
}

export function mountStudio(root: HTMLElement, s: Studio, act: StudioActions) {
  const won = s.cash >= ECONOMY.goal;

  // ── The day's session ──
  const fireBtn = h('button', { class: 'btn primary big', type: 'button', onclick: () => act.fireUp() }, 'Fire up the shop');
  const book = h('section', { class: 'card book' },
    h('h2', {}, 'Hot shop'),
    h('p', {}, 'The furnace, glory hole and bench, for as long as you like. Clear glass is free from the furnace; color comes from your jars. Close up when you’re done; the annealer comes down overnight and pieces sell in the morning.'),
    fireBtn);

  // ── Orders ──
  const orders = h('section', { class: 'card orders' },
    h('h2', {}, 'Order board'),
    h('div', { class: 'order-list' }, ...s.orders.map(orderCard)),
    s.rep < ECONOMY.repBowlUnlock
      ? h('p', { class: 'note' }, `Bowl orders open up at ${ECONOMY.repBowlUnlock} reputation.`)
      : null);

  // ── Shop ──
  const shop = h('section', { class: 'card shop' },
    h('h2', {}, 'Supply shelf'),
    h('h3', {}, `Color jars · ${COLOR.usesPerJar} uses each`),
    h('div', { class: 'shop-list' }, ...COLOR_ORDER.map((c) => {
      const col = COLORS[c];
      return h('div', { class: 'shop-item' },
        h('span', { class: 'swatch', style: `background:rgb(${col.rgb.join(',')})` }),
        h('span', { class: 'name' }, col.label, h('small', {}, `${s.colors[c]} left`)),
        h('button', { class: 'btn small', type: 'button', disabled: s.cash < col.price, onclick: () => act.buyColor(c) }, money(col.price)));
    })),
    h('h3', {}, 'Tools'),
    h('div', { class: 'shop-list' }, ...(Object.keys(UPGRADES) as UpgradeId[]).map((u) => {
      const up = UPGRADES[u];
      const owned = s.upgrades[u];
      return h('div', { class: 'shop-item' },
        h('span', { class: 'name' }, up.label, h('small', {}, up.blurb)),
        owned
          ? h('span', { class: 'owned' }, 'Owned')
          : h('button', { class: 'btn small', type: 'button', disabled: s.cash < up.price, onclick: () => act.buyUpgrade(u) }, money(up.price)));
    })));

  const reset = h('button', { class: 'btn link', type: 'button' }, 'Start over');
  reset.addEventListener('click', () => {
    if (confirm('Wipe your studio and start again from day 1 with $100?')) act.reset();
  });

  root.replaceChildren(h('div', { class: 'studio' },
    won ? h('div', { class: 'banner' }, h('strong', {}, 'You did it.'),
      ` ${money(ECONOMY.goal)} saved — enough to build your own furnace. Keep blowing if you like.`) : null,
    h('div', { class: 'studio-grid' }, book, orders, shop, howTo()),
    h('footer', { class: 'foot' }, reset)));
}

function orderCard(o: Order) {
  const spec: OrderSpec = ORDER_TYPES[o.type];
  const lines: string[] = [];
  if (spec.D) lines.push(`Diameter ${range(spec.D)}`);
  if (spec.H) lines.push(`Height ${range(spec.H)}`);
  if (spec.wall) lines.push(`Wall ${range(spec.wall)}`);
  if (spec.HD) lines.push(`Round: height ÷ diameter ${range(spec.HD, '')}`);
  return h('article', { class: 'order' },
    h('div', { class: 'order-head' },
      h('span', { class: 'order-type' }, spec.label),
      h('span', { class: 'order-pay mono' }, `up to ${money(spec.pay + (o.color ? ECONOMY.colorBonus : 0))}`)),
    h('p', { class: 'client' }, `For ${o.client}`),
    h('ul', { class: 'spec' }, ...lines.map((l) => h('li', {}, l))),
    o.color
      ? h('p', { class: 'color-ask' },
        h('span', { class: 'swatch', style: `background:rgb(${COLORS[o.color].rgb.join(',')})` }),
        `${COLORS[o.color].label} wanted (+${money(ECONOMY.colorBonus)})`)
      : null);
}

function howTo() {
  const item = (title: string, steps: string) => h('details', {}, h('summary', {}, title), h('p', {}, steps));
  return h('section', { class: 'card how' },
    h('h2', {}, 'How to make each piece'),
    item('Paperweight',
      'Gather 2–3 times, marvering between gathers so you aren’t regathering above 1900°F → block it round (height about equal to diameter) → jack a line to ~60% → knock off into the annealer.'),
    item('Tumbler',
      'Gather → marver → blow to about a 0.15" wall → marver to lengthen → jack a line → reheat → transfer to the punty → reheat → open the lip to 20–50% → knock off.'),
    item('Bowl',
      'Same as a tumbler with more glass, opened past 50%. Reheat between opens so the jacks keep moving.'),
    item('Always',
      'The pipe rotates on its own. Stop it (Space) and hot glass droops; start it again while the glass is soft and it comes back on center. Reheat before it drops under 1150°F; under 850°F the glory hole will crack it.'),
    h('p', { class: 'note' }, 'Temperatures and timings are simplified for play.'),
    h('h3', {}, 'Keys'),
    h('p', { class: 'keys mono' },
      'Hold: F gather · G glory hole · M marver · K block · B blow · J jacks · Space start/stop rotating', h('br'),
      'Tap: C color · P transfer · X knock off · N new pipe · Q dump · 1–5 pick a jar'));
}
