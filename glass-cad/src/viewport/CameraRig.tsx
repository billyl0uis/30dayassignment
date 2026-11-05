import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { OrbitControls, useBounds } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useDesign } from '../store/designStore';
import { unionBounds, type Body } from '../engine/evaluate';
import { frameFor, sharedSize, VIEWS, viewById } from './views';
import { orthoCameraFor, type OrthoView } from '../files/orthoViews';

const FOV = 32;

/**
 * The two view cameras, made once. The canvas starts on the perspective one; handing
 * r3f this same object every render (instead of camera options) stops a re-render
 * from swapping r3f's own default camera back in over the one the buttons moved.
 */
export const viewCameras = (() => {
  const persp = new THREE.PerspectiveCamera(FOV, 1, 1, 20000);
  persp.position.set(260, 210, 380);
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 60000);
  return { persp, ortho };
})();

/**
 * Owns the view camera. Perspective is how the piece looks; "flat" is a true
 * orthographic camera, where parallel edges stay parallel and sizes read true, the
 * way design drawings are made. Switching keeps the same spot and framing, and the
 * view buttons snap either camera square to the front, side, top or a 3/4 angle.
 */
export function CameraRig({ turntable }: { turntable: boolean }) {
  const { set, size, camera } = useThree();
  const flat = useDesign((s) => s.flat);
  const controls = useRef<OrbitControlsImpl>(null);
  const target = useMemo(() => new THREE.Vector3(0, 60, 0), []);
  const cameras = viewCameras;

  // Keep both cameras matched to the canvas: perspective by aspect, ortho by pixel window.
  useEffect(() => {
    cameras.persp.aspect = size.width / size.height;
    Object.assign(cameras.ortho, { left: -size.width / 2, right: size.width / 2, top: size.height / 2, bottom: -size.height / 2 });
    cameras.persp.updateProjectionMatrix();
    cameras.ortho.updateProjectionMatrix();
  }, [cameras, size.width, size.height]);

  // Take over as the scene's camera once, then whenever flat is switched.
  useEffect(() => {
    const next = flat ? cameras.ortho : cameras.persp;
    if (camera === next) return;
    const prev = camera;
    const halfTan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    if (prev === cameras.persp || prev === cameras.ortho) {
      next.quaternion.copy(prev.quaternion);
      const away = prev.position.clone().sub(target);
      if (next === cameras.ortho) {
        // Same picture size: the ortho window matches what perspective showed at the target.
        cameras.ortho.position.copy(target).addScaledVector(away.normalize(), 3000);
        cameras.ortho.zoom = size.height / (2 * prev.position.distanceTo(target) * halfTan);
      } else {
        const dist = size.height / (2 * cameras.ortho.zoom * halfTan);
        cameras.persp.position.copy(target).addScaledVector(away.normalize(), dist);
      }
    }
    next.updateProjectionMatrix();
    set({ camera: next });
  }, [flat, cameras, camera, set, size.height, target]);


  return (
    <OrbitControls
      ref={controls}
      makeDefault
      target={target}
      onChange={() => controls.current && target.copy(controls.current.target)}
      minDistance={40}
      maxDistance={8000}
      minZoom={0.05}
      maxZoom={40}
      maxPolarAngle={Math.PI / 2}
      autoRotate={turntable}
      autoRotateSpeed={1.2}
    />
  );
}

/**
 * Moves the camera square to the requested view. It lives inside drei's <Bounds> and
 * goes through its camera animation (a short glide), which also cancels any fit still
 * in progress that would otherwise pull the camera back. Flat views fit by zoom.
 */
export function ViewSnapper({ bodies }: { bodies: Body[] }) {
  const api = useBounds();
  const { size } = useThree();
  const flat = useDesign((s) => s.flat);
  const request = useDesign((s) => s.viewRequest);

  useEffect(() => {
    if (!request) return;
    const view = viewById(request.id);
    const box = unionBounds(bodies);
    if (box.isEmpty()) box.set(new THREE.Vector3(-50, 0, -50), new THREE.Vector3(50, 100, 50));
    const frame = frameFor(view, box, sharedSize(box) / 1.15);
    // A hair off straight down, so "up" on screen stays toward the back like a plan drawing.
    const dir = view.id === 'top' ? new THREE.Vector3(0, 1, 1e-4).normalize() : view.dir;
    const halfTan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const dist = flat ? 3000 : frame.size / 2 / halfTan / Math.min(1, size.width / size.height);
    const moved = api
      .refresh()
      .moveTo(frame.center.clone().addScaledVector(dir, dist))
      .lookAt({ target: frame.center, up: new THREE.Vector3(0, 1, 0) });
    if (flat) moved.fit();
  }, [request]); // only a new request moves the camera, not every edit to the piece

  return null;
}

/** Set by CaptureBridge while the canvas is mounted; renders the glass views on demand. */
export let captureGlassViews: ((bodies: Body[]) => Promise<OrthoView[]>) | null = null;

const TILE = 900;

/**
 * Renders the real glass (lighting, refraction, backdrop) from each standard view
 * through a flat camera, using the live renderer and scene, and crops each to a square.
 */
export function CaptureBridge() {
  const { gl, scene } = useThree();
  useEffect(() => {
    captureGlassViews = async (bodies) => {
      const { selection } = useDesign.getState();
      useDesign.setState({ selection: [], selectedId: null }); // no selection box or handles in the pictures
      await nextFrames();
      const box = unionBounds(bodies);
      const shared = sharedSize(box);
      const canvas = gl.domElement;
      const aspect = canvas.width / canvas.height;
      const side = Math.min(canvas.width, canvas.height);
      const views = VIEWS.map((view) => {
        const frame = frameFor(view, box, shared);
        gl.render(scene, orthoCameraFor(view, frame, aspect));
        const tile = document.createElement('canvas');
        tile.width = tile.height = TILE;
        tile.getContext('2d')!.drawImage(canvas, (canvas.width - side) / 2, (canvas.height - side) / 2, side, side, 0, 0, TILE, TILE);
        return { ...frame, name: view.name, measured: view.measured, url: tile.toDataURL('image/png') };
      });
      useDesign.setState({ selection, selectedId: selection[selection.length - 1] ?? null });
      return views;
    };
    return () => {
      captureGlassViews = null;
    };
  }, [gl, scene]);
  return null;
}

/** Two frames, so React and the renderer have caught up; capped in case the tab is hidden. */
function nextFrames() {
  return Promise.race([
    new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    new Promise((r) => setTimeout(r, 120)),
  ]);
}
