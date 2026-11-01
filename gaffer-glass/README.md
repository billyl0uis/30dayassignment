# Gaffer Glass

A furnace glassblowing game, played the way Glassworks plays. The studio is always open: pick what you're making, follow its step goals at the bench — gather, glory hole, marver, block, blow, jacks, punty transfer — and knock it off into the annealer. It comes out with a quality and a worth; price it in your cabinet for visitors who drop by in real time, or deliver it to a commission. Earnings buy color and tools that unlock new work. Save $1,000 toward your own furnace.

Vite + TypeScript, a three.js 3D scene for the shop and the piece, plain DOM for the UI. No game engine; three.js is the only runtime dependency.

```bash
npm install
npm run dev      # http://localhost:5196
npm test         # sim tests (a tumbler start to finish, every fail state) and studio tests (annealer, commissions, visitors, unlocks)
npm run build    # static site in dist/
```

## Deploying on Vercel

Import the repo and set **Root Directory** to `gaffer-glass`. `vercel.json` sets the build command and the `dist` output folder.

## Tuning

Every number lives in [`src/config.ts`](src/config.ts), grouped by station and commented: furnace and glory hole temperatures, cooling, sag, tool rates, blowout and drop limits, piece specs and worth, visitors, commissions, prices and unlocks. The simulation reads nothing else, so after retuning run `npm test`. The tumbler, paperweight and bowl recipes in `src/sim/sim.test.ts` check that each piece can still be made inside its spec.

Temperatures and timings are simplified for play.

## How it's built

```
src/
  config.ts          every tunable constant
  sim/               pure functions on a Piece — no DOM
    piece.ts         state, derived geometry (R, wall, lip, D, H), piece type
    actions.ts       hold tools, tap actions, canHold/canTap (shared with the buttons)
    physics.ts       one fixed step: tool, cooling, sag, cold-check
    scoring.ts       centered / even / spec → quality and worth
  studio/            save file, step goals, commissions, economy (annealer, storage, cabinet, visitors, supplies)
  session/           the bench: fixed-step loop, rotation, blow pressure, messages, keyboard + hold buttons
  render/            three.js: the piece spun from its profile, heat colors, the shop and stations
  ui/                top bar, the bench screen, and the Shop / Gallery / How to panels
```

The session runs the sim in fixed 1/60 s steps inside `requestAnimationFrame`, so pieces behave the same at any frame rate. Buttons and keys ask the same `canHold` / `canTap` as the sim, so a disabled button always shows the reason (hover it, or press it to see the message).

## Choices beyond the brief

- **Thin walls blow faster.** Blow rate scales up as the wall thins (`BLOW.thinRef`, `thinMax`), so a blowout is reachable and comes on suddenly, the way a bubble balloons.
- **The pipe rotates by default.** Space stops and starts it, like Glassworks' Rotating toggle. While it turns, soft glass drifts back on center (`SAG.turnCenterRate`); stopped, hot glass droops.
- **Always open, in real time.** No days and no clock: the annealer takes `ANNEAL.seconds`, and visitors browse the cabinet every 25–40 s (sooner with reputation), buying when your price is near what a piece is worth to them.
- **Blow pressure.** A slider sets breath pressure; harder blows faster and tears at a thicker wall (`BLOW.pressure*`).
- **No rent, no side jobs.** Like Glassworks, you can't get stuck: firing up the shop and clear glass are free, and money goes only on color jars and tools.
- **The pipe coasts.** It keeps rolling for `SAG.coastSeconds` (0.35 s) after you let go of a tool, so switching tools doesn't cost centering. Set it to 0 for the strict rule.
- **The newspaper pad replaces the block.** With the pad, the Block tool becomes the Pad and centers 60% faster.
- **Color is worth more.** A colored piece is worth 15% more, visitors like it a little more, and a commission that asks for a color only takes that color and pays 20% more.
- **Marvering on the punty** only cools and centers; the length is set before the transfer.
- **Reheating above 2200°F** makes the piece floppy enough to sag even while turning, and shrinks a blown bubble. If it shrinks away on the pipe, the piece becomes solid again.
