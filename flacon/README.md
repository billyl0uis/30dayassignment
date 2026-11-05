# Flacon

A planning tool for hand-blown (furnace) perfume bottles: body form, neck and closure, stopper, capacity in ml, risk zones, decoration and a process plan. Work in progress.

Try it online: https://billyl0uis.github.io/30dayassignment/flacon/play/

## Run

```
npm install
npm run dev     # http://localhost:5194
npm test
npm run lint
```

`npm run build` writes the built copy to `play/`, which is committed so GitHub Pages can serve it. Rebuild and commit `play/` after changing the source.

The vessel core (profile maths, profile editor, 3D preview, units) is shared with [Finial](../finial/), the lidded jar app: `@core` points at `finial/src/core`, so Finial needs its `src/` present but not its `node_modules`.

## Status

Usable first version, round bodies only:

- Draw the body; the neck is built from the closure's sizes (a placeholder neck until they're filled in). A ground stopper gives a tapered bore; the neck wall is (outside ⌀ − bore) ÷ 2 at each end.
- Closure panel for stopper, cork or hardware, with the stopper's taper, a to-scale stopper drawing, the dauber's reach, and a fit check for hardware against a neck as measured.
- Capacity brimful and at a fill line (ml and US fl oz), and resizing the body to hit a target capacity while the neck and base keep their sizes.
- Glass weight (density editable), heavy-base and thin-neck risk against limits you set, and the process template.
- A views sheet: front, side, top and section on one landscape page at a standard scale, with dimensions and a sizes list, downloadable as SVG (true size) or PNG.
- The design is remembered in this browser.

Not yet: oval cross-sections (the flat oval preset is drawn round, and says so), zooming the profile to the neck, the stopper in 3D, decorative zones on screen, save/open files, and the stopper drawn in place on the views sheet (it has its own detail drawing in the app). The first three need changes to the vessel core in Finial.

## What's here

`src/perfume/model/`:

- `closures.js`: ground glass stopper, cork and commercial hardware. Every size is typed in from your own stopper drawing, cork or supplier spec sheet; nothing has a default. Works out the neck each closure needs and the stopper's taper.
- `capacity.js`: fill line, liquid height for an amount, and target-capacity solving (scale the whole body, only its width, or only its height; the neck stays sized to its closure).
- `risks.js`: heavy base and thin neck, flagged only against limits you set.
- `zones.js`: colour, cane/murrini and surface bands, with an empty hook for Before The Heat.
- `process.js`: a starting process plan for body, neck and stopper, marked as a template.
- `bottle.js`: the body plus the neck the closure asks for, as one profile for the core.
- `sheet/views.js`: what each flat view is made of (the outline, the circles seen from above, the widest point and narrowest bore); `sheet/ViewsSheet.jsx` lays them out in third-angle projection.
- `presets.js`: classic round flacon, flat oval, tall column, tiny sample bottle, as starting sketches.

Lengths are mm and volumes ml throughout, as in the vessel core.
