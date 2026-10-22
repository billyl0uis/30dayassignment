# Foldline

A fold-forming simulator and design bench, inspired by the fold-formed metalwork of Greg Greenwood. You design a blank and set its fold line, then anneal, fold, forge the folded edge, anneal again and open it up, the way a line fold is made at the bench. A live 3D view shows the form rising as the hammered edge stretches. Four classic starting points are included: a curling leaf, an arched shell, a fiddlehead and an off-axis kite.

## How to use

- Open `index.html` in a browser.
- **Design:** pick a blank shape and size, then drag the copper dots to place the fold line (hold Shift to snap its angle). Anneal, then **Fold it**.
- **Forge:** the left view shows the folded packet side-on. Drag along its top edge to hammer it. The edge is colored by hardness, and the hammer rings higher as the metal work-hardens. Anneal with the button or <kbd>A</kbd>.
- **Open:** use the Open slider. Work-hardened metal won't open far, so anneal first.
- **Pattern SVG** downloads the blank at 1:1, with the fold line and tick marks showing where and how hard to forge, so you can cut and make the piece in real metal. Undo with Ctrl/⌘ Z.

## What's in it

- A single self-contained HTML file. The flat views are drawn on a 2D canvas. The form uses [three.js](https://threejs.org/) r128 from a CDN. There's no build step.
- **Stretch model:** the fold edge is split into bins along its length. Each blow adds strain with a Gaussian falloff the width of the hammer face. A stretched edge is longer than the metal behind it, so the packet curves with curvature ≈ strain ÷ the depth of the hammered band. Wide wings resist the curl. Opening the packet turns that curve into the arching spine.
- **Work hardening:** the effect of one blow is defined in a single function, `strikeEffect(metal, hardness, hammer, gauge)`. Copper, brass, sterling and fine silver harden at different rates. Metal hit when it is spring-hard cracks, and hard metal limits how far the fold will open. Annealing softens everything again and leaves firescale that you can pickle off.
- Fold forming as a technique was developed by Charles Lewton-Brain. The model here is simplified to build intuition and won't predict a real piece exactly.
- Sounds are synthesized with the Web Audio API. Your work is saved per browser in `localStorage`.
