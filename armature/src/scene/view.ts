import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLASS, METALS } from '../config/materials';
import { cageById, isBaseContact, isWallAnchor, nodeById } from '../model/frame';
import type { GlassPart, Join, Sculpture, Vec3 } from '../model/types';
import type { Analysis, Status } from '../physics/checks';
import { BLOWN_LAT, BLOWN_LON, blownVertices, sphereIndices, teardropProfile } from '../physics/glass';

export type Pick =
  | { type: 'node'; id: string }
  | { type: 'rod'; id: string }
  | { type: 'part'; id: string }
  | { type: 'panel'; id: string };

export interface Highlight {
  nodes: Set<string>;
  rods: Set<string>;
  parts: Set<string>;
  joins: Set<string>;
}

const STATUS_COLOR: Record<Status, number> = { OK: 0x3f9b62, NOTE: 0x4a78b5, WARN: 0xd99a1e, BAD: 0xc8402f };
const JOIN_COLOR: Record<Join['type'], number> = {
  clip: 0x2a2a2a,
  standoff: 0x6d4fb3,
  bolt: 0x1d1d1d,
  wire_wrap: 0xb87046,
  cage_capture: 0xb87046,
  fused: 0xc8402f,
};

const v3 = (p: Vec3) => new THREE.Vector3(p[0], p[1], p[2]);

export class View {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  private frame = new THREE.Group();
  private glass = new THREE.Group();
  private joins = new THREE.Group();
  private overlay = new THREE.Group();
  private wall: THREE.Mesh;
  private workPlane: THREE.Mesh;
  private partMeshes = new Map<string, THREE.Object3D>();
  private pickables: THREE.Object3D[] = [];
  private raycaster = new THREE.Raycaster();

  private rodGeo = new THREE.CylinderGeometry(1, 1, 1, 12, 1);
  private nodeGeo = new THREE.SphereGeometry(1, 12, 8);
  private metalMats = new Map<string, THREE.MeshStandardMaterial>();
  private glassMat: THREE.MeshPhysicalMaterial;
  private glassSelMat: THREE.MeshPhysicalMaterial;
  private glassBadMat: THREE.MeshPhysicalMaterial;
  private selMat = new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0xff5a00, emissiveIntensity: 0.6 });

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    host.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0xe9e6df);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    this.camera = new THREE.PerspectiveCamera(40, 1, 5, 20000);
    this.camera.position.set(620, 520, 760);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 170, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;

    const hemi = new THREE.HemisphereLight(0xffffff, 0xb9b2a5, 0.9);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(400, 900, 500);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -700, right: 700, top: 700, bottom: -700, near: 10, far: 3000 });
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);

    // floor: shadow catcher + grid (10 mm minor, 100 mm major)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.ShadowMaterial({ opacity: 0.16 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    const minor = new THREE.GridHelper(2000, 200, 0xd3cec4, 0xd8d3ca);
    (minor.material as THREE.Material).transparent = true;
    (minor.material as THREE.Material).opacity = 0.55;
    const major = new THREE.GridHelper(2000, 20, 0xa59f93, 0xbdb7ab);
    major.position.y = 0.1;
    this.scene.add(minor, major);

    this.wall = new THREE.Mesh(
      new THREE.PlaneGeometry(2400, 2400),
      new THREE.MeshStandardMaterial({ color: 0xf3f0ea, roughness: 0.95, side: THREE.DoubleSide }),
    );
    this.wall.position.y = 1200;
    this.wall.receiveShadow = true;
    this.scene.add(this.wall);

    this.workPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(1200, 1200),
      new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.workPlane.rotation.x = -Math.PI / 2;
    this.workPlane.visible = false;
    this.scene.add(this.workPlane);

    // transmissive glass: refracts the frame behind it, so pillows read as shape rather than as a pale haze
    const glassBase = {
      color: 0xffffff, roughness: 0.04, metalness: 0, transmission: 1, thickness: 8, ior: 1.5,
      attenuationColor: new THREE.Color(GLASS.soda_lime_96.color), attenuationDistance: 22,
      clearcoat: 1, clearcoatRoughness: 0.03, specularIntensity: 1, envMapIntensity: 1.6, side: THREE.DoubleSide,
    };
    this.glassMat = new THREE.MeshPhysicalMaterial(glassBase);
    this.glassSelMat = new THREE.MeshPhysicalMaterial({ ...glassBase, attenuationColor: new THREE.Color(0xffb27a), emissive: new THREE.Color(0xff7a1a), emissiveIntensity: 0.12 });
    this.glassBadMat = new THREE.MeshPhysicalMaterial({ ...glassBase, attenuationColor: new THREE.Color(0xf08a78), emissive: new THREE.Color(0xc8402f), emissiveIntensity: 0.1 });

    this.scene.add(this.frame, this.glass, this.joins, this.overlay);
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    const loop = () => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(loop);
    };
    loop();
  }

  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private metalMat(id: string): THREE.MeshStandardMaterial {
    let m = this.metalMats.get(id);
    if (!m) {
      const info = METALS[id as keyof typeof METALS];
      m = new THREE.MeshStandardMaterial({ color: info.color, metalness: 0.85, roughness: 0.38 });
      this.metalMats.set(id, m);
    }
    return m;
  }

  setWorkPlane(visible: boolean, y: number) {
    this.workPlane.visible = visible;
    this.workPlane.position.y = y;
  }

  /** Rebuild the whole scene graph from the model. Cheap enough for sculptures with a few thousand rods. */
  rebuild(s: Sculpture, a: Analysis, hl: Highlight) {
    for (const g of [this.frame, this.glass, this.joins, this.overlay]) {
      for (const c of [...g.children]) {
        g.remove(c);
        c.traverse((o) => {
          if ((o as THREE.Mesh).geometry && (o as THREE.Mesh).geometry !== this.rodGeo && (o as THREE.Mesh).geometry !== this.nodeGeo) (o as THREE.Mesh).geometry.dispose();
        });
      }
    }
    this.pickables = [];
    this.partMeshes.clear();

    this.wall.visible = s.wall.enabled;
    this.wall.position.z = s.wall.z;

    // rods
    const up = new THREE.Vector3(0, 1, 0);
    const maxNodeDia = new Map<string, number>();
    for (const r of s.rods) {
      const a = nodeById(s, r.a), b = nodeById(s, r.b);
      if (!a || !b) continue;
      const pa = v3(a.p), pb = v3(b.p);
      const L = pa.distanceTo(pb);
      const mesh = new THREE.Mesh(this.rodGeo, hl.rods.has(r.id) ? this.selMat : this.metalMat(r.material));
      mesh.position.copy(pa).add(pb).multiplyScalar(0.5);
      mesh.scale.set(r.diameterMm / 2, L, r.diameterMm / 2);
      if (L > 1e-6) mesh.quaternion.setFromUnitVectors(up, pb.clone().sub(pa).normalize());
      mesh.castShadow = true;
      mesh.userData.pick = { type: 'rod', id: r.id } satisfies Pick;
      this.frame.add(mesh);
      this.pickables.push(mesh);
      for (const n of [r.a, r.b]) maxNodeDia.set(n, Math.max(maxNodeDia.get(n) ?? 0, r.diameterMm));
    }
    // nodes: small joints; base contacts and wall anchors get a coloured pad
    const cageNodes = new Set<string>();
    for (const c of s.cages) for (const p of [...c.ribPaths, ...c.ringPaths]) for (const n of p) cageNodes.add(n);
    for (const n of s.nodes) {
      const dia = maxNodeDia.get(n.id) ?? 6;
      const sel = hl.nodes.has(n.id);
      const base = isBaseContact(n);
      const wall = isWallAnchor(s, n);
      const r = sel ? Math.max(5, dia * 0.9) : cageNodes.has(n.id) ? dia * 0.55 : Math.max(3, dia * 0.65);
      const mesh = new THREE.Mesh(this.nodeGeo, sel ? this.selMat : this.metalMat(s.rods.find((x) => x.a === n.id || x.b === n.id)?.material ?? 'mild_steel'));
      mesh.position.set(...n.p);
      mesh.scale.setScalar(r);
      mesh.castShadow = true;
      mesh.userData.pick = { type: 'node', id: n.id } satisfies Pick;
      this.frame.add(mesh);
      this.pickables.push(mesh);
      if (base || wall) {
        const pad = new THREE.Mesh(new THREE.CircleGeometry(Math.max(8, dia * 1.6), 24), new THREE.MeshBasicMaterial({ color: base ? 0x2f6f8f : 0x6d4fb3, transparent: true, opacity: 0.55, depthWrite: false }));
        pad.position.set(n.p[0], base ? 0.4 : n.p[1], wall ? s.wall.z + 0.4 : n.p[2]);
        if (base) pad.rotation.x = -Math.PI / 2;
        this.overlay.add(pad);
      }
    }
    // panels
    for (const p of s.panels) {
      const pts = p.nodes.map((id) => nodeById(s, id)?.p);
      if (pts.some((x) => !x)) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute((pts as Vec3[]).flat(), 3));
      g.setIndex([0, 1, 2, 0, 2, 3]);
      g.computeVertexNormals();
      const m = this.metalMat(p.material).clone();
      m.side = THREE.DoubleSide;
      const mesh = new THREE.Mesh(g, m);
      mesh.castShadow = true;
      mesh.userData.pick = { type: 'panel', id: p.id } satisfies Pick;
      this.frame.add(mesh);
      this.pickables.push(mesh);
    }

    // glass
    for (const part of s.parts) {
      const st = a.partStatus.get(part.id) ?? 'OK';
      const mat = hl.parts.has(part.id) ? this.glassSelMat : st === 'BAD' ? this.glassBadMat : this.glassMat;
      const obj = this.partObject(part, mat);
      obj.userData.pick = { type: 'part', id: part.id } satisfies Pick;
      this.glass.add(obj);
      this.partMeshes.set(part.id, obj);
      this.pickables.push(obj);
    }

    // joins: a short line from the anchor to the glass + a small marker
    for (const j of s.joins) {
      const part = s.parts.find((p) => p.id === j.partId);
      if (!part) continue;
      const color = hl.joins.has(j.id) ? 0xff7a1a : JOIN_COLOR[j.type];
      let from: Vec3 | undefined;
      if (j.anchor.kind === 'node') from = nodeById(s, j.anchor.nodeId)?.p;
      else if (j.anchor.kind === 'wall') from = j.anchor.point;
      if (j.anchor.kind === 'cage') {
        const cage = cageById(s, j.anchor.cageId);
        if (cage && hl.joins.has(j.id)) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(cage.radiusMm + 8, 1.2, 6, 64), new THREE.MeshBasicMaterial({ color }));
          ring.rotation.x = Math.PI / 2;
          ring.position.set(...cage.center);
          this.joins.add(ring);
        }
        continue;
      }
      if (!from) continue;
      const to = v3(part.position);
      const f = v3(from);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([f, to]), new THREE.LineDashedMaterial({ color, dashSize: 4, gapSize: 3 }));
      line.computeLineDistances();
      this.joins.add(line);
      let marker: THREE.Mesh;
      if (j.type === 'wire_wrap') marker = new THREE.Mesh(new THREE.TorusGeometry(5, 1.1, 6, 16), new THREE.MeshStandardMaterial({ color, metalness: 0.8, roughness: 0.35 }));
      else if (j.type === 'bolt') marker = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 4, 12), new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.4 }));
      else marker = new THREE.Mesh(new THREE.BoxGeometry(7, 7, 7), new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.6 }));
      marker.position.copy(f).lerp(to, 0.5);
      if (j.type === 'bolt') marker.quaternion.setFromUnitVectors(up, to.clone().sub(f).normalize());
      this.joins.add(marker);
    }

    // centre of mass, plumb line, footprint
    const com = a.mass.com;
    const baseColor = STATUS_COLOR[a.base.status];
    if (a.base.hull.length >= 3) {
      const shape = new THREE.Shape(a.base.hull.map(([x, z]) => new THREE.Vector2(x, -z)));
      const fill = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: baseColor, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide }));
      fill.rotation.x = -Math.PI / 2;
      fill.position.y = 0.3;
      this.overlay.add(fill);
      const loop = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(a.base.hull.map(([x, z]) => new THREE.Vector3(x, 0.5, z))), new THREE.LineBasicMaterial({ color: baseColor }));
      this.overlay.add(loop);
    }
    if (com) {
      const marker = new THREE.Group();
      const ball = new THREE.Mesh(new THREE.SphereGeometry(7, 20, 12), new THREE.MeshBasicMaterial({ color: 0x1f1f1f, depthTest: false }));
      ball.renderOrder = 10;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(11, 1.4, 8, 32), new THREE.MeshBasicMaterial({ color: baseColor, depthTest: false }));
      ring.renderOrder = 10;
      marker.add(ball, ring);
      marker.position.set(...com);
      marker.userData.billboard = ring;
      this.overlay.add(marker);
      const plumbTarget = a.base.wallPiece ? new THREE.Vector3(com[0], com[1], s.wall.z) : new THREE.Vector3(com[0], 0, com[2]);
      const plumb = new THREE.Line(new THREE.BufferGeometry().setFromPoints([v3(com), plumbTarget]), new THREE.LineDashedMaterial({ color: 0x1f1f1f, dashSize: 8, gapSize: 5, depthTest: false }));
      plumb.computeLineDistances();
      plumb.renderOrder = 9;
      this.overlay.add(plumb);
      const cross = new THREE.Mesh(new THREE.RingGeometry(5, 9, 24), new THREE.MeshBasicMaterial({ color: baseColor, side: THREE.DoubleSide, depthWrite: false }));
      cross.position.copy(plumbTarget);
      if (a.base.wallPiece) cross.position.z += 0.6;
      else {
        cross.rotation.x = -Math.PI / 2;
        cross.position.y = 0.6;
      }
      this.overlay.add(cross);
    }
  }

  private partObject(part: GlassPart, mat: THREE.Material): THREE.Object3D {
    const g = part.geom;
    let geo: THREE.BufferGeometry;
    let applyScale = true;
    switch (g.kind) {
      case 'blown':
        geo = this.blownGeometry(part);
        applyScale = false; // scale already baked into the vertices
        break;
      case 'solid':
        geo = g.shape === 'teardrop'
          ? new THREE.LatheGeometry(teardropProfile(g.radiusMm).map((q) => new THREE.Vector2(Math.max(q.r, 0.01), q.y)), 40)
          : new THREE.SphereGeometry(g.radiusMm, 40, 28);
        break;
      case 'cast':
        geo = new THREE.BoxGeometry(...g.sizeMm);
        break;
      case 'leaf':
        geo = new THREE.SphereGeometry(1, 32, 16);
        geo.scale(g.lengthMm / 2, g.thicknessMm / 2, g.widthMm / 2);
        break;
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(...part.position);
    mesh.rotation.set(...(part.rotationDeg.map((d) => (d * Math.PI) / 180) as Vec3), 'XYZ');
    if (applyScale) mesh.scale.set(...part.scale);
    mesh.castShadow = true;
    mesh.renderOrder = 2;
    return mesh;
  }

  private blownGeometry(part: GlassPart): THREE.BufferGeometry {
    const lat = (part.geom.kind === 'blown' && part.geom.profile?.lat) || BLOWN_LAT;
    const lon = (part.geom.kind === 'blown' && part.geom.profile?.lon) || BLOWN_LON;
    const verts = blownVertices(part);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(Array.from(verts), 3));
    geo.setIndex(sphereIndices(lat, lon));
    geo.computeVertexNormals();
    return geo;
  }

  /** Fast path during a blow: only replace the blown part's geometry. */
  updateBlown(part: GlassPart) {
    const obj = this.partMeshes.get(part.id) as THREE.Mesh | undefined;
    if (!obj) return;
    obj.geometry.dispose();
    obj.geometry = this.blownGeometry(part);
  }

  pick(clientX: number, clientY: number): Pick | null {
    const hit = this.hits(clientX, clientY)[0];
    return hit ? (hit.object.userData.pick as Pick) : null;
  }

  /** Nodes win over rods/parts when they overlap, so you can grab joints on a busy cage. */
  pickPreferNode(clientX: number, clientY: number): Pick | null {
    const hits = this.hits(clientX, clientY);
    if (!hits.length) return null;
    const first = hits[0].distance;
    const node = hits.find((h) => (h.object.userData.pick as Pick).type === 'node' && h.distance < first + 12);
    return (node ?? hits[0]).object.userData.pick as Pick;
  }

  private hits(clientX: number, clientY: number) {
    this.setRay(clientX, clientY);
    return this.raycaster.intersectObjects(this.pickables, false);
  }

  private setRay(clientX: number, clientY: number) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
  }

  /** Intersect the pointer ray with a plane (normal n through point p). */
  rayPlane(clientX: number, clientY: number, n: Vec3, p: Vec3): Vec3 | null {
    this.setRay(clientX, clientY);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(v3(n).normalize(), v3(p));
    const out = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(plane, out) ? [out.x, out.y, out.z] : null;
  }

  /** Horizontal camera direction — the normal for vertical drags. */
  cameraFlatDir(): Vec3 {
    const d = new THREE.Vector3();
    this.camera.getWorldDirection(d);
    d.y = 0;
    d.normalize();
    return [d.x, d.y, d.z];
  }

  frameAll(s: Sculpture) {
    const box = new THREE.Box3();
    for (const n of s.nodes) box.expandByPoint(v3(n.p));
    for (const p of s.parts) box.expandByPoint(v3(p.position));
    if (box.isEmpty()) box.set(new THREE.Vector3(-150, 0, -150), new THREE.Vector3(150, 300, 150));
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    const dir = s.wall.enabled ? new THREE.Vector3(0.45, 0.25, 1).normalize() : new THREE.Vector3(0.6, 0.5, 0.75).normalize();
    this.controls.target.copy(c);
    this.camera.position.copy(c).addScaledVector(dir, Math.max(500, size * 1.5));
  }
}
