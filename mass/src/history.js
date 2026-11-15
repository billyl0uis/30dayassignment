// Undo/redo by stored diffs: each entry keeps the op plus the box of voxels
// it changed, before and after. Undo/redo copy a region back — no recompute.
// The op list alone can rebuild everything (resolution change, presets).

import { diffBox } from './ops.js';

function extract(vol, arr, b) {
  const { n } = vol;
  const X = b.i1 - b.i0 + 1, out = new arr.constructor(X * (b.j1 - b.j0 + 1) * (b.k1 - b.k0 + 1));
  let o = 0;
  for (let k = b.k0; k <= b.k1; k++) for (let j = b.j0; j <= b.j1; j++) {
    const s = b.i0 + n * (j + n * k);
    out.set(arr.subarray(s, s + X), o); o += X;
  }
  return out;
}
function inject(vol, arr, b, data) {
  const { n } = vol;
  const X = b.i1 - b.i0 + 1;
  let o = 0;
  for (let k = b.k0; k <= b.k1; k++) for (let j = b.j0; j <= b.j1; j++) {
    arr.set(data.subarray(o, o + X), b.i0 + n * (j + n * k)); o += X;
  }
}
const union = (a, b) => ({
  i0: Math.min(a.i0, b.i0), i1: Math.max(a.i1, b.i1), j0: Math.min(a.j0, b.j0), j1: Math.max(a.j1, b.j1),
  k0: Math.min(a.k0, b.k0), k1: Math.max(a.k1, b.k1),
});

export class History {
  constructor() { this.entries = []; this.future = []; }

  // First entry: the op that made the starting glass. Not undoable.
  reset(op, vol) {
    this.entries = [{ op, dV: vol.volumeCm3(), diff: null }];
    this.future = [];
  }

  // oldVol → newVol was produced by `op`. Store the changed region.
  record(oldVol, newVol, op, dV) {
    let box = diffBox(newVol, oldVol.sdf, oldVol.color);
    const top = this.entries[this.entries.length - 1];
    // Consecutive sag ticks fold into one entry.
    if (op.type === 'sag' && top?.op.type === 'sag' && top.diff && !this.future.length) {
      const prev = top.diff;
      box = box ? union(box, prev.box) : prev.box;
      // "before" for the union = state before the first tick: the old entry's
      // before inside its box, the pre-tick state everywhere else.
      const bs = oldVol.sdf.slice(), bc = oldVol.color.slice();
      inject(oldVol, bs, prev.box, prev.before.sdf);
      inject(oldVol, bc, prev.box, prev.before.color);
      top.op = { type: 'sag', ticks: [...top.op.ticks, ...op.ticks] };
      top.dV += dV;
      top.diff = this.makeDiff(box, { sdf: bs, color: bc }, newVol, prev.metaBefore, newVol.meta);
      return;
    }
    this.entries.push({ op, dV, diff: box ? this.makeDiff(box, oldVol, newVol, oldVol.meta, newVol.meta) : { box: null, metaBefore: structuredClone(oldVol.meta), metaAfter: structuredClone(newVol.meta) } });
    this.future = [];
  }

  makeDiff(box, before, after, metaBefore, metaAfter) {
    const v = after;
    return {
      box,
      before: { sdf: extract(v, before.sdf, box), color: extract(v, before.color, box) },
      after: { sdf: extract(v, after.sdf, box), color: extract(v, after.color, box) },
      metaBefore: structuredClone(metaBefore), metaAfter: structuredClone(metaAfter),
    };
  }

  canUndo() { return this.entries.length > 1; }
  canRedo() { return this.future.length > 0; }

  undo(vol) {
    if (!this.canUndo()) return false;
    const e = this.entries.pop();
    this.apply(vol, e.diff, 'before');
    this.future.push(e);
    return true;
  }
  redo(vol) {
    if (!this.canRedo()) return false;
    const e = this.future.pop();
    this.apply(vol, e.diff, 'after');
    this.entries.push(e);
    return true;
  }
  apply(vol, diff, which) {
    if (diff.box) {
      inject(vol, vol.sdf, diff.box, diff[which].sdf);
      inject(vol, vol.color, diff.box, diff[which].color);
    }
    vol.meta = structuredClone(which === 'before' ? diff.metaBefore : diff.metaAfter);
  }

  ops() { return this.entries.map((e) => e.op); }
}
