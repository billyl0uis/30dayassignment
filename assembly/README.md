# Assembly

Make a set of glass parts (blown forms, solid shapes, cane rods), then arrange them into one group sculpture and see how they light together. Part of the Before The Heat family; built in steps.

**Status: step 3 of 5.** Parts, the 3D arrangement view, and contacts + live checks. Colored light and presets are still to come.

## Arranging

- **Drag** a part to move it. It snaps to rest on whatever is below (the base or other parts). Shift snaps to 10 mm. Drag empty space to orbit.
- **Rest / Lean / Hang** per part (Placement panel). Leaning parts stand on the base, tip by the lean angle and slide in until they touch the wall or the chosen part. Hung parts hang their line length below the armature.
- **Keys:** R / ⇧R turn 15°, ⌘D duplicate, arrows nudge 5 mm (⇧ 1 mm), Delete removes, Esc deselects, ⌘Z / ⇧⌘Z undo/redo.
- **Views:** 3D, Top (footprint, orthographic) and Section (the selected part to scale).
- **Mode** (Field / Stacked / Leaning / Hung) sets how new parts are placed and which fixtures show (wall, armature).
- **Settle all** drops every part bottom-up.

Placement uses depth maps (`src/core/placement.js`): each part's top surface and underside are rasterised on a 2 mm grid, so "lift above everything and lower until it touches" is one max() over overlapping cells. There's no physics engine: where a part ends up is your call, and whether it stays there is for the static checks in step 3.

## Contacts and checks

Contacts are found where a part's underside comes within 1 mm of the top of what's below (or, for a leaning part, its foot on the base and its top against the wall or the part it leans on). Each gets a type: **Bare** (BAD), **Pad** (default) or **Adhesive** (no-slide). Coloured discs in the 3D view mark them.

Checks run live (about 10 ms per drag step on 12 parts); click an issue to select its part.

| | Check | How |
|---|---|---|
| BAD | Tip | Centre of mass of a part plus everything resting on it, projected onto the convex hull of its contact patches. A part resting on two others counts fully toward each (cautious). |
| BAD | Slide | Each contact's friction cone (half-angle atan μ round its normal); the part holds if straight up lies inside their combined cone, so a part wedged between two slopes holds even if each slope alone is too steep. Adhesive never slides. |
| BAD | Leaning | Ladder statics in the lean plane: forces at the foot and the top, each inside its friction cone, must balance the weight and its moment. A form leaned too little (centre of mass behind its foot) rocks back. |
| BAD | Bare glass | Any contact set to Bare. |
| BAD | Hanging point | Carried weight × safety factor against the rating: the wire or cap rating you enter, or for hot-pulled loops the rule of thumb in settings (not an engineering rating). No hanging point on a hung part is also BAD. |
| BAD | Resting on nothing | A part left in the air after something below it moved. |
| WARN | Annealer | Each part alone, in any of six square-on orientations (diagonal placements aren't tried). |
| WARN | Thick section | Thickest section above the threshold (default 25 mm). |
| WARN | Off the base | Footing beyond the base plate. |

Not covered yet: a leaning part's push on what it leans on isn't added to that part's tip check, leaning parts aren't checked for falling sideways, and parts that only touch side-by-side aren't detected as contacts. Adhesive isn't counted on to stop tipping.

## Run

```
npm install
npm run dev     # http://localhost:5201
npm test        # unit tests (Node's built-in runner, no extra packages)
```

Vite + React, the same stack as Jackline. three.js / react-three-fiber are installed for step 2.

## How the numbers work

- Lengths are mm, volumes cm³, weights g. Weight = volume × density (`settings.density`, default 2.5 g/cm³).
- **Blown form:** the profile is the outside of the glass. The inside is that line pushed inward by the wall thickness, with mitred corners so a sharp foot keeps an exact inside corner. Glass volume = revolved outer solid − revolved inner cavity, computed exactly from the section polygon with Pappus's theorem (`solidOfRevolution`, copied from Jackline). An open top ends at the rim; a closed top runs straight across to the axis from the last point.
- **Solids:** sphere, cylinder and block use exact formulas. The egg/teardrop is a revolved profile (point 0 = ellipsoid, point 1 = drop), also through Pappus.
- **Cane rod:** a cylinder lying along x.
- **Uniform scale** multiplies every length, wall included, so volume goes with scale³.

Every assumption lives in `src/core/assumptions.js` with its source and status (given / estimate / placeholder / yours).

## Layout

- `src/core/`: plain JS with no React (parts, profile maths, families, scene JSON, assumptions, tints, units)
- `src/scene/`: the 3D view (react-three-fiber)
- `src/ui/`: React panels
- `test/`: volume, weight, placement and checks tests
