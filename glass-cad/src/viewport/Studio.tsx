import { useMemo } from 'react';
import * as THREE from 'three';
import { ContactShadows, Environment, Lightformer } from '@react-three/drei';

/**
 * A studio built from light panels instead of a downloaded .hdr: drei renders these
 * into a floating-point cube map, so it's an HDR environment that works offline.
 * Long softboxes give glass the tall, clean highlights it's usually shot with.
 */
export function StudioEnvironment() {
  return (
    <Environment resolution={512} frames={1}>
      <color attach="background" args={['#0d0e10']} />
      <Lightformer form="rect" intensity={2.5} position={[0, 700, 0]} rotation-x={Math.PI / 2} scale={[900, 900, 1]} />
      <Lightformer form="rect" intensity={5} position={[-600, 250, 200]} rotation-y={Math.PI / 2} scale={[120, 700, 1]} />
      <Lightformer form="rect" intensity={3} position={[600, 250, 100]} rotation-y={-Math.PI / 2} scale={[80, 700, 1]} />
      <Lightformer form="rect" intensity={1.5} position={[0, 200, -700]} scale={[900, 120, 1]} color="#ffd9a8" />
      <Lightformer form="ring" intensity={2} position={[300, 500, 500]} scale={150} onUpdate={(self) => self.lookAt(0, 0, 0)} />
    </Environment>
  );
}

/**
 * A light seamless sweep, the way glass is usually photographed: a mid-gray floor that
 * brightens toward the horizon. It's opaque, so the glass has something to refract;
 * against a dark background clear glass just reads as black.
 */
export function Backdrop({ floor = '#8a8f96', horizon = '#d9dcdf', sky = '#aeb3b9' }: { floor?: string; horizon?: string; sky?: string }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          floorColor: { value: new THREE.Color(floor) },
          horizonColor: { value: new THREE.Color(horizon) },
          skyColor: { value: new THREE.Color(sky) },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 floorColor;
          uniform vec3 horizonColor;
          uniform vec3 skyColor;
          varying vec3 vDir;
          void main() {
            float y = vDir.y;
            vec3 c = y < 0.0 ? mix(horizonColor, floorColor, smoothstep(0.0, 0.35, -y)) : mix(horizonColor, skyColor, smoothstep(0.0, 0.6, y));
            gl_FragColor = vec4(c, 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    [floor, horizon, sky],
  );
  return (
    <mesh material={material} scale={8000} raycast={() => null} renderOrder={-1}>
      <sphereGeometry args={[1, 48, 24]} />
    </mesh>
  );
}

/**
 * An opaque floor with the measuring grid drawn into it. drei's Grid is transparent,
 * and three's transmission pass only sees opaque things, so a transparent grid never
 * shows through the glass. This one does, and the bent lines are what sell it as glass.
 */
export function GridFloor({ cell, every, color = '#8a8f96', line = '#6d7279', major = '#9a7a52', fadeTo = '#d9dcdf' }: {
  cell: number;
  every: number;
  color?: string;
  line?: string;
  major?: string;
  fadeTo?: string;
}) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          cell: { value: cell },
          every: { value: every },
          baseColor: { value: new THREE.Color(color) },
          lineColor: { value: new THREE.Color(line) },
          majorColor: { value: new THREE.Color(major) },
          fadeColor: { value: new THREE.Color(fadeTo) },
        },
        vertexShader: /* glsl */ `
          varying vec3 vWorld;
          void main() {
            vec4 w = modelMatrix * vec4(position, 1.0);
            vWorld = w.xyz;
            gl_Position = projectionMatrix * viewMatrix * w;
          }`,
        fragmentShader: /* glsl */ `
          uniform float cell;
          uniform float every;
          uniform vec3 baseColor;
          uniform vec3 lineColor;
          uniform vec3 majorColor;
          uniform vec3 fadeColor;
          varying vec3 vWorld;
          float gridLine(vec2 p, float size) {
            vec2 g = abs(fract(p / size - 0.5) - 0.5) / fwidth(p / size);
            return 1.0 - min(min(g.x, g.y), 1.0);
          }
          void main() {
            float minor = gridLine(vWorld.xz, cell);
            float majorLine = gridLine(vWorld.xz, cell * every);
            vec3 c = mix(baseColor, lineColor, minor * 0.8);
            c = mix(c, majorColor, majorLine);
            float fade = smoothstep(cell * 20.0, cell * 120.0, length(vWorld.xz));
            gl_FragColor = vec4(mix(c, fadeColor, fade), 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    [cell, every, color, line, major, fadeTo],
  );
  return (
    <mesh material={material} rotation-x={-Math.PI / 2} position={[0, -0.05, 0]} raycast={() => null}>
      <circleGeometry args={[7000, 96]} />
    </mesh>
  );
}

/** Backdrop presets. Each keeps an opaque floor so the glass always has something to refract. */
export const BACKGROUNDS = {
  studio: { label: 'Studio gray', floor: '#8a8f96', horizon: '#d9dcdf', sky: '#aeb3b9', line: '#6d7279', major: '#9a7a52' },
  white: { label: 'White sweep', floor: '#e6e6e3', horizon: '#fbfbfa', sky: '#f0f0ee', line: '#cfcfcb', major: '#c8b49a' },
  warm: { label: 'Warm', floor: '#8d7f6c', horizon: '#e6d8c2', sky: '#c4b39b', line: '#77695a', major: '#a4794a' },
  dark: { label: 'Black', floor: '#1d1e21', horizon: '#2b2d31', sky: '#121315', line: '#2c2e33', major: '#5a4a35' },
} as const;

export type BackgroundId = keyof typeof BACKGROUNDS;

export function FloorShadows() {
  return <ContactShadows position={[0, 0.2, 0]} scale={1200} far={300} blur={2.4} opacity={0.45} resolution={1024} />;
}
