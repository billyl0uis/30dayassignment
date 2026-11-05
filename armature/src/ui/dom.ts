type Attrs = Record<string, string | number | boolean | ((e: any) => void) | undefined>;

/** Tiny element builder: h('div', {class: 'x', onclick: fn}, child, 'text') */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...kids: (Node | string | null | undefined | false)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else if (k in el && typeof v !== 'string') (el as any)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

/** Number field that commits on change (so re-rendering never steals focus mid-typing). */
export function numField(label: string, value: number, commit: (v: number) => void, opts: { step?: number; min?: number; max?: number; digits?: number } = {}) {
  const input = h('input', { type: 'number', step: String(opts.step ?? 1), value: Number(value.toFixed(opts.digits ?? 1)).toString() });
  if (opts.min !== undefined) input.min = String(opts.min);
  if (opts.max !== undefined) input.max = String(opts.max);
  input.addEventListener('change', () => {
    let v = parseFloat(input.value);
    if (!isFinite(v)) return;
    if (opts.min !== undefined) v = Math.max(opts.min, v);
    if (opts.max !== undefined) v = Math.min(opts.max, v);
    commit(v);
  });
  return h('label', { class: 'f' }, label, input);
}

export function selectField<T extends string>(label: string, value: T, options: [T, string][], commit: (v: T) => void) {
  const sel = h('select', { onchange: () => commit(sel.value as T) }, ...options.map(([v, t]) => h('option', { value: v, selected: v === value }, t)));
  return label ? h('label', { class: 'f' }, label, sel) : sel;
}

export function checkField(label: string, value: boolean, commit: (v: boolean) => void) {
  const c = h('input', { type: 'checkbox', checked: value, onchange: () => commit(c.checked) });
  return h('label', { class: 'chk' }, c, label);
}

export const STATUS_GLYPH = { OK: '✓', NOTE: 'i', WARN: '!', BAD: '×' } as const;
export function statusDot(s: keyof typeof STATUS_GLYPH) {
  return h('span', { class: `st ${s}`, title: s, 'aria-label': s }, STATUS_GLYPH[s]);
}
