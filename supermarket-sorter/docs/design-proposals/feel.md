# Supermarkt Sortierer: design proposal "Feel first"

Lens: a veteran mobile puzzle designer optimising for a 60-plus casual player. Readable at a glance, fair, no
frustration, satisfying feedback, real depth for weeks. Normative words: MUST, SHOULD, MAY. Rule ids (R1..R40)
are meant to be cited in code comments as `DESIGN R12`.

Sources: `docs/OWNER-NOTES.md` (binding), `docs/RESEARCH.md` (cited as RESEARCH Mx/Sx/Bx), the Lv.513 screenshots in
`further-deatures/`, the Lv.2 screenshot in `examples/`, the Falcon GDD wiki (features/GameplayMechanics,
Obstacles, CellLock; cited as WIKI-GM, WIKI-OB, WIKI-CL), and the research prototype in `docs/research-proto/`.

---

## 0. Summary and decision log

**One principle above all: things you drop onto never move; only things you take from move.** The centre rack is
always still. The side shelves (and later the horizontal shelf) are take-only conveyors. A 60-plus player never has
to hit a moving target with a drop, only pick from one, and picking is made forgiving (R21, 7.4).

### 0.1 Decisions (one line each, why)

| # | Decision | Why |
|---|---|---|
| D1 | Evolve v0.1.0: keep `SS`, pure `src/game/`, DOM `<img>` per item, tests, release script | It works and follows cocktail-merge conventions (RESEARCH 0.1) |
| D2 | Centre rack = 2 columns of 3-slot compartments + optional centred top/bottom cap; 8 shapes A4..A12 | Exactly the Lv.513 layout; 2 columns give large items before side shelves arrive |
| D3 | Layers per compartment up to 6; whole layer advances when the front holds 0 items; front + darkened next drawn; deeper layers shown only as count pips | Owner's rule; pips reveal a count, never contents, so the owner's "never the deeper ones" holds |
| D4 | Locks: chain + number = matches still needed; every triple anywhere lowers every lock by 1; front items visible behind the chain | Owner + WIKI-CL (default 4, every match decrements); visible contents keep planning fair |
| D5 | Side shelves: two vertical loops of single-slot cells moving up; take-only; a taken cell is barred for the rest of the level | Owner, binding. Depth 1 per side cell (open question Q1 about the screenshot's dark items behind) |
| D6 | Drop targets never move; belt motion is rendered by the compositor (Web Animations), the model owns the phase | Feel + battery: no per-frame JS while a belt moves |
| D7 | Taking from a belt is committed only on a valid drop into the centre; a cancelled pick returns to its (moved) cell | No accidental irreversible takes; matches RESEARCH M5 (model changes only on a validated drop) |
| D8 | Golden bunny: lies on the board like a product; tap collects it into the bunny counter (free action); spending one empties a chosen centre compartment completely (all layers) | Owner: "frees a compartment"; collect-then-spend gives agency and matches the HUD bunny counter (0 -> 2 in the screenshots) |
| D9 | Orphan rule: the level is won the moment every product type has at most 2 copies left anywhere; leftovers are swept into the basket | Owner, binding; matches WIKI-GM IsCompleteLevel (win when no match can be made any more) |
| D10 | Exact stuck test extended to belts: `F >= max(1, 3 - c_t)` with `c_t + s_t >= 3` for some type, or a reveal is possible, or a bunny is available | Exact O(items) test, proof in 1.9; no false "no moves" ever |
| D11 | Boosters cut to three: Rückgängig (both, unlimited), Goldhase (both), Tipp (relaxed only); +30 s once per level (timed) | Fewer buttons for a 60-plus player; hammer = bunny, shuffle destroys her mental map, freeze is redundant with a fair clock |
| D12 | Two baked tracks: "Gegen die Zeit" (Z) and "Entspannt" (E); L1-L20 share structure, then diverge; 300 baked levels per track | Owner: timed gets faster shelves and shorter time, relaxed gets deeper sorting; same opening teaches both |
| D13 | Proof = witness certificate: every shipped level carries a booster-free winning move list that an independent replay checker verifies in `npm test` | The owner asked for proof; a replayable witness is a proof per level, cheap to check, independent of the search |
| D14 | Infinite tail (L301+): runtime generation with a deterministic, budget-in-nodes gate; failing that, a seeded remix of a baked level of the same tag | Deterministic on every device; never ships an unproven level |
| D15 | Timed scoring: points x combo, combo window 6 s, clear and time bonus; highscore = top 10 "Serien" (streaks); progress is never lost on a fail | Losing 40 levels of progress to one timeout drives a casual player away; the streak keeps the highscore meaningful |
| D16 | Relaxed scoring: per-level efficiency vs par, stars, Σ best; combo is juice plus one bunny at x5 | No clock touches relaxed; grinding cannot inflate the total (RESEARCH S8-S11) |
| D17 | Retry shows the identical board in both branches | "I almost had it" needs the same board; deviates from RESEARCH 3.8 (timed transform) for feel |
| D18 | Render loop: no continuous rAF; a 250 ms HUD timer in timed PLAY, WAAPI for belts, rAF only during JS animations | Cool phone, long battery (RESEARCH P0.7) |

### 0.2 Where this deviates from the research brief

| Research decision | This proposal | One-line reason |
|---|---|---|
| Moving shelves, golden items in v2 (RESEARCH 0.1, 1.3) | v1 | Owner, binding |
| Max 3 layers (RESEARCH 0 #2) | Max 6 | Owner, binding ("up to 6") |
| 3-column grid, C = 9/12/15 | 2-column rack with caps, C = 4..12 | Owner's layout; side shelves need the width |
| Same boards in both modes | Two tracks after L20 | Owner: branches differ in what gets harder |
| Hammer, Shuffle, Freeze, Hint kit | Undo, Goldhase, Tipp (relaxed), +30 s (timed) | Fewer, clearer buttons; bunny is the hammer |
| Timed run from L1, ends on 2nd timeout | Campaign progress kept; the "Serie" ends and is banked | No progress loss for a casual player |
| Combo window 5 s | 6 s | Belt picks cost 1-2 s of waiting; 60-plus reaction time |
| Timed retry = new transform | Identical board | Fair comparison, no confusion |
| Bake 500 levels, one track | Bake 300 per track | Deeper boards are larger (about 220 chars per level) |

### 0.3 Rejected

Magic wand (trivialises), shuffle (destroys spatial memory), hidden "?" items (luck; RESEARCH 0.1), bombs (punitive
timers on top of the clock), lives/energy/coins/ads, moving drop targets (the core feel principle), drag-to-pause
belts in timed (removes the mechanic), relaxed fail states, per-run board transforms.

---

## 1. Game model, formal

### 1.1 Terms

- **Rack**: the static centre structure. **Compartment** (`Fach`) `c`: 3 fixed slot positions 0..2.
- **Layer** (`Ebene`): one row of 3 positions; layer 0 = front (playable), layer 1 = next (drawn dark), 2.. = deep (not drawn).
- **Belt** (`Band`): a loop of single-slot **cells** (`Zelle`) that scroll. Side belts L and R (vertical), optional belt H (horizontal).
- **F** = empty front slots in unlocked compartments. **c_t** = copies of type t in unlocked fronts.
  **s_t** = copies of t in unbarred, active belt cells. **H** = items in non-front layers of unlocked compartments.
- **Type**: a product type index 0..T-1 (mapped to art per level, RESEARCH 3.2). `BUNNY` = the golden bunny, a special type.

### 1.2 Rack shapes

Two columns of 3-slot compartments, `R` rows, plus 0-2 centred caps (top cap above row 1, bottom cap below row R),
exactly the Lv.513 picture. Compartment order (index) is top-down, left-right: top cap, then row-major, then bottom cap.

| Shape | Grid | Caps | C | Rack rows | Front slots | Used |
|---|---|---|---|---|---|---|
| A4 | 2x2 | - | 4 | 2 | 12 | L1 tutorial |
| A5 | 2x2 | top | 5 | 3 | 15 | L2 |
| A6 | 2x3 | - | 6 | 3 | 18 | L3-L4 |
| A7 | 2x3 | top | 7 | 4 | 21 | L5-L6 |
| A8 | 2x3 | top+bottom | 8 | 5 | 24 | L7-L16 |
| A9 | 2x4 | top | 9 | 5 | 27 | L10-L19, timed normal to L40 |
| A10 | 2x4 | top+bottom | 10 | 6 | 30 | Lv.513 shape; main shape from L20 |
| A12 | 2x5 | top+bottom | 12 | 7 | 36 | relaxed VeryHard from L50 |

Caps are 3-slot compartments of the same width as a column compartment, centred. 7 rack rows is the legibility limit
at 375x667 (items >= 52 px tall, see 7.2).

### 1.3 Compartment state

```
Comp = { slots: [id|0, id|0, id|0],          // front: item ids (existing v0.1.0 field, unchanged)
         back:  [ [t|null,t|null,t|null], ...],  // back[0] = next layer (dark), back[1..] = deep; types, not ids
         lock:  0 | n,                       // matches still needed to open (0 = open)
         x, y }                              // grid cell for the view (col 0|1|'cap', row)
```

Invariants (checked by the generator and `tests/levels.test.js`): every non-front layer holds 1-3 items, never 0;
no layer (front or back) starts as 3 identical products; at most 6 layers per compartment; `F0 >= 2`; every type
count is a multiple of 3 at start; the golden bunny never sits in a locked compartment.

### 1.4 Layers (whole-layer advance)

- **R-L1** A compartment's front is **empty** when its 3 slots hold no item (product or bunny).
- **R-L2** When the front is empty and `back.length > 0`, `back[0]` moves forward into the same slot positions
  (holes stay holes), `back` shifts by one. This is a **reveal**. It costs no move.
- **R-L3** Only `back[0]` is drawn (dark); `back[1..]` are drawn as **pips** (one dot per hidden layer, max 4 dots).
- **R-L4** Reveal is checked after every event that can empty a front: move out, match, bunny collect, bunny clear.
  Order: target compartment first, then source (RESEARCH M7).
- **R-L5** A revealed row can never be a triple (generator invariant), so no cascade. If one ever occurs it clears
  as a match without a move (RESEARCH M8).

### 1.5 Locks

- **R-K1** A locked compartment (lock n > 0) accepts no drops and gives no items. Its front products are visible
  behind the chain (the Lv.513 picture shows them), its next layer is not drawn.
- **R-K2** Every triple anywhere (rack match or cascade) lowers **every** lock by 1. A bunny clear lowers every lock by 1
  too (it is a "clean-up" the player earned). Reveals and takes do not.
- **R-K3** At 0 the chain falls (300 ms) and the compartment is normal from the next input on.
- **R-K4** Start values per level: 2..6 (tables in 4.4). With 2+ locks the generator staggers them by at least 1
  (for example 3 and 4) so they open one after another: two small rewards beat one big one.
- **R-K5** A locked compartment starts with a full front (3 items) and MAY have back layers.

### 1.6 Side shelves (belts)

```
Belt = { id: 'L'|'R'|'H', axis: 'y'|'x', dir: -1|+1,   // y,-1 = moves up (out at top, back in at bottom)
         cells: [ { t: type|null, barred: bool } ],      // length Nb; t null + barred = taken
         window: Wv,                                     // cells visible at once
         speed: v,                                       // cells per second (0 = still)
         phase: p,                                       // in cells, 0 <= p < Nb, advanced by tick
         appearAt: 0 | f }                               // H only: active once cleared fraction >= f
```

- **R-B1** Belts are **take-only**: a belt item can be moved into an empty front slot of an unlocked compartment. Nothing
  can ever be dropped onto a belt.
- **R-B2** Once a cell's product is taken, the cell is **barred** for the rest of the level (bars fall from the top,
  250 ms). Barred cells keep circulating; they are visibly empty.
- **R-B3** Position: cell k's offset along the loop is `pos_k = (k - phase) mod Nb` (in cells; 0 = top of the window).
  The cell is visible iff `pos_k < Wv` (partially at the edges). Up-moving belts decrease `pos` over time.
- **R-B4** `phase += dir * v_eff * dt / 1000` per tick, `v_eff = v * (1 + ramp * cleared/total)`; `ramp = 0.30` in timed from
  L31, else 0. Still belts (`v = 0`) have `Nb = Wv`; moving belts have `Nb >= Wv + 1` so a wrapping cell is never visible twice.
- **R-B5** Every product on a belt eventually passes the window, so for the rules (stuck, win, solver) all unbarred cells
  of an active belt are **available**; time only matters for the clock.
- **R-B6** The horizontal belt H is one row above the rack (below the HUD), moving left (dir -1) or right. With
  `appearAt = f > 0` it slides in (600 ms) the first time `cleared/total >= f` and announces itself ("Nachschub!").
  Its products count towards the level total from the start (the HUD counter includes them).
- **R-B7** When every cell of a belt is barred, the belt stops, dims to 60% and stays (the "done" signal).

### 1.7 Golden bunny

- **R-G1** `BUNNY` items are placed by the generator: in a back layer of the rack (it arrives with a reveal) or in a belt cell.
  It occupies a slot like a product. It never counts towards matches, the win rule or the item counter.
- **R-G2** Tapping (or dragging anywhere) a bunny in an unlocked front or in a belt cell **collects** it: it flies to the
  bunny counter (+1). Free action: no move, no clock cost, does not break the relaxed combo. A belt cell is barred
  after its bunny is collected. Collect can empty a front and trigger a reveal (R-L4).
- **R-G3** **Spend**: tap the bunny button (or drag the counter's bunny) and then a target: any unlocked compartment
  with at least one item. That compartment is **emptied completely**: front and every back layer vanish (sparkle
  burst, 450 ms) and it becomes a permanently empty compartment with 3 free slots. It counts as one match for locks
  (R-K2), scores 0 points, does not change the combo.
- **R-G4** Earned bunnies: combo x5 grants +1 bunny once per level (both branches; replaces RESEARCH M23 hammer).
  Rescue: if the player is stuck (1.9) with 0 bunnies, the stuck card offers **one** free "Rettungshase" per level.
- **R-G5** Bunnies are per level: unspent ones at the clear give +150 points each (timed) or a "Goldhase gespart"
  badge (relaxed). The counter starts at 0 every level.

### 1.8 Orphans and winning

- **R-W1** `remaining(t)` = copies of t in all fronts, back layers, locked compartments and unbarred cells of all belts
  (including a horizontal belt that has not appeared yet).
- **R-W2** **Win** as soon as `max_t remaining(t) <= 2` (with no items at all as the usual case). Checked after the
  last animation of an event batch, never by polling.
- **R-W3** On win, leftover products ("Reste", at most 2 per type) and bunnies fly into a basket at the bottom
  (60 ms stagger, 400 ms each), then the clear card. Orphans give no points; bunnies give R-G5.
- **R-W4** Only a bunny clear (R-G3) can create orphans (all counts start as multiples of 3 and matches remove exactly 3).

### 1.9 Free space and stuck (exact)

```
progressPossible(g) =
     bunnies > 0 && someUnlockedCompHasItems            // a bunny clear is always possible
  || bunnyInUnlockedFrontOrActiveBelt                   // collecting is free and frees a slot
  || exists t: c_t + s_t >= 3 && F >= max(1, 3 - min(c_t, 3))
  || F >= 3 && H > 0                                    // a front can be emptied to reveal
```

Proof sketch (extends RESEARCH M11). With one hole, unlocked front items can be permuted arbitrarily, so the c_t copies
can be gathered in one compartment X and all holes moved into X. Each belt take consumes one hole until the triple
completes. So a triple of t is reachable iff `F >= 3 - c_t` (and `F >= 1`). Emptying a front of k items needs
`F - (3-k) >= k`, i.e. `F >= 3`. A belt take of type u changes `c_u += 1, s_u -= 1, F -= 1`, which leaves u's
condition unchanged and worsens every other type's, so takes alone never create progress. Locks open only through
matches. Hence if the formula is false, no sequence of inputs can ever produce a match, reveal or clear. Cost: O(items).

**What happens when the rack is full and nothing matches, per branch:**

| | Relaxed (Entspannt) | Timed (Gegen die Zeit) |
|---|---|---|
| Detection | `!progressPossible` after the last animation of a move | same |
| Shown | Bottom sheet "Kein Platz mehr" over a dimmed board; nothing is recorded | Same sheet, **clock keeps running** behind it |
| Buttons (big, in this order) | Rückgängig (primary), Goldhase einsetzen / Rettungshase (once per level), Level neu starten | Rückgängig, Goldhase / Rettungshase, Level neu (ends the Serie, 5.1) |
| Undo depth | unlimited | unlimited (never rewinds the clock) |

Before the stuck state, a soft **early warning**: when `F == 1` after a belt take, the remaining free slot glows amber
for 1.5 s and the hint "Nur noch 1 Platz frei" appears once per level. This is the most important anti-frustration
cue in the game: the owner's warning about belts ("pulling products in without matching can leave no room") made visible.

### 1.10 Undo

- **R-U1** Every input that changes the model (move, take, collect, spend) pushes a snapshot: rack (fronts, backs, locks),
  belt cells (t, barred; **not** phase), bunny counter, rescue-used flag, score, level score, chain, combo state,
  matches, moves. Cap 300 snapshots.
- **R-U2** Undo restores the snapshot: an undone take puts the product back into its own cell wherever the belt is now
  (bars lift, 200 ms); an undone spend restores the compartment's layers; points of undone matches are removed.
- **R-U3** Undo never rewinds the clock, the belt phase or the move counter (moves only grow; RESEARCH B2).
- **R-U4** Undo is unlimited in both branches. Undoing removes the "Fehlerfrei" badge and the relaxed 3rd star only if
  the final moves exceed par anyway (undo itself is not punished; the move counter already is).
- **R-U5** Undo across a reveal re-hides the layer; the player has seen it. Accepted (RESEARCH B2).

---

## 2. Rules R1..R40, tick order, events

### 2.1 Rules

| Id | Rule |
|---|---|
| R1 | Only front items of unlocked compartments and products in active, unbarred belt cells can be picked up. |
| R2 | A move takes one rack front item to an empty front slot of a different unlocked compartment; the item lands in the slot under the finger if empty, else the nearest empty slot. |
| R3 | A take moves one belt product to an empty front slot of an unlocked compartment (same landing rule). |
| R4 | Drops on the own compartment, a full or locked compartment, a belt or outside spring back in 180 ms; not a move. |
| R5 | Three identical products in one front clear at once (match, 320 ms). Only that compartment is busy during the animation. |
| R6 | Whole-layer reveal per R-L1..R-L5. |
| R7 | Locks per R-K1..R-K5. |
| R8 | Belts per R-B1..R-B7. Take commits only on a valid drop (D7). |
| R9 | Bunny collect and spend per R-G1..R-G5. |
| R10 | Win per R-W1..R-W4 (orphan rule). |
| R11 | Stuck per 1.9; relaxed never records a failure. |
| R12 | Undo per R-U1..R-U5. |
| R13 | `moves` += 1 per move or take; collect, spend, undo, hint add 0. |
| R14 | Timed: the clock starts on the first input of the level (not at reveal of the board). |
| R15 | Timed: amber at <= 30 s (silent), red pulse and tick at <= 10 s. |
| R16 | Timed: first time the clock hits 0, a card offers "+30 Sekunden" (free, once per level) or "Serie beenden". Second time: "Zeit abgelaufen", the Serie is banked, the level restarts (identical board). |
| R17 | Timed combo: each match sets chain += 1 and refills a 6000 ms bar; an empty bar sets chain = 0. Undo restores chain and bar. |
| R18 | Relaxed combo: each match sets chain += 1 and `comboMovesLeft = 3`; each move or take without a match lowers it by 1; 0 resets the chain. |
| R19 | Combo x5 grants +1 bunny once per level (R-G4). |
| R20 | Belts move only in PLAY; pause, overlays, hidden page stop them (phase frozen). |
| R21 | Belt hit test accepts a cell if the touch point lies in its rect at the event time **or** at any time in the last 150 ms (lag compensation), with 10 px extra margin across the belt axis. |
| R22 | A belt product that is being dragged or is selected is reserved: it is no longer on the belt visually, its cell shows a faint outline; the model cell is unchanged until the drop commits. |
| R23 | A selected (tap mode) belt product stays selected while its cell is off-window; a tap on a compartment still moves it (flies from the edge where the cell left). |
| R24 | The bunny counter, the item counter ("Noch 54") and the lock badges update on the same frame as the event that changed them. |
| R25 | Hint (relaxed) shows one input of a winning line from the current state (item glow + target arrow), computed within a 120 ms budget; "Kein Weg gefunden" otherwise, with a suggestion to undo. |
| R26 | A level restart is always available and shows the identical board. |
| R27 | Level number N in branch b always yields the same board (b, N) on every device and every run. |
| R28 | The horizontal belt appears per R-B6; while it slides in, input stays enabled. |
| R29 | Locked compartments and belts are never hint targets for drops; belts can be hint sources. |
| R30 | Belt speed ramps only at match events (piecewise constant), so the WAAPI view can be resynced exactly. |
| R31 | The game never moves a product the player did not touch, except reveals, clears, the orphan sweep and belt motion. |
| R32 | No input is lost: a pointerdown during a match animation on another compartment is processed normally. |
| R33 | Score never decreases except through undo of the matches that earned it. |
| R34 | Every mechanic is introduced once with a coach mark the first time it appears (7.6); the coach mark pauses the clock. |
| R35 | Belts and the clock freeze while a coach mark, the stuck sheet (relaxed) or any overlay is open. |
| R36 | Reduced motion: belts still move (they are the mechanic) but with no wobble; clears and reveals become 150 ms fades. |
| R37 | Relaxed setting "Regale stehen still" sets every belt speed to 0; a belt with `Nb = Wv + 1` is then drawn with `Nb` slightly smaller cells so every cell is visible (solvability is timing-free, R-B5). |
| R38 | Stars: timed by time fraction, relaxed by moves vs par (5.1, 5.2). |
| R39 | `RULES_VERSION` = 2; a saved run with another version is dropped with a toast "Neue Spielregeln: Level startet neu". |
| R40 | All randomness is seeded integers (mulberry32, `Math.imul`); no float math in level paths (RESEARCH 3.3). |

### 2.2 Tick order (`SS.game.tick(g, dtMs)`, pure)

```
tick(g, dt):
  if g.status != 'playing' or g.frozen: return []
  dt = clamp(dt, 0, 100)                                  // the app clamps too
  g.elapsedMs += dt
  1. belts:  for each active belt b: b.phase = wrap(b.phase + b.dir * vEff(g,b) * dt/1000, b.cells.length)
  2. combo:  timed: comboLeftMs -= dt; if <= 0 and chain > 0 -> event comboEnd, chain = 0
  3. clock:  timed and started: timeLeftMs -= dt
             crossing 30000 -> event timeWarn {level:'amber'}; crossing 10000 -> timeWarn {level:'red'}
             <= 0 -> timeLeftMs = 0; if !extended -> status 'paused-timeout', event timeout {canExtend:true}
                                      else -> status 'lost', event timeout {canExtend:false}
  return events
```

Input path (`moveItem`, `takeItem`, `collect`, `spendBunny`, `undo`): the app first calls `tick(g, now - last)` so the
belt phase is current (catch-up tick), then the input function, which returns events in this order:
`move|take|collect|spend` -> `match`* -> `combo` -> `score` -> `unlock`* -> `reveal`* -> `bar` -> `beltAppear` ->
`beltSpeed` -> `bunnyEarned` -> `warnSpace` -> (`cleared` | `stuck`).

### 2.3 Events (existing ones extended)

| Event | Fields | Consumers |
|---|---|---|
| move | item, product, from, fromSlot, to, toSlot | board (fly), sound drop |
| take (new) | belt, cell, product, newItemId, to, toSlot | board (fly from cell rect), sound drop |
| match | comp, product, items, slots, combo, points | board pop, sound chime (pitch by chain), HUD |
| combo | combo, multiplier | HUD bar/pips, popup |
| comboEnd | combo | HUD |
| score | delta, score | HUD |
| reveal (new) | comp, types[3], newIds[3], hiddenLeft | board slide-forward, pips |
| unlock (new) | comp | board chain fall, sound clank |
| lockTick (new) | comp, left | badge pulse |
| bar (new) | belt, cell | bars fall |
| collect (new) | where ('comp'|'belt'), ref, bunnies | fly to counter, sound sparkle |
| spend (new) | comp, removedTypes[], bunnies | sparkle clear, pips vanish |
| bunnyEarned (new) | reason ('combo5'|'rescue'), bunnies | toast, counter pop |
| beltAppear (new) | belt | slide in, toast "Nachschub!" |
| beltSpeed (new) | belt, v | WAAPI playbackRate resync |
| warnSpace (new) | comp, slot | amber glow, one-time hint |
| timeWarn (new) | level | HUD colour, tick sound |
| timeout | canExtend, score | timeout card |
| extended (new) | addMs | HUD flash |
| stuck (renamed deadlock) | rescueAvailable | stuck sheet/banner |
| unstuck (new) | - | hide sheet after undo/spend |
| cleared | bonus, stars, orphans[], bunniesLeft, score, levelScore, moves, elapsedMs, timeLeftMs | sweep, clear card |
| undo (new) | restored snapshot id | board full re-sync of changed compartments/cells |

---

## 3. Solvability and the proof

### 3.1 What "solvable" means here

A level is **solvable** iff a sequence of moves, takes and bunny collects (no spend, no rescue, no undo, no hint,
no +30 s) reaches the win condition R-W2. Time is ignored: belts are treated as available pools (R-B5). Timed
feasibility is a separate, statistical check (3.6).

### 3.2 Abstract state for the solver

```
State = { front[c]: sorted small array of types (<= 3),   // unlocked or locked
          ptr[c]: layers consumed,                         // back layers come from the static level
          side: Int16Array(T) counts of available belt products,
          pendingH: Int16Array(T) | null,                  // horizontal belt products until appearAt is reached
          matches: int,                                    // lock state = max(0, lock0[c] - matches)
          bunnyOnBoard: positions (collect = free action) }
key(s) = per comp (ptr, sorted front) for comps with layers left or locks, + sorted multiset of finished comps
         + side counts + matches      // symmetry reduction from research-proto symKey
```

Belt products of one type are interchangeable, so a take is `(type, targetComp)`: branching drops from
`cells x comps` to `distinct types x comps`. Lock state follows from `matches`, so it is not stored separately.

### 3.3 Solver (offline and in tests): `src/game/solver.js`

1. **Progress-bounded DFS with dead-state memo** (research-proto `solve`): move ordering by `scoreMove`
   (complete a triple 1000, pair into a 2-item front 300, empty a front 60-80, take from belt into a pair 250,
   take into an empty compartment -80, break a pair -200), depth cap `2 x items`, budget 300 000 nodes.
   A take is pruned when the same type could be taken later into the same target without loss (dominance: take
   only into a compartment holding a copy of t, or into an empty compartment if no copy of t is in any front).
2. **Softmax playouts** (tau 120, `progressPossible` cut-off, no immediate reversal), up to 600, if DFS hits the budget.
3. A found path is a **witness**: `[[kind, a, t, b], ...]` with kind `m` (move), `k` (take), `g` (collect).

### 3.4 The proof: witness certificates

- `scripts/build-levels.js` writes `src/game/levels-data.js` (runtime) and `tests/fixtures/witness-Z.json`,
  `witness-E.json` (test only, not shipped; about 120 moves x 4 bytes x 600 levels = 290 KB).
- `tests/witness.test.js` replays every witness with an **independent** 120-line replay checker
  (`tests/helpers/replay.js`, written from the rules table, sharing no code with `board.js` or `solver.js`). The
  test asserts: every input is legal, the final state satisfies R-W2, no input uses spend/undo/hint/+30 s.
- A second assertion replays the same witness through the real `SS.game` API, so the shipped rules and the
  checker agree on every level.
- Hash pin: sha256 of `levels-data.js` and of both witness files; any regeneration must be deliberate.

This is a constructive proof per level: a level is shipped only with a witness, and the witness is checked by
code that cannot share a bug with the generator.

### 3.5 Generation (offline, Node): search with a gate

```
for track in [Z, E]: for n in 1..300:
  k = knobs(track, n)                                 // tables 4.4/4.5, formulas 4.6
  for attempt in 0..299:
    rng = mulberry32(hash32('gen', GEN_VERSION, track, n, attempt))
    lvl = randomFill(k, rng)        // layer sizes -> total multiple of 3 -> deal types (T, pairs) ->
                                    // reject triple layers -> place locks (full fronts) -> belts (Nb per side,
                                    // no 3 identical in a row of cells) -> bunny (k.bunny, in back[0..1] or a cell)
    if !invariants(lvl) or !progressPossible(init(lvl)): continue
    w = solve(init(lvl))            // DFS 300k nodes, then 600 playouts
    if !w: continue
    m = metrics(lvl)                // agentWin (40 playouts), deadRate, forcedEvictions, spread, frontPairs,
                                    // beltShare = takes in witness / items, warnSpaceRate
    if !accept(m, window(track, n, tag)): continue
    par = ceil(min(w.len, best of 31 playouts) * 1.25)
    timeS = timeLimit(track, n, lvl)  then raise by 15 s steps until casualBot passes (3.6)
    emit(n, lvl, par, timeS, w); break
  else: relax k (F0 += 1, then back size -1) and retry; log "level n relaxed"; fail the build after 2 relaxations
```

Acceptance windows (agent win rate over 40 playouts; RESEARCH 3.5 shape, retuned for deeper boards):

| Block | Normal | Hard (idx 4) | VeryHard (idx 9) | Breather / tutorial |
|---|---|---|---|---|
| L1-20 | 85-100% | 70-95% | 55-90% | 95-100% |
| L21-40 | 70-100% | 50-85% | 35-75% | 90-100% |
| L41-60 | 55-90% | 35-70% | 20-55% | 85-100% |
| L61+ | 45-85% | 25-65% | 12-45% | 80-100% |

Extra feel filters (reject if violated): at least 2 starting front pairs with a visible third (in a front or on a
belt) on Normal and Breather (a good first move is always visible); `warnSpaceRate` (share of agent playouts that hit
`F == 1` after a take) <= 50% before L41; no compartment whose front and next layer contain 0 products matching
anything else visible (a "dead" corner) at start; bunny never in the very last layer of the last compartment to clear.

### 3.6 Timed feasibility (offline)

`casualBot` plays the witness order with human timing: 2.8 s per rack move, belt takes wait for the cell to enter
the middle 60% of the window plus 0.6 s reaction, 1.2 moves per item of detours. The level passes when, over 20 seeds
of belt start phases, at least 90% finish with >= 25% of the time left (L1-30), >= 20% (L31-60), >= 15% (L61+).
Otherwise `timeS += 15` and re-check. The owner's 6:00 at Lv.513 is the sanity anchor for about 110 items at L60+.

### 3.7 Budgets

| Task | Where | Budget |
|---|---|---|
| Gate per attempt, depth <= 3 | offline Node | p50 2 ms, p90 30 ms (research: 1.4/17 ms at depth 2-3) |
| Gate per attempt, depth 4-6 | offline Node | cap 300k nodes (about 1.5 s) + 600 playouts (about 0.6 s) |
| Full build, 600 levels | offline | <= 15 min; cached per (track, n, GEN_VERSION) in `scripts/.cache/` |
| Witness replay test, 600 levels | `npm test` | <= 4 s |
| progressPossible | phone, every input | < 0.05 ms |
| Hint (relaxed) | phone | 120 ms, time-sliced in 8 ms chunks over rAF |
| Runtime tail gate | phone | 2 attempts x (40k nodes + 150 playouts), about 250-700 ms on an iPhone 12, behind the level intro card |
| Parse `levels-data.js` (about 130 KB) | phone | < 3 ms |

### 3.8 Baked vs runtime

- **Baked:** L1-L300 per track. Encoding (one line per level), extends RESEARCH 3.2:
  `"<shape>|<locks>|<par>|<timeS>|<belts>|<bunny>|<rack>|<cellsL>|<cellsR>|<cellsH>"`, rack = per compartment its
  layers joined by `/`, one base-36 char per slot (`.` = hole), belts = `Nb,Wv,v100,dir,appear100`.
  About 220 chars per level, about 130 KB for 600 levels.
- **Runtime tail (L301+):** `gen(track, n)` with the same `randomFill` and knobs (4.6), seeded by `(track, n,
  attempt)`, gated by a **node-budget** (not ms) so the outcome is identical on every device. Attempts 0 and 1 only.
- **If the gate fails twice:** use the **remix**: base = baked level `201 + ((n - 301) mod 100)` with the same saw-tooth
  index, apply the seeded integer transform `remix-<track>-<n>` (type relabel, compartment permutation within shape
  symmetry, slot order inside each layer, belt cell rotation). These transforms preserve solvability and the witness
  (it is transformed alongside), so no search is needed. Timed remixes additionally scale belt speed by
  `min(1.4, 1 + 0.02 * cycle)` and time by `max(0.85, 1 - 0.01 * cycle)` with `cycle = floor((n - 301) / 100)`.
- The result of `gen(track, n)` is cached in memory for the session and stored inside the run snapshot, so a resume
  never regenerates.

---

## 4. Levels

### 4.1 Structure

- **Saw-tooth** from L10: `idx = (L-1) % 10`; idx 0 = Pause (breather), idx 4 = Schwer, idx 9 = Sehr schwer, else
  Normal. Schwer/Sehr schwer show a red "Schwer" badge on the intro card and in the HUD (RESEARCH G15).
- **Curated opening L1-L30 per track**, made by the generator under hand-set knobs (tables below) and then
  **hand-reviewed**: the build writes `docs/preview/levels/<track>-<n>.png` contact sheets (UI screenshot harness),
  the owner or developer marks any level as "reroll" in `scripts/level-overrides.json` (`{ "E-17": { attempt: 4 } }`).
  L1-L6 are **fully authored** boards (written by hand in `scripts/authored.js`), because the first minutes decide
  whether she keeps playing.
- **Shared structure L1-L20**: both tracks play the same boards (timed adds a clock and belt motion), so the
  mechanics are taught once, in the same order: L1 drag, L2 tap + undo, L3 layers, L6 bunny, L7 lock, L8 pips (third
  layer), L10 first "Schwer", L12 side shelves.
- **From L21** the tracks diverge: Z adds speed (belt speed, ramp, opposite direction, horizontal belt, shorter
  time per item); E adds sorting depth (layers to 6, more locks, more types, confusable pairs, less free space).

### 4.2 Authored L1-L6 (exact boards; types as letters, `.` = hole, `/` separates layers front/next/...)

| L | Shape | Rack (compartments in index order) | Teaches |
|---|---|---|---|
| 1 | A4 | `AB.` `BA.` `CAB` `CC.` (9 items, F0 3) | Drag a product; three alike clear. Coach mark animates `C` from comp 2 into comp 3 (instant triple) |
| 2 | A5 | cap `AB.` ; `CDA` `BC.` `DCB` `A.D` (12 items, F0 3) | Tap to select, tap a target; "Rückgängig" button pulses once after the first move |
| 3 | A6 | `AB./CD.` `BCA` `DA./B..` `C.D` `EE.` `E..` (15 items, F0 6) | Dark row behind: "Leere die vordere Reihe, dann rückt die hintere nach vorn" |
| 4 | A6 | 4 compartments with a next layer of 1-2, 21 items, 7 types | Practice; first time a revealed row brings a pair |
| 5 | A7 | top cap + 6, layer 2 on 5, 27 items | First full-size feel; still no pressure |
| 6 | A7 | as L5, bunny in comp 3 next layer | Goldhase: collect (tap), then spend on the fullest compartment |

L2 and L4-L6 are written in `scripts/authored.js` as concrete strings like L1/L3; the table gives intent, the file
is the truth, and the witness test covers them like every other level.

### 4.3 Knob definitions

| Column | Meaning |
|---|---|
| Rack (C) | shape from 1.2 and compartment count |
| F0 | empty front slots at start (unlocked compartments) |
| Tiefe | maximum layers in any compartment (front counts as 1) |
| Ebenen-Plan | `Lk×n` = n compartments have a layer k (so `L2×10 L3×4` = all 10 have a next layer, 4 have a third) |
| Rück | size range of each back layer |
| Schlösser | `k×Nn` = k locked compartments, start counter n (staggered +0/+1/+2) |
| Seite Nb/Wv | cells per side belt / visible cells; `-` = no belts |
| v | belt speed in cells per second; `+` = in-level ramp of +30% by the end |
| Richtung | ↑↑ both belts move up; ↑↓ right belt moves down |
| Horiz. | horizontal belt: `Start` from the start, `40%` slides in at 40% cleared |
| Typen | distinct product types (some types appear 6 times when triples > types) |
| Hase | golden bunnies placed in the level |
| Items | product total (rack + belts), multiple of 3; capped at 110 (Z) / 120 (E): the generator trims the deepest layers to hit the cap |
| Zeit | timed limit (formula 4.6) before the casual-bot correction (3.6) |

### 4.4 Track Z, "Gegen die Zeit", L1-L60

| L | Tag | Rack (C) | F0 | Tiefe | Ebenen-Plan | Rück | Schlösser | Seite Nb/Wv | v | Richtung | Horiz. | Typen | Hase | Items | Zeit |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Tut | A4(4) | 3 | 1 | - | 1-2 | - | - | - | - | - | 3 | 0 | 9 | 2:00 |
| 2 | Tut | A5(5) | 3 | 1 | - | 1-2 | - | - | - | - | - | 4 | 0 | 12 | 2:15 |
| 3 | Norm | A6(6) | 3 | 2 | L2×2 | 1-2 | - | - | - | - | - | 6 | 0 | 18 | 3:10 |
| 4 | Norm | A6(6) | 3 | 2 | L2×4 | 1-2 | - | - | - | - | - | 7 | 0 | 21 | 3:35 |
| 5 | Norm | A7(7) | 3 | 2 | L2×5 | 1-2 | - | - | - | - | - | 8 | 0 | 27 | 4:25 |
| 6 | Norm | A7(7) | 3 | 2 | L2×6 | 1-2 | - | - | - | - | - | 9 | 1 | 27 | 4:25 |
| 7 | Norm | A8(8) | 3 | 2 | L2×6 | 1-2 | 1×N2 | - | - | - | - | 10 | 0 | 30 | 4:50 |
| 8 | Norm | A8(8) | 3 | 3 | L2×6 L3×2 | 1-2 | - | - | - | - | - | 10 | 0 | 33 | 5:15 |
| 9 | Norm | A8(8) | 4 | 2 | L2×5 | 1-2 | - | - | - | - | - | 9 | 0 | 27 | 4:20 |
| 10 | S.schwer | A9(9) | 3 | 3 | L2×9 L3×3 | 1-3 | - | - | - | - | - | 11 | 1 | 48 | 5:50 |
| 11 | Pause | A8(8) | 4 | 2 | L2×6 | 1-2 | - | - | - | - | - | 10 | 0 | 30 | 3:35 |
| 12 | Norm | A8(8) | 4 | 2 | L2×6 | 1-2 | - | 7/6 | 0.2 | ↑↑ | - | 11 | 0 | 45 | 3:45 |
| 13 | Norm | A8(8) | 4 | 2 | L2×8 | 1-2 | 1×N3 | 7/6 | 0.2 | ↑↑ | - | 12 | 0 | 48 | 4:00 |
| 14 | Norm | A9(9) | 4 | 2 | L2×9 | 1-2 | - | 7/6 | 0.2 | ↑↑ | - | 12 | 0 | 51 | 4:15 |
| 15 | Schwer | A9(9) | 4 | 3 | L2×9 L3×3 | 1-3 | - | 7/6 | 0.2 | ↑↑ | - | 12 | 1 | 63 | 5:50 |
| 16 | Norm | A8(8) | 4 | 3 | L2×8 L3×2 | 1-2 | 1×N3 | 7/6 | 0.2 | ↑↑ | - | 12 | 0 | 51 | 4:10 |
| 17 | Norm | A9(9) | 4 | 3 | L2×9 L3×3 | 1-2 | - | 7/6 | 0.2 | ↑↑ | - | 13 | 0 | 57 | 4:45 |
| 18 | Norm | A9(9) | 4 | 3 | L2×9 L3×3 | 1-2 | 1×N3 | 7/6 | 0.2 | ↑↑ | - | 13 | 0 | 57 | 4:40 |
| 19 | Norm | A9(9) | 4 | 3 | L2×9 L3×4 | 1-2 | - | 7/6 | 0.2 | ↑↑ | - | 13 | 0 | 57 | 4:40 |
| 20 | S.schwer | A10(10) | 4 | 3 | L2×10 L3×5 | 2-3 | - | 9/8 | 0.25 | ↑↑ | - | 14 | 1 | 81 | 7:55 |
| 21 | Pause | A9(9) | 5 | 2 | L2×9 | 1-2 | - | 8/6 | 0.16 | ↑↑ | - | 12 | 0 | 51 | 4:45 |
| 22 | Norm | A9(9) | 5 | 3 | L2×9 L3×3 | 1-2 | 1×N3 | 8/6 | 0.22 | ↑↑ | - | 12 | 0 | 54 | 4:25 |
| 23 | Norm | A9(9) | 5 | 3 | L2×9 L3×3 | 1-2 | 1×N3 | 8/6 | 0.23 | ↑↑ | - | 12 | 1 | 54 | 4:20 |
| 24 | Norm | A9(9) | 5 | 3 | L2×9 L3×3 | 1-2 | 1×N3 | 8/6 | 0.24 | ↑↑ | - | 12 | 0 | 54 | 4:20 |
| 25 | Schwer | A10(10) | 5 | 3 | L2×10 L3×3 | 1-3 | - | 10/8 | 0.25 | ↑↑ | - | 12 | 1 | 72 | 6:00 |
| 26 | Norm | A9(9) | 5 | 3 | L2×9 L3×4 | 1-2 | 1×N3 | 8/6 | 0.26 | ↑↑ | - | 12 | 0 | 57 | 4:30 |
| 27 | Norm | A9(9) | 5 | 3 | L2×9 L3×4 | 1-2 | 1×N3 | 8/6 | 0.27 | ↑↑ | - | 12 | 0 | 57 | 4:30 |
| 28 | Norm | A9(9) | 5 | 3 | L2×9 L3×4 | 1-2 | 1×N3 | 8/6 | 0.28 | ↑↑ | - | 12 | 0 | 57 | 4:25 |
| 29 | Norm | A9(9) | 5 | 3 | L2×9 L3×4 | 1-2 | 1×N3 | 8/6 | 0.29 | ↑↑ | - | 12 | 0 | 57 | 4:25 |
| 30 | S.schwer | A10(10) | 5 | 3 | L2×10 L3×4 | 2-3 | - | 10/8 | 0.35 | ↑↑ | Start | 13 | 1 | 90 | 7:40 |
| 31 | Pause | A9(9) | 5 | 2 | L2×9 | 1-2 | - | 8/6 | 0.26+ | ↑↑ | - | 13 | 0 | 51 | 4:25 |
| 32 | Norm | A9(9) | 5 | 3 | L2×9 L3×5 | 1-2 | 1×N3 | 8/6 | 0.32+ | ↑↑ | - | 13 | 0 | 57 | 4:20 |
| 33 | Norm | A9(9) | 5 | 3 | L2×9 L3×5 | 1-2 | 1×N3 | 8/6 | 0.33+ | ↑↑ | - | 13 | 1 | 57 | 4:15 |
| 34 | Norm | A9(9) | 5 | 3 | L2×9 L3×5 | 1-2 | 1×N3 | 8/6 | 0.34+ | ↑↑ | - | 13 | 0 | 57 | 4:15 |
| 35 | Schwer | A10(10) | 5 | 3 | L2×10 L3×5 | 1-3 | - | 10/8 | 0.35+ | ↑↑ | 40% | 13 | 1 | 84 | 6:15 |
| 36 | Norm | A9(9) | 5 | 3 | L2×9 L3×6 | 1-2 | 1×N3 | 8/6 | 0.36+ | ↑↑ | - | 13 | 0 | 60 | 4:25 |
| 37 | Norm | A9(9) | 5 | 3 | L2×9 L3×6 | 1-2 | 1×N3 | 8/6 | 0.37+ | ↑↑ | - | 13 | 0 | 60 | 4:20 |
| 38 | Norm | A9(9) | 5 | 3 | L2×9 L3×6 | 1-2 | 1×N3 | 8/6 | 0.38+ | ↑↑ | - | 13 | 0 | 60 | 4:20 |
| 39 | Norm | A9(9) | 5 | 3 | L2×9 L3×6 | 1-2 | 1×N3 | 8/6 | 0.39+ | ↑↑ | - | 13 | 0 | 60 | 4:15 |
| 40 | S.schwer | A10(10) | 5 | 3 | L2×10 L3×6 | 2-3 | - | 10/8 | 0.45+ | ↑↑ | Start | 14 | 1 | 96 | 7:35 |
| 41 | Pause | A9(9) | 5 | 2 | L2×9 | 1-2 | - | 9/6 | 0.36+ | ↑↑ | - | 14 | 0 | 54 | 4:10 |
| 42 | Norm | A10(10) | 4 | 3 | L2×10 L3×7 | 1-2 | 2×N4 | 11/8 | 0.42+ | ↑↑ | - | 14 | 0 | 72 | 4:50 |
| 43 | Norm | A10(10) | 4 | 3 | L2×10 L3×7 | 1-2 | 2×N4 | 11/8 | 0.43+ | ↑↑ | - | 14 | 1 | 72 | 4:50 |
| 44 | Norm | A10(10) | 4 | 3 | L2×10 L3×7 | 1-2 | 2×N4 | 11/8 | 0.44+ | ↑↑ | - | 14 | 0 | 72 | 4:45 |
| 45 | Schwer | A10(10) | 4 | 4 | L2×10 L3×7 L4×2 | 1-3 | - | 11/8 | 0.45+ | ↑↓ | 40% | 14 | 1 | 96 | 6:30 |
| 46 | Norm | A10(10) | 4 | 3 | L2×10 L3×8 | 1-2 | 2×N4 | 11/8 | 0.46+ | ↑↑ | - | 14 | 0 | 75 | 4:55 |
| 47 | Norm | A10(10) | 4 | 3 | L2×10 L3×8 | 1-2 | 2×N4 | 11/8 | 0.47+ | ↑↑ | - | 14 | 0 | 75 | 4:50 |
| 48 | Norm | A10(10) | 4 | 3 | L2×10 L3×8 | 1-2 | 2×N4 | 11/8 | 0.48+ | ↑↑ | - | 14 | 0 | 75 | 4:50 |
| 49 | Norm | A10(10) | 4 | 3 | L2×10 L3×8 | 1-2 | 2×N4 | 11/8 | 0.49+ | ↑↑ | - | 14 | 0 | 75 | 4:45 |
| 50 | S.schwer | A10(10) | 4 | 4 | L2×10 L3×8 L4×2 | 2-3 | - | 11/8 | 0.55+ | ↑↓ | Start | 15 | 1 | 108 | 7:45 |
| 51 | Pause | A9(9) | 5 | 2 | L2×9 | 1-2 | - | 9/6 | 0.46+ | ↑↑ | - | 15 | 0 | 54 | 3:50 |
| 52 | Norm | A10(10) | 4 | 3 | L2×10 L3×9 | 1-2 | 2×N4 | 11/8 | 0.52+ | ↑↑ | - | 15 | 0 | 75 | 4:35 |
| 53 | Norm | A10(10) | 4 | 3 | L2×10 L3×9 | 1-2 | 2×N4 | 11/8 | 0.53+ | ↑↑ | - | 15 | 1 | 75 | 4:35 |
| 54 | Norm | A10(10) | 4 | 3 | L2×10 L3×9 | 1-2 | 2×N4 | 11/8 | 0.54+ | ↑↑ | - | 15 | 0 | 75 | 4:30 |
| 55 | Schwer | A10(10) | 4 | 4 | L2×10 L3×9 L4×3 | 1-3 | - | 11/8 | 0.55+ | ↑↓ | 40% | 15 | 1 | 102 | 6:20 |
| 56 | Norm | A10(10) | 4 | 3 | L2×10 L3×10 | 1-2 | 2×N4 | 11/8 | 0.56+ | ↑↑ | - | 15 | 0 | 78 | 4:40 |
| 57 | Norm | A10(10) | 4 | 3 | L2×10 L3×10 | 1-2 | 2×N4 | 11/8 | 0.57+ | ↑↑ | - | 15 | 0 | 78 | 4:35 |
| 58 | Norm | A10(10) | 4 | 3 | L2×10 L3×10 | 1-2 | 2×N4 | 11/8 | 0.58+ | ↑↑ | - | 15 | 0 | 78 | 4:35 |
| 59 | Norm | A10(10) | 4 | 3 | L2×10 L3×10 | 1-2 | 2×N4 | 11/8 | 0.59+ | ↑↑ | - | 15 | 0 | 78 | 4:30 |
| 60 | S.schwer | A10(10) | 4 | 4 | L2×10 L3×10 L4×3 | 2-3 | - | 11/8 | 0.65+ | ↑↓ | Start | 16 | 1 | 117 | 7:40 |

### 4.5 Track E, "Entspannt", L1-L60 (no clock; belts still until L40, then a slow 0.08 cells/s drift)

| L | Tag | Rack (C) | F0 | Tiefe | Ebenen-Plan | Rück | Schlösser | Seite Nb/Wv | v | Typen | Hase | Items |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Tut | A4(4) | 3 | 1 | - | 1-2 | - | - | - | 3 | 0 | 9 |
| 2 | Tut | A5(5) | 3 | 1 | - | 1-2 | - | - | - | 4 | 0 | 12 |
| 3 | Norm | A6(6) | 3 | 2 | L2×2 | 1-2 | - | - | - | 6 | 0 | 18 |
| 4 | Norm | A6(6) | 3 | 2 | L2×4 | 1-2 | - | - | - | 7 | 0 | 21 |
| 5 | Norm | A7(7) | 3 | 2 | L2×5 | 1-2 | - | - | - | 8 | 0 | 27 |
| 6 | Norm | A7(7) | 3 | 2 | L2×6 | 1-2 | - | - | - | 9 | 1 | 27 |
| 7 | Norm | A8(8) | 3 | 2 | L2×6 | 1-2 | 1×N2 | - | - | 10 | 0 | 30 |
| 8 | Norm | A8(8) | 3 | 3 | L2×6 L3×2 | 1-2 | - | - | - | 10 | 0 | 33 |
| 9 | Norm | A8(8) | 4 | 2 | L2×5 | 1-2 | - | - | - | 9 | 0 | 27 |
| 10 | S.schwer | A9(9) | 3 | 3 | L2×9 L3×3 | 1-3 | - | - | - | 11 | 1 | 48 |
| 11 | Pause | A8(8) | 4 | 2 | L2×6 | 1-2 | - | - | - | 10 | 0 | 30 |
| 12 | Norm | A8(8) | 4 | 2 | L2×6 | 1-2 | - | 6/6 | 0 | 11 | 0 | 42 |
| 13 | Norm | A8(8) | 4 | 2 | L2×8 | 1-2 | 1×N3 | 6/6 | 0 | 12 | 0 | 45 |
| 14 | Norm | A9(9) | 4 | 2 | L2×9 | 1-2 | - | 6/6 | 0 | 12 | 0 | 48 |
| 15 | Schwer | A9(9) | 4 | 3 | L2×9 L3×3 | 1-3 | - | 6/6 | 0 | 12 | 1 | 60 |
| 16 | Norm | A8(8) | 4 | 3 | L2×8 L3×2 | 1-2 | 1×N3 | 6/6 | 0 | 12 | 0 | 48 |
| 17 | Norm | A9(9) | 4 | 3 | L2×9 L3×3 | 1-2 | - | 6/6 | 0 | 13 | 0 | 54 |
| 18 | Norm | A9(9) | 4 | 3 | L2×9 L3×3 | 1-2 | 1×N3 | 6/6 | 0 | 13 | 0 | 54 |
| 19 | Norm | A9(9) | 4 | 3 | L2×9 L3×4 | 1-2 | - | 6/6 | 0 | 13 | 0 | 54 |
| 20 | S.schwer | A10(10) | 4 | 3 | L2×10 L3×5 | 2-3 | - | 8/8 | 0 | 14 | 1 | 78 |
| 21 | Pause | A10(10) | 4 | 3 | L2×10 L3×4 | 1-2 | - | 8/8 | 0 | 14 | 0 | 63 |
| 22 | Norm | A10(10) | 3 | 4 | L2×10 L3×4 L4×2 | 1-2 | 2×N3 | 8/8 | 0 | 14 | 0 | 66 |
| 23 | Norm | A10(10) | 3 | 4 | L2×10 L3×4 L4×2 | 1-2 | 2×N3 | 8/8 | 0 | 14 | 0 | 66 |
| 24 | Norm | A10(10) | 3 | 4 | L2×10 L3×4 L4×2 | 1-2 | 2×N3 | 8/8 | 0 | 14 | 0 | 66 |
| 25 | Schwer | A10(10) | 3 | 4 | L2×10 L3×5 L4×2 | 1-3 | 1×N4 | 8/8 | 0 | 15 | 1 | 75 |
| 26 | Norm | A10(10) | 3 | 4 | L2×10 L3×5 L4×2 | 1-2 | 2×N3 | 8/8 | 0 | 15 | 0 | 69 |
| 27 | Norm | A10(10) | 3 | 4 | L2×10 L3×5 L4×3 | 1-2 | 2×N3 | 8/8 | 0 | 15 | 0 | 69 |
| 28 | Norm | A10(10) | 3 | 4 | L2×10 L3×5 L4×3 | 1-2 | 2×N3 | 8/8 | 0 | 15 | 0 | 69 |
| 29 | Norm | A10(10) | 3 | 4 | L2×10 L3×6 L4×3 | 1-2 | 2×N3 | 8/8 | 0 | 15 | 0 | 72 |
| 30 | S.schwer | A10(10) | 3 | 4 | L2×10 L3×6 L4×3 | 2-3 | 1×N4 | 8/8 | 0 | 16 | 1 | 90 |
| 31 | Pause | A10(10) | 4 | 3 | L2×10 L3×4 | 1-2 | - | 8/8 | 0 | 16 | 0 | 63 |
| 32 | Norm | A10(10) | 3 | 4 | L2×10 L3×6 L4×3 | 1-2 | 2×N4 | 8/8 | 0 | 16 | 0 | 72 |
| 33 | Norm | A10(10) | 3 | 4 | L2×10 L3×7 L4×4 | 1-2 | 2×N4 | 8/8 | 0 | 16 | 0 | 75 |
| 34 | Norm | A10(10) | 3 | 4 | L2×10 L3×7 L4×4 | 1-2 | 2×N4 | 8/8 | 0 | 16 | 0 | 75 |
| 35 | Schwer | A10(10) | 3 | 5 | L2×10 L3×7 L4×4 L5×1 | 1-3 | 1×N4 | 8/8 | 0 | 17 | 1 | 87 |
| 36 | Norm | A10(10) | 3 | 4 | L2×10 L3×7 L4×4 | 1-2 | 2×N4 | 8/8 | 0 | 17 | 0 | 75 |
| 37 | Norm | A10(10) | 3 | 4 | L2×10 L3×8 L4×4 | 1-2 | 2×N4 | 8/8 | 0 | 17 | 0 | 75 |
| 38 | Norm | A10(10) | 3 | 4 | L2×10 L3×8 L4×4 | 1-2 | 2×N4 | 8/8 | 0 | 17 | 0 | 75 |
| 39 | Norm | A10(10) | 3 | 4 | L2×10 L3×8 L4×5 | 1-2 | 2×N4 | 8/8 | 0 | 17 | 0 | 78 |
| 40 | S.schwer | A10(10) | 3 | 5 | L2×10 L3×8 L4×5 L5×1 | 2-3 | 1×N4 | 8/8 | 0 | 18 | 1 | 102 |
| 41 | Pause | A10(10) | 4 | 3 | L2×10 L3×4 | 1-2 | - | 9/8 | 0.08 | 18 | 0 | 66 |
| 42 | Norm | A10(10) | 2 | 5 | L2×10 L3×9 L4×5 L5×2 | 1-2 | 3×N4 | 9/8 | 0.08 | 18 | 0 | 84 |
| 43 | Norm | A10(10) | 2 | 5 | L2×10 L3×9 L4×5 L5×2 | 1-2 | 3×N4 | 9/8 | 0.08 | 18 | 0 | 84 |
| 44 | Norm | A10(10) | 2 | 5 | L2×10 L3×9 L4×5 L5×2 | 1-2 | 3×N4 | 9/8 | 0.08 | 18 | 0 | 84 |
| 45 | Schwer | A10(10) | 2 | 5 | L2×10 L3×10 L4×6 L5×2 | 1-3 | 1×N4 | 9/8 | 0.08 | 19 | 1 | 102 |
| 46 | Norm | A10(10) | 2 | 5 | L2×10 L3×10 L4×6 L5×2 | 1-2 | 3×N4 | 9/8 | 0.08 | 19 | 0 | 87 |
| 47 | Norm | A10(10) | 2 | 5 | L2×10 L3×10 L4×6 L5×2 | 1-2 | 3×N4 | 9/8 | 0.08 | 19 | 0 | 87 |
| 48 | Norm | A10(10) | 2 | 5 | L2×10 L3×10 L4×6 L5×2 | 1-2 | 3×N4 | 9/8 | 0.08 | 19 | 0 | 87 |
| 49 | Norm | A10(10) | 2 | 5 | L2×10 L3×10 L4×6 L5×2 | 1-2 | 3×N4 | 9/8 | 0.08 | 19 | 0 | 87 |
| 50 | S.schwer | A12(12) | 2 | 6 | L2×12 L3×11 L4×6 L5×2 L6×2 | 2-3 | 1×N4 | 10/9 | 0.08 | 20 | 1 | 138 |
| 51 | Pause | A10(10) | 4 | 3 | L2×10 L3×4 | 1-2 | - | 9/8 | 0.08 | 20 | 0 | 66 |
| 52 | Norm | A10(10) | 2 | 5 | L2×10 L3×10 L4×7 L5×3 | 1-2 | 3×N5 | 9/8 | 0.08 | 20 | 0 | 90 |
| 53 | Norm | A10(10) | 2 | 5 | L2×10 L3×10 L4×7 L5×3 | 1-2 | 3×N5 | 9/8 | 0.08 | 20 | 0 | 90 |
| 54 | Norm | A10(10) | 2 | 5 | L2×10 L3×10 L4×7 L5×3 | 1-2 | 3×N5 | 9/8 | 0.08 | 20 | 0 | 90 |
| 55 | Schwer | A10(10) | 2 | 5 | L2×10 L3×10 L4×7 L5×3 | 1-3 | 1×N4 | 9/8 | 0.08 | 21 | 1 | 105 |
| 56 | Norm | A10(10) | 2 | 6 | L2×10 L3×10 L4×7 L5×3 L6×1 | 1-2 | 3×N5 | 9/8 | 0.08 | 21 | 0 | 93 |
| 57 | Norm | A10(10) | 2 | 6 | L2×10 L3×10 L4×8 L5×3 L6×1 | 1-2 | 3×N5 | 9/8 | 0.08 | 21 | 0 | 93 |
| 58 | Norm | A10(10) | 2 | 6 | L2×10 L3×10 L4×8 L5×3 L6×1 | 1-2 | 3×N5 | 9/8 | 0.08 | 21 | 0 | 93 |
| 59 | Norm | A10(10) | 2 | 6 | L2×10 L3×10 L4×8 L5×3 L6×1 | 1-2 | 3×N5 | 9/8 | 0.08 | 21 | 0 | 93 |
| 60 | S.schwer | A12(12) | 2 | 6 | L2×12 L3×12 L4×8 L5×3 L6×2 | 2-3 | 1×N4 | 10/9 | 0.08 | 22 | 1 | 147 |

Relaxed par (shown as "Züge 23 / 31") is baked from the solver (3.5); expected range: `par ≈ items x (0.85 + 0.10 x (Tiefe - 1))`,
for example L30: 90 items, depth 4 -> about 104.

### 4.6 Formulas (both tracks; L61+ continue the same formulas, the generator clamps)

```
idx = (L-1) % 10 ; tag = idx0 Pause | idx4 Schwer | idx9 SehrSchwer | Normal   (L1-9: Tutorial/Normal, L10 SehrSchwer)
Wv(shape)   = ceil(rackRows * 6/5)                         // side cell pitch = 5/6 of a rack row
Nb          = v == 0 ? Wv : Wv + h,  h(Z) = 1 (L<=20), 2 (<=40), 3 (<=60), 4 (61+); h(E) = 1
Track Z:
  v(L)      = L<12 ? none : L<=20 ? 0.20 : min(1.00, 0.20 + 0.01*(L-20));  Pause -0.05, SehrSchwer +0.05
  ramp      = L>=31 ? 0.30 : 0                             // v_eff = v * (1 + ramp * cleared/total)
  dir       = (L>=41 and tag in {Schwer, SehrSchwer}) ? right belt down : both up
  horizontal= L>=30 and SehrSchwer: Start ; L>=35 and Schwer: appearAt 0.40 ; L>=101 Normal: 1 in 3 (seeded), appearAt 0.50
  depthMax  = L<=40 ? 3 : L<=80 ? 4 : 5 (5 only on SehrSchwer)
  F0        = Pause 5 ; L<=40 5 ; else 4
  locks     = Pause/Schwer/SehrSchwer none ; L<=40 1×N3 ; else 2×N4
  types     = min(16, 12 + floor((L-20)/10)) ; confusable pairs: 1 from L31, 2 from L61
  bunny     = 1 on Schwer, SehrSchwer and idx 2; placed in a belt cell from L21 ("catch it"), else back layer 1
  time (s)  = clamp(round5((20 + nRack*sC + nBelt*sS) * m), L<=20 ? 120 : 90, 480)
              sC = max(3.0, 6.0 - 0.04*(L-1)), sS = 0.5*sC
              m  = 1.5 (L<=9), Pause 1.15, Normal 1.0, Schwer 1.10, SehrSchwer 1.20
Track E:
  v         = L<12 ? none : L<=40 ? 0 : 0.08 (setting "Regale stehen still" forces 0)
  depthMax  = L<=20 ? 3 : L<=30 ? 4 : L<=45 ? 5 : 6 ; layer 6 only on SehrSchwer until L55, then 1 comp on Normal
  F0        = Pause 4 ; L<=40 3 ; else 2  (generator may relax to +1, logged)
  locks     = Pause none ; Schwer/SehrSchwer 1×N4 ; L<=40 2×N(3 + floor((L-21)/10)) ; else 3×N(min(6, 4 + floor((L-41)/10)))
  types     = min(22, 14 + floor((L-20)/5)) ; confusable pairs: 1 from L21, 2 from L31, 3 from L46
  bunny     = 1 on Schwer and SehrSchwer, always in back layer 1-2 (a reward for digging)
  shape     = A10 ; A12 on SehrSchwer from L50
Beyond L60 (both): the Ebenen-Plan counts keep growing by the table's slope until every compartment reaches
depthMax; items cap 110 (Z) / 120 (E); then difficulty grows only through v (Z, to 1.0 at L100), types (to the cap),
F0 (Z: 4 -> 3 at L121) and lock counters (E: to 6). Breathers stay at the previous block's Normal minus one layer.
```

---

## 5. Scoring and highscore

### 5.1 Timed ("Gegen die Zeit")

| Item | Rule |
|---|---|
| Match | `100 x mult`, `mult = min(4, 1 + 0.5 x (chain - 1))` (cap x4 at chain 7, RESEARCH S1) |
| Combo | R17: 6000 ms window per match; HUD "Kombo xN" with a draining bar (scaleX) |
| Bunny spend | 0 points, counts as a match for locks only |
| Clear bonus | +250 |
| Time bonus | +5 per full second left; 0 if +30 s was taken |
| Unspent bunny | +150 each |
| Fehlerfrei | +250 if cleared with no undo, no spend, no rescue, no +30 s |
| Stars (level) | time left / limit >= 0.50 -> 3, >= 0.25 -> 2, else 1; +30 s taken -> 1 star |

**The Serie (what a run is).** Progress and highscore are separated, because a casual player must never lose
progress:
- **Progress**: the reached level in track Z is stored permanently. "Weiterspielen" always starts the current level.
- **Serie**: the running sum of level scores over consecutive levels. It starts at 0 on the first timed level and
  after every banked Serie (no calendar logic).
- **The Serie is banked** (written into the top 10, then reset to 0) when: the clock hits 0 a second time in a level
  (R16), the player taps "Level neu" in timed, or "Serie beenden" in the pause menu. The player then replays the
  same level with a new Serie. Match points earned in the failed attempt count towards the banked Serie.
- **Top 10** per track Z: `{ score, fromLevel, toLevel, date }`, sorted by score, then toLevel. Shown as
  "1. 48 250 Punkte · Level 12-19 · 03.11.". The best entry is the "Rekord" in the HUD.
- **Per-level best** (timed): best level score and best stars per level, shown on the clear card ("Bestwert 2 950").

### 5.2 Relaxed ("Entspannt")

| Item | Rule |
|---|---|
| Level score | `round(1000 x min(1, par / moves))` (RESEARCH S8) |
| Stars | moves <= par -> 3; <= ceil(1.5 x par) -> 2; else 1 |
| Combo | R18 3-move window; HUD shows 3 pips + "Kombo xN"; no points, gives the x5 bunny |
| Bunny | collect/spend free; spend makes beating par easier (it is a reward, placed by the level) |
| Badges | "Ohne Hilfe" (no undo, hint, rescue), "Goldhase gespart" (unspent bunny) |
| Records | per level `{ best, stars, moves, badges }`; headline **Gesamtpunkte = Σ best**, **★ total**, **Level erreicht** |
| Top 10 | the 10 most recent personal records ("Level 23: 940 → 1000"), since Σ best already is the highscore |

A relaxed level is never "lost": stuck shows the sheet (1.9); leaving costs nothing; replay shows the identical board,
and only the better attempt counts.

### 5.3 Retry semantics

| Situation | Relaxed | Timed |
|---|---|---|
| Stuck (out of space) | sheet: undo / bunny / rescue / restart; nothing recorded | banner: same; restart banks the Serie |
| Timeout 1 | - | "+30 Sekunden" (free) or "Serie beenden" |
| Timeout 2 | - | Serie banked, same level restarts, progress kept |
| Restart | identical board, free | identical board, banks the Serie |
| Quit to menu | progress and the board in progress are saved | same; the Serie continues on "Weiterspielen" |
| Reload / tab killed | resume the exact board (run snapshot) | resume, clock and belts paused until the first touch |

---

## 6. Boosters and helpers (no ads, no economy)

| Helper | Branch | How you get it | Effect on layers | Effect on belts | Score effect |
|---|---|---|---|---|---|
| Rückgängig | both, from L2 | unlimited | restores fronts, backs, locks | restores the cell (bars lift); phase not rewound | removes undone points; loses "Fehlerfrei"/"Ohne Hilfe" |
| Goldhase | both, from L6 | placed in levels (4.4/4.5), +1 at combo x5 (once per level), 1 rescue per level when stuck | spend empties the compartment completely, all layers, pips vanish | collect from a cell bars it; spend cannot target belts | 0 points; unspent +150 (Z) |
| Tipp | relaxed, from L4 | unlimited, 3 s cooldown | may suggest emptying a front to reveal | may suggest a take | loses "Ohne Hilfe" |
| +30 Sekunden | timed | once per level at the first timeout | - | belts keep speed | time bonus 0, 1 star, no "Fehlerfrei" |

**Golden bunny frequency.** Track Z: on every Schwer, Sehr schwer and idx-2 level (3 per 10) from L21, plus the
L6/L10/L15/L20 teaching levels; on belts from L21. Track E: on Schwer and Sehr schwer (2 per 10), in back layers.
Plus at most one combo bunny and one rescue per level. Expected spendable bunnies per 10 levels: Z about 4-5, E about 3-4.

**Why no hammer, shuffle, freeze, wand:** the bunny is a stronger and more readable hammer; shuffle moves dozens of
products the player did not touch (R31) and destroys her mental map; freeze is redundant with a fair clock and +30 s;
the wand solves the level for her. Fewer buttons, bigger buttons.

---

## 7. UI/UX for the owner's mother

### 7.1 Screens and flows

`TITLE` (two huge buttons "Entspannt spielen" / "Gegen die Zeit", each with its reached level and "Weiterspielen")
-> `INTRO` card per level (level number, "Schwer" badge, a 1-line new-mechanic note if any; tap anywhere) -> `PLAY`
-> `CLEAR` card (stars fly in, score breakdown, "Weiter" big, "Nochmal" small) -> next `INTRO`.
`PAUSE` (Weiter, Level neu [armed], Anleitung, Einstellungen, Zum Menü). `STUCK` sheet, `TIMEOUT` card, `SERIE` card
(banked score, top-10 rank, "Neuer Rekord!"), `BESTENLISTE` with two tabs, `EINSTELLUNGEN` (Ton, Bewegung reduzieren,
Regale stehen still (relaxed), Sparmodus, Sprache). The mode is chosen on the title screen only, never mid-level.

### 7.2 Layout at 390x844 CSS (iPhone 12-15), all numbers CSS px

| Zone | Size | Content |
|---|---|---|
| Safe top | 47 | - |
| HUD row 1 | 56 | Level pill "Level 23" · timer pill "04:53" (timed) or "Züge 12 / 31" (relaxed) · star/score pill · pause (48x48) |
| HUD row 2 | 30 | combo bar "Kombo x3" (timed bar / relaxed 3 pips) · "Noch 54" item counter |
| Horizontal belt (only when present) | 72 | one row of cells |
| Board | rest, about 560 | side belt 64 wide · gap 6 · rack 2 columns · gap 6 · side belt 64 |
| Bottom bar | 84 | Rückgängig (72x72) · Goldhase with counter (72x72) · Tipp (relaxed) or +30 s status (timed) |
| Safe bottom | 34 | - |

Rack compartment: width `(390 - 16 - 2*64 - 2*6 - 6) / 2 = 114`, slot 38 wide; rack rows `560 / 6 = 93` for A10 ->
items 70-76 px tall (RESEARCH 6.2 target 64-80). Without belts (L1-L11) a compartment is 181 wide and items reach 80 px.
At 375x667 with A12 + belts: rows 66 px, items 54 px (floor 52). Every tap target >= 44 px; side cells 64 x 78.

### 7.3 How things are drawn (DOM)

- **Compartment**: `div.comp` with plank, back wall, contact shadows (static). Front items: `<img class="item">`,
  transform-positioned as today.
- **Next layer**: a `div.back` behind the front inside the compartment, holding its `<img>`s scaled 0.88, raised 6%,
  plus **one** overlay `div.dim` (`rgba(40,25,15,0.55)`), never a filter per item (RESEARCH 6.2).
- **Pips**: `div.pips` bottom-right on the plank, up to 4 dots 8 px (cream on dark wood), one per hidden layer.
- **Lock**: chain SVG over the compartment, round blue badge 40 px with the number (like the original, without "AD");
  `lockTick` pulses the badge (scale 1.25, 200 ms); `unlock` drops the chains (translateY 40 px, fade, 300 ms) + clank.
- **Belt**: `div.belt` (overflow hidden) with `Nb` absolutely positioned `div.cell`, each with its own WAAPI animation
  `translateY(start) -> translateY(start - Nb*pitch)`, `iterations: Infinity`, `easing: linear`, duration
  `Nb / v` s, `currentTime` set from the model phase. No duplicates are needed because `Nb >= Wv + 1` (R-B4).
  Speed change -> `updatePlaybackRate(v_eff / v)` and a `currentTime` resync; pause -> `animation.pause()`.
- **Barred cell**: `div.bars` (5 vertical wooden bars SVG) slides from the top, 250 ms; the cell darkens to 80%.
- **Bunny**: golden sprite with a slow shimmer (CSS keyframe on opacity of a highlight `<i>`, 2 s; off in reduced motion).
- **Free slot warning**: the last free slot glows amber (box-shadow pulse twice).

### 7.4 Input rules with moving sources

1. **Drag** is primary, **tap-tap** an equal fallback (RESEARCH M4). The whole compartment is the drop zone.
2. Picking from a belt **grabs on pointerdown** (no slop wait): the product detaches from the cell at once so it cannot
   slide away under the finger. If the finger moves less than 8 px and lifts, it becomes a tap-select.
3. Hit test on belts uses R21 (current rect or any rect in the last 150 ms, +10 px across the axis).
4. A cancelled belt drag flies back to its cell's **current** position (300 ms ease-out, follows the cell).
5. While a product is held, legal compartments glow green, full ones show nothing (no red noise), locked ones stay chained.
6. Tap-select on a belt product: the product lifts out to a "hand" spot at the belt's inner edge level with the
   finger and stays there (not moving) until a target is tapped or the selection is cancelled (tap the same
   product or empty board). This removes all timing pressure from the second tap. The model is unchanged until the target tap.
7. Window-level `pointermove/pointerup` fallback (RESEARCH 6.4, WebKit 220196).

### 7.5 Feedback and juice (cheap = transform/opacity only)

| Moment | Visual | Sound |
|---|---|---|
| Pick | lift -10%, scale 1.10, soft shadow | soft "tock" |
| Drop | squash 1.08/0.90 -> 0.97/1.04 -> 1, 200 ms | wood "clack" |
| Invalid | shake ±6 px 240 ms, slide home | low "bonk" (quiet) |
| Match | hop, squeeze to middle, pop; 10 sparkles; "+150" floater | chime, pitch +1 semitone per chain step (max +6) |
| Reveal | next layer slides forward 180 ms and brightens; new dark layer fades in | "swish" |
| Lock tick / open | badge pulse / chains fall | tick / clank |
| Take from belt | cell's bars fall after the product leaves | ratchet "klick" |
| Bunny collect / spend | flies to counter with trail / golden burst wiping the compartment | sparkle arpeggio / whoosh |
| Combo x3, x5 | popup "Kombo x3!" centre; x5 adds "Goldhase!" | rising chime |
| Clear | orphan sweep into basket, confetti canvas 2 s, stars fly in 150 ms stagger | fanfare |
| Time amber / red | pill colour / pulse 1-1.12 per second | - / tick each second |

No screen shake, no flashing, no vibration dependence (iOS Safari has none).

### 7.6 Onboarding (one coach mark per mechanic, first appearance only, stored in `settings.seenTips`)

| First at | Mechanic | Coach mark (German, one sentence + animated hand) |
|---|---|---|
| L1 | drag, match | "Zieh drei gleiche Produkte in ein Fach." |
| L2 | tap, undo | "Du kannst auch tippen: erst das Produkt, dann das Fach. Vertan? Rückgängig." |
| L3 | layers | "Dahinter wartet mehr: Ist die vordere Reihe leer, rückt die dunkle nach vorn." |
| L6 | bunny | "Ein Goldhase! Tipp ihn an, dann kannst du damit ein ganzes Fach leeren." |
| L7 | lock | "Dieses Fach ist verschlossen. Nach 2 Dreiern geht es von selbst auf." |
| L8 | pips | "Die Punkte zeigen, wie viele Reihen noch dahinter stecken." |
| L12 | side belts | "Aus den Seitenregalen kannst du nur nehmen. Achte auf freien Platz in der Mitte!" |
| first `warnSpace` | free space | "Nur noch 1 Platz frei. Bilde erst einen Dreier." |
| Z L21 | moving belts faster, bunny on a belt | "Schnapp dir den Goldhasen, wenn er vorbeikommt." |
| Z L30 | horizontal belt | "Nachschub! Oben läuft jetzt ein weiteres Regal." |
| Z L45 | opposite direction | "Das rechte Regal läuft jetzt nach unten." |
| E L41 | drift | "Die Seitenregale wandern jetzt langsam. Stillstand: Einstellungen." |

Coach marks pause the clock and belts (R34). Each has "Alles klar" (big) and is re-readable from "Anleitung".

### 7.7 Accessibility

Big targets (>= 44 px, side cells 64x78), text >= 17 px (HUD numbers 24 px, bold), German strings throughout,
products distinguished by silhouette and icon (never colour alone; confusable pairs only from L21/L31),
"Bewegung reduzieren" setting plus `prefers-reduced-motion` (R36), "Regale stehen still" for relaxed (R37), unlimited
undo, every destructive button armed with a 2 s "Nochmal tippen" confirm, auto-pause on hide, no time pressure
anywhere in relaxed (not even coach marks auto-dismiss).

---

## 8. Engineering plan on the existing code

### 8.1 Data model changes

| File | Change |
|---|---|
| `src/game/board.js` (P, CHG, <= 400 lines) | `comps[c]` gains `back` (type arrays), `lock`, `x/y`; `createBoard(spec)` reads `spec.rack` (shape + layers); new `reveal(b, c)`, `lockTick(b)`, `frontEmpty`, `counts(b)` (c_t, H, F), `progressPossible(b, belts, bunnies)`, `remaining(b, belts)`; `move` triggers reveal + match; `snapshot/restore/hash/canonical` include backs and locks. Items stay ids for front products only (back layers become ids at reveal). |
| `src/game/belts.js` (P, NEW, <= 200) | `createBelts(spec)`, `advance(belts, dt, vEff)`, `cellPos(belt, k)`, `visibleCells(belt)`, `take(belt, k)` (bars), `available(belts)` (s_t), `appear(belts, clearedFrac)`, snapshot/restore (phase excluded from undo snapshots). |
| `src/game/game.js` (P, CHG, <= 420) | `createGame(level, branch, opts)`, `moveItem`, `takeItem(g, beltId, cell, toComp, toSlot)`, `collect(g, ref)`, `spendBunny(g, comp)`, `undo(g)`, `extendTime(g)`, `tick(g, dt)` per 2.2; status `playing | paused-timeout | won | lost`; events per 2.3; undo stack (R-U1). |
| `src/game/rules.js` (P, NEW, <= 150) | win test R-W2, stuck test (1.9) wrapper, combo per branch (R17/R18), v_eff ramp, constants lookups; keeps `game.js` under budget. |
| `src/game/score.js` (P, CHG) | 5.1/5.2: matchPoints, clearBonus (time, bunnies, Fehlerfrei), stars per branch, relaxed efficiency. |
| `src/game/solver.js` (P, CHG, <= 400) | abstract state (3.2), DFS with memo + playouts; `witness(level)`, `hint(game, budget)` (sliceable: returns `{done, move}` per 8 ms chunk). |
| `src/game/levels.js` (P, CHG, <= 350) | decode `SS.LEVEL_DATA` (two tracks), `level(track, n)`, tail generator + node-budget gate, remix transform, art skin per level. |
| `src/game/levels-data.js` (P, NEW, generated) | `SS.LEVEL_DATA = { v: 2, gen: 1, Z: [...300], E: [...300] }`, about 130 KB. |
| `src/game/save.js` (P, CHG) | schema v2 (8.4). |
| `src/ui/board.js` (CHG, split) | `src/ui/rack.js` (<= 400: compartments, layers, dim, pips, locks, drop targets, animations) and `src/ui/belts.js` (NEW, <= 300: belt DOM, WAAPI, hit test with 150 ms history, bars, H slide-in). `src/ui/board.js` becomes the coordinator: geometry, pointer routing, drag layer (<= 300). |
| `src/ui/bottombar.js` (NEW, <= 150) | Rückgängig, Goldhase + counter, Tipp / +30 s status. |
| `src/ui/hud.js` (CHG) | combo bar (timed) / pips (relaxed), item counter, amber/red clock, Schwer badge. |
| `src/ui/overlays.js` (CHG, split if > 400) | intro card, stuck sheet, timeout card, Serie card, clear cards, two-tab Bestenliste, coach marks (`src/ui/coach.js`, NEW, <= 150). |
| `src/app/states.js` (CHG) | states INTRO, STUCK, TIMEOUT added; level identity R27; Serie bookkeeping; run snapshot v2. |
| `src/app/loop.js` (CHG) | render-loop policy 8.3. |
| `scripts/build-levels.js` (NEW, <= 450) + `scripts/gen/*.js` | knobs, randomFill, metrics, casualBot, encoder, witness writer (Node only, may share `src/game/*.js`). |
| `scripts/authored.js` (NEW) | L1-L6 boards. |

### 8.2 Game tick and app wiring

- The app calls `SS.game.tick(g, dt)` from a **250 ms timer** while timed PLAY (clock, combo, timeout), and from a
  catch-up call before every input (both branches) so belt phase is exact at hit-test time.
- Relaxed with still belts: no timer at all. Relaxed with drift: no timer either; phase is computed on input by catch-up.
- `beltSpeed` and `beltAppear` events resync the WAAPI animations: `anim.currentTime = (phaseToTime(phase)) ms`.

### 8.3 Render-loop policy and performance budget

| State | rAF | Timers | Compositor |
|---|---|---|---|
| Relaxed idle, still belts | none | none | none |
| Relaxed idle, drift | none | none | belt animations (<= 28 layers) |
| Timed PLAY | none | 250 ms HUD/tick | belts, combo bar (CSS transition of scaleX over the remaining window) |
| Any JS animation (drag, fly, sweep, confetti) | while running | - | - |

Budgets on an iPhone 11: input-to-pick < 16 ms; drop + match + reveal batch < 4 ms JS; 60 fps during drags with
both belts moving; composited layers <= 60 (about 12 MB); `will-change` only on the dragged item and belt cells;
no filters on moving elements; level build (DOM) < 40 ms for 147 items (only front + next are DOM images: at most
2 x 36 + 30 belt cells = 102 `<img>`).

### 8.4 Save and run migration

```
save v2: { v: 2, settings: { branch, muted, reducedMotion, stillBelts, lowGfx, lang, seenTips:{} },
  records: { Z: { reached, serie, best, top:[{score, fromLevel, toLevel, date}], levels:{ n:{best, stars} } },
             E: { reached, totalBest, totalStars, recent:[{level, from, to, date}], levels:{ n:{best, stars, moves, badges} } } } }
run v2 (RUN_KEY): { v: 2, rulesVersion: 2, branch, levelNo, serieStart, game: SS.game.snapshot(g) (incl. belts phase,
  undo stack trimmed to 50, generated tail level spec if n > 300) }
```

`normalizeSave` maps v1 `records.timed` -> `Z.top` (fromLevel 1, toLevel = level) and v1 `records.relaxed.top` ->
`E.reached = max(level)`. A run with `rulesVersion != 2` is dropped (R39). `CONFIG.RULES_VERSION = 2`, `VERSION = 0.2.0`.

### 8.5 Tests to add

| Test | Content |
|---|---|
| `tests/board.test.js` | reveal on empty front (holes kept), no reveal when 1 item remains, lockTick on every match, locked comp refuses drops, bunny spend empties all layers |
| `tests/belts.test.js` (new) | phase wrap both directions, visible window, take bars the cell, undo unbars, `appearAt`, v_eff ramp piecewise |
| `tests/stuck.test.js` (new) | `progressPossible` vs exhaustive BFS on 3000 random small states with belts (C <= 4, depth <= 3, belt <= 4 cells): 0 disagreements |
| `tests/win.test.js` (new) | orphan rule: after a spend leaving 2+1 copies the level is won; bunnies never block a win |
| `tests/game.test.js` | event order 2.2, undo restores score/chain but not clock/moves/phase, Serie banking, +30 s once |
| `tests/score.test.js` (new) | 5.1/5.2 worked examples |
| `tests/levels.test.js` | invariants for all 600 baked levels, hash pins, tail determinism (n = 301, 777, 1000 hash-pinned), remix preserves witness |
| `tests/witness.test.js` (new) | independent replay of all witnesses (3.4) |
| `tests/save.test.js` | v1 -> v2 migration, garbage input |
| `tests/purity.test.js` | add `belts.js`, `rules.js`, `levels-data.js` |
| `tests/browser/run.js` | belt tap on a moving cell via model phase, drag from belt, cancel returns to moved cell, bars, lock open, reveal screenshot, stuck sheet, timeout card, HUD rects disjoint at 375x667 and 390x844 |
| `tests/browser/soak.js` | bot plays Z L1-30 and E L1-30 at 4x speed: no console errors, DOM node count stable (+-5%), no leaked animations |
| `scripts/build-levels.js --verify` | regenerates nothing, re-solves 30 sampled levels per track within 60 s |

Every `src/**/*.js` stays <= 450 lines (test-enforced); authored target 400.

---

## 9. Test and tuning plan

### 9.1 Bots

| Bot | Model of | Policy | Timing |
|---|---|---|---|
| Oma-Bot | the owner's mother | softmax tau 120 over `scoreMove`, no lookahead; undo once after each stuck (max 3 per level); collects bunnies at once, spends on the fullest compartment when `F <= 1` | 3.5 s per rack move, belt take = wait until the cell is in the middle 60% + 0.8 s |
| Casual-Bot | build gate (3.6) | same, no undo | 2.8 s / 0.6 s |
| Profi-Bot | an expert | 2-ply lookahead, keeps 1 slot free | 1.4 s / 0.3 s |

### 9.2 What to measure, acceptance thresholds

| Metric | Threshold |
|---|---|
| Z: Oma-Bot clears with time left (no +30 s) | L1-20 >= 90%, L21-40 >= 75%, L41-60 >= 60% of Normal levels |
| Z: Oma-Bot clears at all (with +30 s) | >= 90% Normal, >= 70% Schwer, >= 55% Sehr schwer |
| E: Oma-Bot stuck events per level | Normal <= 0.5, Schwer <= 1.2, Sehr schwer <= 2.0 (she undoes, never fails) |
| E: level length (Oma-Bot) | Normal 4-10 min, Sehr schwer <= 18 min |
| Profi vs Oma score gap (Z) | Profi >= 1.8x Oma per level (skill shows) |
| Breather after Sehr schwer | Oma-Bot time-left fraction >= 45% |
| warnSpace hits per level | Oma-Bot <= 2 on Normal |
| Belt picks missed by the hit test in browser test with simulated 120 ms latency | 0 of 200 |

### 9.3 iPhone playtest checklist (owner, then his mother)

1. Pick a product from a moving shelf at L12, L30, L60 (Z): never a miss on a deliberate tap.
2. Tap-select a belt product, look away 5 s, tap a compartment: it moves.
3. Fill the rack to 1 free slot: amber warning visible and understood.
4. Layer reveal: does she understand the dark row before reading the coach mark? (watch, do not explain)
5. Locks: does she know when it opens (badge counts down on each triple)?
6. Bunny: collect, spend, see the compartment empty.
7. Orphan finish after a bunny spend: the level ends and feels "won".
8. Timeout: +30 s card readable; second timeout keeps progress.
9. Phone call / app switch during timed: auto-pause, belts frozen, resume exact.
10. 20 minutes of play: phone warm? (should not be; check battery drain < 6% per 20 min on iPhone 12)
11. Reduced motion on: belts still usable, no bursts.
12. Text readable without glasses at arm's length (17 px floor).
13. Undo across a take: product returns to its cell, bars lift.
14. Reload mid-level: same board, same belt cells barred.

Tuning knobs after the playtest, in this order: `sC` (time per rack item), `v` slope, combo window, F0, acceptance
windows. Nothing structural.

---

## 10. Open questions for the owner

1. **Side cells: one product or a small stack?** Your Lv.513 screenshots show a dark product behind most side products,
   and the Falcon wiki describes single cells with a counter that close when empty. Default here: one product per side
   cell, bars after the take (as you described). Should a side cell instead hold 2-3 products, with bars only after the last?
2. **Horizontal shelves:** default = one more take-only conveyor row above the rack (the centre never moves, which
   keeps drops easy). Or do the centre compartments themselves slide sideways in the original?
3. **Golden bunny:** default = tap to collect, then spend it to empty a whole compartment of your choice (all layers).
   Or should the bunny empty only its own compartment, immediately?
4. **Timed highscore as a "Serie":** progress is never lost; a timeout (after the free +30 s) or a restart only banks
   the current streak into the top 10. Is that the highscore you want, or a strict run from level 1?
5. **Relaxed shelves:** still until L40, then a very slow drift (switchable off). Or always still for your mother?
