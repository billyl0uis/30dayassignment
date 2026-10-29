import { useMemo } from 'react'
import * as THREE from 'three'

// Clear glass gets its color from attenuation, like real glass: thick spots
// (a heavy base, a solid stem) read darker and richer than thin walls.
export default function GlassMaterial({ color, frost, wall }) {
  const surface = useMemo(() => new THREE.Color('#ffffff').lerp(new THREE.Color(color), 0.28), [color])
  const tinted = color.toLowerCase() !== '#ffffff'
  return (
    <meshPhysicalMaterial
      color={surface}
      transmission={1}
      thickness={wall * 3}
      ior={1.5}
      roughness={frost * 0.55}
      attenuationColor={color}
      attenuationDistance={tinted ? 3 : Infinity}
      specularIntensity={1}
      envMapIntensity={1.4}
    />
  )
}
