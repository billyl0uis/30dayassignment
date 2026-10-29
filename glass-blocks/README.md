# Glass Blocks

Build glass objects out of shape presets and see them rendered as glass in 3D. Pick a shape and it stacks on the center axis, the way a piece goes together at the bench: foot → stem → bubble → neck → lip. Drag dots to stretch, squash and taper. Turn any part free to stick it anywhere.

**Play it online:** https://billyl0uis.github.io/30dayassignment/glass-blocks/play/

## How to use

To run it on your own computer:

```
npm install
npm run dev
```

Then open http://localhost:5181. After changing the code, run `npm run build` to update the online copy in `play/`.

- **Add:** click a shape on the left. It goes on top of the selected part, or on top of the stack.
- **Shape it:** select a part and drag its dots. Orange (top) sets height, blue (side) sets width, pink (high) tapers or flares. Or type in the panel: `3 1/2`, `3.5`, or `9cm` all work, whatever units are showing.
- **Free placement:** switch a part from *On the axis* to *Free* to move, rotate or scale it with the gizmo.
- **Glass:** per-part color, transparent or opaque, frost, iridescence. Colored transparent glass gets deeper where it's thicker, as real glass does.
- Turntable, dark and light studio, inches or cm, PNG export. ⌘Z / ⇧⌘Z undo and redo, Delete removes, Esc deselects. Your design autosaves in the browser. *Save* and *Open* use a `.json` file.

## How it's built

Vite + React + [three.js](https://threejs.org/) through react-three-fiber.

- `src/geometry/`: no React. `presets.js` is the shape catalog: most shapes are a side profile spun on a lathe, and the torus, coil, horn and tooth have their own generators in `build.js`. Every mesh carries its volume, for the weight estimate later.
- `src/model/`: the design is an ordered list of steps (`steps.js`), and the parts on screen are those steps replayed. Undo and redo move a cursor through that list. `layout.js` decides where stacked parts sit.
- `src/scene/`: the canvas, glass material, drag handles, gizmo and turntable.
- `src/ui/`: the shape shelf, part panel, stack list and toolbar.

Still to come: melt (signed distance fields + marching cubes), carve, hollow, draw-your-own shapes, STL/OBJ/GLB export, and a weight estimate.
