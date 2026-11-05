import { useEffect, useMemo, useRef, useState } from 'react'
import { TransformControls } from '@react-three/drei'
import { buildGeometry } from '../geometry/build.js'
import { useStore } from '../model/store.js'
import GlassMaterial from './GlassMaterial.jsx'
import Handles from './Handles.jsx'

export default function PartMesh({ part, y, selected, editing }) {
  const { preset, params, material, mode } = part
  const [group, setGroup] = useState(null)
  const groupRef = useRef()
  const select = useStore((s) => s.select)
  const gizmo = useStore((s) => s.gizmo)
  const fastGlass = useStore((s) => s.fastGlass)
  const setPart = useStore((s) => s.setPart)

  const geometry = useMemo(() => buildGeometry(preset, params), [preset, params.h, params.w, params.taper])
  useEffect(() => () => geometry.dispose(), [geometry])

  const free = mode === 'free'
  const position = free ? part.position : [0, y, 0]
  const rotation = free ? part.rotation : [0, 0, 0]

  // Free parts: the gizmo moves the object directly; on release, write the
  // result back as one step. Scaling is folded into width/height so sizes stay true.
  const release = () => {
    const g = groupRef.current
    if (!g) return
    const s = g.scale
    const patch = { position: g.position.toArray(), rotation: [g.rotation.x, g.rotation.y, g.rotation.z] }
    if (Math.abs(s.x - 1) + Math.abs(s.y - 1) + Math.abs(s.z - 1) > 1e-4) {
      patch.params = { w: Math.max(0.2, params.w * (Math.abs(s.x) + Math.abs(s.z)) / 2), h: Math.max(0.2, params.h * Math.abs(s.y)) }
      s.set(1, 1, 1)
    }
    setPart(part.id, patch)
  }

  return (
    <>
      <group
        ref={(g) => {
          groupRef.current = g
          setGroup(g)
        }}
        position={position}
        rotation={rotation}
      >
        <mesh
          geometry={geometry}
          onClick={(e) => {
            if (e.delta > 4) return // that was an orbit drag, not a click
            e.stopPropagation()
            select(part.id)
          }}
        >
          <GlassMaterial material={material} thickness={Math.min(params.w, params.h) * 0.6} draft={fastGlass} />
        </mesh>
        {selected && editing && <Handles part={part} groupRef={groupRef} />}
      </group>
      {selected && editing && free && group && (
        <TransformControls object={group} mode={gizmo} size={1.1} onMouseUp={release} />
      )}
    </>
  )
}
