import { useMemo } from 'react';
import * as THREE from 'three';
import type { GlassMaterial as Glass } from '../model/types';
import { MM_PER_IN } from '../model/units';

const WHITE = new THREE.Color('#ffffff');

/**
 * Clear glass gets its color mostly from attenuation, so thick areas read darker
 * than thin ones, the way a gather does. Opaque glass is a glossy colored surface.
 * Surface effects (optic ribs, twist, frit) are drawn in the shader so they need no
 * extra geometry; `center` is the piece's axis in its own space, for the ribs.
 */
export function GlassMaterial({ glass, thickness, center }: { glass: Glass; thickness: number; center?: THREE.Vector3 }) {
  const tint = useMemo(() => new THREE.Color(glass.color), [glass.color]);
  const surface = useMemo(() => WHITE.clone().lerp(tint, 0.12), [tint]);
  const effect = glass.effect ?? 'none';
  const patch = useEffectPatch(glass, center);
  const roughness = effect === 'frosted' ? Math.max(glass.roughness, 0.55) : glass.roughness;
  const iridescence =
    effect === 'iridescent' ? { iridescence: 1, iridescenceIOR: 1.7, iridescenceThicknessRange: [180, 620] as [number, number] } : { iridescence: 0 };
  const shared = { ...patch, ...iridescence, ior: glass.ior };

  if (glass.finish === 'opaque') {
    return (
      <meshPhysicalMaterial
        key={effect}
        {...shared}
        color={tint}
        roughness={Math.max(roughness, 0.08)}
        clearcoat={effect === 'frosted' ? 0 : 1}
        clearcoatRoughness={roughness * 0.5}
      />
    );
  }

  // colorDensity 0..1 maps to how far light travels before taking on the tint.
  const attenuationDistance = THREE.MathUtils.lerp(600, 6, Math.pow(glass.colorDensity, 0.7));
  return (
    <meshPhysicalMaterial
      key={effect}
      {...shared}
      color={effect === 'frosted' ? WHITE : surface}
      transmission={1}
      thickness={thickness}
      roughness={roughness}
      attenuationColor={tint}
      attenuationDistance={attenuationDistance}
      specularIntensity={1}
      envMapIntensity={1.2}
    />
  );
}

/**
 * Patches three's physical shader. Ribs bend the surface normal round the vertical
 * axis (cos of the angle times the rib count), turning with height for a twist. Frit
 * scatters chips of a second color, and where a chip sits the glass stops letting
 * light through, the way opaque frit picked up on a gather does.
 */
function useEffectPatch(glass: Glass, center?: THREE.Vector3) {
  const effect = glass.effect ?? 'none';
  const uniforms = useMemo(
    () => ({
      uCenter: { value: new THREE.Vector3() },
      uRibs: { value: 12 },
      uTwist: { value: 0 },
      uRibStrength: { value: 0.35 },
      uFritColor: { value: new THREE.Color() },
      uFritAmount: { value: 0.3 },
      uFritSize: { value: 3 },
    }),
    [],
  );
  uniforms.uCenter.value.copy(center ?? new THREE.Vector3());
  uniforms.uRibs.value = Math.round(glass.ribs ?? 12);
  uniforms.uTwist.value = effect === 'twist' ? THREE.MathUtils.degToRad(glass.twist ?? 45) / MM_PER_IN : 0;
  uniforms.uFritColor.value.set(glass.fritColor ?? '#f4f1ea');
  uniforms.uFritAmount.value = glass.fritAmount ?? 0.3;
  uniforms.uFritSize.value = glass.fritSize ?? 3;

  return useMemo(() => {
    if (effect !== 'optic' && effect !== 'twist' && effect !== 'frit') return {};
    const ribs = effect !== 'frit';
    return {
      customProgramCacheKey: () => `glass-${effect}`,
      onBeforeCompile: (shader: THREE.WebGLProgramParametersWithUniforms) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;');
        const head = /* glsl */ `
          varying vec3 vObjPos;
          uniform mat3 normalMatrix;
          uniform vec3 uCenter;
          uniform float uRibs, uTwist, uRibStrength, uFritAmount, uFritSize;
          uniform vec3 uFritColor;
          float glassHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
          // Chips: one per grid cell, at a random spot in it, kept if the cell rolls under the amount.
          float fritMaskAt(vec3 p) {
            vec3 q = p / uFritSize;
            vec3 cell = floor(q);
            float m = 0.0;
            for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) for (int k = -1; k <= 1; k++) {
              vec3 c = cell + vec3(i, j, k);
              if (glassHash(c + 7.1) > uFritAmount) continue;
              vec3 spot = c + vec3(glassHash(c), glassHash(c + 1.3), glassHash(c + 2.9));
              m = max(m, 1.0 - smoothstep(0.28, 0.36, length(q - spot)));
            }
            return m;
          }`;
        let frag = shader.fragmentShader.replace('#include <common>', `#include <common>\n${head}`);
        if (ribs) {
          frag = frag.replace(
            '#include <normal_fragment_maps>',
            /* glsl */ `#include <normal_fragment_maps>
            {
              vec3 p = vObjPos - uCenter;
              float around = atan(p.z, p.x);
              float wave = sin(uRibs * (around + p.y * uTwist));
              vec3 tangent = vec3(-sin(around), 0.0, cos(around));
              normal = normalize(normal + normalMatrix * tangent * wave * uRibStrength);
            }`,
          );
        } else {
          frag = frag
            .replace('#include <color_fragment>', '#include <color_fragment>\nfloat fritMask = fritMaskAt(vObjPos);\ndiffuseColor.rgb = mix(diffuseColor.rgb, uFritColor, fritMask);')
            .replace('#include <transmission_fragment>', THREE.ShaderChunk.transmission_fragment.replace('material.transmission = transmission;', 'material.transmission = transmission * (1.0 - fritMask);'));
        }
        shader.fragmentShader = frag;
      },
    };
  }, [effect, uniforms]);
}
