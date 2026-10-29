/** Grams of glass for a volume in mm³ at a density in g/cm³. */
export function weightGrams(volume_mm3: number, density_g_cm3: number): number {
  return (volume_mm3 / 1000) * density_g_cm3;
}

/**
 * Signed volume of a closed triangle mesh (divergence theorem). Positive when the
 * faces wind outward, so tests use it to check both size and orientation.
 */
export function meshSignedVolume(positions: ArrayLike<number>, index?: ArrayLike<number> | null): number {
  const count = index ? index.length : positions.length / 3;
  let v = 0;
  for (let i = 0; i < count; i += 3) {
    const a = 3 * (index ? index[i] : i);
    const b = 3 * (index ? index[i + 1] : i + 1);
    const c = 3 * (index ? index[i + 2] : i + 2);
    const ax = positions[a], ay = positions[a + 1], az = positions[a + 2];
    const bx = positions[b], by = positions[b + 1], bz = positions[b + 2];
    const cx = positions[c], cy = positions[c + 1], cz = positions[c + 2];
    v += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return v / 6;
}
