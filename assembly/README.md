# Assembly

Make a set of glass parts (blown forms, solid shapes, cane rods), then arrange them into one group sculpture and see how they light together. Part of the Before The Heat family; built in steps.

**Status: step 1 of 5.** Data model, part creation and volume/weight math. Arrangement, contacts and checks, colored light and presets are still to come.

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
- `src/ui/`: React panels
- `test/`: volume and weight tests
