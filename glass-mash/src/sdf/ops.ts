// Boolean operations on distance values, with an optional melt radius k.
// k = 0 gives a hard seam; larger k lets the forms slump into each other,
// like two hot gathers touching.

/** Smooth union (polynomial smooth-min). */
export function smin(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

export function smax(a: number, b: number, k: number): number {
  return -smin(-a, -b, k);
}

/** Cut b out of a, with a rounded lip where the cut meets the surface. */
export const carve = (a: number, b: number, k: number) => smax(a, -b, k);

/** Keep only where a and b overlap. */
export const intersect = (a: number, b: number, k: number) => smax(a, b, k);
