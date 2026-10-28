# Known uncertainties

Vitrigraph Lab runs on a **simplified model**. This file lists every place where I don't know how real glass behaves, or where the code makes a convenient guess. Check each one against real pulls and people with vitrigraph experience, then fix `js/config.js` or `js/model.js` and tick it off here.

Every number lives in `js/config.js` and is marked `PLACEHOLDER TO VERIFY`.

## How glass moves through the pot

- [ ] **Flow profile.** The model assumes a parabolic profile: glass in the center column moves down faster than glass at the wall (`speed = 1 − wallSlow·(r/R)²`, `wallSlow = 0.88`). Real flow could be closer to plug flow (everything moves together), could be strongly funnel-shaped near the hole, or could change as the pot empties. The pot's shape (flowerpot taper vs. a straight crucible) probably matters, and the model ignores it.
- [ ] **Layered colors don't switch cleanly.** Because the center drains first, an upper layer shows up first as a *core* inside the lower color and only then spreads outward. Does this core-tunneling really happen, and over how much length does the transition run?
- [ ] **Order in the pot → order in the cane.** The model maps radius in the pot directly to radius in the cane (center → core, wall → casing) and keeps each wedge at its angle. Real glass may smear, swirl or invert near the hole.
- [ ] **Side-by-side colors.** Wedges loaded side by side stay as wedges. Do they twist on their own through the hole, smear, or mix at the boundary?
- [ ] **Slumping.** When the charge melts, each column just drops straight down to fill its own gaps. Real glass levels sideways too, so a pot loaded on one side only would spread out. The model doesn't do this.
- [ ] **When a column runs out.** When the center empties, the outer rings take up the share of the flow. That's a guess at how the last glass funnels in.
- [ ] **Softer and stiffer colors.** Each color has a `soft` offset that shifts its flow index and makes its column outrun or lag its neighbors (`softGain`). Real differences depend on the maker, batch and chemistry. Opal, gold ruby and others are probably not the values given here.

## Heat

- [ ] **Flow index curve.** A logistic stand-in centered on `midTemp` (1640 °F) with `width` 55 °F. It isn't a viscosity curve, and the shape and center are both guesses. Different COE systems flow at different temperatures, and the model ignores that.
- [ ] **Kiln ramp, cooling and glass lag** (`rampPerHour`, `coolPerHour`, `glassLagMinutes`). These depend heavily on the kiln, pot and charge size.
- [ ] **Chunks vs. frit vs. scrap.** Chunks slump a little later. Frit only adds seeds (bubbles) to the slices. Real differences in melt time, trapped air and surface scum aren't modeled.
- [ ] **The first gob.** The model drops gobs over `gobDropMm3` and counts the lost glass. It doesn't know how big a real first gob is, or whether it's usually discarded on purpose.
- [ ] **Devitrification and long holds.** Not modeled. Holding glass hot for a long time, or reheating it, may cause devit or color shifts.

## Pulling

- [ ] **Output rate.** `outputRate ∝ index^1.6 × (hole/ref)⁴ × head`. The diameter-to-the-fourth part comes from pipe flow (Poiseuille). Whether real vitrigraph flow follows it, and the absolute number (`maxFlowMm3PerSec`), are unknown.
- [ ] **Head pressure.** Output drops linearly to `headMin` as the pot empties. That's a guess.
- [ ] **Diameter from mass conservation.** `d = √(4Q / πv)` assumes all of the output goes into the strand and the strand stops thinning once it leaves the gob. In real pulls the strand keeps stretching until it stiffens in the air.
- [ ] **Tearing.** The tear speed is `snapSpeedAtFull × index^1.4`. The real limit depends on the strand's temperature, its diameter and the tension.
- [ ] **Droop and lumps.** Runny glass with a slow pull gets a sine-shaped wobble. That's a stand-in for real sagging.
- [ ] **Coiling** is flagged when the hand turns sharply. It only changes the drawing.
- [ ] **Twist** spins the cross-section at `twistDegPerCm`. Real twist depends on how the strand is held and how stiff it is.
- [ ] **Slot holes (ribbon).** A slot squashes the round slice by its `aspect`. Real slots may thin the edges, curl, or mix the colors differently.
- [ ] **Air cooling** (`airCoolPerSec`) is in the config but isn't used yet.

## Glass

- [ ] **COE list** (`coes`): these are example systems. Mixing systems shows a warning, but the game never claims a mixed load will definitely crack.
- [ ] **Color reactions.** Some colors react with each other where they touch (for example, sulfur- and copper-bearing glasses), which can make dark lines or color shifts. That isn't modeled at all.
- [ ] **Transparency in the side view.** Transparent colors use a fixed 45% see-through blend. It's a rough visual only.

## Safety card

- [ ] Have someone who runs a vitrigraph check the safety card (`js/safety.js`) against your studio's rules, especially the advice on eye protection and on reaching into a live kiln.
