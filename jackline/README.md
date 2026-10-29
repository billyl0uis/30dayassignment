# Jackline

Draw half the profile of a glass vessel and it is spun around its center axis into a hollow 3D piece. The line you draw is the outside wall; the inside follows it at the wall thickness you set, so the piece is truly hollow and can be measured.

Named after jacks, the glassblower's tool for shaping a vessel's profile.

## What it does

- **Profile sheet (left):** a 1 cm drafting grid. Drag points to shape the wall, click the wall to add a point, double-click to remove one, hold Shift to snap to ½ cm. Arrow keys nudge the selected point (Shift for 1 cm). Drag **floor** up to make a solid base or a solid stem.
- **3D view (middle):** the piece as glass, spinning. **Cutaway** slices it in half to show the wall in section.
- **Form (right):** wall thickness, how high the glass is solid, a pulled handle and a pouring spout, glass color and frost.
- **Sculpt:** break the round with hot-shop moves: optic ribs, twist, paddled-flat sides, a ruffled handkerchief rim, a lean and a freehand wobble. The profile sheet stays the turned base form; sculpting bends the whole piece (walls, handle and all) on top of it.
- **Measures:** capacity to the brim, glass weight, height, widest point, opening, and how far it can lean before tipping.
- **Will it work?:** checks on the walls, cleaning, grip, pouring and stability.
- **Profile template:** downloads a 1:1 SVG of the profile to print and work against at the bench.

Starting forms: tumbler, wine glass, mug, pitcher, bowl, bud vase, carafe, optic vase, handkerchief bowl, leaner, bottle.

## Run

```
npm install
npm run dev
```

Opens on http://localhost:5192. Vite + React + three.js (react-three-fiber).

## How the numbers work

Volumes use Pappus's theorem on the section polygon (`solidOfRevolution` in `src/geometry/profile.js`), so capacity and weight are exact for the drawn shape. Weight assumes soda-lime glass at 2.5 g/cm³. Once a piece is sculpted it isn't round any more, so volumes come from the shaped mesh itself (signed tetrahedra, `meshMass` in `src/geometry/vessel.js`). Tip angle is checked in every direction: the worst `atan((foot reach − center-of-mass offset) / center-of-mass height)`, so a lean or a handle pulls it down on that side.
