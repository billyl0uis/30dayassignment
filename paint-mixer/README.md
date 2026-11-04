# Paint Mixer

**[Open it](https://billyl0uis.github.io/30dayassignment/paint-mixer/)**

Tells a painter how to mix a target color using only the opaque paints they own (oil, acrylic, gouache). Everything runs in the browser: no account, no server, and photos never leave the device.

1. **Paints:** build a palette from a library of 277 paints, or add your own, then photograph a swatch sheet so the app measures your actual paints (with white balance and a tinting-strength fit from a 1:1 tint with white).
2. **Reference:** load a photo, tap any spot with a magnifier, or pick from its main colors.
3. **Mix:** get recipes in whole parts from 1–4 of your paints, then photograph your mix and get told how to fix it ("a little lighter, add 1 part Titanium White").

Mixing is predicted with [spectral.js](https://github.com/rvanwijnen/spectral.js) (Kubelka–Munk), never by averaging RGB, and color difference is CIEDE2000, tested against the Sharma (2005) reference pairs.

On iPhone: open it in Safari, tap Share, then **Add to Home Screen**. It then opens full screen and works offline.

## Run it locally

ES modules and Web Workers don't load from `file://`, so use a local server:

```
python3 -m http.server 8000
```

Then open http://localhost:8000. Tests: `node --test tests/` (65 tests), or open `tests/run.html` in the browser.

Predictions are a starting point; brands, batches, screens and lighting all vary.
