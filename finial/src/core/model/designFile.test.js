import { describe, expect, it } from 'vitest'
import { checkProfile, DesignFileError, unwrapDesign, wrapDesign } from './designFile'

const opts = { app: 'test', schemaVersion: 2 }

describe('wrapDesign and unwrapDesign', () => {
  it('round-trips a design', () => {
    const design = { a: 1, b: [1, 2] }
    expect(unwrapDesign(wrapDesign('test', 2, design), opts)).toEqual(design)
  })

  it('brings an older file up to date', () => {
    const text = wrapDesign('test', 1, { old: true })
    const migrate = (d, from) => ({ ...d, migratedFrom: from })
    expect(unwrapDesign(text, { ...opts, migrate })).toEqual({ old: true, migratedFrom: 1 })
  })

  it('refuses what it can’t read, saying why', () => {
    const cases = [
      ['not json', /isn’t JSON/],
      ['{"nothing": 1}', /isn’t a saved design/],
      [wrapDesign('other', 1, {}), /“other”/],
      [wrapDesign('test', 3, {}), /newer version/],
      ['{"app":"test","design":{}}', /format version/],
    ]
    for (const [text, reason] of cases) {
      expect(() => unwrapDesign(text, opts)).toThrow(DesignFileError)
      expect(() => unwrapDesign(text, opts)).toThrow(reason)
    }
  })
})

describe('checkProfile', () => {
  const good = [{ r: 0, z: 0 }, { r: 40, z: 0, corner: true, extra: 'x' }, { r: 40, z: 100, wall: 3 }]

  it('keeps the shape and drops anything unknown', () => {
    expect(checkProfile(good, 'body')).toEqual([{ r: 0, z: 0 }, { r: 40, z: 0, corner: true }, { r: 40, z: 100, wall: 3 }])
  })

  it('puts the first point back on the axis', () => {
    expect(checkProfile([{ r: 5, z: 0 }, ...good.slice(1)], 'body')[0].r).toBe(0)
  })

  it('refuses too few points, bad numbers and bad walls', () => {
    expect(() => checkProfile(good.slice(0, 2), 'body')).toThrow(/at least three/)
    expect(() => checkProfile([{ r: 0, z: 0 }, { r: 'x', z: 0 }, { r: 1, z: 1 }], 'body')).toThrow(/Point 2/)
    expect(() => checkProfile([{ r: 0, z: 0 }, { r: 1, z: -4 }, { r: 1, z: 1 }], 'body')).toThrow(/Point 2/)
    expect(() => checkProfile([{ r: 0, z: 0 }, { r: 1, z: 1, wall: 0 }, { r: 1, z: 2 }], 'lid')).toThrow(/wall thickness/)
  })
})
