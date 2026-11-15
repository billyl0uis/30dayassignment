# Bits

Plan the hot-applied elements on a blown vessel (prunts, lily pads, threading, coils, feet, wings and handles) before going to the bench. You can see what each bit does to the weight, the balance and the tipping of the piece.

The body is Jackline's. Bits imports Jackline's profile, section and mass code through `@jackline` (an alias to `../jackline/src`, the way Flacon shares Finial's core). It doesn't copy that code.

## Run

```
npm install
npm run dev     # http://localhost:5195
npm test
```

## Status: all 6 steps built

**Works**
- **Body:** a Jackline profile on a 1 cm grid (drag, add and remove points, floor handle). Wall thickness is set **per point** and eases between points.
- **Placing:** arm a bit type and click the 3D body. A preview follows the pointer. Bits snap to the surface and ride along when you redraw the profile. While a tool is armed, clicks pass through existing bits to the body.
- **Moving:** select a bit, then drag it over the body. A handle's top and bottom attachments each have an orange grip to drag.
- **Bit types** (each in `src/model/bits/`):
  - **Prunt:** diameter and height. The tool can be smooth, pulled point (pull length) or raspberry stamp (stamp diameter and depth).
  - **Raspberry prunt:** the same gob with the stamp on by default. The stamp moves glass but adds none, so its mass is the smooth gob's.
  - **Lily pad:** a gather layer over the lower body from the foot edge, with leaf-tip height, solid band, thickness, leaf count, width and curl. Only the layer counts as the bit. Glass under the base isn't drawn or counted.
  - **Trail / threading:**
    - Helix (wraps, pitch measured along the wall, up or down) or freehand (click points on the body).
    - Size is the round thread as laid. Marvered flattens it into a ribbon of the same area.
    - Combed (strokes, drag, feathered/up/down) drags it thinner but keeps the laid glass.
  - **Coil:** wound on the rim (going down) or the foot edge (going up), with diameter and turns.
  - **Applied foot:** a disk with an optional short solid stem, or a coiled foot wound into a low cone. It lifts the body and becomes the footprint for the tip angle. One per piece.
  - **Wings:** span, height, root thickness, tweezer pinches, tip rise or droop, and rotation. Use Ring of 2 for a pair.
  - **Handle:** two attachments in one vertical plane, strap diameter, reach, where the loop is fullest, and an optional thumb-rest prunt.
  - **Pulled lip / spout:** reshapes the rim through Jackline's spout code (pull, width, depth) and adds no glass.
- **Working order:** the list of bits in bench order. Drag a row or use the arrows to reorder. The numbers on the 3D bits follow the list.
- **Editing:** undo/redo (⌘Z / ⇧⌘Z), duplicate (⌘D), and a ring of N evenly spaced bits at the same height.
- **Glass:** one or more glasses with name, COE, compatibility group, density and color. COE and group start blank and are yours to fill in.
- **Readout:** a strip under the 3D view. Empty and filled are shown side by side: total mass, the center of mass (height and offset) and the minimum tip angle with its direction.
- **Fill level:** a 0–100% slider, measured as a share of capacity by volume. Water (1 g/ml) is drawn in the cavity, with a blue center-of-mass marker beside the orange empty one. The readout also names the least steady fill, checked every 10%.
- **Heuristic checks** (`src/model/checks.js`): warnings and notes, never blocks. Each shows this piece's numbers and the threshold it was compared against, plus a "why?" that explains the reasoning. Clicking one selects its bit. Flagged bits get a count badge in the working order, an amber ring on their 3D tag, and the warning inside their editor.
  1. **Bit vs wall:** the bit's thickest glass against the wall under it. For an applied foot, the base; for a handle, its thinner attachment.
  2. **Too thin:** threads after combing or marvering, wing edges, lily-pad tips, and a pulled point's thickness a few mm back from its tip.
  3. **Snag / break-off:** long reach on a thin neck, anything standing out near the rim, and long unsupported wing spans.
  4. **Glass compatibility:** a warning for a different COE or a different tested group. A note when the COEs match but no tested-compatible group is recorded, because matching COE alone isn't enough.
  5. **Annealing (note):** the thickest section anywhere on the piece, found as the widest circle that fits in the body's section, or the thickest bit or foot. It says to anneal for that, and gives no schedule.
  6. **Stability:** the minimum tip angle at the least steady fill.
- **Presets** (`src/model/presets.js`): a strip above the profile. Each one loads as an ordinary, editable piece in one undo step.
  - **Roemer:** a hollow stem and bowl in green, a ring of 6 raspberry prunts on the stem, and a wound foot.
  - **Threaded tumbler:** Jackline's tumbler with a 1.6 mm cobalt thread, 12 wraps over the lower third.
  - **Lily-pad pitcher:** Jackline's pitcher in aqua, with a 5-leaf lily pad, a handle at 9:00 and a spout at 3:00.
  - **Winged goblet:** Jackline's wine glass with its foot taken off, a pair of pinched wings on the solid stem, and an applied disk foot.
  - **Coiled bowl:** Jackline's bowl in amber, with a rim coil and a wound foot (delete the foot for a plain base).

  Bits are placed by height on the wall and rings are expanded into evenly spaced copies. The pitcher starts with one warning on purpose: its handle's attachment gob is 5.4× the wall, which trips the placeholder 3× ratio.
- **Views sheet** (toolbar → Views sheet): one landscape page, US Letter or A4, saved as a PNG or printed. Choose "Save as PDF" as the printer for a PDF.
  - The title strip has the piece name, maker, date, units and a scale bar.
  - Front (6:00 toward you), right side (3:00) and top (front at the bottom) are orthographic at one scale. The 3/4 view isn't to scale.
  - Every bit is numbered in every view. Bits on the far side are drawn faint with dashed leaders.
  - The bit schedule lists #, bit, where (height and clock position), size, glass (with its COE), tool and mass. # is the working-order step.
  - Totals show empty vs filled, the least steady fill, capacity and the thickest section. Every check is listed. Ruled bench notes fill the space left over.
  - Units follow the mm/in toggle (mass is always grams). Print at 100% and the scale bar stays true.
- **Thresholds:** all in one file, [`src/config/checks.js`](src/config/checks.js), each marked as a placeholder to calibrate from bench experience.

**Stubbed or not yet built**
- No 3D size or rotation gizmos. Shaping is done with sliders; only position (drag) and a handle's ends (grips) are dragged in 3D.
- A pulled lip doesn't move bits already sitting on that part of the rim, and a rim coil doesn't follow the lip.
- The wound foot's slope (rise and step-in per turn) is fixed in code, not yet a setting.
- Liquid is water only. Spilling isn't modeled, and a pulled lip doesn't change where it would spill.
- The thresholds are only editable in the config file, not in the app.
- No saving or loading of pieces as files yet. Only the current piece is kept, in the browser.
- The PDF is the sheet image printed to a page, so its text isn't selectable. No PDF library is used.
- A long piece's schedule or checks list can run past the page. The sheet then says how many more are in the app.
- The 3D tag numbers sit in a plain overlay above the view. They show through the glass and can overlap.

## How the numbers work

Lengths are cm inside the app (Jackline's units) and mm or inches on screen. Mass is in grams at each glass's density (2.5 g/cm³ default for soda-lime).

Every volume is measured off a closed mesh: Jackline's `meshMass`, a signed-tetrahedra sum over the triangles. The body is the lathe of its section. Each bit is measured only where it stands proud of the wall, closed flat at the surface, so no glass is counted twice. Masses combine by mass-weighted center.

The tip angle uses a round footprint of radius r and a center of mass at height h, offset d from the axis. It is `atan((r − d) / h)`, taken toward the offset, which is the worst direction. Directions are a clock seen from above: front 6, right 3, back 12.

`src/model/physics.test.js` checks the maths against known answers:
- a solid cylinder (exact n-gon prism volume, COM at half height, tip angle atan(r/h))
- a cylinder with one off-axis sphere (mass-weighted COM, tips toward the sphere at the right angle)
- the Jackline body mesh against Pappus
- a smooth prunt against a half-ellipsoid

`src/model/bits.test.js` checks the step-2 types on a straight 3 cm cylinder:
- a threading helix against πr² × helix length
- marvering and combing keeping the laid glass
- a lily pad with no leaves against the sleeve volume
- a handle pulling the tip direction its way
- a foot's lift and footprint
- a lip adding nothing

With liquid in it, the water's surface stays level as the piece tilts, so the water runs to the low side and the piece tips sooner than it would with frozen water. That's computed by cutting the cavity into thin horizontal slices: in each round slice the water is a circular segment, whose area and center are exact. The piece is tipped toward where its weight already leans, and the tip angle is where the combined center of mass passes over the foot's edge. `src/model/liquid.test.js` checks the tilted water against the known result for a cylinder: x̄ = R²·tanα / 4H, ȳ = H/2 + R²·tan²α / 8H.

Swept threads use a polygon section pushed out to equal area, so a 12-sided thread isn't 4.5% light.

All of these are estimates from the drawn shape, and the app labels them that way.
