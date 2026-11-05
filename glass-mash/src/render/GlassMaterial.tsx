import { useMemo } from 'react';
import { Color } from 'three';
import type { GlassParams } from '../scene/store';

/**
 * Glass as three.js sees it: transmission bends the scene behind the piece,
 * and the attenuation colour soaks in with depth, so thick parts read darker
 * than thin ones, just like a real tinted gather.
 */
export function GlassMaterial({ glass }: { glass: GlassParams }) {
  const { surface, tint } = useMemo(() => {
    const tint = new Color(glass.tint);
    const surface = glass.opaque ? tint.clone() : new Color('#ffffff').lerp(tint, 0.18 + glass.density * 0.2);
    return { surface, tint };
  }, [glass.tint, glass.opaque, glass.density]);

  // density 0 → colour barely shows; 1 → deep colour even in thin walls.
  const attenuationDistance = 0.08 + (1 - glass.density) ** 2 * 6;

  return (
    <meshPhysicalMaterial
      color={surface}
      transmission={glass.opaque ? 0 : 1}
      thickness={glass.thickness}
      ior={1.5}
      roughness={glass.roughness}
      attenuationColor={tint}
      attenuationDistance={attenuationDistance}
      dispersion={glass.opaque ? 0 : 0.35}
      clearcoat={1}
      clearcoatRoughness={0.04}
      specularIntensity={1}
      envMapIntensity={1.15}
    />
  );
}
