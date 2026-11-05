import { create } from 'zustand';
import type { Vec2 } from '../geom2d/polygon';
import { defaultParams } from '../modes/registry';
import type { Drawing, ModeId, ParamValues } from '../modes/types';

export type Tool = 'brush' | 'pen';
export type Background = 'black' | 'white' | 'gallery';
export type Gizmo = 'translate' | 'rotate' | 'scale';

/**
 * How a piece takes part in the mash. Every non-solo piece is fused into one
 * form: melts are smooth-unioned, then intersects keep only the overlap, then
 * carves are cut away.
 */
export type JoinMode = 'solo' | 'melt' | 'intersect' | 'carve';

export type Triple = [number, number, number];

export interface Transform {
  position: Triple;
  rotation: Triple; // Euler XYZ, radians
  scale: Triple;
}

export interface GlassParams {
  tint: string;
  density: number; // how deep the colour reads through the glass, 0..1
  roughness: number;
  thickness: number;
  opaque: boolean;
}

export interface Piece {
  id: string;
  name: string;
  drawing: Drawing | null;
  mode: ModeId;
  params: Partial<Record<ModeId, ParamValues>>; // kept per mode, so switching back restores sliders
  glass: GlassParams;
  join: JoinMode;
  transform: Transform;
}

/** What one undo step restores. */
interface Snapshot {
  pieces: Piece[];
  blend: number;
}

interface SceneState {
  pieces: Piece[];
  selectedId: string | null; // null before anything is drawn
  tool: Tool;
  background: Background;
  turntable: boolean;
  gizmo: Gizmo;
  dragging: boolean; // a gizmo drag is in progress; the mash drops to draft quality
  blend: number; // smooth-blend radius for the mash, in drawing units
  mashDetail: number; // grid cells across the mash's longest side (not shown in the UI)
  past: Snapshot[];
  future: Snapshot[];

  /** Snapshot before a change. Sliders call it on grab, so one drag = one undo step. */
  checkpoint(): void;
  undo(): void;
  redo(): void;
  select(id: string | null): void;
  /** Every finished drawing becomes a new piece, placed to overlap the last one. */
  addShape(outline: Vec2[]): void;
  duplicatePiece(): void;
  deletePiece(): void;
  clearAll(): void;
  setMode(mode: ModeId): void;
  setParam(key: string, value: number): void;
  setGlass(patch: Partial<GlassParams>, id?: string): void;
  setJoin(join: JoinMode): void;
  setTransform(id: string, t: Transform): void;
  setBlend(v: number): void;
  setGizmo(g: Gizmo): void;
  setDragging(d: boolean): void;
  setTool(tool: Tool): void;
  setBackground(bg: Background): void;
  toggleTurntable(): void;
}

const MAX_HISTORY = 120;
const IDENTITY: Transform = { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };

function makePiece(outline: Vec2[] | null, name: string, transform = IDENTITY): Piece {
  return {
    id: crypto.randomUUID(),
    name,
    drawing: outline ? { outline } : null,
    mode: 'inflate',
    params: defaultParams(),
    glass: { tint: '#7fb8c9', density: 0.35, roughness: 0.04, thickness: 1.2, opaque: false },
    join: 'melt',
    transform,
  };
}

function nextName(pieces: Piece[]): string {
  const used = new Set(pieces.map((p) => p.name));
  let n = pieces.length + 1;
  while (used.has(`Piece ${n}`)) n++;
  return `Piece ${n}`;
}

/** Up and to the right of a piece, so a new one half-overlaps it and starts melting in. */
function besides(t: Transform): Transform {
  const [x, y, z] = t.position;
  return { ...t, position: [x + 0.55, y + 0.25, z + 0.15] };
}

export const useScene = create<SceneState>()((set, get) => {
  const updateSelected = (fn: (p: Piece) => Piece) =>
    set((s) => ({ pieces: s.pieces.map((p) => (p.id === s.selectedId ? fn(p) : p)) }));
  /** After undo/redo the selected piece may no longer exist. */
  const keepSelection = (pieces: Piece[]) =>
    pieces.some((p) => p.id === get().selectedId) ? get().selectedId : (pieces[pieces.length - 1]?.id ?? null);

  return {
    pieces: [],
    selectedId: null,
    tool: 'brush',
    background: 'gallery',
    turntable: false,
    gizmo: 'translate',
    dragging: false,
    blend: 0.18,
    mashDetail: 96,
    past: [],
    future: [],

    checkpoint() {
      const { pieces, blend, past } = get();
      const top = past[past.length - 1];
      if (top && top.pieces === pieces && top.blend === blend) return;
      set({ past: [...past.slice(-MAX_HISTORY + 1), { pieces, blend }], future: [] });
    },
    undo() {
      const { past, pieces, blend, future } = get();
      if (!past.length) return;
      const prev = past[past.length - 1];
      set({ ...prev, selectedId: keepSelection(prev.pieces), past: past.slice(0, -1), future: [{ pieces, blend }, ...future] });
    },
    redo() {
      const { past, pieces, blend, future } = get();
      if (!future.length) return;
      const next = future[0];
      set({ ...next, selectedId: keepSelection(next.pieces), past: [...past, { pieces, blend }], future: future.slice(1) });
    },
    select: (selectedId) => set({ selectedId }),
    addShape(outline) {
      get().checkpoint();
      const { pieces, selectedId } = get();
      const from = pieces.find((p) => p.id === selectedId);
      const piece = makePiece(outline, nextName(pieces), from ? besides(from.transform) : IDENTITY);
      set({ pieces: [...pieces, piece], selectedId: piece.id });
    },
    duplicatePiece() {
      const { pieces, selectedId } = get();
      const from = pieces.find((p) => p.id === selectedId);
      if (!from) return;
      get().checkpoint();
      const piece: Piece = { ...from, id: crypto.randomUUID(), name: nextName(pieces), transform: besides(from.transform) };
      set({ pieces: [...pieces, piece], selectedId: piece.id });
    },
    deletePiece() {
      const { pieces, selectedId } = get();
      if (!selectedId) return;
      get().checkpoint();
      const rest = pieces.filter((p) => p.id !== selectedId);
      set({ pieces: rest, selectedId: rest[rest.length - 1]?.id ?? null });
    },
    clearAll() {
      if (!get().pieces.length) return;
      get().checkpoint();
      set({ pieces: [], selectedId: null });
    },
    setMode(mode) {
      get().checkpoint();
      updateSelected((p) => ({ ...p, mode }));
    },
    setParam(key, value) {
      updateSelected((p) => ({ ...p, params: { ...p.params, [p.mode]: { ...p.params[p.mode], [key]: value } } }));
    },
    setGlass(patch, id) {
      const target = id ?? get().selectedId;
      set((s) => ({ pieces: s.pieces.map((p) => (p.id === target ? { ...p, glass: { ...p.glass, ...patch } } : p)) }));
    },
    setJoin(join) {
      get().checkpoint();
      updateSelected((p) => ({ ...p, join }));
    },
    setTransform(id, transform) {
      set((s) => ({ pieces: s.pieces.map((p) => (p.id === id ? { ...p, transform } : p)) }));
    },
    setBlend: (blend) => set({ blend }),
    setGizmo: (gizmo) => set({ gizmo }),
    setDragging: (dragging) => set({ dragging }),
    setTool: (tool) => set({ tool }),
    setBackground: (background) => set({ background }),
    toggleTurntable: () => set((s) => ({ turntable: !s.turntable })),
  };
});

export const selectPiece = (s: SceneState): Piece | null => s.pieces.find((p) => p.id === s.selectedId) ?? null;

const JOIN_ORDER: Record<JoinMode, number> = { solo: -1, melt: 0, intersect: 1, carve: 2 };

/**
 * The pieces fused into the mash, in the order they're applied. A mash needs
 * at least two drawn pieces; a lone non-solo piece just renders as itself.
 */
export function mashMembers(pieces: Piece[]): Piece[] {
  const members = pieces.filter((p) => p.join !== 'solo' && p.drawing);
  if (members.length < 2) return [];
  return members.slice().sort((a, b) => JOIN_ORDER[a.join] - JOIN_ORDER[b.join]);
}
