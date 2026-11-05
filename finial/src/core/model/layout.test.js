import { describe, expect, it } from 'vitest'
import { chooseScale, scaleLabel, wrapText } from './layout'

// A stand-in: every character one unit wide.
const chars = (s) => s.length

describe('wrapText', () => {
  it('breaks between words to fit', () => {
    expect(wrapText('the quick brown fox jumps', 10, chars)).toEqual(['the quick', 'brown fox', 'jumps'])
  })

  it('keeps an over-long word whole on its own line', () => {
    expect(wrapText('a extraordinarily b', 8, chars)).toEqual(['a', 'extraordinarily', 'b'])
  })

  it('keeps line breaks that were typed', () => {
    expect(wrapText('one\ntwo three', 20, chars)).toEqual(['one', 'two three'])
  })
})

describe('chooseScale', () => {
  it('full size when it fits', () => {
    expect(chooseScale({ needW: 80, needH: 100, roomW: 120, roomH: 130 })).toBe(1)
  })

  it('steps down to the next standard scale', () => {
    // A 250 mm canister in 130 mm of height: 1:2 fits (125).
    expect(chooseScale({ needW: 100, needH: 250, roomW: 120, roomH: 130 })).toBe(1 / 2)
    // With 20 mm of dimension lines too, 1:2 no longer does.
    expect(chooseScale({ needW: 100, needH: 250, fixedH: 20, roomW: 120, roomH: 130 })).toBe(1 / 2.5)
  })

  it('names scales the usual way', () => {
    expect([1, 0.5, 0.4, 0.2].map(scaleLabel)).toEqual(['1:1', '1:2', '1:2.5', '1:5'])
  })
})
