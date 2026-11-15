import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { glassGeometry } from '../geometry/vessel.js'
import { useDerived } from '../model/derived.js'
import { useStore } from '../model/store.js'
import GlassMaterial from './GlassMaterial.jsx'
import { packLayers } from '../model/color.js'

export default function Vessel() {
  const { sec, handle } = useDerived()
  const spout = useStore((s) => s.spout)
  const cut = useStore((s) => s.cutaway)
  const sculpt = useStore((s) => s.sculpt)
  const color = useStore((s) => s.color)
  const frost = useStore((s) => s.frost)
  const wall = useStore((s) => s.wall)
  const colors = useStore((s) => s.colors)
  const studio = useStore((s) => s.studio)
  // Only build the lookup when there's color to draw; plain glass skips it.
  const layers = useMemo(() => {
    const any = colors.regions.length > 0 || colors.incalmo.sections.some((c) => c != null)
    return any ? { data: packLayers(sec, colors, studio), outerLen: sec.outerLen } : null
  }, [sec, colors, studio])

  const glass = useMemo(() => glassGeometry(sec, { handle, spout, sculpt, cut }), [sec, handle, spout, sculpt, cut])
  const cutColor = useMemo(() => new THREE.Color('#9fd4ff').lerp(new THREE.Color(color), 0.45), [color])
  useEffect(() => () => (glass.body.dispose(), glass.cut?.dispose()), [glass])

  return (
    <group>
      <mesh geometry={glass.body}>
        <GlassMaterial color={color} frost={frost} wall={wall} layers={layers} />
      </mesh>
      {glass.cut && (
        <mesh geometry={glass.cut}>
          <meshStandardMaterial color={cutColor} roughness={0.35} />
        </mesh>
      )}
    </group>
  )
}
