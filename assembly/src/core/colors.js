// Transparent tints, named by colorant family rather than by any maker.
// Hex values are illustrative screen approximations, not measurements.
// Sources: Jackline's GLASS_COLORS and the transparent entries of Before The
// Heat's glass colour index (src/core/science/glassColorIndex.js), which
// is also brand-neutral. Swatches from the colour index are kept as-is.
//
// `opacity` on a part is how strongly the tint shows per unit of glass it
// passes through; the colored-light step turns it into an absorption rate.
export const TINTS = [
  { id: 'clear', name: 'Clear', hex: '#ffffff' },
  { id: 'aqua', name: 'Aqua', hex: '#9fe0e0' },
  { id: 'cobalt-blue', name: 'Cobalt blue', hex: '#1e3a8a' },
  { id: 'copper-blue', name: 'Copper blue / turquoise', hex: '#0d9488' },
  { id: 'iron-blue', name: 'Iron blue', hex: '#0f766e' },
  { id: 'emerald-green', name: 'Emerald green', hex: '#15803d' },
  { id: 'bottle-green', name: 'Bottle green', hex: '#3f7f4f' },
  { id: 'amber', name: 'Amber', hex: '#c47a1f' },
  { id: 'gold-ruby', name: 'Gold ruby / cranberry', hex: '#be123c' },
  { id: 'copper-ruby', name: 'Copper ruby', hex: '#7f1d1d' },
  { id: 'amethyst', name: 'Amethyst', hex: '#8a5bb8' },
  { id: 'canary', name: 'Canary yellow', hex: '#f6c915' },
  { id: 'smoke', name: 'Smoke', hex: '#6b6f78' },
]

export const tintById = (id) => TINTS.find((t) => t.id === id)

const HEX = /^#[0-9a-f]{6}$/i
export function normalizeColor(c) {
  const hex = typeof c?.hex === 'string' && HEX.test(c.hex) ? c.hex.toLowerCase() : '#ffffff'
  const opacity = Number.isFinite(c?.opacity) ? Math.min(1, Math.max(0, c.opacity)) : 0.5
  return { hex, opacity }
}
