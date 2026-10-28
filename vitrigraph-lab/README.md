# Vitrigraph Lab

A small learning game about vitrigraph kiln work, built as a bonus module for the murrini and cane design app *Before The Heat*. A vitrigraph is a kiln with a hole in its floor. A pot with a hole in its bottom sits above it, loaded with glass. When the glass gets hot enough it flows out, and you pull it by hand into stringer, cane, ribbon or coils. The point is to learn cause and effect before a real pull.

Everything runs on a **simplified model**. Every number is a placeholder to verify (`js/config.js`), and every guess about how glass really behaves is written down in [KNOWN_UNCERTAINTIES.md](KNOWN_UNCERTAINTIES.md).

## How to play

Open `index.html` in a browser. It works straight from disk; no server is needed.

1. **Load.** Pick a form (chunks, frit, scrap), a color and its COE, then tap or drag in the pot. The side view is one slice through the pot (L and R). The round view is one layer from above. The brush fills a whole ring, half of one, or a single wedge. Stacking layers changes the color along the length. Rings and wedges set the cross-section pattern. Mixing COEs shows a warning.
2. **Heat.** Set the kiln and run the clock, or skip ahead. The glass lags behind the kiln air. The flow meter shows a relative band (stiff, taffy, honey, runny), never a viscosity number. Once a gob forms, the clock slows to seconds. Leave the gob too long and it drops.
3. **Pull.** Press on the gob, then drag away from it. Pull speed and heat set the diameter, and pulling faster than the glass can stretch tears it. Drag in circles to coil it. Turn on twist, or use the steady-pull slider instead of dragging.
4. **Result.** The pulled length (thickness exaggerated), with tears marked. Tap the strand to chop it and see each cross-section slice as murrini. A one- or two-sentence debrief explains why it came out that way.

The challenges unlock in order: an even stringer, a color change along the length, a cobalt core inside an opal white casing, and a recipe match where you work out the loading from a finished slice.

## Embedding in Before The Heat

Load the files in the same order as `index.html`, then call:

```js
VitrigraphLab.mount(containerElement, { embedded: true });
```

All styles are scoped under `.vg-lab`. The safety card doesn't open on its own when the module is embedded; the host can call `VitrigraphLab.safety.show(app)`.

## Files

| File | What it does |
|---|---|
| `js/config.js` | Every temperature, size, rate, color and COE. **Placeholders to verify.** |
| `js/model.js` | Pure flow model: flow index, kiln step, melt and drain, slices, output rate, diameter. No DOM. |
| `js/draw.js` | Shared canvas drawing: pot cross-section, top view, cane slice. |
| `js/app.js` | Shell, stage machine, `mount()`. |
| `js/pot.js` · `kiln.js` · `pull.js` · `result.js` | The four stages. |
| `js/challenges.js` | Challenge goals, targets, scoring and unlocks. |
| `js/debrief.js` | Cause-and-effect findings and the pick of which ones to show. |
| `js/safety.js` | Safety card. |
| `css/vitrigraph.css` | Styles, scoped to `.vg-lab`. |
