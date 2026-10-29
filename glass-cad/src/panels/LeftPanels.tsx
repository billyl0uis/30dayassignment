import { useState } from 'react';
import { PRESETS, getPreset } from '../presets/registry';
import { defaultParams, withDefaults } from '../presets/types';
import type { CustomShape, OpId, OpNode } from '../model/types';
import { customPresetFor } from '../presets/custom';
import { consumers, subtree } from '../model/tree';
import { useDesign } from '../store/designStore';
import { useEvaluation } from '../store/useEvaluation';
import { PresetIcon } from './PresetIcon';

const FAMILIES = [
  { family: 'basic', label: 'Basic shapes' },
  { family: 'glass', label: 'Glass parts' },
  { family: 'organic', label: 'Bone & growth' },
] as const;

/** The shape palette, one collapsible group per family; the open groups are remembered. */
export function PresetPalette() {
  const addPart = useDesign((s) => s.addPart);
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem('glass-cad:palette') ?? '') as Record<string, boolean>;
    } catch {
      return { basic: true, glass: true, organic: false };
    }
  });
  const toggle = (family: string, isOpen: boolean) => {
    const next = { ...open, [family]: isOpen };
    setOpen(next);
    try {
      localStorage.setItem('glass-cad:palette', JSON.stringify(next));
    } catch {
      // remembering which groups are open is only a convenience
    }
  };
  return (
    <section className="panel">
      <h2>Shapes</h2>
      {FAMILIES.map(({ family, label }) => (
        <details key={family} className="family" open={open[family] ?? family !== 'organic'} onToggle={(e) => toggle(family, (e.target as HTMLDetailsElement).open)}>
          <summary>{label}</summary>
          <div className="preset-grid">
            {PRESETS.filter((d) => d.family === family).map((def) => (
              <button key={def.id} className="preset" onClick={() => addPart(def.id)} title={`Add ${def.label.toLowerCase()}`}>
                <PresetIcon section={def.section(defaultParams(def))} />
                <span>{def.label}</span>
              </button>
            ))}
          </div>
        </details>
      ))}
    </section>
  );
}

/** Saved drawings: click to add one, ✎ to change it, × to forget it. */
export function MyParts() {
  const myParts = useDesign((s) => s.myParts);
  const { addDrawnPart, openEditor, deleteMyPart } = useDesign.getState();
  return (
    <section className="panel">
      <h2>My parts</h2>
      <button className="btn small draw-btn" onClick={() => openEditor({ kind: 'new' })}>
        Draw a part…
      </button>
      {myParts.length === 0 ? (
        <p className="note flush">Drawings you save show up here, ready for any design.</p>
      ) : (
        <ul className="parts my-parts">
          {myParts.map((p) => (
            <li key={p.id}>
              <button className="part-row" onClick={() => addDrawnPart(p.shape, p.name)} title={`Add ${p.name}`}>
                <span className="part-icon">
                  <DrawnIcon shape={p.shape} />
                </span>
                <span className="part-name">{p.name}</span>
                <span className="io-tag">{p.shape.mode}</span>
              </button>
              <button className="icon-btn" onClick={() => openEditor({ kind: 'saved', id: p.id })} aria-label={`Edit ${p.name}`} title="Edit drawing">
                ✎
              </button>
              <button
                className="icon-btn"
                onClick={() => window.confirm(`Forget "${p.name}"? Parts already in designs keep their own copy.`) && deleteMyPart(p.id)}
                aria-label={`Delete ${p.name}`}
                title="Delete from My Parts"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DrawnIcon({ shape }: { shape: CustomShape }) {
  try {
    const def = getPreset(customPresetFor(shape.mode));
    return <PresetIcon section={def.section(defaultParams(def), shape)} size={22} />;
  } catch {
    return null;
  }
}

/** Where a dragged row would land: on top of a part in a stack, into a stack, or out to the top level. */
type DropTarget = { stackId: OpId | null; belowId?: OpId; marker: string };

/**
 * The feature tree. The op list is replayed top to bottom; stacks and arrays show the
 * parts they use nested underneath. Rows drag to reorder a stack or move parts in and out.
 */
export function FeatureTree() {
  const ops = useDesign((s) => s.design.ops);
  const selection = useDesign((s) => s.selection);
  const { stackSelection, arrayOf, duplicate, moveToStack, combineSelection, shell, meltSelection, deform } = useDesign.getState();
  const { errors } = useEvaluation();
  const [drop, setDrop] = useState<DropTarget | null>(null);
  const [dragId, setDragId] = useState<OpId | null>(null);

  const cons = consumers(ops);
  const byId = new Map(ops.map((o) => [o.id, o]));
  const roots = ops.filter((o) => !cons.has(o.id));
  const primary = selection[selection.length - 1];
  const freeSelected = selection.filter((id) => !cons.has(id) || cons.get(id)!.type === 'stack');
  // Inputs of an array, boolean or shell belong to it; only free parts (or stack children) can be wrapped again.
  const canWrap = !!primary && (!cons.has(primary) || cons.get(primary)!.type === 'stack');
  const canCombine = selection.length >= 2 && canWrap && selection.slice(0, 1).every((id) => freeSelected.includes(id));

  const finishDrop = () => {
    if (dragId && drop) moveToStack(dragId, drop.stackId, drop.belowId);
    setDrop(null);
    setDragId(null);
  };

  const dragProps = (target: DropTarget) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!dragId || (target.stackId && subtree(ops, dragId).has(target.stackId))) return;
      e.preventDefault();
      e.stopPropagation();
      if (drop?.marker !== target.marker) setDrop(target);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      finishDrop();
    },
  });

  const renderNode = (op: OpNode, parent: OpNode | null, depth: number): React.ReactNode => {
    const inStack = parent?.type === 'stack';
    // Dropping on a row inside a stack puts the dragged part right on top of it.
    const before: DropTarget = inStack ? { stackId: parent.id, belowId: op.id, marker: `on:${op.id}` } : { stackId: null, marker: 'root' };
    const into: DropTarget | null = op.type === 'stack' ? { stackId: op.id, marker: `into:${op.id}` } : null;
    const children =
      op.type === 'stack'
        ? [...op.children].reverse() // drawn top of the piece first, like the piece itself
        : op.type === 'boolean'
          ? [op.target, ...op.tools]
          : op.type === 'blend'
            ? op.inputs
            : op.type === 'primitive'
            ? []
            : [op.source];
    return (
      <li key={op.id}>
        <TreeRow
          op={op}
          depth={depth}
          draggable={!parent || parent.type === 'stack'}
          role={parent?.type === 'boolean' ? (parent.target === op.id ? 'target' : 'tool') : undefined}
          error={errors.get(op.id)}
          dropMarker={!drop ? null : inStack && drop.marker === before.marker ? 'line' : drop.marker === into?.marker ? 'into' : null}
          onDragStart={() => setDragId(op.id)}
          onDragEnd={() => {
            setDrop(null);
            setDragId(null);
          }}
          {...dragProps(into ?? before)}
        />
        {children.length > 0 && (
          <ul className="tree">
            {children.map((cid) => {
              const child = byId.get(cid);
              return child ? renderNode(child, op, depth + 1) : null;
            })}
          </ul>
        )}
      </li>
    );
  };

  return (
    <section className="panel grow" {...dragProps({ stackId: null, marker: 'root' })}>
      <h2>Feature tree</h2>
      <div className="tree-actions">
        <button className="btn small" disabled={!freeSelected.length} onClick={stackSelection} title="Stack the selected parts on one axis (⇧-click to pick several)">
          Stack
        </button>
        <button className="btn small" disabled={!canWrap} onClick={() => arrayOf(primary, 'radial')} title="Copies around the vertical axis">
          Radial
        </button>
        <button className="btn small" disabled={!canWrap} onClick={() => arrayOf(primary, 'linear')} title="Copies in a row">
          Linear
        </button>
        <button className="btn small" disabled={!primary} onClick={() => duplicate(primary)} title="Duplicate (⌘D)">
          Duplicate
        </button>
      </div>
      <div className="tree-actions">
        <button className="btn small" disabled={!canCombine} onClick={() => combineSelection('union')} title="Fuse the selected parts into one piece">
          Union
        </button>
        <button className="btn small" disabled={!canCombine} onClick={() => combineSelection('subtract')} title="Cut the other selected parts out of the first one picked">
          Subtract
        </button>
        <button className="btn small" disabled={!canCombine} onClick={() => combineSelection('intersect')} title="Keep only where the selected parts overlap">
          Intersect
        </button>
        <button className="btn small" disabled={!canWrap} onClick={() => shell(primary)} title="Hollow to an even wall with an opening">
          Shell
        </button>
        <button className="btn small" disabled={!canCombine} onClick={meltSelection} title="Melt the selected parts together with smooth fillets where they meet">
          Melt
        </button>
        <button className="btn small" disabled={!canWrap} onClick={() => deform(primary)} title="Twist, bend, sag, rib, pinch or roughen the selected piece">
          Deform
        </button>
      </div>
      {ops.length === 0 && <p className="empty">Pick a shape above to start.</p>}
      <ul className={`tree root${drop?.marker === 'root' && dragId && cons.has(dragId) ? ' drop-root' : ''}`}>
        {roots.map((op) => renderNode(op, null, 0))}
      </ul>
      {ops.length > 1 && (
        <p className="note">
          ⇧-click to select several; for Subtract, pick the part to keep first. Drag parts onto a stack to add them, or out to the bottom to take them off.
        </p>
      )}
    </section>
  );
}

function TreeRow(props: {
  op: OpNode;
  depth: number;
  draggable: boolean;
  dropMarker: 'line' | 'into' | null;
  role?: 'target' | 'tool';
  error?: string;
  onDragStart(): void;
  onDragEnd(): void;
  onDragOver(e: React.DragEvent): void;
  onDrop(e: React.DragEvent): void;
}) {
  const { op } = props;
  const selected = useDesign((s) => s.selection.includes(op.id));
  const primary = useDesign((s) => s.selectedId === op.id);
  const color = useDesign((s) => (op.type === 'primitive' ? s.design.materials[op.materialId]?.color : undefined));
  const { select, removeOps, toggleSuppressed } = useDesign.getState();
  const cls = ['tree-row', selected && 'selected', primary && 'primary', op.suppressed && 'suppressed', props.dropMarker && `drop-${props.dropMarker}`]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={cls}
      style={{ paddingLeft: 4 + props.depth * 14 }}
      draggable={props.draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', op.id);
        e.dataTransfer.effectAllowed = 'move';
        props.onDragStart();
      }}
      onDragEnd={props.onDragEnd}
      onDragOver={props.onDragOver}
      onDrop={props.onDrop}
    >
      <button className="part-row" onClick={(e) => select(op.id, e.shiftKey || e.metaKey || e.ctrlKey)}>
        <span className="part-icon" style={{ color }}>
          <OpIcon op={op} />
        </span>
        <span className="part-name">{op.label}</span>
        {props.role && <span className="io-tag">{props.role}</span>}
        {props.error && (
          <span className="row-error" title={props.error} aria-label={`Problem: ${props.error}`}>
            !
          </span>
        )}
      </button>
      <button
        className="icon-btn eye"
        onClick={() => toggleSuppressed(op.id)}
        aria-label={op.suppressed ? `Show ${op.label}` : `Hide ${op.label}`}
        aria-pressed={!op.suppressed}
        title={op.suppressed ? 'Suppressed: click to turn back on' : 'Suppress (skip this feature)'}
      >
        {op.suppressed ? '○' : '●'}
      </button>
      <button className="icon-btn" onClick={() => removeOps([op.id])} aria-label={`Delete ${op.label}`} title="Delete">
        ×
      </button>
    </div>
  );
}

function OpIcon({ op }: { op: OpNode }) {
  if (op.type === 'primitive' && op.mesh) {
    return (
      <svg width={22} height={22} viewBox="0 0 22 22" aria-hidden fill="none" stroke="currentColor" strokeWidth={1.3}>
        <path d="M11 3 19 8v7l-8 4-8-4V8z M3 8l8 4 8-4M11 12v7" />
      </svg>
    );
  }
  if (op.type === 'primitive') {
    const def = getPreset(op.preset);
    try {
      return <PresetIcon section={def.section(withDefaults(def, op.params), op.shape)} size={22} />;
    } catch {
      return null; // an unfinished drawing has nothing to sketch yet
    }
  }
  return (
    <svg width={22} height={22} viewBox="0 0 22 22" aria-hidden fill="none" stroke="currentColor" strokeWidth={1.5} color="var(--accent)">
      {op.type === 'blend' ? (
        <path d="M4 15c0-4 3-6 5-6s2.5 2 4 2 2-3 4-3 2 3 2 7z" fill="currentColor" fillOpacity={0.25} />
      ) : op.type === 'boolean' ? (
        op.mode === 'union' ? (
          <path d="M8 4a5 5 0 1 0 0 10 5 5 0 0 0 6 4.6A5 5 0 1 0 14 8.4 5 5 0 0 0 8 4z" />
        ) : op.mode === 'subtract' ? (
          <>
            <circle cx={9} cy={11} r={6} />
            <circle cx={15} cy={11} r={5} strokeDasharray="2 2" />
          </>
        ) : (
          <>
            <circle cx={8.5} cy={11} r={5.5} strokeDasharray="2 2" />
            <circle cx={13.5} cy={11} r={5.5} strokeDasharray="2 2" />
            <path d="M11 6.2a5.5 5.5 0 0 1 0 9.6a5.5 5.5 0 0 1 0-9.6z" fill="currentColor" fillOpacity={0.35} />
          </>
        )
      ) : op.type === 'deform' ? (
        <path d="M7 3c4 3-2 5 2 8s-2 5 2 8M13 3c4 3-2 5 2 8s-2 5 2 8" />
      ) : op.type === 'shell' ? (
        <path d="M6 5v10a5 5 0 0 0 10 0V5M8.5 5v10a2.5 2.5 0 0 0 5 0V5" />
      ) : op.type === 'stack' ? (
        <>
          <rect x={7} y={3} width={8} height={5} rx={2} />
          <rect x={5} y={9} width={12} height={4} rx={1.5} />
          <rect x={4} y={14} width={14} height={5} rx={2} />
        </>
      ) : op.mode === 'radial' ? (
        <>
          <circle cx={11} cy={11} r={7} strokeDasharray="2 2" />
          <circle cx={11} cy={4} r={2} />
          <circle cx={17} cy={14.5} r={2} />
          <circle cx={5} cy={14.5} r={2} />
        </>
      ) : (
        <>
          <circle cx={4.5} cy={11} r={2.5} />
          <circle cx={11} cy={11} r={2.5} />
          <circle cx={17.5} cy={11} r={2.5} />
        </>
      )}
    </svg>
  );
}
