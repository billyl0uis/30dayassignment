# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Gaffer Glass is a game, and it plays to three audiences at once:

- **Glassblowers** who work at a furnace. They judge it on whether it feels like a real hot shop, and the owner tunes its numbers to match how glass behaves in their own studio.
- **Curious newcomers** who have never blown glass. They should come away knowing what gathering, the glory hole, the marver, the block, the jacks and the punty actually do, and why pieces fail.
- **Classmates and reviewers** opening it from a link as a 30-day-assignment piece. They need to understand the loop and make something within the first few minutes.

People play it in a browser on a desktop with a keyboard, or on a phone with on-screen hold buttons.

## Product Purpose

You run a small glass studio, always open, and play it the way Glassworks plays (decided 2026-11-01). Pick what you're making and follow its step goals at the bench: gather, reheat, marver, block, blow, jack a line, transfer to the punty, open the lip, and knock off into the annealer. A piece comes out with a quality and a worth. Price it on a cabinet shelf for visitors who drop by in real time, or deliver it to a commission. Money buys color jars and tools, and tools unlock new kinds of work. The goal is to save $1,000 toward your own furnace.

Play succeeds when the player makes something on purpose, understands why anything they lost failed, and wants to make the next piece.

## Positioning

The reference is Glassworks (glassworksgame.com), a realistic borosilicate lampworking studio game with the same loop: make a piece, anneal it, sell it, upgrade. Gaffer Glass is its furnace counterpart. The craft is offhand hot shop work, gathering from a furnace and working a bubble on the pipe and punty. Like Glassworks, studio time and clear glass cost nothing; money comes only from selling work and goes into color and tools.

## Operating Context

- **Always open, real time** (as in Glassworks): no days and no clock. The annealer takes a few seconds; visitors drop by every 25–40 s.
- **Hold tools,** one at a time: gather (F), glory hole (G), marver (M), block (K), blow (B), jacks (J).
- **Rotation is on by default,** as in Glassworks. Space stops and starts it. Turning holds a droop where it is. To re-center, stop turning with the droop on top so gravity pulls it back (then start again in time), or marver or block it.
- **Tipping the pipe** (↑/↓) lets gravity stretch soft glass long or slump it short.
- **Pause** with Esc or the top-bar button.
- **Tap actions:** roll in color (C), transfer to punty (P), knock off (X), new pipe (N), dump in cullet (Q).
- **Blow pressure** slider: harder blows faster and tears at a thicker wall.
- **What you're making** is picked in the top bar and drives the step goals panel.
- **Commissions:** always three, from generic first-name customers, never real businesses. Each names a kind of piece, a quality bar, pay and reputation; about 30% ask for a color.
- **Cabinet:** six shelves of priced pieces. Visitors come in hoping for one kind of piece, with a budget; the nearer your price is to a piece's worth, the likelier they buy.

## Capabilities and Constraints

- **Realism rule:** real, then tuned. The order of operations, the tool behaviors and every reason a piece fails stay true to furnace practice. Rates, temperatures and tolerances are tuned for play, and the game says so ("Temperatures and timings are simplified for play").
- **Piece model:** parametric. Volume, length, bubble radius, temperature, sag, jack line, opening, punty, blown, unevenness and color. Geometry comes from a cylinder approximation. Piece types are paperweight, ornament, closed vessel, tumbler and bowl.
- **Every fail state is reachable** and shows a one-line reason that teaches the real lesson: drooped off center, cold-checked, thermal shock, blowout, dropped at the jack line, lip collapsed, cracked going into the annealer, floppy from overheating.
- **Scoring:** centered, even and on-spec combine into a quality percentage. Worth is the kind's base price scaled by quality, a little more with color.
- **Economy:** start with $20, as in Glassworks. No rent, no assistant, no side jobs: studio time and clear glass are free, so a player can never get stuck broke. Color jars come with 5 uses. Paperweights, ornaments and tumblers are open from the start; smoother jacks unlock bowls (after 2 tumblers sold or delivered) and a bigger glory hole door unlocks vases (after 1 bowl).
- **Stack:** Vite + TypeScript, a three.js 3D scene for the shop and the piece (changed from the brief's 2D canvas on 2026-11-01 to match Glassworks' 3D), plain DOM for the UI, no game engine. Deployed as a static site on Vercel.
- **Architecture:** the simulation is pure functions on a `Piece`, kept separate from rendering and UI. Every tunable constant lives in `src/config.ts`.
- **Saving:** the studio (cash, reputation, colors, tools, the annealer, storage, cabinet, commissions, log) saves to localStorage, best effort. The piece on the pipe does not survive a reload.
- **Input:** both keyboard and phone hold buttons are required. Hold buttons block text selection and long-press menus, and Space must not scroll the page.

## Brand Commitments

- **Name:** "Gaffer Glass". "Gaffer" leads; "Glass" accompanies it as a smaller, secondary word wherever the name is shown on screen. Links, folder, package and page title use the full name (`gaffer-glass`).
- **Close to Glassworks in feel, not a copy:** the owner wants the look to sit as close to Glassworks as possible (decided 2026-11-01, replacing the earlier "do not copy its UI or layout" rule). That means the same kind of screen: a bright, lit studio scene filling the window, compact dark panels floating over it, and big round hold buttons placed for the thumbs. Gaffer Glass still draws its own art and icons, writes its own copy, and never uses Glassworks' name, logo or assets.
- **Generic names only:** clients and color names stay generic. No real business names and no glass-manufacturer brand names.

## Evidence on Hand

- A playable build in `gaffer-glass/`.
- Headless tests in `src/sim/sim.test.ts` that make a tumbler, a paperweight and a bowl inside their order specs and reach every fail state.
- No players, reviews, testimonials, sponsors or marketplace exist yet. Future work must not invent any.

## Product Principles

1. **Teach through failure.** Every lost piece names its real cause in one line, so failing teaches the next attempt.
2. **The hands do the work.** Pieces are made by holding tools in time, not by choosing outcomes from menus.
3. **True to the furnace, honest about simplifying.** Keep the real order of operations and the real reasons for failure. Tune numbers in the open, in one config file.
4. **Never stuck.** Studio time and clear glass are free, so a lost piece costs time, not the run.
5. **Both hands and thumbs.** Keyboard and phone play are equal citizens.
