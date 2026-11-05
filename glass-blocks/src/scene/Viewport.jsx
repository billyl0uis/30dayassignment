import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Environment, Grid, Lightformer, OrbitControls } from '@react-three/drei'
import { useLiveParts, useStore } from '../model/store.js'
import { pieceHeight, stackLayout } from '../model/layout.js'
import { CM_PER_IN } from '../model/units.js'
import PartMesh from './PartMesh.jsx'
import { download, stamp } from '../download.js'
import { shootViews } from '../views/shoot.js'
import { composeSheet } from '../views/sheet.js'

const THEMES = {
  dark: { top: '#0a0b0e', horizon: '#636a79', floor: '#2b2f38', cell: '#2a2e38', section: '#3a404c' },
  light: { top: '#fbf9f5', horizon: '#e6dfd3', floor: '#dcd4c6', cell: '#cfc6b8', section: '#bcb2a2' },
}

export default function Viewport() {
  const theme = useStore((s) => s.theme)
  const select = useStore((s) => s.select)
  const downAt = useRef([0, 0])
  return (
    <div
      className="viewport"
      onPointerDown={(e) => (downAt.current = [e.clientX, e.clientY])}
    >
      <Canvas
        camera={{ position: [0, 16, 42], fov: 32, near: 0.5, far: 1000 }}
        dpr={[1, 2]}
        gl={{ preserveDrawingBuffer: true, antialias: true }}
        onPointerMissed={(e) => {
          const [x, y] = downAt.current
          if (Math.hypot(e.clientX - x, e.clientY - y) < 5) select(null)
        }}
      >
        <Backdrop theme={theme} />
        <Studio />
        <Scene theme={theme} />
        <OrbitControls makeDefault target={[0, 7, 0]} minDistance={4} maxDistance={220} maxPolarAngle={Math.PI * 0.53} enableDamping />
        <FollowStack />
        <Capture />
        <ViewsCapture />
      </Canvas>
    </div>
  )
}

// A photo-studio sweep: dark overhead, lit at the horizon. Clear glass shows
// whatever is behind it, so this band is what makes it glow instead of going black.
function Backdrop({ theme }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, floor: { value: new THREE.Color() } },
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
  useEffect(() => {
    const t = THEMES[theme]
    material.uniforms.top.value.set(t.top)
    material.uniforms.horizon.value.set(t.horizon)
    material.uniforms.floor.value.set(t.floor)
  }, [theme, material])
  return (
    <mesh scale={500} material={material} renderOrder={-1}>
      <sphereGeometry args={[1, 48, 24]} />
    </mesh>
  )
}

// A hot-shop-ish studio built from soft light panels: glass is mostly
// reflections, so this is what makes it read as glass. Rendered once, locally.
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

function Scene({ theme }) {
  const parts = useLiveParts()
  const selectedId = useStore((s) => s.selectedId)
  const capturing = useStore((s) => s.capturing)
  const units = useStore((s) => s.units)
  const layout = useMemo(() => stackLayout(parts), [parts])
  const t = THEMES[theme]
  return (
    <>
      <Turntable paused={!!selectedId}>
        {parts.map((p) => (
          <PartMesh key={p.id} part={p} y={layout.ys[p.id] ?? 0} selected={p.id === selectedId} editing={!capturing} />
        ))}
      </Turntable>
      <ContactShadows position={[0, 0.005, 0]} opacity={theme === 'dark' ? 0.55 : 0.35} scale={70} blur={2.6} far={40} resolution={512} />
      {!capturing && (
        <Grid
          position={[0, -0.01, 0]}
          infiniteGrid
          cellSize={units === 'in' ? CM_PER_IN : 1}
          sectionSize={units === 'in' ? CM_PER_IN * 6 : 10}
          cellColor={t.cell}
          sectionColor={t.section}
          cellThickness={0.6}
          sectionThickness={1}
          fadeDistance={110}
          fadeStrength={1.6}
        />
      )}
    </>
  )
}

function Turntable({ paused, children }) {
  const ref = useRef()
  const on = useStore((s) => s.turntable)
  useFrame((_, dt) => {
    if (on && !paused && ref.current) ref.current.rotation.y += dt * 0.45
  })
  return <group ref={ref} name="piece">{children}</group>
}

// When the stack gets taller or shorter, ease the orbit target to its middle.
// Only reacts to committed changes, so it never fights a drag or a pan.
// Zooms out if the piece no longer fits, and back in only if it got a lot
// smaller (a fresh start, a big delete), so it won't undo your own zooming.
function FollowStack() {
  const parts = useStore((s) => s.parts)
  const controls = useThree((s) => s.controls)
  const camera = useThree((s) => s.camera)
  const height = useMemo(() => pieceHeight(parts), [parts])
  const goal = useRef(null)
  useEffect(() => {
    if (!controls) return
    const fit = Math.max(18, (height * 0.62) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))
    const now = camera.position.distanceTo(controls.target)
    goal.current = { y: Math.max(2, height / 2), dist: fit > now || fit < now * 0.6 ? fit : null }
  }, [height, camera, controls])
  useFrame(() => {
    const g = goal.current
    if (!controls || !g) return
    const t = controls.target
    const offset = camera.position.clone().sub(t)
    const dist = offset.length()
    const dy = g.y - t.y
    const dd = g.dist == null ? 0 : g.dist - dist
    if (Math.abs(dy) < 0.01 && Math.abs(dd) < 0.01) {
      goal.current = null
      return
    }
    t.y += dy * 0.08
    offset.setLength(dist + dd * 0.08)
    camera.position.copy(t).add(offset)
    controls.update()
  })
  return null
}

function Capture() {
  const capturing = useStore((s) => s.capturing)
  const setCapturing = useStore((s) => s.setCapturing)
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    if (capturing !== 'png') return
    // Two frames: one for React to hide the handles and grid, one to draw.
    let id = requestAnimationFrame(() => {
      id = requestAnimationFrame(() => {
        gl.domElement.toBlob((blob) => {
          if (blob) download(blob, `glass-blocks-${stamp()}.png`)
          setCapturing(null)
        }, 'image/png')
      })
    })
    return () => cancelAnimationFrame(id)
  }, [capturing, gl, setCapturing])
  return null
}

// Shoots the front, side, top and 3/4 views square to the piece, whatever angle
// you're orbiting at and wherever the turntable has spun it, then builds the sheet.
function ViewsCapture() {
  const capturing = useStore((s) => s.capturing)
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    if (capturing !== 'views') return
    let id = requestAnimationFrame(() => {
      id = requestAnimationFrame(async () => {
        const s = useStore.getState()
        const piece = scene.getObjectByName('piece')
        const spin = piece.rotation.y
        piece.rotation.y = 0
        piece.updateMatrixWorld()
        try {
          const shot = shootViews(gl, scene, camera, piece)
          piece.rotation.y = spin
          s.setViews(await composeSheet(shot, { units: s.units }))
        } finally {
          piece.rotation.y = spin
          s.setCapturing(null)
        }
      })
    })
    return () => cancelAnimationFrame(id)
  }, [capturing, gl, scene, camera])
  return null
}
