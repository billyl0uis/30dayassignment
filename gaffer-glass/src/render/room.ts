import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// The shop around the bench, in inches. The piece works at the origin; the floor is below it and
// the back wall well behind it. Everything here is set dressing: it never moves the sim.
export const FLOOR_Y = -26;
export const WALL_Z = -90;

export interface Shop {
  /** Flicker the fires and drift the dust. */
  update(time: number, dt: number): void;
}

const std = (color: string, rough = 0.8, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
const STEEL = std('#7d858b', 0.45, 0.75);
const DARK_STEEL = std('#3c4248', 0.6, 0.6);
const WOOD = std('#7a5032', 0.85);

function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, shadow = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

function cyl(r: number, h: number, mat: THREE.Material, x: number, y: number, z: number, seg = 24) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Things that glow and should breathe a little: each with its base intensity. */
interface Flame {
  light?: THREE.PointLight;
  base: number;
  mat?: THREE.MeshBasicMaterial;
  color?: THREE.Color;
  seed: number;
}

export function buildShop(scene: THREE.Scene): Shop {
  const flames: Flame[] = [];
  const add = (...o: THREE.Object3D[]) => scene.add(...o);

  // ── Light: daylight from the window, a soft fill, and the fires ──
  add(new THREE.HemisphereLight('#eef0f2', '#8f877b', 0.75));
  const sun = new THREE.DirectionalLight('#fff2dc', 2.9);
  sun.position.set(25, 70, -40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 70, bottom: -70, near: 10, far: 260 });
  add(sun);
  const fill = new THREE.DirectionalLight('#e6edf5', 0.45);
  fill.position.set(-20, 20, 60);
  add(fill);

  // ── Floor: sealed concrete, scorched where hot glass has landed ──
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(260, 220), new THREE.MeshStandardMaterial({ map: concreteTexture(), roughness: 0.88 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, FLOOR_Y, -20);
  floor.receiveShadow = true;
  add(floor);
  const patch = new THREE.Mesh(new THREE.PlaneGeometry(60, 50), new THREE.MeshBasicMaterial({ color: '#fff8ea', transparent: true, opacity: 0.12, depthWrite: false }));
  patch.rotation.x = -Math.PI / 2;
  patch.position.set(12, FLOOR_Y + 0.05, -40);
  add(patch);

  // ── Walls: painted block, a darker band low down so hot glass reads against it ──
  const wallMat = new THREE.MeshStandardMaterial({ map: blockTexture('#7b8489', 5, 2), roughness: 0.95 });
  const lowMat = new THREE.MeshStandardMaterial({ map: blockTexture('#4f585e', 5, 0.6), roughness: 0.95 });
  const wall = (w: number, x: number, z: number, ry: number) => {
    const up = new THREE.Mesh(new THREE.PlaneGeometry(w, 124), wallMat);
    up.position.set(x, FLOOR_Y + 36 + 62, z);
    up.rotation.y = ry;
    up.receiveShadow = true;
    const low = new THREE.Mesh(new THREE.PlaneGeometry(w, 36), lowMat);
    low.position.set(x, FLOOR_Y + 18, z);
    low.rotation.y = ry;
    low.receiveShadow = true;
    const rail = box(ry ? 0.6 : w, 1.2, ry ? w : 0.6, std('#2f353a', 0.6), x, FLOOR_Y + 36, z);
    add(up, low, rail);
  };
  wall(260, 0, WALL_Z, 0);
  wall(220, -120, WALL_Z + 110, Math.PI / 2);
  wall(220, 120, WALL_Z + 110, -Math.PI / 2);

  // Window: sky, a steel sash, and a deep sill.
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(64, 36), new THREE.MeshBasicMaterial({ color: '#cfe4ef' }));
  sky.position.set(4, 34, WALL_Z + 0.1);
  add(sky);
  const sash = std('#4a5359', 0.5, 0.6);
  const bar = (w: number, h: number, x: number, y: number) => add(box(w, h, 1, sash, x, y, WALL_Z + 0.6, false));
  bar(66, 1.5, 4, 52);
  bar(66, 1, 4, 34);
  for (let i = 0; i <= 4; i++) bar(i === 0 || i === 4 ? 1.5 : 1, 36, 4 - 32 + i * 16, 34);
  add(box(70, 1.6, 5, std('#5e676d', 0.7), 4, 15.2, WALL_Z + 2.5));

  // ── Annealer, against the back wall: a white box on legs, its controller reading 960°F ──
  const ax = 58, az = WALL_Z + 11;
  add(box(24, 22, 18, std('#c9c7c0', 0.6, 0.1), ax, FLOOR_Y + 10 + 11, az));
  for (const dx of [-10, 10]) add(box(2, 10, 2, DARK_STEEL, ax + dx, FLOOR_Y + 5, az + 7));
  add(box(22.5, 0.5, 0.4, std('#8f8d86', 0.6), ax, FLOOR_Y + 26, az + 9.1, false));
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(9, 5), new THREE.MeshBasicMaterial({ map: controllerTexture() }));
  panel.position.set(ax + 6, FLOOR_Y + 28.5, az + 9.05);
  add(panel, box(2, 1.2, 1, DARK_STEEL, ax - 6, FLOOR_Y + 21, az + 9.4));

  // ── The gaffer's bench, under the work: two steel arms running away from you, the pipe across them ──
  // The arms' tops sit just under the pipe, so the pipe rolls on them; the seat is under you.
  const armTop = -0.42;
  for (const ax2 of [-30, -13]) {
    add(box(1.6, 1.6, 30, STEEL, ax2, armTop - 0.8, -3));
    for (const az2 of [-16, 10]) add(box(1.4, armTop - 1.6 - FLOOR_Y, 1.4, DARK_STEEL, ax2, (armTop - 1.6 + FLOOR_Y) / 2, az2));
  }
  const seat = new THREE.Mesh(new RoundedBoxGeometry(26, 2.4, 12, 3, 0.6), WOOD);
  seat.position.set(-21.5, FLOOR_Y + 17, 14);
  seat.castShadow = seat.receiveShadow = true;
  add(seat);
  for (const dx of [-11, 11]) for (const dz of [-4.5, 4.5]) add(box(1.6, 16, 1.6, DARK_STEEL, -21.5 + dx, FLOOR_Y + 8, 14 + dz));
  // Tools laid on the seat, the way they're turned: jacks, shears, tweezers.
  const jacks = jacksModel();
  jacks.position.set(-27, FLOOR_Y + 18.35, 13);
  jacks.rotation.set(-Math.PI / 2, 0, 1.2);
  const shears = shearsModel();
  shears.position.set(-18, FLOOR_Y + 18.35, 15.5);
  shears.rotation.set(-Math.PI / 2, 0, 0.5);
  const tweezers = tweezersModel();
  tweezers.position.set(-12, FLOOR_Y + 18.35, 11);
  tweezers.rotation.set(-Math.PI / 2, 0, 1.9);
  add(jacks, shears, tweezers);
  // A water bucket with the wooden blocks soaking in it.
  add(new THREE.Mesh(new THREE.CylinderGeometry(5.5, 4.8, 11, 28, 1, true), new THREE.MeshStandardMaterial({ color: '#5d6f80', roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide })).translateX(24).translateY(FLOOR_Y + 5.5).translateZ(-62));
  const water = new THREE.Mesh(new THREE.CircleGeometry(5.3, 28), new THREE.MeshStandardMaterial({ color: '#3c5a68', roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.62 })); // you can just see the blocks' heads under it
  water.rotation.x = -Math.PI / 2;
  water.position.set(24, FLOOR_Y + 9.5, -62);
  add(water);
  // Wooden blocks soak head-down: the carved cup under water, the handle leaning out over the rim.
  for (const [dx, dz, t, spin] of [[-1.6, 1.2, 0.32, 0.4], [1.9, -1.1, -0.38, 2.2]]) {
    const block = new THREE.Group();
    const head = cyl(2, 3.2, std('#4a2c18', 0.9), 0, 1.6, 0, 20); // a turned cherrywood head, dark from soaking
    const cupRim = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.35, 8, 20), std('#3a2213', 0.9));
    cupRim.rotation.x = Math.PI / 2;
    const handle = cyl(0.38, 11, WOOD, 0, 3.2 + 5.5, 0, 10);
    block.add(head, cupRim, handle);
    block.position.set(24 + dx, FLOOR_Y + 5.2, -62 + dz);
    block.rotation.set(0, spin, t);
    add(block);
  }

  // ── Pipe warmer: a trough glowing at one end, blowpipes resting in it ──
  const px = -84, pz = -60;
  add(box(6, 4, 22, DARK_STEEL, px, FLOOR_Y + 22, pz));
  const slotMat = new THREE.MeshBasicMaterial({ color: '#e0662a' });
  const slot = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 20), slotMat);
  slot.rotation.x = -Math.PI / 2;
  slot.position.set(px, FLOOR_Y + 24.05, pz);
  add(slot, box(2, 22, 2, DARK_STEEL, px, FLOOR_Y + 11, pz));
  flames.push({ base: 0, mat: slotMat, color: new THREE.Color('#e0662a'), seed: 3 });
  for (let i = 0; i < 4; i++) {
    const pipe = cyl(0.42, 52, STEEL, px - 1.4 + i * 0.9, FLOOR_Y + 24.6, pz + 16 + i * 2, 12);
    pipe.rotation.set(Math.PI / 2 - 0.1, 0, 0.18 - i * 0.04);
    add(pipe);
  }

  // ── Cullet barrel: a steel drum half full of broken glass ──
  add(new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 16, 32, 1, true), new THREE.MeshStandardMaterial({ color: '#41606b', roughness: 0.55, metalness: 0.5, side: THREE.DoubleSide })).translateX(70).translateY(FLOOR_Y + 8).translateZ(-72));
  const cullet = new THREE.MeshStandardMaterial({ color: '#bcd6d2', roughness: 0.1, transparent: true, opacity: 0.75 });
  for (let i = 0; i < 26; i++) {
    const a = i * 2.39, r = 5.5 * Math.sqrt((i + 0.5) / 26);
    const shard = new THREE.Mesh(new THREE.TetrahedronGeometry(0.9 + (i % 3) * 0.4), i % 5 === 0 ? std('#2646c4', 0.15) : cullet);
    shard.position.set(70 + r * Math.cos(a), FLOOR_Y + 13 + (i % 4) * 0.4, -72 + r * Math.sin(a));
    shard.rotation.set(i, i * 1.7, i * 0.6);
    add(shard);
  }

  // ── Shelves of finished work, left of the window ──
  const shelfMat = std('#6b4a30', 0.8);
  for (const y of [22, 38]) add(box(36, 1.2, 7, shelfMat, -36, y, WALL_Z + 3.5));
  const pieces: [number, number, string, number[][]][] = [
    [-48, 22, '#2646c4', [[0, 0], [1.8, 0], [2.6, 3], [2.4, 6], [1.2, 9], [1.6, 10]]],
    [-40, 22, '#d98a1e', [[0, 0], [3.4, 0], [4.2, 2], [4.4, 3.4]]],
    [-30, 22, '#28a06e', [[0, 0], [1.6, 0], [1.9, 4], [1.9, 5]]],
    [-22, 22, '#c81c4c', [[0, 0], [2.2, 0], [2.8, 2.5], [2.2, 5.5], [1.2, 7]]],
    [-46, 38, '#ece8dc', [[0, 0], [2.6, 0], [3, 3], [2.8, 4]]],
    [-36, 38, '#7fb0c9', [[0, 0], [1.6, 0], [2.3, 4], [1.1, 8], [1.4, 9]]],
    [-26, 38, '#d98a1e', [[0, 0], [2, 0], [2.4, 5], [2.4, 6]]],
  ];
  for (const [x, y, c, pts] of pieces) {
    const lathe = new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), 28);
    const m = new THREE.Mesh(lathe, new THREE.MeshStandardMaterial({ color: c, roughness: 0.08, metalness: 0.05, transparent: true, opacity: 0.82, side: THREE.DoubleSide }));
    m.position.set(x, y + 0.6, WALL_Z + 3.5);
    m.castShadow = true;
    add(m);
  }

  // ── Color jars on a shelf, right of the window ──
  add(box(30, 1.2, 6, shelfMat, 50, 46, WALL_Z + 3));
  ['#2646c4', '#cd801e', '#28a06e', '#ece8dc', '#c81c4c'].forEach((c, i) => {
    const h = 6 + (i % 3);
    add(cyl(2, h, std(c, 0.3), 38 + i * 6, 46.6 + h / 2, WALL_Z + 3, 20), cyl(2.15, 1, DARK_STEEL, 38 + i * 6, 47.1 + h, WALL_Z + 3, 20));
  });

  // ── On the wall: a tool board and a color chart ──
  const peg = new THREE.Mesh(new THREE.PlaneGeometry(30, 20), new THREE.MeshStandardMaterial({ map: pegboardTexture(), roughness: 0.9 }));
  peg.position.set(-80, 40, WALL_Z + 0.3);
  const chart = new THREE.Mesh(new THREE.PlaneGeometry(14, 18), new THREE.MeshStandardMaterial({ map: chartTexture(), roughness: 0.8 }));
  chart.position.set(76, 30, WALL_Z + 0.3);
  add(peg, chart);

  // ── Hanging shop lamps, warm ──
  for (const [x, z] of [[-30, -66], [40, -66]]) {
    const shade = new THREE.Mesh(new THREE.ConeGeometry(5, 4, 28, 1, true), new THREE.MeshStandardMaterial({ color: '#2f4b3e', roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide }));
    shade.position.set(x, 62, z);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 10), new THREE.MeshBasicMaterial({ color: '#ffe2a8' }));
    bulb.position.set(x, 60.4, z);
    const lamp = new THREE.PointLight('#ffd9a0', 160, 0, 2);
    lamp.position.set(x, 59, z);
    add(shade, bulb, lamp, cyl(0.15, 60, std('#222', 0.8), x, 94, z, 6));
  }

  // ── Ceiling: dark deck and steel beams ──
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(260, 220), std('#3b4045', 0.95));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, FLOOR_Y + 160, -20);
  add(ceil);
  for (let x = -100; x <= 100; x += 40) add(box(3, 6, 220, DARK_STEEL, x, FLOOR_Y + 157, -20, false));

  // ── Dust in the window light ──
  const N = 240;
  const dust = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    dust[i * 3] = -20 + Math.random() * 60;
    dust[i * 3 + 1] = FLOOR_Y + Math.random() * 80;
    dust[i * 3 + 2] = -80 + Math.random() * 70;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dust, 3));
  const motes = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: '#fff6e0', size: 0.14, map: moteTexture(), alphaTest: 0.01, transparent: true, opacity: 0.4, depthWrite: false }));
  add(motes);

  return {
    update(time, dt) {
      for (const f of flames) {
        const n = 0.88 + 0.12 * Math.sin(time * 9 + f.seed * 3) * Math.sin(time * 3.7 + f.seed);
        if (f.light) f.light.intensity = f.base * n;
        if (f.mat && f.color) f.mat.color.copy(f.color).multiplyScalar(0.9 + 0.1 * n);
      }
      const pos = dustGeo.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < N; i++) {
        let y = pos.getY(i) + dt * 0.6;
        if (y > FLOOR_Y + 80) y = FLOOR_Y;
        pos.setXYZ(i, pos.getX(i) + Math.sin(time * 0.3 + i) * dt * 0.4, y, pos.getZ(i));
      }
      pos.needsUpdate = true;
    },
  };
}

// ── Hand tools, modeled lying flat in their own XY plane (y runs from handle to tip) ──

const TOOL_STEEL = () => new THREE.MeshStandardMaterial({ color: '#b9c0c5', metalness: 0.9, roughness: 0.28 });

/** A tapered round rod between two points in the XY plane. */
function rod(from: [number, number], to: [number, number], r0: number, r1: number, mat: THREE.Material) {
  const a = new THREE.Vector3(from[0], from[1], 0), b = new THREE.Vector3(to[0], to[1], 0);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, a.distanceTo(b), 14), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  m.castShadow = true;
  return m;
}

/** Jacks: two long tapering blades sprung apart by a curved steel bow at the handle. */
function jacksModel() {
  const g = new THREE.Group();
  const steel = TOOL_STEEL();
  g.add(rod([-0.9, 0], [-0.35, 11], 0.24, 0.1, steel), rod([0.9, 0], [0.35, 11], 0.24, 0.1, steel));
  const bow = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.17, 10, 24, Math.PI), steel);
  bow.rotation.z = Math.PI;
  g.add(bow);
  // Wooden tips on one blade, as many jacks have for opening a lip.
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 2.4, 12), new THREE.MeshStandardMaterial({ color: '#8a5a34', roughness: 0.8 }));
  tip.position.set(0.42, 10, 0);
  tip.rotation.z = 0.06;
  g.add(tip);
  return g;
}

/** Shears: two thin blades crossing at a pivot, with round finger loops. */
function shearsModel() {
  const g = new THREE.Group();
  const steel = TOOL_STEEL();
  g.add(rod([-0.7, 0], [0.25, 6.5], 0.16, 0.06, steel), rod([0.7, 0], [-0.25, 6.5], 0.16, 0.06, steel));
  for (const x of [-1.1, 1.1]) {
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.14, 8, 20), steel);
    loop.position.set(x, -0.5, 0);
    g.add(loop);
  }
  const pivot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 12), steel);
  pivot.rotation.x = Math.PI / 2;
  pivot.position.set(0, 2.6, 0);
  g.add(pivot);
  return g;
}

/** Tweezers: two springy tapered legs joined at the back. */
function tweezersModel() {
  const g = new THREE.Group();
  const steel = TOOL_STEEL();
  g.add(rod([-0.15, 0], [-0.45, 7], 0.14, 0.05, steel), rod([0.15, 0], [0.45, 7], 0.14, 0.05, steel));
  const back = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8), steel);
  g.add(back);
  return g;
}

// ── Textures ─────────────────────────────────────────────────────────

/** A soft round speck, so dust near the camera isn't a square. */
function moteTexture() {
  return canvasTexture(32, 32, (x) => {
    const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 32, 32);
  });
}

function canvasTexture(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  t.anisotropy = 4;
  return t;
}

/** Painted concrete block coursing. */
function blockTexture(base: string, rx: number, ry: number) {
  return canvasTexture(512, 256, (x) => {
    x.fillStyle = base;
    x.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 400; i++) {
      x.fillStyle = `rgba(${i % 2 ? 255 : 0},${i % 2 ? 255 : 0},${i % 2 ? 255 : 0},0.035)`;
      x.fillRect((i * 97) % 512, (i * 53) % 256, 3, 3);
    }
    x.strokeStyle = 'rgba(30,34,38,0.16)';
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
  }, [rx, ry]);
}

/** Sealed concrete with slab joints and scorch marks where glass has dropped. */
function concreteTexture() {
  return canvasTexture(512, 512, (x) => {
    x.fillStyle = '#8b877f';
    x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 2600; i++) {
      const v = (i * 37) % 60;
      x.fillStyle = `rgba(${v},${v},${v},0.06)`;
      x.fillRect((i * 131) % 512, (i * 71) % 512, 2 + (i % 3), 2 + (i % 2));
    }
    for (const [cx, cy, r] of [[150, 180, 34], [360, 300, 22], [260, 420, 28]]) {
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, 'rgba(30,24,20,0.45)');
      g.addColorStop(1, 'rgba(30,24,20,0)');
      x.fillStyle = g;
      x.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    x.strokeStyle = 'rgba(40,38,34,0.45)';
    x.lineWidth = 2;
    x.strokeRect(1, 1, 510, 510);
  }, [3, 3]);
}


/** The annealer's controller: a red LED readout. */
function controllerTexture() {
  return canvasTexture(180, 100, (x) => {
    x.fillStyle = '#1d2024';
    x.fillRect(0, 0, 180, 100);
    x.fillStyle = '#0b0c0d';
    x.fillRect(14, 16, 152, 46);
    x.fillStyle = '#ff3b2a';
    x.font = 'bold 40px ui-monospace, monospace';
    x.textBaseline = 'middle';
    x.fillText('960°F', 26, 40);
    x.fillStyle = '#5fd08a';
    x.beginPath();
    x.arc(24, 80, 5, 0, Math.PI * 2);
    x.fill();
  });
}

/** Masonite pegboard with the shapes of hand tools hanging on it. */
function pegboardTexture() {
  return canvasTexture(300, 200, (x) => {
    x.fillStyle = '#8a6a48';
    x.fillRect(0, 0, 300, 200);
    x.fillStyle = 'rgba(40,28,18,0.55)';
    for (let i = 10; i < 300; i += 14) for (let j = 10; j < 200; j += 14) x.fillRect(i, j, 2.5, 2.5);
    x.fillStyle = '#5b6066';
    // Jacks, shears, tweezers, a paddle.
    x.fillRect(40, 30, 6, 120);
    x.fillRect(58, 30, 6, 120);
    x.fillRect(38, 26, 28, 10);
    x.fillRect(110, 40, 5, 100);
    x.fillRect(122, 40, 5, 100);
    x.fillRect(170, 50, 3, 90);
    x.fillRect(178, 50, 3, 90);
    x.fillStyle = '#6b4a30';
    x.fillRect(220, 40, 46, 70);
    x.fillRect(238, 110, 10, 60);
  });
}

/** A generic glass color chart: rows of swatches. */
function chartTexture() {
  const colors = ['#2646c4', '#3e7bd6', '#7fb0c9', '#28a06e', '#7dbb4a', '#e3c33a', '#d98a1e', '#c8562a', '#c81c4c', '#8a3a8a', '#ece8dc', '#2a2a2a'];
  return canvasTexture(140, 180, (x) => {
    x.fillStyle = '#f2efe8';
    x.fillRect(0, 0, 140, 180);
    x.fillStyle = '#3a3a3a';
    x.fillRect(12, 12, 116, 10);
    colors.forEach((c, i) => {
      x.fillStyle = c;
      x.fillRect(14 + (i % 3) * 40, 34 + Math.floor(i / 3) * 34, 32, 26);
    });
  });
}
