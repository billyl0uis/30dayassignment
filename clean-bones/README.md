# Clean Bones

A quiet, slightly gross osteology prep game. You work at a prep bench, and a rabbit skull and partial skeleton arrive roughly defleshed but dirty: dried tissue in every crevice, marrow grease, tea-coloured stain and grime. Your job is to get it to a clean, white, complete, museum-quality skeleton without losing a tooth or ruining the bone.

## How to play

- Open `index.html` in a browser.
- **Inspect:** hover a bone to see its tissue, grease, stain, whiteness and integrity. The inspection lamp (<kbd>I</kbd>) maps tissue in red, grease in yellow and stain in brown across the whole tray.
- **Time:** time only passes while a treatment is running. Use ❚❚ / 1× / 5× / 20× (or <kbd>Space</kbd>, <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd>).
- **1. Tissue removal (pick one).**
  - **Dermestid beetles:** dry the specimen first, keep the tank near 27 °C, and feed the colony or lift the specimen out before the larvae start on cartilage. Then freeze it for a week.
  - **Superworms:** fast and rough. They chew thin bone, leave tissue in crevices and drag small bones into the bedding.
  - **Maceration:** warm or cold water. Change it before it goes rancid and stains the bone, and sieve every pour or the teeth and phalanges go down the drain.
- **2. Degreasing:** a warm soap bath, with clear ammonia if you like. Change it when it saturates. Grease you leave in yellows the bone at grading, however white it looked.
- **3. Whitening:** 3% or 12% peroxide, sun, or household bleach. You can combine them.
- **4. Dry and lay out:** drag bones from the drying tray onto their dashed outlines.
- **Grade:** cleanliness, whiteness, intactness, smell and time. The tray then shows the specimen six months later.

## What's in it

- One self-contained HTML file with vanilla JS and SVG, no libraries and no external assets. Textures (dried tissue, grease, stain, grime, chalk, cracks, frass, bran, frost) are painted on a canvas at load and used as SVG pattern fills. Each overlay's opacity follows that bone's state.
- **Specimens are data.** Each entry in `SPECIMENS` lists bones with a shape, an anatomical pose, a slot group (paired bones can swap) and starting tissue, grease, stain and dirt, plus how deep its crevices are, how much marrow it has, how fragile it is and whether it has cartilage. Adding a new animal means adding an object, and new bone outlines go in `SHAPES`.
- **Treatments** live in `PROC`, one `tick(hours)` each, and run in half-hour steps. Events such as a hungry colony, rancid water, a tooth slipping out, mold, a cloudy bath or a passing shower come out of the same ticks.
- **Field notes** unlock as you use each method. They give a short, accurate account of how it's done for real, and are saved per browser in `localStorage`.
- Sound is synthesised with Web Audio (slosh, beetle rustle, fizz) and is off by default.
