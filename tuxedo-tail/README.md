# Tuxedo Tail

A 3D browser toy. Stroke a tuxedo cat with the hand cursor, from its head along its back to the very tip of its tail, and the tail gets a little longer each time. Keep going and the tail outgrows a ruler, a baguette, the cat itself, a car, a city bus and a blue whale, up to an Olympic pool.

## How to play

- Open `index.html` in a browser.
- Move the hand over the cat's head, then along its back to the tip of its tail. You can drag with the mouse button held, just hover, or drag a finger on a touchscreen.
- Finish a stroke to grow the tail. Stroking the wrong way ("against the fur") or slipping off the cat restarts the stroke.
- Click once anywhere to turn on sound: the cat purrs while you pet it and meows when you reach the tail tip.

## What's in it

- A single self-contained HTML file. It uses [three.js](https://threejs.org/) r128 from a CDN and needs no build step.
- The cat is one smooth sculpted mesh, built when the page loads from a signed-distance-field description of its parts. The head and ears move on a small skeleton.
- The tail is rings at fixed spacing along a path that arcs up, drops to the floor and winds away as it grows. It moves in cat body language: a lazy swish, held up with a quivering tip while being petted, a lash when stroked against the fur, and an occasional flick.
- The purr and meow are synthesized with the Web Audio API; there are no audio files.
- Progress is saved per browser in `localStorage`.
