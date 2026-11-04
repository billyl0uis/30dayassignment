# Hot Shop Atlas

A free map and directory of glass studios in the United States: hot shops first, plus flameworking, kiln / warm glass, and neon.

This is Phase 1: a static site. There's no database and no build step, and every studio lives in `studios.json`.

## Run it locally

Browsers won't let a page opened straight from disk (`file://…`) read `studios.json`, so you need a tiny local server. Python is already on your Mac:

```bash
cd hot-shop-atlas
python3 -m http.server 5198
```

Then open <http://localhost:5198>. Refresh the page after editing `studios.json`.

## Add or edit a studio

`studios.json` is a list (`[ … ]`) of studios separated by commas. Here is one entry, with made-up example values to show the format:

```json
{
  "id": "example-glass-co",
  "name": "Example Glass Co.",
  "type": "hot_shop",
  "access": "public_rental",
  "city": "Exampleton",
  "state": "NY",
  "address": "123 Example St",
  "lat": 40.7128,
  "lng": -74.006,
  "location_precision": "exact",
  "website": "https://example.com",
  "instagram": "@example",
  "shop_url": "",
  "other_links": [{ "label": "Portfolio", "url": "https://example.com/work" }],
  "offers": ["rentals", "glory_hole_rental", "classes"],
  "description": "One or two sentences.",
  "founded": "",
  "last_verified": "2026-11-04",
  "source": "Verified by Bailey, phone call"
}
```

Leave any field you don't know as `""` (or `[]` for lists). Don't guess.

### Required fields

`id`, `name`, `type`, `lat`, `lng`. If one of these is missing or wrong, the site skips that entry and shows a note at the top of the list. The browser console (right-click, Inspect, Console) says exactly which entry and why.

### Allowed values

These are short codes rather than the display labels, so a typo or a missing em dash can't break anything.

| Field | Codes (what visitors see) |
|---|---|
| `type` | `hot_shop` (Hot shop), `flameworking`, `kiln` (Kiln / warm glass), `neon`, `mixed` |
| `access` | `public_rental`, `classes`, `open_visits` (Open studio visits), `private_appointment` (Private — by appointment), `private_closed` (Private — closed) |
| `offers` | `rentals`, `classes`, `glory_hole_rental`, `gallery`, `residencies`, `assistant_positions` (TA / assistant positions) |
| `location_precision` | `exact` or `city` |

### The `id`

Use lowercase letters, numbers, and dashes, like `brooklyn-glass`. It becomes the share link, `…/?studio=brooklyn-glass`, so **don't change it** once you've shared that link. Every `id` has to be unique.

### Getting lat / lng

Search the address on [openstreetmap.org](https://www.openstreetmap.org), right-click the spot, and choose "Show address". The URL shows the coordinates. Look up one address at a time by hand. That stays within OSM's usage policy.

### Privacy: home studios

Leave out `location_precision` (or set it to `"city"`) and the site will:

- show a dashed "approximate" pin
- hide the street address
- round the coordinates to about 1 km

For private studios, use the city's center as `lat`/`lng`. The rounding is only a safety net in case exact coordinates get pasted in by mistake. Use `"exact"` only for public studios, or when the owner has asked for an exact pin.

### Links, not images

"See their work" is outbound links only: `website`, `instagram` (a handle or full URL), `shop_url`, and `other_links`. The site never loads images from studio sites. Links that aren't `http(s)` are dropped.

## Deploy for free (GitHub Pages)

The folder is plain files, so it works as-is.

1. Push the repo to GitHub.
2. Go to **Settings → Pages**, choose **Deploy from a branch**, pick `main` and `/ (root)`, and save.
3. The map will be at `https://<your-username>.github.io/<repo>/hot-shop-atlas/`.

Netlify also works: drag the `hot-shop-atlas` folder onto <https://app.netlify.com/drop>.

## What it uses

- [Leaflet](https://leafletjs.com) and [Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster), loaded from unpkg
- [OpenStreetMap](https://www.openstreetmap.org/copyright) tiles, free with no key. Keep the attribution visible. The dark look is a CSS filter (`.leaflet-tile-pane` in `style.css`). Delete that line for the normal light map.
- "Near me" asks for your location only when you click it. The location stays in the page and is never saved or sent anywhere.

## Files

| File | What's in it |
|---|---|
| `index.html` | Page layout |
| `style.css` | Look, plus the phone bottom-sheet layout |
| `app.js` | Loading and checking data, map, filters, list, detail card, share links, Near me |
| `studios.json` | The data. The only file you need to edit. |

## Next (not built yet)

Phase 2 is submissions: a form, a pending queue, "correct this listing", and "report closed". Phase 3 ideas are a rental-time mode, a featured studio, events, and CSV export.
