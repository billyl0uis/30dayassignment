# Silverbench

A jeweler's bench simulator for sterling silver. Cut sheet, wire and tube, then flux, solder, rivet, pickle and polish them on a soldering board. You can make whatever you like. Guided lessons walk you through a soldered bail, a three-knuckle hinge and a riveted pivot. A 3D Mechanisms tab shows how hinges, box clasps, toggles, rivets and spinner rings work, with a slider to operate each one and an exploded view.

## How to use

- Open `index.html` in a browser.
- **Bench:** pick a tool from the left rail (each has a keyboard key) and work on the board. Hover over any piece to see its temperature and surface state. Undo with Ctrl/⌘ Z.
- **Lessons:** start one from the right-hand panel. Each step tells you which tool to use, explains why, and moves on by itself when you've done it.
- **Mechanisms:** drag to orbit, then use the slider, Play or Exploded view.

## What's in it

- A single self-contained HTML file. The bench is drawn on a 2D canvas. The Mechanisms view uses [three.js](https://threejs.org/) r128 from a CDN. There's no build step.
- **Heat model:** each piece has its own temperature and a heat capacity that comes from its volume. The torch deposits heat with a Gaussian falloff, pieces that touch conduct heat to each other, and hot pieces lose heat by convection and radiation. The usual bench rules come out of this model on their own: small parts heat fast, big pieces soak up heat, and solder flows toward heat.
- **Solder:** hard, medium, easy and extra-easy chips have their real flow points (788, 754, 718 and 688°C). The rule for whether a chip flows is the single function `solderVerdict(chip, metals)`. Joints that get re-heated past their flow point re-flow, which is why you step down from hard to easy. Solder that lands on one piece stays there as a puddle, and you can sweat-solder another piece to it later.
- **Chemistry:** flux goes from wet to bubbling to crusty to glassy at 595°C, and leaves glass behind that has to be pickled off. Metal heated without flux oxidizes. Yellow ochre stop-off keeps solder from flowing onto a piece. If you overheat sterling, its surface sweats at 802°C and it melts into a blob at 893°C.
- **Mechanisms on the bench:** a wire running through tube knuckles that are soldered to two different pieces becomes a working hinge. Pieces held by a single rivet pivot, and two rivets lock them. Use Flex to test both.
- Sounds (torch roar, quench hiss, solder ting, rivet taps) are synthesized with the Web Audio API.
- The free bench and finished lessons are saved per browser in `localStorage`.
