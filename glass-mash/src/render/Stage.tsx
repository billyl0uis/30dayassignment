import { ContactShadows, Environment, Lightformer, OrbitControls, TransformControls } from '@react-three/drei';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Group, Object3D, PerspectiveCamera } from 'three';
import { pieceGeometry } from '../scene/geometryCache';
import { mashMembers, useScene, type Background, type JoinMode, type Piece } from '../scene/store';
import { buildMash } from '../sdf/mash';
import { makeCapturer, setCapturer } from './capture';
import { GlassMaterial } from './GlassMaterial';

const BG: Record<Background, string> = { black: '#0a0a0b', white: '#f2f0eb', gallery: '#8c867e' };
const INSPECTOR_SHIFT = 135; // px: half the inspector's width plus its margin
const DRAFT_DETAIL = 52; // mash grid while a piece is being dragged
const GHOST: Record<JoinMode, string> = { solo: '#ffffff', melt: '#ffffff', intersect: '#7fd0ff', carve: '#ff7a4a' };

export function Stage() {
  const background = useScene((s) => s.background);
  const pieces = useScene((s) => s.pieces);
  const selectedId = useScene((s) => s.selectedId);
  const members = useStableMembers(pieces);
  const memberIds = new Set(members.map((m) => m.id));
  const selectedInMash = !!selectedId && memberIds.has(selectedId);
  const empty = pieces.length === 0;

  return (
    <>
      <Canvas
        className="stage-canvas"
        camera={{ position: [0, 1.5, 5.4], fov: 32 }}
        dpr={[1, 2]}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
      >
        <color attach="background" args={[BG[background]]} />
        <FrameLeftOfInspector />
        <StudioLights />
        <Turntable>
          {pieces.map((p) => (
            <PieceObject
              key={p.id}
              piece={p}
              inMash={memberIds.has(p.id)}
              ghost={selectedInMash && memberIds.has(p.id) && (p.id === selectedId || p.join !== 'melt')}
              selected={p.id === selectedId}
            />
          ))}
          {members.length > 0 && <MashMesh members={members} />}
        </Turntable>
        <Gizmo />
        <ViewCapture />
        {background === 'gallery' && <Plinth />}
        <ContactShadows
          position={[0, 0.002, 0]}
          scale={6}
          blur={2.4}
          far={2.5}
          opacity={background === 'white' ? 0.3 : 0.55}
          color={background === 'white' ? '#4a4038' : '#000000'}
        />
        <OrbitControls makeDefault target={[0, 0.75, 0]} enableDamping minDistance={1.6} maxDistance={14} />
      </Canvas>
      {empty && <p className="stage-empty">Your glass shows up here.</p>}
    </>
  );
}

/**
 * The mash only needs rebuilding when a member's shape, join or placement
 * changes, not when, say, a solo piece's colour does. This keeps the same
 * array (same identity) until one of those actually changes.
 */
function useStableMembers(pieces: Piece[]): Piece[] {
  const members = mashMembers(pieces);
  const ref = useRef(members);
  const prev = ref.current;
  const same =
    prev.length === members.length &&
    members.every((m, i) => {
      const p = prev[i];
      return p.id === m.id && p.join === m.join && p.drawing === m.drawing && p.mode === m.mode && p.params === m.params && p.transform === m.transform;
    });
  if (!same) ref.current = members;
  return ref.current;
}

const clickSelect = (id: string) => (e: ThreeEvent<MouseEvent>) => {
  if (e.delta > 4) return; // that was an orbit drag, not a click
  e.stopPropagation();
  useScene.getState().select(id);
};

function PieceObject({ piece, inMash, ghost, selected }: { piece: Piece; inMash: boolean; ghost: boolean; selected: boolean }) {
  const geometry = pieceGeometry(piece);
  const t = piece.transform;
  return (
    <group name={piece.id} position={t.position} rotation={t.rotation} scale={t.scale}>
      {geometry && !inMash && (
        <mesh geometry={geometry} castShadow onClick={clickSelect(piece.id)}>
          <GlassMaterial glass={piece.glass} />
        </mesh>
      )}
      {geometry && inMash && ghost && (
        <mesh geometry={geometry} onClick={clickSelect(piece.id)}>
          <meshBasicMaterial color={GHOST[piece.join]} wireframe transparent opacity={selected ? 0.22 : 0.1} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

function MashMesh({ members }: { members: Piece[] }) {
  const blend = useScene((s) => s.blend);
  const detail = useScene((s) => s.mashDetail);
  const dragging = useScene((s) => s.dragging);
  // The mash is one piece of glass; it takes the first melted piece's colour.
  const glass = useScene((s) => (s.pieces.find((p) => p.id === members[0].id) ?? members[0]).glass);
  const res = dragging ? Math.min(detail, DRAFT_DETAIL) : detail;
  const mash = useMemo(() => buildMash(members, blend, res), [members, blend, res]);
  useEffect(() => () => mash?.geometry.dispose(), [mash]);
  if (!mash) return null;
  return (
    <mesh
      geometry={mash.geometry}
      castShadow
      onClick={(e) => {
        if (e.delta > 4) return;
        e.stopPropagation();
        useScene.getState().select(mash.pick(e.point));
      }}
    >
      <GlassMaterial glass={glass} />
    </mesh>
  );
}

/** Move / turn / size handles on the selected piece. */
function Gizmo() {
  const scene = useThree((s) => s.scene);
  const selectedId = useScene((s) => s.selectedId);
  const mode = useScene((s) => s.gizmo);
  const hasDrawing = useScene((s) => !!s.pieces.find((p) => p.id === s.selectedId)?.drawing);
  const [target, setTarget] = useState<Object3D | null>(null);

  useEffect(() => {
    setTarget(selectedId ? (scene.getObjectByName(selectedId) ?? null) : null);
  }, [scene, selectedId]);

  if (!target || !hasDrawing || !selectedId) return null;
  const { checkpoint, setDragging, setTransform } = useScene.getState();
  return (
    <TransformControls
      object={target}
      mode={mode}
      size={0.75}
      onMouseDown={() => {
        checkpoint();
        setDragging(true);
      }}
      onMouseUp={() => setDragging(false)}
      onObjectChange={() =>
        setTransform(selectedId, {
          position: target.position.toArray() as [number, number, number],
          rotation: [target.rotation.x, target.rotation.y, target.rotation.z],
          scale: target.scale.toArray() as [number, number, number],
        })
      }
    />
  );
}

function Turntable({ children }: { children: React.ReactNode }) {
  const ref = useRef<Group>(null);
  const on = useScene((s) => s.turntable);
  useFrame((_, dt) => {
    if (on && ref.current) ref.current.rotation.y += dt * 0.55;
  });
  return (
    <group ref={ref} name="turntable">
      {children}
    </group>
  );
}

/**
 * Lets the Save views buttons shoot the scene from fixed cameras. The
 * turntable is squared up first so front really means front.
 */
function ViewCapture() {
  const get = useThree((s) => s.get);
  useEffect(() => {
    const { gl, scene } = get();
    let spin = 0;
    setCapturer(
      makeCapturer(
        gl,
        scene,
        () => {
          const t = scene.getObjectByName('turntable');
          if (t) {
            spin = t.rotation.y;
            t.rotation.y = 0;
            t.updateMatrixWorld(true);
          }
          return t ?? null;
        },
        () => {
          const t = scene.getObjectByName('turntable');
          if (t) t.rotation.y = spin;
          const { size } = get();
          gl.setSize(size.width, size.height, false);
        },
      ),
    );
    return () => setCapturer(null);
  }, [get]);
  return null;
}

/** Slides the picture left so the piece isn't hidden behind the floating inspector. */
function FrameLeftOfInspector() {
  const { camera, size } = useThree();
  useEffect(() => {
    const cam = camera as PerspectiveCamera;
    // Same breakpoint as the CSS: above it the inspector floats over the stage.
    if (window.innerWidth > 820) cam.setViewOffset(size.width, size.height, INSPECTOR_SHIFT, 0, size.width, size.height);
    else cam.clearViewOffset();
    cam.updateProjectionMatrix();
  }, [camera, size]);
  return null;
}

function Plinth() {
  return (
    <mesh name="plinth" position={[0, -0.6, 0]} receiveShadow>
      <boxGeometry args={[2.6, 1.2, 2.6]} />
      <meshStandardMaterial color="#e9e5de" roughness={0.9} />
    </mesh>
  );
}

/**
 * A built-in studio of soft light panels instead of a downloaded HDR, so it
 * works offline. Long strip lights are what make glass read as glass: they
 * draw the bright streaks you see along the edges of a blown form.
 */
function StudioLights() {
  return (
    <Environment resolution={256} frames={1}>
      <color attach="background" args={['#34312d']} />
      <Lightformer form="rect" intensity={3} position={[0, 5, -2]} rotation-x={Math.PI / 2} scale={[8, 3, 1]} />
      <Lightformer form="rect" intensity={4} position={[-5, 1.5, 1]} rotation-y={Math.PI / 2} scale={[0.6, 7, 1]} />
      <Lightformer form="rect" intensity={2.5} position={[5, 1, -1]} rotation-y={-Math.PI / 2} scale={[0.4, 7, 1]} />
      <Lightformer form="rect" intensity={1.2} position={[0, 1, 6]} rotation-y={Math.PI} scale={[6, 1.2, 1]} color="#ffe2c4" />
      <Lightformer form="ring" intensity={2} position={[3, 3, 4]} scale={1.4} onUpdate={(self) => self.lookAt(0, 0, 0)} />
      <Lightformer form="rect" intensity={0.6} position={[0, -3, 0]} rotation-x={-Math.PI / 2} scale={[10, 10, 1]} color="#8a7f74" />
    </Environment>
  );
}
