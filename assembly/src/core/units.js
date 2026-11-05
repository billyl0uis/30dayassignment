// Display formatting. The model works in millimetres, cm³ and grams;
// only these functions know about kg and lb. Adapted from Jackline's
// src/model/units.js.
export const G_PER_LB = 453.59237

export function fmtMass(g, massUnit = 'metric') {
  if (massUnit === 'lb') return `${(g / G_PER_LB).toFixed(g < G_PER_LB ? 3 : 2)} lb`
  return g >= 1000 ? `${(g / 1000).toFixed(2)} kg` : `${Math.round(g)} g`
}

// Total weight is always shown both ways (g and kg), plus lb when chosen.
export function fmtTotalMass(g, massUnit = 'metric') {
  const metric = `${Math.round(g).toLocaleString('en-US')} g · ${(g / 1000).toFixed(2)} kg`
  return massUnit === 'lb' ? `${metric} · ${(g / G_PER_LB).toFixed(2)} lb` : metric
}

export const fmtMm = (mm, digits = 0) => `${mm.toFixed(digits)} mm`
export const fmtCm3 = (cm3) => `${cm3 < 10 ? cm3.toFixed(1) : Math.round(cm3)} cm³`
