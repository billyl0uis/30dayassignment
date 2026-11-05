import { selectPiece, useScene, type Gizmo, type JoinMode } from '../scene/store';

const HANDLES: { id: Gizmo; label: string; key: string }[] = [
  { id: 'translate', label: 'Move', key: 'W' },
  { id: 'rotate', label: 'Turn', key: 'E' },
  { id: 'scale', label: 'Size', key: 'R' },
];

const JOINS: { id: JoinMode; label: string; tip: string }[] = [
  { id: 'melt', label: 'Melt in', tip: 'Fuse this piece into the others' },
  { id: 'carve', label: 'Cut out', tip: "Use this piece's shape to cut a hole" },
  { id: 'solo', label: 'Keep apart', tip: 'A separate object that does not join' },
];

/** Everything you can do to the selected piece, in one strip under the 3D view. */
export function PieceBar() {
  const piece = useScene(selectPiece);
  const gizmo = useScene((s) => s.gizmo);
  const { setGizmo, setJoin, duplicatePiece, deletePiece } = useScene.getState();
  if (!piece) return null;

  return (
    <div className="piece-bar" role="toolbar" aria-label={`${piece.name} tools`}>
      <div className="seg">
        {HANDLES.map((h) => (
          <button key={h.id} className={gizmo === h.id ? 'on' : ''} title={`${h.label} (${h.key})`} onClick={() => setGizmo(h.id)}>
            {h.label}
          </button>
        ))}
      </div>
      <div className="seg">
        {JOINS.map((j) => (
          <button key={j.id} className={piece.join === j.id ? 'on' : ''} title={j.tip} onClick={() => setJoin(j.id)}>
            {j.label}
          </button>
        ))}
      </div>
      <div className="seg">
        <button onClick={duplicatePiece}>Copy</button>
        <button onClick={deletePiece}>Delete</button>
      </div>
    </div>
  );
}
