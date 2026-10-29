import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { glassGeometry } from '../geometry/vessel.js'
import { useDerived } from '../model/derived.js'
import { useStore } from '../model/store.js'
import GlassMaterial from './GlassMaterial.jsx'

export default function Vessel() {
  const { sec, handle } = useDerived()
  const spout = useStore((s) => s.spout)
  const cut = useStore((s) => s.cutaway)
  const sculpt = useStore((s) => s.sculpt)
  const color = useStore((s) => s.color)
  const frost = useStore((s) => s.frost)
  const wall = useStore((s) => s.wall)

  const glass = useMemo(() => glassGeometry(sec, { handle, spout, sculpt, cut }), [sec, handle, spout, sculpt, cut])
  const cutColor = useMemo(() => new THREE.Color('#9fd4ff').lerp(new THREE.Color(color), 0.45), [color])
  useEffect(() => () => (glass.body.dispose(), glass.cut?.dispose()), [glass])

  return (
    <group>
      <mesh geometry={glass.body}>
        <GlassMaterial color={color} frost={frost} wall={wall} />
      </mesh>
      {glass.cut && (
        <mesh geometry={glass.cut}>
          <meshStandardMaterial color={cutColor} roughness={0.35} />
        </mesh>
      )}
    </group>
  )
}
