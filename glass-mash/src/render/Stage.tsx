import { ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import type { Group, PerspectiveCamera } from 'three';
import { getMode } from '../modes/registry';
import { useScene, type Background, type Piece } from '../scene/store';
import { GlassMaterial } from './GlassMaterial';

const BG: Record<Background, string> = { black: '#0a0a0b', white: '#f2f0eb', gallery: '#8c867e' };
const INSPECTOR_SHIFT = 135; // px: half the inspector's width plus its margin

export function Stage() {
  const background = useScene((s) => s.background);
  const pieces = useScene((s) => s.pieces);
  const empty = pieces.every((p) => !p.drawing);

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
          {pieces.map((p) => p.drawing && <PieceMesh key={p.id} piece={p} />)}
        </Turntable>
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
      {empty && <p className="stage-empty">Draw a closed shape on the page. It turns to glass here.</p>}
    </>
  );
}

function PieceMesh({ piece }: { piece: Piece }) {
  const params = piece.params[piece.mode];
  const geometry = useMemo(
    () => (piece.drawing && params ? getMode(piece.mode).build(piece.drawing, params) : null),
    [piece.drawing, piece.mode, params],
  );
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;
  return (
    <mesh geometry={geometry} castShadow>
      <GlassMaterial glass={piece.glass} />
    </mesh>
  );
}

function Turntable({ children }: { children: React.ReactNode }) {
  const ref = useRef<Group>(null);
  const on = useScene((s) => s.turntable);
  useFrame((_, dt) => {
    if (on && ref.current) ref.current.rotation.y += dt * 0.55;
  });
  return <group ref={ref}>{children}</group>;
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
    <mesh position={[0, -0.6, 0]} receiveShadow>
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
