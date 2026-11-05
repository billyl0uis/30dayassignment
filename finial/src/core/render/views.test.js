import { describe, expect, it } from 'vitest'
import { viewPose } from './views'

// A jar 100 wide, 150 tall, standing on the table.
const box = { center: [0, 75, 0], size: [100, 150, 100] }

describe('viewPose', () => {
  it('front is flat, level with the middle, looking straight on', () => {
    const p = viewPose('front', box, 1)
    expect(p.flat).toBe(true)
    expect(p.position[0]).toBe(0)
    expect(p.position[1]).toBe(75)
    expect(p.position[2]).toBeGreaterThan(150)
  })

  it('front fits the full height in the frame, with room around', () => {
    expect(viewPose('front', box, 1).halfHeight).toBeGreaterThan(75)
    // A tall narrow frame is limited by width instead.
    expect(viewPose('front', box, 0.5).halfHeight).toBeGreaterThan(100)
  })

  it('top and bottom look straight down and up the axis', () => {
    const top = viewPose('top', box, 1)
    const bottom = viewPose('bottom', box, 1)
    expect(top.position[1]).toBeGreaterThan(150)
    expect(bottom.position[1]).toBeLessThan(0)
    for (const p of [top, bottom]) {
      expect(p.flat).toBe(true)
      expect(Math.abs(p.position[2])).toBeLessThan(1)
      expect(p.halfHeight).toBeGreaterThan(50)
    }
  })

  it('above looks down into the mouth from in front', () => {
    const p = viewPose('above', box, 1)
    const [x, y, z] = p.position
    expect(p.flat).toBe(false)
    expect(x).toBe(0)
    // About 40° above level.
    expect((Math.atan2(y - 75, z) * 180) / Math.PI).toBeCloseTo(40, 6)
  })

  it('3d is the everyday view: in perspective, a little above', () => {
    const p = viewPose('3d', box, 1)
    expect(p.flat).toBe(false)
    expect(p.position[1]).toBeGreaterThan(75)
  })
})
