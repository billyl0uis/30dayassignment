import { useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { handleSpots } from '../geometry/build.js'
import { PRESETS } from '../geometry/presets.js'
import { useStore } from '../model/store.js'

const MIN = 0.2 // cm; nothing gets thinner or shorter than this

const COLORS = { stretch: '#ff9a4d', squash: '#5fd0ff', taper: '#ff6fb1' }
const LABELS = { stretch: 'Stretch', squash: 'Squash', taper: 'Taper' }

// Turns a pointer position (in the part's own space) into new params.
const RULES = {
  stretch: (local, start) => ({ h: Math.max(MIN, local.y) }),
  squash: (local, start, spot) => {
    const dist = Math.hypot(local.x, local.z)
    return { w: Math.max(MIN, (start.w * dist) / Math.max(spot.r, 0.01)) }
  },
  taper: (local, start, spot) => {
    // Undo the current taper to find the untapered radius at this height, then
    // solve for the taper that puts the surface under the pointer.
    const dist = Math.hypot(local.x, local.z)
    const base = spot.r / Math.max(0.05, 1 + ((start.taper ?? 1) - 1) * spot.yf)
    const taper = 1 + (dist / Math.max(base, 0.01) - 1) / spot.yf
    return { taper: Math.min(3, Math.max(0.15, taper)) }
  },
}

export default function Handles({ part, groupRef }) {
  const spots = handleSpots(part.preset, part.params)
  const kinds = ['stretch', 'squash']
  if (spots.taper && !PRESETS[part.preset].noTaper) kinds.push('taper')
  return (
    <>
      {kinds.map((kind) => (
        <Handle
          key={kind}
          kind={kind}
          part={part}
          groupRef={groupRef}
          position={kind === 'stretch' ? spots.stretch : spots[kind].pos}
          spot={spots[kind]}
        />
      ))}
    </>
  )
}

function Handle({ kind, part, groupRef, position, spot }) {
  const ref = useRef()
  const drag = useRef(null)
  const [hover, setHover] = useState(false)
  const { camera, controls, gl } = useThree()
  const setDraft = useStore((s) => s.setDraft)
  const commitDraft = useStore((s) => s.commitDraft)

  // Same size on screen however far the camera is.
  useFrame(() => {
    if (!ref.current) return
    const p = ref.current.getWorldPosition(new THREE.Vector3())
    const s = camera.position.distanceTo(p) * 0.011 * (hover || drag.current ? 1.35 : 1)
    ref.current.scale.setScalar(s)
  })

  const down = (e) => {
    e.stopPropagation()
    e.target.setPointerCapture(e.pointerId)
    const world = ref.current.getWorldPosition(new THREE.Vector3())
    const normal = camera.getWorldDirection(new THREE.Vector3()).negate()
    drag.current = {
      plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, world),
      start: { ...part.params },
      spot,
    }
    if (controls) controls.enabled = false
    gl.domElement.style.cursor = 'grabbing'
  }
  const move = (e) => {
    const d = drag.current
    if (!d) return
    e.stopPropagation()
    const hit = e.ray.intersectPlane(d.plane, new THREE.Vector3())
    if (!hit) return
    const local = groupRef.current.worldToLocal(hit)
    setDraft(part.id, { params: RULES[kind](local, d.start, d.spot) })
  }
  const up = (e) => {
    if (!drag.current) return
    e.stopPropagation()
    e.target.releasePointerCapture(e.pointerId)
    drag.current = null
    if (controls) controls.enabled = true
    gl.domElement.style.cursor = hover ? 'grab' : ''
    commitDraft()
  }

  return (
    <mesh
      ref={ref}
      position={position}
      renderOrder={10}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHover(true)
        if (!drag.current) gl.domElement.style.cursor = 'grab'
      }}
      onPointerOut={() => {
        setHover(false)
        if (!drag.current) gl.domElement.style.cursor = ''
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <sphereGeometry args={[1, 20, 14]} />
      <meshBasicMaterial color={COLORS[kind]} depthTest={false} transparent opacity={0.95} toneMapped={false} />
      {hover && !drag.current && (
        <Html center position={[0, 2.2, 0]} style={{ pointerEvents: 'none' }}>
          <div className="handle-tip" style={{ '--c': COLORS[kind] }}>{LABELS[kind]}</div>
        </Html>
      )}
    </mesh>
  )
}
