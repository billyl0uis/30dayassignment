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

## Layout

| Folder | What it holds |
|---|---|
| `src/draw/` | Drawing page and stroke cleanup |
| `src/geom2d/` | Polygon maths and the raster fallback for tangled strokes |
| `src/modes/` | One folder per 2D→3D mode, plus `registry.ts`. Add a mode by writing a `ModeDef` and listing it there. |
| `src/render/` | Three.js stage, studio lighting, glass material |
| `src/scene/` | The store: pieces, settings, undo history |
| `src/ui/` | Inspector panel and sliders |
