import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GEOM, TILT } from '../config';
import type { HoldAction, Mods } from '../sim/actions';
import { clamp, geometry, type Piece } from '../sim/piece';
import { glassRGB, glowAmount, heatRGB, type RGB } from './heat';
import { profile, type Profile } from './profile';

export interface SceneView {
  piece: Piece | null;
  tool: HoldAction | null; // the tool actually working right now
  turnPhase: number; // 0–1, advances while the pipe turns
  turning: boolean;
  mods: Mods;
  time: number; // seconds, for animation
  tilt?: number; // −1 tip up … +1 tip down
}

export const STATION_LABEL: Record<HoldAction, string> = {
  gather: 'Furnace · gather',
  glory: 'Glory hole',
  marver: 'Marver',
  block: 'Block',
  blow: 'Blow',
  jacks: 'Jacks',
};

// World units are inches. The pipe runs along x, its tip at the origin, the free end toward +x.
const FLOOR_Y = -26;
const WALL_Z = -90;
const SEG = 40; // around the axis
const ROWS = 64; // must match the profile's sample count
const PIVOT_X = -24; // the gaffer's hands on the pipe: tipping swings the pipe about here

const color = ([r, g, b]: RGB) => new THREE.Color(`rgb(${r | 0},${g | 0},${b | 0})`);

/** The hot shop in 3D. Owns its camera and props; the piece arrives fresh every frame. */
export class Scene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.5, 600);
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
  private stations: Record<'gather' | 'glory' | 'marver' | 'block' | 'pad' | 'jacks', THREE.Group>;
  // The pipe, the piece and the station props swing together when the pipe is tipped.
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
    this.scene.environmentIntensity = 0.6;
    this.scene.background = new THREE.Color('#c3c8cb');
    this.scene.fog = new THREE.Fog('#c3c8cb', 160, 320);
    this.buildRoom();

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
    this.scene.add(this.rig);
    this.arm.add(this.pipe, this.pipeMark, this.punty);

    this.glass = new THREE.Mesh(latheGeometry(), new THREE.MeshPhysicalMaterial({
      color: '#ffffff', roughness: 0.04, metalness: 0, ior: 1.5, transmission: 1, thickness: 0.3,
      specularIntensity: 1, clearcoat: 1, clearcoatRoughness: 0.05,
    }));
    this.glass.castShadow = true;
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
    for (const g of Object.values(this.stations)) this.arm.add(g);

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
      this.camera.aspect = w / h;
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
    this.target.lerp(want, k);
    const narrow = this.camera.aspect < 1 ? 1 / this.camera.aspect : 1;
    const wantDist = onFloor ? 34 : clamp((len + 2 * maxR + 5) * 1.7 * Math.min(narrow, 1.9), 15, 70);
    this.dist += (wantDist - this.dist) * k;
    const cp = Math.cos(this.pitch);
    this.camera.position.set(
      this.target.x + this.dist * cp * Math.sin(this.yaw),
      this.target.y + this.dist * Math.sin(this.pitch),
      this.target.z + this.dist * cp * Math.cos(this.yaw),
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

    this.placeStations(v, p, pr);
    this.renderer.render(this.scene, this.camera);
  }

  private placeStations(v: SceneView, p: Piece | null, pr: Profile | null) {
    for (const g of Object.values(this.stations)) g.visible = false;
    this.stationLight.intensity = 0;
    const tool = v.tool;
    if (!tool || !p || !pr) return;
    const len = pr.length;
    const R = pr.maxR;
    const dropEnd = pr.drop[pr.drop.length - 1];
    switch (tool) {
      case 'gather': {
        const g = this.stations.gather;
        g.visible = true;
        g.position.set(len / 2, -dropEnd / 2, 0);
        g.scale.setScalar(Math.max(1, (R + 1.5) / 3.2, (len + 3) / 9));
        flicker(g, v.time);
        this.stationLight.position.set(len / 2, R + 2, 2);
        this.stationLight.intensity = 450;
        return;
      }
      case 'glory': {
        const g = this.stations.glory;
        g.visible = true;
        g.position.set(len * 0.5, -dropEnd / 2, 0);
        g.scale.setScalar(Math.max(1, (R + 1.4) / 3, (len + 2) / 7));
        flicker(g, v.time);
        this.stationLight.position.set(len * 0.55, 0, 2);
        this.stationLight.intensity = 380;
        return;
      }
      case 'marver': {
        const g = this.stations.marver;
        g.visible = true;
        g.position.set(len / 2, -(R + dropEnd * 0.5) - 0.02, 0);
        return;
      }
      case 'block': {
        // The wet pad takes the block's place once you own it.
        const g = v.mods.pad ? this.stations.pad : this.stations.block;
        const r = Math.max(geometry(p).R, 0.6) + 0.12;
        g.visible = true;
        g.position.set(Math.max(len - r, len * 0.5), -dropEnd * 0.8, 0);
        g.scale.setScalar(r);
        // Steam off the wet wood or paper, rising and fading.
        for (const puff of g.children.filter((c) => c.userData.steam) as THREE.Sprite[]) {
          const t = (v.time * 0.6 + puff.userData.steam) % 1;
          puff.position.set(0.5 * (puff.userData.steam - 0.5), 1.1 + t * 2.4, 0.3);
          puff.scale.setScalar(0.6 + t * 1.4);
          puff.material.opacity = 0.35 * (1 - t);
        }
        return;
      }
      case 'jacks': {
        const g = this.stations.jacks;
        g.visible = true;
        const [upper, lower] = g.children;
        if (!p.punty) {
          const i = clamp(Math.round((pr.neckX / Math.max(len, 1e-3)) * (ROWS - 1)), 0, ROWS - 1);
          const rN = pr.outer[i];
          g.position.set(pr.neckX, -pr.drop[i], 0);
          upper.position.set(-0.6, rN + 1.1, 0);
          upper.rotation.z = 0.5;
          lower.position.set(-0.6, -rN - 1.1, 0);
          lower.rotation.z = -0.5;
        } else {
          const lip = Math.max(pr.outer[ROWS - 1] - 0.6, 0.1);
          g.position.set(len, -pr.drop[ROWS - 1], 0);
          upper.position.set(0.4, lip, 0);
          upper.rotation.z = -0.45;
          lower.position.set(0.4, -lip, 0);
          lower.rotation.z = 0.45;
        }
        return;
      }
      default:
        return;
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

  /** The daylit shop: block wall, a big window, concrete floor, the furnace and glory hole, a shelf of jars. */
  private buildRoom() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight('#f4f1ea', '#a39b8e', 1.25));
    const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
    sun.position.set(25, 70, -40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera;
    sc.left = -40;
    sc.right = 40;
    sc.top = 40;
    sc.bottom = -40;
    sc.near = 10;
    sc.far = 200;
    s.add(sun);
    const fill = new THREE.DirectionalLight('#e8eef5', 0.8);
    fill.position.set(-20, 20, 60);
    s.add(fill);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 300), new THREE.MeshStandardMaterial({ color: '#8f8a82', roughness: 0.92 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = FLOOR_Y;
    floor.receiveShadow = true;
    s.add(floor);
    // The window's light on the floor.
    const patch = new THREE.Mesh(new THREE.PlaneGeometry(60, 50), new THREE.MeshBasicMaterial({ color: '#fffbf0', transparent: true, opacity: 0.18 }));
    patch.rotation.x = -Math.PI / 2;
    patch.position.set(10, FLOOR_Y + 0.05, -30);
    s.add(patch);

    const wall = new THREE.Mesh(new THREE.PlaneGeometry(400, 160), new THREE.MeshStandardMaterial({ map: blockTexture(), roughness: 0.95 }));
    wall.position.set(0, FLOOR_Y + 80, WALL_Z);
    wall.receiveShadow = true;
    s.add(wall);

    // Window: sky glass and a steel sash.
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(64, 36), new THREE.MeshBasicMaterial({ color: '#cfe4ef' }));
    sky.position.set(4, 34, WALL_Z + 0.1);
    s.add(sky);
    const sash = new THREE.MeshStandardMaterial({ color: '#4f585f', metalness: 0.6, roughness: 0.5 });
    const bar = (w: number, h: number, x: number, y: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 1), sash);
      m.position.set(x, y, WALL_Z + 0.6);
      s.add(m);
    };
    bar(66, 1.5, 4, 52);
    bar(66, 1.5, 4, 16);
    bar(66, 1, 4, 34);
    for (let i = 0; i <= 4; i++) bar(i === 0 || i === 4 ? 1.5 : 1, 36, 4 - 32 + i * 16, 34);

    // Furnace, back left: steel box on legs with a glowing door.
    const steel = new THREE.MeshStandardMaterial({ color: '#6f777e', metalness: 0.5, roughness: 0.55 });
    const furnace = new THREE.Mesh(new THREE.BoxGeometry(38, 44, 34), steel);
    furnace.position.set(-84, FLOOR_Y + 32, WALL_Z + 30);
    furnace.castShadow = true;
    furnace.receiveShadow = true;
    s.add(furnace);
    for (const dx of [-15, 15]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(3, 10, 3), steel);
      leg.position.set(-84 + dx, FLOOR_Y + 5, WALL_Z + 44);
      s.add(leg);
    }
    const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(20, 15, 0.8), new THREE.MeshStandardMaterial({ color: '#9c4a2a', roughness: 0.8 }));
    doorFrame.position.set(-80, FLOOR_Y + 34, WALL_Z + 47.4);
    s.add(doorFrame);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(16, 11), new THREE.MeshBasicMaterial({ color: '#ffb257' }));
    door.position.set(-80, FLOOR_Y + 34, WALL_Z + 47.9);
    s.add(door);
    const furnaceGlow = new THREE.PointLight('#ff9a3c', 900, 0, 2);
    furnaceGlow.position.set(-80, FLOOR_Y + 34, WALL_Z + 52);
    s.add(furnaceGlow);

    // Glory hole, back right: a drum on a stand with its round port.
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(13, 13, 22, 32), steel);
    drum.rotation.x = Math.PI / 2;
    drum.position.set(80, FLOOR_Y + 30, WALL_Z + 38);
    drum.castShadow = true;
    s.add(drum);
    const port = new THREE.Mesh(new THREE.CircleGeometry(6, 32), new THREE.MeshBasicMaterial({ color: '#ffa04a' }));
    port.position.set(80, FLOOR_Y + 30, WALL_Z + 49.2);
    s.add(port);
    const stand = new THREE.Mesh(new THREE.BoxGeometry(3, 17, 3), steel);
    stand.position.set(80, FLOOR_Y + 8.5, WALL_Z + 38);
    s.add(stand);

    // Shelf of color jars on the wall.
    const wood = new THREE.MeshStandardMaterial({ color: '#8a6a4a', roughness: 0.8 });
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(34, 1.2, 6), wood);
    shelf.position.set(46, 52, WALL_Z + 3);
    s.add(shelf);
    ['#2646c4', '#cd801e', '#28a06e', '#ece8dc', '#c81c4c', '#2646c4'].forEach((c, i) => {
      const h = 5 + (i % 3);
      const jar = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, h, 20), new THREE.MeshStandardMaterial({ color: c, roughness: 0.3 }));
      jar.position.set(46 - 14 + i * 5.6, 52.6 + h / 2, WALL_Z + 3);
      jar.castShadow = true;
      s.add(jar);
    });
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
function latheGeometry() {
  const g = new THREE.BufferGeometry();
  const rows = ROWS * 2;
  const cols = SEG + 1;
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(rows * cols * 3), 3));
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

function updateLathe(g: THREE.BufferGeometry, pr: Profile, uneven: number, roll: number, [dy, dz]: [number, number]) {
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
function styleGlass(m: THREE.MeshPhysicalMaterial, p: Piece, glow: number, heat: RGB) {
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

const STEEL = () => new THREE.MeshStandardMaterial({ color: '#7f878d', metalness: 0.8, roughness: 0.38 });

/** Flames and glow that breathe a little, so the furnace and glory hole feel lit. */
function flicker(g: THREE.Object3D, time: number) {
  g.traverse((o) => {
    const f = o.userData.flame as number | undefined;
    if (f === undefined) return;
    const n = 0.85 + 0.15 * Math.sin(time * 13 + f * 7) * Math.sin(time * 5.3 + f * 3);
    o.scale.set(1, n, 1);
  });
}

/** A flat strip showing a cut wall's thickness, from radius r0 to r1 at angle th around the x axis. */
function cutEdge(r0: number, r1: number, length: number, th: number, mat: THREE.Material) {
  const radial = new THREE.Vector3(0, Math.sin(th), Math.cos(th));
  const along = new THREE.Vector3(1, 0, 0);
  const normal = new THREE.Vector3().crossVectors(radial, along);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r1 - r0, length), mat);
  m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(radial, along, normal));
  m.position.copy(radial.multiplyScalar((r0 + r1) / 2));
  return m;
}

/**
 * Glory hole: a steel drum lying on its side, lined with ceramic fiber, a burner roaring in the back
 * and the round port facing you. A window is cut out of the near side so you can watch the piece.
 */
function buildGloryHole() {
  const g = new THREE.Group();
  const Ro = 3, Ri = 2.55, L = 7;
  const open = THREE.MathUtils.degToRad(58); // half-width of the viewing cut, centered on the camera side
  const start = open, sweep = Math.PI * 2 - 2 * open;
  const steel = STEEL();
  const fiber = new THREE.MeshStandardMaterial({ color: '#d9d0c2', roughness: 0.95, side: THREE.DoubleSide });

  const shell = new THREE.Mesh(new THREE.CylinderGeometry(Ro, Ro, L, 48, 1, true, start, sweep), steel);
  const lining = new THREE.Mesh(new THREE.CylinderGeometry(Ri, Ri, L, 48, 1, true, start, sweep),
    new THREE.MeshBasicMaterial({ map: gradientTexture('#a8441a', '#4a170a'), side: THREE.BackSide }));
  for (const m of [shell, lining]) m.rotation.z = Math.PI / 2;
  g.add(shell, lining, cutEdge(Ri, Ro, L, start, fiber), cutEdge(Ri, Ro, L, start + sweep, fiber));

  // Steel bands around the drum.
  for (const x of [-L / 2 + 0.4, 0, L / 2 - 0.4]) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(Ro + 0.06, Ro + 0.06, 0.25, 48, 1, true, start, sweep), steel);
    band.rotation.z = Math.PI / 2;
    band.position.x = x;
    g.add(band);
  }

  // Front plate with the port, facing the gaffer (−x), cut to match.
  const plate = new THREE.Mesh(new THREE.RingGeometry(1.9, Ro + 0.06, 48, 1, open, Math.PI * 2 - 2 * open),
    new THREE.MeshStandardMaterial({ color: '#5f676d', metalness: 0.7, roughness: 0.45, side: THREE.DoubleSide }));
  plate.rotation.y = -Math.PI / 2;
  plate.position.x = -L / 2;
  const portRim = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.12, 8, 48, Math.PI * 2 - 2 * open),
    new THREE.MeshBasicMaterial({ color: '#c8642a' }));
  portRim.rotation.set(0, -Math.PI / 2, open);
  portRim.position.x = -L / 2 - 0.02;
  g.add(plate, portRim);

  // Back wall, glowing, with the burner firing in through it.
  const back = new THREE.Mesh(new THREE.CircleGeometry(Ri, 48), new THREE.MeshBasicMaterial({ color: '#8c3412' }));
  back.rotation.y = -Math.PI / 2;
  back.position.x = L / 2 - 0.01;
  const cap = new THREE.Mesh(new THREE.CircleGeometry(Ro, 48), steel);
  cap.rotation.y = Math.PI / 2;
  cap.position.x = L / 2;
  g.add(back, cap);
  const flameMat = new THREE.MeshBasicMaterial({ color: '#ff8a32', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  [[0, 1.4, 0.55], [0.35, 1.0, 0.35], [-0.3, 1.1, 0.4]].forEach(([z, len, r], i) => {
    const flame = new THREE.Mesh(new THREE.ConeGeometry(r, len, 16, 1, true), flameMat);
    flame.geometry.translate(0, len / 2, 0); // grow from the base
    const holder = new THREE.Group();
    holder.add(flame);
    holder.rotation.z = Math.PI / 2; // point toward −x, into the chamber
    holder.position.set(L / 2 - 0.05, -1.4 + i * 0.15, z);
    flame.userData.flame = i;
    g.add(holder);
  });
  const burner = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 2.2, 20), steel);
  burner.rotation.z = Math.PI / 2;
  burner.position.set(L / 2 + 1.1, -1.4, 0);
  const gasLine = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 4, 12), new THREE.MeshStandardMaterial({ color: '#c9a14a', metalness: 0.7, roughness: 0.35 }));
  gasLine.position.set(L / 2 + 2.1, -3.3, 0);
  g.add(burner, gasLine);

  // A stand down to the floor.
  for (const x of [-L / 2 + 1, L / 2 - 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.35, 20, 0.35), new THREE.MeshStandardMaterial({ color: '#3a3f44', metalness: 0.6, roughness: 0.6 }));
    leg.position.set(x, -Ro - 10, -1.2);
    g.add(leg);
  }
  return g;
}

/**
 * Furnace: a steel-clad box of refractory brick with its gathering port facing the gaffer and a
 * pot of molten glass inside. The near wall and the front of the crown are cut away.
 */
function buildFurnace() {
  const g = new THREE.Group();
  const X0 = -6.5, X1 = 6.5, Y0 = -6, Y1 = 5, Z0 = -5.5, Z1 = 5.5, T = 0.9;
  const steel = new THREE.MeshStandardMaterial({ color: '#4f565c', metalness: 0.6, roughness: 0.5, side: THREE.DoubleSide });
  const inside = new THREE.MeshBasicMaterial({ map: brickTexture(), side: THREE.DoubleSide });
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z);
    g.add(b);
    return b;
  };
  const W = X1 - X0, H = Y1 - Y0;
  // Back wall, floor, far end, and the back half of the crown: steel outside, glowing brick inside.
  box(W, H, T, 0, (Y0 + Y1) / 2, Z0, steel);
  box(W - 2 * T, H - 2 * T, 0.05, 0, (Y0 + Y1) / 2, Z0 + T / 2 + 0.03, inside);
  box(W, T, Z1 - Z0, 0, Y0, 0, steel);
  box(T, H, Z1 - Z0, X1, (Y0 + Y1) / 2, 0, steel);
  box(0.05, H - 2 * T, Z1 - Z0 - T, X1 - T / 2 - 0.03, (Y0 + Y1) / 2, 0, inside);
  box(W, T, (Z1 - Z0) / 2, 0, Y1, Z0 + (Z1 - Z0) / 4, steel);
  box(W - 2 * T, 0.05, (Z1 - Z0) / 2 - T, 0, Y1 - T / 2 - 0.03, Z0 + (Z1 - Z0) / 4 + T / 2, inside);

  // Front face with the gathering port the pipe comes through.
  const face = new THREE.Shape();
  face.moveTo(Z0, Y0);
  face.lineTo(Z1, Y0);
  face.lineTo(Z1, Y1);
  face.lineTo(Z0, Y1);
  face.lineTo(Z0, Y0);
  const port = new THREE.Path();
  port.absarc(0, 0.3, 2.6, 0, Math.PI * 2, false);
  face.holes.push(port);
  const front = new THREE.Mesh(new THREE.ExtrudeGeometry(face, { depth: T, bevelEnabled: false }), steel);
  front.rotation.y = -Math.PI / 2; // shape x → world z, extrude → world −x
  front.position.x = X0 + T;
  g.add(front);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.18, 10, 48), new THREE.MeshStandardMaterial({ color: '#8a3a1e', roughness: 0.85 }));
  lip.rotation.y = Math.PI / 2;
  lip.position.set(X0 - 0.05, 0.3, 0);
  g.add(lip);

  // The pot of glass, its surface glowing a deep orange so the gather reads against it.
  // The surface sits just under the pipe's axis, so the gather dips into it.
  const surface = -0.7, potH = surface - (Y0 + T / 2) + 0.3;
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3, potH, 40, 1, true),
    new THREE.MeshStandardMaterial({ color: '#4e3527', roughness: 0.9, side: THREE.DoubleSide }));
  pot.position.set(1.4, Y0 + T / 2 + potH / 2, -1.2);
  const melt = new THREE.Mesh(new THREE.CircleGeometry(3.15, 40), new THREE.MeshBasicMaterial({ color: '#b84c16' }));
  melt.rotation.x = -Math.PI / 2;
  melt.position.set(1.4, surface, -1.2);
  melt.userData.flame = 9;
  g.add(pot, melt);
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

/** Whitewashed concrete block coursing for the back wall. */
function blockTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const x = c.getContext('2d')!;
  x.fillStyle = '#7b8489'; // cool gray block: hot glass is warm and bright, so it stands off this
  x.fillRect(0, 0, 512, 256);
  x.strokeStyle = 'rgba(60,66,72,0.28)';
  x.lineWidth = 2;
  for (let row = 0; row < 8; row++) {
    const y = row * 32;
    x.beginPath();
    x.moveTo(0, y);
    x.lineTo(512, y);
    x.stroke();
    for (let bx = (row % 2) * 32; bx < 512; bx += 64) {
      x.beginPath();
      x.moveTo(bx, y);
      x.lineTo(bx, y + 32);
      x.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(5, 2.5);
  return t;
}
