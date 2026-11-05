# Glass Mash

A sketchbook for glass forms: draw a shape flat, and it becomes a 3D glass object you can spin around. Built to grow into mash-ups, melting, sculpting and mutation.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:5180.

Play it online: https://billyl0uis.github.io/30dayassignment/glass-mash/play/

`npm run build` writes the built copy to `play/`, which is committed so GitHub Pages can serve it. Rebuild and commit `play/` after changing the source.

## Using it

1. **Draw a shape** on the page with the brush (one loop, let go) or the pen (click points, click the first point again or press Enter). It becomes glass on the right.
2. **Draw another.** Every shape is added as a new piece, placed overlapping the last one so they melt together. The page keeps a faint trace of your last shape for scale.
3. **Click a piece** in 3D to select it. The bar under the 3D view has everything for that piece:
   - **Move / Turn / Size** (W / E / R) switch the handles
   - **Melt in** fuses it with the others, **Cut out** uses it to carve a hole, **Keep apart** leaves it separate
   - **Copy / Delete**
4. The side panel holds **Inflation** (for the selected piece), **Gooeyness** (how much melted pieces slump together), **Glass** colour and frost, and the background.

Undo / redo: ⌘Z, ⇧⌘Z. **Start over** removes every piece (undoable). Melted pieces are one piece of glass and share one colour.

How it works: each piece becomes a distance field (how far every point is from its surface), the fields are combined with a smooth minimum, and the result is meshed again with surface nets. While you drag, the mash drops to draft quality, then sharpens when you let go.

## Layout

| Folder | What it holds |
|---|---|
| `src/draw/` | Drawing page and stroke cleanup |
| `src/geom2d/` | Polygon maths and the raster fallback for tangled strokes |
| `src/modes/` | One folder per 2D→3D mode, plus `registry.ts`. Add a mode by writing a `ModeDef` and listing it there. |
| `src/sdf/` | Distance fields: mesh → field, smooth union / carve / overlap, surface-nets meshing, the mash builder |
| `src/render/` | Three.js stage, studio lighting, glass material |
| `src/scene/` | The store: pieces, settings, undo history |
| `src/ui/` | Inspector panel and sliders |
