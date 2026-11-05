import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Canvas, useThree } from '@react-three/fiber'
import { ContactShadows, Environment, Grid, Html, Lightformer, Line, OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei'
import { useStore } from '../store.js'
import { partMesh } from '../core/mesh.js'
import { partMetrics } from '../core/parts.js'
import { bounds, footprint, hangPointLocal, leanPose, posedPositions, restY, rotationMatrix, supportMap, undersideMap, wallZ, hungPose } from '../core/placement.js'

// The model is in mm; the view works in cm like Jackline (so its studio
// lighting and camera numbers carry over). Everything sits in one group
// scaled by 0.1.
const S = 0.1

export default function Viewport() {
  const view = useStore((s) => s.view)
  return (
    <div className="viewport">
      <Canvas dpr={[1, 2]} gl={{ antialias: true }} onPointerMissed={() => useStore.getState().select(null)}>
        <PerspectiveCamera makeDefault={view === '3d'} position={[45, 70, 170]} fov={30} near={1} far={4000} />
        <OrthographicCamera makeDefault={view === 'top'} position={[0, 600, 0]} up={[0, 0, -1]} zoom={4} near={1} far={4000} onUpdate={(c) => c.lookAt(0, 0, 0)} />
        <OrbitControls key={view} makeDefault target={[0, view === "top" ? 0 : 12, 0]} enableRotate={view === '3d'} maxPolarAngle={Math.PI * 0.49} minDistance={30} maxDistance={900} enableDamping />
        <Backdrop />
        <Studio />
        <group scale={S}>
          <StageSet />
          <Parts />
          <Footprint />
        </group>
        <ContactShadows position={[0, 0.02, 0]} opacity={0.5} scale={160} blur={2.4} far={60} resolution={512} />
        <Grid position={[0, -1.25, 0]} infiniteGrid cellSize={5} sectionSize={10} cellColor="#81858c" sectionColor="#8f939a" cellThickness={0.6} sectionThickness={1} fadeDistance={400} fadeStrength={1.6} />
        <Dragger />
      </Canvas>
    </div>
  )
}

// Jackline's studio sweep and light panels (src/scene/Viewport.jsx), scaled up
// for a whole group instead of one vessel.
function Backdrop() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: { top: { value: new THREE.Color('#74787f') }, horizon: { value: new THREE.Color('#8a8e96') }, floor: { value: new THREE.Color('#787c84') } },
        vertexShader: `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 floor; varying vec3 vDir;
          void main() { float h = vDir.y;
            vec3 c = h > 0.0 ? mix(horizon, top, smoothstep(0.0, 0.5, h)) : mix(horizon, floor, smoothstep(0.0, 0.55, -h));
            gl_FragColor = vec4(c, 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    [],
  )
  return (
    <mesh scale={2000} material={material} renderOrder={-1}>
      <sphereGeometry args={[1, 48, 24]} />
    </mesh>
  )
}

function Studio() {
  return (
    <Environment resolution={256} frames={1}>
      <color attach="background" args={['#0c0d10']} />
      <Lightformer form="rect" intensity={3} position={[0, 6, -10]} scale={[16, 5, 1]} />
      <Lightformer form="rect" intensity={2.2} position={[-10, 2, 0]} rotation-y={Math.PI / 2} scale={[3, 14, 1]} />
      <Lightformer form="rect" intensity={1.6} position={[10, 3, 2]} rotation-y={-Math.PI / 2} scale={[2, 12, 1]} color="#ffd9b0" />
      <Lightformer form="circle" intensity={4} position={[0, 12, 0]} rotation-x={Math.PI / 2} scale={6} />
      <Lightformer form="ring" intensity={1.2} position={[4, -2, 9]} scale={4} color="#bfe3ff" />
    </Environment>
  )
}

// Base plate, back wall (when anything leans or the scene is in leaning
// mode) and the armature (when anything hangs).
function StageSet() {
  const scene = useStore((s) => s.scene)
  const st = scene.stage
  const showWall = scene.mode === 'leaning' || scene.parts.some((p) => p.pose.lean === 'wall')
  const hung = scene.parts.filter((p) => p.pose.mount === 'hung')
  const showArm = scene.mode === 'hung' || hung.length > 0
  const y = st.armatureY, hw = st.baseW / 2, hd = st.baseD / 2
  return (
    <>
      <mesh position={[0, -6, 0]} receiveShadow onPointerDown={(e) => e.stopPropagation()} onClick={() => useStore.getState().select(null)}>
        <boxGeometry args={[st.baseW, 12, st.baseD]} />
        <meshStandardMaterial color="#d9d4ca" roughness={0.85} />
      </mesh>
      {showWall && (
        <mesh position={[0, 450, wallZ(st) - 6]}>
          <boxGeometry args={[st.baseW, 900, 12]} />
          <meshStandardMaterial color="#e8e3da" roughness={0.9} />
        </mesh>
      )}
      {showArm && (
        <>
          <Line points={[[-hw, y, -hd], [hw, y, -hd], [hw, y, hd], [-hw, y, hd], [-hw, y, -hd]]} color="#3a3d44" lineWidth={3} />
          {[-hw, hw].flatMap((x) => [-hd, hd].map((z) => <Line key={`${x}${z}`} points={[[x, 0, z], [x, y, z]]} color="#3a3d44" lineWidth={1.5} transparent opacity={0.35} />))}
        </>
      )}
    </>
  )
}

function Parts() {
  const parts = useStore((s) => s.scene.parts)
  const scene = useStore((s) => s.scene)
  const selectedId = useStore((s) => s.selectedId)
  return parts.map((p) => <PartMesh key={p.id} part={p} scene={scene} selected={p.id === selectedId} />)
}

function PartMesh({ part, scene, selected }) {
  const shapeKey = `${part.type}|${part.scale}|${JSON.stringify(part.dims)}`
  const geometry = useMemo(() => {
    const m = partMesh(part, 'render')
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3))
    g.setIndex(new THREE.BufferAttribute(m.indices, 1))
    g.computeVertexNormals()
    g.computeBoundingSphere()
    return g
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shapeKey])
  useEffect(() => () => geometry.dispose(), [geometry])
  const quat = useMemo(() => {
    const R = rotationMatrix(part.pose)
    const m4 = new THREE.Matrix4().set(R[0], R[1], R[2], 0, R[3], R[4], R[5], 0, R[6], R[7], R[8], 0, 0, 0, 0, 1)
    return new THREE.Quaternion().setFromRotationMatrix(m4)
  }, [part.pose])
  const thick = partMetrics(part, scene.settings).thickestMm
  const p = part.pose
  const hangTop = p.mount === 'hung' ? hangPointLocal(part)[1] + p.y : null

  return (
    <>
      <group position={[p.x, p.y, p.z]} quaternion={quat}>
        <mesh
          geometry={geometry}
          castShadow
          onPointerDown={(e) => {
            if (e.button !== 0) return
            e.stopPropagation()
            useStore.getState().select(part.id)
            startDrag(part, e)
          }}
        >
          <Glass color={part.color} thicknessMm={thick} selected={selected} />
        </mesh>
      </group>
      {p.mount === 'hung' && (
        <>
          <Line points={[[p.x, hangTop, p.z], [p.x, scene.stage.armatureY, p.z]]} color={selected ? '#ff8a3d' : '#2b2e34'} lineWidth={1.2} />
          <mesh position={[p.x, hangTop, p.z]}>
            <sphereGeometry args={[part.hang ? 3 : 4, 12, 8]} />
            <meshBasicMaterial color={part.hang ? '#2b2e34' : '#e5484d'} />
          </mesh>
        </>
      )}
      {selected && <SelectRing part={part} />}
    </>
  )
}

// Clear glass gets its colour from attenuation, as in Jackline: thick parts
// read deeper than thin walls. Tint strength shortens the attenuation
// distance. (Step 4 replaces this with the coloured-light render.)
function Glass({ color, thicknessMm, selected }) {
  const surface = useMemo(() => new THREE.Color('#ffffff').lerp(new THREE.Color(color.hex), 0.28), [color.hex])
  const tinted = color.hex !== '#ffffff'
  return (
    <meshPhysicalMaterial
      color={surface}
      transmission={1}
      thickness={thicknessMm}
      ior={1.5}
      roughness={0.04}
      attenuationColor={color.hex}
      attenuationDistance={tinted ? 3 + (1 - color.opacity) * 40 : Infinity}
      specularIntensity={1}
      envMapIntensity={1.4}
      emissive={selected ? '#ff8a3d' : '#000000'}
      emissiveIntensity={selected ? 0.08 : 0}
    />
  )
}

function SelectRing({ part }) {
  const b = bounds(posedPositions(part))
  const r = Math.max(b.max[0] - b.min[0], b.max[2] - b.min[2]) / 2 + 8
  return (
    <mesh position={[(b.min[0] + b.max[0]) / 2, b.min[1] + 0.6, (b.min[2] + b.max[2]) / 2]} rotation-x={-Math.PI / 2} renderOrder={2}>
      <ringGeometry args={[r, r + 3, 64]} />
      <meshBasicMaterial color="#ff8a3d" transparent opacity={0.9} depthTest={false} />
    </mesh>
  )
}

// The group's bounding rectangle on the base, with its size.
function Footprint() {
  const scene = useStore((s) => s.scene)
  const view = useStore((s) => s.view)
  const f = footprint(scene)
  if (!f) return null
  const y = 0.8
  const pts = [[f.minX, y, f.minZ], [f.maxX, y, f.minZ], [f.maxX, y, f.maxZ], [f.minX, y, f.maxZ], [f.minX, y, f.minZ]]
  return (
    <>
      <Line points={pts} color="#ff8a3d" lineWidth={1.4} dashed dashSize={12} gapSize={8} />
      <Html position={[(f.minX + f.maxX) / 2, y, f.maxZ + 18]} center className="dim-tag" zIndexRange={[10, 0]}>
        W {Math.round(f.w)} mm
      </Html>
      <Html position={[f.maxX + 18, y, (f.minZ + f.maxZ) / 2]} center className="dim-tag" zIndexRange={[10, 0]}>
        D {Math.round(f.d)} mm
      </Html>
      {view === 'top' && (
        <Html position={[f.minX, y, f.minZ - 16]} className="dim-tag soft" zIndexRange={[10, 0]}>
          Footprint · top view
        </Html>
      )}
    </>
  )
}

// ------------------------------------------------------------------ drag
//
// Drag a part across a horizontal plane through the point you grabbed. Its
// height comes from snap-to-rest every move: the surfaces below are
// measured once when the drag starts, so each move is a fast lookup. Hold
// Shift to snap to a 10 mm grid. Hung parts slide their anchor along the
// armature; leaning parts slide on the base and lean again when let go.

let drag = null
let orbit = null // the orbit controls, so a drag can stop them at once
function startDrag(part, e) {
  if (orbit) orbit.enabled = false
  const st = useStore.getState()
  st.checkpoint()
  const planeY = e.point.y // world (cm)
  const pose = part.pose
  const ptMm = [e.point.x / S, e.point.z / S]
  drag = {
    id: part.id,
    plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY),
    offset: [ptMm[0] - pose.x, ptMm[1] - pose.z],
    support: pose.mount === 'rest' && !pose.lean ? supportMap(st.scene, [part.id]) : null,
    under: pose.mount === 'rest' && !pose.lean ? undersideMap(part, pose) : null,
    moved: false,
  }
}

function Dragger() {
  const { camera, gl, controls } = useThree()
  useEffect(() => {
    orbit = controls
    const ray = new THREE.Raycaster()
    const hit = new THREE.Vector3()
    const ndc = new THREE.Vector2()
    const move = (ev) => {
      if (!drag) return
      if (controls) controls.enabled = false
      const r = gl.domElement.getBoundingClientRect()
      ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ndc, camera)
      if (!ray.ray.intersectPlane(drag.plane, hit)) return
      let x = hit.x / S - drag.offset[0], z = hit.z / S - drag.offset[1]
      if (ev.shiftKey) (x = Math.round(x / 10) * 10), (z = Math.round(z / 10) * 10)
      const st = useStore.getState()
      const part = st.scene.parts.find((p) => p.id === drag.id)
      if (!part) return
      let pose = { ...part.pose, x, z }
      if (drag.support) pose.y = restY(drag.support, drag.under, x, z).y
      else if (pose.mount === 'hung') pose = hungPose(st.scene, part, pose)
      else pose.y = -bounds(posedPositions(part, pose, true)).min[1] // leaning: on the base while dragging
      drag.moved = true
      st.setPose(part.id, pose, { live: true })
    }
    const up = () => {
      if (!drag) return
      const st = useStore.getState()
      const part = st.scene.parts.find((p) => p.id === drag.id)
      if (part?.pose.lean && drag.moved) st.setPose(part.id, leanPose(st.scene, part, part.pose).pose, { live: true })
      if (!drag.moved) st.past.length && useStore.setState({ past: st.past.slice(0, -1) }) // a click, not a drag: no undo step
      drag = null
      if (controls) controls.enabled = true
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [camera, gl, controls])
  return null
}
