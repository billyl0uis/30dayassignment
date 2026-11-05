import { useEffect } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { useDerived } from '../model/derived.js'
import { PRESETS } from '../model/presets.js'
import { useStore } from '../model/store.js'
import { drawSheet } from '../ui/exportSheet.js'

const CELL = 900 // pixels per view, square

// Renders the piece from the fixed angles a design sheet uses. Front, side
// and top are orthographic, all at one scale, so sizes read true and the
// views line up with each other; the 3/4 view keeps perspective so it
// looks like a photo.
export default function Sheet() {
  const sheet = useStore((s) => s.sheet)
  const setView = useStore((s) => s.setView)
  const { gl, scene, size } = useThree()
  const { metrics } = useDerived()

  useEffect(() => {
    if (!sheet) return
    // Two frames: one for React to hide the grid, one to settle.
    let id = requestAnimationFrame(() => {
      id = requestAnimationFrame(() => {
        const views = renderViews(gl, scene, size)
        setView({ sheet: false })
        const s = useStore.getState()
        if (views) drawSheet(views, { metrics, units: s.units, theme: s.theme, name: PRESETS[s.preset]?.name ?? 'Vessel' })
      })
    })
    return () => cancelAnimationFrame(id)
  }, [sheet, gl, scene, size, setView, metrics])
  return null
}

function renderViews(gl, scene, size) {
  const spin = scene.getObjectByName('turntable')
  if (!spin) return null
  const turned = spin.rotation.y
  spin.rotation.y = 0
  spin.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(spin, true)
  const c = box.getCenter(new THREE.Vector3())
  const span = box.getSize(new THREE.Vector3())
  // One scale for every flat view: cm per pixel, with room for dimensions.
  const cmPerPx = (Math.max(span.x, span.y, span.z) * 1.3) / CELL

  const ortho = (pos, up, center) => {
    const half = (CELL * cmPerPx) / 2
    const cam = new THREE.OrthographicCamera(-half, half, half, -half, 1, 1000)
    cam.position.copy(center).add(pos)
    cam.up.copy(up)
    cam.lookAt(center)
    return cam
  }
  // Each view is centered on the piece, so front and top share x, and
  // front and side share height: third-angle projection.
  const cams = {
    front: ortho(new THREE.Vector3(0, 0, 200), new THREE.Vector3(0, 1, 0), c),
    side: ortho(new THREE.Vector3(200, 0, 0), new THREE.Vector3(0, 1, 0), c),
    top: ortho(new THREE.Vector3(0, 200, 0), new THREE.Vector3(0, 0, -1), c),
  }
  const r = box.getBoundingSphere(new THREE.Sphere()).radius
  const hero = new THREE.PerspectiveCamera(30, 1, 0.5, 1000)
  hero.position.copy(c).add(new THREE.Vector3(1, 0.62, 1.35).setLength((r * 1.08) / Math.sin(THREE.MathUtils.degToRad(15))))
  hero.lookAt(c)
  cams.hero = hero

  // Draw each view on the live canvas at sheet size and copy it out, then
  // put the canvas back before the next frame can notice.
  const ratio = gl.getPixelRatio()
  gl.setPixelRatio(1)
  gl.setSize(CELL, CELL, false)
  const images = {}
  for (const [name, cam] of Object.entries(cams)) {
    gl.render(scene, cam)
    const img = document.createElement('canvas')
    img.width = img.height = CELL
    img.getContext('2d').drawImage(gl.domElement, 0, 0)
    images[name] = img
  }
  gl.setPixelRatio(ratio)
  gl.setSize(size.width, size.height, false)
  spin.rotation.y = turned

  return { images, box, center: c, cmPerPx, cell: CELL }
}
