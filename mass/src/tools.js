// Interactive tools. Each tool is a definition with:
//   params     sliders/selects shown in the tool panel
//   anchor     true if you start by clicking the glass (or a function of params)
//   init(ctx)  initial handle positions {name: [x,y,z]}
//   draw(g, h, p, ctx)  gizmo visuals for the current handles/params
//   op(h, p, ctx)       the op object Apply will commit
// The controller handles picking, dragging on a camera-facing plane, the
// debounced ghost preview, and Apply / Cancel.

import * as THREE from 'three';
import { colorOptions } from './colors.js';
import { sub, add, scale, dot, cross, len, norm, rotate } from './deform.js';

const C = { grab: 0xff8a1f, aim: 0x2a8cff, jaw: 0x8a5ad8, cut: 0xe0362c, paddle: 0xb98a4e, color: 0x18a46a };

// ── gizmo drawing helpers ──
const basic = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
const lineM = (color, opacity = 1) => new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false });
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
function handle(g, name, pos, color, size = 0.38) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(size, 16, 12), basic(color));
  m.position.copy(v3(pos)); m.userData.handle = name; m.renderOrder = 10;
  g.add(m);
}
function dot3(g, pos, color, size = 0.18) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(size, 12, 8), basic(color)); m.position.copy(v3(pos)); g.add(m);
}
function line(g, a, b, color, opacity = 1) {
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([v3(a), v3(b)]), lineM(color, opacity)));
}
function ring(g, c, n, r, color, opacity = 1, arc = Math.PI * 2) {
  const pts = [], q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), v3(norm(n)));
  for (let i = 0; i <= 48; i++) {
    const t = (i / 48) * arc;
    pts.push(new THREE.Vector3(Math.cos(t) * r, Math.sin(t) * r, 0).applyQuaternion(q).add(v3(c)));
  }
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineM(color, opacity)));
}
function disc(g, c, n, r, color, opacity) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 48), basic(color, opacity));
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), v3(norm(n)));
  m.position.copy(v3(c)); g.add(m);
  ring(g, c, n, r, color, 0.9);
}
function quad(g, c, uDir, vDir, w, h, color, opacity) {
  const u = v3(norm(uDir)), v = v3(norm(vDir)), n = new THREE.Vector3().crossVectors(u, v);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), basic(color, opacity));
  m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, v, n));
  m.position.copy(v3(c)); g.add(m);
}

// Piece extents helper for default handle placement.
function extents(ctx) {
  const b = ctx.vol.pieceBox(0);
  const { min, max } = b ? ctx.vol.boxWorld(b) : { min: [-4, 0, -4], max: [4, 8, 4] };
  const com = ctx.analysis?.com || scale(add(min, max), 0.5);
  const size = sub(max, min);
  const long = size[0] >= size[1] && size[0] >= size[2] ? 0 : size[1] >= size[2] ? 1 : 2;
  return { min, max, com, size, long };
}
const axisVec = (i) => [i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0];

// Jaw frame for Pinch, shared by gizmo and op.
function jawFrame(p1, p2, angle) {
  const a = norm(sub(p2, p1));
  const ref = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const n = rotate(norm(sub(ref, scale(a, dot(a, ref)))), a, angle * Math.PI / 180);
  return { a, n, bd: cross(a, n) };
}

export const TOOLS = {
  pull: {
    label: 'Pull', key: 'P',
    hint: 'Click the glass where you want to grab, then drag the blue handle to draw out a limb. Glass is taken from around the grab point, so volume stays the same.',
    anchor: true,
    params: [
      { key: 'radius', label: 'Grab size', min: 0.4, max: 3, step: 0.1, value: 1.2, unit: 'cm' },
      { key: 'taper', label: 'Tip taper', min: 0.1, max: 1, step: 0.05, value: 0.35 },
    ],
    init: ({ anchor }) => ({ a: anchor.point, b: add(anchor.point, scale(anchor.normal, 3)) }),
    fixed: ['a'],
    draw(g, h, p) {
      const dir = norm(sub(h.b, h.a));
      dot3(g, h.a, C.grab, 0.2);
      ring(g, h.a, dir, p.radius, C.grab, 0.8);
      ring(g, h.b, dir, p.radius * p.taper, C.aim, 0.9);
      line(g, h.a, h.b, C.aim, 0.8);
      handle(g, 'b', h.b, C.aim);
    },
    op: (h, p) => ({ type: 'pull', a: h.a, b: h.b, radius: p.radius, taper: p.taper }),
  },

  pinch: {
    label: 'Pinch', key: 'N',
    hint: 'Drag the two jaw tips. Glass between the jaws is squeezed out into the glass either side of the crease. Jaw angle turns the blades around the line between the tips.',
    params: [
      { key: 'width', label: 'Jaw width', min: 1, max: 8, step: 0.25, value: 3, unit: 'cm' },
      { key: 'thick', label: 'Crease width', min: 0.2, max: 1.5, step: 0.05, value: 0.5, unit: 'cm' },
      { key: 'angle', label: 'Jaw angle', min: 0, max: 180, step: 5, value: 0, unit: '°' },
    ],
    init(ctx) {
      const { com, size } = extents(ctx);
      const r = size[1] * 0.28;
      return { p1: [com[0], com[1] + r, com[2]], p2: [com[0], com[1] - r, com[2]] };
    },
    draw(g, h, p) {
      const { a, n, bd } = jawFrame(h.p1, h.p2, p.angle);
      line(g, h.p1, h.p2, C.jaw, 0.5);
      quad(g, add(h.p1, scale(a, -1.5)), a, bd, 3, p.width, C.jaw, 0.25);
      quad(g, add(h.p2, scale(a, 1.5)), a, bd, 3, p.width, C.jaw, 0.25);
      handle(g, 'p1', h.p1, C.jaw); handle(g, 'p2', h.p2, C.jaw);
      void n;
    },
    op: (h, p) => ({ type: 'pinch', p1: h.p1, p2: h.p2, width: p.width, thick: p.thick, angle: p.angle }),
  },

  twist: {
    label: 'Twist', key: 'T',
    hint: 'The two handles set the axis and the span. Glass before the first handle stays put, the end past the second turns by the full angle, and the span between ramps smoothly.',
    params: [{ key: 'angle', label: 'Angle', min: -720, max: 720, step: 15, value: 180, unit: '°' }],
    init(ctx) {
      const { min, max, com, size, long } = extents(ctx);
      const a = com.slice(), b = com.slice();
      a[long] = min[long] + size[long] * 0.2; b[long] = max[long] - size[long] * 0.1;
      return { a, b };
    },
    draw(g, h, p, ctx) {
      const u = norm(sub(h.b, h.a)), { size } = extents(ctx);
      const r = Math.max(size[0], size[1], size[2]) * 0.35;
      line(g, add(h.a, scale(u, -2)), add(h.b, scale(u, 2)), C.aim, 0.7);
      ring(g, h.a, u, r, C.aim, 0.5);
      ring(g, h.b, u, r, C.aim, 0.5);
      ring(g, h.b, u, r * 1.15, C.grab, 1, Math.min(Math.abs(p.angle), 360) * Math.PI / 180 * Math.sign(p.angle || 1));
      handle(g, 'a', h.a, C.aim); handle(g, 'b', h.b, C.aim);
    },
    op: (h, p) => ({ type: 'twist', a: h.a, b: h.b, angle: p.angle }),
  },

  paddle: {
    label: 'Paddle', key: 'D',
    hint: 'Position the paddle (centre handle) and aim it (arrow handle). Glass in front of the face is pressed flat and bulges out around the edge. Paddle the bottom to make a base.',
    params: [{ key: 'radius', label: 'Paddle size', min: 1, max: 9, step: 0.25, value: 4.5, unit: 'cm' }],
    init(ctx) {
      const { min, com, size } = extents(ctx);
      const c = [com[0], min[1] + size[1] * 0.12, com[2]];
      return { c, n: add(c, [0, 2.5, 0]) };
    },
    links: { c: ['n'] },
    draw(g, h, p) {
      const n = norm(sub(h.n, h.c));
      disc(g, h.c, n, p.radius, C.paddle, 0.28);
      line(g, h.c, h.n, C.paddle, 1);
      handle(g, 'c', h.c, C.paddle); handle(g, 'n', h.n, C.aim, 0.3);
    },
    op: (h, p) => ({ type: 'paddle', c: h.c, n: norm(sub(h.n, h.c)), radius: p.radius }),
  },

  bits: {
    label: 'Bits', key: 'B',
    hint: 'Click the glass where the bit should land, then drag the handle to size it. Bits add glass.',
    anchor: true,
    params: [{ key: 'color', label: 'Glass', type: 'select', options: colorOptions(true), value: 'clear' }],
    init: ({ anchor }) => ({ a: anchor.point, s: add(anchor.point, scale(anchor.normal, 1.45 * 1.0)), nrm: anchor.normal }),
    fixed: ['a', 'nrm'],
    constrain(name, pos, h) {
      if (name !== 's') return pos;
      const t = Math.max(0.3, dot(sub(pos, h.a), h.nrm));
      return add(h.a, scale(h.nrm, t));
    },
    draw(g, h) {
      const r = len(sub(h.s, h.a)) / 1.45;
      const ctr = add(h.a, scale(h.nrm, 0.45 * r));
      ring(g, ctr, h.nrm, r, C.grab, 0.9);
      ring(g, ctr, cross(h.nrm, [0.3, 0.9, 0.2]), r, C.grab, 0.5);
      line(g, h.a, h.s, C.aim, 0.6);
      handle(g, 's', h.s, C.aim, 0.3);
    },
    op: (h, p) => ({ type: 'bits', c: h.a, n: h.nrm, r: +(len(sub(h.s, h.a)) / 1.45).toFixed(3), color: p.color }),
  },

  color: {
    label: 'Colour', key: 'C',
    hint: 'Recolours the outer skin of the glass; no glass is added. Transparent colour deepens where the glass is thick, while opaque colour just blocks light. "Patch" needs a click on the glass.',
    anchor: (p) => p.mode === 'patch',
    params: [
      { key: 'mode', label: 'Apply as', type: 'select', options: [
        { value: 'layer', label: 'Layer (whole surface)' }, { value: 'patch', label: 'Patch' },
        { value: 'frit', label: 'Frit' }, { value: 'stripes', label: 'Stripes' }], value: 'layer' },
      { key: 'color', label: 'Colour', type: 'select', options: colorOptions(false), value: 'cobalt' },
      { key: 'depth', label: 'Depth', min: 0.1, max: 1.5, step: 0.05, value: 0.3, unit: 'cm' },
      { key: 'radius', label: 'Patch size', min: 0.5, max: 6, step: 0.25, value: 2, unit: 'cm', when: (p) => p.mode === 'patch' },
      { key: 'density', label: 'Frit amount', min: 0.05, max: 0.8, step: 0.05, value: 0.3, when: (p) => p.mode === 'frit' },
      { key: 'count', label: 'Stripes', min: 2, max: 16, step: 1, value: 6, when: (p) => p.mode === 'stripes' },
      { key: 'width', label: 'Stripe width', min: 0.1, max: 0.7, step: 0.05, value: 0.3, when: (p) => p.mode === 'stripes' },
      { key: 'axis', label: 'Along', type: 'select', options: [{ value: 'x', label: 'x (punty axis)' }, { value: 'y', label: 'y (vertical)' }, { value: 'z', label: 'z' }], value: 'x', when: (p) => p.mode === 'stripes' },
    ],
    init: (ctx) => (ctx.anchor ? { a: ctx.anchor.point, nrm: ctx.anchor.normal } : {}),
    fixed: ['a', 'nrm'],
    draw(g, h, p) {
      if (p.mode === 'patch' && h.a) { ring(g, h.a, h.nrm, p.radius, C.color, 1); dot3(g, h.a, C.color); }
    },
    op(h, p, ctx) {
      if (p.mode === 'patch' && !h.a) return null;
      return {
        type: 'color', mode: p.mode, color: p.color, depth: p.depth,
        at: p.mode === 'patch' ? h.a : null, radius: p.radius, density: p.density,
        count: p.count, width: p.width, axis: p.axis,
        centre: (extents(ctx).com).map((v) => +v.toFixed(3)), seed: ctx.seed,
      };
    },
  },

  shears: {
    label: 'Shears', key: 'S',
    hint: 'Move the cutting plane (centre handle) and aim the arrow at the side to keep. Everything on the red side is cut away, leaving a softly rounded edge. Removes glass.',
    params: [{ key: 'round', label: 'Edge softness', min: 0.05, max: 0.8, step: 0.05, value: 0.25, unit: 'cm' }],
    init(ctx) {
      const { max, com, size, long } = extents(ctx);
      const c = com.slice(); c[long] = max[long] - size[long] * 0.25;
      const n = scale(axisVec(long), -2.5);
      return { c, n: add(c, n) };
    },
    links: { c: ['n'] },
    draw(g, h, p, ctx) {
      const n = norm(sub(h.n, h.c)), { size } = extents(ctx);
      const s = Math.max(size[0], size[1], size[2]) * 1.2 + 2;
      const u = norm(cross(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), v = cross(n, u);
      quad(g, h.c, u, v, s, s, C.cut, 0.18);
      quad(g, add(h.c, scale(n, -0.6)), u, v, s, s, C.cut, 0.08);
      line(g, h.c, h.n, C.aim, 1);
      handle(g, 'c', h.c, C.cut); handle(g, 'n', h.n, C.aim, 0.3);
    },
    op: (h, p) => ({ type: 'shears', c: h.c, n: norm(sub(h.n, h.c)), round: p.round }),
  },
};

export class ToolController {
  constructor(view, api) {
    this.view = view; this.api = api;
    this.key = null; this.handles = {}; this.params = {}; this.anchor = null;
    this.drag = null; this.preview = null; this.timer = 0;
    const host = view.canvas.parentElement;
    // Capture phase on the parent so we see the press before OrbitControls.
    host.addEventListener('pointerdown', (e) => this.down(e), true);
    addEventListener('pointermove', (e) => this.move(e));
    addEventListener('pointerup', () => this.up());
    addEventListener('keydown', (e) => {
      if (!this.key || e.target.matches('input, select')) return;
      if (e.key === 'Enter') { e.preventDefault(); this.apply(); }
      if (e.key === 'Escape') { e.preventDefault(); this.select(null); }
    });
  }

  get def() { return this.key ? TOOLS[this.key] : null; }
  needsAnchor() {
    const a = this.def?.anchor;
    return typeof a === 'function' ? a(this.params) : !!a;
  }
  ctx() { return { vol: this.api.vol(), analysis: this.api.analysis(), anchor: this.anchor, seed: this.seed }; }

  select(key) {
    this.key = key; this.anchor = null; this.handles = {}; this.preview = null;
    this.seed = (Math.random() * 1e6) | 0;
    clearTimeout(this.timer);
    this.view.setGhost(null);
    if (key) {
      this.params = Object.fromEntries(TOOLS[key].params.map((p) => [p.key, p.value]));
      if (!this.needsAnchor()) { this.handles = TOOLS[key].init(this.ctx()); this.schedule(); }
    }
    this.redraw();
    this.api.changed();
  }

  setParam(k, v) {
    this.params[k] = v;
    if (this.needsAnchor() && !this.anchor) this.handles = {};
    else if (!Object.keys(this.handles).length) this.handles = this.def.init(this.ctx());
    this.redraw(); this.schedule(); this.api.changed();
  }

  pos(e) {
    const r = this.view.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  down(e) {
    if (!this.key || e.button !== 0) return;
    const [x, y] = this.pos(e);
    const h = this.view.pickHandle(x, y);
    if (h) {
      const start = v3(this.handles[h]);
      const camDir = new THREE.Vector3(); this.view.camera.getWorldDirection(camDir);
      this.drag = { name: h, plane: new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, start), last: this.handles[h] };
      this.view.controls.enabled = false;
      e.stopPropagation();
      return;
    }
    if (this.needsAnchor()) {
      const hit = this.view.pickGlass(x, y);
      if (!hit) return;
      this.anchor = hit;
      this.handles = this.def.init(this.ctx());
      this.redraw(); this.schedule(); this.api.changed();
      e.stopPropagation();
    }
  }

  move(e) {
    if (!this.drag) return;
    const [x, y] = this.pos(e);
    const p = new THREE.Vector3();
    if (!this.view.rayAt(x, y).ray.intersectPlane(this.drag.plane, p)) return;
    let np = p.toArray();
    if (this.def.constrain) np = this.def.constrain(this.drag.name, np, this.handles);
    const delta = sub(np, this.handles[this.drag.name]);
    this.handles[this.drag.name] = np;
    for (const other of this.def.links?.[this.drag.name] || []) this.handles[other] = add(this.handles[other], delta);
    this.preview = null;
    this.view.setGhost(null);
    this.redraw();
  }

  up() {
    if (!this.drag) return;
    this.drag = null;
    this.view.controls.enabled = true;
    this.schedule();
  }

  redraw() {
    const g = this.view.toolGroup;
    for (const c of [...g.children]) { g.remove(c); c.geometry?.dispose(); c.material?.dispose(); }
    if (this.key && Object.keys(this.handles).length) this.def.draw(g, this.handles, this.params, this.ctx());
  }

  currentOp() {
    if (!this.key || !Object.keys(this.handles).length && this.needsAnchor()) return null;
    if (!Object.keys(this.handles).length && !this.needsAnchor()) this.handles = this.def.init(this.ctx());
    return this.def.op(this.handles, this.params, this.ctx());
  }

  schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.runPreview(), 140);
  }

  runPreview() {
    const op = this.currentOp();
    if (!op) return;
    const key = JSON.stringify(op);
    if (this.preview?.key === key) return;
    const res = this.api.preview(op);
    this.preview = { key, ...res };
    this.view.setGhost(res.mesh);
    this.api.changed();
  }

  apply() {
    const op = this.currentOp();
    if (!op) return;
    const pv = this.preview?.key === JSON.stringify(op) ? this.preview : null;
    this.api.commit(op, pv);
    const key = this.key;
    this.select(null);
    this.select(key); // stay in the tool, fresh handles on the new shape
  }
}
