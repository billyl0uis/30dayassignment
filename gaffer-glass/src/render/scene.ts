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
  pad: 'Newspaper pad',
  blow: 'Blow',
  jacks: 'Jacks',
};

// World units are inches. The pipe runs along x, its tip at the origin, the free end toward +x.
const SEG = 40; // around the axis
const ROWS = 64; // must match the profile's sample count
const PIVOT_X = -13; // where the pipe rests on the bench's near arm: tipping rocks the pipe on it

// Where the furnace, glory hole and marver stand in the shop. Using one carries the pipe there.
// Each fire faces the room (+z); the pipe goes in pointing away from you (−z).
const FURNACE_AT = new THREE.Vector3(58, 0, -60); // the port's center
const GLORY_AT = new THREE.Vector3(-36, 0, -44);
const INTO_PORT = Math.PI / 2; // carry yaw that turns the pipe from along +x to pointing −z
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
  private carryYaw = 0;
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
    this.stations.gather.position.copy(FURNACE_AT);
    this.stations.glory.position.copy(GLORY_AT);
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
    want.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.carry.rotation.y).add(this.carry.position);
    this.target.lerp(want, k);
    const narrow = this.camera.aspect < 1 ? 1 / this.camera.aspect : 1;
    const wantDist = onFloor ? 26 : clamp((len + 2 * maxR + 5) * 1.2 * Math.min(narrow, 1.9), 11, 52);
    this.dist += (wantDist - this.dist) * k;
    // At the furnace or the glory hole, look down the pipe into the port, as the gaffer does.
    const atFire = Math.max(this.presence.gather ?? 0, this.presence.glory ?? 0);
    const f = atFire * atFire * (3 - 2 * atFire);
    // At a fire, stand just behind and beside the gaffer, looking down the pipe into the port.
    const yaw = this.yaw + (0.18 - this.yaw) * f;
    const pitch = this.pitch + (0.24 - this.pitch) * f;
    const dist = this.dist + (clamp(46 + maxR * 3, 46, 62) - this.dist) * f;
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
      : tool;
    this.stationLight.intensity = 0;
    this.carryTo.set(0, 0, 0);
    this.carryYaw = 0;
    if (tool && p && pr) this.placeActive(v, p, pr, tool);
    // Walk the pipe over (or back to the bench), easing in and out.
    const walk = Math.min(1, dt * 2.6);
    this.carry.position.lerp(this.carryTo, walk);
    this.carry.rotation.y += (this.carryYaw - this.carry.rotation.y) * walk;
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
        // Straight into the furnace's port, the gather down in the melt.
        this.carryTo.set(FURNACE_AT.x, FURNACE_AT.y + dropEnd / 2, FURNACE_AT.z - 8);
        this.carryYaw = INTO_PORT;
        this.stationLight.position.set(-3, 0.5, 0);
        this.stationLight.intensity = 260;
        break;
      }
      case 'glory': {
        // Straight into the glory hole's port.
        this.carryTo.set(GLORY_AT.x, GLORY_AT.y + dropEnd / 2, GLORY_AT.z - 5);
        this.carryYaw = INTO_PORT;
        this.stationLight.position.set(-3, 0, 0);
        this.stationLight.intensity = 220;
        break;
      }
      case 'marver': {
        // Down onto the steel, the piece centered over the table.
        this.carryTo.set(MARVER_AT.x - len / 2, MARVER_AT.y + R + dropEnd * 0.5, MARVER_AT.z);
        break;
      }
      case 'block':
      case 'pad': {
        const g = tool === 'pad' ? this.stations.pad : this.stations.block;
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
    if (o instanceof THREE.PointLight) o.intensity = (o.userData.base as number) * (0.9 + 0.1 * n);
    else o.scale.set(1, n, 1);
  });
}


// Both fires are modeled whole and at real size, in inches, as they stand in a shop: facing the
// room (+z), the port at the local origin, the body running back (−z). The pipe is carried
// straight in, pointing away from you, so you look over your own shoulder into the fire.

/** A glow that's brighter at the back of a chamber (v = 0) and darker toward the port. */
function chamberMaterial(hot: string, cool: string) {
  return new THREE.MeshBasicMaterial({ map: gradientTexture(hot, cool), side: THREE.BackSide });
}

const PAINT = (color: string) => new THREE.MeshStandardMaterial({ color, metalness: 0.25, roughness: 0.62 });
const BARE = () => new THREE.MeshStandardMaterial({ color: '#8a9298', metalness: 0.75, roughness: 0.38 });

function solid(geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  return m;
}

/** A warm light thrown into the room from a port; it breathes with the fire. */
function fireLight(intensity: number, seed: number, z: number) {
  const l = new THREE.PointLight('#ff9c52', intensity, 0, 2);
  l.position.set(0, 0, z);
  l.userData.base = intensity;
  l.userData.flame = seed;
  return l;
}

/**
 * Glory hole: a two-foot painted steel drum on its side, port toward the room. A ceramic-fiber
 * collar round the port, two sliding half-moon doors on the face, the burner on the back, all on a
 * heavy welded stand.
 */
function buildGloryHole() {
  const g = new THREE.Group();
  const Ro = 12, Ri = 9.5, L = 26, port = 5;
  const paint = PAINT('#3f566a');
  const dark = PAINT('#262b30');
  // The drum, its axis along z.
  const drum = solid(new THREE.CylinderGeometry(Ro, Ro, L, 48, 1, true), paint, 0, 0, -L / 2);
  drum.rotation.x = Math.PI / 2;
  g.add(drum);
  for (const z of [-1.5, -L / 2, -L + 1.5]) {
    const band = solid(new THREE.TorusGeometry(Ro + 0.1, 0.35, 8, 48), dark, 0, 0, z);
    g.add(band);
  }
  // The chamber inside, seen through the port.
  const chamber = new THREE.Mesh(new THREE.CylinderGeometry(Ri, Ri, L - 2, 40, 1, true), chamberMaterial('#c8601e', '#4e1a0a'));
  chamber.rotation.x = -Math.PI / 2;
  chamber.position.z = -L / 2;
  const back = new THREE.Mesh(new THREE.CircleGeometry(Ri, 40), new THREE.MeshBasicMaterial({ color: '#b8521a' }));
  back.position.z = -L + 1.1;
  g.add(chamber, back);
  // The face: a steel plate with the port, a fiber collar, two sliding half-moon doors.
  const face = solid(new THREE.RingGeometry(port + 1.2, Ro + 0.4, 48), dark, 0, 0, 0.01);
  const collar = solid(new THREE.RingGeometry(port, port + 1.2, 48), new THREE.MeshStandardMaterial({ color: '#d8cfbf', roughness: 0.95 }), 0, 0, 0.05);
  const throat = new THREE.Mesh(new THREE.CylinderGeometry(port, port, Ro - Ri + 0.5, 40, 1, true), chamberMaterial('#a8461a', '#d8701e'));
  throat.rotation.x = Math.PI / 2;
  throat.position.z = -(Ro - Ri) / 2;
  g.add(face, collar, throat);
  // Two sliding half-moon doors, each with a half-circle cut so together they ring the port.
  const r = port + 0.4;
  for (const side of [-1, 1]) {
    const door = new THREE.Shape();
    door.moveTo(0, 9);
    door.lineTo(side * 14, 9);
    door.lineTo(side * 14, -9);
    door.lineTo(0, -9);
    door.lineTo(0, -r);
    if (side > 0) door.absarc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
    else door.absarc(0, 0, r, -Math.PI / 2, (-3 * Math.PI) / 2, true);
    door.lineTo(0, 9);
    g.add(solid(new THREE.ExtrudeGeometry(door, { depth: 0.8, bevelEnabled: false, curveSegments: 24 }), paint, 0, 0, 0.3));
  }
  // The door track along the top and its handle knobs.
  g.add(solid(new THREE.BoxGeometry(32, 1, 1.4), dark, 0, 10, 0.9));
  for (const x of [-12, 12]) g.add(solid(new THREE.SphereGeometry(0.8, 12, 8), BARE(), x, 0, 1.6));
  // Burner on the back, with its gas line down to the floor.
  const burner = solid(new THREE.CylinderGeometry(2.2, 2.6, 7, 20), BARE(), 0, 3, -L - 3.5);
  burner.rotation.x = Math.PI / 2;
  g.add(burner, solid(new THREE.CylinderGeometry(0.6, 0.6, 30, 10), PAINT('#c9a14a'), 4, -12, -L - 5));
  // A heavy stand: two A-frames and a cradle.
  for (const z of [-4, -L + 4]) {
    g.add(solid(new THREE.BoxGeometry(22, 1.2, 1.2), dark, 0, -Ro + 0.6, z));
    for (const x of [-9, 9]) g.add(solid(new THREE.BoxGeometry(1.4, 16, 1.4), dark, x, -Ro - 7.5, z));
  }
  g.add(fireLight(700, 2, 6));
  return g;
}

/**
 * Furnace: a three-foot studio furnace on a low steel base. Charcoal-painted cladding with angle iron
 * at the corners, a cast refractory face sooted round an arched port, a lift-up door riding above
 * the port on guides with its counterweight chain, a burner and blower on the side, and a stainless
 * hood over the face. Inside, the glowing chamber and the pot the gather dips into.
 */
function buildFurnace() {
  const g = new THREE.Group();
  const W = 36, D = 32, top = 16, bottom = -26; // floor to just above head-height of the port
  const H = top - bottom;
  const clad = PAINT('#33393e');
  const angle = PAINT('#1f2327');
  // Body, open at the front so you see the chamber through the port.
  const none = new THREE.MeshBasicMaterial({ visible: false });
  g.add(solid(new THREE.BoxGeometry(W, H, D), [clad, clad, clad, clad, none, clad], 0, (top + bottom) / 2, -D / 2 - 1.5));
  const e = 1.2;
  for (const y of [bottom + 4, top]) for (const x of [-W / 2, W / 2]) g.add(solid(new THREE.BoxGeometry(e, e, D + e), angle, x, y, -D / 2 - 1.5));
  for (const x of [-W / 2, W / 2]) for (const z of [-1.5, -D - 1.5]) g.add(solid(new THREE.BoxGeometry(e, H, e), angle, x, (top + bottom) / 2, z));
  g.add(solid(new THREE.BoxGeometry(W + 2, 4, D + 2), angle, 0, bottom + 2, -D / 2 - 1.5)); // the base
  // Cast face with an arched port: 12" wide, 10" tall, its sill just under the pipe.
  const pw = 6, sill = -4.5, spring = 1.5;
  const archPath = (p: THREE.Path | THREE.Shape) => {
    p.moveTo(-pw, sill);
    p.lineTo(pw, sill);
    p.lineTo(pw, spring);
    p.absarc(0, spring, pw, 0, Math.PI, false);
    p.lineTo(-pw, sill);
  };
  const face = new THREE.Shape();
  face.moveTo(-W / 2, bottom + 4);
  face.lineTo(W / 2, bottom + 4);
  face.lineTo(W / 2, top);
  face.lineTo(-W / 2, top);
  face.lineTo(-W / 2, bottom + 4);
  const hole = new THREE.Path();
  archPath(hole);
  face.holes.push(hole);
  const front = solid(new THREE.ExtrudeGeometry(face, { depth: 3, bevelEnabled: false, curveSegments: 32 }),
    new THREE.MeshStandardMaterial({ map: castFaceTexture(W, top, bottom + 4), roughness: 0.95 }), 0, 0, -3);
  g.add(front);
  // The arch's reveal: the cast face's own cut edge, lit by the fire. (No caps: they'd close the port.)
  const reveal = new THREE.Mesh(new THREE.ExtrudeGeometry((() => {
    const sh = new THREE.Shape();
    archPath(sh);
    return sh;
  })(), { depth: 3, bevelEnabled: false, curveSegments: 32 }), [new THREE.MeshBasicMaterial({ visible: false }), new THREE.MeshBasicMaterial({ color: '#a84618', side: THREE.BackSide })]);
  reveal.position.z = -3;
  g.add(reveal);
  // Lift-up door riding on guides above the port, with its handle and counterweight chain.
  const doorY = spring + pw + 5.5;
  g.add(solid(new THREE.BoxGeometry(16, 9, 2), PAINT('#3c4248'), 0, doorY, 1));
  g.add(solid(new THREE.BoxGeometry(14.5, 7.5, 0.3), new THREE.MeshStandardMaterial({ color: '#cfc3ad', roughness: 0.95 }), 0, doorY, 2.1));
  for (const x of [-9, 9]) g.add(solid(new THREE.BoxGeometry(1, 22, 1), angle, x, doorY + 3, 0.6));
  const handle = solid(new THREE.TorusGeometry(1.6, 0.3, 8, 16, Math.PI), BARE(), 0, doorY - 4.6, 2.4);
  handle.rotation.z = Math.PI;
  g.add(handle);
  g.add(solid(new THREE.CylinderGeometry(0.15, 0.15, 14, 6), BARE(), 9.6, top + 3, 0.6));
  // Burner and blower on the right side.
  const burner = solid(new THREE.CylinderGeometry(2, 2.4, 6, 18), BARE(), W / 2 + 3, -2, -D / 2);
  burner.rotation.z = Math.PI / 2;
  g.add(burner, solid(new THREE.BoxGeometry(7, 7, 8), PAINT('#2f5a86'), W / 2 + 8, -3, -D / 2 - 1));
  g.add(solid(new THREE.CylinderGeometry(0.5, 0.5, 22, 10), PAINT('#c9a14a'), W / 2 + 5, -15, -D / 2 + 3));
  // Stainless hood over the face, its duct to the ceiling.
  const hood = solid(new THREE.CylinderGeometry(6, 24, 10, 4, 1, true), new THREE.MeshStandardMaterial({ color: '#b9c0c4', metalness: 0.85, roughness: 0.3, side: THREE.DoubleSide }), 0, top + 13, -4);
  hood.rotation.y = Math.PI / 4;
  g.add(hood, solid(new THREE.CylinderGeometry(5, 5, 110, 18), new THREE.MeshStandardMaterial({ color: '#a7aeb3', metalness: 0.8, roughness: 0.35 }), 0, top + 73, -4));
  // The chamber: dark glowing walls, the pot, and the melt just under the port's sill.
  const chamber = new THREE.Mesh(new THREE.BoxGeometry(W - 6, H - 10, D - 4), chamberMaterial('#b8501c', '#4a160a'));
  chamber.position.set(0, (top + bottom) / 2 + 2, -D / 2 - 2);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(10, 9, 10, 40, 1, true), new THREE.MeshBasicMaterial({ color: '#6a2a12', side: THREE.DoubleSide }));
  pot.position.set(0, -7.5, -14);
  const melt = new THREE.Mesh(new THREE.CircleGeometry(9.8, 40), new THREE.MeshBasicMaterial({ color: '#d8722a' }));
  melt.rotation.x = -Math.PI / 2;
  melt.position.set(0, -2.6, -14);
  melt.userData.flame = 5;
  g.add(chamber, pot, melt, fireLight(900, 1, 8));
  return g;
}

/** Cast refractory: pale and grainy, sooted dark round the port where the heat comes out. */
function castFaceTexture(W: number, top: number, bottom: number) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d')!;
  x.fillStyle = '#b8a88e';
  x.fillRect(0, 0, 256, 256);
  // Fine, irregular grain: a cheap hash so it doesn't line up into rows.
  for (let i = 0; i < 5000; i++) {
    const h = Math.sin(i * 12.9898) * 43758.5453;
    const fx = (h - Math.floor(h)) * 256;
    const h2 = Math.sin(i * 78.233) * 12345.678;
    const fy = (h2 - Math.floor(h2)) * 256;
    const v = 70 + (i % 90);
    x.fillStyle = `rgba(${v},${v - 10},${v - 25},0.05)`;
    x.fillRect(fx, fy, 1.5, 1.5);
  }
  // Soot rising off the port: the port sits at shape (0, 0), i.e. here.
  const px = 128, py = 256 * (top / (top - bottom));
  const s = x.createRadialGradient(px, py - 30, 8, px, py - 20, 110);
  s.addColorStop(0, 'rgba(20,14,10,0.9)');
  s.addColorStop(0.4, 'rgba(50,34,22,0.55)');
  s.addColorStop(1, 'rgba(50,34,22,0)');
  x.fillStyle = s;
  x.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  // The face's UVs are its shape coordinates in inches: map them onto the texture once.
  t.repeat.set(1 / W, 1 / (top - bottom));
  t.offset.set(0.5, -bottom / (top - bottom));
  return t;
}

/**
 * Wet newspaper pad: a thick square wad of folded newsprint, soaked dark, held flat in the palm and
 * pressed up under the piece so it cups it. Scorched in the middle where the glass sits. Steaming.
 * Modeled around the piece's axis at unit radius; scaled to the piece.
 */
function buildPad() {
  const g = new THREE.Group();
  // A thick square sheet, bent up at its edges so it hugs the round glass underneath.
  const geo = new THREE.BoxGeometry(3.2, 0.5, 2.8, 24, 2, 20);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, pos.getY(i) + 0.32 * z * z + 0.08 * x * x); // cup across the pipe, a little along it
  }
  geo.computeVertexNormals();
  const pad = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: newspaperTexture(), roughness: 1, color: '#9a9488' }));
  pad.position.y = -1.3; // just under the glass
  pad.castShadow = true;
  g.add(pad);
  // The folded edges show as a few lighter layers along the near side.
  for (let i = 0; i < 3; i++) {
    const fold = new THREE.Mesh(new THREE.BoxGeometry(3.1 - i * 0.08, 0.05, 0.06), new THREE.MeshStandardMaterial({ color: '#7d776c', roughness: 1 }));
    fold.position.set(0, -1.3 - 0.18 + i * 0.16 + 0.32 * 1.4 * 1.4, 1.42);
    g.add(fold);
  }
  addSteam(g);
  return g;
}

/**
 * Wooden block: a turned cherrywood head with a round cup carved into it, on a handle. Soaked dark
 * from the bucket, steaming against the hot glass. Modeled at unit cup radius; scaled to the piece.
 */
function buildBlock() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: '#5e3a22', roughness: 0.85 });
  const charred = new THREE.MeshStandardMaterial({ color: '#2a1810', roughness: 0.95, side: THREE.BackSide });
  // The head: a short thick cylinder whose top is hollowed into a cup the glass sits in.
  const head = new THREE.Mesh(new THREE.LatheGeometry([
    [0.0, -1.55], [1.55, -1.55], [1.62, -1.4], [1.62, -0.05], [1.5, 0.05], [1.12, 0.05],
  ].map(([r, y]) => new THREE.Vector2(r, y)), 32), wood);
  const cup = new THREE.Mesh(new THREE.SphereGeometry(1.12, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), charred);
  cup.position.y = 0.05;
  head.castShadow = true;
  g.add(head, cup);
  // The handle, turned with a collar where it meets the head.
  const handle = new THREE.Mesh(new THREE.LatheGeometry([
    [0.0, 0], [0.42, 0], [0.42, 0.4], [0.26, 0.7], [0.24, 5.6], [0.3, 5.9], [0.0, 6.0],
  ].map(([r, y]) => new THREE.Vector2(r, y)), 18), wood);
  handle.rotation.z = Math.PI; // hangs down from the head
  handle.position.y = -1.5;
  handle.rotation.x = 0.35;
  g.add(handle);
  // The cup sits under the glass: the whole block below the piece's axis.
  for (const c of [head, cup, handle]) c.position.y -= 0.55;
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

  const block = buildBlock();

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
  t.repeat.set(1, 1);
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

