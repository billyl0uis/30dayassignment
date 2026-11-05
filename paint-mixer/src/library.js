// Paint library: flattening paint-library.json, search, status labels and the
// "same pigment" helper. Only colors present in the JSON (or added by the user)
// are ever used - nothing is invented.

/** Stable id for a library paint: "Brand|Line|Name". */
export const paintId = (line, paint) => `${line.brand}|${line.line}|${paint.name}`;

export const OPACITY_LEVELS = ['transparent', 'semi-transparent', 'semi-opaque', 'opaque'];

/** Flatten paint-library.json into one list with brand/line context attached. */
export function flattenLibrary(lib) {
  const out = [];
  for (const line of lib.lines ?? []) {
    for (const p of line.paints ?? []) {
      const status = p.color?.status ?? 'needs_swatch';
      out.push({
        id: paintId(line, p),
        brand: line.brand,
        line: line.line,
        medium: line.medium,
        tier: line.tier,
        name: p.name,
        pigments: p.pigments ?? [],
        opacity: OPACITY_LEVELS.includes(p.opacity) ? p.opacity : null,
        sourceUrl: p.sourceUrl ?? line.source ?? null,
        productCode: p.productCode ?? null,
        note: p.note ?? null,
        colorNote: p.color?.note ?? null,
        status,
        // A Lab color exists only for manufacturer_lab / measured entries.
        lab: status !== 'needs_swatch' && Array.isArray(p.color?.lab) ? p.color.lab : null,
        tintingStrength: 1,
        custom: false,
      });
    }
  }
  return out;
}

/** Paints that can take part in mixes right now (they have a color). */
export const usablePaints = (flat) => flat.filter((p) => Array.isArray(p.lab));

// ---- status -------------------------------------------------------------------

export const STATUS = {
  needs_swatch: { short: 'needs swatch', long: 'No color yet. Photograph a swatch to use this paint in mixes.' },
  manufacturer_lab: {
    short: 'approximate (manufacturer data)',
    long: 'Color published by the manufacturer; measurement conditions are not stated. Your own swatch will be more accurate.',
  },
  measured: { short: 'measured', long: 'Measured by you from a calibrated swatch photo.' },
  user_hex: { short: 'your hex value', long: 'Color entered by you as a hex value.' },
};

export const statusLabel = (status) => STATUS[status]?.short ?? status;

// ---- search -------------------------------------------------------------------

const norm = (s) => String(s ?? '').toLowerCase();

/**
 * Search by name, brand, line or pigment code. Every whitespace-separated
 * word must match somewhere ("golden PB29", "cadmium red light").
 * @param {object[]} paints
 * @param {string} query
 * @param {{brand?: string, usableOnly?: boolean}} filters
 */
export function searchPaints(paints, query, filters = {}) {
  const words = norm(query).split(/[\s,]+/).filter(Boolean);
  return paints.filter((p) => {
    if (filters.brand && p.brand !== filters.brand) return false;
    if (filters.usableOnly && !Array.isArray(p.lab)) return false;
    if (!words.length) return true;
    const hay = [p.name, p.brand, p.line, ...p.pigments].map(norm).join(' ');
    return words.every((w) => hay.includes(w));
  });
}

// ---- same pigment -------------------------------------------------------------

/**
 * Canonical key for a pigment list. Two paints "have the same pigments" when
 * their keys are equal. Never compare names: "Hue" paints often share a name
 * with a paint whose pigments are completely different.
 * @param {string[]} pigments  e.g. ["PY175", "PG7", "PW6"]
 * @returns {string} '' when the list is empty (unknown pigments match nothing)
 */
export function pigmentKey(pigments) {
  // Exact match per the spec: case-insensitive, duplicates ignored, order
  // ignored. "PB15" and "PB15:0" stay different - a bare PB15 often just
  // means "some phthalo blue", so treating them as equal could mislead.
  const codes = new Set((pigments ?? []).map((c) => String(c).trim().toUpperCase()).filter(Boolean));
  return [...codes].sort().join('+');
}

/** Other paints whose pigment list is the same as this one's. */
export function samePigmentPaints(paint, paints) {
  const key = pigmentKey(paint.pigments);
  if (!key) return [];
  return paints.filter((p) => p.id !== paint.id && pigmentKey(p.pigments) === key);
}
