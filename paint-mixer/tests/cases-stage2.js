// Stage 2: library loading, search, same-pigment helper, palettes, persistence.

import { flattenLibrary, searchPaints, samePigmentPaints, pigmentKey } from '../src/library.js';
import * as store from '../src/store.js';
import { PRESETS } from '../src/presets.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/** In-memory stand-in for localStorage; `fail` makes every call throw. */
function memoryStorage({ fail = false } = {}) {
  const m = new Map();
  const guard = () => {
    if (fail) throw new Error('SecurityError: storage blocked');
  };
  return {
    getItem: (k) => (guard(), m.has(k) ? m.get(k) : null),
    setItem: (k, v) => (guard(), m.set(k, String(v))),
    removeItem: (k) => (guard(), m.delete(k)),
  };
}

export function makeStage2Cases(libraryJson) {
  const flat = flattenLibrary(libraryJson);
  const find = (brand, name) => {
    const p = flat.find((x) => x.brand === brand && x.name === name);
    assert(p, `${brand} ${name} not in library`);
    return p;
  };

  return [
    // ---------------- Library ----------------
    {
      group: 'Library',
      name: 'Loads all 11 lines / 277 paints; only Golden has colors',
      run() {
        const lines = new Set(flat.map((p) => `${p.brand}|${p.line}`));
        assert(lines.size === 11, `${lines.size} lines`);
        assert(flat.length === 277, `${flat.length} paints`);
        const withColor = flat.filter((p) => p.lab);
        assert(withColor.length === 32 && withColor.every((p) => p.brand === 'Golden' && p.status === 'manufacturer_lab'), 'unexpected colored paints');
        assert(new Set(flat.map((p) => p.id)).size === flat.length, 'ids not unique');
        return { detail: `${lines.size} lines, ${flat.length} paints, ${withColor.length} with manufacturer Lab` };
      },
    },
    {
      group: 'Library',
      name: 'needs_swatch paints have no color (nothing invented)',
      run() {
        const bad = flat.filter((p) => p.status === 'needs_swatch' && p.lab !== null);
        assert(bad.length === 0, `${bad.length} needs_swatch paints have a color`);
      },
    },
    {
      group: 'Library',
      name: 'Notes from the JSON are kept (e.g. "verify on tube")',
      run() {
        const noted = flat.filter((p) => p.note);
        assert(noted.length === 4, `${noted.length} notes`);
        assert(noted.some((p) => /verify on tube/.test(p.note)), 'missing verify-on-tube note');
      },
    },
    {
      group: 'Library',
      name: 'Search by pigment code, brand, line and multi-word name',
      run() {
        const pb29 = searchPaints(flat, 'PB29');
        assert(pb29.length > 0 && pb29.every((p) => p.pigments.some((x) => x.toLowerCase().includes('pb29'))), 'PB29 search');
        const golden = searchPaints(flat, 'golden');
        assert(golden.length === 32 && golden.every((p) => p.brand === 'Golden'), `golden: ${golden.length}`);
        const winton = searchPaints(flat, 'winton');
        assert(winton.length === 23, `winton: ${winton.length}`);
        const crl = searchPaints(flat, 'cadmium red light');
        assert(crl.length > 0 && crl.every((p) => /cadmium red light/i.test(p.name)), 'multi-word name');
        const both = searchPaints(flat, 'blick pbk9');
        assert(both.every((p) => p.brand === 'Blick' && p.pigments.includes('PBk9')), 'brand + pigment');
        const usable = searchPaints(flat, 'red', { usableOnly: true });
        assert(usable.every((p) => p.lab), 'usableOnly filter');
        return { detail: `PB29: ${pb29.length}, Golden: ${golden.length}, "blick pbk9": ${both.length}` };
      },
    },

    // ---------------- Same pigment ----------------
    {
      group: 'Same pigment',
      name: 'Matches on pigments, never on name',
      run() {
        const cyl = find('Golden', 'Cadmium Yellow Light'); // PY35
        const same = samePigmentPaints(cyl, flat);
        assert(same.length > 0, 'no PY35 matches');
        assert(same.every((p) => pigmentKey(p.pigments) === pigmentKey(cyl.pigments)), 'mismatched pigments');
        assert(!same.some((p) => p.id === cyl.id), 'should not list itself');
        // A "Hue" paint with different pigments must not match the real thing.
        const hue = flat.find((p) => /cadmium red.*hue/i.test(p.name) && !p.pigments.includes('PR108'));
        const real = find('Golden', 'Cadmium Red Medium');
        if (hue) assert(!samePigmentPaints(real, flat).some((p) => p.id === hue.id), `${hue.name} matched by name`);
        return { detail: `${cyl.name} (PY35) ↔ ${same.length} paints${hue ? `; "${hue.brand} ${hue.name}" (${hue.pigments.join(', ')}) correctly excluded` : ''}` };
      },
    },
    {
      group: 'Same pigment',
      name: 'Pigment order does not matter; unknown pigments match nothing',
      run() {
        assert(pigmentKey(['PY175', 'PG7', 'PW6']) === pigmentKey(['PW6', 'PY175', 'PG7']), 'order should not matter');
        assert(pigmentKey(['PB29']) !== pigmentKey(['PB29', 'PW6']), 'subset must not match');
        assert(pigmentKey([]) === '', 'empty list should give empty key');
        assert(samePigmentPaints({ id: 'x', pigments: [] }, flat).length === 0, 'unknown pigments matched');
      },
    },

    // ---------------- Palettes ----------------
    {
      group: 'Palettes',
      name: 'Create, toggle, rename, delete; 30-paint limit',
      run() {
        const s = store.emptyState();
        const p = store.createPalette(s, 'Studio');
        assert(s.activePaletteId === p.id, 'new palette should be active');
        store.togglePaint(s, p.id, flat[0].id);
        assert(p.paintIds.length === 1, 'add');
        store.togglePaint(s, p.id, flat[0].id);
        assert(p.paintIds.length === 0, 'remove');
        for (let i = 0; i < 30; i++) store.togglePaint(s, p.id, flat[i].id);
        let threw = false;
        try { store.togglePaint(s, p.id, flat[30].id); } catch { threw = true; }
        assert(threw && p.paintIds.length === 30, '31st paint should be refused');
        store.renamePalette(s, p.id, '  Plein air ');
        assert(p.name === 'Plein air', 'rename');
        const q = store.createPalette(s, '');
        assert(q.name === 'Palette 2', `default name ${q.name}`);
        store.deletePalette(s, q.id);
        assert(s.palettes.length === 1 && s.activePaletteId === p.id, 'delete should fall back to remaining palette');
      },
    },
    {
      group: 'Palettes',
      name: 'Presets create empty roles the user fills with their own paints',
      run() {
        const s = store.emptyState();
        const z = store.createPalette(s, null, 'zorn');
        assert(z.name === 'Zorn' && z.roles.length === 4 && z.paintIds.length === 0, 'zorn shape');
        assert(store.createPalette(s, null, 'splitPrimary').roles.length === 7, 'split primary has 7 roles');
        assert(store.createPalette(s, null, 'primaryTriad').roles.length === 4, 'triad has 4 roles');
        // Each role's starting search finds something in at least one brand.
        for (const [key, preset] of Object.entries(PRESETS)) {
          for (const r of preset.roles) assert(searchPaints(flat, r.query).length > 0, `${key} "${r.label}" query "${r.query}" finds nothing`);
        }
        const ochre = searchPaints(flat, 'ochre').find((p) => p.brand === 'Gamblin');
        store.fillRole(s, z.id, 0, ochre.id);
        assert(z.roles[0].paintId === ochre.id && z.paintIds.includes(ochre.id), 'fillRole should add to palette');
        store.togglePaint(s, z.id, ochre.id);
        assert(z.roles[0].paintId === null, 'removing the paint should empty its role');
      },
    },

    // ---------------- Custom paints & settings ----------------
    {
      group: 'Custom paints',
      name: 'Add by name + pigments + hex; bad hex rejected; no hex = needs swatch',
      run() {
        const s = store.emptyState();
        const a = store.addCustomPaint(s, { name: 'Mystery Teal', pigments: 'pb15:3, pg7 pw6', hex: '2A7F7A' });
        assert(a.status === 'user_hex' && a.hex === '#2a7f7a' && a.lab, 'hex paint');
        assert(a.pigments.join(' ') === 'PB15:3 PG7 PW6', `pigments parsed as ${a.pigments}`);
        assert(store.parsePigments('pbk9').join() === 'PBk9', 'PBk9 casing');
        const b = store.addCustomPaint(s, { name: 'Tube with no label' });
        assert(b.status === 'needs_swatch' && b.lab === null, 'no hex should need a swatch');
        let threw = 0;
        try { store.addCustomPaint(s, { name: 'X', hex: '#12345' }); } catch { threw++; }
        try { store.addCustomPaint(s, { name: '  ' }); } catch { threw++; }
        assert(threw === 2, 'bad hex / empty name should throw');
        const p = store.createPalette(s, 'P');
        store.togglePaint(s, p.id, a.id);
        store.removeCustomPaint(s, a.id);
        assert(!p.paintIds.includes(a.id) && s.customPaints.length === 1, 'removing custom paint cleans palettes');
      },
    },
    {
      group: 'Custom paints',
      name: 'Tinting strength is editable, clamped, and applied by resolvePaints',
      run() {
        const s = store.emptyState();
        const id = flat[0].id;
        assert(store.setTintingStrength(s, id, 2.5) === 2.5, 'set');
        assert(store.setTintingStrength(s, id, 99) === store.TS_MAX, 'clamp high');
        assert(store.setTintingStrength(s, id, 0) === store.TS_MIN, 'clamp low');
        store.setTintingStrength(s, id, 1.8);
        const resolved = store.resolvePaints(flat, s);
        assert(resolved.find((p) => p.id === id).tintingStrength === 1.8, 'not applied');
        assert(flat[0].tintingStrength === 1, 'library entry must not be mutated');
      },
    },
    {
      group: 'Custom paints',
      name: 'A measured color overrides manufacturer data',
      run() {
        const s = store.emptyState();
        const g = find('Golden', 'Ultramarine Blue');
        s.paintSettings[g.id] = { color: { status: 'measured', lab: [22, 15, -40] } };
        const r = store.resolvePaints(flat, s).find((p) => p.id === g.id);
        assert(r.status === 'measured' && r.lab[2] === -40 && r.colorNote === null, 'measured should win');
      },
    },

    // ---------------- Persistence ----------------
    {
      group: 'Persistence',
      name: 'Save → load round trip through storage',
      run() {
        const mem = memoryStorage();
        const s = store.emptyState();
        const p = store.createPalette(s, 'Round trip');
        store.togglePaint(s, p.id, flat[5].id);
        store.addCustomPaint(s, { name: 'C', hex: '#abcdef' });
        assert(store.saveState(s, mem).ok, 'save failed');
        const { state, error } = store.loadState(mem);
        assert(!error && state.palettes[0].name === 'Round trip' && state.palettes[0].paintIds[0] === flat[5].id && state.customPaints[0].hex === '#abcdef', 'round trip mismatch');
      },
    },
    {
      group: 'Persistence',
      name: 'Blocked or corrupt storage never crashes',
      run() {
        const blocked = memoryStorage({ fail: true });
        const l = store.loadState(blocked);
        assert(l.state.palettes.length === 0 && l.error, 'blocked load should return empty state + message');
        const sv = store.saveState(store.emptyState(), blocked);
        assert(!sv.ok && sv.error, 'blocked save should report, not throw');
        assert(store.saveState(store.emptyState(), null).ok === false, 'missing storage');
        const mem = memoryStorage();
        mem.setItem(store.STORAGE_KEY, '{not json');
        assert(store.loadState(mem).error, 'corrupt JSON should report');
      },
    },
    {
      group: 'Persistence',
      name: 'Export → import round trip; foreign or broken files rejected',
      run() {
        const s = store.emptyState();
        const p = store.createPalette(s, 'Export me', 'zorn');
        store.setTintingStrength(s, flat[3].id, 2);
        const back = store.importState(store.exportState(s));
        assert(back.palettes[0].name === 'Export me' && back.palettes[0].roles.length === 4 && back.paintSettings[flat[3].id].tintingStrength === 2, 'round trip');
        assert(back.activePaletteId === p.id, 'active palette kept');
        const bad = ['not json', '{"palettes":[]}', JSON.stringify({ app: 'color-mixer', version: 99 })];
        for (const b of bad) {
          let threw = false;
          try { store.importState(b); } catch { threw = true; }
          assert(threw, `should reject ${b.slice(0, 30)}`);
        }
        // Malformed entries are dropped, not trusted.
        const messy = store.importState(JSON.stringify({ app: 'color-mixer', version: 1, palettes: [{ id: 'a', name: 'ok', paintIds: ['x', 'x', 3] }, { name: 'no id' }], paintSettings: { y: { tintingStrength: 'big' } } }));
        assert(messy.palettes.length === 1 && messy.palettes[0].paintIds.join() === 'x' && !messy.paintSettings.y, 'messy import not cleaned');
      },
    },
  ];
}
