import { create } from 'zustand';
import { createDesign, createMaterial, identityTransform, newId, updateOp } from '../model/design';
import type { ArrayOp, BlendOp, BooleanOp, CustomShape, DeformOp, Design, GlassMaterial, MatId, Note, OpId, OpNode, PrimitiveOp, ShellOp, StackOp, Transform, Units } from '../model/types';
import { createArray, createBlend, createBoolean, createDeform, createShell, createStack, duplicateOp, moveToStack, removeOps } from '../model/tree';
import { getPreset } from '../presets/registry';
import { defaultParams } from '../presets/types';
import { sectionSize } from '../geometry/section';
import { bodiesOf, evaluateOps, unionBounds } from '../engine/evaluate';
import * as library from './library';
import * as parts from './partsLibrary';
import { customPresetFor } from '../presets/custom';
import { randomDeform } from '../geometry/deform';
import { encodePositions } from '../files/meshData';

const HISTORY_LIMIT = 200;
const COALESCE_MS = 800; // slider drags within this window are one undo step
const GAP_MM = 20;

export type GizmoMode = 'translate' | 'rotate' | 'scale';

/** What the drawing editor is working on: a new drawing, a saved part, or a part in the design. */
export type EditorTarget = { kind: 'new' } | { kind: 'saved'; id: string } | { kind: 'op'; id: OpId };

export interface EditorState {
  target: EditorTarget;
  name: string;
  shape: CustomShape;
}

interface DesignState {
  design: Design;
  /** Everything selected; the last one is the one the inspector shows. */
  selection: OpId[];
  selectedId: OpId | null;
  past: Design[];
  future: Design[];
  lastKey: string | null;
  lastAt: number;
  gizmo: GizmoMode;
  snap: boolean;
  /** True while something is being dragged, so melts can rebuild at draft resolution. */
  dragging: boolean;
  library: library.LibraryEntry[];
  myParts: parts.MyPart[];
  editor: EditorState | null;

  /**
   * Every edit goes through here. Edits sharing a `coalesceKey` in quick succession undo
   * together; keys from `beginDrag()` merge for as long as the drag lasts.
   */
  apply(fn: (d: Design) => Design, coalesceKey?: string): void;
  select(id: OpId | null, additive?: boolean): void;
  addPart(presetId: string): void;
  removeOps(ids: OpId[]): void;
  duplicate(id: OpId): void;
  stackSelection(): void;
  arrayOf(id: OpId, mode: ArrayOp['mode']): void;
  /** Combines the selection: the first picked is the target, the rest are tools. */
  combineSelection(mode: BooleanOp['mode']): void;
  shell(id: OpId): void;
  deform(id: OpId): void;
  /** Rolls a new random set of deform amounts (one undo step). */
  randomizeDeform(id: OpId): void;
  /** Melts the selected parts into one piece with smooth fillets. */
  meltSelection(): void;
  moveToStack(id: OpId, stackId: OpId | null, belowId?: OpId): void;
  rename(id: OpId, label: string): void;
  toggleSuppressed(id: OpId): void;
  setParam(id: OpId, key: string, value: number, coalesceKey?: string): void;
  setTransform(id: OpId, transform: Transform, coalesceKey?: string): void;
  patchOp(id: OpId, patch: Partial<StackOp> | Partial<ArrayOp> | Partial<BooleanOp> | Partial<ShellOp> | Partial<BlendOp> | Partial<DeformOp>, field: string): void;
  setMaterial(id: MatId, patch: Partial<GlassMaterial>): void;
  setUnits(units: Units): void;
  setDensity(density: number): void;
  setScene(patch: Partial<Design['scene']>): void;
  addNote(text: string): void;
  updateNote(id: string, patch: Partial<Note>): void;
  removeNote(id: string): void;
  setName(name: string): void;
  /** Adds a part from a drawing (a saved one, or straight from the editor). */
  addDrawnPart(shape: CustomShape, name: string): void;
  openEditor(target: EditorTarget): void;
  closeEditor(): void;
  /** Saves the editor's drawing where it came from; `addToDesign` also places a new part. */
  saveEditor(shape: CustomShape, name: string, addToDesign: boolean): void;
  saveToMyParts(shape: CustomShape, name: string): void;
  deleteMyPart(id: string): void;
  setGizmo(mode: GizmoMode): void;
  setSnap(on: boolean): void;
  undo(): void;
  redo(): void;
  /** Opens a design read from a file, as a new design in the library. */
  openDesignFile(design: Design): void;
  /** Adds a part from STL/OBJ triangles (already centred and on the floor). */
  addImportedMesh(name: string, positions: Float32Array, units: number): void;
  newDesign(): void;
  duplicateDesign(): void;
  openDesign(id: string): void;
  deleteDesign(id: string): void;
}

const storage = typeof localStorage === 'undefined' ? null : localStorage;

export const useDesign = create<DesignState>((set, get) => {
  /** Swaps in a whole different design: history belongs to the old one, so it goes. */
  const open = (design: Design) => {
    set({ design, selection: [], selectedId: null, past: [], future: [], lastKey: null });
    persist();
  };

  return {
    design: (storage && library.loadCurrent(storage)) ?? starterDesign(),
    selection: [],
    selectedId: null,
    past: [],
    future: [],
    lastKey: null,
    lastAt: 0,
    gizmo: 'translate',
    snap: true,
    dragging: false,
    library: storage ? library.listDesigns(storage) : [],
    myParts: storage ? parts.listParts(storage) : [],
    editor: null,

    apply(fn, coalesceKey) {
      set((s) => {
        const next = fn(s.design);
        if (next === s.design) return s;
        const now = performance.now();
        const same = coalesceKey != null && coalesceKey === s.lastKey;
        const coalesce = same && (coalesceKey.startsWith('drag:') || now - s.lastAt < COALESCE_MS);
        return {
          design: next,
          past: coalesce ? s.past : [...s.past, s.design].slice(-HISTORY_LIMIT),
          future: [],
          lastKey: coalesceKey ?? null,
          lastAt: now,
        };
      });
      dropStaleSelection();
    },

    select(id, additive = false) {
      if (!id) return set({ selection: [], selectedId: null });
      const { selection } = get();
      const next = !additive ? [id] : selection.includes(id) ? selection.filter((s) => s !== id) : [...selection, id];
      set({ selection: next, selectedId: next[next.length - 1] ?? null });
    },

    addPart(presetId) {
      const def = getPreset(presetId);
      const params = defaultParams(def);
      const material = createMaterial();
      const id = newId('op');
      get().apply((d) => {
        const op: PrimitiveOp = {
          id,
          type: 'primitive',
          label: `${def.label} ${d.ops.filter((o) => o.type === 'primitive' && o.preset === presetId).length + 1}`,
          preset: presetId,
          params,
          transform: { ...identityTransform(), position: [nextFreeX(d, sectionSize(def.section(params)).width), 0, 0] },
          materialId: material.id,
        };
        return { ...d, ops: [...d.ops, op], materials: { ...d.materials, [material.id]: material } };
      });
      get().select(id);
    },

    addDrawnPart(shape, name) {
      const presetId = customPresetFor(shape.mode);
      const def = getPreset(presetId);
      const params = defaultParams(def);
      const material = createMaterial();
      const id = newId('op');
      const own = structuredClone(shape);
      get().apply((d) => {
        const op: PrimitiveOp = {
          id,
          type: 'primitive',
          label: name || 'Drawn part',
          preset: presetId,
          params,
          shape: own,
          transform: { ...identityTransform(), position: [nextFreeX(d, sectionSize(def.section(params, own)).width), 0, 0] },
          materialId: material.id,
        };
        return { ...d, ops: [...d.ops, op], materials: { ...d.materials, [material.id]: material } };
      });
      get().select(id);
    },

    openEditor(target) {
      let name = 'My part';
      let shape: CustomShape = STARTER_DRAWING;
      if (target.kind === 'saved') {
        const saved = get().myParts.find((p) => p.id === target.id);
        if (saved) [name, shape] = [saved.name, saved.shape];
      } else if (target.kind === 'op') {
        const op = get().design.ops.find((o) => o.id === target.id);
        if (op?.type === 'primitive' && op.shape) [name, shape] = [op.label, op.shape];
      }
      set({ editor: { target, name, shape: structuredClone(shape) } });
    },

    closeEditor: () => set({ editor: null }),

    saveEditor(shape, name, addToDesign) {
      const { editor } = get();
      if (!editor) return;
      const t = editor.target;
      if (t.kind === 'op') {
        // A part already in the design: its drawing changes, and its preset follows the mode.
        get().apply((d) =>
          updateOp(d, t.id, (op) => (op.type === 'primitive' ? { ...op, label: name, shape: structuredClone(shape), preset: customPresetFor(shape.mode), params: { ...defaultParams(getPreset(customPresetFor(shape.mode))), ...op.params } } : op)),
        );
      } else if (storage) {
        const entry = { id: t.kind === 'saved' ? t.id : newId('part'), name, shape: structuredClone(shape), updatedAt: Date.now() };
        set({ myParts: parts.savePart(storage, entry) });
      }
      if (addToDesign && t.kind !== 'op') get().addDrawnPart(shape, name);
      set({ editor: null });
    },

    saveToMyParts(shape, name) {
      if (storage) set({ myParts: parts.savePart(storage, { id: newId('part'), name, shape: structuredClone(shape), updatedAt: Date.now() }) });
    },

    deleteMyPart(id) {
      if (storage) set({ myParts: parts.deletePart(storage, id) });
    },

    removeOps(ids) {
      if (ids.length) get().apply((d) => removeOps(d, ids));
    },

    duplicate(id) {
      let created: OpId | null = null;
      get().apply((d) => {
        const box = unionBounds(bodiesOf(evaluateOps(d.ops).bodies, id));
        const width = box.isEmpty() ? 0 : box.max.x - box.min.x;
        const { design, id: copy } = duplicateOp(d, id, [width + GAP_MM, 0, 0]);
        created = copy;
        return design;
      });
      if (created) get().select(created);
    },

    stackSelection() {
      let created: OpId | null = null;
      get().apply((d) => {
        const { design, id } = createStack(d, get().selection);
        if (design !== d) created = id;
        return design;
      });
      if (created) get().select(created);
    },

    arrayOf(id, mode) {
      let created: OpId | null = null;
      get().apply((d) => {
        const box = unionBounds(bodiesOf(evaluateOps(d.ops).bodies, id));
        const spacing = (box.isEmpty() ? 50 : box.max.x - box.min.x) + GAP_MM;
        const { design, id: arr } = createArray(d, id, mode, spacing);
        created = arr;
        return design;
      });
      if (created) get().select(created);
    },

    combineSelection(mode) {
      let created: OpId | null = null;
      get().apply((d) => {
        const { design, id } = createBoolean(d, get().selection, mode);
        if (design !== d) created = id;
        return design;
      });
      if (created) get().select(created);
    },

    shell(id) {
      let created: OpId | null = null;
      get().apply((d) => {
        // Start from a sensible glass wall and an opening most of the way across.
        const box = unionBounds(bodiesOf(evaluateOps(d.ops).bodies, id));
        const width = box.isEmpty() ? 50 : Math.min(box.max.x - box.min.x, box.max.z - box.min.z);
        const wall = Math.min(4, width / 6);
        const { design, id: sh } = createShell(d, id, wall, Math.max(2, width * 0.6));
        if (design !== d) created = sh;
        return design;
      });
      if (created) get().select(created);
    },

    deform(id) {
      let created: OpId | null = null;
      get().apply((d) => {
        const box = unionBounds(bodiesOf(evaluateOps(d.ops).bodies, id));
        const size = box.isEmpty() ? 50 : Math.max(box.max.x - box.min.x, box.max.y - box.min.y);
        const { design, id: df } = createDeform(d, id, size * 0.25);
        if (design !== d) created = df;
        return design;
      });
      if (created) get().select(created);
    },

    randomizeDeform(id) {
      get().apply((d) => {
        const op = d.ops.find((o) => o.id === id);
        if (op?.type !== 'deform') return d;
        const box = unionBounds(evaluateOps(d.ops).bodies.filter((b) => b.owners.includes(id)));
        const size = box.isEmpty() ? 80 : Math.max(box.max.x - box.min.x, box.max.y - box.min.y);
        return updateOp(d, id, (o) => ({ ...o, ...randomDeform(Math.random, size) }));
      });
    },

    meltSelection() {
      let created: OpId | null = null;
      get().apply((d) => {
        const { design, id } = createBlend(d, get().selection, 6);
        if (design !== d) created = id;
        return design;
      });
      if (created) get().select(created);
    },

    moveToStack: (id, stackId, belowId) => get().apply((d) => moveToStack(d, id, stackId, belowId)),
    rename: (id, label) => get().apply((d) => updateOp(d, id, (op) => ({ ...op, label })), `label:${id}`),
    toggleSuppressed: (id) => get().apply((d) => updateOp(d, id, (op) => ({ ...op, suppressed: !op.suppressed }))),

    setParam(id, key, value, coalesceKey) {
      get().apply(
        (d) => updateOp(d, id, (op) => (op.type === 'primitive' ? { ...op, params: { ...op.params, [key]: value } } : op)),
        coalesceKey ?? `param:${id}:${key}`,
      );
    },

    setTransform(id, transform, coalesceKey) {
      get().apply((d) => updateOp(d, id, (op) => (op.type === 'array' ? op : { ...op, transform })), coalesceKey ?? `xform:${id}`);
    },

    patchOp(id, patch, field) {
      get().apply((d) => updateOp(d, id, (op) => (op.type === 'primitive' ? op : ({ ...op, ...patch } as OpNode))), `op:${id}:${field}`);
    },

    setMaterial(id, patch) {
      get().apply(
        (d) => ({ ...d, materials: { ...d.materials, [id]: { ...d.materials[id], ...patch } } }),
        `mat:${id}:${Object.keys(patch).sort().join(',')}`,
      );
    },

    setUnits: (units) => get().apply((d) => (d.displayUnits === units ? d : { ...d, displayUnits: units })),
    setDensity: (density) => get().apply((d) => ({ ...d, density_g_cm3: density }), 'density'),
    addNote: (text) => get().apply((d) => ({ ...d, shop: { ...d.shop, notes: [...d.shop.notes, { id: newId('note'), text, done: false }] } })),
    updateNote: (id, patch) =>
      get().apply((d) => ({ ...d, shop: { ...d.shop, notes: d.shop.notes.map((n) => (n.id === id ? { ...n, ...patch } : n)) } }), `note:${id}:${Object.keys(patch).join(',')}`),
    removeNote: (id) => get().apply((d) => ({ ...d, shop: { ...d.shop, notes: d.shop.notes.filter((n) => n.id !== id) } })),
    setScene: (patch) => get().apply((d) => ({ ...d, scene: { ...d.scene, ...patch } }), `scene:${Object.keys(patch).join(',')}`),
    setName: (name) => get().apply((d) => ({ ...d, name }), 'name'),
    setGizmo: (gizmo) => set({ gizmo }),
    setSnap: (snap) => set({ snap }),

    undo() {
      const { past, design, future } = get();
      if (!past.length) return;
      set({ design: past[past.length - 1], past: past.slice(0, -1), future: [design, ...future], lastKey: null });
      dropStaleSelection();
    },

    redo() {
      const { past, design, future } = get();
      if (!future.length) return;
      set({ design: future[0], past: [...past, design], future: future.slice(1), lastKey: null });
      dropStaleSelection();
    },

    openDesignFile(design) {
      persist();
      // Opening the same file twice shouldn't overwrite the first copy's later edits.
      const taken = get().library.some((e) => e.id === design.id) || design.id === get().design.id;
      open(taken ? { ...design, id: newId('design') } : design);
    },

    addImportedMesh(name, positions, units) {
      const def = getPreset('imported');
      const mesh = { id: newId('mesh'), name, triangles: positions.length / 9, data: encodePositions(positions) };
      const material = createMaterial();
      const id = newId('op');
      const params = { ...defaultParams(def), units };
      get().apply((d) => {
        const op: PrimitiveOp = {
          id,
          type: 'primitive',
          label: name.replace(/\.(stl|obj)$/i, ''),
          preset: 'imported',
          params,
          mesh,
          transform: { ...identityTransform(), position: [nextFreeX(d, sectionSize(def.section(params, undefined, mesh)).width), 0, 0] },
          materialId: material.id,
        };
        return { ...d, ops: [...d.ops, op], materials: { ...d.materials, [material.id]: material } };
      });
      get().select(id);
    },

    newDesign() {
      persist();
      open(createDesign());
    },

    duplicateDesign() {
      persist();
      open({ ...structuredClone(get().design), id: newId('design'), name: `${get().design.name} copy` });
    },

    openDesign(id) {
      if (!storage || id === get().design.id) return;
      persist();
      const d = library.loadDesign(storage, id);
      if (d) open(d);
    },

    deleteDesign(id) {
      if (!storage) return;
      library.deleteDesign(storage, id);
      if (id === get().design.id) {
        const next = library.listDesigns(storage)[0];
        const d = next ? library.loadDesign(storage, next.id) : null;
        open(d ?? createDesign());
      } else {
        set({ library: library.listDesigns(storage) });
      }
    },
  };
});

let drags = 0;
/**
 * Starts a drag in the view and returns its undo key: everything until `endDrag()` is
 * one undo step, and melts preview at draft resolution until then.
 */
export function beginDrag(): string {
  useDesign.setState({ dragging: true });
  return `drag:${++drags}`;
}

export function endDrag() {
  useDesign.setState({ dragging: false });
}

/** What a new drawing starts as: a vase profile, so there's something to push around. */
const STARTER_DRAWING: CustomShape = {
  mode: 'revolve',
  smooth: true,
  points: [
    [32, 0],
    [44, 38],
    [30, 88],
    [17, 118],
    [24, 140],
  ],
};

function dropStaleSelection() {
  const { selection, design } = useDesign.getState();
  const live = selection.filter((id) => design.ops.some((o) => o.id === id));
  if (live.length !== selection.length) useDesign.setState({ selection: live, selectedId: live[live.length - 1] ?? null });
}

/** New parts line up to the right of what's there, so nothing lands inside anything else. */
function nextFreeX(d: Design, width: number): number {
  const box = unionBounds(evaluateOps(d.ops).bodies);
  return box.isEmpty() ? 0 : box.max.x + GAP_MM + width / 2;
}

function starterDesign(): Design {
  const d = createDesign();
  const material = createMaterial({ name: 'Aqua', color: '#3fb6c2', colorDensity: 0.35 });
  const def = getPreset('egg');
  d.materials[material.id] = material;
  d.ops.push({
    id: newId('op'),
    type: 'primitive',
    label: 'Bubble',
    preset: 'egg',
    params: { ...defaultParams(def), wall: 4 },
    transform: identityTransform(),
    materialId: material.id,
  });
  return d;
}

function persist() {
  if (!storage) return;
  try {
    library.saveDesign(storage, useDesign.getState().design);
    useDesign.setState({ library: library.listDesigns(storage) });
  } catch {
    // storage full or blocked: autosave is best effort
  }
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
useDesign.subscribe((s, prev) => {
  if (s.design === prev.design) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 400);
});
