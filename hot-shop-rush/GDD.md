# Hot Shop Rush: Game Design Document

*Working title. Version 0.1, design only, no code yet.*
*Platform: desktop browser, mouse or trackpad only.*

---

## Contents

1. Pitch
2. Core loop diagram
3. Station minigame specs
4. Heat system numbers
5. Multitasking and garage system
6. Customers and order generation
7. Scoring formulas
8. Progression, days 1–20
9. UI layout per screen
10. Asset list and palette
11. Glossary
12. Realism notes
13. MVP build order
14. Name shortlist

---

## 1. Pitch

You've just taken over a small, cluttered glass studio on a seaside main street, and the morning line is already out the door. In **Hot Shop Rush**, customers order cups, vases, pumpkins and paperweights, and you make every piece yourself. You gather from the furnace, marver, pick up frit, blow, shape at the bench with jacks and paddles, transfer to the punty, and crack the piece off into the annealer before it cools too far. Every piece has a live temperature that keeps dropping, and the glory hole is your best friend. Juggle up to four orders by parking pieces in the garage kiln, keep each one inside its working-heat band, and then sweat it out overnight. The next morning you open the annealer and find out which pieces came through clean and which ones went *ping*. It's a cozy, cartoony shop sim built on the real hot shop sequence, in the order a gaffer actually does it.

---

## 2. Core loop diagram

```
                         ┌──────────────────────── DAY ────────────────────────┐
                         │                                                     │
 MORNING                 │   ORDER COUNTER                                     │
 ┌───────────────┐       │   customer arrives → ticket printed → ticket rail   │
 │ ANNEALER      │       │              │                                      │
 │ REVEAL        │       │              ▼                                      │
 │ (yesterday's  │       │   [1] FURNACE: preheat pipe → GATHER → MARVER       │
 │  pieces: clean│       │              │                                      │
 │  or cracked)  │       │              ▼                                      │
 │      │        │       │   [2] COLOR: frit pickup → melt in → BLOW to size   │
 │      ▼        │       │              │                                      │
 │ PICKUP SHELF  │       │              ▼                                      │
 │ reputation ±  │       │   [3] BENCH: blocks / jacks / paddle / shears /     │
 │      │        │       │              optic mold (by product)                │
 │      ▼        │       │              │                                      │
 │ NEW UNLOCKS   │──────▶│              ▼                                      │
 └───────────────┘       │   [4] FINISH: punty transfer → crack off pipe →     │
        ▲                │       open/finish lip → crack off punty → ANNEALER  │
        │                │              │                                      │
        │                │              ▼                                      │
        │                │   HAND-OFF: customer inspects through annealer      │
        │                │   window → stars + tip                              │
        │                │                                                     │
        │                │   Always available from any station:                │
        │                │     GLORY HOLE (reheat)    GARAGE (park a piece)    │
        │                │   Always ticking: HEAT on the active piece          │
        │                └──────────────────────┬──────────────────────────────┘
        │                                       │ CLOSING TIME:
        │                                       │ annealer starts its program
        └───────────────── overnight ───────────┘
```

**Per order:** Ticket → Furnace → Color → Bench → Finish → Hand-off → (overnight) → Reveal → Pickup.
**Per day:** Morning reveal → Open shop → 6–14 orders → Close → Day summary → Sleep.

---

## 3. Station minigame specs

### 3.0 Shared rules for every station

- **One pipe in hand.** The player holds exactly one pipe or punty at a time: the **active piece**. Its heat meter is always visible and always ticking.
- **Glory hole** is a global action. Drag the active pipe onto the glory hole icon at the right edge of any station screen, or press and hold the glory hole button. The station screen dims and the piece reheats (see 4.4). Release to return to the same step you left.
- **Garage** is a global action. Drag the active pipe to an empty garage slot to park it (see section 5).
- **Turning.** In real life the pipe never stops turning. In the game the pipe auto-turns at all times except when a step asks the player to control rotation (marvering, jacking, blocking). During those steps, rotation is the player's input. If the player stalls mid-step for more than 2 s with heat above 80, **off-center** begins to build (see 4.6).
- **Step grading.** Every step produces an **accuracy** (0–100) from its own task and a **heat factor** from time spent in that step's ideal band. See 7.1.

Each station below lists: purpose, inputs, success criteria, heat interaction, failure states.

---

### 3.1 Station 1: Furnace (Pipe Warmer → Gather → Marver)

#### Step 1a: Preheat the pipe (pipe warmer)

- **Purpose:** A cold pipe won't hold glass. This is the game's equivalent of Papa's oven timer: a short wait that creates gaps to fill with other work.
- **Input:** Click a pipe in the rack to slide it into the pipe warmer. A ring timer fills over **8 s** (tunable). Click the warm pipe to take it out.
- **Success:** Ring is in the green zone (≥ 100% warm). Pipes can sit in the warmer indefinitely without penalty.
- **Failure:** Gathering on an under-warm pipe (< 100%) gives a "slipping gather": gather size accuracy is capped at 70.
- **Heat:** None. A preheated pipe has no glass on it yet, so the heat meter hasn't started.

#### Step 1b: Gather

- **Purpose:** Wind the right amount of glass onto the pipe.
- **Input:** The furnace door opens on a cross-section view of the crucible. **Press and hold** inside the crucible to dip and turn. A **gather gauge** beside the crucible fills while held. **Release** to pull out.
  - For **multi-gather** pieces (L size, all Tier 2+ vases, paperweights), the ticket shows 2 or 3 gather marks. After each release the piece cools for a short **set time** (auto, 3 s, shown as a small spinner). Then the player holds again for the next gather.
- **Success:** Release when the gauge needle is inside the **target band**. Band width: ±6% at size M on Day 1, narrowing to ±4% by Day 10.
  - Accuracy = 100 at the band center, falling linearly to 70 at the band edge and to 0 at ±25% from the band center.
- **Heat:** Heat starts at **95** when the first gather leaves the furnace. Each additional gather resets heat to 95.
- **Failure states:**
  - *Too little:* the piece will come out under size. The Size score is capped based on how short the gather was.
  - *Too much:* a heavy gather. Cooling is 10% slower (more mass), but it is harder to center (marver target zone shrinks 20%), and size is over.
  - *Dripping:* holding more than 2 s past the top of the gauge shows a drip animation, and off-center +15.

#### Step 1c: Marver

- **Purpose:** Roll the gather on the steel marver to center it, shape it into a smooth cylinder or cone, and chill the skin.
- **Input:** The view shows the marver from above, with the pipe lying across it. **Click and drag left/right** to roll the pipe. The drag direction sets the rotation direction, and the drag speed sets the rotation speed. **Drag up/down** (while rolling) to slide the gather toward the tip of the marver or back. That shapes the end of the gather: a nose toward the pipe tip is a cone, an even roll is a cylinder.
  - An **eccentricity dot** wobbles at the end of the gather. The goal is to bring it into the center ring and keep it there.
  - The ticket's form sets the **target silhouette** (a dashed outline), and the gather morphs toward it while it is rolled at the right height.
- **Success:** Hold the dot inside the center ring for a cumulative **3.0 s**, with the silhouette overlap ≥ 85%.
  - Accuracy = 0.6 × centering + 0.4 × silhouette match.
- **Heat:** Steel draws heat. Cooling is ×1.6 while in contact with the marver (see 4.3). Ideal band **70–90**.
- **Failure states:**
  - *Rolling too fast* (drag speed above the cap) causes "chatter," and the eccentricity dot jumps.
  - *Rolling a cold gather* (heat < 55) creates a **chill mark**: stress +8 and silhouette match is capped at 80.
  - *Leaving it stationary* on the marver for more than 1.5 s flattens one side: off-center +20.

---

### 3.2 Station 2: Color + Inflate

#### Step 2a: Frit pickup

- **Purpose:** Apply color to match the ticket.
- **Input:** A tray of **frit bins** (and powder, from Day 7) sits on a small steel table. **Click a bin** to pour a patch of frit onto the table. Each click pours one "dose," and the ticket shows how many doses are wanted (1–3). Then **click and drag the pipe across the patch** in a rolling motion (same drag-to-roll as the marver).
  - **Coverage** is the percentage of the gather surface that has touched the frit, shown as a spinning band diagram on the right.
  - Multi-color tickets: pour two colors in the zones shown (e.g., "blue on bottom half, amber on top"). The pattern target is overlaid on the coverage diagram.
- **Success:** Coverage ≥ 90% in the target zones, ≤ 10% bleed outside them, and dose count matched (too many doses makes the color too dark, too few too light).
  - Color score at hand-off = 0.5 × hue match + 0.3 × coverage + 0.2 × density (doses).
- **Heat:** Frit **only sticks while heat ≥ 75**. Below 75, frit grains bounce off (coverage stops rising). Ideal band **78–92**.
- **Failure states:**
  - *Cold pickup:* coverage stalls. The player has to reheat and try again.
  - *Wrong bin:* the color stays on. Hue match is computed against the ticket and is likely low. There's no undo, the same as real life.

#### Step 2b: Melt in

- **Purpose:** Frit must be melted smooth before blowing, or it pits and tears.
- **Input:** Automatic once the player takes the piece into the glory hole. A **"melt-in" bar** appears on the heat meter and fills while heat ≥ 85. It needs **4 s** of glory-hole time above 85. Taking the piece out early leaves "rough frit," and shape accuracy is capped at 85 at the next two steps.
- **Heat:** This is the main reason the color station leans on the glory hole.

#### Step 2c: Blow (inflate)

- **Purpose:** Blow a bubble to the target size.
- **Input:** The view shows the pipe from the side with the mouthpiece at the left. **Press and hold** the mouthpiece to blow. The bubble grows with **lag**: air keeps expanding the bubble for ~0.6 s after release, since hot air expands. **Release early.** A ghost outline shows the target size.
  - Blowing is done in **puffs**. Each hold-release is one puff. The bubble only grows if the heat is high enough to move (see below).
  - An optional **"thumb"** mechanic (Day 8+, for L sizes): after a puff, **right-click** (or hold Shift and click) to cap the pipe with your thumb. The trapped air expands with the heat for a slow, controlled extra growth of +5–8%. This is more precise but slower.
- **Success:** Final bubble diameter within **±5%** of target = 100. Accuracy falls to 0 at ±30%. Wall evenness: blowing while heat is outside 65–85 produces an uneven wall (thin spot), which shows as a lighter patch, and accuracy −10.
- **Heat:** Ideal band **65–85**. Above 85, the bubble grows too fast (×1.6 growth) and droops (off-center +). Below 60, the bubble barely moves (×0.3 growth) and each puff adds stress +3.
- **Failure states:**
  - *Overblown:* > +30% is a **blowout**. The bubble pops (cartoon pop and a puff of steam), and the piece is lost. The player must restart this order from the furnace. The customer's wait timer keeps running.
  - *Underblown:* the size score suffers, but the piece can continue.

---

### 3.3 Station 3: Bench (shaping)

The bench screen shows the gaffer seated at the bench, with the pipe across the rails, seen from the front, slightly above. The **tool rack** on the right holds only the tools this ticket needs, glowing in order. The ticket's **shaping list** is a vertical checklist (e.g., Blocks → Jacks line → Paddle bottom).

**Rolling on the rails:** During every bench step, the player rolls the pipe by **dragging horizontally anywhere along the bottom strip** (the "rails" strip). The tool action is a separate input. On a trackpad, the player alternates: roll with one gesture, then work the tool. To keep it trackpad-friendly, **every bench tool auto-rolls while the tool is engaged** unless the step says otherwise. The rail strip is used to *correct* off-center between tool steps.

#### Step 3a: Blocks (shape the gather early, Tier 2+ vases and all Tier 4)

- **Input:** **Click and hold** the block icon to cup the gather in the wet cherrywood block (steam puff). While held, **drag the mouse in slow circles**. The block rolls and the gather rounds up. A **roundness gauge** fills.
- **Success:** Roundness ≥ 90% within 4 s. Circle speed must stay inside the "steady" band, and a speed indicator on the cursor turns green.
- **Heat:** Wet wood cools the surface (×1.3). Ideal band **72–90**.
- **Failure:** Circling too fast leaves "block marks" (accuracy −15). Blocking a cold gather (< 60) makes a chill wrinkle (stress +5).

#### Step 3b: Jacks: jack line / neck

- **Purpose:** Pinch a groove (the **jack line**) at the base of the piece, near the pipe. This is where it will crack off later.
- **Input:** The jacks appear open over the piece. A **target notch** marker shows where on the piece the line should go. **Click and drag** the jacks along the piece to position them, then **hold** to squeeze. The jacks close slowly while held, and the line deepens. **Release** at the target depth (shown as a depth gauge: target band).
- **Success:** Position within ±5% of the notch, and depth in the band. A shallow line makes crack-off unreliable later (see 3.4). A deep line makes the piece "drop" early.
- **Heat:** Ideal band **55–75**. Above 80 the neck stretches and droops (off-center +10). Below 50 the jacks drag (accuracy −15).
- **Failure:** *Too deep* = **early drop**. The piece falls off the pipe, onto the floor or into a cartoon sand bucket. The piece is lost. *Too shallow* = crack-off at Station 4 needs extra taps and has a 25% chance of a bad break (lip of the base chips, shape −15).

#### Step 3c: Paddle

- **Purpose:** Flatten the bottom so the piece sits level.
- **Input:** The paddle comes in from the right. **Press and hold** to press the paddle against the bottom. The piece auto-rolls. **A level bubble** (a carpenter's-level graphic) shows flatness. Release when the bubble centers.
  - Some forms add **side paddling** (e.g., "squared tumbler" variant): **click-drag** the paddle along a flat-side guide while the piece is *not* rolling. The rotation stops automatically, and there are 4 guides, one per face.
- **Success:** Level bubble centered on release, plus or minus a small tolerance.
- **Heat:** Ideal band **50–70**. Too hot: the bottom bulges back after release (accuracy −20). Too cold: nothing changes, and repeated presses add stress +4 each.
- **Failure:** Holding too long dishes the bottom inward (a concave base, accuracy −25). A tipsy base shows a wobble at hand-off.

#### Step 3d: Shears (trim)

- **Purpose:** Trim the lip evenly once it's on the punty (Tier 2 lips), cut a hot bit (Tier 3 stems), or trim a fold.
- **Input:** A **dashed cut line** appears. **Click-drag to trace** along the dashed line while the piece auto-rolls under the shears. The trace speed must roughly match the roll speed (a speed match meter). Each click is one "snip."
- **Success:** Trace deviation is the average distance from the dashed line. ≤ 4 px = 100, ≥ 20 px = 0. The lip height evenness is computed from the trace.
- **Heat:** Ideal band **60–80**. Below 55 the glass won't cut cleanly ("shear chatter": the trace line jitters, accuracy −20, and a small stress spike).
- **Failure:** Cutting too deep removes too much height: the size score drops.

#### Step 3e: Optic mold (Tier 3)

- **Purpose:** Give pumpkins their ribs and ornaments their optic pattern.
- **Input:** The mold sits on the floor. The pipe hangs vertically above. **Drag the pipe down** into the mold. The insertion depth matters. Then **hold** to push and blow lightly into the mold (bubble expands into the ribs). Release and **drag up** to pull it out. For **twisted optic** (Day 15+): after pulling out, **drag in a circular arc** to twist the ribs. The arc's degrees = the swirl, matched to the ticket.
- **Success:** Insertion depth in band (rib length) + hold time in band (rib depth) + twist angle within ±15°.
- **Heat:** Ideal band **75–90**. A cold piece doesn't take the ribs (rib depth capped at 40%). A very hot piece sticks in the mold (+1 s extra, off-center +10).
- **Failure:** Mis-insertion (off-center pull) leaves crooked ribs. Rib count is fixed by the mold the player picks (8, 10 or 12 ribs). Picking the wrong mold is a hue-like error for Shape.

#### Step 3f: Tweezers + stem bit (Tier 3 pumpkins, ornament hanger)

- **Purpose:** Add a small hot bit and pull it into a stem or a loop.
- **Input:** Click the **bit bell** to call the assistant (see Juno in section 6). The assistant brings a **hot bit** after **5 s** (a timer, a juggling gap). When it arrives, **drag the bit onto the target spot** (the top of the pumpkin). Then **drag outward and twist** with the tweezers to pull the stem. For ornament loops, **trace a small loop shape**.
- **Success:** Placement within the target ring. The stem's length and curl match the ticket's stem style (Straight, Curly, Leaf-tipped from Day 18).
- **Heat:** The bit has its own small heat meter: it starts at 90 and cools at ×2 the piece rate (small mass). It must be applied while above 70 or it won't bond (**cold seal**: crack chance +20% in the morning).

---

### 3.4 Station 4: Finish (Punty → Crack-off → Lip → Annealer)

#### Step 4a: Punty transfer

- **Purpose:** Attach a punty to the bottom of the piece so the lip end can be opened.
- **Input:** The assistant (or the player, from the punty rack) brings a punty with a small gather. A **crosshair** marks the center of the piece's flat bottom. **Drag the punty tip** to the crosshair and **click** to stick it. The punty must line up with the pipe's axis. An **alignment line** shows a straight-through line when aligned.
- **Success:** Center offset ≤ 5% and angle ≤ 5°.
- **Heat:** Piece band **50–70** (firm enough not to deform). The punty gather has its own heat (starts at 92). If the punty gather is below 75 when attached, it's a **weak punty** and the piece can fall during 4c (a 15% chance per lip step).
- **Failure:** An off-center punty makes the piece wobble during lip work (off-center +15 throughout the lip steps).

#### Step 4b: Crack off the pipe

- **Input:** **Click the jacks** to drip water on the jack line (steam puff), then **click 1–3 times** on the pipe to tap it. Tap count depends on jack line depth from 3b. A good line takes 1 tap.
- **Success:** A clean break on the first tap. Every extra tap adds stress +2.
- **Heat:** Not banded. Just a quick action.
- **Failure:** A chipped lip end (from a shallow jack line) reduces shape. Also see the weak punty failure above.

#### Step 4c: Open / flare / finish the lip (Tier 2+; Tier 1 tumblers do a short "finish lip" only)

- **Purpose:** The piece now has a small hole where the pipe was. Reheat it, then open it up with the jacks and flare with the paddle or a wood (a soffietta and other tools are reserved for later).
- **Input:**
  1. **Reheat the lip** in the glory hole. The lip has its own **lip heat** sub-meter, which reheats twice as fast as the body, since only the lip goes in. Ideal lip band: **70–88**.
  2. **Open:** Jacks go into the opening. **Hold and drag outward** (away from the piece's center). The opening widens to match the **target opening width**, shown as two side markers. The piece auto-rolls.
  3. **Flare (bowls, Tier 2):** Switch to the paddle or the wood. **Drag in an arc outward** to fold the lip out. A **flare angle** indicator shows the target angle. Each pass adds flare.
  4. **Trim** (if the ticket asks for an even rim): see Shears 3d.
- **Success:** Opening width ±6% and flare angle ±8° of the target.
- **Heat:** If the lip falls below 60, flare stops working, and forcing it adds stress +5 and a 10% chance of a lip crack (instant: shape −30).
- **Failure:** Over-flaring past the target + 20° makes the lip **drop** (a sagging rim): shape −30. An over-hot body (> 90) during lip work means the body goes off-center.

#### Step 4d: Crack off the punty into the annealer

- **Input:** Open the **annealer door** (click). Drag the piece over the annealer shelf. **Click the punty** to tap it off. The piece settles onto the shelf (on a fiber blanket) inside. Close the door (click) — or it auto-closes after 3 s.
- **Success:** Piece loaded with heat in the **load band 40–65**.
- **Heat:**
  - Loaded above 65: fine for stress, but there's a small chance (5%) of "shelf marks" (shape −5), since the piece is still soft.
  - Loaded at 25–40: **load penalty** for overnight cracking (see 7.3).
  - Below 25: the piece has to be reheated before loading, or it will almost certainly crack.
- **Door open too long** (> 6 s): every second over drops the annealer's internal temperature. Every piece already inside gets crack chance +1% per extra second. This is a light realism nudge.

#### Hand-off (inspection)

Once the piece is in the annealer, the customer walks to the **annealer window**, peers in, and rates it. The piece stays inside overnight and gets picked up the next morning. This lets the customer judge shape, color and size immediately, as in Papa's, while the second score lands in the morning reveal.

---

## 4. Heat system (all values tunable)

All heat values use a **0–100 Heat scale**. Flavor temperatures in °F appear on the meter's tooltip for players who want them. The mapping is approximate and for flavor, not physics:

| Heat | Flavor °F | Meaning |
|---|---|---|
| 100 | ~2,150 | Furnace glass |
| 90 | ~2,000 | Very soft, moving fast |
| 75 | ~1,800 | Hot working heat |
| 60 | ~1,600 | Firm working heat |
| 45 | ~1,350 | Stiff: tools barely move it |
| 30 | ~1,100 | Setting up, risk of checks |
| 20 | ~1,000 | Real annealing / garage range |
| ≤ 12 | < 950 | Cracking zone (thermal shock risk) |

### 4.1 Global constants (starting values)

| Constant | Default | Notes |
|---|---|---|
| `H_START` | 95 | Heat when a gather leaves the furnace |
| `H_AMBIENT` | 10 | The floor the cooling curve approaches |
| `H_REF` | 70 | Reference heat where cooling = base rate |
| `COOL_BASE` | 2.4 heat/s | At H_REF, size M, no tool contact |
| `GH_RATE` | 14 heat/s | Glory hole base reheat |
| `GH_TARGET` | 100 | Glory hole asymptote |
| `SLUMP_THRESHOLD` | 92 | Off-center builds above this |
| `CRACK_INSTANT` | 12 | At or below: the piece checks and is lost |
| `STRESS_COLD_LINE` | 40 | Below this, stress accrues |

### 4.2 Cooling formula

Every frame, the active piece cools:

```
dH/dt = - COOL_BASE
        × sizeMult
        × contactMult
        × ((H - H_AMBIENT) / (H_REF - H_AMBIENT))
```

The last factor makes cooling fast while hot and slow as the piece approaches ambient, like real Newton's-law cooling. At H = 95 the rate is about 1.4× base, and at H = 40 it is about 0.5× base.

**Size multipliers** (`sizeMult`): small pieces lose heat faster.

| Size | sizeMult |
|---|---|
| S | 1.25 |
| M | 1.00 |
| L | 0.80 |
| Solid (paperweight) | 0.55 |

**Contact multipliers** (`contactMult`), applied only during the step:

| Contact | contactMult |
|---|---|
| Air (between steps) | 1.0 |
| Marver (steel) | 1.6 |
| Blocks / wet wood / newspaper pad | 1.3 |
| Jacks, paddle, shears | 1.15 |
| Optic mold | 1.4 |
| Garage | special (see 5.3) |

**Ballpark:** an M tumbler out of the glory hole at 90 drops to 65 in about **9.5 s** in air and about **6 s** on the marver. (Closed form: `H(t) = H_AMBIENT + (H0 − H_AMBIENT) · e^(−k·t)`, with `k = COOL_BASE · mults / (H_REF − H_AMBIENT)` = 0.04/s in air for M.) That's tight but fair for a 3–6 s step plus the travel between steps. It's also why the player goes back to the glory hole roughly every 2 steps, like a real gaffer.

### 4.3 Station ideal bands

| Step | Ideal band | Hard floor (no effect below) |
|---|---|---|
| Marver | 70–90 | 45 |
| Frit pickup | 78–92 | 75 (frit won't stick) |
| Melt-in | ≥ 85 for 4 s | — |
| Blow | 65–85 | 55 |
| Blocks | 72–90 | 55 |
| Jacks (line) | 55–75 | 45 |
| Paddle | 50–70 | 40 |
| Shears | 60–80 | 55 |
| Optic mold | 75–90 | 60 |
| Punty transfer (piece) | 50–70 | 40 |
| Lip open / flare (lip heat) | 70–88 | 60 |
| Annealer load | 40–65 | 25 |

### 4.4 Glory hole reheat

```
dH/dt = + GH_RATE × sizeReheatMult × ((GH_TARGET - H) / (GH_TARGET - H_REF))
```

At H = 70 the reheat is 14/s. At H = 90 it's about 4.7/s, so it naturally slows near the top. The player still has to pull the piece out before 92, or off-center builds.

| Size | sizeReheatMult |
|---|---|
| S | 1.3 |
| M | 1.0 |
| L | 0.8 |
| Solid | 0.5 |

**Lip heat** (Station 4) reheats with a multiplier of **2.0** (only the lip goes in), and the body reheats at **0.4** while the lip is in.

**Turning in the glory hole:** auto. An optional "Turn It Yourself" toggle (default off) makes the player drag in circles inside the glory hole to keep turning. This gives a 10% faster reheat in exchange for the effort. It exists for players who want to feel it, and is off by default for trackpad comfort.

**Glory hole door "flash":** each glory hole entry costs **1.2 s** of travel animation (in and out). Frequent tiny reheats are worse than one good one. This is a soft lesson in efficiency.

### 4.5 Stress

Stress `S` (0–100) is hidden internal tension in the piece. It's shown as a faint blue "frost" creeping in at the edges of the piece (unobtrusive). It feeds the morning crack roll (see 7.3).

```
if H < STRESS_COLD_LINE:
    dS/dt = + 1.5 × (STRESS_COLD_LINE - H) / 10      # e.g. at H=30: +1.5/s
```

Event spikes:

| Event | Stress |
|---|---|
| Marvering below 55 (chill mark) | +8 |
| Blocking below 60 | +5 |
| Paddle press below 40 (each) | +4 |
| Forced flare with lip heat < 60 | +5 |
| Each extra crack-off tap | +2 |
| Blowing below 60 (each puff) | +3 |

**Stress relief:** while H ≥ 80 in the glory hole, stress falls by **3/s** but **never below 50% of its peak value** for that piece. Reheating helps, but it doesn't erase sloppy work. This is a gameplay rule, not physics (see section 12).

**Instant crack:** if H ≤ `CRACK_INSTANT` (12) on the active piece, it checks and breaks. The cartoon crack animation plays with a *tink*, the piece is lost, and the order must restart.

### 4.6 Off-center (slump)

Off-center `O` (0–100) is a direct shape-quality loss.

| Cause | Rate / spike |
|---|---|
| H > 92 (any time on the pipe) | +4/s |
| Stalled while H > 80 during a manual-rotation step (> 2 s) | +3/s |
| Leaving the gather stationary on the marver > 1.5 s | +20 |
| Gather drip | +15 |
| Blowing at H > 85 | +2 per puff |
| Off-center punty | +15 |

**Correcting:** the rail strip at the bench (3.3) and the marver both reduce O. Rolling while in the step's band takes O down at **−6/s**. Floor: O can't go below 25% of its peak once the piece is past Station 3 (the shape has set).

### 4.7 Tuning knobs summary

Everything above is exposed in a single `heat.config` table so the designer can tune without code changes:
`H_START, H_AMBIENT, H_REF, COOL_BASE, GH_RATE, GH_TARGET, SLUMP_THRESHOLD, CRACK_INSTANT, STRESS_COLD_LINE, sizeMult[], contactMult[], sizeReheatMult[], bands[step], stressEvents[], offCenterEvents[], STRESS_RELIEF_RATE, STRESS_FLOOR_FRACTION, GH_TRAVEL_S`.

Recommended difficulty presets:

| Preset | COOL_BASE | Band widths | CRACK_INSTANT |
|---|---|---|---|
| Studio Visit (easy) | 1.8 | +6 each side | 5 |
| Production (default) | 2.4 | as listed | 12 |
| Gaffer (hard) | 3.0 | −3 each side | 18 |

---

## 5. Multitasking and garage system

### 5.1 The physical layout of attention

- **Ticket rail:** top of every screen. One ticket per active order, color-coded by customer, with a small icon of the order's current state: *Waiting*, *On Pipe*, *Garaged*, *In Annealer*.
- **Station tabs:** bottom of every screen, as in Papa's: **Counter · Furnace · Color · Bench · Finish**. Click to switch.
- **Active piece:** the pipe in hand travels with the player when switching stations. If the player switches to a station that doesn't match the piece's next step, the piece **comes along anyway** (still cooling) but the station's tools are greyed out. A warning arrow points to the correct tab.
- **Garage:** a horizontal strip of slots, docked at the right edge above the glory hole button, visible on every station screen.

### 5.2 Rules

1. **One in hand.** The player holds at most one piece at a time.
2. **Unstarted orders don't cool.** A ticket on the rail without glass is just paper.
3. **Pipes in the warmer don't cool and can't spoil.** The pipe warmer has **2 slots** (fixed). It's a free place to stage the next order.
4. **Every gathered piece is either in hand, in the garage, or in the annealer.** There's no setting a piece down anywhere else. Trying to switch to another order with a piece in hand and a full garage triggers a prompt: "Your hands are full! Garage or annealer?"
5. **Assistant timers keep running** while the player is elsewhere (hot bit, punty prep). Delivered bits sit on a **bit holder** for 6 s before they're too cold to use.

### 5.3 Garage kiln behavior

| Parameter | Default | Notes |
|---|---|---|
| Slots | 1 at start → 2 (Day 4) → 3 (Day 9) → 4 (Day 15) | Only upgrade path in the game |
| Garage hold temp | `H_GARAGE` = 55 | The piece drifts toward 55 |
| Drift rate | ±3 heat/s toward H_GARAGE | Hot pieces cool, cold pieces gain a little |
| Stress while garaged | none | The garage is even heat, which is why it's safe |
| Grace period | 40 s | No quality loss |
| Quality decay after grace | −1 point of final score per 4 s | Shown as a small hourglass on the slot |
| Decay cap | −25 | A piece left all day is still deliverable, but mediocre |
| Max-time warning | 120 s | The slot glows red. At 180 s the piece "sags on the pipe" (off-center +30, applied once) |

**Picking a piece back up:** click the slot. The piece comes back at about heat 55, which is below most working bands. The player almost always needs a glory hole trip next. This is the real cost of parking, and it's what makes juggling a strategic decision instead of a free action.

**Why the decay?** Without it, the garage becomes an infinite pause button, and the heat meter stops mattering. The grace period means short parks (the normal case) are free, while forgotten pieces cost something.

### 5.4 Timing targets for fairness

- A **Tier 1 tumbler**, done cleanly with no juggling, takes about **55–70 s** from gather to annealer.
- A **Tier 2 vase** takes about **80–100 s**.
- **Customer patience** starts at about 3× the solo build time of the order (see 6.3).
- **Natural gaps** the player can fill with other orders:
  - Pipe warmer: 8 s
  - Melt-in in the glory hole: 4 s (can't leave it, so not a real gap)
  - Hot bit delivery: 5 s
  - Punty prep: 6 s (assistant)
  - Gather set time between gathers: 3 s each
- Design target: with 3 concurrent orders at Day 10 tuning, a competent player should be busy about 80% of the time with no idle waits, and should need the garage 2–4 times per order set.

### 5.5 Queue and arrival logic

- Customers arrive at the counter on a schedule (6.2). The **Counter** tab flashes and a bell rings.
- Taking an order (clicking the customer and then "Take Order") prints a ticket, which slides onto the rail. The customer's **patience** timer starts then, not on arrival. But customers waiting at the counter to place an order have a short **lobby patience** (45 s). If it runs out, they leave, and that's a reputation hit (−1 heart with that customer).
- **Rail cap:** 5 tickets at most. When the rail is full, new customers wait in the lobby.
- **Reordering tickets:** drag tickets left/right on the rail to reorder. This is purely organizational.
- **Active ticket:** clicking a ticket highlights its order's steps in the station tabs (small dots show which stations it still needs).

### 5.6 A typical moment: three orders in progress (Day 10, garage has 3 slots)

Orders:
- **A:** Pip's M tumbler, cobalt frit, straight lip. Currently at the bench.
- **B:** Marguerite's L vase, two-color (amber over clear). Pipe is in the warmer.
- **C:** Twig's S bowl, turquoise, flared lip. Ticket on the rail, not started.

| Time | What the player does | Why |
|---|---|---|
| 0:00 | At the **Bench** with A (heat 68). Jacks line, hold, release in band. | The jack line band is 55–75. Heat is perfect. |
| 0:04 | Paddle the bottom: A's heat is now 61. Level bubble centered. | Paddle band is 50–70. |
| 0:07 | A's next step is the punty transfer. Click the **bit bell / punty request**: the assistant starts the 6 s punty prep. | A gap opens. |
| 0:08 | Drag A into **Garage slot 1** (A heat 59 → drifts toward 55). | Hands free during the punty prep gap. |
| 0:09 | **Furnace** tab: B's pipe is warm. First gather (hold, release in band). Set time starts (3 s). | Start the long order during the gap. |
| 0:13 | Second gather for B. Heat 95. **Marver**: drag-roll, center dot in the ring for 3 s. | |
| 0:18 | **Color** tab with B: pour amber, roll on the bottom half zone. B heat 84 → coverage ok. | Frit needs ≥ 75. |
| 0:22 | **Glory hole** for melt-in (4 s above 85). | |
| 0:27 | Punty prep is done (the ticket icon pings). B is hot. Put B in **Garage slot 2**. | B is in the garage at 88, so it'll drift down and not overheat. |
| 0:28 | Pull **A** from slot 1 (heat 55). Glory hole briefly → 64. **Finish** tab: punty transfer (piece band 50–70). Crack off the pipe with one tap. | A was garaged 20 s: within grace, no decay. |
| 0:36 | Reheat A's lip (lip heat to 80). Open with jacks to the target width. Finish lip. | Tier 1 only needs a short finish. |
| 0:44 | Open the annealer, tap off the punty at A heat 52 (load band 40–65). **A is done.** Pip walks up to the annealer window and rates it. | First hand-off. |
| 0:47 | Click C's ticket: put a pipe in the **pipe warmer** (8 s). | Stage the next order before returning to B. |
| 0:48 | Pull **B** from slot 2 (heat 55: it drifted down from 88 in about 11 s). Glory hole → 80. **Color**: pour clear over the top half. | The second color zone. |
| 0:55 | Glory hole melt-in, then **Blow**. B is an L, so use the thumb technique for the last 6%. | |
| 1:05 | C's pipe has been warm since 0:55. B is mid-blocking at the bench, so keep going: the pipe warmer doesn't spoil. Next gap (B's punty prep) is when C gets its gather. | Patience check: C has plenty of time left. |

This illustrates the core rhythm: **gap → garage → start or advance another order → retrieve → reheat → continue.** The garage is the hinge, and the glory hole is the tax for using it.

---

## 6. Customers and order generation

### 6.1 Ticket contents

| Field | Values | Unlock |
|---|---|---|
| Form | Tumbler, Cup (handle), Bowl, Vase (bud/round/cylinder), Pumpkin, Ornament, Paperweight | per tier |
| Size | S / M / L | S, M Day 1. L Day 6 |
| Colors | 1–3 frit colors, each with a zone (whole, top, bottom, band, speckle) | 1 color Day 1. 2 colors Day 5. 3 colors Day 13 |
| Density | Light / Medium / Deep (= 1 / 2 / 3 doses) | Day 3 |
| Lip | Straight / Flared / Rolled* / Pinched* | Flared Day 6. *Day 12+ |
| Optic | None / Ribbed (8, 10 or 12) / Twisted | Day 11 / Day 15 |
| Stem / loop | Straight / Curly / Leaf | Day 11 / Day 18 |
| Special | e.g., "squared sides," "extra flat foot," "big bubble inside" (paperweight) | varies |

### 6.2 Arrival schedule

Each in-game day is **8 real minutes** of shop time (tunable `DAY_LENGTH_S = 480`), with the clock shown as a shop clock (10:00 AM to 6:00 PM). Orders can't be taken in the last 60 s ("Last call!"). Pieces must be in the annealer before closing.

```
customersPerDay(day) = clamp(5 + floor(day × 0.45), 5, 14)
arrivalGap(i)        = (DAY_LENGTH_S - 90) / customersPerDay × jitter(0.6 .. 1.4)
```

**Rush window:** between 12:00 and 1:00 PM, the arrival gap is ×0.6.

### 6.3 Order generation rules

1. **Pick the customer.** Regulars appear on their **visit days** (each has a schedule, see 6.4). Remaining arrivals are drawn from the walk-in pool.
2. **Pick the form.** Weighted toward the newest unlocked tier (newest tier 40%, the rest spread evenly) for the first 3 days after the unlock, then flat across all unlocked forms. Regulars override this with their favorites.
3. **Pick the complexity budget.** Each order gets a complexity score from the day:
   ```
   budget(day) = 2 + floor(day / 3)          # Day 1: 2, Day 10: 5, Day 20: 8
   ```
   Each ticket feature costs points: 2nd color = 1, 3rd color = 2, L size = 1, flare = 1, optic = 2, twist = 2, stem style beyond straight = 1, special request = 1–2. Features are added randomly from the unlocked set until the budget is spent.
4. **Patience:** `patience_s = soloBuildTime(form, features) × 3.0 × customer.patienceMult`.
5. **Price:** `basePrice = formPrice[form] + 4 × complexityUsed` (in shop coins, purely for score/tips).

### 6.4 Sample customers (original characters)

| Name | Look | Personality | Orders & preferences | Scoring quirks | Visits |
|---|---|---|---|---|---|
| **Pip Albright** | Small kid, oversized raincoat, a gap in their teeth | Wide-eyed, wants to watch everything | Tumblers, always the brightest color available | Weighs **wait time ×0.5**: Pip loves watching. Tips small but gives a +1 heart bonus for perfect pieces. | Every 2nd day from Day 1 |
| **Marguerite Fennimore** | Tall, silver bob, garden gloves in her pocket | Gracious, a flower arranger, precise | Vases for her arrangements: L size, two colors, flared lips | Weighs **shape ×1.5**, especially the lip flare. Patience ×1.3. Cracks in the morning cost her heart double: she's planned an arrangement around it. | Days 6, 9, 12, 15, 18, 20 |
| **Dez Okoro** | Builder's vest, sawdust, huge mustache | Gruff but sentimental, buys gifts for his crew | Ornaments in December and pumpkins in fall: buys in **pairs** (two tickets at once) | Weighs **color match ×1.5**: the pair must match. A mismatch between the two pieces gives −15 to both. | Every 3rd day from Day 11 |
| **Ines "Twig" Halvorsen** | Art-school student, paint on her sleeves, a sketchbook | Chatty, knows a little glass and says terms wrong, which teaches the glossary ("is that the… punty? the gaffer? I always mix them up") | Weird color combos, three colors, speckle zones | Weighs **color ×1.3**, **size ×0.6** (she doesn't care). Bonus tip if the player uses a color she's never had before. | Every 2nd day from Day 7 |
| **Mr. Baptiste Lowe** | Retired chemistry teacher, cardigan, monocle-style reading glasses | Picky, polite, holds pieces up to the light | Paperweights and perfectly plain clear tumblers | Weighs **heat handling ×2** (he can "see stress"). Any stress > 40 is visible to him as a "strain shadow," −10. Perfect morning reveals earn him a +2 heart bonus. | Days 16–20, every day |
| **The Ruiz Twins (Lola & Benny)** | Matching hats, bickering | Order together, then argue about which one is better | Bowls in contrasting colors | Each rates the *other's* piece. The two scores are averaged, and the lower one is shown. Patience ×0.8: they're impatient. | Days 8, 13, 17 |

**Walk-in pool** (not detailed here): about 20 generic townsfolk with randomized looks, standard weights, and patience ×1.0.

**Assistant (not a customer):** **Juno**, the shop's assistant. Big gloves, safety glasses pushed up on their forehead, and they hum while they work. Juno brings hot bits and punties, opens the annealer in the morning, and gives tutorial tips. Juno never takes over the player's work: they only run the timers.

### 6.5 Reputation

- **Per-customer hearts** (0–5). Changed by hand-off scores (≥ 85: +1, < 50: −1), morning reveals (crack: −1, or −2 for Marguerite), and lobby walkouts (−1).
- **Shop reputation** = the average hearts of all customers met, shown as a star on the shop sign. It affects tips (×0.8 to ×1.2) and the number of walk-ins per day (±1).
- A regular at 5 hearts unlocks their **favorite piece** in the shop's display window: a purely cosmetic shelf in the shop, a collection goal.

---

## 7. Scoring formulas

### 7.1 Per-step score

```
heatFactor(step) = 0.55 + 0.45 × fractionOfStepTimeInBand(step)
stepScore(step)  = accuracy(step) × heatFactor(step)                 # 0–100
```

A step done perfectly but entirely out of band still scores 55% of its accuracy, so the heat meter matters a lot without being a total wipeout.

### 7.2 Hand-off score (customer inspection)

Five categories, each 0–100.

| Category | Formula |
|---|---|
| **Shape** | mean(stepScore of all shaping steps: marver, blocks, jacks, paddle, shears, optic, lip, stem) − 0.5 × O_final |
| **Color** | mean over zones of (0.5 × hueMatch + 0.3 × coverage + 0.2 × densityMatch) |
| **Size** | 100 − 4 × abs(% size error), clamped to [0, 100] |
| **Heat Handling** | 100 × fractionOfTotalWorkTimeInSomeBand − 0.6 × S_final |
| **Wait** | 100 if done within 50% of patience. Linear down to 30 at 100% of patience. Below 30 after patience runs out (min 0). |

`hueMatch` = 100 − 1.2 × ΔE (CIE76 distance between the frit color used and the ticket color, in Lab). Same bin = 100. A close neighbor (e.g., cobalt vs. dark blue) ≈ 75. Off-family ≈ 0–30.

**Weights:** the default weights are Shape 0.30, Color 0.20, Size 0.15, Heat 0.15, Wait 0.20. Each customer multiplies some weights (see 6.4). Then the weights are re-normalized to sum to 1.

```
handoffScore = Σ (weight_i × category_i)                             # 0–100
stars        = round(handoffScore / 20 × 2) / 2                      # 0–5 in half stars
tip          = basePrice × (handoffScore / 100)^2 × repMult × customer.tipMult
garageDecay  = applied as a direct subtraction to handoffScore before stars (cap −25)
```

**Ratings shown at hand-off:** an inspection card with four bars (Shape, Color, Size, Heat) plus the wait clock, and the customer's reaction line. As in Papa's, the bars count up one by one with a sound.

### 7.3 Morning crack roll

Each piece in the annealer rolls once when the annealer opens:

```
pCrack = clamp(
    0.70 × (S_final / 100)^1.5        # accumulated stress (nonlinear: low stress ≈ safe)
  + loadPenalty
  + soakPenalty
  + coldSealPenalty
  + doorPenalty,
  0, 0.95)
```

| Term | Value |
|---|---|
| loadPenalty | 0 if loaded at H ≥ 40. 0.10 at 30–40. 0.30 at 25–30. 0.60 below 25. |
| soakPenalty | 0 if in the annealer ≥ `SOAK_MIN` before closing. Otherwise `0.25 × (1 − timeInAnnealer / SOAK_MIN)`. `SOAK_MIN` = 45 s for hollow ware, 90 s for solid. |
| coldSealPenalty | 0.20 per stem / loop / bit applied below 70 |
| doorPenalty | 0.01 per second the door was left open past 6 s while this piece was inside |

At S_final = 20 with a good load, pCrack ≈ 6%. At S_final = 50, ≈ 25%. At S_final = 80, ≈ 50%. Players learn quickly that the heat meter really does matter.

**Soak** is how "rushed annealing" shows up: pieces loaded just before closing don't get their full soak, and the risk is shown with a small hourglass icon on the annealer window. Paperweights have double the soak requirement, which makes the last 2 minutes of every Tier 4 day interesting.

### 7.4 Morning reveal ritual

1. **Dawn shop.** It's quiet, with soft blue light. Juno yawns and puts on gloves. The annealer's display reads "Program complete. 74°F."
2. **Door opens.** A warm glow and a gentle *whoomph*.
3. **One by one**, Juno lifts each piece onto the **pickup shelf** in order of hand-off. Each piece gets a 1.2 s beat:
   - **Clean:** a little sparkle, a clear glass *ting*, and a "CLEAN" stamp in the shop's ink style.
   - **Cracked:** a beat of silence, then a *ping*. A crack line draws across the piece and it shows a "CRACKED" stamp. Juno says something kind ("happens to everyone").
   - **Pity save** (gameplay softener): if a piece's pCrack was < 10% and it still cracked, Juno says "that one was just bad luck." It still counts, but the line takes the sting out.
4. **Tally:** a "Clean rate" percentage with a little chime that rises with the rate. A perfect night (100% clean, ≥ 3 pieces) earns a **Clean Sweep** badge on the calendar.
5. **Pickup:** as customers come in during the next day's opening minutes, they pick up their pieces from the shelf. Clean pieces get a happy reaction (+tip bonus 20% of the original tip). Cracked pieces get a refund reaction (lose the original tip) and the heart change.

The pickup happens in the first 60 s of the day, automatically, while the player is already taking new orders. It's a soft moment, not a minigame.

---

## 8. Progression: days 1–20

Garage slot upgrades are the only "upgrade" in the game, and they're tied to days.

| Day | Unlocks / events | New customers | Garage slots | Notes |
|---|---|---|---|---|
| 1 | **Tier 1: Tumbler (S, M)**, 1 color, straight lip. Guided tutorial through all 4 stations. | Pip | 1 | 5 customers. Very wide bands. The annealer reveal tutorial on Day 2 morning. |
| 2 | First morning reveal. Glory hole hint popups turn off. | — | 1 | |
| 3 | **Density** (light/medium/deep) on tickets. | — | 1 | |
| 4 | **Garage slot 2.** A tutorial juggling 2 orders. | — | 2 | |
| 5 | **Two colors** with zones (top/bottom). **Cup with handle** (Tier 1 variant: an applied hot bit handle, introduces the bit bell). | — | 2 | |
| 6 | **Tier 2: Bowl (S, M) & flared lip.** **L size.** Lip work tutorial. | Marguerite | 2 | Start of the "opening, flaring, lip work" arc |
| 7 | **Powders** (finer color, less coverage per dose, but even). | Twig | 2 | |
| 8 | **Tier 2: Vases** (bud, round, cylinder). **Blocks** introduced. Thumb technique for L. | Ruiz Twins | 2 | |
| 9 | **Garage slot 3.** | — | 3 | |
| 10 | **Mid-season festival:** a day of double walk-ins, all Tier 1–2 forms. | — | 3 | A difficulty spike and a checkpoint |
| 11 | **Tier 3: Pumpkins** (optic mold, 8/10/12 ribs, straight stem). | Dez | 3 | Optic mold + stem tutorial |
| 12 | **Rolled & pinched lips.** | — | 3 | |
| 13 | **Three colors**, speckle zones. | — | 3 | |
| 14 | **Tier 3: Ornaments** (optic, hanger loop). | — | 3 | |
| 15 | **Garage slot 4.** **Twisted optic.** | — | 4 | |
| 16 | **Tier 4: Paperweights** (solid, layered gathers, newspaper pad shaping, encased frit, long soak). | Mr. Lowe | 4 | Solid work tutorial: no blowing, bigger gathers, longer annealing |
| 17 | **Controlled bubble** paperweight special (a single trapped bubble poked with a pick). | — | 4 | |
| 18 | **Leaf-tipped stems**, curly stems. | — | 4 | |
| 19 | **Solid sculpted forms** (a simple "pebble" and "drop" sculpture, shaped with jacks and tweezers). | — | 4 | |
| 20 | **Season finale:** an open-studio night. All regulars visit, and there's a "Commission" from Marguerite (one large 3-color twisted optic vase). | All regulars | 4 | A teaser screen at the end: **"Coming soon: cane & murrini"** with a picture of a cane pull |

**Paperweight station flow (Tier 4):** Furnace (3 gathers, each with frit between) → Color (encase pattern) → Bench (newspaper pad shaping instead of blowing, then jacks line, paddle bottom) → Finish (punty transfer optional: crack off directly from the pipe into the annealer for simple weights). Solid cooling and reheating are slow (sizeMult 0.55, reheat 0.5): this is a calmer, more deliberate tier, but the long soak creates end-of-day pressure.

---

## 9. UI layout per screen

All screens target **1280×720**, scaling up, with a minimum of 1024×640. All interactive targets are at least 44×44 px.

### 9.1 Persistent HUD (every station)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [TICKET RAIL: up to 5 tickets, each with customer face + state icon]  ⏰ 11:40 │
├────────────────────────────────────────────────────────────────┬─────────────┤
│                                                                │ HEAT METER  │
│                                                                │ (vertical,  │
│                                                                │  bands drawn│
│                    STATION PLAY AREA                           │  as colored │
│                                                                │  zones,     │
│                                                                │  needle)    │
│                                                                │ stress frost│
│                                                                ├─────────────┤
│                                                                │ GARAGE      │
│                                                                │ [1][2][3][4]│
│                                                                ├─────────────┤
│                                                                │ GLORY HOLE  │
│                                                                │  (button)   │
├────────────────────────────────────────────────────────────────┴─────────────┤
│  [ Counter ]  [ Furnace ]  [ Color ]  [ Bench ]  [ Finish ]     coins: 142  │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Heat meter:** a vertical thermometer-style bar. The current step's ideal band is highlighted in green. The slump zone (> 92) is a red-hot top cap. The crack zone (≤ 12) is a grey bottom cap. A small glowing blob (the piece's silhouette) tracks the needle. The meter shakes when heat leaves the band.
- **Station tabs:** a dot on a tab = an order needs that station next. A pulsing dot = the active piece's next step.

### 9.2 Counter

- The customer stands at the counter with a speech bubble. The ticket is drawn on the printer as it's described. "Take Order" button.
- The pickup shelf (left wall) shows yesterday's clean pieces waiting.
- The lobby (right) shows up to 3 waiting customers, each with a lobby patience ring.

### 9.3 Furnace

- Center: the furnace (big, round, glowing door). When opened, a cross-section shows the crucible.
- Left: the pipe rack + pipe warmer (2 slots with ring timers).
- Right side of the play area: the gather gauge (vertical), with the target band.
- Bottom left: the marver (switches into the marver close-up after the gather).

### 9.4 Color

- A steel table with frit bins in a semicircle (up to 12 bins, labeled with color names + small swatch).
- The coverage diagram (a rotating cylinder unwrapped as a strip) on the right.
- The blow view swaps in after melt-in: the pipe in profile, the mouthpiece on the left, the target ghost outline on the bubble.

### 9.5 Bench

- Front view of the gaffer at the bench with the pipe across the rails.
- Tool rack on the right: only the tools needed glow, in order.
- The shaping checklist (top left) ticks off steps.
- The rail strip (bottom, highlighted while correcting off-center).
- The optic mold and bit holder appear on the floor (bottom left) when needed.

### 9.6 Finish

- Left: the punty rack + punty prep timer.
- Center: the piece on the punty, with the crack-off target and lip markers.
- Right: the annealer (door, window, shelf with loaded pieces, internal temperature display).

### 9.7 Hand-off inspection card

A card slides up over the Finish screen: the customer's face, the four bars + wait clock, stars, tip, and a reaction line. A "Next" button (or a click anywhere) dismisses it.

### 9.8 Morning reveal

- Full-screen dawn shop. The annealer is in the center.
- The pickup shelf runs along the bottom, filling left to right.
- The clean rate tally appears in the top right.
- A "Open Shop" button after the reveal.

### 9.9 Day summary (after closing)

- Orders served, average stars, tips, walkouts.
- "In the annealer tonight": the list of pieces with soak icons.
- The calendar with unlocks for tomorrow.
- "Sleep" button.

### 9.10 Glossary (book icon, accessible from pause and any ticket)

A small notebook with hand-drawn illustrations. Entries unlock the first time the term shows up in play, and each has a one-line definition + a tiny animation.

---

## 10. Asset list and palette

### 10.1 Palette

| Role | Name | Hex |
|---|---|---|
| Outline / ink | Soot | `#2B1E1A` |
| Shop walls | Kiln Brick | `#B5563A` |
| Wall shadow | Brick Shadow | `#7E3627` |
| Wood (bench, blocks, floor) | Cherrywood | `#8A5A3B` |
| Wood highlight | Sawdust | `#D9B48C` |
| Steel (marver, pipes, tools) | Marver Steel | `#7D8B93` |
| Steel highlight | Polished Steel | `#C9D3D8` |
| Hot glass core | Glory | `#FFD45C` |
| Hot glass mid | Hot Orange | `#FF8A1F` |
| Hot glass edge | Ember | `#E2431B` |
| Cooling glass | Dusk Glass | `#9A3B4A` |
| Cold / annealed clear glass | Clear Blue | `#BFE6EF` |
| Stress frost | Frost | `#8FC7E8` |
| UI paper (tickets, cards) | Ticket Paper | `#F6ECD7` |
| UI accent (good) | Band Green | `#4FA65A` |
| UI accent (warning) | Amber Warn | `#F2A03D` |
| UI accent (bad) | Cherry Red | `#C8323A` |
| Morning light | Dawn Blue | `#A9C4E0` |

**Rules:** Hot glass is the most saturated thing on screen at all times. The background stays muted brick and wood. Hot glass color is driven by heat: lerp **Glory → Hot Orange → Ember → Dusk Glass → (final frit color)** as heat falls from 100 to about 30. Frit color shows through progressively as the piece cools, which is a nice touch and true to life (hot glass color reads differently from its cold color).

**Frit colors** (12 starting bins): Clear, Cobalt, Turquoise, Sea Green, Lime, Amber, Gold Topaz, Ruby, Coral, Violet, Black, Opal White. Each has a hot appearance (darker or shifted) and a cold appearance, shown on the bin label.

### 10.2 Art style notes

- Chunky shapes, **3–4 px bold Soot outlines**, flat color with one shadow tone and one highlight tone per material.
- Hot glass gets a **soft additive glow** (radial gradient) plus a 1–2 px inner highlight. It's the only thing with glow, apart from the furnace and the glory hole mouths.
- Characters: big heads (about 1/3 of body height), simple dot eyes with highlight, expressive brows, rounded hands. Everyone wears practical shop clothes (cotton, safety glasses, Kevlar sleeves).
- Steam, sparks and heat shimmer are loopable sprite effects.

### 10.3 Asset list

**Characters**
- Player gaffer: 3 skin-tone options, 3 hairstyle options, apron, safety glasses. Poses: idle, gather, roll, blow, sit at bench, tool use (jacks/paddle/shears/blocks), cheer, wince.
- Juno (assistant): idle, carry bit, carry punty, open annealer, yawn, encourage.
- 6 named customers: idle, happy, neutral, unhappy, inspect (peering through annealer window), pickup happy, pickup sad.
- Walk-in pool: modular body/head/hair/clothes parts for about 20 combos.

**Stations & environment**
- Shop exterior (sign, window display shelf).
- Counter, printer, lobby bench, pickup shelf.
- Furnace (closed / open door), crucible cross-section, glass surface ripple.
- Pipe rack, pipe warmer (2 slots), punty rack.
- Marver (top view + side view).
- Color table, 12 frit bins, powder jars, frit patch on the table (per color).
- Glory hole (mouth with flame loop, in/out animation).
- Garage kiln (4 slots, door open/closed).
- Gaffer's bench (front view), rails.
- Annealer (door open/closed, window, shelf, display).
- Dawn shop background (lighting variant).

**Tools**
- Blowpipe, punty, jacks (open, closed, positions), paddle, shears (straight), tweezers, blocks (3 sizes), newspaper pad, optic molds (8/10/12 ribs), bit holder, bucket with water, fiber blanket.

**Glass forms at each stage** (per form, drawn hot and cold, with color overlay masks)
- Gather: small, medium, large, plus multi-gather stages.
- Marvered gather: cylinder and cone.
- With frit: grains (unmelted) and melted.
- Bubble: 5 growth stages + target ghost + blowout pop.
- Tumbler: necked, paddled, on punty, finished lip.
- Cup: + handle bit stages.
- Bowl: opened, flared (3 angles), dropped lip.
- Vase: bud, round, cylinder, each necked and opened.
- Pumpkin: ribbed bubble (8/10/12), with stem straight, curly, leaf.
- Ornament: ribbed / twisted, loop.
- Paperweight: layered gathers, encased, bubble, shaped.
- Sculpture: pebble, drop.
- Damage states: chipped lip, slumped, chill mark, cracked (crack line overlay), early drop shard pile.

**UI**
- Ticket (blank, with icon set for each field), ticket rail.
- Heat meter (frame, needle, band overlays, frost overlay).
- Garage slot (with hourglass, warning glow).
- Station tabs (with order dots).
- Gauges: gather, level bubble, depth, roundness, coverage strip, speed indicator, alignment line.
- Inspection card, star (full/half/empty), coin.
- Morning reveal stamps (CLEAN, CRACKED), clean rate tally, Clean Sweep badge.
- Day summary, calendar with unlock icons.
- Glossary notebook with entry icons.

**Audio** (list only)
- Furnace roar loop, glory hole whoosh, steam hiss (wet tools), marver roll, frit sprinkle, blow puff, jacks scrape, shear snip, crack-off tap, annealer door clunk, clean *ting*, crack *ping*, customer bell, cozy shop music (day), soft dawn music (reveal).

---

## 11. Glossary (in-game, short definitions)

| Term | In-game definition |
|---|---|
| **Hot shop** | The studio where glass is worked hot: furnace, glory hole, bench, annealer. |
| **Gaffer** | The lead glassblower at the bench, the one who makes the piece. (You!) |
| **Assistant** | The gaffer's helper. Brings bits and punties, opens doors. (Juno!) |
| **Furnace** | Holds the pot of molten glass, running around 2,100°F day and night. |
| **Crucible** | The pot inside the furnace that holds the molten glass. |
| **Blowpipe** | A long steel tube. Glass goes on one end, you blow through the other. |
| **Pipe warmer** | Heats the end of the pipe so glass will stick to it. |
| **Gather** | Molten glass collected on the pipe from the furnace. Also the verb. |
| **Marver** | A flat steel table. Rolling hot glass on it shapes, centers, and chills the skin. |
| **Frit** | Crushed colored glass. Pick it up on a hot gather to add color. |
| **Powder** | Even finer color, for soft and even tones. |
| **Glory hole** | The reheating furnace. Hot glass cools fast, so you reheat often. |
| **Bench** | The gaffer's chair with long arms (rails) to roll the pipe across. |
| **Blocks** | Wet cherrywood cups used to round a gather. The steam keeps the wood from burning. |
| **Jacks** | Big tweezers-like tongs used to neck, open, and shape glass. |
| **Jack line** | The groove made with the jacks near the pipe. It's where the piece breaks off. |
| **Paddle** | A flat wooden (or graphite) board for flattening bottoms and sides. |
| **Shears** | Heavy scissors for trimming hot glass. |
| **Tweezers** | Long tweezers for pulling and pinching details. |
| **Optic mold** | A metal mold with ribs inside. Blow into it and the ribs stay in the glass. |
| **Bit** | A small blob of hot glass, used for handles, stems, and loops. |
| **Punty** | A solid steel rod. Stuck to the bottom of a piece so the lip can be worked. |
| **Punty mark** | The little scar left where the punty was attached. |
| **Crack off** | Breaking the piece off the pipe or punty with a tap. |
| **Open / flare** | Widen the opening with jacks / fold the lip outward. |
| **Lip** | The rim of a cup, bowl, or vase. |
| **Garage** | A kiln that holds parts at a steady heat so they don't crack. |
| **Annealer** | A kiln that cools finished pieces slowly overnight, so they don't crack from stress. |
| **Anneal / soak** | Hold glass at a steady temperature so internal stress relaxes. |
| **Stress** | Hidden strain inside glass from uneven cooling. Too much, and it cracks. |
| **Check** | A small crack from thermal shock. |
| **Slump** | Hot glass sagging under its own weight. |
| **Encase** | Cover a color or design with a layer of clear glass (paperweights). |
| **Cane / murrini** | Pulled glass rods with patterns, and slices of them. Coming soon! |

---

## 12. Realism notes: what was simplified and why

Written for a working glassblower. These are deliberate choices for play, clarity, or pacing. Each one notes what's real and why the game departs from it.

1. **Garaging pieces on the pipe.** *Real:* a garage is used for parts that are off the pipe (cups for incalmo, cane, murrini, bits, sometimes components for assembly), and you don't park a half-blown piece mid-process to go start something else. A piece on the pipe gets finished. *Game:* the garage is the juggling mechanic that makes the Papa's-style format work alongside a live heat meter. The quality decay over time is the game's nod to "this isn't really how it's done." The game garage also runs much hotter than a real one (Heat 55, roughly 1,500°F, versus a real garage held near the annealing range, around 950–1,050°F), so a parked piece comes back close to workable instead of needing a long, risky reheat. The glossary still describes the garage correctly.

2. **One person does everything.** *Real:* most production work is a team. An assistant gathers bits, brings the punty, blows while the gaffer shapes, opens doors, and shields. *Game:* the player does all the hands-on work, and Juno only runs timers. This keeps the player's attention in one place and makes every step their skill.

3. **Time is compressed.** *Real:* glass stays workable longer than the game's ~10 s windows for most sizes, and a tumbler takes several minutes, not 60 seconds. *Game:* everything is about 3–5× faster so a day fits in 8 minutes and the heat meter is always in play.

4. **Heat is one number.** *Real:* a piece has a temperature gradient: the skin chills while the core stays hot, the lip cools faster than the base, and thin walls set faster than thick ones. Gaffers read heat by color, by how the glass moves, and by feel. *Game:* one Heat value for the piece (plus a separate lip heat in Station 4). It's readable and learnable. The color lerp on the glass sprite is the bridge to reading it by eye, as in real life.

5. **Stress is simplified.** *Real:* stress in a hot-working piece mostly comes from big temperature differences in the piece. Glass above its annealing range doesn't hold permanent stress, and annealing is what actually sets it free. A cold, checked piece usually can't be saved. *Game:* stress is a running total that partially relieves in the glory hole but never below 50% of its peak. That's not physics. It's a design rule so sloppy heat control has a lasting consequence that pays off in the morning reveal. Stress relief should arguably be complete at high heat, but then the reveal would rarely matter.

6. **Annealing is one overnight program.** *Real:* annealing schedules depend on glass type (COE), thickness, and form. You'd soak at the annealing point, then ramp down at a rate set by the thickest section. Solid paperweights need a much longer, slower schedule than a thin tumbler. *Game:* one program per night. Thickness shows up only as a longer minimum soak (`SOAK_MIN`) for solid work. Crack chance mixes in stress and load temperature, which both matter in real life.

7. **Blowing.** *Real:* the first bubble is usually blown early on a small first gather, then gathered over. The thumb trick and puffing work as described, but the timing and feel depend heavily on the glass and the person. *Game:* the player blows after color and before shaping, with a simple lag mechanic, to keep the sequence in a clear linear order. Multi-gather is mostly a gauge-and-timer step.

8. **Frit pickup temperature.** *Real:* frit sticks to a hot gather at a broad range, and you'd often marver it in, then melt it in. Color also changes the working properties: some colors are stiffer, some are prone to reacting with others, and opal/opaque colors can be finicky. *Game:* one stick threshold (75) for all colors, and every color behaves the same. A future version could give certain colors (e.g., ruby, opal) special handling.

9. **Tool steps are separated.** *Real:* shaping is continuous: blocking, jacking and paddling overlap and alternate in a fluid sequence, with constant rolling and reheats as needed. *Game:* each tool is its own discrete step in a checklist, with a clear success state. This is the biggest abstraction, and it's what makes the bench readable and scoreable.

10. **Glory hole is instant-access.** *Real:* walking to the glory hole, going in, reheating evenly while turning, and coming out takes time and skill. It's the most frequent thing a glassblower does. *Game:* a 1.2 s travel cost plus auto-turning. The "Turn It Yourself" toggle gives a little of that skill back for those who want it.

11. **Punty mark and cold work are skipped.** *Real:* after annealing, the punty mark is ground and polished in the cold shop, and lips may be cut and polished. *Game:* no cold shop. The punty mark is drawn on the piece's base as a small detail and is never scored. Cold work is a possible expansion.

12. **Safety.** *Real:* hot shops have strict safety: glasses (didymium for the glory hole), Kevlar, proper footwear, no synthetic clothes, and constant awareness of where hot glass and pipes are. *Game:* characters wear safety glasses and Kevlar sleeves in every frame. Juno's tutorial lines mention safety habits lightly. The game shows no injury or burn events at all, to keep it cozy.

13. **"Glory hole" naming.** It's the correct, standard term, and the game uses it, since the designer wants authentic vocabulary. Be aware the term has an unrelated slang meaning, which can matter for store listings, age-rating questionnaires, and moderated platforms (some auto-filters may flag it). The glossary entry and in-game context make the meaning clear. An internal fallback label ("Reheat") exists in the string table in case a platform requires it.

14. **Paperweights.** *Real:* layered gathers, encased color and controlled bubbles are accurate, but paperweight work often involves a torch, specialized paperweight molds, and careful handling of the bubble. The final base is usually ground and polished cold. *Game:* simplified to gathers, frit layers, pad shaping and a "poke a bubble" special, with no cold work.

---

## 13. MVP build order

**MVP scope:** one product (**M tumbler, 1 color, straight lip**), all four stations, the heat meter + glory hole, one generic customer type, 1 garage slot, and the morning reveal. No progression beyond Day 1 repeating.

| # | Milestone | Done when | Rough size |
|---|---|---|---|
| 1 | **Heat model in isolation** | A debug page with a piece object, live heat number, the cooling formula, glory hole hold-to-reheat, stress and off-center accumulators, all reading from `heat.config`. A graph of heat over time. | Small |
| 2 | **Station shell + HUD** | 5 station tabs switch screens. Heat meter UI (with band overlay) on every screen. A glory hole button. The active piece persists across tabs. | Small |
| 3 | **Station 1: Furnace** | Pipe warmer timer, hold-to-gather gauge, drag-to-roll marver with centering dot. Step scores with heat factor. | Medium |
| 4 | **Station 2: Color + Blow** | One frit bin, drag-to-roll coverage, melt-in in the glory hole, hold-release blowing with lag. Blowout failure. | Medium |
| 5 | **Station 3: Bench** | Jacks (position + squeeze depth) and paddle (level bubble). Tool rack + checklist. Off-center correction on the rail strip. | Medium |
| 6 | **Station 4: Finish** | Punty transfer, crack-off taps, lip reheat (lip heat sub-meter), short lip finish, annealer load band. | Medium |
| 7 | **One order end to end** | A fixed ticket, a single customer, hand-off inspection card with the 5 categories + stars. | Small |
| 8 | **Customers + queue** | Arrival schedule, lobby patience, the ticket rail, patience timers, the wait score. | Medium |
| 9 | **Garage (1 slot)** | Park/retrieve, drift to 55, grace + decay, the "hands full" prompt. Now 2 orders can be juggled. | Small |
| 10 | **Day loop + morning reveal** | Day clock, closing time, soak, the crack roll, the reveal sequence with stamps, the day summary. | Medium |
| 11 | **Tuning pass** | Playtest with a glassblower and with non-glassblowers. Tune `COOL_BASE`, bands, patience. Target: a new player finishes Day 1 with about 3 stars average. | Ongoing |
| 12 | **Art & audio pass** | Replace greybox art with the final style for the MVP assets only. | Large |

**Recommended stack (when coding starts):** plain HTML + a single `<canvas>` (or a lightweight 2D library), with game state in plain modules and all tunables in one config file. It matches the other projects in this repo and keeps it deployable on GitHub Pages.

**Test hooks to build in early:** a debug overlay showing the heat, stress, and off-center values live. A "fast-forward" key for the day clock. A seeded RNG for the morning crack roll so reveals can be reproduced.

---

## 14. Name shortlist

Working title: **Hot Shop Rush.** "Hot shop" is a generic industry term, but several studios and public glass programs use "Hot Shop" in their names, so a trademark check is needed before shipping under it.

Alternatives (all should get a quick trademark and app-store search before use; none are knowingly the name of a glass company or brand):

1. **Gather & Go**
2. **Punty Hour**
3. **Marver Mornings**
4. **Bench Time!**
5. **Molten Main Street**
6. **The Jack Line**
7. **Hot End Hustle**
8. **Annealer Morning**

Names deliberately avoided: anything with "glory hole" (see 12.13), "Pipe Dreams" (widely used, including by pipe shops), and any names of real glass makers, schools, or studios.
