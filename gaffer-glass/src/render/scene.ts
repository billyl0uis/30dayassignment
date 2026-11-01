import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GEOM } from '../config';
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
  private stations: Record<'gather' | 'glory' | 'marver' | 'block' | 'jacks', THREE.Group>;
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
    this.scene.add(this.pipe, this.pipeMark, this.punty);

    this.glass = new THREE.Mesh(latheGeometry(), new THREE.MeshPhysicalMaterial({
      color: '#ffffff', roughness: 0.04, metalness: 0, ior: 1.5, transmission: 1, thickness: 0.3,
      specularIntensity: 1, clearcoat: 1, clearcoatRoughness: 0.05,
    }));
    this.glass.castShadow = true;
    this.scene.add(this.glass);

    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: haloTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0,
    }));
    this.scene.add(this.halo, this.heatLight, this.stationLight);

    this.puddle = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.MeshStandardMaterial({ roughness: 0.15 }));
    this.scene.add(this.puddle);

    this.cracks = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#ffffff' }));
    this.scene.add(this.cracks);

    this.stations = buildStations();
    for (const g of Object.values(this.stations)) this.scene.add(g);

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
      updateLathe(this.glass.geometry, pr, Math.min(p.uneven, 1), roll);
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
        g.position.set(len / 2 + 1, -dropEnd / 2, 0);
        g.scale.setScalar(Math.max(1, (len + 2 * R) / 7));
        this.stationLight.position.set(len / 2, R + 2, 2);
        this.stationLight.intensity = 450;
        return;
      }
      case 'glory': {
        const g = this.stations.glory;
        g.visible = true;
        g.position.set(len * 0.55, -dropEnd / 2, 0);
        g.scale.set(Math.max(1, len / 4), Math.max(1, (R + 1.6) / 3), Math.max(1, (R + 1.6) / 3));
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
        const g = this.stations.block;
        const r = Math.max(geometry(p).R, 0.6) + 0.25;
        g.visible = true;
        g.position.set(Math.max(len - r, len * 0.5), -dropEnd * 0.8, 0);
        g.scale.setScalar(r);
        const cup = g.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
        cup.material.color.set(v.mods.pad ? '#cfc6b4' : '#6b4325');
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

function updateLathe(g: THREE.BufferGeometry, pr: Profile, uneven: number, roll: number) {
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const cols = SEG + 1;
  const wobble = uneven * 0.12;
  let v = 0;
  const put = (i: number, radius: number) => {
    for (let c = 0; c < cols; c++) {
      const th = (c / SEG) * Math.PI * 2;
      // An uneven piece is out of round; the lump rolls with the pipe.
      const r = radius * (1 + wobble * Math.cos(th - roll));
      pos.setXYZ(v++, pr.xs[i], -pr.drop[i] + r * Math.cos(th), r * Math.sin(th));
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

function buildStations() {
  const fire = new THREE.MeshBasicMaterial({ color: '#5a1a0c', side: THREE.DoubleSide }); // deep and dark, so the glowing glass reads against it
  const brick = new THREE.MeshStandardMaterial({ color: '#4a2116', roughness: 0.9, side: THREE.DoubleSide });
  const steel = new THREE.MeshStandardMaterial({ color: '#7f878d', metalness: 0.8, roughness: 0.35, side: THREE.DoubleSide });

  // Furnace: a cutaway of the glowing chamber with the pot of glass below the pipe.
  const gather = new THREE.Group();
  const back = new THREE.Mesh(new THREE.PlaneGeometry(14, 10), fire);
  back.position.set(0, 0.5, -3.5);
  const pool = new THREE.Mesh(new THREE.BoxGeometry(14, 2.2, 7), new THREE.MeshBasicMaterial({ color: '#b5501c' }));
  pool.position.set(0, -3.4, 0);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 7.5, 14, 32, 1, true, Math.PI / 2, Math.PI), brick); // top, back and bottom
  crown.rotation.z = Math.PI / 2;
  crown.position.y = -0.5;
  gather.add(back, pool, crown);

  // Glory hole: a drum around the piece, cut away toward you, glowing inside.
  const glory = new THREE.Group();
  const arc: [number, number] = [Math.PI * 0.25, Math.PI * 1.5]; // open toward the camera (+z)
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 4, 40, 1, true, ...arc), steel);
  shell.rotation.z = Math.PI / 2;
  const lining = new THREE.Mesh(new THREE.CylinderGeometry(2.85, 2.85, 4, 40, 1, true, ...arc),
    new THREE.MeshBasicMaterial({ color: '#6b2210', side: THREE.BackSide }));
  lining.rotation.z = Math.PI / 2;
  glory.add(shell, lining);

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

  // Block: a wet wooden cup cradling the end, with its handle.
  const block = new THREE.Group();
  const cup = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#6b4325', roughness: 0.8, side: THREE.DoubleSide }));
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4, 12),
    new THREE.MeshStandardMaterial({ color: '#4d2f19', roughness: 0.8 }));
  handle.position.set(0.8, -2.6, 0);
  handle.rotation.z = 0.5;
  block.add(cup, handle);

  // Jacks: two steel blades.
  const jacks = new THREE.Group();
  const blade = () => new THREE.Mesh(new THREE.BoxGeometry(3, 0.12, 0.5), steel);
  jacks.add(blade(), blade());

  return { gather, glory, marver, block, jacks };
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
