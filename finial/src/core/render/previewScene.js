import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { viewPose } from './views'

// The live 3D view: the section (wall.js buildSection) spun into glass.
// Scene units are mm, y up. It draws only when something changes (a new
// shape, an orbit, a resize), so it costs nothing while you think.

const SEGMENTS = 96

// Closed [r, z] glass polygons spun around the axis. With a cutaway, only
// the back half is spun and the cut faces are capped with the section
// itself, so you look straight at the wall thickness.
export function buildPartGroup(polygons, { cutaway, glass, cut }) {
  const group = new THREE.Group()
  for (const polygon of polygons) {
    const outline = polygon.map(([r, z]) => new THREE.Vector2(r, z))
    outline.push(outline[0].clone())
    const lathe = cutaway
      ? new THREE.LatheGeometry(outline, SEGMENTS / 2, Math.PI / 2, Math.PI)
      : new THREE.LatheGeometry(outline, SEGMENTS)
    group.add(new THREE.Mesh(lathe, glass))
    if (cutaway) {
      const face = new THREE.ShapeGeometry(new THREE.Shape(polygon.map(([r, z]) => new THREE.Vector2(r, z))))
      const right = new THREE.Mesh(face, cut)
      const left = new THREE.Mesh(face, cut)
      left.scale.x = -1
      group.add(right, left)
    }
  }
  return group
}

export class PreviewScene {
  constructor(canvas, { background = '#3d4048' } = {}) {
    // alpha, so a snapshot can have a clear background.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.scene = new THREE.Scene()
    this.background = new THREE.Color(background)
    this.scene.background = this.background
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    pmrem.dispose()
    this.scene.environment = this.envTexture

    // One camera in perspective, one flat for elevations and plans; the
    // view in use decides which.
    this.perspective = new THREE.PerspectiveCamera(30, 1, 1, 10000)
    this.flat = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100000)
    this.camera = this.perspective
    this.halfHeight = 100
    this.aspect = 1
    this.view = '3d'
    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.addEventListener('change', () => this.render())
    // Turning it by hand leaves the named view; whoever's listening hears.
    this.onUserMove = null
    this.controls.addEventListener('start', () => this.onUserMove?.())

    this.glass = new THREE.MeshPhysicalMaterial({
      color: '#dff4f2',
      transmission: 1,
      thickness: 6,
      roughness: 0.04,
      ior: 1.5,
      side: THREE.DoubleSide,
    })
    this.cut = new THREE.MeshStandardMaterial({ color: '#9fd6d0', roughness: 0.6, side: THREE.DoubleSide })
    this.tinted = new Map()
    this.vessel = null
    this.fitted = false
  }

  // Parts are { polygons, lift, color }: closed glass sections, raised by
  // lift mm (a lid set on its seat), in a colour of their own or the
  // scene's.
  setParts(parts, { cutaway = false } = {}) {
    if (this.vessel) {
      this.scene.remove(this.vessel)
      this.vessel.traverse((o) => o.geometry?.dispose())
    }
    const used = new Set()
    this.vessel = new THREE.Group()
    for (const part of parts) {
      const materials = part.color ? this.materialsFor(part.color) : { glass: this.glass, cut: this.cut }
      if (part.color) used.add(part.color)
      const group = buildPartGroup(part.polygons, { cutaway, ...materials })
      group.position.y = part.lift ?? 0
      this.vessel.add(group)
    }
    // Let go of colours no part uses any more.
    for (const [color, m] of this.tinted) {
      if (used.has(color)) continue
      m.glass.dispose()
      m.cut.dispose()
      this.tinted.delete(color)
    }
    this.scene.add(this.vessel)
    if (!this.fitted) this.fit()
    this.render()
  }

  // Glass and cut-face materials in one colour, made once and reused.
  materialsFor(color) {
    let m = this.tinted.get(color)
    if (!m) {
      const glass = this.glass.clone()
      glass.color.set(color)
      const cut = this.cut.clone()
      cut.color.set(color).multiplyScalar(0.8)
      m = { glass, cut }
      this.tinted.set(color, m)
    }
    return m
  }

  setColor(hex) {
    this.glass.color.set(hex)
    this.cut.color.set(hex).multiplyScalar(0.8)
    this.render()
  }

  // Frame the vessel in the everyday 3D view.
  fit() {
    this.setView('3d')
  }

  // Frame the vessel in a named view (views.js).
  setView(view) {
    if (!this.vessel) return
    this.syncSize()
    const box = new THREE.Box3().setFromObject(this.vessel)
    const pose = viewPose(view, { center: box.getCenter(new THREE.Vector3()).toArray(), size: box.getSize(new THREE.Vector3()).toArray() }, this.aspect, this.perspective.fov)
    this.view = view
    this.camera = pose.flat ? this.flat : this.perspective
    this.controls.object = this.camera
    if (pose.flat) {
      this.halfHeight = pose.halfHeight
      this.flat.zoom = 1
      this.frameFlat()
    }
    this.camera.position.set(...pose.position)
    this.controls.target.set(...pose.target)
    this.controls.update()
    this.fitted = true
    this.render()
  }

  frameFlat() {
    const h = this.halfHeight
    Object.assign(this.flat, { left: -h * this.aspect, right: h * this.aspect, top: h, bottom: -h })
    this.flat.updateProjectionMatrix()
  }

  // The view as it is now, as a PNG: drawn larger (about longSidePx on
  // its longest side), cropped to the piece with a border. backdrop is
  // 'scene' (as on screen), 'white' or 'clear' (transparent).
  snapshot({ longSidePx = 2000, backdrop = 'scene' } = {}) {
    this.syncSize()
    const canvas = this.renderer.domElement
    const ratio = this.renderer.getPixelRatio()
    const css = Math.max(canvas.width, canvas.height) / ratio
    this.renderer.setPixelRatio(Math.min(longSidePx / css, 6))
    this.scene.background = backdrop === 'clear' ? null : backdrop === 'white' ? new THREE.Color('#ffffff') : this.background
    this.render()

    // The piece's box, as seen, in pixels.
    const box = new THREE.Box3().setFromObject(this.vessel)
    const xs = []
    const ys = []
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z]) {
          const p = new THREE.Vector3(x, y, z).project(this.camera)
          xs.push(((p.x + 1) / 2) * canvas.width)
          ys.push(((1 - p.y) / 2) * canvas.height)
        }
    const pad = 0.06 * Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
    const left = Math.max(0, Math.floor(Math.min(...xs) - pad))
    const top = Math.max(0, Math.floor(Math.min(...ys) - pad))
    const width = Math.min(canvas.width, Math.ceil(Math.max(...xs) + pad)) - left
    const height = Math.min(canvas.height, Math.ceil(Math.max(...ys) + pad)) - top

    // Copied straight after drawing, while the picture is still there.
    const out = document.createElement('canvas')
    out.width = width
    out.height = height
    out.getContext('2d').drawImage(canvas, left, top, width, height, 0, 0, width, height)

    this.scene.background = this.background
    this.renderer.setPixelRatio(ratio)
    this.render()
    return new Promise((resolve, reject) => out.toBlob((b) => (b ? resolve(b) : reject(new Error('Snapshot failed'))), 'image/png'))
  }

  // Match the canvas's size on the page now, in case no resize has been
  // heard yet (a page in the background isn't told), so a view or a
  // snapshot never comes out stretched.
  syncSize() {
    const { clientWidth: w, clientHeight: h } = this.renderer.domElement
    if (w && h && (w !== this.cssWidth || h !== this.cssHeight)) this.resize(w, h)
  }

  resize(width, height) {
    if (!width || !height) return
    this.cssWidth = width
    this.cssHeight = height
    this.renderer.setSize(width, height, false)
    this.aspect = width / height
    this.perspective.aspect = this.aspect
    this.perspective.updateProjectionMatrix()
    this.frameFlat()
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
    for (const m of this.tinted.values()) {
      m.glass.dispose()
      m.cut.dispose()
    }
    this.envTexture.dispose()
    this.renderer.dispose()
  }
}
