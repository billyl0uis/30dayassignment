import { COLOR, COLORS, ECONOMY, ORDER_TYPES, UPGRADES, type OrderSpec } from '../config';
import { COLOR_ORDER } from '../session/input';
import type { Order } from '../sim/scoring';
import { sessionCost } from '../studio/economy';
import type { Studio, UpgradeId } from '../studio/state';
import { h, money, range } from './dom';

export interface StudioActions {
  book(assistant: boolean): void;
  teachClass(): void;
  buyColor(c: keyof typeof COLORS): void;
  buyUpgrade(u: UpgradeId): void;
  reset(): void;
}

let assistantChecked = false; // remembered between visits to the studio in this tab

export function mountStudio(root: HTMLElement, s: Studio, act: StudioActions) {
  const won = s.cash >= ECONOMY.goal;

  // ── Book ──
  const assist = h('input', { type: 'checkbox', id: 'assist', checked: assistantChecked });
  const cost = h('span', { class: 'mono' });
  const bookBtn = h('button', { class: 'btn primary big', type: 'button' }, 'Book the hot shop');
  const broke = h('p', { class: 'note warn', hidden: true }, `Not enough for rent. Teach a beginner class for ${money(ECONOMY.classPay)}.`);
  const sync = () => {
    assistantChecked = assist.checked;
    const c = sessionCost(assist.checked);
    cost.textContent = money(c);
    bookBtn.disabled = s.cash < c;
    broke.hidden = s.cash >= c;
  };
  assist.addEventListener('change', sync);
  bookBtn.addEventListener('click', () => act.book(assist.checked));
  sync();

  const book = h('section', { class: 'card book' },
    h('h2', {}, 'Hot shop time'),
    h('p', {}, `A 3-hour block on the furnace, glory hole and bench. Rent ${money(ECONOMY.rent)}. Pieces go in the annealer and sell in the morning.`),
    h('label', { class: 'check', for: 'assist' }, assist,
      h('span', {}, `Bring an assistant (+${money(ECONOMY.assistantFee)}) — keeps the pipe turning when you aren't on a tool`)),
    h('div', { class: 'book-row' }, bookBtn, h('span', { class: 'cost' }, 'Total ', cost)),
    broke,
    h('div', { class: 'teach' },
      h('button', { class: 'btn ghost', type: 'button', onclick: () => act.teachClass() }, `Teach a beginner class (+${money(ECONOMY.classPay)})`),
      h('span', { class: 'note' }, 'Uses up the day.')));

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
      'Keep it turning. Anything held counts as turning — but the moment you let go of every tool, hot glass droops. If it droops, keep it soft and hold Turn (or marver or block) to bring it back on center. Reheat before it drops under 1150°F; under 850°F the glory hole will crack it.'),
    h('p', { class: 'note' }, 'Temperatures and timings are simplified for play.'),
    h('h3', {}, 'Keys'),
    h('p', { class: 'keys mono' },
      'Hold: F gather · G glory hole · M marver · K block · B blow · J jacks · Space turn', h('br'),
      'Tap: C color · P transfer · X knock off · N new pipe · Q dump · 1–5 pick a jar'));
}
