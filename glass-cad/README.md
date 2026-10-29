# Glass CAD

Part CAD, part playground for glass: pick shape presets, size them exactly in inches or centimetres, and see them rendered as glass in 3D. Working name.

**Play it online:** https://billyl0uis.github.io/30dayassignment/glass-cad/play/

Designs are saved in your own browser. Use **File → Save design file** to keep a copy or move a design to another computer.

## Run it

```bash
npm install
npm run dev     # http://localhost:5191
npm test        # dimension and volume math
npm run build -- --base ./ --outDir play   # rebuild the copy GitHub Pages serves
```

## Where things live

| Folder | What's in it |
|---|---|
| `src/model` | The design document (plain JSON, millimetres, Y up), unit conversion, and feature-tree edits |
| `src/presets` | Parametric presets (basic, glass, organic, custom drawings). Each one returns a `Section`, not a mesh |
| `src/geometry` | Profiles, volumes, bounds, mesh building, drag-handle math and distance functions. No React |
| `src/engine` | Replays the op list into bodies, caching geometry; `csg.ts` wraps manifold-3d, `combine.ts` does booleans and shells |
| `src/store` | Zustand store with undo/redo and autosave |
| `src/viewport` | three.js scene: glass material, light-panel studio, grid floor |
| `src/panels` | Shape palette, feature tree, inspector, shop info and sheet, drawing editor |
| `src/files` | Import, export, design files and the shop sheet's orthographic views |

## Status

All six steps are in:

1. Basic presets with exact sizes in inches or centimetres, and a glass preview.
2. Stacks, radial and linear arrays, a feature tree with undo/redo, a move/rotate/scale gizmo with snapping, drag handles, and a designs menu.
3. Booleans (union, subtract, intersect) through manifold-3d, and shell with an even wall and an opening.
4. Melt: parts fused with smooth fillets.
5. Glass parts, organic shapes, and hand-drawn parts (revolve, extrude, inflate) saved to My Parts.
6. Deform (pinch, ribs, twist, sag, bend, lumpiness, plus "Try a variation"); glass finishes (optic, twist, frit, frosted, iridescent); backgrounds, turntable and PNG export; a notes checklist and a printable shop sheet with measured front, side and top views; design files (.json); STL, OBJ and GLB export; STL and OBJ import.

Order matters in the tree the way it does at the bench: shell and melt need to come before a deform, and imported meshes can be cut and deformed but not shelled or melted.

Keys: W / E / R move, rotate, scale · ⌘D duplicate · ⌘Z / ⇧⌘Z undo, redo · Delete removes the selection · ⇧-click to select several · click a part again to select its stack or array.
