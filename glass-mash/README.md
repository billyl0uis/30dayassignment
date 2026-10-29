# Glass Mash

A sketchbook for glass forms: draw a shape flat, and it becomes a 3D glass object you can spin around. Built to grow into mash-ups, melting, sculpting and mutation.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:5180.

## Step 1 (this build)

- Drawing page with a **brush** (one loop, closes itself) and a **pen** (click points; click the first point, double-click or press Enter to close).
- Scribbles that cross themselves are merged into one silhouette.
- **Inflate** mode with Inflation and Detail sliders, updating live.
- Glass material: tint swatches or a custom colour, colour depth, frost, refraction, transparent or opaque.
- Black, white and gallery backgrounds; turntable spin.
- Undo / redo (⌘Z, ⇧⌘Z). Shortcuts: B brush, P pen.

## Joining pieces (step 3)

- **+ New** (N) starts a new piece; draw it on the page. **Duplicate** copies the selected one.
- Every piece has a join mode: **Melt** fuses it into the mash, **Carve** cuts its shape out, **Overlap** keeps only where it overlaps, **Solo** keeps it separate.
- **Melt** slider: 0 is a hard seam, higher slumps the pieces together like hot glass.
- Click a piece (or its part of the mash) to select it. **Move / Turn / Size** (W / E / R) switch the handles.
- The mash is one piece of glass and takes the first melted piece's colour.

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
