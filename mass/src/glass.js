import * as THREE from 'three';

// ── Thickness pass ───────────────────────────────────────────────────────────
// Every fragment of the glass mesh writes its distance from the camera, with
// back faces adding (+d) and front faces subtracting (−d). Additive blending
// sums all of them, so each pixel ends up holding the total length of glass
// the eye ray passes through — correct even when the ray enters and leaves the
// glass several times (a curled crest, a neck in front of a body).
// Channel g counts front faces, which is handy for debugging.

export const thicknessMaterial = new THREE.ShaderMaterial({
  side: THREE.DoubleSide,
  depthTest: false,
  depthWrite: false,
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneFactor,
  vertexShader: /* glsl */`
    varying vec3 vViewPos;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vViewPos = mv.xyz;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */`
    varying vec3 vViewPos;
    void main() {
      float d = length(vViewPos);
      gl_FragColor = gl_FrontFacing ? vec4(-d, 1.0, 0.0, 0.0) : vec4(d, 0.0, 0.0, 0.0);
    }`,
});

// ── Glass shading ────────────────────────────────────────────────────────────
// mode 0 = cold: background (rendered without the glass) seen through the
// glass, bent a little by refraction, attenuated by Beer–Lambert absorption
// exp(−σ·t) per colour channel, plus Fresnel reflection of a studio
// environment. t comes from the thickness pass — nothing here is a gradient
// keyed to position or rim angle.
// mode 1 = hot: glass glows; emitted light grows with path length
// (1 − e^(−κt)), so thick parts read hotter and thin tips dimmer.
// mode 2 = thickness: false-colour map with a contour every 1 cm.

export function createGlassMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      tThick: { value: null },
      tBack: { value: null },
      resolution: { value: new THREE.Vector2(1, 1) },
      sigma: { value: new THREE.Vector3(0.05, 0.05, 0.05) },
      ior: { value: 1.5 },
      mode: { value: 0 },
      maxT: { value: 10 },
      heat: { value: 1 },
      tVolA: { value: null },
      tVolB: { value: null },
      gridOrigin: { value: new THREE.Vector3() },
      gridH: { value: 0.19 },
      gridN: { value: 128 },
    },
    vertexShader: /* glsl */`
      varying vec3 vViewPos, vViewN, vWorldPos, vWorldN;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vWorldN = normalize(mat3(modelMatrix) * normal);
        vec4 mv = viewMatrix * wp;
        vViewPos = mv.xyz;
        vViewN = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tThick, tBack;
      uniform mat4 projectionMatrix; // not auto-declared in the fragment stage
      uniform vec2 resolution;
      uniform vec3 sigma;
      uniform float ior, maxT, heat, gridH, gridN;
      uniform int mode;
      uniform highp sampler3D tVolA, tVolB;
      uniform vec3 gridOrigin;
      const float SIGMA_MAX = 8.0;
      varying vec3 vViewPos, vViewN, vWorldPos, vWorldN;

      // Soft studio: pale cyclorama, warm floor bounce, two softboxes.
      vec3 env(vec3 d) {
        vec3 sky = vec3(0.92, 0.91, 0.89), ground = vec3(0.55, 0.53, 0.5);
        vec3 c = mix(ground, sky, smoothstep(-0.35, 0.45, d.y));
        c += 5.0 * smoothstep(0.93, 0.985, dot(d, normalize(vec3(0.5, 0.75, 0.45))));
        c += 2.5 * smoothstep(0.86, 0.96, dot(d, normalize(vec3(-0.7, 0.35, -0.2))));
        return c;
      }

      void main() {
        vec2 uv = gl_FragCoord.xy / resolution;
        float t = max(texture2D(tThick, uv).r, 0.0);
        vec3 Nw = normalize(vWorldN);
        vec3 Vw = normalize(cameraPosition - vWorldPos);
        float cosT = clamp(dot(Nw, Vw), 0.0, 1.0);
        float F = 0.04 + 0.96 * pow(1.0 - cosT, 5.0);
        vec3 col;

        if (mode == 0) {
          // Screen-space refraction: shift the background lookup by where a
          // ray bent at the entry surface would exit after travelling t.
          vec3 N = normalize(vViewN), V = normalize(-vViewPos);
          vec3 r = refract(-V, N, 1.0 / ior);
          float focal = projectionMatrix[1][1];
          vec2 off = r.xy * min(t, 6.0) * focal / max(-vViewPos.z, 1.0) * 0.5;
          off.x *= resolution.y / resolution.x;
          vec3 bg = texture2D(tBack, clamp(uv + off, 0.001, 0.999)).rgb;
          // March the straight eye ray from this entry point through the
          // absorption volume, summing σ·ds over the glass it crosses, and
          // stop once it has crossed exactly the measured thickness t.
          // For uniform glass this is exactly exp(−σ·t).
          vec3 rd = -Vw, p = vWorldPos;
          float ds = gridH * 0.6, crossed = 0.0;
          vec3 optical = vec3(0.0), behind = bg;
          for (int i = 0; i < 480; i++) {
            if (crossed >= t) break;
            p += rd * ds;
            vec3 uvw = ((p - gridOrigin) / gridH + 0.5) / gridN;
            if (any(lessThan(uvw, vec3(0.0))) || any(greaterThan(uvw, vec3(1.0)))) break;
            vec4 A = texture(tVolA, uvw);
            float occ = A.a;
            if (occ < 0.01) continue;
            vec4 B = texture(tVolB, uvw);
            if (B.a > 0.5 && occ > 0.5) { behind = B.rgb * 0.85; break; } // opaque colour: stops the light
            float seg = min(occ * ds, t - crossed);
            optical += A.rgb * A.rgb * SIGMA_MAX * seg;
            crossed += seg;
          }
          vec3 transmit = exp(-optical);
          col = behind * transmit * (1.0 - F) + env(reflect(-Vw, Nw)) * F;
        } else if (mode == 1) {
          float g = 1.0 - exp(-0.45 * t);
          vec3 orange = vec3(1.0, 0.22, 0.02), core = vec3(1.0, 0.6, 0.2);
          col = mix(orange, core, pow(1.0 - exp(-0.08 * t), 2.0)) * g * 0.9 * (0.3 + 0.7 * heat);
          col += env(reflect(-Vw, Nw)) * F * 0.35;
        } else {
          float x = clamp(t / maxT, 0.0, 1.0);
          col = mix(vec3(0.9, 0.88, 0.84), vec3(0.01, 0.02, 0.12), pow(x, 0.7));
          float iso = abs(fract(t + 0.5) - 0.5) / fwidth(t);
          col = mix(vec3(0.95, 0.35, 0.1), col, smoothstep(0.0, 1.2, iso));
        }
        gl_FragColor = vec4(col, 1.0);
        // The thickness map is a measurement; don't let tone-mapping bend it.
        if (mode != 2) {
          #include <tonemapping_fragment>
        }
        #include <colorspace_fragment>
      }`,
  });
}

// Tint = colour of white light after 1 cm of this glass at strength 1.
// σ (per cm) = −ln(tint) × strength, per channel, in linear colour.
export function sigmaFromTint(hex, strength, out = new THREE.Vector3()) {
  const c = new THREE.Color(hex); // converts sRGB hex → linear working space
  const f = (v) => -Math.log(Math.max(v, 1e-3)) * strength;
  return out.set(f(c.r), f(c.g), f(c.b));
}
