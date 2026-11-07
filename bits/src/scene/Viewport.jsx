import { useEffect, useMemo, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Environment, Grid, Lightformer, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { glassGeometry } from '@jackline/geometry/vessel.js'
import GlassMaterial from '@jackline/scene/GlassMaterial.jsx'
import Capture from './Capture.jsx'
import { BIT_TYPES, placeBit } from '../model/bits/index.js'
import { useLiquid, useMeasures } from '../model/derived.js'
import { useWarnCounts } from '../ui/Checks.jsx'
import { useStore } from '../model/store.js'
import { anchorAt, anchorFromPoint } from '../model/surface.js'
import { CM_PER_IN } from '../model/units.js'

// A click that moved more than this many pixels was an orbit, not a placement.
const CLICK_SLOP = 4
const HOT = '#ff8a3d'

export default function Viewport() {
  return (
    <div className="viewport">
      <Canvas camera={{ position: [0, 14, 46], fov: 30, near: 0.5, far: 1000 }} dpr={[1, 2]} gl={{ preserveDrawingBuffer: true, antialias: true }}>
        <Backdrop />
        <Studio />
        <Scene />
        <OrbitControls makeDefault target={[0, 5, 0]} minDistance={6} maxDistance={140} maxPolarAngle={Math.PI * 0.53} enableDamping />
        <Frame />
        <EndMove />
        <Capture />
      </Canvas>
      <TagLayer />
    </div>
  )
}

// Studio grey to work in; a light paper tone when drawing the views sheet.
function Backdrop() {
  const capturing = useStore((s) => s.capturing)
  return <color attach="background" args={[capturing ? '#e4e1da' : '#7d8189']} />
}

// Jackline's light panels: glass is mostly reflections, so this is what makes it read as glass.
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

function Scene() {
  const m = useMeasures()
  const units = useStore((s) => s.units)
  const bits = useStore((s) => s.bits)
  // Drawing the views sheet: just the glass, none of the working overlays.
  const capturing = useStore((s) => s.capturing)
  return (
    <>
      {/* The piece itself (body and bits), named so the sheet can frame it. */}
      <group name="piece">
        {/* Everything stands on the applied foot, if there is one. */}
        <group position={[0, m.lift, 0]}>
          <Body sec={m.sec} />
          {bits.map((b, i) => !BIT_TYPES[b.type].lift && <Bit key={b.id} bit={b} order={i + 1} sec={m.sec} />)}
        </group>
        {bits.map((b, i) => BIT_TYPES[b.type].lift && <Bit key={b.id} bit={b} order={i + 1} sec={m.sec} />)}
      </group>
      <group position={[0, m.lift, 0]} visible={!capturing}>
        <Grips sec={m.sec} />
        <PathDots sec={m.sec} />
      </group>
      <Tags measures={m} />
      {!capturing && <ComMarker com={m.total.com} />}
      {!capturing && <Water />}
      <ContactShadows position={[0, 0.005, 0]} opacity={0.5} scale={60} blur={2.6} far={30} resolution={512} />
      <Grid
        visible={!capturing}
        position={[0, -0.01, 0]}
        infiniteGrid
        cellSize={units === 'in' ? CM_PER_IN / 2 : 1}
        sectionSize={units === 'in' ? CM_PER_IN * 6 : 10}
        cellColor="#868a92"
        sectionColor="#9a9ea6"
        cellThickness={0.6}
        sectionThickness={1}
        fadeDistance={90}
        fadeStrength={1.6}
      />
    </>
  )
}

// Keeps the orbit centered on the piece as it gets taller or shorter.
function Frame() {
  const { sec, lift } = useMeasures()
  const controls = useThree((s) => s.controls)
  const h = Math.round(sec.height + lift)
  useEffect(() => {
    if (!controls) return
    controls.target.set(0, Math.max(2, h / 2), 0)
    controls.update()
  }, [controls, h])
  return null
}

// While a bit is being dragged, the orbit holds still; letting go anywhere ends the drag.
function EndMove() {
  const controls = useThree((s) => s.controls)
  const moving = useStore((s) => s.moving)
  useEffect(() => {
    if (!controls) return
    controls.enabled = !moving
    if (!moving) return
    const up = () => useStore.getState().setView({ moving: null })
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  }, [controls, moving])
  return null
}

// Move a bit (or one end of a handle) to where the pointer is on the body.
function moveTo(sec, hit) {
  const s = useStore.getState()
  const { id, key } = s.moving
  const bit = s.bits.find((b) => b.id === id)
  if (!bit) return
  const t = BIT_TYPES[bit.type]
  let patch
  if (key === 's' || key === 's2') patch = { [key]: hit.s }
  else if (t.placement === 'base') return
  else if (t.placement === 'band' || t.placement === 'rim') patch = { theta: hit.theta }
  else if (t.placement === 'edge') patch = { theta: hit.theta, params: { ...bit.params, edge: hit.s > 0.5 ? 'rim' : 'foot' } }
  else if (bit.type === 'handle') {
    const ds = hit.s - bit.s
    patch = { theta: hit.theta, s: hit.s, s2: Math.min(0.98, Math.max(0.02, bit.s2 + ds)) }
  } else patch = { s: hit.s, theta: hit.theta }
  s.updateBit(id, patch)
}

function Body({ sec }) {
  const tool = useStore((s) => s.tool)
  const drawing = useStore((s) => s.drawing)
  const capturing = useStore((s) => s.capturing)
  const glasses = useStore((s) => s.glasses)
  const bodyGlass = useStore((s) => s.bodyGlass)
  const walls = useStore((s) => s.walls)
  const bits = useStore((s) => s.bits)
  const color = glasses.find((g) => g.id === bodyGlass)?.color ?? '#ffffff'
  // Pulled lips bend the rim of the drawn body (its mass is measured un-pulled).
  const lips = useMemo(() => bits.filter((b) => BIT_TYPES[b.type].deformBody), [bits])
  const glass = useMemo(() => {
    const g = glassGeometry(sec, { handle: null, spout: false, sculpt: null, cut: false })
    if (lips.length) {
      for (const b of lips) BIT_TYPES[b.type].deformBody(b, sec)(g.body)
      g.body.computeVertexNormals()
    }
    return g
  }, [sec, lips])
  useEffect(() => () => glass.body.dispose(), [glass])
  const [hover, setHover] = useState(null)
  const armed = !!BIT_TYPES[tool] && !drawing

  const hitOf = (e) => anchorFromPoint(sec, e.object.worldToLocal(e.point.clone()).toArray())
  const click = (e) => {
    if (e.delta > CLICK_SLOP) return
    e.stopPropagation()
    const s = useStore.getState()
    const hit = hitOf(e)
    if (drawing) return s.addPathPoint(drawing, hit.s, hit.theta)
    if (!armed) return s.setView({ selected: null })
    s.addBit(tool, placeBit(tool, sec, hit))
  }
  const track = (e) => {
    const s = useStore.getState()
    if (s.moving) return moveTo(sec, hitOf(e))
    if (armed) setHover(hitOf(e))
  }

  return (
    <group>
      <mesh geometry={glass.body} onClick={click} onPointerMove={track} onPointerOut={() => setHover(null)}>
        <GlassMaterial color={color} frost={0} wall={Math.max(...walls)} />
      </mesh>
      {armed && hover && !capturing && BIT_TYPES[tool].placement !== 'base' && <Ghost type={tool} sec={sec} hit={hover} />}
    </group>
  )
}

// What the next bit will look like, under the pointer.
function Ghost({ type, sec, hit }) {
  const s = useStore.getState()
  const like = s.bits.find((b) => b.id === s.selected && b.type === type)
  const t = BIT_TYPES[type]
  const geo = useMemo(() => {
    const { params: placed, ...where } = placeBit(type, sec, hit)
    const bit = { type, spin: 0, ...where, params: { ...(like ? like.params : t.defaults), ...placed }, texture: like ? like.texture : t.defaultTexture }
    return t.build(bit, sec, { display: true })
  }, [type, t, like, sec, hit])
  useEffect(() => () => geo?.dispose(), [geo])
  if (!geo) return null
  return (
    <mesh geometry={geo} raycast={() => null} renderOrder={2}>
      <meshBasicMaterial color={HOT} transparent opacity={0.4} depthWrite={false} />
    </mesh>
  )
}

// Start sliding a bit (or a handle's end). The orbit is switched off right
// here, inside the press, because OrbitControls reads the same press: wait
// for React to re-render and the camera has already started turning.
function startMove(e, controls, id, key) {
  e.stopPropagation()
  if (controls) controls.enabled = false
  const s = useStore.getState()
  s.checkpoint()
  s.setView({ moving: { id, key } })
}

function Bit({ bit, order, sec }) {
  const type = BIT_TYPES[bit.type]
  const controls = useThree((s) => s.controls)
  const on = useStore((s) => s.selected === bit.id && !s.capturing)
  const color = useStore((s) => s.glasses.find((g) => g.id === bit.glass)?.color ?? '#ffffff')
  const geo = useMemo(() => {
    const g = type.build(bit, sec, { display: true })
    g?.computeVertexNormals()
    return g
  }, [type, bit, sec])
  useEffect(() => () => geo?.dispose(), [geo])
  if (!geo) return null
  // Press on a selected bit and drag to slide it over the body.
  const down = (e) => {
    const s = useStore.getState()
    if (s.selected !== bit.id || type.placement === 'base' || passThrough()) return
    startMove(e, controls, bit.id, 'all')
  }
  // With a tool armed (or a path being drawn), clicks go through bits to the
  // body behind, so you can place over the top of what's there.
  const passThrough = () => {
    const s = useStore.getState()
    return !!s.drawing || !!BIT_TYPES[s.tool]
  }
  const select = (e) => {
    if (e.delta > CLICK_SLOP || passThrough()) return
    e.stopPropagation()
    useStore.getState().setView({ selected: bit.id })
  }
  return (
    <group>
      <mesh geometry={geo} onClick={select} onPointerDown={down} name={`bit-${order}`}>
        <GlassMaterial color={color} frost={0} wall={type.thickest(bit)} />
      </mesh>
      {on && (
        <mesh geometry={geo} raycast={() => null} renderOrder={3}>
          <meshBasicMaterial color={HOT} wireframe transparent opacity={0.35} depthTest={false} />
        </mesh>
      )}
    </group>
  )
}

// Drag handles for the selected bit's own points (a handle's two attachments).
function Grips({ sec }) {
  const controls = useThree((s) => s.controls)
  const bit = useStore((s) => s.bits.find((b) => b.id === s.selected))
  const grips = bit && BIT_TYPES[bit.type].grips?.(bit, sec)
  if (!grips) return null
  return grips.map((g) => (
    <mesh key={g.key} position={g.point} renderOrder={5} onPointerDown={(e) => startMove(e, controls, bit.id, g.key)}>
      <sphereGeometry args={[0.32, 20, 14]} />
      <meshBasicMaterial color={HOT} depthTest={false} transparent opacity={0.9} />
    </mesh>
  ))
}

// The clicked points of a freehand trail being drawn.
function PathDots({ sec }) {
  const bit = useStore((s) => s.bits.find((b) => b.id === s.drawing))
  if (!bit?.points?.length) return null
  return bit.points.map(([s, theta], i) => (
    <mesh key={i} position={anchorAt(sec, s, theta).point} raycast={() => null} renderOrder={5}>
      <sphereGeometry args={[0.14, 12, 8]} />
      <meshBasicMaterial color={HOT} depthTest={false} transparent />
    </mesh>
  ))
}

// Numbered tags, in working order, standing off each bit. The buttons are
// plain DOM in one overlay (TagLayer, outside the canvas); this only moves
// them each frame to where their 3D points land on screen. (drei's <Html>
// gives every tag its own React root, and those got torn down mid-render.)
const tagEls = new Map()

function Tags({ measures }) {
  const bits = useStore((s) => s.bits)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const points = useMemo(
    () =>
      bits.map((b, i) => {
        const t = measures.bits[i].tag
        const off = BIT_TYPES[b.type].placement === 'base' ? 0.6 : 0.9
        return { id: b.id, p: new THREE.Vector3(...t.point.map((v, k) => v + t.normal[k] * off)) }
      }),
    [bits, measures],
  )
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    for (const { id, p } of points) {
      const el = tagEls.get(id)
      if (!el) continue
      v.copy(p).project(camera)
      const behind = v.z > 1
      el.style.transform = `translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px) translate(-50%, -50%)`
      el.style.visibility = behind ? 'hidden' : 'visible'
    }
  })
  return null
}

function TagLayer() {
  const bits = useStore((s) => s.bits)
  const selected = useStore((s) => s.selected)
  const flags = useWarnCounts()
  return (
    <div className="tags">
      {bits.map((b, i) => (
        <button
          key={b.id}
          ref={(el) => (el ? tagEls.set(b.id, el) : tagEls.delete(b.id))}
          className={'callout' + (b.id === selected ? ' on' : '') + (flags[b.id] ? ' warn' : '')}
          title={flags[b.id] ? `${flags[b.id]} heuristic warning${flags[b.id] > 1 ? 's' : ''}` : undefined}
          onClick={() => useStore.getState().setView({ selected: b.id })}
        >
          {i + 1}
        </button>
      ))}
    </div>
  )
}

// The water at the slider's fill, standing level in the cavity, and the
// filled piece's center of mass in blue beside the empty one. Only drawn
// when "Show water" is on: the numbers use the fill either way.
const WATER_BLUE = '#6fb7ff'
function Water() {
  const { filled, empty } = useLiquid()
  const show = useStore((s) => s.showWater)
  const poly = filled.water.poly
  const geo = useMemo(() => {
    if (!poly || poly.length < 3) return null
    // A hair inside the glass, so the two surfaces don't fight.
    return new THREE.LatheGeometry(poly.map(([r, y]) => new THREE.Vector2(Math.max(0, r * 0.994), y)), 64)
  }, [poly])
  useEffect(() => () => geo?.dispose(), [geo])
  if (!geo || !show) return null
  return (
    <group>
      <mesh geometry={geo} position={[0, empty.lift, 0]} raycast={() => null} renderOrder={1}>
        {/* Solid, so the glass's transmission shows it (a see-through mesh is
            hidden behind the glass). Nearly colorless, so the glass keeps its
            own color: a strong blue here turned green glass blue-purple. */}
        <meshStandardMaterial color="#e3edf0" roughness={0.08} metalness={0} />
      </mesh>
      <ComMarker com={filled.total.com} color={WATER_BLUE} />
    </group>
  )
}

// The center of mass: a dot, a drop line to the table and a line out from the axis.
function ComMarker({ com, color = HOT }) {
  const lines = useMemo(
    () =>
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(com[0], 0, com[2]),
        new THREE.Vector3(...com),
        new THREE.Vector3(0, com[1], 0),
        new THREE.Vector3(...com),
      ]),
    [com],
  )
  useEffect(() => () => lines.dispose(), [lines])
  return (
    <group renderOrder={4}>
      <lineSegments geometry={lines} raycast={() => null}>
        <lineBasicMaterial color={color} depthTest={false} transparent opacity={0.8} />
      </lineSegments>
      <mesh position={com} raycast={() => null}>
        <sphereGeometry args={[0.22, 20, 14]} />
        <meshBasicMaterial color={color} depthTest={false} transparent />
      </mesh>
      <mesh position={com} raycast={() => null}>
        <sphereGeometry args={[0.34, 20, 14]} />
        <meshBasicMaterial color="#1b1209" depthTest={false} transparent opacity={0.35} />
      </mesh>
    </group>
  )
}
