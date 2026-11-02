import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GEOM, TILT } from '../config';
import type { HoldAction, Mods } from '../sim/actions';
import { clamp, geometry, type Piece } from '../sim/piece';
import { glassRGB, glowAmount, heatRGB, type RGB } from './heat';
import { profile, type Profile } from './profile';
import { buildShop, FLOOR_Y, type Shop } from './room';

export interface SceneView {
  piece: Piece | null;
  tool: HoldAction | null; // the tool actually working right now
  turnPhase: number; // 0–1, advances while the pipe turns
  turning: boolean;
  mods: Mods;
  time: number; // seconds, for animation
  tilt?: number; // −1 tip up … +1 tip down
}

type StationKey = 'gather' | 'glory' | 'marver' | 'block' | 'pad' | 'jacks';

export const STATION_LABEL: Record<HoldAction, string> = {
  gather: 'Furnace · gather',
  glory: 'Glory hole',
  marver: 'Marver',
  block: 'Block',
  blow: 'Blow',
  jacks: 'Jacks',
};

// World units are inches. The pipe runs along x, its tip at the origin, the free end toward +x.
const SEG = 40; // around the axis
const ROWS = 64; // must match the profile's sample count
const PIVOT_X = -13; // where the pipe rests on the bench's near arm: tipping rocks the pipe on it

// Where the furnace, glory hole and marver stand in the shop. Using one carries the pipe there.
const FURNACE = { at: new THREE.Vector3(26, 0, -40), scale: 1.6, portY: 0.4 };
const GLORY = { at: new THREE.Vector3(26, 0, -8), scale: 1.5 };
const MARVER_AT = new THREE.Vector3(6, -7, -26); // the center of the table's top
const FIXED: StationKey[] = ['gather', 'glory', 'marver'];

export const color = ([r, g, b]: RGB) => new THREE.Color(`rgb(${r | 0},${g | 0},${b | 0})`);

/** The hot shop in 3D. Owns its camera and props; the piece arrives fresh every frame. */
export class Scene {
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(52, 1, 0.5, 600); // wide enough to see the shop around the bench
  private w = 0;
  private h = 0;

  // Camera: an eased frame around the piece, plus the player's drag offset.
  private target = new THREE.Vector3(1.5, 0, 0);
  private dist = 16;
  private yaw = 0;
  private pitch = 0;
  private static readonly HOME = { yaw: 0.22, pitch: 0.14 };

  private pipe: THREE.Mesh;
  private pipeMark: THREE.Mesh;
  private punty: THREE.Mesh;
  private glass: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>;
  private halo: THREE.Sprite;
  private heatLight = new THREE.PointLight(0xff8a3d, 0, 0, 2);
  private puddle: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  private cracks: THREE.LineSegments;
  private stations: Record<StationKey, THREE.Group>;
  private presence: Partial<Record<StationKey, number>> = {};
  // The pipe, the piece and the station props swing together when the pipe is tipped.
  private shop: Shop;
  private mottle = mottleTexture();
  private carry = new THREE.Group(); // walks the pipe from the bench to a station and back
  private carryTo = new THREE.Vector3();
  private rig = new THREE.Group();
  private arm = new THREE.Group();
  private stationLight = new THREE.PointLight(0xffa040, 0, 0, 2);

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Soft studio reflections for the steel and the glass.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.45;
    this.scene.background = new THREE.Color('#c3c8cb');
    this.scene.fog = new THREE.Fog('#c3c8cb', 160, 320);
    this.shop = buildShop(this.scene);

    // Bloom: only what's brighter than daylit surfaces (hot glass, open fires) spills light past its edge.
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.4, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    const steel = new THREE.MeshStandardMaterial({ color: '#8b9399', metalness: 0.85, roughness: 0.35 });
    this.pipe = new THREE.Mesh(blowpipeGeometry(), steel);
    this.pipe.rotation.z = -Math.PI / 2; // the lathe's axis (y) becomes the pipe's (x)
    this.pipe.castShadow = true;
    // A brass band near the tip, so you can see the pipe roll.
    this.pipeMark = new THREE.Mesh(
      new THREE.CylinderGeometry(GEOM.pipeR * 1.04, GEOM.pipeR * 1.04, 0.5, 24, 1, true, 0, Math.PI * 0.5),
      new THREE.MeshStandardMaterial({ color: '#c9a14a', metalness: 0.8, roughness: 0.3 }),
    );
    this.pipeMark.rotation.z = Math.PI / 2;
    this.pipeMark.position.x = -4;
    this.punty = new THREE.Mesh(
      new THREE.CylinderGeometry(GEOM.puntyR, GEOM.puntyR, 60, 16),
      new THREE.MeshStandardMaterial({ color: '#4a4643', metalness: 0.7, roughness: 0.55 }),
    );
    this.punty.rotation.z = Math.PI / 2;
    this.punty.position.x = -30 + 0.15;
    this.rig.position.x = PIVOT_X;
    this.arm.position.x = -PIVOT_X;
    this.rig.add(this.arm);
    this.carry.add(this.rig);
    this.scene.add(this.carry);
    this.arm.add(this.pipe, this.pipeMark, this.punty);

    this.glass = new THREE.Mesh(latheGeometry(), new THREE.MeshPhysicalMaterial({
      color: '#ffffff', roughness: 0.04, metalness: 0, ior: 1.5, transmission: 1, thickness: 0.3,
      specularIntensity: 1, clearcoat: 1, clearcoatRoughness: 0.05,
    }));
    this.glass.castShadow = true;
    // Hot glass never glows perfectly evenly: a soft mottle that rolls round with the pipe shows it turning.
    this.glass.material.emissiveMap = this.mottle;
    this.arm.add(this.glass);

    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: haloTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0,
    }));
    this.arm.add(this.halo, this.heatLight, this.stationLight);

    this.puddle = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.MeshStandardMaterial({ roughness: 0.15 }));
    this.scene.add(this.puddle);

    this.cracks = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#ffffff' }));
    this.arm.add(this.cracks);

    this.stations = buildStations();
    for (const [key, g] of Object.entries(this.stations) as [StationKey, THREE.Group][]) {
      if (!FIXED.includes(key)) {
        this.arm.add(g); // hand tools come to the piece
        continue;
      }
      this.scene.add(g); // the fires and the marver stand in the shop
      g.visible = true;
      g.traverse((o) => (o.castShadow = o.receiveShadow = true));
    }
    this.stations.gather.position.copy(FURNACE.at);
    this.stations.gather.scale.setScalar(FURNACE.scale);
    this.stations.glory.position.copy(GLORY.at);
    this.stations.glory.scale.setScalar(GLORY.scale);
    this.stations.marver.position.copy(MARVER_AT);

    this.bindDrag();
    this.resetView();
  }

  resetView() {
    this.yaw = Scene.HOME.yaw;
    this.pitch = Scene.HOME.pitch;
  }

  dispose() {
    this.renderer.dispose();
  }

  /** Drag to look around the bench; double-click or double-tap puts the view back. */
  private bindDrag() {
    let last: { x: number; y: number } | null = null;
    this.canvas.style.touchAction = 'none';
    this.canvas.addEventListener('pointerdown', (e) => {
      last = { x: e.clientX, y: e.clientY };
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!last) return;
      this.yaw = clamp(this.yaw - (e.clientX - last.x) * 0.006, -1.3, 1.3);
      this.pitch = clamp(this.pitch + (e.clientY - last.y) * 0.005, -0.25, 1.1);
      last = { x: e.clientX, y: e.clientY };
    });
    const end = () => (last = null);
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
    this.canvas.addEventListener('dblclick', () => this.resetView());
  }

  private fit() {
    const w = Math.max(1, Math.round(this.canvas.clientWidth));
    const h = Math.max(1, Math.round(this.canvas.clientHeight));
    if (w !== this.w || h !== this.h) {
      this.w = w;
      this.h = h;
      this.renderer.setSize(w, h, false);
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
      this.camera.aspect = w / h;
      // On a tall phone screen the thumb controls cover the bottom half: frame the work higher up.
      if (w / h < 0.8) this.camera.setViewOffset(w, h, 0, h * 0.2, w, h);
      else this.camera.clearViewOffset();
      this.camera.updateProjectionMatrix();
    }
  }

  draw(v: SceneView, dt: number) {
    this.fit();
    const p = v.piece;
    const pr = p && p.V > 0 ? profile(p) : null;
    const k = Math.min(1, dt * 3);

    // Frame the piece: ease the target and the distance toward something that fits it.
    const len = Math.max(pr?.length ?? 0, 3);
    const maxR = Math.max(pr?.maxR ?? 0, 1.2);
    const maxDrop = pr ? pr.drop[pr.drop.length - 1] : 0;
    const onFloor = p?.failed?.kind === 'floor';
    const want = onFloor
      ? new THREE.Vector3(len * 0.7, FLOOR_Y + 2, 0)
      : new THREE.Vector3(len / 2 - 0.6, -maxDrop / 2, 0);
    // Tipping swings everything on the pipe about the gaffer's hands; follow the piece.
    const tip = -(v.tilt ?? 0) * THREE.MathUtils.degToRad(TILT.maxDegrees);
    this.rig.rotation.z = tip;
    if (!onFloor) {
      const dx = want.x - PIVOT_X;
      want.set(PIVOT_X + dx * Math.cos(tip) - want.y * Math.sin(tip), dx * Math.sin(tip) + want.y * Math.cos(tip), 0);
    }
    want.add(this.carry.position);
    this.target.lerp(want, k);
    const narrow = this.camera.aspect < 1 ? 1 / this.camera.aspect : 1;
    const wantDist = onFloor ? 26 : clamp((len + 2 * maxR + 5) * 1.2 * Math.min(narrow, 1.9), 11, 52);
    this.dist += (wantDist - this.dist) * k;
    // At the furnace or the glory hole, look down the pipe into the port, as the gaffer does.
    const atFire = Math.max(this.presence.gather ?? 0, this.presence.glory ?? 0);
    const f = atFire * atFire * (3 - 2 * atFire);
    const yaw = this.yaw + (-0.95 - this.yaw) * f;
    const pitch = this.pitch + (0.16 - this.pitch) * f;
    const dist = this.dist + (clamp(26 + maxR * 3, 28, 44) - this.dist) * f;
    const cp = Math.cos(pitch);
    this.camera.position.set(
      this.target.x + dist * cp * Math.sin(yaw),
      this.target.y + dist * Math.sin(pitch),
      this.target.z + dist * cp * Math.cos(yaw),
    );
    this.camera.lookAt(this.target);

    // Pipe or punty.
    const onPunty = !!p?.punty;
    this.pipe.visible = !onPunty;
    this.pipeMark.visible = !onPunty;
    this.punty.visible = onPunty;
    const roll = v.turnPhase * Math.PI * 2;
    this.pipeMark.rotation.x = roll;

    const T = p?.T ?? 70;
    const glow = pr ? glowAmount(T) : 0;
    const heat = heatRGB(T);

    this.glass.visible = !!pr && !onFloor;
    this.puddle.visible = !!pr && onFloor;
    this.cracks.visible = false;
    this.halo.material.opacity = 0;
    this.heatLight.intensity = 0;

    if (p && pr && !onFloor) {
      // The droop turns with the pipe: point it where it really hangs right now.
      const m = Math.hypot(p.cx, p.cy);
      const dir: [number, number] = m > 1e-6
        ? [(p.cx * Math.cos(roll) - p.cy * Math.sin(roll)) / m, (p.cx * Math.sin(roll) + p.cy * Math.cos(roll)) / m]
        : [-1, 0];
      updateLathe(this.glass.geometry, pr, Math.min(p.uneven, 1), roll, dir);
      styleGlass(this.glass.material, p, glow, heat);
      this.mottle.offset.x = -v.turnPhase;
      const center = new THREE.Vector3(pr.length / 2, -maxDrop / 2, 0);
      this.halo.position.copy(center);
      this.halo.scale.setScalar((pr.length + pr.maxR * 2) * 1.6);
      this.halo.material.color = color(heat);
      this.halo.material.opacity = 0.2 * glow;
      this.heatLight.position.copy(center).add(new THREE.Vector3(0, 0, pr.maxR + 1));
      this.heatLight.color = color(heat);
      this.heatLight.intensity = 500 * glow * (0.6 + 0.4 * Math.min(1, p.V / 10));
      if (p.failed?.kind === 'crack') this.showCracks(pr);
    } else if (p && pr && onFloor) {
      const m = this.puddle.material;
      m.color = color(glassRGB(p.color)).lerp(color(heat), glow);
      m.emissive = color(heat);
      m.emissiveIntensity = 1.6 * glow;
      this.puddle.position.set(pr.length * 0.7, FLOOR_Y + 0.2, 0);
      this.puddle.scale.set(pr.length * 0.55 + pr.maxR, pr.maxR * 0.35, pr.maxR * 1.4);
    }

    this.placeStations(v, p, pr, dt);
    this.shop.update(v.time, dt);
    this.composer.render();
  }

  /**
   * Stations ease in and out instead of popping: the furnace and glory hole slide in from the side,
   * the marver and block rise from below, the jacks swing in. Each keeps its last placement while it leaves.
   */
  private placeStations(v: SceneView, p: Piece | null, pr: Profile | null, dt: number) {
    const tool = v.tool;
    const active: StationKey | null = !tool || !p || !pr || tool === 'blow' ? null
      : tool === 'block' ? (v.mods.pad ? 'pad' : 'block') : tool;
    this.stationLight.intensity = 0;
    this.carryTo.set(0, 0, 0);
    if (tool && p && pr) this.placeActive(v, p, pr, tool);
    // Walk the pipe over (or back to the bench), easing in and out.
    this.carry.position.lerp(this.carryTo, Math.min(1, dt * 3.2));
    flicker(this.stations.gather, v.time);
    flicker(this.stations.glory, v.time);
    const k = Math.min(1, dt * 9);
    for (const key of Object.keys(this.stations) as StationKey[]) {
      const g = this.stations[key];
      const was = this.presence[key] ?? 0;
      const now = was + ((key === active ? 1 : 0) - was) * k;
      this.presence[key] = now;
      if (FIXED.includes(key)) continue;
      g.visible = now > 0.02;
      if (!g.visible) continue;
      if (key === active) g.userData.base = g.position.clone();
      const base = (g.userData.base as THREE.Vector3 | undefined) ?? g.position.clone();
      const e = 1 - (1 - now) ** 3; // ease out
      const away = 1 - e;
      g.position.copy(base);
      if (key === 'block' || key === 'pad') g.position.y -= away * 7;
      else if (key === 'jacks') g.position.z += away * 8;
      if (key === active) this.stationLight.intensity *= e;
    }
  }

  private placeActive(v: SceneView, p: Piece, pr: Profile, tool: HoldAction) {
    const len = pr.length;
    const R = pr.maxR;
    const dropEnd = pr.drop[pr.drop.length - 1];
    switch (tool) {
      case 'gather': {
        // Into the furnace's port, the gather down in the melt.
        this.carryTo.set(FURNACE.at.x + 1.6, FURNACE.portY * FURNACE.scale + dropEnd / 2, FURNACE.at.z);
        this.stationLight.position.set(-3, 0.5, 0);
        this.stationLight.intensity = 260;
        break;
      }
      case 'glory': {
        // Into the glory hole's port.
        this.carryTo.set(GLORY.at.x + 1.4, dropEnd / 2, GLORY.at.z);
        this.stationLight.position.set(-3, 0, 0);
        this.stationLight.intensity = 220;
        break;
      }
      case 'marver': {
        // Down onto the steel, the piece centered over the table.
        this.carryTo.set(MARVER_AT.x - len / 2, MARVER_AT.y + R + dropEnd * 0.5, MARVER_AT.z);
        break;
      }
      case 'block': {
        // The wet pad takes the block's place once you own it.
        const g = v.mods.pad ? this.stations.pad : this.stations.block;
        const r = Math.max(geometry(p).R, 0.6) + 0.12;
        g.position.set(Math.max(len - r, len * 0.5), -dropEnd * 0.8, 0);
        g.scale.setScalar(r);
        // Steam off the wet wood or paper, rising and fading.
        for (const puff of g.children.filter((c) => c.userData.steam) as THREE.Sprite[]) {
          const t = (v.time * 0.6 + puff.userData.steam) % 1;
          puff.position.set(0.5 * (puff.userData.steam - 0.5), 1.1 + t * 2.4, 0.3);
          puff.scale.setScalar(0.6 + t * 1.4);
          puff.material.opacity = 0.35 * (1 - t);
        }
        break;
      }
      case 'jacks': {
        const g = this.stations.jacks;
        const [upper, lower] = g.children;
        if (!p.punty) {
          const i = clamp(Math.round((pr.neckX / Math.max(len, 1e-3)) * (ROWS - 1)), 0, ROWS - 1);
          const rN = pr.outer[i];
          g.position.set(pr.neckX, -pr.drop[i], 0);
          upper.position.set(-0.6, rN + 1.1, 0);
          upper.rotation.z = 0.5;
          lower.position.set(-0.6, -rN - 1.1, 0);
          lower.rotation.z = -0.5;
          const squeeze = 0.08 * Math.sin(v.time * 7); // the blades bite and ease as the pipe rolls
          upper.position.y -= squeeze;
          lower.position.y += squeeze;
        } else {
          const lip = Math.max(pr.outer[ROWS - 1] - 0.6, 0.1);
          g.position.set(len, -pr.drop[ROWS - 1], 0);
          upper.position.set(0.4, lip, 0);
          upper.rotation.z = -0.45;
          lower.position.set(0.4, -lip, 0);
          lower.rotation.z = 0.45;
        }
        break;
      }
      default:
        break;
    }
  }

  private showCracks(pr: Profile) {
    const pts: number[] = [];
    let seed = 7;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (let c = 0; c < 5; c++) {
      let i = Math.floor(ROWS * (0.2 + 0.6 * rnd()));
      let th = -0.4 + rnd() * 0.8;
      let prev: THREE.Vector3 | null = null;
      for (let s = 0; s < 8; s++) {
        i = clamp(i + Math.round((rnd() - 0.5) * 6), 0, ROWS - 1);
        th += 0.2 + rnd() * 0.15;
        const r = pr.outer[i] * 1.01;
        const pt = new THREE.Vector3(pr.xs[i], -pr.drop[i] + r * Math.sin(th), r * Math.cos(th));
        if (prev) pts.push(prev.x, prev.y, prev.z, pt.x, pt.y, pt.z);
        prev = pt;
      }
    }
    this.cracks.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.cracks.visible = true;
  }


}

/**
 * A blowpipe, turned on a lathe: a steel tube with a heavier nose at the gathering end
 * and the bore you blow through running down the middle. Lathe y runs along the pipe, tip at 0.3.
 */
function blowpipeGeometry() {
  const R = GEOM.pipeR;
  const nose = R * 1.2;
  const bore = R * 0.32;
  const pts = [
    [bore, -60], [R, -60], // the mouthpiece end, far off to the left
    [R, -1.6], [nose, -1.1], // the tube swells into the nose
    [nose, 0.05], [nose * 0.88, 0.3], // a small chamfer at the tip
    [bore, 0.3], [bore, -3], [0, -3], // the bore, open at the tip
  ].map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(pts, 32);
}

// ── The piece as a solid of revolution ──────────────────────────────

/** A fixed grid: the outer skin out to the tip, then the inner skin back, so a blown piece is a real shell. */
export function latheGeometry() {
  const g = new THREE.BufferGeometry();
  const rows = ROWS * 2;
  const cols = SEG + 1;
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(rows * cols * 3), 3));
  // u runs around the axis, v along it, so a texture can roll with the pipe.
  const uv = new Float32Array(rows * cols * 2);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) uv.set([c / SEG, r / (rows - 1)], (r * cols + c) * 2);
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const idx: number[] = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < SEG; c++) {
      const a = r * cols + c;
      const d = a + cols;
      idx.push(a, d, a + 1, a + 1, d, d + 1);
    }
  }
  g.setIndex(idx);
  return g;
}

export function updateLathe(g: THREE.BufferGeometry, pr: Profile, uneven: number, roll: number, [dy, dz]: [number, number]) {
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const cols = SEG + 1;
  const wobble = uneven * 0.12;
  let v = 0;
  const put = (i: number, radius: number) => {
    for (let c = 0; c < cols; c++) {
      const th = (c / SEG) * Math.PI * 2;
      // An uneven piece is out of round; the lump rolls with the pipe.
      const r = radius * (1 + wobble * Math.cos(th - roll));
      pos.setXYZ(v++, pr.xs[i], pr.drop[i] * dy + r * Math.cos(th), pr.drop[i] * dz + r * Math.sin(th));
    }
  };
  for (let i = 0; i < ROWS; i++) put(i, pr.outer[i]);
  for (let i = ROWS - 1; i >= 0; i--) put(i, pr.inner[i]);
  pos.needsUpdate = true;
  g.computeVertexNormals();
  g.computeBoundingSphere();
}

/** Cold glass shows its color and lets light through; hot glass glows and the glow hides the color. */
export function styleGlass(m: THREE.MeshPhysicalMaterial, p: Piece, glow: number, heat: RGB) {
  const base = color(glassRGB(p.color));
  const opal = p.color === 'opal';
  m.color = (p.color ? base.clone() : new THREE.Color('#f2fbfc')).lerp(color(heat).multiplyScalar(0.8), glow * 0.8);
  m.attenuationColor = p.color ? base : new THREE.Color('#d8eef0');
  m.attenuationDistance = p.color ? 0.9 : 6;
  m.transmission = (opal ? 0.1 : 1) * (1 - glow * 0.75);
  m.roughness = p.failed?.kind === 'crack' ? 0.4 : opal ? 0.3 : 0.06;
  m.emissive = color(heat);
  m.emissiveIntensity = 0.9 * glow * glow + 0.25 * glow;
}

// ── Props that appear when a tool is working ─────────────────────────
// Each is a unit model around the piece's center, scaled to the piece. The pipe comes in from −x.


/** Flames and glow that breathe a little, so the furnace and glory hole feel lit. */
function flicker(g: THREE.Object3D, time: number) {
  g.traverse((o) => {
    const f = o.userData.flame as number | undefined;
    if (f === undefined) return;
    const n = 0.85 + 0.15 * Math.sin(time * 13 + f * 7) * Math.sin(time * 5.3 + f * 3);
    o.scale.set(1, n, 1);
  });
}


// Both fires are modeled whole, as you'd meet them: closed equipment with a round port facing the
// gaffer (−x). Local x = 0 is the face of the port; the body runs off toward +x around the piece.
// You see the glass the way a gaffer does, by looking down the pipe into the glowing port.

/** A glow that's bright at the back of a chamber (v = 0) and darker toward the port. */
function chamberMaterial(hot: string, cool: string) {
  return new THREE.MeshBasicMaterial({ map: gradientTexture(hot, cool), side: THREE.BackSide });
}

/**
 * Glory hole: a steel drum on its side on a welded stand, a burner on the back, the port in a
 * thick front plate, and a fiber-lined chamber glowing inside.
 */
function buildGloryHole() {
  const g = new THREE.Group();
  const Ro = 4.2, Ri = 3.4, L = 9, port = 2.4;
  const steel = new THREE.MeshStandardMaterial({ color: '#6c747a', metalness: 0.75, roughness: 0.42 });
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(Ro, Ro, L, 48, 1, true), steel);
  shell.rotation.z = Math.PI / 2;
  shell.position.x = L / 2;
  shell.castShadow = true;
  const lining = new THREE.Mesh(new THREE.CylinderGeometry(Ri, Ri, L - 0.1, 48, 1, true), chamberMaterial('#d8641e', '#6a200c'));
  lining.rotation.z = -Math.PI / 2; // so the gradient's hot end sits at the back
  lining.position.x = L / 2;
  g.add(shell, lining);
  // Rolled steel bands.
  for (const x of [0.5, L / 2, L - 0.5]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(Ro + 0.05, 0.14, 8, 48), steel);
    band.rotation.y = Math.PI / 2;
    band.position.x = x;
    g.add(band);
  }
  // The front plate with its port, and the hot ring of refractory showing round the opening.
  const plate = new THREE.Mesh(new THREE.RingGeometry(port, Ro + 0.25, 48), new THREE.MeshStandardMaterial({ color: '#4c5358', metalness: 0.6, roughness: 0.5, side: THREE.DoubleSide }));
  plate.rotation.y = -Math.PI / 2;
  const throat = new THREE.Mesh(new THREE.CylinderGeometry(port, port, Ro - Ri + 0.6, 48, 1, true), chamberMaterial('#d8641e', '#8a3010'));
  throat.rotation.z = Math.PI / 2;
  throat.position.x = (Ro - Ri + 0.6) / 2;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(port, 0.16, 10, 48), new THREE.MeshBasicMaterial({ color: '#e07a34' }));
  rim.rotation.y = Math.PI / 2;
  rim.position.x = -0.02;
  const fill = new THREE.Mesh(new THREE.RingGeometry(Ri - 0.01, Ro, 48), new THREE.MeshBasicMaterial({ color: '#5a1a0a', side: THREE.DoubleSide }));
  fill.rotation.y = -Math.PI / 2;
  fill.position.x = 0.3;
  g.add(plate, throat, rim, fill);
  // The back wall, brightest where the burner fires in, and the burner itself outside.
  const back = new THREE.Mesh(new THREE.CircleGeometry(Ri, 48), new THREE.MeshBasicMaterial({ color: '#e8742a' }));
  back.rotation.y = -Math.PI / 2;
  back.position.x = L - 0.06;
  const cap = new THREE.Mesh(new THREE.CircleGeometry(Ro, 48), steel);
  cap.rotation.y = Math.PI / 2;
  cap.position.x = L;
  g.add(back, cap);
  const flameMat = new THREE.MeshBasicMaterial({ color: '#ffb25a', transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
  [[0, 2.6, 0.7], [0.5, 1.8, 0.45], [-0.45, 2, 0.5]].forEach(([z, len, r], i) => {
    const flame = new THREE.Mesh(new THREE.ConeGeometry(r, len, 16, 1, true), flameMat);
    flame.geometry.translate(0, len / 2, 0);
    const holder = new THREE.Group();
    holder.add(flame);
    holder.rotation.z = Math.PI / 2;
    holder.position.set(L - 0.1, -1.8 + i * 0.2, z);
    flame.userData.flame = i;
    g.add(holder);
  });
  const burner = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 3, 20), steel);
  burner.rotation.z = Math.PI / 2;
  burner.position.set(L + 1.5, -1.8, 0);
  const gas = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 6, 12), new THREE.MeshStandardMaterial({ color: '#c9a14a', metalness: 0.7, roughness: 0.35 }));
  gas.position.set(L + 2.8, -4.8, 0);
  g.add(burner, gas);
  // Welded stand to the floor.
  const legMat = new THREE.MeshStandardMaterial({ color: '#32373c', metalness: 0.6, roughness: 0.6 });
  for (const x of [1.5, L - 1.5]) for (const z of [-2.6, 2.6]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 24, 0.4), legMat);
    leg.position.set(x, -Ro - 12 + 0.6, z);
    g.add(leg);
  }
  const cradle = new THREE.Mesh(new THREE.BoxGeometry(L - 1, 0.5, 6), legMat);
  cradle.position.set(L / 2, -Ro - 0.2, 0);
  g.add(cradle);
  return g;
}

/**
 * Furnace: a brick-faced box with a steel frame, the gathering port in its face, a hood over the
 * door, and inside, a glowing chamber with the pot of molten glass the gather dips into.
 */
function buildFurnace() {
  const g = new THREE.Group();
  const W = 14, H = 14, D = 14, port = 2.7, base = -6.5; // the melt's surface sits just under the pipe
  const brick = new THREE.MeshStandardMaterial({ map: brickTexture(), roughness: 0.9 });
  const frame = new THREE.MeshStandardMaterial({ color: '#3d4449', metalness: 0.6, roughness: 0.5 });
  // The body: a box behind the face.
  const body = new THREE.Mesh(new THREE.BoxGeometry(D, H, W), frame);
  body.position.set(D / 2 + 0.5, base + H / 2, 0);
  body.castShadow = true;
  g.add(body);
  // The brick face with the round gathering port cut through it.
  const face = new THREE.Shape();
  face.moveTo(-W / 2, base);
  face.lineTo(W / 2, base);
  face.lineTo(W / 2, base + H);
  face.lineTo(-W / 2, base + H);
  face.lineTo(-W / 2, base);
  const hole = new THREE.Path();
  hole.absarc(0, 0.4, port, 0, Math.PI * 2, false);
  face.holes.push(hole);
  const front = new THREE.Mesh(new THREE.ExtrudeGeometry(face, { depth: 0.9, bevelEnabled: false, curveSegments: 40 }), brick);
  front.rotation.y = -Math.PI / 2;
  front.position.x = 0.9;
  g.add(front);
  // Steel angle framing the face.
  for (const [w, h, y, z] of [[0.5, H + 0.5, base + H / 2, -W / 2 - 0.1], [0.5, H + 0.5, base + H / 2, W / 2 + 0.1], [0.5, 0.5, base + H, 0], [0.5, 0.5, base, 0]] as const) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, h, w === 0.5 && h === 0.5 ? W + 0.6 : w), frame);
    m.position.set(-0.05, y, z);
    g.add(m);
  }
  // The port's throat, glowing, and the hot lip.
  const throat = new THREE.Mesh(new THREE.CylinderGeometry(port, port, 1, 48, 1, true), chamberMaterial('#d8641e', '#8a3010'));
  throat.rotation.z = Math.PI / 2;
  throat.position.set(0.45, 0.4, 0);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(port, 0.18, 10, 48), new THREE.MeshBasicMaterial({ color: '#e07a34' }));
  lip.rotation.y = Math.PI / 2;
  lip.position.set(-0.03, 0.4, 0);
  g.add(throat, lip);
  // The chamber inside: dark glowing walls, the pot, the melt.
  const chamber = new THREE.Mesh(new THREE.BoxGeometry(D - 1, H - 1, W - 1), chamberMaterial('#c4501c', '#4a160a'));
  chamber.position.set(D / 2 + 0.9, base + H / 2, 0);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.2, 4.2, 40, 1, true), new THREE.MeshBasicMaterial({ color: '#6a2a12', side: THREE.DoubleSide }));
  pot.position.set(5.4, base + 2.6, 0);
  const melt = new THREE.Mesh(new THREE.CircleGeometry(4.5, 40), new THREE.MeshBasicMaterial({ color: '#e07a2a' }));
  melt.rotation.x = -Math.PI / 2;
  melt.position.set(5.4, base + 4.7, 0);
  melt.userData.flame = 5;
  g.add(chamber, pot, melt);
  // The hood over the face, and legs.
  const hood = new THREE.Mesh(new THREE.BoxGeometry(5, 1, W + 2), frame);
  hood.position.set(-1.8, base + H + 1.6, 0);
  hood.rotation.z = -0.35;
  g.add(hood);
  for (const z of [-W / 2 + 1, W / 2 - 1]) for (const x of [2, D - 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.8, 20, 0.8), frame);
    leg.position.set(x, base - 10, z);
    g.add(leg);
  }
  return g;
}

/**
 * Wet newspaper: a thick folded wad cupped in the palm under the piece, soaked dark, scorched where
 * the hot glass sits, steaming.
 */
function buildPad() {
  const g = new THREE.Group();
  const a0 = THREE.MathUtils.degToRad(192), a1 = THREE.MathUtils.degToRad(348);
  const sector = (r0: number, r1: number) => {
    const s = new THREE.Shape();
    s.absarc(0, 0, r1, a0, a1, false);
    s.absarc(0, 0, r0, a1, a0, true);
    return s;
  };
  const paper = new THREE.MeshStandardMaterial({ map: newspaperTexture(), roughness: 1, color: '#8d877b' }); // soaked: darker than dry paper
  // Three folded layers, each a little wider and offset, so the edges of the folds show.
  [[1.0, 1.22, 2.3, 0], [1.22, 1.42, 2.6, 0.08], [1.42, 1.6, 2.45, -0.07]].forEach(([r0, r1, depth, shift]) => {
    const geo = new THREE.ExtrudeGeometry(sector(r0, r1), { depth, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 2, curveSegments: 24 });
    geo.translate(0, 0, -depth / 2);
    const layer = new THREE.Mesh(geo, paper);
    layer.rotation.y = Math.PI / 2; // the sector wraps around the pipe axis (x)
    layer.position.x = shift;
    g.add(layer);
  });
  addSteam(g);
  return g;
}

function addSteam(g: THREE.Group) {
  const mat = () => new THREE.SpriteMaterial({ map: haloTexture(), color: '#ffffff', transparent: true, opacity: 0, depthWrite: false });
  for (const k of [0, 0.33, 0.66]) {
    const puff = new THREE.Sprite(mat());
    puff.userData.steam = k;
    g.add(puff);
  }
}

function buildStations() {
  const steel = new THREE.MeshStandardMaterial({ color: '#7f878d', metalness: 0.8, roughness: 0.35, side: THREE.DoubleSide });

  // Marver: a long polished steel table under the piece.
  const marver = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(18, 0.9, 10), steel);
  top.position.y = -0.45;
  top.receiveShadow = true;
  const legMat = new THREE.MeshStandardMaterial({ color: '#3a3f44', metalness: 0.6, roughness: 0.6 });
  for (const [x, z] of [[-8, -4], [8, -4], [-8, 4], [8, 4]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.8, 30, 0.8), legMat);
    leg.position.set(x, -15.5, z);
    marver.add(leg);
  }
  marver.add(top);

  // Block: a wet cherrywood cup cradling the end, with its handle, steaming.
  const block = new THREE.Group();
  const cup = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#6b4325', roughness: 0.8, side: THREE.DoubleSide }));
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4, 12),
    new THREE.MeshStandardMaterial({ color: '#4d2f19', roughness: 0.8 }));
  handle.position.set(0.8, -2.6, 0);
  handle.rotation.z = 0.5;
  block.add(cup, handle);
  addSteam(block);

  // Jacks: two steel blades.
  const jacks = new THREE.Group();
  const blade = () => new THREE.Mesh(new THREE.BoxGeometry(3, 0.12, 0.5), steel);
  jacks.add(blade(), blade());

  return { gather: buildFurnace(), glory: buildGloryHole(), marver, block, pad: buildPad(), jacks };
}

/** A vertical glow: bright at the burner end (v = 0), darker toward the port. */
function gradientTexture(hot: string, cool: string) {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const x = c.getContext('2d')!;
  const g = x.createLinearGradient(0, 128, 0, 0);
  g.addColorStop(0, hot);
  g.addColorStop(1, cool);
  x.fillStyle = g;
  x.fillRect(0, 0, 4, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Refractory brick inside the furnace, glowing a dull red. */
function brickTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  x.fillStyle = '#3a1208';
  x.fillRect(0, 0, 128, 128);
  for (let row = 0; row < 8; row++) {
    for (let col = -1; col < 5; col++) {
      const off = row % 2 ? 16 : 0;
      x.fillStyle = `hsl(${12 + ((row * 7 + col * 3) % 6)}, 62%, ${17 + ((row + col) % 3) * 3}%)`;
      x.fillRect(col * 32 + off + 1, row * 16 + 1, 30, 14);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 2);
  return t;
}

/** Wet newsprint: columns of type, a headline bar, soaked patches, scorched where the glass sits. */
function newspaperTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d')!;
  x.fillStyle = '#b9b3a6';
  x.fillRect(0, 0, 256, 256);
  x.fillStyle = 'rgba(40,38,36,0.55)';
  x.fillRect(14, 12, 150, 10);
  for (let col = 0; col < 4; col++) {
    for (let line = 0; line < 30; line++) {
      const w = 44 - ((line * 7 + col * 5) % 9);
      x.fillStyle = 'rgba(55,52,48,0.35)';
      x.fillRect(12 + col * 60, 32 + line * 7, w, 2);
    }
  }
  // Soaked, uneven patches.
  for (let i = 0; i < 9; i++) {
    const cx = (i * 97) % 256, cy = (i * 61) % 256;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, 50);
    g.addColorStop(0, 'rgba(70,64,56,0.35)');
    g.addColorStop(1, 'rgba(70,64,56,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 256, 256);
  }
  // Scorch.
  const s = x.createRadialGradient(128, 128, 10, 128, 128, 120);
  s.addColorStop(0, 'rgba(30,18,10,0.75)');
  s.addColorStop(0.5, 'rgba(90,55,25,0.35)');
  s.addColorStop(1, 'rgba(90,55,25,0)');
  x.fillStyle = s;
  x.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(0.45, 0.45);
  return t;
}

/** Soft bands around the axis, brighter and darker, for the glow of turning glass. */
function mottleTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 32;
  const x = c.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, 256, 0);
  for (let i = 0; i <= 8; i++) g.addColorStop(i / 8, i % 2 ? '#c9c9c9' : '#ffffff');
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 32);
  for (let i = 0; i < 6; i++) {
    x.fillStyle = `rgba(150,150,150,${0.12 + (i % 3) * 0.05})`;
    x.fillRect((i * 47) % 256, 0, 10 + (i % 4) * 6, 32);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function haloTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

