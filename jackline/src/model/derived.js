import { useMemo } from 'react'
import { buildSection, handlePath, radiusAt, solidOfRevolution } from '../geometry/profile.js'
import { isSculpted, makeWarp } from '../geometry/sculpt.js'
import { measureMesh, meshMass } from '../geometry/vessel.js'
import { useStore } from './store.js'

const GLASS_DENSITY = 2.5 // g/cm³, soda-lime
const deg = (rad) => (rad * 180) / Math.PI

// Tilt it on the edge of its foot: it falls once the center of mass passes
// over that edge. A round foot is the same every way; a sculpted one (or a
// handle pulling the weight sideways) isn't, so try every direction and
// report the worst. Negative means it can't stand at all.
function tipAngle(com, footR, footPts) {
  let worst = Infinity
  for (let k = 0; k < 72; k++) {
    const a = (k / 72) * Math.PI * 2
    const dx = Math.sin(a), dz = Math.cos(a)
    const reach = footPts ? Math.max(...footPts.map(([x, z]) => x * dx + z * dz)) : footR
    worst = Math.min(worst, Math.atan2(reach - (com[0] * dx + com[2] * dz), com[1]))
  }
  return deg(worst)
}

// Numbers about the empty piece as a thing you'd use: how much it holds,
// what it weighs, and how far it leans before it falls over.
export function measure(sec, handle, wall, { sculpt, spout }) {
  const sculpted = isSculpted(sculpt)
  let glassCc, com, brimMl, maxR, footPts = null
  if (sculpted) {
    // No longer round, so measure the real shaped mesh.
    const glass = measureMesh(sec.section, sec, { spout, sculpt })
    const gm = meshMass(glass)
    glassCc = gm.volume
    com = gm.com
    const p = glass.attributes.position
    maxR = 0
    footPts = []
    for (let i = 0; i < p.count; i++) {
      maxR = Math.max(maxR, Math.hypot(p.getX(i), p.getZ(i)))
      if (p.getY(i) < 0.01) footPts.push([p.getX(i), p.getZ(i)])
    }
    glass.dispose()
    const cavity = measureMesh(sec.cavity, sec, { spout, sculpt, levelRim: true })
    brimMl = meshMass(cavity).volume
    cavity.dispose()
  } else {
    const glass = solidOfRevolution(sec.section)
    glassCc = glass.volume
    com = [0, glass.y, 0]
    brimMl = solidOfRevolution(sec.cavity).volume
    maxR = Math.max(...sec.outer.map((p) => p[0]))
  }

  if (handle) {
    // The handle hangs off one side, so it pulls the weight that way.
    let h = [handle.pts.reduce((a, p) => a + p[0], 0) / handle.pts.length, handle.y, 0]
    const warp = sculpted && makeWarp(sculpt, sec.height)
    if (warp) h = warp(h[0], h[1], h[2], [0, 0, 0])
    const total = glassCc + handle.volume
    com = com.map((c, i) => (c * glassCc + h[i] * handle.volume) / total)
    glassCc = total
  }

  // Neck: the narrowest opening above the widest part of the inside. It's
  // what a sponge, a brush or a pour has to get through.
  let widest = 0
  sec.inner.forEach((p, i) => p[0] > sec.inner[widest][0] && (widest = i))
  const neckR = Math.min(...sec.inner.slice(widest).map((p) => p[0]))

  return {
    height: sec.height,
    rimD: sec.outer[sec.outer.length - 1][0] * 2,
    footD: sec.footR * 2,
    maxD: maxR * 2,
    gripD: radiusAt(sec.outer, sec.height * 0.35) * 2,
    neckD: neckR * 2,
    wall,
    floorY: sec.floorY,
    brimMl,
    glassG: glassCc * GLASS_DENSITY,
    com,
    tip: tipAngle(com, sec.footR, footPts),
    hasHandle: !!handle,
    sculpted,
  }
}

export function useDerived() {
  const points = useStore((s) => s.points)
  const wall = useStore((s) => s.wall)
  const floor = useStore((s) => s.floor)
  const withHandle = useStore((s) => s.handle)
  const spout = useStore((s) => s.spout)
  const sculpt = useStore((s) => s.sculpt)
  const sec = useMemo(() => buildSection({ points, wall, floor }), [points, wall, floor])
  const handle = useMemo(() => (withHandle ? handlePath(sec) : null), [sec, withHandle])
  const metrics = useMemo(() => measure(sec, handle, wall, { sculpt, spout }), [sec, handle, wall, sculpt, spout])
  return { sec, handle, metrics }
}
