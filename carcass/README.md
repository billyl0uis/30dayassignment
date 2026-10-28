# Carcass

A natural-history prep simulator that starts where real preparation starts: a whole raccoon on the bench. You take it from carcass to catalogued skeleton through the slow, messy middle: skinning, gutting, defleshing, counting the small bones, and weeks of maceration. Mistakes are permanent and carry forward. Some of them, like grease and bleach damage, only show up at grading.

## How to play

- Open `index.html` in a browser.
- **1. Prep & safety:** pick the carcass's condition (fresh, bloated or dried), your PPE and where you work. Missing PPE multiplies every later contamination spike.
- **2. Skinning:** drag the scalpel down the dashed midline. Speed is depth, so a fast cut opens the belly wall. Then press and hold on each body part to peel, and let go before the tension bar fills. Feet and tail each ask how you want to handle them.
- **3. Evisceration:** tie off the gut ends (2), cut the white attachments (1), then drag organs to the bucket (3). A blade across the stomach or intestine punctures it. Free the hyoid before the throat goes in the bucket.
- **4. Gross defleshing:** knife (1) for bulk, scalpel (2) near bone. Scraping bare bone nicks it. Scoop the eyes with the spoon (3), and flush the brain through the foramen magnum with the hose (4) or wire (5).
- **5. Inventory:** drag loose items into labeled bags or the waste bucket. Hover an item to feel it. Several scraps are tissue made to look like bone.
- **6. Final tissue removal:** dermestid beetles, cold or warm maceration, burial or simmering. Skip time by days (or hours on the stove). Events stop the clock: foul water, a dead heater, hungry larvae, a scavenger, a rolling boil. Sieve every pour or lose teeth.
- **7–11:** dry-fit teeth, degrease, whiten, dry and finish (stubs for now), then the specimen card: a grade, what it looks like six months later, and every mistake with a preparator's note.

## What's in it

- One self-contained HTML file with vanilla JS and canvas, no libraries, no external assets. Fur and muscle textures are painted on offscreen canvases at load.
- **Animals are data.** `ANIMALS.raccoon` holds the bone checklist, dentition and art (skeleton parts as `Path2D`, muscle outline). To add a rabbit or a bird, add an entry with the same keys.
- **Decomposition** (`DECOMP`) tunes every stage: peel rate, skin toughness, gut size and wobble, nick risk, wetness for beetles, maceration speed.
- **Mistakes** live in one table, `MISTAKES`. Each has a cause, a fix and a penalty, plus flags for hidden (revealed at grading), safety or hide-only. `addMistake(key)` records one; grading reads the list.
- **Maceration methods** (`METHODS`) each define `tick()` for one day or hour, `finish()` and `draw()`. Events are plain objects with choices.
- Sound is synthesised with Web Audio (wet tissue, scraping, bone nicks, water, flies) and is off by default.
