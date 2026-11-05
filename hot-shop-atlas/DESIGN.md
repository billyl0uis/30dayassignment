---
name: Hot Shop Atlas
description: A US glass-studio directory printed as a colour-rod chart; every studio is a coded swatch.
colors:
  rod-hot: "#e4572e"
  rod-flame: "#0f7fa8"
  rod-kiln: "#7a3fa0"
  rod-neon: "#f2b705"
  rod-mixed: "#4f8a3c"
  chart-white: "#fbfbf8"
  chart-grey: "#f1f1ec"
  field-white: "#ffffff"
  ink: "#14130f"
  ink-soft: "#4a4840"
  chalk: "#cfcdc4"
  hairline: "#d9d8d0"
  status-yellow: "#fff4c2"
typography:
  display:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "34px"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 900
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16.5px"
    fontWeight: 800
    lineHeight: 1.2
  body:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
  code:
    fontFamily: "Chivo Mono, ui-monospace, SF Mono, Menlo, monospace"
    fontSize: "14px"
    fontWeight: 700
    fontFeature: "tnum"
  code-small:
    fontFamily: "Chivo Mono, ui-monospace, SF Mono, Menlo, monospace"
    fontSize: "12px"
    fontWeight: 500
    fontFeature: "tnum"
rounded:
  none: "0px"
spacing:
  gap: "8px"
  cell: "16px"
  gutter: "24px"
  gutter-phone: "16px"
  swatch: "72px"
  code-cell: "92px"
  column: "520px"
components:
  button-ink:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.field-white}"
    rounded: "{rounded.none}"
    padding: "10px 14px"
    typography: "{typography.label}"
  button-ink-hover:
    backgroundColor: "#33312a"
    textColor: "{colors.field-white}"
  button-ink-on:
    backgroundColor: "{colors.rod-flame}"
    textColor: "{colors.field-white}"
  button-plain:
    backgroundColor: "{colors.field-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "10px 14px"
  button-plain-hover:
    backgroundColor: "{colors.chart-grey}"
  input-search:
    backgroundColor: "{colors.field-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "10px 12px"
  chip:
    backgroundColor: "{colors.field-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "5px 10px"
  chip-pressed:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.field-white}"
  family-tab:
    backgroundColor: "{colors.chart-white}"
    textColor: "{colors.ink}"
    padding: "18px 4px 10px"
  family-tab-pressed:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.field-white}"
  chart-row:
    backgroundColor: "{colors.chart-white}"
    textColor: "{colors.ink}"
    height: "68px"
  detail-band:
    height: "112px"
    rounded: "{rounded.none}"
  map-pin:
    textColor: "{colors.ink}"
    width: "42px"
    height: "24px"
    typography: "{typography.code-small}"
  map-cluster:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.field-white}"
    size: "40px"
---

# Design System: Hot Shop Atlas

## Overview

**Creative North Star: "The Colour-Rod Chart"**

The directory is printed like a glass manufacturer's rod chart (the Reichenbach or Kugler bar card a glassblower keeps by the bench). Every studio is a flat, coded swatch on chart-white paper, ruled off from its neighbours with 1px ink lines. A working glassblower should read it the way they read a colour chart: family colour first, code second, name third. It deliberately refuses the default finder of rounded result cards floating beside a map.

The surface is dense, flat and square. Hierarchy comes from weight, ink rules and colour fields rather than containers or elevation. Type is a single grotesque at heavy weights for names, with a mono reserved for anything that is counted or coded (chart numbers, totals, distances, URLs). The base map is quietened to grey so the five rod colours are the only saturated thing on screen. Motion is short and purposeful: the signature is a colour flood across the chosen row.

The shipped default is the set of `data-*` values on `<html>`: Chart palette, Schibsted headings, Regular rows, Chip swatches, Soft-grey map, type-code pins. A developer-only options panel (`?tweak`) can switch to the sanctioned variants listed in the sidecar; visitors never see it.

**Key Characteristics:**
- Chart-white ground, ink text, 1px ink rules between every band and row.
- Five rod colours, one per studio family, carried by swatches, bands, pins and the family filter.
- Every colour is paired with a text code (HS, FW, KG, NE, MX, and HS-027 style chart numbers).
- Square corners everywhere; no cards, no radius.
- Schibsted Grotesk for words, Chivo Mono for codes and counts.
- Desaturated base map; colour lives on the swatches, not the tiles.

## Colors

A paper-and-ink chart with five saturated rod colours used strictly as family identifiers.

### Primary
- **Hot Shop Orange** (rod-hot): hot-shop studios, the core of the atlas. Swatch, band, pin and family-tab cap. Ink text sits on it.
- **Flame Teal-Blue** (rod-flame): flameworking studios. White text sits on it. Also the one non-family use: the "Near me" button when distance sorting is on.
- **Kiln Violet** (rod-kiln): kiln and warm-glass studios. White text sits on it.
- **Neon Amber** (rod-neon): neon studios. Ink text always. Also the text-selection highlight.
- **Mixed Green** (rod-mixed): mixed-practice studios. Ink text sits on it.

### Neutral
- **Chart White** (chart-white): the page, the column, rows at rest, the inset margin of a chip swatch, the code tag on a band. Also the theme colour.
- **Chart Grey** (chart-grey): hover fill for plain buttons and nav, and the map backdrop behind tiles.
- **Field White** (field-white): inputs, selects, chips and plain buttons, so fillable things read as cut-out from the paper; also text on ink and on dark rods.
- **Ink** (ink): all body text, every rule and border, the primary button, pressed states, the selected-row outline and the focus ring.
- **Soft Ink** (ink-soft): secondary text (city and access lines, labels, spec terms, fine print, attribution).
- **Chalk** (chalk): muted text on ink surfaces (the family count on a pressed tab, the URL on the Visit website bar).
- **Hairline** (hairline): the only rule lighter than ink; separates rows inside the detail spec table.
- **Status Yellow** (status-yellow): the status strip ("Location permission was declined", distance notes). Nothing else.

### Named Rules
**The Rods Are Families Rule.** The five rod colours mean studio type and nothing else (the two documented exceptions are the active Near me button and text selection). Never use a rod colour for decoration, emphasis or brand.

**The Code Carries Type Rule.** A rod colour never appears without its text code nearby: swatch beside a chart number, pin carrying HS/FW/KG/NE/MX, band carrying its HS-032 tag, family tab carrying its code and count. Colour must never be the only way to tell types apart.

**The Quiet Map Rule.** Map tiles are filtered to grey (grayscale 0.7, slight contrast and brightness lift) so the pins are the only saturated marks on the map.

## Typography

**Display Font:** Schibsted Grotesk (with ui-sans-serif, system-ui)
**Body Font:** Schibsted Grotesk
**Label/Mono Font:** Chivo Mono (with ui-monospace, SF Mono, Menlo), weights 500 and 700 only

**Character:** One sturdy grotesque doing everything with words, pushed to 800-900 for names so they print like chart headings; a typewriter-ish mono for the numbers, like the codes stamped on a manufacturer's bar card.

### Hierarchy
- **Display** (900, 34px, line-height 1, -0.025em): the "Hot Shop Atlas" wordmark only. 22px on phones.
- **Headline** (900, 28px, line-height 1.1, -0.02em, balanced wrap): the studio name in the detail view.
- **Title** (800, 16.5px, line-height 1.2): studio names in chart rows (15.5px on phones). Link rows in the detail use 800 at 16px.
- **Body** (400, 15px, line-height 1.4): default text; descriptions capped at 62ch.
- **Label** (600, 13px): filter labels, sort, spec terms, chips, status. Family tabs and the More filters summary run 700 at 13-14px.
- **Code** (Chivo Mono 700, 14px, tabular figures): chart numbers in rows; 15px on the band tag; 13px for counts and distances; 12px in pins.
- **Code Small** (Chivo Mono 500, 12-13px): family counts on tabs, URLs on link rows.

### Named Rules
**The Mono Is For Numbers Rule.** Chivo Mono sets only codes, counts, distances and URLs. Names, labels and prose are always Schibsted.

**The No Uppercase Rule.** Labels are sentence case at 600-700 weight; the build uses no letter-spaced uppercase labels.

## Layout

A two-pane chart at desktop: a fixed 520px left column (the directory) and the map filling the rest, the app occupying exactly the dynamic viewport height. The column is a vertical stack of full-width bands, each closed by a 1px ink rule: brand, search row, the five-family strip, More filters, list head, then the scrolling chart rows. Horizontal gutter is 24px inside the column.

A chart row is a four-cell grid: 72px swatch, 92px code cell, the name-over-meta text cell, and an optional distance cell; minimum height 68px; cells divided by ink rules. The detail view replaces the list in the same column: a nav bar (All studios, Prev, Next), a 112px colour band, then a body with a two-column spec table (110px terms).

Below 760px the column becomes a bottom sheet over a full-screen map, with three heights (peek 176px, half 52dvh, full 90dvh) toggled by a bar handle, a 16px gutter, a 44px swatch and 78px code cell in rows, 60px minimum row height, and 44px minimum chip height for outdoor tapping. Inputs and selects go to 16px text on phones to prevent zoom.

Rhythm is tight and mostly 8/12/14/16/24px; density comes from rules, not whitespace.

## Elevation & Depth

The chart itself is flat: paper, ink rules and colour fields, no shadows on any directory surface. Depth appears only on things that float over the map, where it separates marks from busy tiles.

### Shadow Vocabulary
- **Pin lift** (`box-shadow: 0 2px 4px rgba(20, 19, 15, 0.35)`): map pins.
- **Cluster lift** (`box-shadow: 0 2px 6px rgba(20, 19, 15, 0.35)`): cluster markers.
- **Sheet lift** (`box-shadow: 0 -6px 24px rgba(20, 19, 15, 0.18)`): the phone bottom sheet over the map.

### Named Rules
**The Flat Chart Rule.** Nothing in the directory column casts a shadow. Shadows belong only to marks and sheets that sit over the map.

## Shapes

Every corner is square (0px), including inputs, selects, chips, buttons, pins, clusters and Leaflet's own zoom controls, which are overridden to match. Form is drawn with 1px ink rules (1.5px on pins, 1.5px on the sheet's top edge). Selection is a 3px ink outline drawn inside the row; focus is a 3px ink outline offset 2px. Approximate (city-level) locations use a 135-degree diagonal hatch of the rod colour over paper on swatches and bands, and a dashed rod-colour border on pins. The "you are here" mark is an ink diamond (rotated square) with a white ring.

## Components

### Buttons
Blunt, printed and square.
- **Shape:** square (0px), 1px ink border.
- **Ink (primary):** ink fill, white text, 700 weight, 10px 14px padding. Used for Near me. Hover lifts to a warm near-black; turns Flame Teal-Blue when distance sort is active.
- **Plain:** field white with ink border; hovers to chart grey. Used for Copy link.
- **Link button:** unstyled, underlined 600 13px text (Clear filters).
- **Detail nav:** borderless chart-white cells divided by ink rules, 700 14px, inline SVG chevrons; disabled steps grey out.

### Chips
- **Style:** field white, 1px ink border, 600 13px, 5px 10px padding (44px tall on phones).
- **State:** pressed chips invert to ink with white text. Used for Offers filters.

### Family Strip (signature filter)
Five equal tabs in a ruled row, each capped by an 8px bar of its rod colour, with the short name over a mono "HS 12" code-and-count. Hover grows the cap to 11px. Pressed tabs invert to ink with chalk counts. A family with zero studios shows a hollow cap (2px rod-colour underline on paper) and soft-ink text.

### Chart Rows (signature component)
- **Structure:** swatch / code / name over meta / distance, cells ruled in ink, full-width button.
- **Swatch:** a chip of rod colour inset inside a 9px chart-white margin and a 1px ink ring, like a printed chip on a bar card (the default "chip" finish).
- **Hover / Focus:** row tints to 10% of its rod colour over paper.
- **Choose (signature move):** the rod colour floods left-to-right across the whole row (clip-path, 0.3s, expo-out), text flips to white on flame and kiln, then the detail opens under a band of the same colour.
- **Selected:** returning to the list outlines the last-opened row with a 3px inset ink rule.

### Detail Band
A 112px field of the rod colour (84px on phones), with the same chip inset (14px paper margin, 1px ink ring) and the chart code in a chart-white, ink-ruled mono tag at bottom-left. Hatched when the location is approximate.

### Inputs / Fields
- **Style:** field white, 1px ink border, square; search 16px text, 10px 12px padding; selects 500 14px.
- **Focus:** the global 3px ink outline, offset 2px.

### Link List
Full-width ruled rows, 800 16px label with an outbound arrow, the URL right-aligned in soft-ink mono and truncated. The first link (Visit website) is a solid ink bar with white text and chalk URL: the one call to action, since the studio's own site is the destination.

### Map Pins
A 42 x 24px swatch of the rod colour with a 1.5px ink border, carrying the two-letter family code in 700 12px mono. Approximate pins are paper-filled with a dashed rod-colour border and an ink outline. The active pin scales to 1.3 and gains a white, ink-ruled mono label with its full chart code. Clusters are 40px ink squares with white mono counts, ringed white then ink.

## Do's and Don'ts

### Do:
- **Do** rule every band, row and cell with a 1px ink line; the rules are the structure.
- **Do** pair every rod colour with its text code (HS, FW, KG, NE, MX or the full HS-027 number).
- **Do** keep all corners square (0px), including third-party map controls.
- **Do** set codes, counts, distances and URLs in Chivo Mono with tabular figures, and everything else in Schibsted Grotesk.
- **Do** mark city-level locations with the diagonal hatch (swatches, bands) or dashed border (pins), never with an exact-looking solid mark.
- **Do** keep the base map desaturated so rod colours are the only saturated marks.
- **Do** put white text on flame and kiln, and ink text on hot, neon and mixed.
- **Do** honour reduced motion: the flood, family caps, pins and sheet stop animating.

### Don't:
- **Don't** use rounded corners or soft cards anywhere in the directory.
- **Don't** fake glass lighting on swatches (no glossy highlights, specular gradients or translucency); swatches are flat printed chips. The approximate-location hatch is the only patterned fill.
- **Don't** cast shadows inside the directory column; shadows are reserved for pins, clusters and the phone sheet over the map.
- **Don't** use a rod colour for anything except its studio family (beyond the active Near me state and text selection).
- **Don't** add studio images, logos or decorative illustration; the swatches are the imagery.
- **Don't** ship the colour-only square pin variant as the default; it drops the type code that keeps families legible without colour.
