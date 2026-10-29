import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Environment, Grid, Lightformer, OrbitControls } from '@react-three/drei'
import { useStore } from '../model/store.js'
import { useDerived } from '../model/derived.js'
import { CM_PER_IN } from '../model/units.js'
import { download, stamp } from '../download.js'
import Sheet from './Sheet.jsx'
import Vessel from './Vessel.jsx'

const THEMES = {
  dark: { top: '#0a0b0e', horizon: '#636a79', floor: '#2b2f38', cell: '#2a2e38', section: '#3a404c' },
  light: { top: '#fbf9f5', horizon: '#e6dfd3', floor: '#dcd4c6', cell: '#cfc6b8', section: '#bcb2a2' },
}

export default function Viewport() {
  const theme = useStore((s) => s.theme)
  return (
    <div className="viewport">
      <Canvas camera={{ position: [0, 14, 44], fov: 30, near: 0.5, far: 1000 }} dpr={[1, 2]} gl={{ preserveDrawingBuffer: true, antialias: true }}>
        <Backdrop theme={theme} />
        <Studio />
        <Scene theme={theme} />
        <OrbitControls makeDefault target={[0, 6, 0]} minDistance={8} maxDistance={160} maxPolarAngle={Math.PI * 0.53} enableDamping />
        <Follow />
        <Capture />
        <Sheet />
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

// Soft light panels, rendered once: glass is mostly reflections, so this is
// what makes it read as glass.
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
  const units = useStore((s) => s.units)
  const capturing = useStore((s) => s.capturing || s.sheet)
  const t = THEMES[theme]
  return (
    <>
      <Turntable>
        <Vessel />
      </Turntable>
      <ContactShadows position={[0, 0.005, 0]} opacity={theme === 'dark' ? 0.55 : 0.35} scale={60} blur={2.6} far={30} resolution={512} />
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
          fadeDistance={100}
          fadeStrength={1.6}
        />
      )}
    </>
  )
}

// Spins slowly, except in cutaway, where the cut face has to stay toward you.
function Turntable({ children }) {
  const ref = useRef()
  const on = useStore((s) => s.turntable)
  const cut = useStore((s) => s.cutaway)
  useFrame((_, dt) => {
    if (!ref.current) return
    if (on && !cut) ref.current.rotation.y += dt * 0.4
    else if (cut) ref.current.rotation.y *= 0.85
  })
  return (
    <group ref={ref} name="turntable">
      {children}
    </group>
  )
}

// Eases the orbit target to the middle of the piece and zooms to fit it when
// it grows or shrinks a lot, without fighting your own zooming.
function Follow() {
  const { metrics, handle } = useDerived()
  const controls = useThree((s) => s.controls)
  const camera = useThree((s) => s.camera)
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height))
  // Half the width it needs on screen, counting a handle sticking out.
  const halfW = metrics.maxD / 2 + (handle ? Math.max(...handle.pts.map((p) => -p[0])) - metrics.maxD / 2 : 0) + 1.5
  const goal = useRef(null)
  useEffect(() => {
    if (!controls) return
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    const fit = Math.max(20, (metrics.height * 0.62 + 1.5) / tan, (halfW * 1.15) / (tan * aspect))
    const now = camera.position.distanceTo(controls.target)
    goal.current = { y: Math.max(2, metrics.height / 2), dist: fit > now * 1.05 || fit < now * 0.6 ? fit : null }
    // Only refit for real changes, not every frame of a drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.round(metrics.height), Math.round(halfW), aspect.toFixed(2), controls, camera])
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
  const setView = useStore((s) => s.setView)
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    if (!capturing) return
    // Two frames: one for React to hide the grid, one to draw.
    let id = requestAnimationFrame(() => {
      id = requestAnimationFrame(() => {
        gl.domElement.toBlob((blob) => {
          if (blob) download(blob, `jackline-${stamp()}.png`)
          setView({ capturing: false })
        }, 'image/png')
      })
    })
    return () => cancelAnimationFrame(id)
  }, [capturing, gl, setView])
  return null
}
