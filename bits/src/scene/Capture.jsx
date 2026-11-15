import { useEffect } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { useStore } from '../model/store.js'

// Renders the piece from the fixed angles of a design sheet, the way
// Jackline does: front, right side and top are orthographic at one shared
// scale, so sizes read true; the 3/4 view keeps perspective. For each view
// it also projects every bit's callout point, so the sheet can number them.
//
// Ask for it with captureViews(tags) from outside the canvas.

export const CELL = 900 // pixels per rendered view, square

let pending = null
export function captureViews(tags) {
  return new Promise((resolve, reject) => {
    pending = { tags, resolve, reject }
    useStore.getState().setView({ capturing: true })
  })
}

export default function Capture() {
  const capturing = useStore((s) => s.capturing)
  const { gl, scene, size } = useThree()
  useEffect(() => {
    if (!capturing || !pending) return
    const job = pending
    pending = null
    // Two frames: one for React to hide the working overlays, one to settle.
    let id = requestAnimationFrame(() => {
      id = requestAnimationFrame(() => {
        try {
          job.resolve(renderViews(gl, scene, size, job.tags))
        } catch (e) {
          job.reject(e)
        } finally {
          useStore.getState().setView({ capturing: false })
        }
      })
    })
    return () => cancelAnimationFrame(id)
  }, [capturing, gl, scene, size])
  return null
}

function renderViews(gl, scene, size, tags) {
  const piece = scene.getObjectByName('piece')
  if (!piece) throw new Error('nothing to draw')
  const box = new THREE.Box3().setFromObject(piece, true)
  const c = box.getCenter(new THREE.Vector3())
  const span = box.getSize(new THREE.Vector3())
  // One scale for every flat view, with room round the piece for callouts.
  const cmPerPx = (Math.max(span.x, span.y, span.z) * 1.45) / CELL
  const half = (CELL * cmPerPx) / 2
  const ortho = (dir, up) => {
    const cam = new THREE.OrthographicCamera(-half, half, half, -half, 1, 1000)
    cam.position.copy(c).addScaledVector(dir, 200)
    cam.up.copy(up)
    cam.lookAt(c)
    cam.updateMatrixWorld()
    return cam
  }
  // Front looks from +z (the 6:00 side), right side from +x (3:00), top
  // down from above with the front at the bottom of the drawing.
  const views = {
    front: { cam: ortho(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)), flat: true },
    side: { cam: ortho(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)), flat: true },
    top: { cam: ortho(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1)), flat: true },
  }
  const r = box.getBoundingSphere(new THREE.Sphere()).radius
  const hero = new THREE.PerspectiveCamera(30, 1, 0.5, 1000)
  hero.position.copy(c).add(new THREE.Vector3(1, 0.62, 1.35).setLength((r * 1.15) / Math.sin(THREE.MathUtils.degToRad(15))))
  hero.lookAt(c)
  hero.updateMatrixWorld()
  hero.updateProjectionMatrix()
  views.hero = { cam: hero, flat: false }

  const ratio = gl.getPixelRatio()
  gl.setPixelRatio(1)
  gl.setSize(CELL, CELL, false)
  const out = {}
  const v = new THREE.Vector3(), n = new THREE.Vector3(), toCam = new THREE.Vector3()
  for (const [name, { cam, flat }] of Object.entries(views)) {
    gl.render(scene, cam)
    const img = document.createElement('canvas')
    img.width = img.height = CELL
    img.getContext('2d').drawImage(gl.domElement, 0, 0)
    // Each callout: where its bit is on this view, which way is "out" on
    // screen, and whether it's on the far side (drawn as hidden).
    const px = (p) => {
      v.copy(p).project(cam)
      return [((v.x + 1) / 2) * CELL, ((1 - v.y) / 2) * CELL]
    }
    const marks = tags.map((t) => {
      const p = new THREE.Vector3(...t.point)
      n.set(...t.normal).normalize()
      const at = px(p)
      const out2 = px(p.clone().addScaledVector(n, 2))
      let dir = [out2[0] - at[0], out2[1] - at[1]]
      if (Math.hypot(...dir) < 8) dir = [at[0] - CELL / 2, at[1] - CELL / 2] // pointing at us: go outward
      const len = Math.hypot(...dir) || 1
      toCam.copy(cam.position).sub(p).normalize()
      return { n: t.n, at, dir: [dir[0] / len, dir[1] / len], hidden: n.dot(toCam) < -0.25 }
    })
    out[name] = { img, marks, flat }
  }
  gl.setPixelRatio(ratio)
  gl.setSize(size.width, size.height, false)
  return { views: out, cmPerPx, cell: CELL, box }
}
