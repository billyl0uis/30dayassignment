import type { Units } from './types';

export const MM_PER_IN = 25.4;
export const MM_PER_CM = 10;

export const inch = (n: number) => n * MM_PER_IN;

export function mmPerUnit(units: Units): number {
  return units === 'in' ? MM_PER_IN : MM_PER_CM;
}

export function toDisplay(mm: number, units: Units): number {
  return mm / mmPerUnit(units);
}

export function fromDisplay(value: number, units: Units): number {
  return value * mmPerUnit(units);
}

/** Smallest step a slider moves in, in display units. */
export function sliderStep(units: Units): number {
  return units === 'in' ? 1 / 16 : 0.1;
}

/** The value shown inside an editable field: plain decimals, trailing zeros trimmed. */
export function formatInput(mm: number, units: Units): string {
  const digits = units === 'in' ? 3 : 2;
  return String(Number(toDisplay(mm, units).toFixed(digits)));
}

/**
 * Parses what someone types into a length field and returns millimetres, or null.
 * Accepts decimals ("3.25"), fractions ("3/4", "3 1/4", "3-1/4") and an optional
 * unit suffix that overrides the display units ("8cm", "80 mm", '3"').
 */
export function parseLength(text: string, units: Units): number | null {
  let s = text.trim().toLowerCase();
  let unit: 'mm' | 'cm' | 'in' = units;
  const suffix = s.match(/\s*(mm|cm|in|"|″)$/);
  if (suffix) {
    unit = suffix[1] === 'mm' || suffix[1] === 'cm' ? suffix[1] : 'in';
    s = s.slice(0, suffix.index).trim();
  }
  const value = parseNumberWithFraction(s);
  if (value === null) return null;
  if (unit === 'mm') return value;
  return value * (unit === 'in' ? MM_PER_IN : MM_PER_CM);
}

function parseNumberWithFraction(s: string): number | null {
  const mixed = s.match(/^(-?)(\d+)[\s-]+(\d+)\/(\d+)$/);
  if (mixed) {
    const den = Number(mixed[4]);
    if (den === 0) return null;
    const v = Number(mixed[2]) + Number(mixed[3]) / den;
    return mixed[1] ? -v : v;
  }
  const frac = s.match(/^(-?\d+)\/(\d+)$/);
  if (frac) {
    const den = Number(frac[2]);
    return den === 0 ? null : Number(frac[1]) / den;
  }
  if (/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return parseFloat(s);
  return null;
}

/**
 * Formats a length for read-outs: dimension labels, the shop panel and later the
 * printed shop sheet. Editable fields use formatInput instead.
 */
export function formatLength(mm: number, units: Units): string {
  return units === 'in' ? formatInches(mm / MM_PER_IN) : formatMetric(mm);
}

/**
 * Inches read like a ruler: nearest 1/16, reduced (3 1/2"). When the true size is
 * more than a hair off that sixteenth it gets a "≈", so 100 mm reads ≈3 15/16".
 */
function formatInches(inches: number): string {
  const sign = inches < 0 ? '-' : '';
  const abs = Math.abs(inches);
  const sixteenths = Math.round(abs * 16);
  if (sixteenths === 0) return abs < 1e-6 ? '0"' : '<1/16"';
  const approx = Math.abs(abs - sixteenths / 16) > 0.002 ? '≈' : '';
  const whole = Math.floor(sixteenths / 16);
  let num = sixteenths % 16;
  let den = 16;
  while (num && num % 2 === 0) {
    num /= 2;
    den /= 2;
  }
  const frac = num ? `${num}/${den}` : '';
  return `${approx}${sign}${[whole || '', frac].filter(Boolean).join(' ')}"`;
}

/** Centimetres to one decimal, but small things (walls, bits) read in whole-ish millimetres. */
function formatMetric(mm: number): string {
  if (Math.abs(mm) < 10) return `${Number(mm.toFixed(1))} mm`;
  return `${(mm / MM_PER_CM).toFixed(1)} cm`;
}

export function formatVolume(mm3: number): string {
  return `${(mm3 / 1000).toFixed(1)} cm³`;
}

export function formatWeight(grams: number, units: Units): string {
  const g = grams < 100 ? grams.toFixed(1) : String(Math.round(grams));
  if (units !== 'in') return `${g} g`;
  const oz = grams / 28.349523125;
  return oz < 16 ? `${g} g · ${oz.toFixed(1)} oz` : `${g} g · ${(oz / 16).toFixed(2)} lb`;
}
