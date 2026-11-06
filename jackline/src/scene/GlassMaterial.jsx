import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { PACK_ROWS } from '../model/color.js'

// The color layers, read per pixel from a lookup texture (see packLayers in
// model/color.js), on top of three's physical glass:
//  - transparent layers: Beer–Lambert, exp(-absorption × path), where the
//    path is the wall thickness stretched by how glancing the view is;
//  - opaque layers: the surface turns that color and lets no light through,
//    the same at any thickness;
//  - frit: round grains scattered in cells along and around the wall.
const FRAG_PARS = /* glsl */ `
uniform sampler2D jlMap;
uniform float jlWall;
uniform float jlLen;
uniform float jlOn;
varying vec4 vJl;
vec4 jlRow(float row) { return texture2D(jlMap, vec2(vJl.x, (row + 0.5) / ${PACK_ROWS.toFixed(1)})); }
float jlHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// 1 inside a grain, 0 between. A grain sits in a share of the cells equal to
// the coverage, jittered so it doesn't read as a grid.
float jlGrain(vec2 p, float size, float density) {
  vec2 q = p / size;
  vec2 c = floor(q);
  float hit = 0.0;
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) {
    vec2 cell = c + vec2(float(i), float(j));
    if (jlHash(cell + 7.3) > density) continue;
    vec2 o = cell + 0.2 + 0.6 * vec2(jlHash(cell), jlHash(cell + 19.19));
    float r = 0.28 + 0.2 * jlHash(cell + 3.1);
    hit = max(hit, 1.0 - smoothstep(r - 0.05, r + 0.05, length(q - o)));
  }
  return hit;
}
// Same as pathFactor in model/color.js: sight line through a round wall.
float jlPath(float t, float R, float c, float inside) {
  c = clamp(c, 0.02, 1.0);
  float s2 = 1.0 - c * c;
  if (R <= t * 2.0) return min(1.0 / c, 12.0);
  float p;
  if (inside > 0.5) p = sqrt((R + t) * (R + t) - R * R * s2) - R * c;
  else {
    float rest = (R - t) * (R - t) - R * R * s2;
    p = rest >= 0.0 ? R * c - sqrt(rest) : 2.0 * R * c;
  }
  return min(p / t, 12.0);
}
`

const FRAG_LAYERS = /* glsl */ `
vec3 jlT = vec3(1.0);
float jlOpaque = 0.0;
if (jlOn > 0.5 && vJl.x >= 0.0) {
  float row = vJl.y > 0.5 ? 3.0 : 0.0;
  vec4 r0 = jlRow(row), r1 = jlRow(row + 1.0), r2 = jlRow(row + 2.0);
  float cosv = abs(dot(normal, normalize(vViewPosition)));
  jlT = exp(-r0.rgb * jlPath(jlWall, vJl.w, cosv, vJl.y));
  if (r0.a > 0.5) {
    // Opaque: its own color, tinted by any transparent glass in front of it.
    diffuseColor.rgb = r1.rgb * jlT;
    jlOpaque = 1.0;
  }
  if (r1.a > 0.0) {
    float size = abs(r2.a);
    float g = jlGrain(vec2(vJl.x * jlLen, vJl.z), size, r1.a);
    if (r2.a < 0.0) {
      diffuseColor.rgb = mix(diffuseColor.rgb, r2.rgb, g);
      jlOpaque = max(jlOpaque, g);
    } else {
      // A grain is a lump about half its size thick: far deeper than a layer.
      vec3 tg = exp(-r2.rgb * size * 5.0 / max(cosv, 0.25));
      jlT *= mix(vec3(1.0), tg, g);
      diffuseColor.rgb *= mix(vec3(1.0), tg, g * jlOpaque);
    }
  }
}
`

const TRANSMISSION = (() => {
  const src = THREE.ShaderChunk.transmission_fragment
  const a = 'material.transmission = transmission;'
  const b = 'totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );'
  if (!src.includes(a) || !src.includes(b)) {
    console.warn('Jackline: three.js transmission chunk changed; color layers will not show through.')
    return src
  }
  return src
    .replace(a, 'material.transmission = transmission * ( 1.0 - jlOpaque );')
    .replace(b, 'totalDiffuse = mix( totalDiffuse, transmitted.rgb * jlT, material.transmission );')
})()

// Clear glass gets its color from attenuation, like real glass: thick spots
// (a heavy base, a solid stem) read darker and richer than thin walls.
export default function GlassMaterial({ color, frost, wall, layers }) {
  const surface = useMemo(() => new THREE.Color('#ffffff').lerp(new THREE.Color(color), 0.28), [color])
  const tinted = color.toLowerCase() !== '#ffffff'

  const uniforms = useMemo(
    () => ({ jlMap: { value: null }, jlWall: { value: 0.3 }, jlLen: { value: 10 }, jlOn: { value: 0 } }),
    [],
  )
  useEffect(() => {
    const old = uniforms.jlMap.value
    if (layers) {
      const tex = new THREE.DataTexture(layers.data, layers.data.length / 4 / PACK_ROWS, PACK_ROWS, THREE.RGBAFormat, THREE.FloatType)
      tex.minFilter = tex.magFilter = THREE.NearestFilter
      tex.needsUpdate = true
      uniforms.jlMap.value = tex
      uniforms.jlLen.value = layers.outerLen
    }
    uniforms.jlOn.value = layers ? 1 : 0
    uniforms.jlWall.value = wall
    old?.dispose()
  }, [layers, wall, uniforms])
  useEffect(() => () => uniforms.jlMap.value?.dispose(), [uniforms])

  const onBeforeCompile = useMemo(
    () => (shader) => {
      Object.assign(shader.uniforms, uniforms)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 aJl;\nvarying vec4 vJl;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvJl = aJl;')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + FRAG_LAYERS)
        .replace('#include <transmission_fragment>', TRANSMISSION)
    },
    [uniforms],
  )

  return (
    <meshPhysicalMaterial
      color={surface}
      transmission={1}
      thickness={wall * 3}
      ior={1.5}
      roughness={frost * 0.55}
      attenuationColor={color}
      attenuationDistance={tinted ? 8 : Infinity}
      specularIntensity={1}
      envMapIntensity={1.4}
      onBeforeCompile={onBeforeCompile}
      customProgramCacheKey={() => 'jackline-layers'}
    />
  )
}
