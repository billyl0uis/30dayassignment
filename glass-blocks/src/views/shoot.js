import * as THREE from 'three'

// The views on a design sheet. +z is the front of the piece. The flat views
// look straight down an axis with no perspective, so they can be measured; the
// 3/4 view is a perspective "beauty shot".
export const VIEWS = [
  { id: 'front', label: 'Front' },
  { id: 'side', label: 'Right side' },
  { id: 'top', label: 'Top' },
  { id: 'three', label: '3/4 view' },
]

const FLAT = {
  front: { dir: [0, 0, 1], up: [0, 1, 0], frame: (s) => [s.x, s.y] },
  side: { dir: [1, 0, 0], up: [0, 1, 0], frame: (s) => [s.z, s.y] },
  top: { dir: [0, 1, 0], up: [0, 0, -1], frame: (s) => [s.x, s.z] },
}
const AWAY = 200 // cm from the piece to a flat-view camera; inside the backdrop sphere

// Photographs `piece` from every view with the scene's own renderer and copies
// each shot off the canvas before the next frame draws over it. All flat views
// share one scale, `k` pixels per cm, so they line up and measure alike.
// Returns { k, pad, size, shots: { front, side, top, three } } (shots are canvases).
export function shootViews(gl, scene, camera, piece) {
  const box = new THREE.Box3().setFromObject(piece)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const pad = Math.max(size.x, size.y, size.z) * 0.1 + 0.6
  const W = gl.domElement.width
  const H = gl.domElement.height

  const k = Math.min(
    ...Object.values(FLAT).map(({ frame }) => {
      const [w, h] = frame(size)
      return Math.min(W / (w + 2 * pad), H / (h + 2 * pad))
    }),
  )

  const grab = (cw, ch) => {
    const c = document.createElement('canvas')
    c.width = Math.round(cw)
    c.height = Math.round(ch)
    c.getContext('2d').drawImage(gl.domElement, Math.round((W - cw) / 2), Math.round((H - ch) / 2), c.width, c.height, 0, 0, c.width, c.height)
    return c
  }

  const shots = {}
  const ortho = new THREE.OrthographicCamera(-W / 2 / k, W / 2 / k, H / 2 / k, -H / 2 / k, 0.1, 1000)
  for (const [id, view] of Object.entries(FLAT)) {
    ortho.position.copy(center).addScaledVector(new THREE.Vector3(...view.dir), AWAY)
    ortho.up.set(...view.up)
    ortho.lookAt(center)
    ortho.updateMatrixWorld()
    gl.setRenderTarget(null)
    gl.render(scene, ortho)
    const [w, h] = view.frame(size)
    shots[id] = grab((w + 2 * pad) * k, (h + 2 * pad) * k)
  }

  // The 3/4 view fills the sheet's spare corner: as wide as the side view and
  // as tall as the top view, but never a sliver.
  const sideW = shots.side.width
  const topH = shots.top.height
  const tw = Math.min(W, Math.max(sideW, topH * 0.85))
  const th = Math.min(H, Math.max(topH, sideW * 0.85))
  const persp = new THREE.PerspectiveCamera(30, W / H, 0.1, 1000)
  const r = size.length() / 2
  const dist = (r * H) / (0.86 * Math.min(tw, th) * Math.tan(THREE.MathUtils.degToRad(15)))
  const az = THREE.MathUtils.degToRad(35)
  const el = THREE.MathUtils.degToRad(18)
  persp.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(dist).add(center)
  persp.lookAt(center)
  persp.updateMatrixWorld()
  gl.render(scene, persp)
  shots.three = grab(tw, th)

  // Put the normal view back so nothing flashes.
  gl.render(scene, camera)
  return { k, pad, size, shots }
}
