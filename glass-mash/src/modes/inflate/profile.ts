/**
 * How tall the balloon is at a point inside the drawing.
 *
 * d      distance from this point to the nearest edge of the drawing (0 on the rim)
 * maxD   the largest d anywhere in the shape (the "thickest" spot)
 * amount the Inflation slider, 0 = flat pebble … 1 = fat blob
 *
 * Returns the half-thickness at this point; the back is mirrored, so the glass
 * is 2× this thick there. All values are in drawing units (the pad is 2 wide).
 */
export function heightProfile(d: number, maxD: number, amount: number): number {
  // A quarter-circle in normalised distance: vertical at the rim (rounded edge),
  // flat at the thickest spot (no ridge along the middle).
  const t = Math.min(d / maxD, 1);
  const dome = Math.sqrt(t * (2 - t));
  // Even at 0 the shape keeps some body, so a "pebble" still has a rounded edge
  // and the front and back skins never touch.
  const peak = maxD * (0.18 + 1.35 * amount);
  return peak * dome;
}
