// Materials table — the ONLY place physical constants live.
//
// Units: density in g/cm³, linear thermal expansion (CTE) in ×10⁻⁶ /°C
// (room temperature to a few hundred °C; CTE rises with temperature for all of these).
//
// Source for every value below: the Armature project brief. Each matches the
// commonly published room-temperature figure (e.g. MatWeb / Engineering ToolBox /
// supplier datasheets) to the precision shown. Alloys vary — treat these as
// representative, not as a spec for a particular bar of metal or batch of glass.
// If you add a material and are not sure of a value, leave it `null` with a TODO
// instead of guessing.

export type MetalId = 'mild_steel' | 'copper' | 'brass' | 'aluminum' | 'stainless_304';
export type GlassId = 'soda_lime_96';

export interface MaterialInfo {
  label: string;
  /** g/cm³ */
  density: number;
  /** ×10⁻⁶ per °C */
  cte: number;
  /** viewport colour */
  color: number;
}

export const GLASS: Record<GlassId, MaterialInfo> = {
  // Soda-lime "COE 96" art glass (e.g. System 96 compatible lines).
  // COE 96 is the industry label for ≈ 96 ×10⁻⁷ /°C = 9.6 ×10⁻⁶ /°C.
  // Density ≈ 2.5 g/cm³ is the usual figure for soda-lime glass.
  soda_lime_96: { label: 'Soda-lime (COE 96)', density: 2.5, cte: 9.6, color: 0x9fd6e6 },
};

export const METALS: Record<MetalId, MaterialInfo> = {
  // Low-carbon (mild) steel, e.g. A36 / 1018 class. 7.85 g/cm³, ≈ 12 ×10⁻⁶ /°C.
  mild_steel: { label: 'Mild steel', density: 7.85, cte: 12, color: 0x55595e },
  // Pure / electrolytic copper (C110). 8.96 g/cm³, ≈ 17 ×10⁻⁶ /°C (often quoted 16.5–17).
  copper: { label: 'Copper', density: 8.96, cte: 17, color: 0xb87046 },
  // Yellow brass (≈ C260/C360 class). 8.5 g/cm³, ≈ 19 ×10⁻⁶ /°C.
  brass: { label: 'Brass', density: 8.5, cte: 19, color: 0xc9a448 },
  // Aluminium alloys (6061 class). 2.7 g/cm³, ≈ 23 ×10⁻⁶ /°C.
  aluminum: { label: 'Aluminum', density: 2.7, cte: 23, color: 0xc4c9ce },
  // Austenitic stainless 304. 8.0 g/cm³, ≈ 17 ×10⁻⁶ /°C (often quoted 17.3).
  stainless_304: { label: 'Stainless (304)', density: 8.0, cte: 17, color: 0x9ea5ab },
};

export const METAL_IDS = Object.keys(METALS) as MetalId[];

/** grams for a volume in mm³ at a density in g/cm³ */
export function gramsFromMm3(volumeMm3: number, densityGcm3: number): number {
  return (volumeMm3 / 1000) * densityGcm3;
}
