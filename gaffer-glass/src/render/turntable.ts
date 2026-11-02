import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Piece } from '../sim/piece';
import { profile } from './profile';
import { latheGeometry, styleGlass, updateLathe } from './scene';

/**
 * A finished piece on a slow turntable, lit like a gallery shelf. Drag to turn it yourself;
 * it picks the spin back up when you let go.
 */
export class Turntable {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  private holder = new THREE.Group();
  private raf = 0;
  private spin = 0.5; // rad/s
  private dragging = false;

  constructor(private canvas: HTMLCanvasElement, shape: Piece) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#8a8378', 1.2));
    const key = new THREE.DirectionalLight('#fff6ea', 2);
    key.position.set(4, 8, 6);
    this.scene.add(key);

    // The piece stands up on its foot, as it would on a shelf: the pipe end down.
    const pr = profile(shape);
    const geo = latheGeometry();
    updateLathe(geo, pr, Math.min(shape.uneven, 1), 0, [-1, 0]);
    const mat = new THREE.MeshPhysicalMaterial({ roughness: 0.04, ior: 1.5, transmission: 1, thickness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05 });
    styleGlass(mat, shape, 0, [70, 10, 4]);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.z = Math.PI / 2; // the punty or pipe end becomes the foot, the lip faces up
    mesh.position.y = -pr.length / 2;
    this.holder.add(mesh);
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(pr.maxR * 1.2, pr.maxR * 1.28, 0.22, 48),
      new THREE.MeshStandardMaterial({ color: '#e9e5dd', roughness: 0.9 }));
    plinth.position.y = -pr.length / 2 - 0.11;
    this.scene.add(this.holder, plinth);

    const size = Math.max(pr.length, pr.maxR * 2);
    // Back far enough that the whole piece and its plinth sit in frame with room around them.
    const dist = (size * 1.5) / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
    this.camera.position.set(0, size * 0.45, dist);
    this.camera.lookAt(0, -size * 0.04, 0);

    let lastX = 0;
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      lastX = e.clientX;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.holder.rotation.y += (e.clientX - lastX) * 0.012;
      lastX = e.clientX;
    });
    const up = () => (this.dragging = false);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);

    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!this.dragging) this.holder.rotation.y += this.spin * dt;
      this.fit();
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  private fit() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (this.canvas.width !== Math.round(w * this.renderer.getPixelRatio())) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / Math.max(1, h);
      this.camera.updateProjectionMatrix();
    }
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
