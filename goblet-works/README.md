# Goblet Works

A 3D glassblowing sandbox for making goblets. You gather molten glass on a blowpipe, blow a bubble, pinch a jack line, pull a stem from a hot bit, paddle a foot, transfer to the punty, open the rim and anneal it, the way a goblet is made in a hot shop. Glass only moves while it glows, so you keep going back to the glory hole. Finished pieces are judged (coupe, flute, wine goblet, or just a vase or paperweight) and can be kept on a shelf.

## How to use

- Open `index.html` in a browser.
- **Bench actions:** <kbd>G</kbd> gather, hold <kbd>B</kbd> to blow, hold <kbd>R</kbd> to reheat, <kbd>T</kbd> to stop or start turning the pipe, <kbd>N</kbd> to add a hot bit, <kbd>X</kbd> to transfer to the punty, <kbd>A</kbd> to anneal.
- **Tools:** pick one, then hold it on the glass. Jacks <kbd>J</kbd> squeeze to the pointer's radius, Tweezers <kbd>P</kbd> pull, Paddle <kbd>F</kbd> flattens the end, Block <kbd>K</kbd> smooths and re-centres, Open <kbd>O</kbd> flares the rim, Shears <kbd>S</kbd> cut.
- Drag empty space (or right-drag) to orbit and scroll to zoom. Ctrl/⌘ Z undoes, even a crack.

## What's in it

- A single self-contained HTML file using [three.js](https://threejs.org/) r128 from a CDN. There's no build step.
- **Lathe model:** the piece is a stack of rings along the pipe, each with an outer radius, a bubble radius, a temperature and a colour. Every tool keeps each ring's glass volume π(R² − r²)·dz, so squeezing makes the glass longer and blowing thins the wall. The 3D mesh is a lathe of that profile, and it glows by temperature.
- **Heat:** thin walls cool fastest, the steel draws heat out at the pipe, and the glory hole warms the far end most. How soft glass is at a given temperature is defined in one function, `workability(T)`. Working glass below about 545 °C, letting it go cold, or reheating it from cold builds stress until it cracks.
- **Blowing** follows hoop stress (∝ r / wall): hot, thin spots run away and can blow out. Surface tension smooths ripples. When the pipe stops turning, gravity bends the hot glass, and that lean shows up in the finished piece.
- **Judging** reads the finished profile for bowl, stem, foot, rim, wall evenness, lean and stability, and names what you made.
- Sounds are synthesized with the Web Audio API. Your shelf is saved per browser in `localStorage`. The physics is simplified to build intuition and won't predict a real piece exactly.
