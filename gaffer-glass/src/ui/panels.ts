import { CABINET, COLOR, COLORS, PRODUCTS, UPGRADES } from '../config';
import { COLOR_ORDER } from '../session/input';
import { fits, kindLabel, pct, upgradeBlock } from '../studio/economy';
import { RECIPES } from '../studio/goals';
import type { Commission, StoredPiece, Studio, UpgradeId } from '../studio/state';
import { h, money } from './dom';
import type { PanelId } from './header';

export interface PanelActions {
  buyColor(c: keyof typeof COLORS): void;
  buyUpgrade(u: UpgradeId): void;
  deliver(commissionId: string, pieceId: number): void;
  pass(commissionId: string): void;
  setPrice(id: number, price: number): void;
  shelve(id: number): void;
  unshelve(id: number): void;
  scrap(id: number): void;
  reset(): void;
  close(): void;
}

const TABS: Record<PanelId, { title: string; tabs: string[] }> = {
  shop: { title: 'Shop', tabs: ['Supplies', 'Commissions'] },
  gallery: { title: 'Gallery', tabs: ['Storage', 'Cabinet'] },
  help: { title: 'How to play', tabs: [] },
};

/** A drawer over the bench. The bench keeps running behind it, like a real shop. */
export class Panels {
  private open: PanelId | null = null;
  private tab = 0;
  readonly el = h('aside', { class: 'panel', hidden: true, 'aria-modal': 'false', role: 'dialog' });

  constructor(private act: PanelActions) {
    this.el.addEventListener('keydown', (e) => e.stopPropagation()); // typing a price shouldn't blow the piece
  }

  get current() {
    return this.open;
  }

  show(p: PanelId, s: Studio, tab = 0) {
    this.open = p;
    this.tab = tab;
    this.el.hidden = false;
    this.render(s, true);
  }

  hide() {
    this.open = null;
    this.el.hidden = true;
  }

  /** Re-render for a studio change; skipped mid-typing so a sale doesn't eat a price you're entering. */
  render(s: Studio, force = false) {
    if (!this.open) return;
    if (!force && this.el.contains(document.activeElement) && document.activeElement instanceof HTMLInputElement) return;
    const def = TABS[this.open];
    const tabs = def.tabs.length
      ? h('div', { class: 'tabs', role: 'tablist' }, ...def.tabs.map((t, i) => {
        const b = h('button', { class: `tab${i === this.tab ? ' on' : ''}`, type: 'button', role: 'tab', 'aria-selected': String(i === this.tab) }, t,
          this.open === 'shop' && i === 1 ? h('span', { class: 'badge' }, s.commissions.length) : null);
        b.addEventListener('click', () => {
          this.tab = i;
          this.render(s, true);
        });
        return b;
      }))
      : null;
    const close = h('button', { class: 'btn small', type: 'button' }, 'Close');
    close.addEventListener('click', () => this.act.close());
    this.el.replaceChildren(
      h('header', { class: 'panel-head' }, h('h2', {}, def.title), close),
      ...(tabs ? [tabs] : []),
      h('div', { class: 'panel-body' }, this.body(s)));
    this.tick(Date.now());
  }

  /** Count down annealer timers without a full re-render. */
  tick(now: number) {
    for (const el of this.el.querySelectorAll<HTMLElement>('[data-ready]')) {
      const left = Math.max(0, Math.ceil((Number(el.dataset.ready) - now) / 1000));
      el.textContent = left ? `out in ${left}s` : 'coming out…';
    }
  }

  private body(s: Studio): Node {
    if (this.open === 'shop') return this.tab === 0 ? this.supplies(s) : this.commissions(s);
    if (this.open === 'gallery') return this.tab === 0 ? this.storage(s) : this.cabinet(s);
    return this.help();
  }

  // ── Shop ──

  private supplies(s: Studio) {
    const a = this.act;
    return h('div', {},
      h('p', { class: 'note' }, 'Clear glass from the furnace is free. Color and tools cost money; tools unlock new work.'),
      h('h3', {}, `Color jars · ${COLOR.usesPerJar} uses each`),
      h('div', { class: 'shop-list' }, ...COLOR_ORDER.map((c) => {
        const col = COLORS[c];
        return h('div', { class: 'shop-item' },
          h('span', { class: 'swatch', style: `background:rgb(${col.rgb.join(',')})` }),
          h('span', { class: 'name' }, col.label, h('small', {}, `${s.colors[c]} left`)),
          h('button', { class: 'btn small', type: 'button', disabled: s.cash < col.price, onclick: () => a.buyColor(c) }, money(col.price)));
      })),
      h('h3', {}, 'Tools'),
      h('div', { class: 'shop-list' }, ...(Object.keys(UPGRADES) as UpgradeId[]).map((u) => {
        const up = UPGRADES[u];
        const block = upgradeBlock(s, u);
        const owned = s.upgrades[u];
        const locked = block && !owned && !block.startsWith('You need');
        return h('div', { class: 'shop-item' },
          h('span', { class: 'name' }, up.label, h('small', {}, up.blurb), locked ? h('small', { class: 'req' }, block) : null),
          owned
            ? h('span', { class: 'owned' }, 'Owned')
            : h('button', { class: 'btn small', type: 'button', disabled: !!block, onclick: () => a.buyUpgrade(u) }, money(up.price)));
      })));
  }

  private commissions(s: Studio) {
    return h('div', {},
      h('p', { class: 'note' }, 'Dependable pay. Make a piece that fits and deliver it from storage.'),
      h('div', { class: 'order-list' }, ...s.commissions.map((c) => this.commission(s, c))));
  }

  private commission(s: Studio, c: Commission) {
    const ready = s.pieces.filter((p) => fits(p, c)).sort((x, y) => y.q - x.q);
    const deliver = ready.length
      ? h('button', { class: 'btn small primary', type: 'button', onclick: () => this.act.deliver(c.id, ready[0].id) }, `Deliver ${ready[0].name}`)
      : h('p', { class: 'note' }, 'Nothing in storage fits yet.');
    const pass = h('button', { class: 'btn small ghost', type: 'button', title: 'Turn it down; another customer takes its place' }, 'Pass');
    pass.addEventListener('click', () => this.act.pass(c.id));
    return h('article', { class: 'order' },
      h('div', { class: 'order-head' },
        h('span', { class: 'order-type' }, `${c.customer} wants ${article(kindLabel(c.type))}`),
        h('span', { class: 'order-pay mono' }, money(c.pay))),
      h('p', { class: 'client' }, `Quality ${pct(c.minQ)} or better · +${c.rep} reputation`),
      c.color
        ? h('p', { class: 'color-ask' },
          h('span', { class: 'swatch', style: `background:rgb(${COLORS[c.color].rgb.join(',')})` }), `In ${COLORS[c.color].label.toLowerCase()}`)
        : null,
      h('div', { class: 'order-actions' }, deliver, pass));
  }

  // ── Gallery ──

  private storage(s: Studio) {
    const waiting = s.pieces.filter((p) => !p.shelved);
    const full = s.pieces.filter((p) => p.shelved).length >= CABINET.slots;
    return h('div', {},
      s.annealer.length
        ? h('section', { class: 'annealer' },
          h('h3', {}, 'In the annealer'),
          ...s.annealer.map((a) => h('div', { class: 'piece-row' },
            h('span', { class: 'name' }, `${a.fp.color ? COLORS[a.fp.color].label + ' ' : ''}${kindLabel(a.fp.type).toLowerCase()}`),
            h('small', { class: 'mono', 'data-ready': a.ready }))))
        : null,
      h('h3', {}, 'Storage'),
      waiting.length
        ? h('div', { class: 'piece-list' }, ...waiting.map((p) => this.piece(p, [
          h('button', { class: 'btn small primary', type: 'button', disabled: full, title: full ? 'The cabinet is full' : '', onclick: () => this.act.shelve(p.id) }, 'Shelve'),
          h('button', { class: 'btn small ghost', type: 'button', onclick: () => this.act.scrap(p.id) }, 'Cullet'),
        ])))
        : h('p', { class: 'note' }, 'Nothing in storage. Knock a piece off into the annealer and it lands here.'));
  }

  private cabinet(s: Studio) {
    const shelved = s.pieces.filter((p) => p.shelved);
    return h('div', {},
      h('p', { class: 'note' }, `${shelved.length} of ${CABINET.slots} shelves. Visitors drop by and buy when the price feels right; price near what a piece is worth.`),
      shelved.length
        ? h('div', { class: 'piece-list' }, ...shelved.map((p) => this.piece(p, [
          h('button', { class: 'btn small', type: 'button', onclick: () => this.act.unshelve(p.id) }, 'Take down'),
        ])))
        : h('p', { class: 'note' }, 'The cabinet is empty. Shelve pieces from storage.'),
      s.log.length
        ? h('section', { class: 'log' }, h('h3', {}, 'Studio log'), h('ul', {}, ...s.log.slice(0, 8).map((l) => h('li', {}, l))))
        : null);
  }

  private piece(p: StoredPiece, buttons: Node[]) {
    const price = h('input', { type: 'number', min: '1', step: '1', value: String(p.price), 'aria-label': `Price for ${p.name}`, class: 'price' });
    price.addEventListener('change', () => this.act.setPrice(p.id, Number(price.value) || p.value));
    return h('article', { class: 'piece-card' },
      h('div', { class: 'piece-top' },
        h('span', { class: 'swatch', style: `background:rgb(${(p.fp.color ? COLORS[p.fp.color].rgb : [205, 228, 232]).join(',')})` }),
        h('strong', {}, p.name)),
      h('p', { class: 'client' }, `Quality ${pct(p.q)} · worth ${money(p.value)} · ${p.fp.D.toFixed(2)}" × ${p.fp.H.toFixed(2)}"`),
      h('div', { class: 'piece-actions' }, h('label', { class: 'price-label' }, '$', price), ...buttons));
  }

  // ── Help ──

  private help() {
    const recipes = (Object.keys(PRODUCTS) as (keyof typeof PRODUCTS)[]).map((t) =>
      h('details', {}, h('summary', {}, PRODUCTS[t].label),
        h('ol', {}, ...RECIPES[t].map((st) => h('li', {}, st.label)))));
    const reset = h('button', { class: 'btn link', type: 'button' }, 'Start over');
    reset.addEventListener('click', () => {
      if (confirm('Wipe your studio and start again with $20?')) this.act.reset();
    });
    return h('div', { class: 'how' },
      h('p', {}, 'Pick what you’re making in the top bar. The panel on the left walks you through it. Knock the piece off into the annealer; it comes out to the Gallery with its quality and worth. Shelve it in your cabinet for visitors, or deliver it to a commission.'),
      ...recipes,
      h('details', {}, h('summary', {}, 'Always'),
        h('p', {}, 'The pipe rotates on its own, which keeps a droop from getting worse but doesn’t fix it. To bring it back, stop turning (Space) when the droop is on top, let gravity pull it through center, then start turning again; or marver or block it. A pipe carries about 24 in³ at most. Tip the pipe down (↓) and soft glass runs long; tip it up (↑) and it slumps short and fat. Reheat before it drops under 1150°F; under 850°F the glory hole will crack it. More blow pressure is faster but tears at a thicker wall.')),
      h('p', { class: 'note' }, 'Temperatures and timings are simplified for play.'),
      h('h3', {}, 'Keys'),
      h('p', { class: 'keys mono' },
        'Hold: F gather · G glory hole · M marver · K block · B blow · J jacks', h('br'),
        'Space start/stop rotating · ↑/↓ tip the pipe · Tap: C color · P transfer · X knock off · N new pipe · Q dump · 1–5 pick a jar · Drag to look around'),
      h('footer', { class: 'foot' }, reset));
  }
}

const article = (w: string) => `${/^[aeiou]/i.test(w) ? 'an' : 'a'} ${w.toLowerCase()}`;
