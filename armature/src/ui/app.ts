import { GLASS, METALS, METAL_IDS, type MetalId } from '../config/materials';
import {
  addNode, addRod, bendRod, cageById, deleteNode, deletePart, deleteRod, generateCage, nodeById, partById, projectToWall, rodById, rodLength, uid,
} from '../model/frame';
import { clone, exportJSON, importJSON, newJoin, newPart } from '../model/io';
import { emptySculpture, type GlassKind, type GlassPart, type Join, type JoinType, type Sculpture, type Settings, type Vec3 } from '../model/types';
import { applyBlow, cageAround, startBlow, type BlowSession, MIN_WALL_MM } from '../physics/blow';
import { analyze, boltEdgeDistance, joinMetal, type Analysis, type Status } from '../physics/checks';
import { partThickness } from '../physics/glass';
import { formatWeight } from '../physics/mass';
import { PRESETS } from '../presets';
import { View, type Highlight } from '../scene/view';
import { checkField, h, numField, selectField, statusDot } from './dom';
import { SETTING_INFO, truthHTML } from './truth';

type Tool = 'select' | 'node' | 'rod' | 'bend' | 'panel' | 'anchor';
type Sel = { type: 'node' | 'rod' | 'part' | 'panel'; id: string; joinId?: string } | null;

const TOOL_HINT: Record<Tool, string> = {
  select: '<b>Select</b> — click to select, drag nodes and glass to move them (hold <b>Shift</b> to move up/down). Drag empty space to orbit.',
  node: '<b>Node</b> — click to place a node on the work plane. With “chain” on, each new node connects to the last one.',
  rod: '<b>Rod</b> — click two nodes to join them with a rod.',
  bend: '<b>Bend</b> — click a rod to turn it into an arc.',
  panel: '<b>Panel</b> — click four nodes in order to make a flat sheet panel.',
  anchor: '<b>Pick anchor</b> — click the frame node this join attaches to. <b>Esc</b> cancels.',
};

const JOIN_LABEL: Record<JoinType, string> = {
  clip: 'Clip', standoff: 'Standoff', bolt: 'Bolt', wire_wrap: 'Wire wrap', cage_capture: 'Cage capture', fused: 'Fused',
};
const KIND_LABEL: Record<GlassKind, string> = { blown: 'Blown', solid: 'Solid', cast: 'Cast', leaf: 'Leaf' };
const metalOptions = METAL_IDS.map((m) => [m, METALS[m].label] as [MetalId, string]);
const fmt = (n: number, d = 0) => (Math.abs(n) < 1e-9 ? 0 : n).toFixed(d);

export class App {
  s: Sculpture = emptySculpture();
  a!: Analysis;
  sel: Sel = null;
  tool: Tool = 'select';
  pending: string[] = [];
  anchorJoin: string | null = null;
  undoStack: string[] = [];
  redoStack: string[] = [];
  opts = {
    material: 'mild_steel' as MetalId, dia: 6, snap: true, grid: 10, workY: 0, chain: true, lastNode: null as string | null,
    bendSegs: 6, bendSag: 30, bendAngle: 0, panelT: 1.5,
    cage: { cx: 0, cy: 170, cz: 0, ribs: 8, rings: 3, radius: 90, height: 200, wire: 3, taper: 0.45, material: 'copper' as MetalId },
    newKind: 'blown' as GlassKind,
  };
  blow: { session: BlowSession; last: number; raf: number; held: boolean; uiAt: number } | null = null;
  blowMsg = '';

  view: View;
  el = {
    left: document.getElementById('left')!,
    right: document.getElementById('right')!,
    hud: document.getElementById('hud')!,
    blowbar: document.getElementById('blowbar')!,
    toast: document.getElementById('toast')!,
    canvas: document.getElementById('canvas')!,
  };
  private toolOpts!: HTMLElement;
  private inspector!: HTMLElement;
  private toolButtons = new Map<Tool, HTMLButtonElement>();
  private settingsBox!: HTMLElement;
  private sceneBox!: HTMLElement;

  constructor() {
    this.view = new View(this.el.canvas);
    this.buildLeft();
    this.bindPointer();
    this.bindKeys();
    this.loadPreset('cage');
  }

  // ---------------- state ----------------

  refresh(rebuildView = true) {
    this.a = analyze(this.s);
    if (rebuildView) this.view.rebuild(this.s, this.a, this.highlight());
    this.renderInspector();
    this.renderRight();
    this.renderBlowbar();
    this.renderHud();
  }

  edit(fn: () => void) {
    this.pushUndo();
    fn();
    this.refresh();
  }

  pushUndo() {
    this.undoStack.push(JSON.stringify(this.s));
    if (this.undoStack.length > 80) this.undoStack.shift();
    this.redoStack = [];
  }

  undo() {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(JSON.stringify(this.s));
    this.s = JSON.parse(prev);
    this.validateSel();
    this.refresh();
  }

  redo() {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(JSON.stringify(this.s));
    this.s = JSON.parse(next);
    this.validateSel();
    this.refresh();
  }

  validateSel() {
    const sel = this.sel;
    if (!sel) return;
    const ok = sel.type === 'node' ? nodeById(this.s, sel.id) : sel.type === 'rod' ? rodById(this.s, sel.id) : sel.type === 'part' ? partById(this.s, sel.id) : this.s.panels.find((p) => p.id === sel.id);
    if (!ok) this.sel = null;
  }

  loadSculpture(s: Sculpture) {
    this.s = s;
    this.sel = null;
    this.undoStack = [];
    this.redoStack = [];
    this.opts.lastNode = null;
    this.setTool('select');
    this.renderSceneBox();
    this.renderSettings();
    this.refresh();
    this.view.frameAll(this.s);
  }

  loadPreset(id: string) {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    this.loadSculpture(p.build());
    const blurb = document.getElementById('preset-blurb');
    if (blurb) blurb.textContent = p.blurb;
  }

  highlight(): Highlight {
    const hl: Highlight = { nodes: new Set(), rods: new Set(), parts: new Set(), joins: new Set() };
    if (this.sel?.type === 'node') hl.nodes.add(this.sel.id);
    if (this.sel?.type === 'rod') hl.rods.add(this.sel.id);
    if (this.sel?.type === 'part') {
      hl.parts.add(this.sel.id);
      for (const j of this.s.joins) if (j.partId === this.sel.id) hl.joins.add(j.id);
    }
    for (const id of this.pending) hl.nodes.add(id);
    if (this.tool === 'node' && this.opts.chain && this.opts.lastNode) hl.nodes.add(this.opts.lastNode);
    return hl;
  }

  toast(msg: string, ms = 3200) {
    this.el.toast.textContent = msg;
    this.el.toast.hidden = false;
    clearTimeout((this as any)._t);
    (this as any)._t = setTimeout(() => (this.el.toast.hidden = true), ms);
  }

  snap(v: number) {
    return this.opts.snap ? Math.round(v / this.opts.grid) * this.opts.grid : Math.round(v * 10) / 10;
  }

  setTool(t: Tool) {
    this.tool = t;
    this.pending = [];
    if (t !== 'anchor') this.anchorJoin = null;
    for (const [k, b] of this.toolButtons) b.setAttribute('aria-pressed', String(k === t || (t === 'anchor' && k === 'select')));
    this.view.setWorkPlane(t === 'node', this.opts.workY);
    this.renderToolOpts();
    this.renderHud();
  }

  // ---------------- left panel ----------------

  buildLeft() {
    const L = this.el.left;
    L.append(
      h('div', { class: 'brand' }, h('h1', { html: 'Armature<span>.</span>' }), h('p', {}, 'Metal frame + glass. Build it, then see if it holds.')),
    );

    // file / presets
    const fileInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: async () => {
      const f = fileInput.files?.[0];
      if (!f) return;
      try {
        this.loadSculpture(importJSON(await f.text()));
        this.toast(`Loaded “${this.s.name}”.`);
      } catch (e) {
        this.toast((e as Error).message, 5000);
      }
      fileInput.value = '';
    } });
    L.append(
      h('section', {},
        h('h2', {}, 'Sculpture'),
        h('div', { class: 'row' },
          selectField('', '' as string, [['', 'Load a preset…'], ...PRESETS.map((p) => [p.id, p.name] as [string, string])], (v) => v && this.loadPreset(v)),
        ),
        h('p', { class: 'blurb', id: 'preset-blurb' }),
        h('div', { class: 'row' },
          h('button', { onclick: () => this.loadSculpture(emptySculpture()) }, 'New'),
          h('button', { onclick: () => fileInput.click() }, 'Import'),
          h('button', { onclick: () => this.exportFile() }, 'Export JSON'),
          h('button', { class: 'small', title: 'Undo (⌘Z)', onclick: () => this.undo() }, '↶'),
          h('button', { class: 'small', title: 'Redo (⇧⌘Z)', onclick: () => this.redo() }, '↷'),
          fileInput,
        ),
      ),
    );
    (L.querySelector('select') as HTMLSelectElement).addEventListener('change', (e) => ((e.target as HTMLSelectElement).value = ''));

    // tools
    const seg = h('div', { class: 'seg', role: 'toolbar', 'aria-label': 'Frame tools' });
    for (const [t, label, key] of [['select', 'Select', 'V'], ['node', 'Node', 'N'], ['rod', 'Rod', 'R'], ['bend', 'Bend', 'B'], ['panel', 'Panel', 'P']] as [Tool, string, string][]) {
      const b = h('button', { title: `${label} (${key})`, onclick: () => this.setTool(t) }, label);
      this.toolButtons.set(t, b);
      seg.append(b);
    }
    this.toolOpts = h('div');
    L.append(h('section', {}, h('h2', {}, 'Frame'), seg, this.toolOpts));

    // cage generator
    const c = this.opts.cage;
    const cageBox = h('details', { class: 'sec' }, h('summary', {}, 'Cage generator'));
    const cageFields = () => [
      h('div', { class: 'grid3' },
        numField('Centre x', c.cx, (v) => (c.cx = v)), numField('y', c.cy, (v) => (c.cy = v)), numField('z', c.cz, (v) => (c.cz = v))),
      h('div', { class: 'grid3' },
        numField('Ribs', c.ribs, (v) => (c.ribs = Math.round(v)), { min: 2, max: 24, digits: 0 }),
        numField('Rings', c.rings, (v) => (c.rings = Math.round(v)), { min: 2, max: 12, digits: 0 }),
        numField('Wire Ø mm', c.wire, (v) => (c.wire = v), { min: 0.5, step: 0.5 })),
      h('div', { class: 'grid3' },
        numField('Radius', c.radius, (v) => (c.radius = v), { min: 10 }),
        numField('Height', c.height, (v) => (c.height = v), { min: 10 }),
        numField('End ratio', c.taper, (v) => (c.taper = v), { min: 0.1, max: 1, step: 0.05, digits: 2 })),
      h('div', { class: 'row' }, selectField('Metal', c.material, metalOptions, (v) => (c.material = v))),
      h('div', { class: 'row' }, h('button', { class: 'primary', onclick: () => this.makeCage() }, 'Generate cage'),
        h('span', { class: 'muted' }, 'End ratio 1 = straight sides')),
    ];
    for (const n of cageFields()) cageBox.append(n);
    L.append(cageBox);

    // glass
    L.append(
      h('section', {},
        h('h2', {}, 'Glass'),
        h('div', { class: 'row' },
          selectField('', this.opts.newKind, Object.entries(KIND_LABEL) as [GlassKind, string][], (v) => (this.opts.newKind = v)),
          h('button', { class: 'primary', onclick: () => this.addPart() }, 'Add glass part'),
        ),
        h('p', { class: 'hint' }, 'New parts go next to the selected node, or at the centre.'),
      ),
    );

    this.inspector = h('section', { id: 'inspector' });
    L.append(this.inspector);

    this.sceneBox = h('section');
    L.append(this.sceneBox);
    this.settingsBox = h('details', { class: 'sec' });
    L.append(this.settingsBox);
    L.append(h('details', { class: 'sec' }, h('summary', {}, 'Glass truth'), h('div', { html: truthHTML() })));
    this.setTool('select');
  }

  renderToolOpts() {
    const o = this.opts;
    const box = this.toolOpts;
    box.replaceChildren();
    const rodRow = h('div', { class: 'grid2' },
      selectField('Metal', o.material, metalOptions, (v) => (o.material = v)),
      numField('Rod Ø mm', o.dia, (v) => (o.dia = v), { min: 0.5, step: 0.5 }));
    if (this.tool === 'node') {
      box.append(h('div', { class: 'row', style: 'margin-top:8px' }), rodRow,
        h('div', { class: 'grid2', style: 'margin-top:6px' },
          numField('Work plane y', o.workY, (v) => { o.workY = Math.max(0, v); this.view.setWorkPlane(true, o.workY); }, { min: 0, step: o.grid }),
          h('div', { style: 'display:flex;align-items:flex-end' }, checkField('Chain rods', o.chain, (v) => { o.chain = v; o.lastNode = null; this.refresh(); }))),
      );
    } else if (this.tool === 'rod') {
      box.append(h('div', { style: 'margin-top:8px' }, rodRow));
    } else if (this.tool === 'bend') {
      box.append(h('div', { class: 'grid3', style: 'margin-top:8px' },
        numField('Segments', o.bendSegs, (v) => (o.bendSegs = Math.round(v)), { min: 2, max: 32, digits: 0 }),
        numField('Bow mm', o.bendSag, (v) => (o.bendSag = v), { step: 5 }),
        numField('Turn °', o.bendAngle, (v) => (o.bendAngle = v), { step: 15 })),
        h('p', { class: 'hint' }, 'Bow is how far the middle moves; Turn spins the bend around the rod (0° bows upward, or toward +x for vertical rods). Negative bow flips it.'));
    } else if (this.tool === 'panel') {
      box.append(h('div', { class: 'grid2', style: 'margin-top:8px' },
        selectField('Metal', o.material, metalOptions, (v) => (o.material = v)),
        numField('Sheet mm', o.panelT, (v) => (o.panelT = v), { min: 0.2, step: 0.1 })));
    }
  }

  renderSceneBox() {
    this.sceneBox.replaceChildren(
      h('h2', {}, 'Scene'),
      h('div', { class: 'grid2' },
        h('div', { style: 'display:flex;align-items:flex-end' }, checkField('Wall plane', this.s.wall.enabled, (v) => this.edit(() => (this.s.wall.enabled = v)))),
        numField('Wall z', this.s.wall.z, (v) => this.edit(() => (this.s.wall.z = v)))),
      h('div', { class: 'grid2', style: 'margin-top:6px' },
        h('div', { style: 'display:flex;align-items:flex-end' }, checkField('Snap to grid', this.opts.snap, (v) => (this.opts.snap = v))),
        numField('Grid mm', this.opts.grid, (v) => (this.opts.grid = v), { min: 1 })),
      h('p', { class: 'hint' }, 'Nodes at y = 0 are base contacts. With the wall on, nodes at the wall’s z are wall anchors.'),
    );
  }

  renderSettings() {
    const box = this.settingsBox;
    box.replaceChildren(h('summary', {}, 'Check settings'), h('p', { class: 'hint', style: 'margin-top:0' }, 'Adjustable settings, not physical laws. Change them to match your glass, your shop and your wall.'));
    for (const [key, info] of Object.entries(SETTING_INFO)) {
      const k = key as keyof Settings;
      box.append(h('div', { class: 'setting' },
        numField(`${info.label} (${info.unit})`, this.s.settings[k], (v) => this.edit(() => (this.s.settings[k] = v)), { step: info.step, min: 0, digits: 2 }),
        h('small', {}, info.help)));
    }
    box.append(h('div', { class: 'row', style: 'margin-top:10px' }, h('button', { class: 'small', onclick: () => this.edit(() => {
      this.s.settings = emptySculpture().settings;
      this.renderSettings();
    }) }, 'Reset to defaults')));
  }

  // ---------------- inspector ----------------

  renderInspector() {
    const box = this.inspector;
    box.replaceChildren(h('h2', {}, 'Inspector'));
    const sel = this.sel;
    if (!sel) {
      box.append(h('p', { class: 'hint', style: 'margin:0' }, 'Nothing selected. Click a node, rod or glass part.'));
      return;
    }
    if (sel.type === 'node') return this.inspectNode(box, sel.id);
    if (sel.type === 'rod') return this.inspectRod(box, sel.id);
    if (sel.type === 'panel') return this.inspectPanel(box, sel.id);
    if (sel.type === 'part') return this.inspectPart(box, sel.id);
  }

  inspectNode(box: HTMLElement, id: string) {
    const n = nodeById(this.s, id);
    if (!n) return;
    const rods = this.s.rods.filter((r) => r.a === id || r.b === id).length;
    const tags = [Math.abs(n.p[1]) <= 0.5 ? 'base contact' : '', this.s.wall.enabled && Math.abs(n.p[2] - this.s.wall.z) <= 0.5 ? 'wall anchor' : ''].filter(Boolean);
    box.append(
      h('h3', {}, 'Node', tags.length ? h('span', { class: 'muted', style: 'font-weight:400' }, ` — ${tags.join(', ')}`) : ''),
      h('div', { class: 'grid3' }, ...[0, 1, 2].map((i) => numField('xyz'[i], n.p[i], (v) => this.edit(() => (n.p[i] = i === 1 ? Math.max(0, v) : v))))),
      h('p', { class: 'hint' }, `${rods} rod${rods === 1 ? '' : 's'} attached.`),
      h('div', { class: 'row' },
        h('button', { onclick: () => this.edit(() => (n.p[1] = 0)) }, 'Drop to floor'),
        this.s.wall.enabled ? h('button', { onclick: () => this.edit(() => (n.p[2] = this.s.wall.z)) }, 'Push to wall') : '',
        h('button', { class: 'danger', onclick: () => this.deleteSelection() }, 'Delete')),
    );
  }

  inspectRod(box: HTMLElement, id: string) {
    const r = rodById(this.s, id);
    if (!r) return;
    const grams = this.a.mass.items.find((i) => i.id === id)?.grams ?? 0;
    const cage = this.s.cages.find((c) => c.rodIds.includes(id));
    box.append(
      h('h3', {}, 'Rod', cage ? h('span', { class: 'muted', style: 'font-weight:400' }, ` — part of ${cage.name}`) : ''),
      h('div', { class: 'grid2' },
        selectField('Metal', r.material, metalOptions, (v) => this.edit(() => (r.material = v))),
        numField('Ø mm', r.diameterMm, (v) => this.edit(() => (r.diameterMm = v)), { min: 0.3, step: 0.5 })),
      h('p', { class: 'hint' }, `${fmt(rodLength(this.s, r))} mm long · ${fmt(grams, 1)} g`),
      cage ? h('div', { class: 'row' },
        h('button', { onclick: () => this.edit(() => { for (const x of this.s.rods) if (cage.rodIds.includes(x.id)) x.material = r.material; }) }, 'Apply metal to whole cage'),
        h('button', { onclick: () => this.edit(() => { for (const x of this.s.rods) if (cage.rodIds.includes(x.id)) x.diameterMm = r.diameterMm; cage.wireMm = r.diameterMm; }) }, 'Apply Ø to cage')) : '',
      h('div', { class: 'row' },
        h('button', { onclick: () => this.edit(() => { bendRod(this.s, id, this.opts.bendSegs, this.opts.bendSag, this.opts.bendAngle); this.sel = null; }) }, `Bend (${this.opts.bendSag} mm)`),
        h('button', { class: 'danger', onclick: () => this.deleteSelection() }, 'Delete')),
    );
  }

  inspectPanel(box: HTMLElement, id: string) {
    const p = this.s.panels.find((x) => x.id === id);
    if (!p) return;
    box.append(h('h3', {}, 'Sheet panel'),
      h('div', { class: 'grid2' },
        selectField('Metal', p.material, metalOptions, (v) => this.edit(() => (p.material = v))),
        numField('Thickness mm', p.thicknessMm, (v) => this.edit(() => (p.thicknessMm = v)), { min: 0.2, step: 0.1 })),
      h('div', { class: 'row', style: 'margin-top:6px' }, h('button', { class: 'danger', onclick: () => this.deleteSelection() }, 'Delete')));
  }

  inspectPart(box: HTMLElement, id: string) {
    const p = partById(this.s, id);
    if (!p) return;
    const g = p.geom;
    const st = this.a.partStatus.get(id) ?? 'OK';
    const nameInput = h('input', { type: 'text', value: p.name, onchange: () => this.edit(() => (p.name = nameInput.value || p.name)) });
    box.append(
      h('div', { class: 'insp-title' }, nameInput, statusDot(st)),
      h('p', { class: 'hint', style: 'margin:2px 0 8px' }, `${KIND_LABEL[g.kind]} · ${GLASS[p.glass].label} · ${formatWeight(this.a.mass.partGrams.get(id) ?? 0)} · ${fmt(partThickness(p), 1)} mm thick`),
    );
    const e = (fn: () => void) => this.edit(fn);
    // shape
    if (g.kind === 'blown') {
      box.append(h('div', { class: 'grid2' },
        numField('Outer radius mm', g.outerRadiusMm, (v) => e(() => { g.outerRadiusMm = v; g.profile = undefined; }), { min: 5 }),
        numField('Wall mm', g.wallMm, (v) => e(() => (g.wallMm = v)), { min: 0.5, step: 0.5, digits: 2 })));
      if (g.profile) box.append(h('div', { class: 'row' }, h('span', { class: 'hint', style: 'margin:0' }, 'Shape set by blowing.'), h('button', { class: 'small', onclick: () => e(() => { g.profile = undefined; }) }, 'Reset to sphere')));
    } else if (g.kind === 'solid') {
      box.append(h('div', { class: 'grid2' },
        selectField('Shape', g.shape, [['sphere', 'Sphere'], ['ellipsoid', 'Ellipsoid'], ['teardrop', 'Teardrop']], (v) => e(() => { g.shape = v; if (v === 'ellipsoid' && p.scale.every((x) => x === 1)) p.scale = [1, 1.3, 1]; })),
        numField('Radius mm', g.radiusMm, (v) => e(() => (g.radiusMm = v)), { min: 2 })));
    } else if (g.kind === 'cast') {
      box.append(selectField('Shape', g.shape, [['slab', 'Slab'], ['box', 'Box']], (v) => e(() => (g.shape = v))),
        h('div', { class: 'grid3', style: 'margin-top:6px' }, ...[0, 1, 2].map((i) => numField(['Width', 'Height', g.shape === 'slab' ? 'Thickness' : 'Depth'][i], g.sizeMm[i], (v) => e(() => (g.sizeMm[i] = v)), { min: 1 }))));
    } else {
      box.append(h('div', { class: 'grid3' },
        numField('Length', g.lengthMm, (v) => e(() => (g.lengthMm = v)), { min: 2 }),
        numField('Width', g.widthMm, (v) => e(() => (g.widthMm = v)), { min: 2 }),
        numField('Thick', g.thicknessMm, (v) => e(() => (g.thicknessMm = v)), { min: 0.5, step: 0.5 })));
    }
    box.append(
      h('div', { class: 'grid3', style: 'margin-top:6px' }, ...[0, 1, 2].map((i) => numField(`Pos ${'xyz'[i]}`, p.position[i], (v) => e(() => (p.position[i] = v))))),
      h('div', { class: 'grid3', style: 'margin-top:6px' }, ...[0, 1, 2].map((i) => numField(`Rot ${'xyz'[i]}°`, p.rotationDeg[i], (v) => e(() => (p.rotationDeg[i] = v)), { step: 15 }))),
      h('div', { class: 'grid3', style: 'margin-top:6px' }, ...[0, 1, 2].map((i) => numField(`Scale ${'xyz'[i]}`, p.scale[i], (v) => e(() => (p.scale[i] = v)), { min: 0.1, step: 0.05, digits: 2 }))),
      h('div', { class: 'row', style: 'margin-top:8px' },
        checkField('Metal inclusion (foil / fine wire inside)', p.isInclusion, (v) => e(() => (p.isInclusion = v)))),
    );

    // joins
    box.append(h('h3', {}, 'Joins'));
    const joins = this.s.joins.filter((j) => j.partId === id);
    if (!joins.length) box.append(h('p', { class: 'hint', style: 'margin:0' }, 'No joins yet — this part is not held.'));
    for (const j of joins) box.append(this.joinCard(p, j));
    let addType: JoinType = 'clip';
    box.append(h('div', { class: 'row', style: 'margin-top:8px' },
      selectField('', addType, Object.entries(JOIN_LABEL) as [JoinType, string][], (v) => (addType = v)),
      h('button', { onclick: () => this.addJoin(p, addType) }, 'Add join')));

    box.append(h('div', { class: 'row', style: 'margin-top:12px' },
      h('button', { onclick: () => this.edit(() => {
        const copy: GlassPart = { ...clone({ ...this.s, parts: [p] } as Sculpture).parts[0], id: uid('g'), name: `${p.name} copy` };
        copy.position = [p.position[0] + 40, p.position[1], p.position[2]];
        this.s.parts.push(copy);
        this.sel = { type: 'part', id: copy.id };
      }) }, 'Duplicate'),
      h('button', { class: 'danger', onclick: () => this.deleteSelection() }, 'Delete part')));
  }

  joinCard(p: GlassPart, j: Join): HTMLElement {
    const e = (fn: () => void) => this.edit(fn);
    const load = this.a.joinLoadKg.get(j.id);
    let anchorText: (Node | string)[];
    if (j.anchor.kind === 'node') {
      const n = nodeById(this.s, j.anchor.nodeId);
      anchorText = ['Held by node ', h('b', {}, n ? `(${n.p.map((x) => fmt(x)).join(', ')})` : 'missing')];
    } else if (j.anchor.kind === 'wall') anchorText = ['Fixed to ', h('b', {}, 'the wall')];
    else if (j.anchor.kind === 'cage') anchorText = ['Captured in ', h('b', {}, cageById(this.s, j.anchor.cageId)?.name ?? 'missing cage')];
    else anchorText = [h('b', { style: 'color:var(--bad)' }, 'Not attached')];

    const card = h('div', { class: `join${this.anchorJoin === j.id ? ' sel' : ''}` },
      h('header', {}, JOIN_LABEL[j.type], h('button', { class: 'small danger', title: 'Remove join', onclick: () => e(() => (this.s.joins = this.s.joins.filter((x) => x.id !== j.id))) }, 'Remove')),
      h('div', { class: 'anchor' }, ...anchorText, load !== undefined ? ` · carries ${fmt(load * 1000)} g` : ''),
    );
    const row = h('div', { class: 'row', style: 'margin-top:6px' });
    if (j.type === 'cage_capture') {
      if (this.s.cages.length) {
        row.append(selectField('', j.anchor.kind === 'cage' ? j.anchor.cageId : '', [['', 'Pick a cage…'] as [string, string], ...this.s.cages.map((c) => [c.id, c.name] as [string, string])], (v) => e(() => (j.anchor = v ? { kind: 'cage', cageId: v } : { kind: 'none' }))));
      } else row.append(h('span', { class: 'hint', style: 'margin:0' }, 'Make a cage first.'));
    } else {
      row.append(h('button', { class: 'small', onclick: () => { this.setTool('anchor'); this.anchorJoin = j.id; this.renderInspector(); this.renderHud(); } }, 'Pick node'));
      if (this.s.wall.enabled && (j.type === 'standoff' || j.type === 'bolt' || j.type === 'clip')) {
        row.append(h('button', { class: 'small', onclick: () => e(() => (j.anchor = { kind: 'wall', point: projectToWall(this.s, p.position) })) }, 'To wall'));
      }
    }
    card.append(row);

    const fields = h('div', { class: 'grid2', style: 'margin-top:6px' });
    if (j.type === 'clip') fields.append(selectField('Contact', j.contact ?? 'padded', [['padded', 'Padded'], ['point', 'Point']], (v) => e(() => (j.contact = v))));
    if (j.type === 'standoff') {
      const gi = h('input', { type: 'text', value: j.gasket ?? '', onchange: () => e(() => (j.gasket = gi.value)) });
      fields.append(h('label', { class: 'f' }, 'Gasket', gi));
    }
    if (j.type === 'bolt') {
      const ed = boltEdgeDistance(this.s, j, p);
      fields.append(
        numField('Hole Ø mm', j.holeDiameterMm ?? 8, (v) => e(() => (j.holeDiameterMm = v)), { min: 1, step: 0.5 }),
        selectField('Washers', j.washer ?? 'neoprene', [['rubber', 'Rubber'], ['neoprene', 'Neoprene'], ['nylon', 'Nylon']], (v) => e(() => (j.washer = v))),
        ed.measured
          ? h('label', { class: 'f' }, 'Hole to edge', h('span', { class: 'mono', style: 'padding:4px 0' }, `${fmt(ed.mm)} mm (measured)`))
          : numField('Hole to edge mm', j.edgeDistanceMm ?? 30, (v) => e(() => (j.edgeDistanceMm = v)), { min: 0 }),
      );
    }
    if (j.type === 'wire_wrap' || j.type === 'clip' || j.type === 'fused') {
      fields.append(selectField('Metal', joinMetal(this.s, j) ?? 'mild_steel', metalOptions, (v) => e(() => (j.metal = v))));
    }
    if (fields.childElementCount) card.append(fields);
    if (j.type !== 'cage_capture') card.append(h('div', { style: 'margin-top:6px' }, checkField('Made hot (glass touched hot metal)', j.madeHot, (v) => e(() => (j.madeHot = v)))));
    if (j.type === 'fused' && !p.isInclusion) card.append(h('p', { class: 'hint', style: 'color:var(--bad)' }, 'Fused only works for an inclusion. Tick “Metal inclusion” above if this is foil or fine wire fully inside the glass.'));
    return card;
  }

  // ---------------- right panel ----------------

  renderRight() {
    const a = this.a;
    const R = this.el.right;
    const order: Status[] = ['BAD', 'WARN', 'NOTE', 'OK'];
    const counts = order.map((st) => [st, a.results.filter((r) => r.status === st).length] as const).filter(([, n]) => n > 0);
    const overallText = { OK: 'Looks sound', NOTE: 'Sound, with notes', WARN: 'Needs a look', BAD: 'Won’t hold as built' }[a.overall];
    const name = h('input', { type: 'text', value: this.s.name, 'aria-label': 'Sculpture name', style: 'font-family:var(--sans);border:0;background:transparent;padding:0;font-size:12px;color:var(--ink-2);width:100%', onchange: () => (this.s.name = name.value) });
    const children: Node[] = [
      h('div', { class: 'overall' }, statusDot(a.overall), h('div', { style: 'min-width:0;flex:1' }, h('div', { class: 'big' }, this.s.parts.length || this.s.rods.length ? overallText : 'Empty'), name),
        h('div', { class: 'row', style: 'gap:4px' }, ...counts.map(([st, n]) => h('span', { class: `tag ${st}` }, `${n} ${st}`)))),
      h('div', { class: 'disclaimer' }, 'Estimates for planning — not an engineering sign-off.'),
    ];

    const m = a.mass;
    const com = m.com;
    const base = a.base;
    let baseLine = '—';
    if (base.wallPiece) baseLine = `wall piece · ${a.wallAnchors.length} anchor${a.wallAnchors.length === 1 ? '' : 's'}`;
    else if (base.comEdgeMm !== undefined) baseLine = base.comEdgeMm >= 0 ? `${fmt(base.comEdgeMm)} mm inside edge` : `${fmt(-base.comEdgeMm)} mm outside!`;
    else if (com) baseLine = `${base.contacts.length} floor contact${base.contacts.length === 1 ? '' : 's'}`;
    children.push(h('section', {},
      h('h2', {}, 'Weight & balance'),
      h('table', { class: 'kv' },
        h('tr', {}, h('td', {}, 'Metal'), h('td', {}, formatWeight(m.metalG))),
        h('tr', {}, h('td', {}, 'Glass'), h('td', {}, formatWeight(m.glassG))),
        h('tr', { class: 'total' }, h('td', {}, 'Total'), h('td', {}, formatWeight(m.totalG))),
        h('tr', {}, h('td', {}, 'Centre of mass'), h('td', {}, com ? com.map((x) => fmt(x)).join(', ') : '—')),
        h('tr', {}, h('td', {}, 'Base'), h('td', {}, statusDot(base.status), ' ', baseLine)),
      ),
      h('p', { class: 'hint' }, 'Clips, bolts and washers aren’t weighed.'),
    ));

    const list = h('ul', { class: 'checks' });
    const sorted = [...a.results].sort((x, y) => order.indexOf(x.status) - order.indexOf(y.status));
    for (const r of sorted) {
      const part = r.partId ? partById(this.s, r.partId) : undefined;
      const li = h('li', { class: this.sel?.type === 'part' && this.sel.id === r.partId ? 'sel' : '', onclick: () => {
        if (r.partId) { this.sel = { type: 'part', id: r.partId }; this.refresh(); }
      } }, statusDot(r.status), h('div', {}, h('div', { class: 't' }, r.title, part ? h('span', { class: 'who' }, ` · ${part.name}`) : ''), h('div', { class: 'r' }, r.reason)));
      list.append(li);
    }
    children.push(h('section', {}, h('h2', {}, 'Checks'), a.results.length ? list : h('p', { class: 'hint', style: 'margin:0' }, 'Add some frame and glass to check.')));

    if (this.s.parts.length) {
      const tbody = h('tbody');
      for (const p of this.s.parts) {
        const holds = (a.holdingJoins.get(p.id) ?? []).map((j) => JOIN_LABEL[j.type].toLowerCase());
        tbody.append(h('tr', { class: this.sel?.type === 'part' && this.sel.id === p.id ? 'sel' : '', onclick: () => { this.sel = { type: 'part', id: p.id }; this.refresh(); } },
          h('td', {}, statusDot(a.partStatus.get(p.id) ?? 'OK')),
          h('td', {}, p.name, h('div', { class: 'muted' }, holds.length ? holds.join(', ') : 'nothing holds it')),
          h('td', { class: 'num' }, `${fmt(a.mass.partGrams.get(p.id) ?? 0)} g`)));
      }
      children.push(h('section', {}, h('h2', {}, 'Glass parts'), h('table', { class: 'parts' }, h('thead', {}, h('tr', {}, h('th', {}), h('th', {}, 'Part · held by'), h('th', { style: 'text-align:right' }, 'Weight'))), tbody)));
    }
    R.replaceChildren(...children);
  }

  renderHud() {
    let msg = TOOL_HINT[this.tool];
    if (this.tool === 'rod' && this.pending.length) msg += ' First node picked.';
    if (this.tool === 'panel' && this.pending.length) msg += ` ${this.pending.length} of 4 picked.`;
    this.el.hud.innerHTML = msg;
  }

  // ---------------- blow ----------------

  blowTarget(): { part: GlassPart; cage: ReturnType<typeof cageById> } | null {
    if (this.sel?.type !== 'part') return null;
    const part = partById(this.s, this.sel.id);
    if (!part || part.geom.kind !== 'blown') return null;
    const capture = this.s.joins.find((j) => j.partId === part.id && j.anchor.kind === 'cage');
    const cage = (capture && capture.anchor.kind === 'cage' && cageById(this.s, capture.anchor.cageId)) || cageAround(this.s, part);
    return cage ? { part, cage } : null;
  }

  renderBlowbar() {
    const bar = this.el.blowbar;
    const t = this.blowTarget();
    if (!t) {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    const g = t.part.geom as Extract<GlassPart['geom'], { kind: 'blown' }>;
    const cap = this.a.captures.get(t.part.id);
    const capRes = this.a.results.find((r) => r.check === 'capture' && r.partId === t.part.id);
    const btn = bar.querySelector('.blow') as HTMLButtonElement | null;
    const stats = h('div', { class: 'stats' },
      h('div', {}, 'Bubble', h('b', {}, `${fmt(g.profile?.freeR ?? g.outerRadiusMm)} mm`)),
      h('div', {}, 'Wall', h('b', {}, `${fmt(g.wallMm, 2)} mm`)),
      h('div', {}, 'Glass', h('b', {}, `${fmt(this.a.mass.partGrams.get(t.part.id) ?? 0)} g`)));
    const msg = h('div', { class: 'msg' });
    if (this.blowMsg) msg.append(this.blowMsg);
    else if (capRes) msg.append(h('span', { class: `tag ${capRes.status}` }, capRes.status), capRes.title + (cap?.escape ? ` — ${cap.escape.opening.label} is wider than the glass` : ''));
    else msg.append(`Hold to blow into ${t.cage!.name}. Space bar works too.`);
    if (btn) {
      bar.replaceChildren(btn, stats, msg);
    } else {
      const b = h('button', { class: 'blow', 'aria-label': 'Hold to blow' }, 'Blow');
      b.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        try { b.setPointerCapture(ev.pointerId); } catch { /* pointer already gone */ }
        this.startBlowing();
      });
      b.addEventListener('pointerup', () => this.stopBlowing());
      b.addEventListener('pointercancel', () => this.stopBlowing());
      bar.replaceChildren(b, stats, msg);
    }
  }

  startBlowing() {
    if (this.blow) return;
    const t = this.blowTarget();
    if (!t || !t.cage) return;
    this.pushUndo();
    this.blowMsg = '';
    const session = startBlow(this.s, t.part, t.cage);
    this.blow = { session, last: performance.now(), raf: 0, held: true, uiAt: 0 };
    (this.el.blowbar.querySelector('.blow') as HTMLElement)?.classList.add('on');
    this.refresh();
    const maxR = t.cage.radiusMm * 1.6;
    // fixed-rate timer, not requestAnimationFrame: the blow is a simulation step and shouldn't stall when frames do
    const tick = () => {
      const b = this.blow;
      if (!b || !b.held) return;
      const now = performance.now();
      const dt = Math.min(0.05, (now - b.last) / 1000);
      b.last = now;
      const part = partById(this.s, b.session.partId)!;
      // inflate a little slower as the bubble gets big, like it does on the pipe
      const R = b.session.R + dt * 32 * Math.max(0.35, 1 - b.session.R / (maxR * 1.2));
      if (R >= maxR) {
        this.blowMsg = 'That’s as big as this cage allows here.';
      } else if (!applyBlow(b.session, part, R)) {
        this.blowMsg = `Wall is down to about ${MIN_WALL_MM} mm — in the shop that’s where a bubble tends to blow out. Stopped.`;
      } else {
        this.view.updateBlown(part);
      }
      if (now - b.uiAt > 110) {
        b.uiAt = now;
        this.a = analyze(this.s);
        this.renderBlowbar();
        this.renderRight();
      }
      b.raf = window.setTimeout(tick, 16);
    };
    this.blow.raf = window.setTimeout(tick, 16);
  }

  stopBlowing() {
    const b = this.blow;
    if (!b) return;
    b.held = false;
    clearTimeout(b.raf);
    this.el.blowbar.querySelector('.blow')?.classList.remove('on');
    this.blow = null;
    const part = partById(this.s, b.session.partId);
    if (part) {
      // the blow itself is the join: replace whatever held it with a cage capture
      this.s.joins = this.s.joins.filter((j) => j.partId !== part.id);
      const j = newJoin('cage_capture', part.id);
      j.anchor = { kind: 'cage', cageId: b.session.cageId };
      this.s.joins.push(j);
    }
    this.refresh();
    const cap = this.a.results.find((r) => r.check === 'capture' && r.partId === part?.id);
    if (cap) this.toast(`${cap.title}: ${cap.reason}`, 6000);
  }

  // ---------------- actions ----------------

  makeCage() {
    const c = this.opts.cage;
    this.edit(() => {
      const cage = generateCage(this.s, { center: [c.cx, c.cy, c.cz], ribs: c.ribs, rings: c.rings, radiusMm: c.radius, heightMm: c.height, wireMm: c.wire, material: c.material, taper: c.taper });
      this.sel = { type: 'rod', id: cage.rodIds[0] };
    });
    this.toast('Cage made. Add a blown part at its centre, select it, and hold Blow.');
  }

  addPart() {
    let pos: Vec3 = [0, 150, 0];
    if (this.sel?.type === 'node') {
      const n = nodeById(this.s, this.sel.id)!;
      pos = [n.p[0], n.p[1] + 40, n.p[2]];
    } else if (this.opts.newKind === 'blown' && this.s.cages.length) {
      pos = [...this.s.cages[this.s.cages.length - 1].center];
    }
    const p = newPart(this.opts.newKind, pos);
    p.name = `${KIND_LABEL[p.geom.kind]} ${this.s.parts.filter((x) => x.geom.kind === p.geom.kind).length + 1}`;
    if (p.geom.kind === 'blown') p.geom.wallMm = 14;
    this.edit(() => {
      this.s.parts.push(p);
      this.sel = { type: 'part', id: p.id };
    });
  }

  addJoin(p: GlassPart, type: JoinType) {
    const j = newJoin(type, p.id);
    if (type === 'cage_capture') {
      const cage = cageAround(this.s, p) ?? this.s.cages[0];
      if (cage) j.anchor = { kind: 'cage', cageId: cage.id };
    }
    this.edit(() => this.s.joins.push(j));
    if (type !== 'cage_capture') {
      this.setTool('anchor');
      this.anchorJoin = j.id;
      this.renderInspector();
      this.renderHud();
    }
  }

  deleteSelection() {
    const sel = this.sel;
    if (!sel) return;
    this.edit(() => {
      if (sel.type === 'node') deleteNode(this.s, sel.id);
      if (sel.type === 'rod') deleteRod(this.s, sel.id);
      if (sel.type === 'part') deletePart(this.s, sel.id);
      if (sel.type === 'panel') this.s.panels = this.s.panels.filter((p) => p.id !== sel.id);
      this.sel = null;
    });
  }

  exportFile() {
    const blob = new Blob([exportJSON(this.s)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${this.s.name.replace(/[^\w-]+/g, '-').toLowerCase() || 'sculpture'}.armature.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------------- pointer ----------------

  bindPointer() {
    const host = this.el.canvas;
    let down: { x: number; y: number; id: number } | null = null;
    let drag: { kind: 'node' | 'part'; id: string; started: boolean; offset: Vec3 } | null = null;

    host.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      down = { x: ev.clientX, y: ev.clientY, id: ev.pointerId };
      if (this.tool !== 'select') return;
      const pick = this.view.pickPreferNode(ev.clientX, ev.clientY);
      if (pick && (pick.type === 'node' || pick.type === 'part')) {
        const p0 = pick.type === 'node' ? nodeById(this.s, pick.id)!.p : partById(this.s, pick.id)!.position;
        const hit = this.view.rayPlane(ev.clientX, ev.clientY, [0, 1, 0], p0);
        drag = { kind: pick.type, id: pick.id, started: false, offset: hit ? [p0[0] - hit[0], 0, p0[2] - hit[2]] : [0, 0, 0] };
        this.view.controls.enabled = false;
        host.setPointerCapture(ev.pointerId);
      }
    }, { capture: true });

    host.addEventListener('pointermove', (ev) => {
      if (!drag || !down) return;
      if (!drag.started && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) < 4) return;
      if (!drag.started) {
        this.pushUndo();
        drag.started = true;
        this.sel = { type: drag.kind, id: drag.id };
      }
      const target = drag.kind === 'node' ? nodeById(this.s, drag.id)!.p : partById(this.s, drag.id)!.position;
      if (ev.shiftKey) {
        const hit = this.view.rayPlane(ev.clientX, ev.clientY, this.view.cameraFlatDir(), target);
        if (hit) target[1] = Math.max(0, this.snap(hit[1]));
      } else {
        const hit = this.view.rayPlane(ev.clientX, ev.clientY, [0, 1, 0], target);
        if (hit) {
          target[0] = this.snap(hit[0] + drag.offset[0]);
          target[2] = this.snap(hit[2] + drag.offset[2]);
        }
      }
      this.refresh();
    });

    const up = (ev: PointerEvent) => {
      const wasDrag = drag?.started;
      const d = down;
      drag = null;
      down = null;
      this.view.controls.enabled = true;
      if (!d || wasDrag || Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 4) return;
      this.click(ev);
    };
    host.addEventListener('pointerup', up);
    host.addEventListener('pointercancel', () => { drag = null; down = null; this.view.controls.enabled = true; });
  }

  click(ev: PointerEvent) {
    const pick = this.view.pickPreferNode(ev.clientX, ev.clientY);
    const o = this.opts;
    switch (this.tool) {
      case 'select':
        this.sel = pick ? { type: pick.type, id: pick.id } : null;
        this.refresh();
        return;
      case 'node': {
        if (pick?.type === 'node') {
          if (o.chain && o.lastNode && o.lastNode !== pick.id) {
            const from = o.lastNode;
            this.edit(() => addRod(this.s, from, pick.id, o.material, o.dia));
          }
          o.lastNode = pick.id;
          this.sel = { type: 'node', id: pick.id };
          this.refresh();
          return;
        }
        const hit = this.view.rayPlane(ev.clientX, ev.clientY, [0, 1, 0], [0, o.workY, 0]);
        if (!hit) return;
        this.edit(() => {
          const id = addNode(this.s, [this.snap(hit[0]), o.workY, this.snap(hit[2])]);
          if (o.chain && o.lastNode && nodeById(this.s, o.lastNode)) addRod(this.s, o.lastNode, id, o.material, o.dia);
          o.lastNode = id;
          this.sel = { type: 'node', id };
        });
        return;
      }
      case 'rod':
        if (pick?.type !== 'node') return;
        if (!this.pending.length) {
          this.pending = [pick.id];
          this.refresh();
        } else if (pick.id !== this.pending[0]) {
          const a = this.pending[0];
          this.pending = [];
          this.edit(() => {
            const id = addRod(this.s, a, pick.id, o.material, o.dia);
            this.sel = { type: 'rod', id };
          });
        }
        return;
      case 'bend':
        if (pick?.type !== 'rod') return;
        this.edit(() => bendRod(this.s, pick.id, o.bendSegs, o.bendSag, o.bendAngle));
        return;
      case 'panel':
        if (pick?.type !== 'node' || this.pending.includes(pick.id)) return;
        this.pending.push(pick.id);
        if (this.pending.length === 4) {
          const nodes = this.pending as [string, string, string, string];
          this.pending = [];
          this.edit(() => {
            const id = uid('p');
            this.s.panels.push({ id, nodes, material: o.material, thicknessMm: o.panelT });
            this.sel = { type: 'panel', id };
          });
        } else this.refresh();
        return;
      case 'anchor': {
        if (pick?.type !== 'node') return;
        const j = this.s.joins.find((x) => x.id === this.anchorJoin);
        this.setTool('select');
        if (j) this.edit(() => (j.anchor = { kind: 'node', nodeId: pick.id }));
        return;
      }
    }
  }

  bindKeys() {
    const typing = () => {
      const t = document.activeElement;
      return t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement;
    };
    window.addEventListener('keydown', (ev) => {
      if (typing()) return;
      if (ev.code === 'Space') {
        ev.preventDefault();
        if (!ev.repeat) this.startBlowing();
        return;
      }
      if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'z') {
        ev.preventDefault();
        if (ev.shiftKey) this.redo();
        else this.undo();
        return;
      }
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); this.deleteSelection(); }
      if (ev.key === 'Escape') { this.setTool('select'); this.opts.lastNode = null; this.refresh(); }
      const map: Record<string, Tool> = { v: 'select', n: 'node', r: 'rod', b: 'bend', p: 'panel' };
      const t = map[ev.key.toLowerCase()];
      if (t) { this.setTool(t); this.opts.lastNode = null; this.refresh(); }
      if (ev.key.toLowerCase() === 'f') this.view.frameAll(this.s);
    });
    window.addEventListener('keyup', (ev) => {
      if (ev.code === 'Space') this.stopBlowing();
    });
    window.addEventListener('blur', () => this.stopBlowing());
  }
}
