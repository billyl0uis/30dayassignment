// Colour glass a piece can carry. Transparent colours absorb light per
// channel (tint = colour of white light after 1 cm at strength 1, as for the
// base glass). Opaque colours don't transmit at all: you see their surface,
// and they never show thickness-deepening.

export const COLORS = {
  clear:     { name: 'Clear', kind: 'base' },
  cobalt:    { name: 'Cobalt', kind: 'transparent', tint: '#3d63dc', strength: 1.4 },
  amber:     { name: 'Amber', kind: 'transparent', tint: '#e29a3a', strength: 1.2 },
  ruby:      { name: 'Gold ruby', kind: 'transparent', tint: '#d8336a', strength: 1.3 },
  emerald:   { name: 'Emerald', kind: 'transparent', tint: '#2fae6a', strength: 1.3 },
  violet:    { name: 'Violet', kind: 'transparent', tint: '#8a5ad8', strength: 1.3 },
  white:     { name: 'Opaque white', kind: 'opaque', color: '#f2f0ea' },
  black:     { name: 'Opaque black', kind: 'opaque', color: '#1c1c1f' },
  red:       { name: 'Opaque red', kind: 'opaque', color: '#c62a1f' },
  yellow:    { name: 'Opaque yellow', kind: 'opaque', color: '#f0c02c' },
  turquoise: { name: 'Opaque turquoise', kind: 'opaque', color: '#25aaa6' },
};

export const colorOptions = (includeClear = true) =>
  Object.entries(COLORS)
    .filter(([k]) => includeClear || k !== 'clear')
    .map(([k, c]) => ({ value: k, label: c.name }));
