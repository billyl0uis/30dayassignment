import { useMemo } from 'react'
import { buildSection, handlePath, radiusAt, solidOfRevolution } from '../geometry/profile.js'
import { useStore } from './store.js'

const GLASS_DENSITY = 2.5 // g/cm³, soda-lime
const deg = (rad) => (rad * 180) / Math.PI

// Numbers about the empty piece as a thing you'd use: how much it holds,
// what it weighs, and how far it leans before it falls over.
export function measure(sec, handle, wall) {
  const glass = solidOfRevolution(sec.section)
  let glassCc = glass.volume
  let glassMoment = glass.volume * glass.y
  if (handle) {
    glassCc += handle.volume
    glassMoment += handle.volume * handle.y
  }
  const glassG = glassCc * GLASS_DENSITY
  const com = glassMoment / glassCc

  // Neck: the narrowest opening above the widest part of the inside. It's
  // what a sponge, a brush or a pour has to get through.
  let widest = 0
  sec.inner.forEach((p, i) => p[0] > sec.inner[widest][0] && (widest = i))
  const neckR = Math.min(...sec.inner.slice(widest).map((p) => p[0]))

  return {
    height: sec.height,
    rimD: sec.outer[sec.outer.length - 1][0] * 2,
    footD: sec.footR * 2,
    maxD: Math.max(...sec.outer.map((p) => p[0])) * 2,
    gripD: radiusAt(sec.outer, sec.height * 0.35) * 2,
    neckD: neckR * 2,
    wall,
    floorY: sec.floorY,
    brimMl: solidOfRevolution(sec.cavity).volume,
    glassG,
    com,
    // Tilt it on the edge of its foot: it falls once the center of mass
    // passes over that edge, at atan(foot radius / center-of-mass height).
    tip: deg(Math.atan2(sec.footR, com)),
    hasHandle: !!handle,
  }
}

export function useDerived() {
  const points = useStore((s) => s.points)
  const wall = useStore((s) => s.wall)
  const floor = useStore((s) => s.floor)
  const withHandle = useStore((s) => s.handle)
  const sec = useMemo(() => buildSection({ points, wall, floor }), [points, wall, floor])
  const handle = useMemo(() => (withHandle ? handlePath(sec) : null), [sec, withHandle])
  const metrics = useMemo(() => measure(sec, handle, wall), [sec, handle, wall])
  return { sec, handle, metrics }
}
