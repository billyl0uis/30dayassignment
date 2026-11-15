// Thresholds for the heuristic checks, all in one place.
//
// EVERY NUMBER HERE IS A PLACEHOLDER — CALIBRATE FROM BENCH EXPERIENCE.
// None of them is an established figure. They are starting guesses so the
// checks have something to compare against. Change them to match your
// glass, your shop and your own losses; the checks only ever warn, never block.
//
// Lengths are in millimetres here (the app converts), angles in degrees.

export const CHECKS = {
  // 1. Bit vs the wall under it -------------------------------------------
  // Warn when a bit's thickest glass is more than this many times the wall
  // it sits on. Placeholder — calibrate from bench experience.
  bitToWallRatio: 3,

  // 2. Too thin to survive -------------------------------------------------
  // Placeholder — calibrate from bench experience.
  minThread_mm: 1.5, // trails, threading, coils (after combing or marvering thins them)
  minEdge_mm: 1.0, // wing edges, lily-pad leaf tips
  minPointNeck_mm: 2.0, // a pulled point's thickness…
  pointProbe_mm: 3.0, // …measured this far back from its tip

  // 3. Snag / break-off ----------------------------------------------------
  // A protrusion reaching further out than snagReach_mm, and more than
  // snagSlenderness times as long as it is thick where it leaves the body.
  // Placeholder — calibrate from bench experience.
  snagReach_mm: 15,
  snagSlenderness: 5,
  // Anything standing out more than rimProtrusion_mm within rimZone_mm of the
  // rim, where a lip or a hand meets the piece. Placeholder — calibrate.
  rimZone_mm: 10,
  rimProtrusion_mm: 3,
  // A wing reaching out further than this, or more than this many times its
  // own height, with nothing holding it up. Placeholder — calibrate.
  wingSpanMax_mm: 35,
  wingSpanToHeight: 2,

  // 6. Stability -----------------------------------------------------------
  // Warn when the minimum tip angle, at any fill checked, drops below this.
  // Placeholder — calibrate from bench experience (and how it'll be used).
  minTipDeg: 15,
}
