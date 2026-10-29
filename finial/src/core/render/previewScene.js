import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

// The live 3D view: the section (wall.js buildSection) spun into glass.
// Scene units are mm, y up. It draws only when something changes (a new
// shape, an orbit, a resize), so it costs nothing while you think.

const SEGMENTS = 96

// The glass polygon spun around the axis. With a cutaway, only the back
// half is spun and the cut faces are capped with the section itself, so
// you look straight at the wall thickness.
export function buildVesselGroup(section, { cutaway, glass, cut }) {
  const group = new THREE.Group()
  const outline = section.glass.map(([r, z]) => new THREE.Vector2(r, z))
  outline.push(outline[0].clone())
  const lathe = cutaway
    ? new THREE.LatheGeometry(outline, SEGMENTS / 2, Math.PI / 2, Math.PI)
    : new THREE.LatheGeometry(outline, SEGMENTS)
  group.add(new THREE.Mesh(lathe, glass))
  if (cutaway) {
    const shape = new THREE.Shape(section.glass.map(([r, z]) => new THREE.Vector2(r, z)))
    const face = new THREE.ShapeGeometry(shape)
    const right = new THREE.Mesh(face, cut)
    const left = new THREE.Mesh(face, cut)
    left.scale.x = -1
    group.add(right, left)
  }
  return group
}

export class PreviewScene {
  constructor(canvas, { background = '#3d4048' } = {}) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(background)
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    pmrem.dispose()
    this.scene.environment = this.envTexture

    this.camera = new THREE.PerspectiveCamera(30, 1, 1, 10000)
    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.addEventListener('change', () => this.render())

    this.glass = new THREE.MeshPhysicalMaterial({
      color: '#dff4f2',
      transmission: 1,
      thickness: 6,
      roughness: 0.04,
      ior: 1.5,
      side: THREE.DoubleSide,
    })
    this.cut = new THREE.MeshStandardMaterial({ color: '#9fd6d0', roughness: 0.6, side: THREE.DoubleSide })
    this.vessel = null
    this.fitted = false
  }

  setSection(section, { cutaway = false } = {}) {
    if (this.vessel) {
      this.scene.remove(this.vessel)
      this.vessel.traverse((o) => o.geometry?.dispose())
    }
    this.vessel = buildVesselGroup(section, { cutaway, glass: this.glass, cut: this.cut })
    this.scene.add(this.vessel)
    if (!this.fitted) this.fit()
    this.render()
  }

  setColor(hex) {
    this.glass.color.set(hex)
    this.cut.color.set(hex).multiplyScalar(0.8)
    this.render()
  }

  // Frame the vessel: from a little above, the whole height in view.
  fit() {
    if (!this.vessel) return
    const box = new THREE.Box3().setFromObject(this.vessel)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const fov = (this.camera.fov * Math.PI) / 180
    const distance = (Math.max(size.y, size.x / Math.max(this.camera.aspect, 0.5)) * 0.9) / Math.tan(fov / 2)
    this.controls.target.copy(center)
    this.camera.position.set(0, center.y + distance * 0.35, distance)
    this.controls.update()
    this.fitted = true
    this.render()
  }

  resize(width, height) {
    if (!width || !height) return
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    // The first real size is when framing means anything.
    if (!this.sized) {
      this.sized = true
      this.fit()
    }
    this.render()
  }

  render() {
    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    this.controls.dispose()
    this.vessel?.traverse((o) => o.geometry?.dispose())
    this.glass.dispose()
    this.cut.dispose()
    this.envTexture.dispose()
    this.renderer.dispose()
  }
}
