// Every number the app assumes about glass, contacts or hardware lives here,
// so it can be checked and changed in one place. The Settings / Assumptions
// panel shows all of them. Nothing here is a verified engineering value:
// each entry says where it came from and how sure it is.
//
// status: 'given'       — supplied in the brief, still worth checking
//         'estimate'    — a rough starting value, labelled as such in the UI
//         'placeholder' — no reliable source; set your own before trusting it
//         'yours'       — depends on your own kit (annealer, wire); no default is right

export const ASSUMPTIONS = {
  densityGPerCm3: {
    value: 2.5,
    label: 'Glass density',
    unit: 'g/cm³',
    status: 'given',
    note: 'Typical for soft soda-lime glass. Check the colour maker’s spec sheet; coloured and lead-bearing glasses differ.',
  },
  friction: {
    label: 'Friction coefficient (μ) by contact',
    status: 'estimate',
    note: 'Starting estimates only. Real values depend on surface finish, pad material, dust and moisture.',
    value: {
      bare: 0.4, // glass on glass
      pad: 0.6, // felt / silicone bumper
      adhesive: null, // UV-cure glass adhesive: treated as no-slide
    },
  },
  safetyFactor: {
    value: 4,
    label: 'Safety factor on hanging points',
    unit: '×',
    status: 'given',
    note: 'Carried weight × this factor must not exceed the hanging point’s rating.',
  },
  loopRule: {
    // PLACEHOLDER. There is no reliable published strength data for
    // hot-pulled glass loops. This is a rule of thumb for you to set, not a
    // rating: the minimum loop cross-section diameter (mm) per kg carried,
    // with a floor for very light parts.
    value: { mmPerKg: 4, minMm: 4 },
    label: 'Hot-pulled loop: minimum loop diameter',
    unit: 'mm per kg (min mm)',
    status: 'placeholder',
    note: 'Rule of thumb — not an engineering rating. No published strength data for hot-pulled loops; set these from your own testing.',
  },
  thickSectionMm: {
    value: 25,
    label: 'Thick-section warning above',
    unit: 'mm',
    status: 'given',
    note: 'Anneal time grows with thickness; this only flags parts for a closer look at your annealing schedule.',
  },
  annealerMm: {
    value: { w: 450, d: 450, h: 450 },
    label: 'Annealer interior (W × D × H)',
    unit: 'mm',
    status: 'yours',
    note: 'Enter your own annealer’s interior. The default is an arbitrary box, not a standard size.',
  },
}

// The plain values the maths uses, pulled out of the labelled entries above.
// A scene stores these (so a saved scene keeps its own assumptions).
export function defaultSettings() {
  const a = ASSUMPTIONS
  return {
    density: a.densityGPerCm3.value,
    friction: { ...a.friction.value },
    safetyFactor: a.safetyFactor.value,
    loopRule: { ...a.loopRule.value },
    thickSectionMm: a.thickSectionMm.value,
    annealer: { ...a.annealerMm.value },
    massUnit: 'metric', // 'metric' (g / kg) or 'lb'
  }
}
