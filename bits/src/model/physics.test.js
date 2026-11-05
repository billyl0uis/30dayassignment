import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { buildSection, solidOfRevolution } from '@jackline/geometry/profile.js'
import { measureMesh } from '@jackline/geometry/vessel.js'
import { clockOf, combine, massOf, meshMass, tipAngle } from './physics.js'
import { BIT_TYPES } from './bits/index.js'
import { anchorAt, anchorFromPoint } from './surface.js'

const DENSITY = 2.5
const near = (a, b, rel) => expect(Math.abs(a - b) / Math.abs(b)).toBeLessThan(rel)

// A solid cylinder as a closed mesh: lathe a rectangle that starts and ends
// on the axis. A lathe with n sides is really a regular n-gon prism, whose
// volume is exactly (n/2)·r²·sin(2π/n)·h, so the mesh sum can be held to
// that exactly and to πr²h within the polygon error.
function solidCylinder(r, h, n = 256) {
  const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(r, 0), new THREE.Vector2(r, h), new THREE.Vector2(0, h)]
  return new THREE.LatheGeometry(pts, n)
}

describe('solid cylinder (r = 2 cm, h = 5 cm)', () => {
  const geo = solidCylinder(2, 5)
  const m = meshMass(geo)

  it('volume matches the n-gon prism exactly and πr²h closely', () => {
    // Exact up to float32 vertex rounding.
    near(m.volume, (256 / 2) * 4 * Math.sin((2 * Math.PI) / 256) * 5, 1e-7)
    near(m.volume, Math.PI * 4 * 5, 1e-3)
  })

  it('center of mass sits on the axis at half height', () => {
    expect(m.com[0]).toBeCloseTo(0, 6)
    expect(m.com[1]).toBeCloseTo(2.5, 6)
    expect(m.com[2]).toBeCloseTo(0, 6)
  })

  it('mass is volume × density', () => {
    const { mass } = massOf(geo, DENSITY)
    near(mass, Math.PI * 20 * DENSITY, 1e-3)
  })

  it('tip angle is atan(r / h_com) every way when centered', () => {
    const t = tipAngle(m.com, 2)
    expect(t.deg).toBeCloseTo((Math.atan(2 / 2.5) * 180) / Math.PI, 4)
    expect(t.toward).toBeNull()
  })
})

describe('cylinder with one off-axis sphere', () => {
  // Cylinder r = 2, h = 5 standing on the table; a 1 cm sphere stuck on its
  // right side (+x) with its center 3 cm out and 4 cm up.
  const cyl = massOf(solidCylinder(2, 5), DENSITY)
  const sphereGeo = new THREE.SphereGeometry(1, 96, 64)
  sphereGeo.translate(3, 4, 0)
  const sph = massOf(sphereGeo, DENSITY)
  const both = combine([cyl, sph])

  // Exact answers for the ideal shapes.
  const mc = Math.PI * 4 * 5 * DENSITY
  const ms = (4 / 3) * Math.PI * DENSITY
  const comX = (ms * 3) / (mc + ms)
  const comY = (mc * 2.5 + ms * 4) / (mc + ms)

  it('sphere mesh volume is 4/3·π·r³ within the faceting error', () => {
    near(sph.volume, (4 / 3) * Math.PI, 2e-3)
    expect(sph.com[0]).toBeCloseTo(3, 6)
    expect(sph.com[1]).toBeCloseTo(4, 6)
  })

  it('total mass adds up', () => {
    near(both.mass, mc + ms, 2e-3)
  })

  it('center of mass shifts toward the sphere by the mass-weighted amount', () => {
    expect(both.com[0]).toBeCloseTo(comX, 3)
    expect(both.com[1]).toBeCloseTo(comY, 3)
    expect(both.com[2]).toBeCloseTo(0, 6)
  })

  it('it tips toward the sphere, at atan((r − d) / h)', () => {
    const t = tipAngle(both.com, 2)
    expect(t.deg).toBeCloseTo((Math.atan((2 - comX) / comY) * 180) / Math.PI, 2)
    expect(t.toward).toBeCloseTo(Math.PI / 2, 6) // +x
    expect(clockOf(t.toward)).toBe('3:00')
  })

  it('a heavy enough sphere tips it over (negative angle)', () => {
    const big = combine([cyl, { mass: mc * 3, com: [3, 4, 0] }])
    expect(tipAngle(big.com, 2).deg).toBeLessThan(0)
  })
})

describe('clock positions', () => {
  it('front is 6, right is 3, back is 12, left is 9', () => {
    expect(clockOf(0)).toBe('6:00')
    expect(clockOf(Math.PI / 2)).toBe('3:00')
    expect(clockOf(Math.PI)).toBe('12:00')
    expect(clockOf(-Math.PI / 2)).toBe('9:00')
    expect(clockOf(Math.PI / 4)).toBe('4:30')
  })
})

describe('Jackline body as a closed mesh', () => {
  const tumbler = { points: [[3.0, 0], [3.15, 1.5], [3.5, 6], [3.9, 10.5]], wall: 0.3, floor: 0.9 }

  it('mesh volume agrees with Pappus on the same section', () => {
    const sec = buildSection(tumbler)
    const mesh = meshMass(measureMesh(sec.section, sec, {}))
    const exact = solidOfRevolution(sec.section)
    near(mesh.volume, exact.volume, 3e-3)
    expect(mesh.com[1]).toBeCloseTo(exact.y, 2)
  })

  it('one wall per point, all equal, gives the same section as one wall', () => {
    const a = buildSection(tumbler)
    const b = buildSection({ ...tumbler, wall: [0.3, 0.3, 0.3, 0.3] })
    expect(b.section).toEqual(a.section)
  })

  it('a thicker base wall adds glass', () => {
    const thin = solidOfRevolution(buildSection(tumbler).section).volume
    const heavy = solidOfRevolution(buildSection({ ...tumbler, wall: [0.8, 0.5, 0.3, 0.3] }).section).volume
    expect(heavy).toBeGreaterThan(thin)
  })
})

describe('prunt', () => {
  const sec = buildSection({ points: [[3.0, 0], [3.15, 1.5], [3.5, 6], [3.9, 10.5]], wall: 0.3, floor: 0.9 })

  const prunt = (texture, extra = {}, at = {}) => ({
    type: 'prunt', s: 0.4, theta: 0, spin: 0, texture,
    params: { diameter: 1.4, height: 0.6, point: 0.8, stampD: 1.1, stampDepth: 0.12, ...extra }, ...at,
  })
  const vol = (bit) => meshMass(BIT_TYPES.prunt.build(bit, sec)).volume

  it('a smooth prunt is a half-ellipsoid: (2/3)·π·a²·h', () => {
    near(vol(prunt('smooth')), (2 / 3) * Math.PI * 0.7 ** 2 * 0.6, 5e-3)
  })

  it('a pulled point adds glass; the pull only counts with that tool', () => {
    expect(vol(prunt('pulled point'))).toBeGreaterThan(vol(prunt('smooth')))
  })

  it('a raspberry stamp moves glass but adds none', () => {
    expect(vol(prunt('raspberry stamp'))).toBeCloseTo(vol(prunt('smooth')), 9)
  })

  it('sits on the surface, standing out along the normal', () => {
    const anchor = anchorAt(sec, 0.4, Math.PI / 2) // on the right side
    const m = meshMass(BIT_TYPES.prunt.build(prunt('smooth', {}, { theta: Math.PI / 2 }), sec))
    // A dome's centroid is 3/8 of its height above the base.
    expect(m.com[0]).toBeCloseTo(anchor.point[0] + anchor.normal[0] * 0.6 * 0.375, 2)
    expect(m.com[1]).toBeCloseTo(anchor.point[1] + anchor.normal[1] * 0.6 * 0.375, 2)
  })

  it('clicking where an anchor is gives that anchor back', () => {
    const a = anchorAt(sec, 0.63, 1.1)
    const back = anchorFromPoint(sec, a.point)
    expect(back.s).toBeCloseTo(0.63, 4)
    expect(back.theta).toBeCloseTo(1.1, 6)
  })
})
