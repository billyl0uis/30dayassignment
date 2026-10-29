import { describe, expect, it } from 'vitest';
import { formatInput, formatLength, fromDisplay, inch, parseLength, toDisplay } from '../src/model/units';
import { weightGrams } from '../src/geometry/measure';

describe('parseLength', () => {
  it('reads plain decimals in the display units', () => {
    expect(parseLength('3.25', 'in')).toBeCloseTo(82.55);
    expect(parseLength('8', 'cm')).toBeCloseTo(80);
    expect(parseLength('.5', 'in')).toBeCloseTo(12.7);
  });

  it('reads fractions and mixed numbers', () => {
    expect(parseLength('3/4', 'in')).toBeCloseTo(19.05);
    expect(parseLength('3 1/4', 'in')).toBeCloseTo(82.55);
    expect(parseLength('3-1/4', 'in')).toBeCloseTo(82.55);
    expect(parseLength('-1 1/2', 'in')).toBeCloseTo(-38.1);
  });

  it('lets a typed suffix override the display units', () => {
    expect(parseLength('80 mm', 'in')).toBeCloseTo(80);
    expect(parseLength('8cm', 'in')).toBeCloseTo(80);
    expect(parseLength('2"', 'cm')).toBeCloseTo(50.8);
    expect(parseLength('2 in', 'cm')).toBeCloseTo(50.8);
  });

  it('rejects junk', () => {
    expect(parseLength('', 'in')).toBeNull();
    expect(parseLength('abc', 'in')).toBeNull();
    expect(parseLength('1/0', 'in')).toBeNull();
    expect(parseLength('3..2', 'cm')).toBeNull();
  });
});

describe('unit conversion', () => {
  it('round-trips', () => {
    for (const mm of [0, 1, 25.4, 101.6, 333.3]) {
      expect(fromDisplay(toDisplay(mm, 'in'), 'in')).toBeCloseTo(mm, 9);
      expect(fromDisplay(toDisplay(mm, 'cm'), 'cm')).toBeCloseTo(mm, 9);
    }
  });

  it('formats field values without trailing zeros', () => {
    expect(formatInput(101.6, 'in')).toBe('4');
    expect(formatInput(82.55, 'in')).toBe('3.25');
    expect(formatInput(101.6, 'cm')).toBe('10.16');
  });
});

describe('weight', () => {
  it('uses g/cm³ against mm³', () => {
    expect(weightGrams(1000, 2.5)).toBeCloseTo(2.5);
    expect(weightGrams(250_000, 2.5)).toBeCloseTo(625);
  });
});

describe('formatLength', () => {
  it('reads inches as reduced sixteenths', () => {
    expect(formatLength(inch(3.5), 'in')).toBe('3 1/2"');
    expect(formatLength(inch(4), 'in')).toBe('4"');
    expect(formatLength(inch(3 / 16), 'in')).toBe('3/16"');
    expect(formatLength(inch(2 + 15 / 16), 'in')).toBe('2 15/16"');
  });

  it('marks sizes that fall between sixteenths', () => {
    expect(formatLength(90, 'in')).toBe('≈3 9/16"'); // 3.543 in
    expect(formatLength(100, 'in')).toBe('3 15/16"'); // 3.937 in, 0.0005 off
    expect(formatLength(inch(1.999), 'in')).toBe('2"'); // within a hair
  });

  it('handles zero and tiny sizes', () => {
    expect(formatLength(0, 'in')).toBe('0"');
    expect(formatLength(0.5, 'in')).toBe('<1/16"');
  });

  it('reads cm to a tenth, with small things in mm', () => {
    expect(formatLength(101.6, 'cm')).toBe('10.2 cm');
    expect(formatLength(4, 'cm')).toBe('4 mm');
    expect(formatLength(6.5, 'cm')).toBe('6.5 mm');
  });
});
