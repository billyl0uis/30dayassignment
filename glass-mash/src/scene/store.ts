import { create } from 'zustand';
import { starterOutline } from '../draw/stroke';
import type { Vec2 } from '../geom2d/polygon';
import { defaultParams } from '../modes/registry';
import type { Drawing, ModeId, ParamValues } from '../modes/types';

export type Tool = 'brush' | 'pen';
export type Background = 'black' | 'white' | 'gallery';

export interface GlassParams {
  tint: string;
  density: number; // how deep the colour reads through the glass, 0..1
  roughness: number;
  thickness: number;
  opaque: boolean;
}

export interface Piece {
  id: string;
  drawing: Drawing | null;
  mode: ModeId;
  params: Partial<Record<ModeId, ParamValues>>; // kept per mode, so switching back restores sliders
  glass: GlassParams;
}

interface SceneState {
  pieces: Piece[];
  selectedId: string;
  tool: Tool;
  background: Background;
  turntable: boolean;
  past: Piece[][];
  future: Piece[][];

  /** Snapshot before a change. Sliders call it on grab, so one drag = one undo step. */
  checkpoint(): void;
  undo(): void;
  redo(): void;
  setDrawing(outline: Vec2[] | null): void;
  setMode(mode: ModeId): void;
  setParam(key: string, value: number): void;
  setGlass(patch: Partial<GlassParams>): void;
  setTool(tool: Tool): void;
  setBackground(bg: Background): void;
  toggleTurntable(): void;
}

const MAX_HISTORY = 120;

function makePiece(outline: Vec2[] | null): Piece {
  return {
    id: crypto.randomUUID(),
    drawing: outline ? { outline } : null,
    mode: 'inflate',
    params: defaultParams(),
    glass: { tint: '#7fb8c9', density: 0.35, roughness: 0.04, thickness: 1.2, opaque: false },
  };
}

const first = makePiece(starterOutline());

export const useScene = create<SceneState>()((set, get) => {
  const updateSelected = (fn: (p: Piece) => Piece) =>
    set((s) => ({ pieces: s.pieces.map((p) => (p.id === s.selectedId ? fn(p) : p)) }));

  return {
    pieces: [first],
    selectedId: first.id,
    tool: 'brush',
    background: 'gallery',
    turntable: false,
    past: [],
    future: [],

    checkpoint() {
      const { pieces, past } = get();
      if (past[past.length - 1] === pieces) return;
      set({ past: [...past.slice(-MAX_HISTORY + 1), pieces], future: [] });
    },
    undo() {
      const { past, pieces, future } = get();
      if (!past.length) return;
      set({ pieces: past[past.length - 1], past: past.slice(0, -1), future: [pieces, ...future] });
    },
    redo() {
      const { past, pieces, future } = get();
      if (!future.length) return;
      set({ pieces: future[0], past: [...past, pieces], future: future.slice(1) });
    },
    setDrawing(outline) {
      get().checkpoint();
      updateSelected((p) => ({ ...p, drawing: outline ? { outline } : null }));
    },
    setMode(mode) {
      get().checkpoint();
      updateSelected((p) => ({ ...p, mode }));
    },
    setParam(key, value) {
      updateSelected((p) => ({ ...p, params: { ...p.params, [p.mode]: { ...p.params[p.mode], [key]: value } } }));
    },
    setGlass(patch) {
      updateSelected((p) => ({ ...p, glass: { ...p.glass, ...patch } }));
    },
    setTool: (tool) => set({ tool }),
    setBackground: (background) => set({ background }),
    toggleTurntable: () => set((s) => ({ turntable: !s.turntable })),
  };
});

export const selectPiece = (s: SceneState) => s.pieces.find((p) => p.id === s.selectedId)!;
