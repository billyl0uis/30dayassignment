# Armature

Build a sculpture from a metal frame and glass parts, then see whether it would hold together. For glass and metal students.

**[Play it online](https://billyl0uis.github.io/30dayassignment/armature/play/)** · Estimates for planning — not an engineering sign-off.

```bash
npm install
npm run dev     # http://localhost:5214
npm run build   # writes the playable site to play/ for GitHub Pages
npm test        # vitest: hand-calc weight/COM, presets, blow + capture, checks
```

## What's where

| File | What it does |
|---|---|
| `src/config/materials.ts` | The only place physical constants live (density, expansion), with sources |
| `src/model/types.ts` | Sculpture = nodes + rods + panels + cages + glass parts + joins + settings |
| `src/model/frame.ts` | Node/rod editing, the bend arc, the cage generator |
| `src/model/io.ts` | JSON import/export with plain-language errors |
| `src/physics/glass.ts` | Glass volumes, thickness, the lat/lon grid for blown shells |
| `src/physics/mass.ts` | Weight and centre of mass |
| `src/physics/blow.ts` | Inflating into a cage, cage openings, the capture test |
| `src/physics/checks.ts` | The six checks plus capture, each with a one-sentence reason |
| `src/presets.ts` | The four demo sculptures |
| `src/scene/view.ts`, `src/ui/app.ts` | Three.js scene; tools, inspector, readouts, blow bar |

## Using it

- **Tools:** Select (V), Node (N), Rod (R), Bend (B), Panel (P). Shift-drag moves things up and down. ⌘Z undoes. F frames the view.
- **Blowing:** select a blown part that sits inside a generated cage, then hold **Blow** or the space bar. When you let go, the part's join becomes a cage capture and the capture check runs.
- **Settings:** every threshold is in the Check settings drawer. They are adjustable settings, not physical laws.

## How the blow works

For each direction out of the bubble's centre, the app works out the angle θ to the nearest wire and how far out that wire is (ρ). Both are computed once per blow. As the free radius R grows, the glass radius is `softmin(R, ρ + β·ρ·θ)`. On a wire it stops at the wire. Between wires it can push out by up to β × the distance to the nearest wire, so wider gaps make bigger pillows. Glass volume is held constant, so the wall thins as the bubble grows, and the blow stops at a 1 mm wall.

Capture means the glass's silhouette is wider than every opening in the cage: each cell between ribs and rings, plus the two end rings.
