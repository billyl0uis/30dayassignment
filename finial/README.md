# Finial

A planning tool for hand-blown (furnace) lidded jars, named after the knob on top of a lid. Draw the half-profile of the body and the lid, set wall thickness, check the lid fit, capacity and glass weight, and print a one-page shop sheet to take to the bench.

Work in progress, built milestone by milestone.

## Run

```
npm install
npm run dev     # http://localhost:5193
npm test
npm run lint
```

Vite + React + Tailwind + three.js, the same stack as Before The Heat.

## Layout

- `src/core/` — the **vessel core**, meant to be reused by a later perfume bottle app: profile maths, units, 3D preview, save/load. It never imports from `src/jar/`, and `core/model` is plain JavaScript; `src/core/architecture.test.js` checks both.
- `src/jar/` — everything specific to lidded jars: lid fit, colour zones, process plan, presets, shop sheet.

## Units

Every length is stored in mm and every volume in ml. The mm / in switch only changes how numbers are shown and typed. Inch fields take `3`, `3.25`, `3 1/4` or `3-1/4`; add `mm`, `cm` or `in` to type in other units. Fluid ounces are US.
