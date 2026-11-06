---
name: glass-branch
description: Write a ready-to-use, engineered prompt for a new glass design and visualization tool that branches off Jackline (or another project in this repo) in a different direction. Use when the user says "/glass-branch", "branch off this", "give me a prompt for a glass thing that…", or wants a new glass maker idea turned into a build prompt.
argument-hint: "[direction, e.g. 'stained glass panels'] [from <project>]"
---

# Glass branch

Turn a direction into a prompt that a fresh Claude session can build from, carrying over what worked in this repo's glass makers and the lessons learned making them. The output is a prompt, not code.

Arguments: `$ARGUMENTS`. They may hold a direction ("kiln-fused plates") and a base project ("from glass-cad"). The base defaults to `jackline`.

## 1. Read what already exists

Read from `origin/main`, not the working tree: other sessions switch this checkout's branch, so folders come and go.

```bash
git fetch -q origin
git ls-tree -d --name-only origin/main
git show origin/main:README.md
git show origin/main:<base>/README.md
```

Also skim one or two other glass projects' READMEs (`glass-mash`, `glass-blocks`, `glass-cad`, `flacon`, `finial`, `lidded-jar`, `goblet-works`, `gaffer-glass`, `vitrigraph-lab`, whichever exist). The new direction must not repeat one of them; if it is close, say which and sharpen the difference.

For a free port, collect every `port` in `.claude/launch.json` and every `port:` in `*/vite.config.*` on origin/main, and pick the next unused one from 5190 up.

## 2. Pick the direction

If `$ARGUMENTS` names one, use it. Otherwise offer four directions with AskUserQuestion, each a different glass process or object from what exists. Ideas to draw from (skip any that already exist):

- Kiln-formed glass: fused and slumped plates and bowls, with the slump mold and a firing schedule
- Stained glass panels: cut lines, lead or copper-foil came, and printable cutting patterns
- Cane and murrini: pull a pattern, see the cross-section, lay it into a pickup
- Cast glass: design the piece and its mold, with shrink and fill volume
- Neon and tube bending: draw a path, get bends, electrode ends and a 1:1 bending pattern
- Lighting: pendant shades, how light passes through and what it throws on the wall
- Cold-working: facets and cuts on a blank, and how they catch light
- Scientific and lampworked glass: tubing, joints and seals, with wall and strain checks
- Stemware sets: one family of glasses that share proportions across sizes

## 3. Write the prompt

Use exactly these sections, filled in for the direction. Be concrete: real dimensions, real process limits, real names for tools and moves. Leave out anything generic.

```markdown
# <Name>: <one line on what you make with it>

## What it is
Two or three sentences: the object, the process it follows, and the moment of delight (what you draw or do, and what you get back in 3D).

## Who it's for
A glass student or maker designing pieces they could really make; also fun for anyone curious.

## Core interaction
The main input (a 2D drawing, a path, a grid, sliders) and how it becomes 3D. Name the starting presets (6–10 real forms).

## Glass truth
The process facts the tool must respect: materials and their numbers (density, COE, softening point, shrink…), what the process can and can't do, and the hot-shop or studio moves it offers as controls.

## Measures and "Will it work?"
The numbers it shows (size, weight, volume…) and how each is computed exactly. Three to five checks with good / warn / bad thresholds a maker would agree with, each with a one-line reason.

## Exports
A 1:1 printable template or pattern the maker would use at the bench, plus a views sheet (top / front / side at one scale, 3/4 view, dimensions, title block).

## Look and feel
- The 3D view is a plain, evenly lit, light mid-grey studio (about `#74787f` to `#8a8e96`, no bright band, no dark floor) so clear glass reads by its edges and highlights.
- Glass uses MeshPhysicalMaterial transmission; tints come from attenuation, and the backdrop must go through the same tone mapping as the glass or the glass looks milky.
- Dark UI by default with a light toggle; one warm accent color.
- When a look "doesn't feel right", put three to six options side by side in the preview and let me pick, rather than guessing one at a time.
- Change only what I ask about; don't restyle the rest of the app along the way.

## Tech and house conventions
- Folder `<slug>/` at the repo root. Vite + React + three.js (@react-three/fiber, drei) + zustand, plain JSX, port <port>. Mirror the structure of `<base>/`.
- Undo/redo for every edit (checkpoint at the start of a gesture), state saved to localStorage.
- Add a `<slug>` entry to `.claude/launch.json` and a row to the root README.
- README in the folder: what it does, how to run it, how the numbers work.

## First version scope
What's in, and what's explicitly out for now.

## Done when
- It runs in the preview with no console errors, and each preset looks right in 3D.
- The numbers are sanity-checked against a real piece (e.g. a known capacity or weight).
- Each check is tried at its thresholds.
- It's committed on its own branch; publishing waits until I ask.

## Publishing (when I ask)
Build with `npx vite build --base ./ --outDir play`. From a temporary worktree of `origin/main`, copy only `<slug>/` in with `rsync -a --checksum --delete --exclude node_modules --exclude dist`, confirm `play/index.html` names the new build's files, commit, `git push origin HEAD:main`, wait for Pages, and check https://billyl0uis.github.io/30dayassignment/<slug>/play/.
```

## 4. Hand it over

Save it as `branch-prompts/<slug>.md` at the repo root (create the folder if needed), and show the full prompt in your reply so it can be copied.

Then ask, in one question, whether to start it now as its own session. If yes, start a new session with the prompt as its brief (fresh context, its own worktree), titled with the project name.
