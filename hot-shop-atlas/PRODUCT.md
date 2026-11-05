# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Static HTML/CSS/JS, no build step. Leaflet 1.9.4 + Leaflet.markercluster 1.5.3 from unpkg, OpenStreetMap tiles (free, no key; attribution must stay visible). Data in `studios.json`. Deployed to GitHub Pages so classmates can open it from a public link.

## Users

Both equally:
- Working glassblowers looking for a hot shop to rent bench time or take an advanced class, near home or while traveling.
- Curious beginners looking for a first class or a place to watch glassblowing.

The owner is a glassblower and art student (Bailey). Classmates will view it from a shared link, and it may go in an art-school portfolio.

## Product Purpose

A free, interactive map and searchable directory of US glass studios: hot shops first, with flameworking, kiln and neon as secondary types. Success means someone can find a real, currently open studio near them and reach its website in a few taps.

## Positioning

Every published listing has been checked against the studio's own website, with a real address and a matching map pin. Nothing is scraped and no images are taken from studio sites. The owner, a working glassblower, approves every entry.

## Operating Context

- Used on a laptop to plan, and on a phone outdoors or while traveling.
- Map, list and detail card stay in sync. The `?studio=id` share links must keep working.
- "Near me" asks for location only when clicked.

## Capabilities and Constraints

- Filters: type, state, access, offers. Sort by name, state or distance.
- Studio types: hot shop, flameworking, kiln / warm glass, neon, mixed.
- Private or home studios show at city level, with a dashed "approximate" pin, unless the owner opts in to an exact pin.
- "See their work" is outbound links only. Images only if a submitter uploads one they own (Phase 2, not built).
- Never invent studios, addresses, URLs or details. Unknown fields stay blank.
- Submissions (Phase 2) go to a pending queue, never live automatically.

## Evidence on Hand

- `studios.json`: 45 published hot shops (as of 2026-11-05).
- `candidates.json` / `REVIEW.md`: the review queue, from the Glass Art Society lists and regional sources.
- No studio photos, logos or testimonials. Don't fabricate any.

## Product Principles

1. Trust over size: a smaller verified map beats a big, stale one.
2. Get people to the studio. The studio's own site is the destination, not this one.
3. Respect privacy and studio owners: no exact pins for home studios, no scraped images.
4. Works where people are: legible and tappable on a phone outdoors.

## Accessibility & Inclusion

High contrast, readable outdoors in sunlight, large tap targets on phones. Type colors must not be the only way to tell studio types apart.
