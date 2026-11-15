# Hot Shop Rush

A cozy time-management game set in a glassblowing hot shop. The design lives in [GDD.md](GDD.md). This folder is the MVP from GDD §13: one product (M tumbler, one frit color, straight lip), all four stations, the heat meter and glory hole, walk-in customers, the garage, and the morning annealer reveal.

## Run it

No build step: plain ES modules.

```bash
npm run dev        # python3 -m http.server 5222
```

Then open http://localhost:5222. The heat model on its own is at http://localhost:5222/lab.html.

```bash
npm test           # node --test: heat model + scoring against the GDD numbers
```

## Where things are

| File | What it does |
|---|---|
| `src/config.js` | Every tunable number (heat, bands, garage, timings, scoring). Change numbers here. |
| `src/heat.js` | The heat model: cooling, glory hole, stress, off-center. Pure, tested. |
| `src/scoring.js` | Step scores, hand-off score, tips, morning crack chance. Pure, tested. |
| `src/game.js` | Game state and rules: orders, warmer, garage, punty, annealer, day loop. No DOM. |
| `src/stations/*.js` | One file per station screen: draw + pointer input. |
| `src/hud.js` | Ticket rail, heat meter, garage, glory hole button, tabs. |
| `src/overlays.js` | Title, hand-off card, day summary, morning reveal, toasts. |
| `lab.html` | Milestone 1 debug page: the heat curve with live reheating. |

## Debug keys

- `d`: debug overlay (heat, stress, off-center, step timing)
- `f`: fast-forward ×4
- `p`: pause
- In the console: `game` is the live state, and `hsr.advance(seconds)` runs the game in simulated time.

## Where the MVP departs from the GDD

- **Slump in the glory hole** happens at 25% of the normal rate (`OFF_SLUMP_GH_MULT`), since the pipe auto-turns there. Without it, every melt-in cost about 10 off-center.
- **Melt-in** takes 3 s at heat ≥ 82 (the GDD says 4 s at ≥ 85), for the same reason.
- **Lip opening** takes 200 px of outward drag per unit, so a single drag from the opening to the edge of the screen does it.
- **Day 1 tuning only.** Density on tickets starts on Day 3 and garage slots grow by day, but there are no new products or regulars yet.
