import * as THREE from 'three'
import { spoutDeform } from '@jackline/geometry/vessel.js'
import { anchorAt } from '../surface.js'
import { sweep } from './common.js'

// Applied foot: built standing on the table. The body (and every other bit)
// is lifted to stand on top of it, and its rim becomes the footprint the
// piece tips over. One per piece.

// Disk foot, with an optional short drawn stem up to the body, as one lathe.
function diskProfile(p, sec) {
  const R = p.diameter / 2, th = p.thickness
  const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(R * 0.985, 0), new THREE.Vector2(R, th * 0.4), new THREE.Vector2(R * 0.95, th * 0.9), new THREE.Vector2(R * 0.82, th)]
  const top = th + p.stem
  if (p.stem > 0.05) {
    const sr = p.stemD / 2
    pts.push(new THREE.Vector2(sr * 1.6, th * 1.04), new THREE.Vector2(sr * 1.05, th + Math.min(0.4, p.stem * 0.3)))
    pts.push(new THREE.Vector2(sr, top - Math.min(0.4, p.stem * 0.3)))
    // Flares into the bottom of the body, no wider than its base.
    pts.push(new THREE.Vector2(Math.min(sr * 1.6, Math.max(sr, sec.footR * 0.9)), top))
  } else {
    pts.push(new THREE.Vector2(Math.max(R * 0.4, sec.footR * 0.9), top))
  }
  pts.push(new THREE.Vector2(0, top))
  return pts
}

// Coiled (wound) foot: a thread wound round, each turn a little higher and
// a little further in, so the coils make a low cone the body sits on.
const COIL_RISE = 0.78 // of the thread ⌀ per turn: turns overlap as they fuse
const COIL_STEP_IN = 0.55 // of the thread ⌀ per turn

function coilPath(p) {
  const r = p.thread / 2
  const R = p.diameter / 2 - r
  const n = Math.max(60, Math.ceil(p.turns * 120))
  const out = []
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * p.turns
    const rad = R - p.thread * COIL_STEP_IN * t
    const a = -t * Math.PI * 2
    const q = new THREE.Vector3(rad * Math.sin(a), r + p.thread * COIL_RISE * t, rad * Math.cos(a))
    out.push({ p: q, out: new THREE.Vector3(Math.sin(a), 0, Math.cos(a)) })
  }
  return out
}

export const FOOT = {
  label: 'Applied foot',
  blurb: 'A disk or wound foot under the base. Click the body to add it.',
  placement: 'base',
  single: true,
  defaults: { style: 'disk', diameter: 7, thickness: 0.4, stem: 0, stemD: 1, thread: 0.45, turns: 3 },
  params: [
    { key: 'style', label: 'Foot', kind: 'choice', options: [['disk', 'Disk'], ['coiled', 'Coiled (wound)']] },
    { key: 'diameter', label: 'Diameter', kind: 'length', min: 1, max: 30, step: 0.1 },
    { key: 'thickness', label: 'Thickness', kind: 'length', min: 0.1, max: 2, step: 0.02, when: (b) => b.params.style === 'disk' },
    { key: 'stem', label: 'Stem (0 = none)', kind: 'length', min: 0, max: 15, step: 0.1, when: (b) => b.params.style === 'disk' },
    { key: 'stemD', label: 'Stem ⌀', kind: 'length', min: 0.3, max: 4, step: 0.05, when: (b) => b.params.style === 'disk' && b.params.stem > 0.05 },
    { key: 'thread', label: 'Thread ⌀', kind: 'length', min: 0.1, max: 1.5, step: 0.01, when: (b) => b.params.style === 'coiled' },
    { key: 'turns', label: 'Turns', kind: 'number', min: 1, max: 10, step: 0.25, when: (b) => b.params.style === 'coiled' },
  ],
  textures: ['smooth'],
  defaultTexture: 'smooth',
  place: () => ({ s: 0, theta: 0 }),
  // How far it lifts the body off the table.
  lift(bit) {
    const p = bit.params
    return p.style === 'coiled' ? p.thread * (1 + COIL_RISE * p.turns) : p.thickness + p.stem
  },
  footprint: (bit) => bit.params.diameter / 2,
  thickest(bit) {
    const p = bit.params
    return p.style === 'coiled' ? p.thread : Math.max(p.thickness, p.stem > 0.05 ? p.stemD : 0)
  },
  thinnest: (bit) => (bit.params.style === 'coiled' ? bit.params.thread : bit.params.thickness),
  reach: () => 0,
  build(bit, sec) {
    const p = bit.params
    if (p.style === 'coiled') return sweep(coilPath(p), { wide: p.thread / 2, tall: p.thread / 2, sides: 14 })
    return new THREE.LatheGeometry(diskProfile(p, sec), 64)
  },
  callout: (bit) => ({ point: [0, 0.1, bit.params.diameter / 2], normal: [0, 0, 1] }),
}

// Pulled lip / spout: not an added bit. The rim is pulled out with the
// jacks, so it moves rim glass (through Jackline's spout) and adds none.
export const LIP = {
  label: 'Pulled lip / spout',
  blurb: 'Pulls the rim out into a spout. Moves rim glass; adds none. Click near the rim.',
  placement: 'rim',
  addsMass: false,
  defaults: { pull: 1.4, width: 3, depth: 2.5 },
  params: [
    { key: 'pull', label: 'Pull out', kind: 'length', min: 0.2, max: 5, step: 0.05 },
    { key: 'width', label: 'Width at rim', kind: 'length', min: 0.8, max: 12, step: 0.1 },
    { key: 'depth', label: 'Down from rim', kind: 'length', min: 0.5, max: 10, step: 0.1 },
  ],
  textures: ['pulled point'],
  defaultTexture: 'pulled point',
  place: (sec, hit) => ({ s: 1, theta: hit.theta }),
  thickest: () => 0,
  reach: (bit) => bit.params.pull,
  build: () => null,
  deformBody(bit, sec) {
    const rimR = sec.outer.at(-1)[0]
    const half = Math.min(Math.PI * 0.9, bit.params.width / 2 / Math.max(rimR, 0.3))
    return spoutDeform(sec, { at: bit.theta, amount: bit.params.pull, depth: bit.params.depth, width: half })
  },
  callout(bit, sec) {
    const a = anchorAt(sec, 1, bit.theta)
    const n = [Math.sin(bit.theta), 0, Math.cos(bit.theta)]
    return { point: a.point.map((v, i) => v + n[i] * bit.params.pull), normal: n }
  },
}
