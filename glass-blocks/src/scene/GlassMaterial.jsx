import { useMemo } from 'react'
import * as THREE from 'three'

// Clear glass gets its color from attenuation, like real glass: thick spots
// read darker and richer than thin ones. Opaque glass is a glossy solid.
export default function GlassMaterial({ material, thickness, draft }) {
  const { color, finish, frost, iridescent } = material
  const clear = finish === 'clear'
  const surface = useMemo(() => new THREE.Color('#ffffff').lerp(new THREE.Color(color), clear ? 0.28 : 1), [color, clear])
  const tinted = color.toLowerCase() !== '#ffffff'

  if (draft) {
    // Cheap stand-in while lots of glass is on screen; same color, no refraction.
    return <meshStandardMaterial color={color} roughness={0.15 + frost * 0.5} metalness={0} transparent={clear} opacity={clear ? 0.55 : 1} />
  }
  return (
    <meshPhysicalMaterial
      color={surface}
      transmission={clear ? 1 : 0}
      thickness={thickness}
      ior={1.5}
      roughness={clear ? frost * 0.55 : 0.12 + frost * 0.55}
      attenuationColor={color}
      attenuationDistance={tinted ? 5 : Infinity}
      clearcoat={clear ? 0 : 1}
      clearcoatRoughness={0.08 + frost * 0.4}
      iridescence={iridescent ? 1 : 0}
      iridescenceIOR={1.3}
      iridescenceThicknessRange={[120, 480]}
      specularIntensity={1}
      envMapIntensity={1.4}
    />
  )
}
