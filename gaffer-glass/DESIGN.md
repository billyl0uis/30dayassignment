---
name: Gaffer Glass
description: A daylit hot shop fills the window; compact dark panels and round thumb buttons float over it.
colors:
  wall: "#e7e3db"
  wall-shade: "#d9d4ca"
  ink: "#23262b"
  ink-muted: "#5d636b"
  panel: "rgba(28, 32, 40, 0.92)"
  panel-solid: "#1c2028"
  panel-raised: "#272c36"
  line: "#3a414d"
  line-hi: "#525b69"
  text: "#e8edf3"
  muted: "#9aa4b2"
  faint: "#6b7480"
  heat: "#ff7a2f"
  heat-hi: "#ffb067"
  heat-dim: "#b8480f"
  heat-ink: "#241005"
  breath: "#5b7cfa"
  breath-hi: "#8fa6ff"
  ok: "#5fd08a"
  warn: "#f3b33d"
  bad: "#ff5a4a"
typography:
  display:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "1.35rem"
    fontWeight: 600
    lineHeight: 1.2
  title:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "1.1rem"
    fontWeight: 600
    lineHeight: 1.2
  body:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.5
  control:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "0.8rem"
    fontWeight: 600
    lineHeight: 1.1
  readout:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "1.35rem"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tnum"
  numeric:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.5
    fontFeature: "tnum"
rounded:
  gauge: "5px"
  control: "8px"
  panel: "10px"
  dialog: "14px"
  pill: "999px"
  round: "50%"
spacing:
  hairline: "4px"
  tight: "8px"
  pad: "10px"
  inset: "12px"
  gutter: "16px"
components:
  button-primary:
    backgroundColor: "{colors.heat}"
    textColor: "{colors.heat-ink}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "0.55rem 1rem"
  button-primary-hover:
    backgroundColor: "{colors.heat-hi}"
    textColor: "{colors.heat-ink}"
  button-secondary:
    backgroundColor: "{colors.panel-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "0.55rem 1rem"
  button-ghost:
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "0.55rem 1rem"
  tool-hold:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    typography: "{typography.control}"
    rounded: "{rounded.round}"
    size: "64px"
  tool-hold-active:
    backgroundColor: "{colors.heat}"
    textColor: "{colors.heat-ink}"
    rounded: "{rounded.round}"
    size: "64px"
  tool-glory:
    backgroundColor: "{colors.heat}"
    textColor: "{colors.heat-ink}"
    rounded: "{rounded.round}"
    size: "138px"
  tool-blow:
    backgroundColor: "{colors.breath}"
    rounded: "{rounded.round}"
    size: "138px"
  tool-tap:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.pill}"
    height: "40px"
    padding: "0 0.9rem"
  jar-tray:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.pill}"
    padding: "6px"
  float-panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.panel}"
    padding: "0.75rem 0.85rem"
  card:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.panel}"
    padding: "1.1rem 1.2rem"
  toast:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.pill}"
    padding: "0.5rem 0.95rem"
  header-bar:
    backgroundColor: "{colors.panel-solid}"
    textColor: "{colors.text}"
    padding: "0.55rem 16px"
---

# Design System: Gaffer Glass

## Overview

**Creative North Star: "The Shop Is the Screen"**

A bright, daylit hot shop fills the window: a whitewashed block wall, a steel-sash window throwing light across the concrete, the furnace glowing at the left and the glory hole at the right. Every control floats over that room in compact dark slate panels, so the game reads as standing at the bench in daylight, never as a dark app with a picture inside it. The piece on the pipe is the brightest thing on screen because it is incandescent, and it glows against a light room rather than out of a black void.

Density is instrument-like where the numbers live (a narrow readout panel of mono figures, a five-zone temperature gauge) and generous where the hands live: the two big round hold buttons sit under the thumbs at the bottom corners, heat on the left and breath on the right, with the smaller tools clustered beside them. The studio and morning-results screens keep the same grammar on the plain wall: dark cards floating on a light ground.

The look sits deliberately close in feel to Glassworks (lit scene, floating dark panels, round thumb buttons) while drawing its own room, controls and copy. The earlier dark "hot shop at night" treatment was rejected as too gloomy.

**Key Characteristics:**
- Light ground everywhere: the painted daylit room in a session, the whitewashed wall elsewhere.
- Dark slate panels at 92% opacity, 10px corners, one soft drop shadow.
- One warm accent, Working Heat, carrying heat, primary actions and the Glory hole; one cool Breath blue reserved for Blow.
- Anything you hold is a circle; anything you tap is a pill.
- Numbers are always IBM Plex Mono with tabular figures.

## Colors

A warm, light, near-neutral room with dark slate instruments over it, one hot orange accent, one cool blue for breath, and the glass itself supplying every other saturated hue.

### Primary
- **Working Heat** (heat): the accent. Primary buttons ("Book the hot shop", "Back to the studio"), the Glory hole thumb button, the active state of small hold tools, the checkbox accent, the hover border on secondary buttons, and the furnace-progress fill. Text set on it is the near-black Heat Ink (heat-ink).
- **Working Heat, Bright** (heat-hi): the hover state of primary buttons, the focus ring, the active-tool ring, the selected color jar's border, money and color-ask text on the order board, and the "Glass" word in the wordmark.
- **Working Heat, Banked** (heat-dim): the shadowed edge of the Glory hole button's radial gradient and the start of the progress fill. Never a fill on its own.

### Secondary
- **Breath** (breath, with breath-hi as its highlight): the Blow thumb button and nothing else. It is the cool counterweight to heat, the player's own air.

### Neutral
- **Whitewash** (wall): the page ground on the studio and results screens and the base of the painted shop wall. **Whitewash Shade** (wall-shade) is its secondary tone.
- **Bench Ink** (ink) and **Bench Ink, Muted** (ink-muted): text set directly on the wall, such as the "Start over" link.
- **Slate Panel** (panel): every floating surface: readout rail, clock pill, toast, cards, hold and tap buttons, the jar tray. **Slate, Solid** (panel-solid) is the opaque form for the header bar, the end-of-block dialog and the jar count badges; it is also the browser theme color. **Slate, Raised** (panel-raised) is a surface one step up inside a panel: order cards, secondary buttons, the empty progress track.
- **Rule** (line) and **Rule, Lit** (line-hi): dividers inside panels and the secondary button border; line-hi is also the hover ring on hold tools.
- **Panel Text** (text), **Panel Muted** (muted), **Panel Faint** (faint): text on slate, from figures to labels to the Seconds grade.

### Status
- **Working Green** (ok), **Amber Warning** (warn), **Crack Red** (bad): readout semantics only. Temperature in the working range, warnings, the low clock and danger marker, A grades and "Owned". They live inside panels and never decorate.

### Named Rules
**The Lit Shop Rule.** The ground is always light: the painted daylit room during a session, Whitewash on every other screen. Dark is reserved for the floating panels and the header bar.

**The Working Heat Rule.** Working Heat means heat or the action that matters most: one primary button per view, the Glory hole, the active tool, focus and selection. It is never a background wash or a decorative stripe.

**The Breath Rule.** Breath blue appears on the Blow button only. No other control, chart or label takes it.

**The Glass Is the Color Rule.** Outside Working Heat, Breath and the status triad inside readouts, every saturated color on screen is glass: the piece, the jar swatches, the jars on the painted shelf.

## Typography

**Display Font:** IBM Plex Sans (with system-ui, sans-serif)
**Body Font:** IBM Plex Sans (with system-ui, sans-serif)
**Label/Mono Font:** IBM Plex Mono (with ui-monospace, monospace)

**Character:** A shop-floor pairing: Plex Sans is plain and sturdy for labels and copy, Plex Mono gives every temperature, dimension, price and key a gauge-like, tabular steadiness.

The root size is 15px, so 1rem is 15px throughout.

### Hierarchy
- **Display** (700, 1.5rem, line-height 1, -0.01em): the "Gaffer" wordmark only; 1.25rem on phones.
- **Headline** (600, 1.35rem, 1.2): card and dialog headings ("Hot shop time", "Order board", "Morning, day N").
- **Title** (600, 1.1rem, 1.2): order types on the order board. Sub-headings inside cards (h3) step down to 600 at 0.95rem in Panel Muted.
- **Body** (400, 15px, 1.5): card copy, notes (0.875rem, muted), the toast (0.925rem).
- **Label** (400, 0.75rem): Panel Muted labels beside figures: "Temperature", "Time left", readout names, header stat names.
- **Control** (600, 0.8rem, 1.1): hold-tool labels; 1.05rem on the two big thumb buttons, 0.875rem on tap pills, 0.95rem on regular buttons.
- **Readout** (Mono 400, 1.35rem, tabular): the clock and the live temperature, the two numbers watched mid-piece.
- **Numeric** (Mono 500, 0.875rem, tabular): readout values, header stats (1rem), prices, totals, key hints in kbd.

### Named Rules
**The Numbers in Mono Rule.** Every figure the player reads as a measurement (time, temperature, inches, percent, dollars, counts, key letters) is IBM Plex Mono with tabular figures. Words stay in Plex Sans.

**The Small Word Rule.** "Glass" sits beside the "Gaffer" wordmark as a small Plex Mono word (500, 0.8rem, 0.18em tracking, uppercase, Working Heat Bright). That tracked uppercase mono treatment belongs to the wordmark alone.

## Layout

The session screen is a full-bleed canvas (100dvh under the header, overflow hidden) with absolutely positioned floats over it, inset 12px from the edges on desktop and 8px on phones:

- **Top left:** the clock pill (Time left plus End early).
- **Top right:** the readout rail, 250px wide: temperature, gauge, then ten label/value rows. On phones it folds into a compact mono HUD plus a "Details" pill that opens the full rail as a two-column grid.
- **Lower center:** the toast, a pill 196px above the bottom (290px when the controls wrap below 1100px; pinned near the top on phones).
- **Bottom:** the thumb controls. Left pad: Glory hole (138px) with Gather and Turn (64px) beside it. Right pad: Marver, Block and Jacks (64px) beside Blow (138px). Centered between them: the jar tray above the row of tap pills. Pads use a 10px gap; the bottom padding respects the safe-area inset.

Below 1100px the jar tray and tap pills move to their own row above the pads. Below 760px the big buttons shrink to 104px, the small ones to 50px, key hints hide, and the right pad stacks its three small tools in a column.

The studio screen is a centered column (max 1280px, 16px gutter) holding an auto-fit grid of cards (min 300px, 16px gap). The results screen is a single card at max 820px. The rhythm is 8px between small items, 10px inside control clusters, 12px float inset, 16px between cards and at page edges.

**The Thumb Rule.** The two actions held longest get the biggest targets in the bottom corners: Glory hole under the left thumb, Blow under the right. Other hold tools cluster beside them; nothing interactive floats mid-screen over the piece.

## Elevation & Depth

Depth comes from dark panels floating over a light, painted room, lifted by one soft, warm drop shadow. There is a single shadow token; panels, cards, buttons, the toast and the jar tray all use it, and states add rings on top of it rather than new shadows. Inside panels, depth is tonal: Slate, Raised marks a surface one step up. Light in the canvas (the furnace door's spill, the window's light on the floor, the piece's glow) is painted, not a UI effect.

### Shadow Vocabulary
- **Float** (`box-shadow: 0 8px 24px rgba(30, 28, 24, 0.22)`): every floating panel and control.
- **Active ring** (`box-shadow: 0 0 0 3px` Working Heat Bright, then Float): a hold tool being held.
- **Hover ring** (`box-shadow: 0 0 0 2px` Rule, Lit, then Float): a hold or tap tool under the pointer.
- **Ember** (`box-shadow: 0 0 10px` Working Heat): the round brand mark only; the gauge marker carries a matching white (or Crack Red in danger) glow.

### Named Rules
**The Float Rule.** Every control over the shop is a dark slate panel at 92% opacity with the Float shadow. Nothing sits flush with the scene and nothing is drawn as a hard-edged or offset slab.

**The Incandescence Rule.** Glow belongs to hot things: the piece, the furnace door, the glory hole port, and the UI elements that stand for heat (the Glory hole button, the brand mark). Cool controls do not glow.

## Shapes

Three forms carry the whole system. Hold tools and color jars are circles. Tap actions, the toast, the jar tray, the jar count badges and the phone Details button are full pills (999px). Containers are gently rounded rectangles: panels and cards at 10px, buttons, order cards and the HUD at 8px, the gauge at 5px, the end-of-block dialog at 14px, the phone toast at 12px. Borders are rare: secondary buttons take a 1px Rule, Lit edge, swatches a 1px translucent white ring, and dividers inside panels are 1px Rule lines.

**The Round Hand Rule.** If you hold it, it is round; if you tap it, it is a pill; if it holds information, it is a 10px rectangle.

## Components

### Buttons
Plain, sturdy studio buttons on dark cards.
- **Shape:** gently rounded (8px).
- **Primary:** Working Heat fill, Heat Ink text, 600 weight, 0.55rem by 1rem; the big size (1.05rem, 0.75rem by 1.4rem) is for the screen's one main action.
- **Hover / Focus:** primary brightens to Working Heat Bright; secondary and ghost keep their fill and take a Working Heat border. Focus everywhere is a 2px Working Heat Bright outline at 2px offset. Disabled drops to 40% opacity.
- **Secondary:** Slate, Raised with a 1px Rule, Lit border. **Ghost:** the same, transparent. **Small:** 0.3rem by 0.7rem at 0.875rem, for prices on the supply shelf and End early. **Link:** underlined Bench Ink, Muted text on the wall, for destructive escapes like "Start over".

### Hold Tools (signature)
Round slate buttons under the thumbs, held rather than clicked.
- **Shape:** circles, 64px (50px on phones); Glory hole and Blow at 138px (104px on phones).
- **Content:** the tool name in Control type with its key below in small muted mono; key hints hide on phones.
- **Glory hole:** a radial gradient from a bright core through Working Heat to Working Heat, Banked, with Heat Ink text. **Blow:** a radial gradient from Breath Bright through Breath to a deeper blue.
- **States:** held tools scale to 94% and take the Working Heat Bright ring; small held tools also fill with Working Heat. Unavailable tools drop to 45% opacity and explain why in their title. Hover adds the Rule, Lit ring. Transitions are quick (transform 80ms, background 120ms).
- **Behavior:** no text selection, no long-press menu, no touch scrolling on these targets.

### Tap Pills
Slate pills (40px tall, 36px on phones) with the action name and its key inline, centered under the jar tray: color, transfer, knock off, new pipe, dump.

### Color Jar Tray
A slate pill holding 38px round swatches (32px on phones) of the glass colors, each with a small mono count badge at its lower right. The selected jar takes a 2px Working Heat Bright ring; an empty jar fades to 35%.

### Cards / Containers
- **Corner Style:** 10px; the end-of-block dialog 14px.
- **Background:** Slate Panel; nested items (order cards) on Slate, Raised at 8px.
- **Shadow Strategy:** Float (see Elevation & Depth).
- **Border:** none; internal dividers are 1px Rule lines.
- **Internal Padding:** 1.1rem by 1.2rem for cards, 0.75rem by 0.85rem for the readout rail.

### Readout Rail and Temperature Gauge
The instrument panel. The live temperature sits large in Readout mono over a 22px five-zone gauge (crack, stiff, working, hot, too hot) in muted dark reds, slate, green and ambers with tiny mono zone names, and a 3px white marker that glows red when the glass nears cracking or overheating. Below it, label/value rows divided by faint 1px lines.

### Toast
A slate pill centered above the controls that speaks one line at a time and fades after a few seconds. Warnings tint the text amber, hints go muted, and a failure turns the whole pill a deep red with white text and stays up while the failed piece is on the pipe.

### Navigation (Header Bar)
A solid slate bar across the top of every screen: the round ember mark, the "Gaffer" wordmark with "Glass" beside it, Day, Cash and Reputation in mono, and the "Own furnace" progress bar (6px, Working Heat gradient fill). On phones during a session the progress bar hides.

### Dialog
The end-of-block overlay dims the shop with a warm translucent scrim (not black) and centers a solid slate card (max 420px) with a heading, one line of outcome and one primary button.

## Do's and Don'ts

### Do:
- **Do** keep the ground light: the painted daylit shop in a session, Whitewash (#e7e3db) behind studio and results cards.
- **Do** float every control on Slate Panel (rgba(28, 32, 40, 0.92)) with the single Float shadow and 10px corners.
- **Do** put Glory hole (Working Heat) at the bottom left and Blow (Breath) at the bottom right as the two biggest round buttons, 138px on desktop and 104px on phones.
- **Do** set every measurement in IBM Plex Mono with tabular figures.
- **Do** let the glass carry the color: the incandescent piece against the light room is the image the screen is built around.
- **Do** give every unavailable control a reason in its title, and keep every hold target free of text selection and long-press menus.

### Don't:
- **Don't** use a dark full-screen ground. The "hot shop at night" look was rejected as too gloomy; dark belongs to the panels, the header bar and the dialog card only.
- **Don't** use Breath blue anywhere but the Blow button, and don't introduce a second warm or cool accent.
- **Don't** spend Working Heat on decoration: no orange washes, stripes or borders that do not mean heat, the primary action, focus or selection.
- **Don't** make a hold tool square or a tap action round; the shape tells the hand how to use it.
- **Don't** use the tracked uppercase mono treatment for anything but the "Glass" word in the wordmark: no small labels above headings.
- **Don't** add shadows beyond Float and the state rings, and never hard or offset ones.
