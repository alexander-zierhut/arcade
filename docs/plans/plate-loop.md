# Plate Loop: development plan

Game 4 of the arcade. A remake of the mechanic behind *Loop Sort* (Voodoo / Garawell, 2025), re-themed as a
sushi conveyor: pieces ride a kaiten belt on plates, and you pack them four of a kind into takeaway boxes.
Free, no ads, no boosters, fixed levels everyone can compare.

Status: plan only. Nothing built. Written 2026-11-04 after researching the original (store text, fan walkthroughs,
an indie teardown) and verifying the rules on 25 screenshots of levels 193-197 (two agent passes; the detailed
reports are in the session scratchpad, the verified rule list is folded into section 2).

Name: **Plate Loop** (folder `plate-loop`, prefix `plateLoop.`, global `PlateLoop`). Chosen by Alex 2026-11-04 after a
name search: "Sushi Loop" is taken (itch.io twice, Steam, iOS "Food Sort Puzzle - Sushi Loop", Google Play), as are
Sushi Spin, Sushi Parade, Sushi Slide, Sushi Takeout and Roll Call Sushi; "Belt & Box" collides with the iOS puzzle
"Belt and Boxes". "Plate Loop" showed no game or app on the web, the US App Store or Steam (itch.io and Google Play
only via web search; no trademark search). The plates loop the belt until a box takes them, which is the game's whole
tension. Free runners-up if it ever has to change: Sushi Lap, Sushi Carousel, Maki Belt, Sushi Circuit.

---

## 1. The idea in one paragraph

A kitchen counter. A conveyor belt runs in a closed loop with **N plates** on it (N is the level's capacity, 4 to
10). Around and inside the loop stand **boxes**, each with four slots in a row and an open end facing the belt.
Every box starts with 0 to 4 sushi pieces of mixed kinds. Tap a box: its front piece (and every piece of the same
kind directly behind it) slides out onto the next free plates and rides the belt. A plate passing a box drops
its piece in when the box is empty or its front piece is the same kind and there is room. Four of a kind closes
the box with a lid. The belt has only N plates; when all are full and nothing can land, the kitchen is stuck
and the level is lost. Clear every kind into a closed box and the level is won. Everything else (hidden pieces,
bound pairs, wrapped, frozen, locked and one-way boxes) is a twist on those rules.

## 2. Rules (the contract the engine and the tests implement)

Terms: **kind** = sushi type (the original's colour). **box** = the original's truck. **plate** = a belt slot.
**front** = the piece nearest the belt (the original's "top"). **run** = the front piece plus the consecutive
*visible* pieces of the same kind behind it; a hidden piece always ends the run (it is revealed at the tap and
needs a tap of its own; Alex, first playtest).

### 2.1 Board
- R1. One closed, one-way belt with exactly N plates, evenly spaced, moving at constant speed. N is per level.
- R2. Boxes stand next to the belt, inside or outside the loop, each with one open end (the mouth) at the belt.
  A box has 4 slots. Pieces always sit packed against the back; the front slot is the one nearest the mouth.
- R3. Boxes have no kind of their own. A level has exactly 4 pieces of every kind. The number of boxes is at least
  the number of kinds; extra boxes give free slots. Total pieces = 4 × kinds ≤ 4 × boxes.
- R4. The level is **won** when every kind sits in a closed box. Boxes may stay open and empty at the end.

### 2.2 Tapping a box (ejecting)
- R5. Tapping an open, unmodified box with at least one piece ejects its **run**: k = min(run length, free plates
  at the moment of the tap) pieces leave, one per free plate as plates pass the mouth. If k = 0 (belt full) the
  tap is refused with a visual shake; nothing changes.
- R6. The pieces of a run leave in front-to-back order and occupy consecutive free plates. Once on a plate a
  piece is beyond the player's reach.
- R7. Ejecting reveals: when a hidden piece becomes the front piece it turns face-up (R15). A key on the newly
  exposed front piece is released (R19).

### 2.3 Landing
- R8. A plate carrying a piece of kind c passes a box's mouth. The box **accepts** when it is open (not closed,
  not wrapped, not frozen, not locked) and either empty, or its front piece is c and it holds fewer than 4.
- R9. **Pouring preference** (restricted 2026-11-04 after the first playtest): if some box D is *pouring* kind c
  (a piece of c landed there, pieces of c are still in transit, and D has not been tapped or closed since) **and
  D can be completed** (D's count plus the pieces of c in transit, on plates or still leaving a tapped box, is at
  least 4), then other boxes do not accept c; the piece rides on to D. Without completability there is no
  preference. Pouring ends when no piece of c remains in transit, when the box closes, or when it is tapped.
- R10. A piece lands in the **first** accepting box it reaches along the belt direction (subject to R9).
  A piece may land back in the box it came from if that box accepts it (our deviation from the original, which
  forbids it).
- R10b. **Completion preference** (added 2026-11-04 after the first playtest): a piece of kind c reaching an
  *empty* accepting box rides on when some open box D holds c at the front with room and D's count plus the
  pieces of c in transit (on plates, or still leaving a tapped box) is at least 4 (the transit can complete D).
  Empty boxes only take a piece when no completable matching box exists. In short: a kind skips boxes only to
  complete a box; otherwise the first accepting box takes it. R9 agrees with R10b.
- R11. A piece that finds no accepting box keeps riding. There is no limit on laps.
- R12. When a landing makes 4 of a kind, the box **closes** at once (lid, stamp). Closed boxes stay in place,
  accept nothing, cannot be tapped, and are passed by the belt. Nothing replaces them.

### 2.4 Losing
- R13. The level is **lost** when all N plates are full and no plate's piece can land anywhere, now or after any
  number of laps (i.e. no box accepts any kind currently on the belt). Since the player cannot tap (R5), the
  state is terminal. The engine detects it after each landing attempt cycle and shows the lose card; the belt
  keeps moving under it.
- R14. Not a loss: plates full but a piece can still land (it will). Plates not full: never a loss, the player can
  always tap something or wait.

### 2.5 Modifiers (a level uses any subset)
- R15. **Hidden piece** (covered): a piece whose kind is not shown, drawn under a cloche. It is revealed the moment
  it becomes the front piece of its box. At level start the front piece of every box is visible. Hidden pieces
  may sit anywhere behind the front, including the back.
- R16. **Bound pair**: two adjacent pieces in one box held together. They form one unit for R5 (a tap ejects both
  together, needing 2 free plates; if only 1 is free the tap is refused). On the belt they are two ordinary
  pieces on two consecutive plates and never bind again. A pair counts as 2 on the belt. The pair's kinds may
  differ. A pair may be at the front, in the middle or at the back; a run that includes a pair treats the pair
  as part of the run only if both pieces are of the run's kind, otherwise the run ends before the pair and the
  pair is its own unit ejected on a later tap. (Decision: a bound pair of two different kinds at the front
  ejects as a 2-piece unit; that is exactly the original's difficulty.)
- R17. **Wrapped box** (cloth): the box is wrapped in a cloth printed with a kind. Nothing inside is visible, it
  accepts nothing and cannot be tapped. All boxes wrapped with kind c unwrap at the instant kind c's box
  closes (R12). A wrapped box's contents are ordinary (may include hidden pieces and pairs).
- R18. **Frozen box** (ice): a box encased in ice; invisible contents, accepts nothing, cannot be tapped. It thaws
  the instant a **neighbouring** box closes (neighbour = adjacent slot in the same row or column of the
  layout, as declared in the level). Deviation from the original, whose trigger is opaque; this one was
  consistent with every observed thaw. A frozen box's contents are ordinary.
- R19. **Locked boxes and keys**: a shutter with a coloured padlock covers one or more adjacent boxes. Covered
  boxes are invisible, accept nothing and cannot be tapped. Somewhere a piece carries a key tag of the same
  colour. The key releases the instant that piece becomes visible as a front piece (at level start, or after
  the pieces in front of it leave) and the shutter opens. One key per shutter; the key's piece is an ordinary
  piece of its kind.
- R20. **One-way box** (barrier): a box whose mouth has a one-way flap. It accepts normally but cannot be tapped.
  It usually starts empty or with one piece; it may start with up to 3. Once it has a piece its kind is fixed
  for good.
- R21. Modifiers may combine on one box only as: hidden pieces and pairs inside any box; a one-way box may also
  be wrapped, frozen or locked (visible once uncovered). Wrapped, frozen and locked are mutually exclusive on
  one box. (Keeps the generator and the art manageable; revisit later.)

### 2.6 Determinism and restarts
- R22. A level is a fixed structure: layout, N, every box's piece sequence, modifiers. It never changes.
- R23. On every start or restart of a level the **kinds are permuted** (seeded by level id and attempt number):
  salmon becomes tuna and so on, consistently across the whole level. The structure, counts and solution are
  identical; only the picture changes. Hidden pieces are hidden in every attempt.
- R24. The belt phase at level start is fixed (plate 0 at the belt's origin), so a replay is reproducible.

### 2.7 Timing (real time)
- R25. The belt moves continuously; one lap takes about 8 s regardless of N (speed = perimeter / 8 s, tunable per
  layout). Plates start evenly spaced; each plate has its own arc position from then on.
- R26. **Scheduled departures on called plates** (Alex, playtests): a tap starts at once but paces itself: piece
  j leaves the box at tap + 0.9 s + j × 0.9 s (`DEPART_FIRST_MS`, `DEPART_GAP_MS`), strictly one after the other, visibly sliding out the whole
  time. At the tap the engine reserves one free plate per piece (the nearest free plate *behind* the mouth, so it
  can be seen arriving) and moves it to just behind the mouth at the departure moment; reserved plates are not
  free for other taps. There are always exactly N plates; a tap needs as many free plates as pieces (R5).
- R27. Landing: when a plate's centre reaches the mouth and the box accepts, the piece slides in (~0.8 s, `LAND_MS`); the
  plate is free where it is (plates become unevenly spaced over a level, which is intended).
- R28. Everything in R1-R24 is defined on the discrete model (plate index, box, slot); the real-time layer only
  decides *when* the discrete events happen. The engine is a discrete state machine driven by belt events.

## 3. Sushi translation (theme)

| mechanic | sushi reading | visual |
|---|---|---|
| kinds (up to 12) | sushi types | salmon nigiri, tuna nigiri, tamago, ebi, unagi, ikura gunkan, kappa maki, tekka maki, california roll, inari, tako, uni. Each has its own silhouette *and* colour, so colourblind players read the shape. |
| belt + plates | kaiten conveyor with N round plates | plates visible even when empty: the capacity is on the table, no counter needed |
| box | takeaway box, 4 slots in a row, open flap at the belt | box body in a warm kraft tone; slots as grooves |
| closed box | lid snaps on, "✓" sticker, little steam puff | stays on the counter |
| full belt | the belt's edge light strip turns red; plates jiggle | state as colour (your HUD rule) |
| hidden piece | piece under a steel cloche | lifts with a glint when it becomes the front |
| bound pair | two pieces on one skewer / under one chopstick clip | skewer snaps when they leave |
| wrapped box | furoshiki cloth in the kind's colour with the kind's icon | unwraps when that kind's box closes |
| frozen box | box in the freezer: frost, ice crystals | melts (drips) when a neighbour closes |
| locked boxes | roller shutter with a coloured padlock | key = a coloured tag on a piece; the tag flies to the padlock |
| one-way box | box with a drop flap and a "no returns" sign | flap swings in only |
| win | all boxes stamped, "Order up!" bell | confetti is cheap, keep it |
| lose | belt jammed, pieces pile at a stop sign, chef shrug | |

Scene: a quiet sushi counter, top-down with a slight tilt so pieces read as sushi. Night-market warm palette (dark
wood counter, cream plates, soft lantern light), nothing like the other games' palettes. Pieces are SVG sprites
(drawn by agents to a written spec, like Penguin March's), the belt and boxes are canvas-drawn or DOM; decide in
section 6.

HUD, per your rule "same info, less space": one 44 px top band: level pill (its colour = difficulty tier: calm
for easy, amber for hard, red for extreme, a skull glyph only on extreme), the pause button. Progress = closed
boxes, visible on the board; the free-plate count = empty plates on the belt. No bottom row. Settings and
how-to-play live on the title and pause card (spec sections 5-6).

## 4. Modes

- **Level mode**: a fixed, seeded sequence. First build: levels 1-100, introducing every mechanic; later
  101-500 generated and tuned (cheap agents). Progress = highest cleared level; retries unlimited; the share
  line is "Level 42 cleared in Plate Loop". Difficulty switches between tiers every few levels (not monotonic),
  with an *extreme* level every ~25.
- **Endless mode**: choose a tier (easy / normal / hard / extreme) and a **no-luck** switch; the game serves
  generated levels at that tier one after another; the score is the streak of cleared levels; losing ends the
  streak (share line "Streak 17 on Hard"). No-luck = every piece visible (cloches, cloths, ice and shutters are
  drawn translucent, so the mechanics still apply but nothing is unknown).
- No boosters, no undo, no coins, no lives. A level is a level.

## 5. Levels: format, generator, solver, validation

### 5.1 Level format (JSON, one object per level)
```
{ id: 17, tier: 'normal', seed: 981233, layout: 'ring-2col', N: 6,
  kinds: 9,
  boxes: [
    { id: 'L1', pieces: [3, 'h:5', 'h:5', 1], mods: {} },        // back → front; 'h:' = hidden
    { id: 'L2', pieces: [['p',2,7], 0, 4], mods: {} },            // ['p',a,b] = bound pair a (back) + b
    { id: 'R2', pieces: [...], mods: { lock: 'A' } },
    { id: 'R3', pieces: [1, 'k:A', 6, 6], mods: {} },             // 'k:A' = key A on this piece (a piece of kind 6? no: kind + key, see below)
    { id: 'R7', pieces: [], mods: { oneway: true } },
    { id: 'T2', pieces: [...], mods: { wrap: 4 } },               // wrapped with kind 4
    { id: 'T4', pieces: [...], mods: { ice: true } } ] }
```
Kinds are integers 0..kinds-1; the permutation of R23 maps them to sushi types at render time. A key is a
property of a piece (`{ k: 6, key: 'A' }` in the full form; the short form above is sugar). Layouts are named
templates (section 5.5) that fix box positions, orientation, neighbours and the belt path; the level only says
which slots are used.

### 5.2 The abstract model (what the solver searches)
A state = (every box's piece list + modifier state, multiset of pieces on the belt, pouring state). Moves:
- `eject(box, dest)`: eject the run of `box` (k = min(run, free)) and route it to `dest`, an accepting box
  downstream (R8-R10) including boxes further along than the first accepting one, because the player can
  kick a piece out of an intermediate box and let it continue (R5 + R10). Cost model: every intermediate
  accepting box on the way needs one kick per piece, each kick needs one free plate at that moment; with
  one run in flight at a time that always holds (the kicked piece reuses the plate it came on). So in the
  abstract model `dest` may be any accepting box downstream of `box`, as long as k ≤ free plates.
- `wait`: let everything on the belt land where it will (R9-R11). The abstract solver always waits after an
  eject, i.e. it only searches *one run in flight at a time* strategies. Real play allows juggling several
  runs; that is strictly more freedom, so abstract-solvable ⇒ solvable.
- Modifier events fire as in R15-R20.

The solver is a depth-first search with memoisation on a canonical state hash (boxes are sorted by content
for the hash when the layout is symmetric; otherwise raw), iterative deepening on move count, move ordering
"closing moves first, then moves that reveal, then moves into empty boxes last" (empty boxes are precious).
Target: < 200 ms per level on a laptop for N ≥ 5, up to a few seconds for extreme levels (N = 4, 12 kinds).
A hard budget (nodes) marks a level "unknown" and the generator discards it.

### 5.3 Realisability check (the tick-accurate bot)
The abstract solution is replayed in the **real engine** (section 6.1) by a scripted bot: for each abstract
move it taps the source box, then taps every intermediate accepting box the piece lands in (kick) until the
pieces are in `dest`, then waits until the belt holds nothing of that run. Pouring preference (R9) is handled:
after the first piece of the run lands in `dest`, the rest follow it past other accepting boxes without kicks.
If the bot wins, the level is **certified**. Every shipped level is certified; the test suite certifies all 100
fixed levels and 200 generated ones per tier.

### 5.4 Generator
Input: tier, seed, (optionally) a mechanic allow-list. Output: a certified level or failure (retry with the next
seed).
1. Pick a layout template and the box slots to use (tier tables give ranges for kinds, boxes, free slots, N).
2. Create 4 pieces per kind and deal them into boxes **by reverse play**: start from the solved state (every
   kind in its own closed box), then apply random *inverse* moves (move a run or a single piece from one box
   to another, respecting capacity) for M steps, with a bias toward splitting runs. This gives states that
   are solvable by construction (the forward moves exist) and look like puzzles, not like random dealing.
3. Apply modifiers after dealing: hide pieces behind the front (never the front), bind adjacent pairs, wrap
   boxes with a kind that is not yet closed, freeze boxes that have a neighbour, lock a group and place the key
   on a non-front piece (or a front piece for a free early unlock), mark one-way boxes (empty or one piece).
   Modifiers reduce options, so step 4 must re-check.
4. Solve (5.2). Discard if unsolvable or over budget. Compute metrics: minimal moves, **tightness** = max over
   the solution of (pieces in flight / N), number of forced moves, number of reveals before a safe move exists,
   count of empty boxes at start.
5. Accept when the metrics fall into the tier's band; else retry. Certify (5.3).
6. Difficulty levers, in order of effect: N (fewer plates), free slots (fewer empty boxes / empty slots), number
   of kinds, hidden pieces, pairs, wrapped/frozen/locked boxes, one-way boxes.

Tier bands (first guess, to be tuned with play and with cheap agents later):

| tier | N | kinds | boxes | empty boxes | hidden | mods |
|---|---|---|---|---|---|---|
| easy | 8-10 | 4-7 | kinds+2..3 | 2-3 | 0-20 % | 0-1 |
| normal | 6-8 | 7-10 | kinds+1..2 | 1-2 | 20-40 % | 1-2 |
| hard | 5-6 | 9-12 | kinds+1 | 1 | 30-50 % | 2-3 |
| extreme | 4 | 10-12 | kinds+1 | 0-1 | 30-50 % | 2-3 |

No-luck endless: same bands, hidden = 0 and covers translucent.

### 5.5 Layout templates (portrait, benchmark 360×678 CSS px)
Belt perimeter and box capacity are computed from the viewport; boxes are 4 slots × ~34 px + a 16 px back wall
= ~152 px long, 44 px tall (touch target), vertical boxes the same rotated.
- **ring-2col** (level 197's): belt around the edge, two columns of up to 7 horizontal boxes inside, mouths
  facing the belt on their outer side. Up to 14 boxes. Neighbours: same column, adjacent rows.
- **counter** (levels 195/196's): belt as a wide U/ring across the middle, a row of up to 5 vertical boxes
  above (mouths down), a row of up to 5 below (mouths up), up to 2 horizontal boxes inside the loop (mouths
  toward the belt's return lane). Up to 12 boxes. Neighbours: adjacent in a row; the inner boxes neighbour
  each other.
- **neck** (level 194's): ring with a step; adds variety later. Not in the first 100.
Each template declares: the belt path (polyline with rounded corners, direction clockwise or counter-clockwise
per level), the mouth position of every box slot along the path (its arc length), neighbours, and the
drawing order. Plate spacing = perimeter / N.

Geometry check at 360×678 with a 44 px band: board 360×634. Ring template: belt centreline inset 30 px, perimeter
≈ 2·(300+574) − corner loss ≈ 1 700 px. Plate size 40 px. N = 4 → spacing 425 px; N = 10 → 170 px (fine). Lap
8 s → 212 px/s; with N = 7 a plate passes a given mouth every 1.14 s: the kick-out decision has a comfortable
window. Two columns of 7 boxes: 7 × 48 px = 336 px of the 574 px inner height, fine; column width 152 px, two
columns 304 px of the 300 px inner width is **too tight** → inside the ring the boxes are 4 slots × 30 px + 12 =
132 px, or the belt inset is 24 px. Measure in the browser suite at every viewport (spec section 15).

### 5.6 The first 100 levels (fixed)
Generated once with fixed seeds, hand-checked, committed as `src/levels/levels-001-100.js` (frozen data, not
regenerated at runtime). Introduction schedule, each mechanic gets a near-trivial "lesson" level and a how-to card
on first contact:

| levels | new | tier pattern |
|---|---|---|
| 1-5 | belt, boxes, runs, closing; N = 8-10 | easy |
| 6 | hidden pieces | easy, then normal from 8 |
| 12 | bound pairs | |
| 18 | wrapped boxes | first hard at 20 |
| 25 | **extreme** (N = 5 still, 25 is the first "skull") | |
| 28 | one-way boxes | |
| 35 | frozen boxes | |
| 42 | locked boxes and keys | |
| 50 | extreme, all mechanics allowed from here | |
| 51-100 | mixed; tiers cycle easy/normal/normal/hard with an extreme at 75 and 100; N = 4 appears from 60 | |

### 5.7 Later: levels 101-500
Same generator, seeds fixed, plus a tuning pass: cheap agents play each level with the bot at several "skill"
settings (perfect, greedy, sloppy) and report tightness and failure rates; levels get re-tiered or replaced.
Out of scope for the first build; the plan only guarantees the generator and the data format support it.

## 6. Architecture (in the game folder)

No build step, classic `<script>` tags, one game global `PlateLoop` (the kit's rule), every engine file also
sets `module.exports` when present so node tests load it directly. Files:

```
plate-loop/
  index.html                     head per spec §2, kit scripts, Arcade.init, then src/ in order
  manifest.webmanifest, news.js, release.json, package.json, scripts/release.sh, .gitignore
  src/config.js                  STORAGE_KEY = 'plateLoop.', version, timing constants, tier tables
  src/engine/model.js            level parsing, kind permutation, canonical state, hashing
  src/engine/rules.js            R5-R21 as pure functions: canEject, eject, accepts, land, close, modifiers
  src/engine/belt.js             the discrete belt: N plates, positions along the path, events (mouth reached)
  src/engine/sim.js              the real-time driver: advances the belt, fires landing/eject events, detects win/lose
  src/gen/solver.js              abstract solver (5.2)
  src/gen/bot.js                 realisability bot (5.3), also the "skill" bots for tuning
  src/gen/generator.js           reverse-play generator + modifier placement + metrics (5.4)
  src/gen/rng.js                 seeded PRNG (mulberry32 or sfc32), permutation helper
  src/levels/layouts.js          templates (5.5), viewport-independent in arc-length units
  src/levels/levels-001-100.js   frozen data
  src/render/scene.js            canvas: counter, belt, plates, boxes, modifiers, effects
  src/render/sprites.js          SVG → Image cache; low-perf mode uses fewer effects (Arcade.perf)
  src/render/layout.js           template → pixels for the current viewport
  src/ui/strings.js              de + en
  src/ui/screens.js              title, mode chooser, how-to cards, pause, win/lose cards, settings; Arcade.screen
  src/ui/input.js                pointer → box hit test → engine tap
  src/audio/*.js                 small synth or short samples: slide, land, close, jam, unlock, thaw
  src/main.js                    boot: load sprites, Arcade.loading.progress, Arcade.ready, state machine
  src/levels/gen-levels.mjs      dev script: regenerate levels-001-100.js from seeds (never at runtime)
  assets/sprites/*.svg           12 sushi kinds, plate, cloche, skewer, cloth, ice, shutter, padlock, key tag, flap
  assets/icons/                  192/512/180 PNG, og-image.png
  tests/*.test.js, tests/run.js  node unit tests (section 7)
  tests/browser/                 run.js + chrome.js (copied harness) + play.js
  docs/ARCHITECTURE.md, HOW-TO-CHANGE.md, RELEASE.md, STATUS.md, README.md
```

### 6.1 Event flow
`sim.tick(dt)` advances belt phase → for each plate whose centre crosses a mouth this tick (in belt order) →
`rules.land` (accepts? pouring?) → events `land`, `close`, `unwrap`, `thaw`, `unlock`, `reveal` → render reacts
with animations; `input.tap(boxId)` → `rules.canEject` → `sim.queueEject(box, k)` → on each next free plate at
the mouth: `rules.ejectOne` → event `eject`. After every landing pass: `rules.isWon`, `rules.isStuck` (R13).
The renderer never changes state; the engine never touches the DOM. Save = level id, attempt, mode, tier;
mid-level state is **not** saved (a level restarts on reload; it is short).

### 6.2 Performance mode
Low: no particles, no steam, flat shading, plates without shadows, fewer animation frames; the belt still moves.

## 7. Tests (written before or with the code; all must pass before a level ships)

### 7.1 Engine unit tests (node, `tests/rules.test.js` etc.)
One test per rule, named by rule id, with hand-built tiny levels:
- R3 piece accounting; R5 run ejection with k = min(run, free), refused at 0; R6 order on plates; R7 reveal and
  key release on exposure; R8 accept matrix (empty / match / full / closed / wrapped / frozen / locked / one-way);
  R9 pouring preference: a second accepting box upstream is skipped while pouring, and pouring ends on tap /
  close / belt empty; R10 first accepting box, re-entry into the source box allowed; R12 close at 4 and stays
  closed; R13 stuck detection (full belt, nothing can land) and R14 non-stuck cases; R15 hidden never at front
  at start, revealed exactly when front; R16 pairs need 2 plates, split on the belt, count 2; R17 all cloths of a
  kind lift on that kind's close; R18 thaw on neighbour close only; R19 key on a back piece releases only when
  exposed, shutter over several boxes opens as one; R20 one-way never ejectable, accepts, kind fixed; R21
  disallowed combinations rejected by the level validator; R23 permutation keeps structure (solver result
  identical, pieces mapped 1:1); R24 reproducible replay (same taps at same belt phases → same events).
- Belt geometry: plate spacing, mouth arc lengths, direction, R26 "reaching now" window, R27 free-at-once.

### 7.2 Solver and bot tests
- Known-solvable fixtures solve in the expected number of moves; known-unsolvable fixtures return unsolvable.
- The bot replays every solver solution in the real sim and wins (certification), for all fixtures and all 100
  fixed levels.
- Juggling cannot break certification: property test, random tap storms on certified levels never put the
  engine into an inconsistent state (piece count conservation, no box over 4, no plate double-booked).

### 7.3 Generator tests
- Determinism: same (tier, seed) → identical level.
- For 200 seeds per tier: every produced level is solvable, certified, within the tier's metric band, has
  exactly 4 pieces per kind, front pieces visible, modifier rules (R21) respected, keys reachable (the key's
  piece is not behind a lock it opens, not inside a frozen box whose neighbours all depend on it, etc.), wrapped
  kinds are not wrapped inside their own box, and a frozen box has a neighbour that can close.
- The 100 fixed levels: regenerate from seeds and diff against the committed file (fails if someone edits by
  hand without bumping the seed table); the introduction schedule (5.6) holds; tier sequence matches.

### 7.4 Browser suite (spec section 15)
Boots without errors; plays level 1 with real pointer taps to the win card; plays a fixture to the lose card;
pause / resume; language switch; reload continues at the saved level; layout assertions at 360×640, 390×844,
430×932, 768×1024, 1280×800 (board inside the viewport, boxes ≥ 44 px tall, plates ≥ 36 px, no overlap of
boxes and belt); preview screenshot. Plus the arcade's root `npm test` line in `BOOT`.

### 7.5 Proof captures
Per your rule: DOM + pixel captures of every screen at 360×678 and one tablet size before/after every
cross-cutting change, from the first playable build on.

## 8. Build order (milestones; each ends green)

1. **Engine + rules + tests** (node only): model, rules, belt, sim; R-tests green. No rendering.
2. **Solver + bot + generator**: certification pipeline; fixtures; generator property tests; tier tables.
3. **Fixed levels 1-100**: seed table, generate, review the schedule, commit; certification test green.
4. **Scene**: layout templates to pixels, canvas renderer with placeholder shapes, input; play level 1 by hand.
5. **Sprites**: written sprite spec (sizes, palette, silhouettes, the 12 kinds, every modifier) → agents draw
   SVGs → render check page → your review rounds.
6. **Screens + kit integration**: title (spec §5), modes, how-to cards per mechanic, pause/settings, win/lose
   cards with share lines, de + en, news.js, manifest, icons, OG image; `Arcade.screen` everywhere.
7. **Audio + polish + low-perf mode.**
8. **Browser suite + proof captures + docs (§16)**, beta release (`status: beta`), phone test on your Android.
9. **Endless mode** (can ship in the same beta if 1-8 go fast; otherwise the first update).
10. Later: levels 101-500 with the tuning pass; a "neck" layout; a daily level.

Agents (your rules): engine, rules, solver, UI and integration by the main session; sprites, the 100-level
review, docs and later the tuning pass by Sonnet/Haiku agents, each owning its files.

## 9. Decisions taken in this plan (say so if you want them different)

- Discrete plates on the belt instead of particle streams; capacity is visible, no counter in the HUD.
- One lap ≈ 8 s for every level.
- A piece may re-enter its own box; pouring preference is kept.
- Ice thaws on a neighbour's close; neighbours come from the layout.
- A bound pair of two different kinds at the front ejects as one 2-piece unit.
- Wrapped / frozen / locked are exclusive per box; one-way may combine with any of them.
- Mid-level state is not saved; a reload restarts the level (same structure, new permutation).
- No-luck endless = everything visible, covers translucent.
- Levels 1-100 are frozen data generated from a seed table; hand edits go through the seed table.

## 10. Open questions for you

1. Should the belt also be allowed counter-clockwise per level (as in the original) or always clockwise?
   Suggest: both, chosen by the level, with arrows on the belt.
2. For level mode, do you want a "how to play" card at first contact with each mechanic (my suggestion) or
   one card at the start only?
3. Extreme levels: cap at N = 4, or allow N = 3 for the very end of the 500?
