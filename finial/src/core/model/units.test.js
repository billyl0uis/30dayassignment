import { describe, expect, it } from 'vitest'
import { flOzToMl, formatLength, formatVolume, inches, lengthValue, mlToFlOz, parseLength } from './units'

describe('inches', () => {
  // Eighths read the same at any fraction step of 8 or finer.
  it('reads whole and fractional inches', () => {
    expect(inches(25.4)).toBe('1 in')
    expect(inches(34.925)).toBe('1 3/8 in')
    expect(inches(3.175)).toBe('1/8 in')
    expect(inches(152.4)).toBe('6 in')
  })

  it('reads small sizes finer than large ones', () => {
    expect(inches(3)).toBe('1/8 in') // 0.118 in → 4/32
    expect(inches(4)).toBe('5/32 in')
    expect(inches(82.55 + 1.5875)).toBe('3 5/16 in')
    expect(inches(254 + 2.4)).toBe('10 1/8 in') // 10 3/32 in rounds to eighths
  })

  it('rounds up into the next whole inch', () => {
    expect(inches(25.39)).toBe('1 in')
  })

  it('says when a length is under the finest mark', () => {
    expect(inches(0)).toBe('0 in')
    expect(inches(0.01)).toMatch(/^< 1\/\d+ in$/)
  })
})

describe('formatLength', () => {
  it('shows mm or inches', () => {
    expect(formatLength(35, 'mm')).toBe('35 mm')
    expect(formatLength(34.925, 'mm')).toBe('34.9 mm')
    expect(formatLength(34.925, 'in')).toBe('1 3/8 in')
    expect(formatLength(NaN, 'mm')).toBe('—')
  })
})

describe('parseLength', () => {
  it('reads plain numbers in the current units', () => {
    expect(parseLength('35', 'mm')).toBe(35)
    expect(parseLength('1.5', 'in')).toBeCloseTo(38.1)
  })

  it('reads shop fractions', () => {
    expect(parseLength('1 3/8', 'in')).toBeCloseTo(34.925)
    expect(parseLength('1-3/8', 'in')).toBeCloseTo(34.925)
    expect(parseLength('3/8', 'in')).toBeCloseTo(9.525)
  })

  it('lets a unit on the end override the current units', () => {
    expect(parseLength('2 in', 'mm')).toBeCloseTo(50.8)
    expect(parseLength('2"', 'mm')).toBeCloseTo(50.8)
    expect(parseLength('40mm', 'in')).toBe(40)
    expect(parseLength('4 cm', 'in')).toBe(40)
  })

  it('refuses what it cannot read', () => {
    for (const bad of ['', 'abc', '1/0', '.', '1.5 3/8', '3 ft']) expect(parseLength(bad, 'mm')).toBeNull()
  })

  it('round-trips through lengthValue', () => {
    for (const units of ['mm', 'in']) expect(parseLength(lengthValue(34.925, units), units)).toBeCloseTo(34.925, 1)
  })
})

describe('volume', () => {
  it('converts ml and US fluid ounces both ways', () => {
    expect(mlToFlOz(29.5735295625)).toBeCloseTo(1, 10)
    expect(flOzToMl(16)).toBeCloseTo(473.176, 3)
  })

  it('shows the chosen system first', () => {
    expect(formatVolume(500, 'mm')).toBe('500 ml · 16.9 fl oz')
    expect(formatVolume(500, 'in')).toBe('16.9 fl oz · 500 ml')
  })
})
