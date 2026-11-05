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
  "no": 46,
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

### The chart number (`no`)

Each studio has a permanent number that makes its chart code, like **HS-032** (type prefix plus number). Give a new studio the next unused number (the highest `no` in the file, plus one). Never renumber or reuse one, so codes people have seen stay true. Type prefixes: HS hot shop, FW flameworking, KG kiln, NE neon, MX mixed.

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

## Reviewing candidates (`candidates.json`)

`candidates.json` holds studios from two Glass Art Society lists and a few regional sources. **The site doesn't load this file.** None of these studios appear on the map until you move them over.

- The [public access studios list](https://www.glassart.org/resources/in-the-community/public-access-studios/), read on 2026-11-04: 73 US studios, 34 of them published so far.
- The ["Everything Else" schools + programs list](https://www.glassart.org/resources/students/schools-programs/everything-else/), read on 2026-11-05: 142 US entries. 42 were already on the map or in the queue, so 100 were added, and 11 of those are published so far. This list is broader: it includes colleges, suppliers, and kiln, mosaic and stained-glass programs. It gives only name, state, and website.
- Regional sources, read on 2026-11-05: 17 studios with name, town and state only (no websites, apart from two). 5 are published so far, after their own websites were found and checked. 9 come from [VisitNC's glassblowing list](https://www.visitnc.com/list/nc-glassblowing-studios-will-blow-your-mind) and 3 from the [Indiana Glass Trail](https://indianaglasstrail.com/locations/), which also lists museums, factories and individual artists that were left out. 5 are hot shops named in search results, which still need their own websites found. These entries have `regional_original` instead of `gas_original`.

glassblower.info was considered and **not used**: its robots.txt blocks AI crawlers, including Claude, so its listings aren't collected here.

What GAS gave us is name, state, a website, and (public access list only) whether the studio rents and has public classes. Everything else is blank on purpose: `type`, `city`, `lat`/`lng`, and `last_verified`. Each entry also has two extra fields:

- `review_notes`: problems already spotted in the GAS data, for example the Corning entry that links to UrbanGlass's website, or a supplier listed as a program.
- `gas_original`: exactly what the GAS row said, so you can always see what came from them.

To publish a studio:

1. Check its website. Is it still open? Is it really a hot shop? Does it still rent and teach?
2. Copy the entry from `candidates.json` into `studios.json`.
3. Fill in `type`, `city`, and `lat`/`lng`. Set `location_precision` to `"exact"` if it's a public studio at a known address.
4. Fix anything you found, set `last_verified` to today, and change `source` to something like `"GAS list; checked website, Bailey"`.
5. Delete the `review_notes` and `gas_original` lines. They're only for review.
6. Delete the entry from `candidates.json`, so you know it's done.

Keep the GAS credit in each studio's `source`. It's courteous to email GAS (contact details are on their page) to say you're using their list as a starting point.

## Deploy for free (GitHub Pages)

The folder is plain files, so it works as-is.

1. Push the repo to GitHub.
2. Go to **Settings → Pages**, choose **Deploy from a branch**, pick `main` and `/ (root)`, and save.
3. The map will be at `https://<your-username>.github.io/<repo>/hot-shop-atlas/`.

Netlify also works: drag the `hot-shop-atlas` folder onto <https://app.netlify.com/drop>.

## What it uses

- [Leaflet](https://leafletjs.com) and [Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster), loaded from unpkg
- [OpenStreetMap](https://www.openstreetmap.org/copyright) tiles, free with no key. Keep the attribution visible. The tiles are partly desaturated in CSS (`.leaflet-tile-pane` in `style.css`) so the studio colours carry the meaning.
- Fonts from Google Fonts: Schibsted Grotesk for text, Chivo Mono for codes and counts.

## The look, and trying other options

The design is a glass colour-bar chart: every studio is a numbered swatch, and each studio type has its own colour. The full system is written up in `DESIGN.md`.

Add `?tweak` to the address (for example `http://localhost:5198/?tweak`) to get a **Tweaks** button on the map. It switches six parts of the design live: rod colours, heading font, row size, swatch finish, base map, and pin label. Your choices are remembered only in your own browser. To make a choice the default for everyone, change the matching `data-…` value on the `<html>` tag at the top of `index.html`. Visitors without `?tweak` never see the panel.
- "Near me" asks for your location only when you click it. The location stays in the page and is never saved or sent anywhere.

## Files

| File | What's in it |
|---|---|
| `index.html` | Page layout |
| `style.css` | Look, the design options, and the phone bottom-sheet layout |
| `app.js` | Loading and checking data, map, filters, list, detail card, share links, Near me |
| `tweaks.js` | The `?tweak` design-options panel |
| `PRODUCT.md` / `DESIGN.md` | Who the site is for and what it must do; the visual system |
| `studios.json` | The data. The only file you need to edit. |
| `candidates.json` | Unverified studios from the GAS list, waiting for review. The site doesn't load it. Each entry has a `first_pass` block: a status (`ready`, `needs_you`, `not_checked` or `likely_closed`), plus the city, address, coordinates, suggested type, and what the studio's own site said. |
| `REVIEW.md` | A readable table of every candidate's status, with the reason for each "needs you". |

## Next (not built yet)

Phase 2 is submissions: a form, a pending queue, "correct this listing", and "report closed". Phase 3 ideas are a rental-time mode, a featured studio, events, and CSV export.
