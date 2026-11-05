// Palette presets. Each one is a list of roles; the user fills every role with
// a paint they own (any brand). `query` is only the starting search text for
// that role - the user can change it.

export const PRESETS = {
  zorn: {
    name: 'Zorn',
    roles: [
      { label: 'Yellow ochre', query: 'ochre', hint: 'Usually PY42 or PY43.' },
      { label: 'Cadmium red (or a hue)', query: 'cadmium red', hint: 'Cadmium red is PR108; a "hue" uses other pigments.' },
      { label: 'Ivory black', query: 'PBk9', hint: 'Ivory or bone black, both PBk9.' },
      { label: 'Titanium white', query: 'titanium white', hint: 'PW6.' },
    ],
  },
  splitPrimary: {
    name: 'Split Primary',
    roles: [
      { label: 'Warm yellow', query: 'yellow', hint: 'Leans orange, e.g. cadmium yellow medium.' },
      { label: 'Cool yellow', query: 'yellow', hint: 'Leans green, e.g. lemon or cadmium yellow light.' },
      { label: 'Warm red', query: 'red', hint: 'Leans orange, e.g. cadmium red light or pyrrole red.' },
      { label: 'Cool red', query: 'quinacridone', hint: 'Leans blue, e.g. quinacridone magenta/rose or alizarin.' },
      { label: 'Warm blue', query: 'ultramarine', hint: 'Leans violet, e.g. ultramarine (PB29).' },
      { label: 'Cool blue', query: 'phthalo blue', hint: 'Leans green, e.g. phthalo blue (PB15:x) or cerulean.' },
      { label: 'White', query: 'titanium white', hint: 'Usually titanium white (PW6).' },
    ],
  },
  primaryTriad: {
    name: 'Primary Triad',
    roles: [
      { label: 'Red', query: 'red', hint: '' },
      { label: 'Yellow', query: 'yellow', hint: '' },
      { label: 'Blue', query: 'blue', hint: '' },
      { label: 'White', query: 'titanium white', hint: '' },
    ],
  },
};
