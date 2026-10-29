import { useEffect, useMemo, useRef, useState } from 'react';
import { downloadUrl, fileStem } from '../files/download';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { Bounds, OrbitControls, TransformControls, useBounds } from '@react-three/drei';
import type { TransformControls as TransformControlsImpl } from 'three-stdlib';
import { beginDrag, endDrag, useDesign } from '../store/designStore';
import { useEvaluation } from '../store/useEvaluation';
import { bodiesOf, ghostsFor, unionBounds, type Body } from '../engine/evaluate';
import { formatLength, MM_PER_CM, MM_PER_IN } from '../model/units';
import type { OpId, PrimitiveOp, StackOp, Units, Vec3 } from '../model/types';
import { placedByStack } from '../model/tree';
import { GlassMaterial } from './GlassMaterial';
import { ParamHandles } from './ParamHandles';
import { Backdrop, BACKGROUNDS, FloorShadows, GridFloor, StudioEnvironment, type BackgroundId } from './Studio';

export function Viewport() {
  const { bodies } = useEvaluation();
  const opCount = useDesign((s) => s.design.ops.length);
  const materials = useDesign((s) => s.design.materials);
  const units = useDesign((s) => s.design.displayUnits);
  const selection = useDesign((s) => s.selection);
  const selectedId = useDesign((s) => s.selectedId);
  const scene = useDesign((s) => s.design.scene);
  const bg = BACKGROUNDS[(scene.background as BackgroundId) in BACKGROUNDS ? (scene.background as BackgroundId) : 'studio'];
  const gizmoRef = useRef<TransformControlsImpl>(null);
  const cell = units === 'in' ? MM_PER_IN : MM_PER_CM;
  const ghosts = useMemo(() => ghostsFor(bodies, selection), [bodies, selection]);
  const primaryBox = useMemo(() => (selectedId ? unionBounds(bodiesOf(bodies, selectedId)) : null), [bodies, selectedId]);
  const labels = useMemo(() => (primaryBox && !primaryBox.isEmpty() ? dimensionLabels(primaryBox, units) : []), [primaryBox, units]);
  const labelEls = useRef<(HTMLDivElement | null)[]>([]);

  return (
    <>
      <Canvas
        camera={{ position: [260, 210, 380], fov: 32, near: 1, far: 20000 }}
        dpr={[1, 2]}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, preserveDrawingBuffer: true }}
        onPointerMissed={() => {
          // The gizmo isn't one of r3f's event targets, so grabbing it reads as a miss.
          // Its `axis` is set while the pointer is over a handle; three types it as private.
          const hovered = (gizmoRef.current as unknown as { axis: string | null } | null)?.axis;
          if (hovered == null) useDesign.getState().select(null);
        }}
      >
        <Backdrop floor={bg.floor} horizon={bg.horizon} sky={bg.sky} />
        <StudioEnvironment />
        <Bounds margin={1.5}>
          {bodies.map((b) => (
            <mesh
              key={b.key}
              geometry={b.geometry}
              matrix={b.matrix}
              matrixAutoUpdate={false}
              onClick={(e) => {
                e.stopPropagation();
                pick(b, e.shiftKey || e.metaKey || e.ctrlKey);
              }}
            >
              <GlassMaterial glass={materials[b.materialId]} thickness={b.thickness_mm} center={axisOf(b)} />
            </mesh>
          ))}
          <FitWhenPartsChange count={opCount} />
        </Bounds>
        {ghosts.map((g) => (
          <Ghost key={`ghost:${g.key}`} body={g} />
        ))}
        {selection.map((id) => (
          <SelectionBox key={id} id={id} bodies={bodies} primary={id === selectedId} />
        ))}
        {selectedId && <SelectedTools id={selectedId} bodies={bodies} gizmoRef={gizmoRef} />}
        <LabelTracker anchors={labels.map((l) => l.at)} elements={labelEls} />
        <GridFloor
          cell={cell}
          every={units === 'in' ? 6 : 10}
          color={bg.floor}
          line={scene.grid === false ? bg.floor : bg.line}
          major={scene.grid === false ? bg.floor : bg.major}
          fadeTo={bg.horizon}
        />
        <FloorShadows />
        <OrbitControls
          makeDefault
          target={[0, 60, 0]}
          minDistance={40}
          maxDistance={4000}
          maxPolarAngle={Math.PI * 0.495}
          autoRotate={scene.turntable}
          autoRotateSpeed={1.2}
        />
      </Canvas>
      {labels.map((l, i) => (
        <div key={l.key} ref={(el) => void (labelEls.current[i] = el)} className="dim-label">
          {l.text}
        </div>
      ))}
      <ViewToolbar />
    </>
  );
}

/** The middle of a body's footprint in its own space: where optic ribs turn around. */
function axisOf(b: Body): THREE.Vector3 {
  const c = b.geometry.boundingBox?.getCenter(new THREE.Vector3()) ?? new THREE.Vector3();
  return c.setY(0);
}

/**
 * Clicking a part selects it; clicking it again climbs to the stack or array holding
 * it, the way CAD tools let you reach a group by clicking through.
 */
function pick(body: Body, additive: boolean) {
  const { selectedId, select } = useDesign.getState();
  if (additive) return select(body.owners[0], true);
  const at = selectedId ? body.owners.indexOf(selectedId) : -1;
  select(body.owners[at >= 0 ? (at + 1) % body.owners.length : 0]);
}

/** The gizmo and the size handles for whatever is selected. */
function SelectedTools({ id, bodies, gizmoRef }: { id: OpId; bodies: Body[]; gizmoRef: React.RefObject<TransformControlsImpl | null> }) {
  const op = useDesign((s) => s.design.ops.find((o) => o.id === id));
  const ops = useDesign((s) => s.design.ops);
  if (!op || op.suppressed) return null;
  const original = bodiesOf(bodies, id).find((b) => b.owners[0] === id && b.copyLevel < 0);
  return (
    <>
      {op.type === 'primitive' && original && <ParamHandles op={op} body={original} />}
      {(op.type === 'primitive' || op.type === 'stack') && !placedByStack(ops, id) && <Gizmo op={op} gizmoRef={gizmoRef} />}
    </>
  );
}

/** Move / rotate / scale. It drives a stand-in object, and every change is written back to the op. */
function Gizmo({ op, gizmoRef }: { op: PrimitiveOp | StackOp; gizmoRef: React.RefObject<TransformControlsImpl | null> }) {
  const proxy = useRef<THREE.Group>(null);
  const dragging = useRef<string | null>(null);
  const mode = useDesign((s) => s.gizmo);
  const snap = useDesign((s) => s.snap);
  const units = useDesign((s) => s.design.displayUnits);
  const { position, rotation, scale } = op.transform;

  useEffect(() => {
    if (dragging.current || !proxy.current) return;
    proxy.current.position.set(...position);
    proxy.current.rotation.set(...rotation);
    proxy.current.scale.set(...scale);
  }, [position, rotation, scale]);

  const write = () => {
    const g = proxy.current;
    if (!g) return;
    const transform = { position: g.position.toArray() as Vec3, rotation: [g.rotation.x, g.rotation.y, g.rotation.z] as Vec3, scale: g.scale.toArray() as Vec3 };
    useDesign.getState().setTransform(op.id, transform, dragging.current ?? undefined);
  };

  return (
    <>
      <group ref={proxy} />
      <TransformControls
        ref={gizmoRef}
        object={proxy as React.RefObject<THREE.Object3D>}
        mode={mode}
        size={0.8}
        translationSnap={snap ? (units === 'in' ? MM_PER_IN / 8 : 5) : null}
        rotationSnap={snap ? Math.PI / 12 : null}
        scaleSnap={snap ? 0.05 : null}
        onMouseDown={() => void (dragging.current = beginDrag())}
        onMouseUp={() => {
          dragging.current = null;
          endDrag();
        }}
        onObjectChange={write}
      />
    </>
  );
}

/**
 * A part that went into a boolean or shell, drawn as a faint wireframe so a tool that
 * was cut away can still be seen, clicked and moved.
 */
function Ghost({ body }: { body: Body }) {
  return (
    <mesh
      geometry={body.geometry}
      matrix={body.matrix}
      matrixAutoUpdate={false}
      renderOrder={5}
      onClick={(e) => {
        e.stopPropagation();
        useDesign.getState().select(body.owners[0], e.shiftKey || e.metaKey || e.ctrlKey);
      }}
    >
      <meshBasicMaterial color="#e8a33d" wireframe transparent opacity={0.18} depthWrite={false} />
    </mesh>
  );
}

function ViewToolbar() {
  const mode = useDesign((s) => s.gizmo);
  const snap = useDesign((s) => s.snap);
  const { setGizmo, setSnap } = useDesign.getState();
  const modes = [
    ['translate', 'Move', 'W'],
    ['rotate', 'Rotate', 'E'],
    ['scale', 'Scale', 'R'],
  ] as const;
  return (
    <div className="view-toolbar">
      <div className="segmented" role="radiogroup" aria-label="Gizmo">
        {modes.map(([m, label, key]) => (
          <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? 'on' : undefined} onClick={() => setGizmo(m)} title={`${label} (${key})`}>
            {label}
          </button>
        ))}
      </div>
      <label className="snap-toggle" title="Snap moves to 1/8 in (5 mm in cm), turns to 15°">
        <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} />
        Snap
      </label>
      <ViewMenu />
    </div>
  );
}

/** Background, grid and turntable, plus saving the view as a picture. */
function ViewMenu() {
  const [open, setOpen] = useState(false);
  const scene = useDesign((s) => s.design.scene);
  const setScene = useDesign((s) => s.setScene);
  return (
    <div className="menu">
      <button className="btn small" aria-expanded={open} onClick={() => setOpen(!open)}>
        View ▾
      </button>
      {open && (
        <div className="menu-pop view-pop" role="menu">
          <div className="menu-sep">Background</div>
          {(Object.keys(BACKGROUNDS) as BackgroundId[]).map((id) => (
            <label key={id} className="menu-check">
              <input type="radio" name="bg" checked={(scene.background in BACKGROUNDS ? scene.background : 'studio') === id} onChange={() => setScene({ background: id })} />
              {BACKGROUNDS[id].label}
            </label>
          ))}
          <div className="menu-sep">Show</div>
          <label className="menu-check">
            <input type="checkbox" checked={scene.grid !== false} onChange={(e) => setScene({ grid: e.target.checked })} />
            Grid
          </label>
          <label className="menu-check">
            <input type="checkbox" checked={scene.turntable} onChange={(e) => setScene({ turntable: e.target.checked })} />
            Turntable
          </label>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void savePng();
            }}
          >
            Save view as PNG
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Downloads what's on screen as a PNG, without the selection box, gizmo or labels:
 * clear the selection, let two frames draw, grab the canvas, then put it back.
 */
async function savePng() {
  const { selection, design } = useDesign.getState();
  useDesign.setState({ selection: [], selectedId: null });
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const canvas = document.querySelector<HTMLCanvasElement>('.stage canvas');
  const url = canvas?.toDataURL('image/png');
  useDesign.setState({ selection, selectedId: selection[selection.length - 1] ?? null });
  if (url) downloadUrl(url, `${fileStem(design.name)}.png`);
}

/** Re-frames the camera when a part is added or removed, not on every parameter tweak. */
function FitWhenPartsChange({ count }: { count: number }) {
  const api = useBounds();
  useEffect(() => {
    if (count === 0) return;
    const frame = requestAnimationFrame(() => api.refresh().fit()); // wait a frame so the new mesh is in the scene
    return () => cancelAnimationFrame(frame);
  }, [count]);
  return null;
}

function SelectionBox({ id, bodies, primary }: { id: OpId; bodies: Body[]; primary: boolean }) {
  const box = useMemo(() => unionBounds(bodiesOf(bodies, id)), [bodies, id]);
  const { center, edges } = useMemo(() => {
    const size = box.isEmpty() ? new THREE.Vector3() : box.getSize(new THREE.Vector3());
    const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x, size.y, size.z));
    return { center, edges };
  }, [box]);
  useEffect(() => () => edges.dispose(), [edges]);
  if (box.isEmpty()) return null;

  return (
    <lineSegments position={center} geometry={edges} raycast={() => null}>
      <lineBasicMaterial color={primary ? '#e8a33d' : '#b98a4a'} transparent opacity={primary ? 0.8 : 0.45} depthTest={false} />
    </lineSegments>
  );
}

interface DimLabel {
  key: string;
  at: THREE.Vector3;
  text: string;
}

function dimensionLabels(bounds: THREE.Box3, units: Units): DimLabel[] {
  const size = bounds.getSize(new THREE.Vector3());
  const c = bounds.getCenter(new THREE.Vector3());
  return [
    { key: 'h', at: new THREE.Vector3(bounds.max.x, c.y, bounds.max.z), text: `H ${formatLength(size.y, units)}` },
    { key: 'w', at: new THREE.Vector3(c.x, bounds.min.y, bounds.max.z), text: `W ${formatLength(size.x, units)}` },
  ];
}

/**
 * Labels are plain DOM over the canvas; this pins each one to its 3D anchor every
 * frame. Cheaper and sturdier than one React root per label.
 */
function LabelTracker({ anchors, elements }: { anchors: THREE.Vector3[]; elements: React.RefObject<(HTMLDivElement | null)[]> }) {
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    anchors.forEach((anchor, i) => {
      const el = elements.current[i];
      if (!el) return;
      v.copy(anchor).project(camera);
      const x = ((v.x + 1) / 2) * size.width;
      const y = ((1 - v.y) / 2) * size.height;
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      el.style.visibility = v.z < 1 ? 'visible' : 'hidden';
    });
  });
  return null;
}
