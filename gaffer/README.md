# Gaffer

A furnace glassblowing game. Rent a 3-hour block of hot shop time, make pieces on the pipe — gather, glory hole, marver, block, blow, jacks, punty transfer — knock them off into the annealer, and sell them the next morning to the order board. Save $1,000 toward your own furnace.

Vite + TypeScript, HTML5 canvas for the piece, plain DOM for the UI. No game engine, no runtime dependencies.

```bash
npm install
npm run dev      # http://localhost:5196
npm test         # headless sim tests: a tumbler start to finish, plus every fail state
npm run build    # static site in dist/
```

## Deploying on Vercel

Import the repo and set **Root Directory** to `gaffer`. `vercel.json` sets the build command and the `dist` output folder.

## Tuning

Every number lives in [`src/config.ts`](src/config.ts), grouped by station and commented: furnace and glory hole temperatures, cooling, sag, tool rates, blowout and drop limits, order specs, prices, and the economy. The simulation reads nothing else, so after retuning run `npm test`. The tumbler, paperweight and bowl recipes in `src/sim/sim.test.ts` check that each piece can still be made inside its order spec.

Temperatures and timings are simplified for play.

## How it's built

```
src/
  config.ts          every tunable constant
  sim/               pure functions on a Piece — no DOM
    piece.ts         state, derived geometry (R, wall, lip, D, H), piece type
    actions.ts       hold tools, tap actions, canHold/canTap (shared with the buttons)
    physics.ts       one fixed step: tool, cooling, sag, cold-check
    scoring.ts       centered / even / spec → quality, grades, sales
  studio/            save file, order board, economy (book, TA shift, shop, overnight)
  session/           the 3-hour block: clock, fixed-step loop, messages, keyboard + hold buttons
  render/            canvas: silhouette sampling, heat colors, the bay and stations
  ui/                header, studio, session and results screens
```

The session runs the sim in fixed 1/60 s steps inside `requestAnimationFrame`, so pieces behave the same at any frame rate. Buttons and keys ask the same `canHold` / `canTap` as the sim, so a disabled button always shows the reason (hover it, or press it to see the message).

## Choices beyond the brief

- **Thin walls blow faster.** Blow rate scales up as the wall thins (`BLOW.thinRef`, `thinMax`), so a blowout is reachable and comes on suddenly, the way a bubble balloons.
- **The pipe coasts.** It keeps rolling for `SAG.coastSeconds` (0.35 s) after you let go of a tool, so switching tools doesn't cost centering. Set it to 0 for the strict rule.
- **The newspaper pad replaces the block.** With the pad, the Block tool becomes the Pad and centers 60% faster.
- **Color requests are a bonus.** An order asking for a color still takes a clear piece; the matching color adds $15.
- **Marvering on the punty** only cools and centers; the length is set before the transfer.
- **Reheating above 2200°F** makes the piece floppy enough to sag even while turning, and shrinks a blown bubble. If it shrinks away on the pipe, the piece becomes solid again.
