# Finial

A planning tool for hand-blown (furnace) lidded jars, named after the knob on top of a lid. Draw the half-profile of the body and the lid, set wall thickness, check the lid fit, capacity and glass weight, and print a one-page shop sheet to take to the bench.

## Run

```
npm install
npm run dev     # http://localhost:5193
npm test
npm run lint
```

Vite + React + Tailwind + three.js, the same stack as Before The Heat.

## What it does

- **Body and lid profiles.** Drag points on a drafting grid; click the line to add one, double-click or Delete to remove, C for a sharp corner, arrows to nudge, Shift to snap. The 3D view updates as you draw, with a cutaway that shows the wall in section.
- **Wall thickness.** One thickness for the whole wall, or a point's own thickness (a heavy base, a thin lip), changing smoothly between points. Sudden changes are flagged by your own rule (so many times thicker within so many mm). It warns only and gives no annealing advice.
- **Lid.** Three fits: a flange inside the opening, sitting on a gallery, or a skirt over the rim. You set the gap; the app sizes the flange, skirt or edge from the body and works out where the lid actually comes to rest. Knob shapes: ball, button, mushroom, finial. A standing note says to expect to grind the seat.
- **Measures.** Height with and without the lid, widest, opening, rim and foot diameters, capacity brimful and with the lid on (ml and fl oz), and body, lid and total glass weight at an editable density.
- **Colour zones.** Body, lip wrap, foot, lid and knob, each with your own colour name and COE. Warns when the COEs entered don't match. No colour or COE data is built in.
- **Process plan.** A starting template of steps filled in with the jar's sizes and colours. Edit, reorder, add or delete steps; once edited, the plan is yours until you rebuild it.
- **Shop sheet.** One page (US Letter or A4) with the body and lid drawn in section at a stated scale and dimensioned, the measures, lid fit, colours, warnings and process steps. Print it, save it as PDF from the print dialog, or download a PNG. Print at 100% to keep the scale.
- **Save and open.** Designs save as `.finial.json` files. Your current design is also kept in the browser between visits. Presets: apothecary jar, squat honey jar, tall canister (one per lid fit).

## Layout

- `src/core/` — the **vessel core**, meant to be reused by a later perfume bottle app: profile maths, inner wall, volumes, thickness checks, units, the profile editor, 3D preview, dimension lines, design-file format. It never imports from `src/jar/`, and `core/model` is plain JavaScript; `src/core/architecture.test.js` checks both.
- `src/jar/` — everything specific to lidded jars: lid fit, colour zones, process plan, presets, shop sheet.

## How the numbers work

The drawn line is the outside of the glass. The inside is that line moved inward square to the wall by the thickness at each point (`core/model/wall.js`), with sharp corners kept exact and loops trimmed where a bend is tighter than the wall. Volumes and centres of mass use Pappus's theorem on the section polygon (`core/model/revolve.js`), which is exact for a polygon. The tests check it against a cylinder (πr²h exactly), a sphere (within 0.01% of 4/3·πR³, with the error shrinking 4× each time the facets double) and a hollow sphere shell.

## What's yours to set

Anything that would have to come from a real source is an editable value with a `TODO(source)` note in the code, not a fact the app asserts: glass density (starts at 2.5 g/cm³ for soda-lime), each glass's COE, the lid gap (starts at 0.75 mm), and the thickness-jump rule (starts at 2× within 10 mm).

## Units

Every length is stored in mm and every volume in ml. The mm / in switch only changes how numbers are shown and typed. Inch fields take `3`, `3.25`, `3 1/4` or `3-1/4`; add `mm`, `cm` or `in` to type in other units. Fluid ounces are US.
