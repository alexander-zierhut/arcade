# Supermarket Sorter: research brief

> Status note (2026-10-11): historical. The shipped rules are in `docs/DESIGN.md` (with its section 0.5 deltas) and the
> owner's decisions in `docs/OWNER-NOTES.md`; where this brief differs from them, they win.

Version 1, 2026-10-10. This is the design basis for the shelf-sorting remake. It replaces every value marked
"provisional until docs/RESEARCH.md settles it" in `src/config.js`. Code comments should cite rules by their
ids (`RESEARCH M6`, `RESEARCH S3`, ...).

Confidence labels: **[fact-high]** comes from code, measurement or several agreeing sources. **[fact-med]**
comes from one source or is inferred from a screenshot. **[decision]** is a design choice made here. The
reason is given in one line when researchers disagreed.

---

## 0. Decisions at a glance

1. **Evolve v0.1.0; do not rewrite.** Keep `SS`, the pure `src/game/` modules, the DOM board (one `<img>` per
   item), the tests and release tooling. Extend the board model with **back layers** and **locks**.
2. **Layers are in v1**, per-layer reveal (next layer moves forward only when the front row is empty), at most
   3 layers. Layer 2 is drawn dimmed; deeper layers show as pips. Without layers every board is solvable, so
   there would be no puzzle.
3. **Exact O(items) stuck rule:** `progressPossible = F>=1 && (maxVisible>=3 || (F>=3 && hidden>0))`.
4. **Same boards in both modes.** Relaxed = campaign that cannot be failed, unlimited undo. Timed = arcade run
   from L1 with a generous countdown, score banked into a top 10.
5. **Levels are baked offline** (`scripts/build-levels.js` -> `src/game/levels-data.js`, about 68 KB for 500),
   each proven solvable without boosters. No workers, no fetch, file:// keeps working. L500+ = solvability-preserving transforms.
6. **10-level saw-tooth on a rising base** (idx 0 breather, 4 Hard, 9 VeryHard). Knobs: layer depth and size,
   then locks, then compartment count. Concrete table for L1-40, then endless.
7. **Time limit** `clamp(ceil5((30 + items*sPerItem(L)) * hardMult), 120, 540)` s, `sPerItem` 7.0 to 5.0: 3:00 at
   L1, about 5:25 on the screenshot-like board, at most 9:00. Starts on first touch; amber 30 s, red 10 s; free +30 s once per level.
8. **Scoring.** Timed: `100 x min(4, 1+0.5(chain-1))` per match, 5 s combo window, +250 clear, +5 per second left,
   +250 Flawless. Relaxed: per-level efficiency `round(1000*min(1, par/moves))`, stars by moves vs par.
9. **Booster kit per level, no economy:** Undo unlimited (L1), Hammer 1 (L2), Shuffle 1 (L4), Freeze 1 (timed,
   15 s) or Hint 3 (relaxed) from L6; combo x5 earns +1 Hammer once per level. No ads, coins, lives, Wand, pre-level boosters.
10. **Art:** invented portrait products, 64-80 CSS px tall at 390 px width (today about 32), no CSS filters on
    moving items, transform/opacity animation only. Rename the real-brand collisions Weideglück and Goldähre.

### 0.1 Where researchers disagreed (one-line resolutions)

| Topic | Options on the table | Decision | Why |
|---|---|---|---|
| Rewrite vs evolve | new `src/core/` + Canvas (R4) vs existing v0.1.0 | evolve v0.1.0 | It works, is tested and already follows the cocktail-merge conventions |
| DOM vs Canvas | Canvas sprite caches (R4) vs DOM `<img>` (R5, code) | DOM | About 40-100 items move one at a time; canvas readback breaks file:// |
| Layers | 2-3 from L1 (R1) / depth 1 until L10 (R3) / none (code) | back layer from L2, depth 3 from L20 | The original shows a back layer at Lv.2; without layers there is no puzzle |
| Depth vs win rate | "depth 3 = 80%" (follow-up) vs R3's tables | R3's measured tables | The follow-up misread R3: depth 3 with backs of 1-3 is 11-13%, not 80% |
| Carousel / moving shelves | carousel for timed (R3) vs none (follow-up) | v2, data model ready | It is a second mechanic; the owner's Lv.513 screenshot shows it, so plan for it but ship later |
| Reveal rule | per layer vs per slot | per layer | Genre sources describe it; per-slot was never measured |
| Relaxed fail | none (R2) / Out of space (R1) / stuck sheet (R3) | stuck sheet, no failure record | Layered boards can dead-end, but relaxed play must never punish |
| Run model | arcade (R1) vs campaign (R2) | timed arcade, relaxed campaign | A running total in a mode that cannot be failed measures time played, not skill |
| Retry | reshuffle (R1) vs same layout (R2, R3) | relaxed: identical; timed: new per-run transform | Per-level bests stay like for like; timed runs cannot be memorised |
| Timer length (about 40 items) | 111 s (code) / 180-210 s (R1, R3) / 390-585 s (R2) | about 325 s | Falcon's Lv.2 shows 5:10-5:19 left; the simulation timed out casual players at 111 s |
| Timeout | +30 s once per level (R1) vs instant retry (R2) | +30 s once per level, then the run ends | Generous; still lets the clock matter, since it forfeits the time bonus |
| Warning | 5 / 10 / 15 s | amber 30 s, red and tick 10 s | 5 s is too late for 5-minute limits; 15 s of ticking irritates |
| Combo window, timed | 3 s (code) / 5 s (R1) / 25 s minus combo | 5 s | The simulation shows 3 s breaks expert chains and 8 s erases the gap between players |
| Combo, relaxed | time based (code) / consecutive matches (R2) / 3 moves (R1) | 3-move window | Consecutive matches did not separate skill in the simulation; no clock in relaxed |
| Multiplier cap | x4 (R1) vs x4.5 (code) | x4, reached at chain 7 | Experts sit at the cap and casual players at x1.5-2 |
| Clear bonus | 500+50L (R1) vs 250 | 250 | 500+50L pays for progress, not skill |
| Time bonus | 10/s vs 5/s | 5/s | 10/s was tuned against 111 s limits; new limits are about 2.5x longer |
| Undo | 1 per level (R1) / 3 in timed (R2) / unlimited (R3) / checkpointed (follow-up) | unlimited, restores score, never the clock or move counter | Recovers from layered dead ends with no score farming |
| Hammer points | flat 50 (R1) / 100 x mult / 0 | 0 points, +3 moves in relaxed | The cost is in the mode's own currency |
| Shuffle | keep vs drop | keep, front only, 1 per level | Layered boards can dead-end, so it is useful again |
| Gate location | runtime/Web Worker (R3) vs baked | baked `<script>` data | Workers and fetch fail from file://; depth-3 gate p90 is 210-456 ms on desktop |
| Hard levels' time | x0.85 (R1) vs x1.15 (follow-up) | x1.15 | The challenge should come from the puzzle, not a harsher clock |
| Hidden '?' items | L9+ (R1) vs rare (R2, R3) | not in v1 | Players reject cloaked items as luck |
| Render loop | rAF every frame (code) vs render on change (R2, R5) | rAF only while the clock, an animation or the combo bar runs | Heat and battery are review topics; relaxed play can idle |
| Service worker / PWA | yes (R2) vs forbidden (R4) | no service worker in v1 | Keeps the cocktail-merge rule and file:// behaviour |

---

## 1. The original game, decoded

### 1.1 Identity

- The game is **Falcon Games "Goods Puzzle: Sort Challenge"** (also "Goods Sort - Triple Master"; iOS
  id6482849843, Android `com.fc.goods.sort.matching.puzzle.triplemaster`; 4.78 stars from about 183k ratings).
  **[fact-high]** The evidence agrees on every point:
  - A commenter in the source Reddit thread names it.
  - The Lv.2 board matches the reverse-engineered GDD wiki's capture: 4x3, 05:10, hammer first, locks.
  - The owner's second screenshot (`further-deatures/WhatsApp Image 2026-10-10 at 19.24.55.jpeg`) shows the
    build string `v5.38`, the exact version the wiki decompiled, and the German label "Kombo x1".
- The screenshot comes from r/CozyGamers post 1kr3nl8 (2025-05-20): *"Anyone know a good sorting game like this
  but without a timer? On iOS"*. The top comment (89 upvotes) reads *"Someone make one please!!"*. The truncated
  file name means "without a timer". **[fact-high]**
- The task's path to the screenshot no longer exists. The copy is now
  `examples/original-goods-sort-screenshot.webp`.

### 1.2 Screenshot 1 (Lv.2): what it shows

| Element | Observation | Remake |
|---|---|---|
| Shelf | wooden, 4 rows x 3 compartments = 12, 3 fixed slot positions each | same at L2-L21, 5x3 from L22 |
| Front row | 31 of 36 front slots filled, 5 empty (r1c2, r2c3, r3c1, r3c3, r4c3) | F0 = 4-5 empty front slots at start |
| Back layer | darkened (about 55-65%), desaturated items peek out behind the front items (navy "Stick" boxes behind the peach bottles, behind the carrot bottle and the strawberry bottles) | layer 2 drawn at 50% brightness, layer 3 hidden |
| Product types | 13 visible: purple fruit, honey jar, peach, SNACK chips, nut milk, MILK bottle, BOOM popcorn, Juice can, Milk carton, strawberry milk, carrot, kiwi, Stick box | about 14 types at L3 |
| Item counts | 8 types show 3 copies, purple, kiwi and Stick show 2, nut milk and carrot show 1, so at least 7 items sit in the back layer | about 39-42 items over 2 layers, which matches R3's "depth 1-2, back 1-2" config (40 items) |
| HUD | box-mascot avatar, "lv.2" pill, stopwatch with **05:19** (circled in red by the owner), pause | level pill, optional countdown, pause, mute |
| Bottom bar | Hammer (3), locked **Lv.6**, star "1" over a green "Combox1" bar, locked **Lv.8**, locked **Lv.4** | Undo, Hammer, combo meter, Shuffle, Freeze/Hint |
| Banner ad | at the very bottom | removed |

Measurements on a 390x844 CSS phone (1080x2340 capture) **[fact-high]**: compartment about 126x90 CSS px;
bottle about 29x67, bag about 40x70; items fill about 80% of the compartment height and three fill 85-95% of
its width; the 4-row board fills about 44% of the screen height; every product is portrait (width 0.4-0.6 x height).

Sampled colours: back wall `#D5CBC1`, page `#F4E7DE`, planks `#A37955`-`#AA835E`, lit edge `#E8B488`,
HUD band `#E99B48`, combo bar green `#438C29`. Each item casts a soft shadow to the right.

The original pairs similar colours on purpose: honey jar and kiwi (lime), peach and carrot (orange), MILK
bottle and Milk carton (blue-white with a cow). Silhouette and icon still tell each pair apart. This is a
difficulty knob. **[fact-med]**

### 1.3 Screenshot 2 (Lv.513, the owner's "further features" folder)

What it shows **[fact-high, visual]**: an **irregular layout** (a 2-wide grid of 3-slot compartments, one
compartment above and below, and **two side columns of single-slot cells that scroll vertically like conveyors**,
Falcon's CellType Single + MoveType); **three locked compartments** with counters **3, 4, 4** and an "AD" skip
(every match anywhere lowers them, per the wiki); a **golden item** (bunny with sparkle); a star counter, a
win-streak icon, the "Kombo x1" bar under the timer (04:53 left); power-ups **Hammer, Magic Wand, Freeze (77),
Refresh (1)**; back layers behind several front items.

The slot order matches Lv.2's locked slots, so in this build **Lv.6 = Magic Wand, Lv.8 = Freeze and
Lv.4 = Refresh/Shuffle**. **[fact-med, inferred from slot order]**

Remake: v1 takes the **locks** (they are cheap, need no luck, and players accept them). Moving side
columns, single-slot stacks and golden items go to v2 (section 8). The level format reserves fields for them.

### 1.4 Genre rules and how sure we are

| # | Rule in the original genre | Confidence | Source |
|---|---|---|---|
| G1 | Only front-row items can be picked up | high | wiki, two Unity clones, store copy |
| G2 | An item can go into any empty front slot of any compartment; there is no adjacency rule | high | clones' move validators, guides |
| G3 | A drop on a full compartment or empty space springs back; there is no swap | high | KardelenNaiboglu clone |
| G4 | Slots are fixed positions; items do not compact | high | screenshot gaps |
| G5 | 3 identical items in a front row clear automatically | high | wiki `IsFullAndSameItemInRowTop` |
| G6 | The next layer moves forward only when the whole front row is empty, by a match or by moving items out | high | clones, Closet Sort listing |
| G7 | Only one layer behind the front is drawn (dimmed); deeper layers are invisible | high | clones, both screenshots |
| G8 | Combo is a time window: each match adds 1 and refills a draining bar; an empty bar resets it | medium | clones (3 s, or 25 s minus combo); the commercial length is unknown |
| G9 | Countdown timer per level, observed at 140-550 s; "Time's Up!" loses | high | wiki |
| G10 | "Out of space" or stuck loses | high | wiki CheckStuck |
| G11 | There is no point score; stars at a win = floor(seconds left / 10) | high | wiki |
| G12 | Hammer completes one match; Refresh reshuffles; Wand turns 9 items into 3 matches; Freeze stops the clock for 15 s | high | wiki |
| G13 | Lock counter starts at 4; any match lowers it by 1; a skip costs 1000 gold or an ad | high | wiki |
| G14 | Lives: 5 hearts, -1 per loss, +1 per 30 min | high | wiki (removed in the remake) |
| G15 | A difficulty saw-tooth with spikes (Super League: level%10==4 Hard, ==9 VeryHard) | medium | wiki |

---

## 2. Exact mechanics to implement

Board terms: **C** = number of compartments. Each compartment has 3 slots and a stack of layers, where
layer 1 is the **front**, layer 2 the **next** (drawn dimmed) and layer 3 the **deep** (hidden) layer. **F** = empty front slots in
unlocked compartments. **V(t)** = copies of type t in the fronts of unlocked compartments. **H** = items in
back layers of unlocked compartments.

### 2.1 Movement

- **M1** Only front items of unlocked compartments can be picked up.
- **M2** A move takes one front item to an empty front slot of a *different* unlocked compartment. Adjacency
  does not matter. The item lands in the slot under the finger if it is empty, otherwise in the nearest empty
  slot of that compartment.
- **M3** A drop on the item's own compartment, a full compartment, a locked compartment or outside the shelf
  springs back in 180 ms (`SPRING_MS`). It is not a move and does not touch the combo. Positions inside a
  compartment never matter to the rules, so a reposition only adds noise; `board.canMove` already refuses it.
- **M4** Input: drag and drop is the primary control. Tap to select, then tap a target, is the equal fallback.
  A selected item lifts and every legal target compartment is highlighted. The whole compartment is the drop
  zone. `TAP_SLOP_PX` = 8. Only the touched item can move (no grabbing a far item).
- **M5** The data changes only on a validated drop. A drag in progress never changes the model, so nothing
  needs rolling back.

### 2.2 Matching, reveal, locks

- **M6 Match.** When a front row holds 3 identical items it clears automatically (squeeze and pop, 300 ms,
  `MATCH_MS`). Only that compartment is locked while it resolves; the player can keep moving elsewhere.
- **M7 Reveal (per layer).** When a compartment's front holds 0 items, by a match or by moving items out, and it
  has back layers, layer 2 slides forward into the same slot positions in 180 ms. A layer with fewer than 3 items
  arrives with holes, and layer 3 becomes the new dimmed next layer. Reveal runs for the target compartment first,
  then the source.
- **M8 Cascade.** The generator forbids any layer made of 3 identical items, so a revealed row can never be a
  triple and cascades cannot happen. If one ever does (a bug or a future mechanic), it clears, counts as the next
  chain step and costs no move.
- **M9 Locks (from L13).** A locked compartment shows chains and a counter N (3 or 4). Every match anywhere,
  hammer triples included, lowers it by 1. At 0 the chains drop (250 ms) and the compartment works normally.
  It accepts no drops and gives up no items while locked. There is no skip, ad or price.
- **M10 Free-slot accounting.** A move leaves F unchanged; a match adds 3; a reveal subtracts the size of the
  layer that arrives; an unlock adds that compartment's empty front slots; a hammer adds the number of front
  items it removed. Back layers of 1-2 items loosen the board over time, layers of 2-3 keep it tight.

### 2.3 Stuck, win, lose

- **M11 progressPossible(b)** = `F >= 1 && (max_t V(t) >= 3 || (F >= 3 && H > 0))`. **[fact-high, proof]**
  - With one hole, front items of unlocked compartments can be arranged into any order, so a visible triple
    can always be gathered.
  - Emptying a front of k items needs `F - (3-k) >= k` free slots elsewhere, which means `F >= 3`.
  - Locked items count in neither V nor H. A lock opens only through matches, so it cannot rescue a position
    that has no match.

  R3 checked this test against exhaustive BFS on 1500 states (0 disagreements). It runs after every resolved move.
- **M12 Stuck** = items remain AND NOT progressPossible.
  - Relaxed: a sheet "Keine Züge mehr" (no moves left) with Undo, Hammer and Shuffle (if a charge is left)
    and Restart (always free, same board). Nothing is recorded as a loss.
  - Timed: a non-modal banner over the board with the same buttons plus "Lauf beenden" (end run). The clock
    keeps running.
- **M13 Win** = no items left in any front, back layer or locked compartment. It is checked after the last clear
  animation, never by polling.
- **M14 Timed timeout.**
  - The first time the clock hits 0 in a level, a "Zeit abgelaufen" (time's up) card offers a free "+30 s"
    (once per level) or "Lauf beenden". Taking +30 s sets that level's time bonus to 0 and removes Flawless.
  - The second time it hits 0, the run is over and the score is banked (S6).
- **M15 Relaxed has no fail state.** There are no lives, energy or move limit. Leaving a level costs nothing.

### 2.4 Timer (timed mode only)

- **M16** The countdown limit comes from the level data (section 3.6). It starts on the **first touch** of the
  level, so the reveal animation and reading time are free.
- **M17** Time lives in the pure game state and advances only through `tick(g, dtMs)` while the state is PLAY.
  The loop clamps dt to 100 ms. It pauses on the pause button, overlays, `visibilitychange` to hidden (in timed
  mode this **auto-opens the pause overlay**) and `pagehide`. `resetClock()` runs on resume and on `pageshow`.
- **M18** Warning: at 30 s or less the pill turns amber (silent). At 10 s or less it pulses red (scale 1 to 1.12,
  once per second) and ticks every second (`TIME_WARN_S` 10, new `TIME_CAUTION_S` 30).
- **M19** Relaxed mode shows no clock. It tracks elapsed time for the result card only, as information.

### 2.5 Combo

- **M20 Timed.** Each match sets chain to chain+1 and refills a 5 s draining bar (`COMBO_WINDOW_MS` 5000). An
  empty bar sets chain to 0. The bar pauses with the game; Freeze does not stop it.
- **M21 Relaxed.** Each match sets chain to chain+1 and `comboMovesLeft` to 3. Each valid move without a match
  lowers it by 1, and at 0 the chain resets. The HUD shows 3 pips, not a bar. Nothing decays while the
  player thinks.
- **M22** The HUD shows "Kombo xN" with N = chain, as in the original. The multiplier appears only in the
  points popup. The chain resets at level start and level clear.
- **M23** Reaching chain 5 grants **+1 Hammer**, once per level, in both modes, with the toast "Kombo x5: +1 Hammer".
  Reviewers complain that combo "does nothing"; this makes it matter.

### 2.6 Moves

- **M24** Each valid move (M2) adds 1 to `moves`. Undo never lowers it. A hammer adds 3 in relaxed mode. Shuffle,
  hint and freeze add nothing.

### 2.7 Boosters and undo (no economy)

- **B1 Kit.** The kit resets at every level start and restart. There is no earning across levels and no
  carry-over.

  | Slot (bottom bar, left to right) | Unlock | Charges per level | Modes |
  |---|---|---|---|
  | Undo | L1 | unlimited | both |
  | Hammer | L2 | 1 (+1 at chain 5, M23) | both |
  | combo meter + level stars (centre) | - | - | both |
  | Shuffle | L4 | 1 | both |
  | Freeze / Hint | L6 | Freeze 1 / Hint 3 | Freeze timed, Hint relaxed |

  A slot whose unlock level has not been reached shows a lock with "Lv.N", as in the original. Every
  shipped level is solvable with **no** booster and **no** undo (G-gate, section 3.4). This avoids the
  "ad-free version hits a wall" failure reported for Matching Master's YouTube Playable.
- **B2 Undo.**
  - Each valid move pushes a full snapshot: board including layers and locks, score, level score, chain,
    combo-window remaining, `comboMovesLeft`, hammer charges earned through M23.
  - Undo pops one snapshot and reverts the move and everything it caused (match, reveal, unlock, points).
  - It never rewinds the clock and never lowers `moves`.
  - Using Hammer or Shuffle clears the stack: boosters cannot be undone and Shuffle cannot be re-rolled.
  - The stack is capped at 200. Undo removes Flawless.
  - Undo across a reveal shows what was in layer 3. This is accepted: it costs moves in relaxed mode and time
    in timed mode.
- **B3 Hammer.**
  - Tap Hammer, then tap a front item of type T in an unlocked compartment. That item and 2 more copies of T are
    removed. The copies come from other front copies first (same compartment first, then lowest compartment index),
    then back layers (shallowest layer first, then lowest index), then locked compartments as the last resort.
  - A removed back item leaves a hole, and the other items keep their slots. A layer left with no items is
    deleted, so deeper layers move up one level.
  - Then M7 runs for every compartment whose front became empty.
  - The hammered triple scores 0, counts as a match for lock counters, neither raises nor breaks the chain,
    adds 3 moves in relaxed mode, clears the undo stack and removes Flawless.
- **B4 Shuffle.**
  - Shuffle permutes item types among the occupied front slots of unlocked compartments. The occupancy pattern,
    back layers and locks stay as they are.
  - It uses the seeded RNG and tries up to 20 permutations. It accepts the first one that (a) makes no front
    triple and (b) passes progressPossible, preferring one where the in-browser playout check
    finds a win within 100 ms.
  - If none passes, the board stays unchanged and the charge is refunded ("Mischen nicht möglich").
  - Shuffle is not a move, scores 0, clears undo and removes Flawless.
- **B5 Freeze** (timed, L6). Stops the level clock for **15 s**, Falcon's exact value. The clock pill gets an ice
  tint and a draining ring. It removes Flawless.
- **B6 Hint** (relaxed, L6). Highlights the item and the target compartment of the next move of a winning line
  found by playouts in 100 ms or less. If none is found it shows "Kein Weg gefunden: Rückgängig oder Neustart"
  and the charge is kept. It removes Flawless.
- **B7 Not in v1:** Magic Wand (9 items into 3 triples; it trivialises a level), pre-level boosters (Super Hammer,
  Bonus Timer, Star Doubler), lives, coins, shop, ad continues, lock skips.

### 2.8 UI strings (the UI is German, as v0.1.0 already is)

"Entspannt" / "Auf Zeit" (modes); "Rückgängig", "Hammer", "Mischen", "Einfrieren", "Tipp", "Neustart", "Weiter",
"Nochmal", "Lauf beenden"; "Zeit abgelaufen", "Keine Züge mehr", "Kombo xN", "Fehlerfrei!", "Neuer Rekord!".

---

## 3. Level model and generation

### 3.1 Formal model

```
Level = {
  id: int, gen: GEN_VERSION, tag: 'tutorial'|'breather'|'normal'|'hard'|'veryhard',
  rows: int, cols: 3,                       // C = rows*cols, rendered as a grid in v1
  comps: [ Comp ],                          // length C, row-major
  types: int,                               // T distinct type indices 0..T-1
  par: int, timeS: int,                     // baked (3.4, 3.6)
  // reserved for v2, ignored by v1: layout:'grid'|'free', cells[i].{x,y,kind:'normal'|'single', move:'idle'|'up'|'down', speed}
}
Comp = { layers: [ Layer ], lock: 0 | N }   // layers[0] = front (layer 1); at most 3 layers
Layer = [ t|null, t|null, t|null ]          // fixed slot positions; null = empty
```

Invariants: each type index occurs 3 times (6 times for some types when triples > T); no layer holds 3 identical
items; back layers hold 1-3 items, never 0; no front row starts as a triple; `F0 >= 1`; `progressPossible(start)`.

Runtime state adds `ptr` per compartment (index of the current front layer), lock counters, `moves`, chain and
combo fields, timer fields, kit charges and the undo stack. Keep layers as length-3 arrays so holes keep their
slot positions.

### 3.2 Baked data format (`src/game/levels-data.js`, loaded by `<script>` before `levels.js`)

```js
// generated by scripts/build-levels.js; do not edit
SS.LEVEL_DATA = { v: 1, gen: 1, levels: [
  // "<rows>,<locks>|<par>|<timeS>|<slots>"  slots: comp-major, layer-major, 9 chars per comp,
  // one base-36 char per slot = type index, '.' = empty, '-' = layer absent
  "3,0|15|180|<C*9 slot chars>", ...      // one comp: "01.2.3---" = front [0,1,_], next [2,_,3], no deep layer
]};
```

At C=15 with 3 layers that is at most 135 slot characters per level. 500 levels come to about 68 KB raw (about
41 KB gzip; S3 serves it uncompressed unless uploaded pre-gzipped). Parsing takes 0.5 ms. **[fact-high, measured]**
Store **type indices, not product ids**. Products map onto indices through a per-level seeded pick from the
catalogue (`skin-<n>`), so adding a product changes art only, never structure.

### 3.3 Generation algorithm (offline, Node, `scripts/build-levels.js`)

```
for n in 1..500:
  k = knobs(n)                                   // table 3.6; endless formula 3.7 beyond L40
  for attempt in 0..199:
    rng = mulberry32(hash32("gen", GEN_VERSION, n, attempt))
    lvl = randomFill(k, rng)
      // 1. pick layer sizes: front sizes so that sum(3 - front) == k.F0;
      //    n2 comps get layer 2 of size U(k.s2), n3 of those get layer 3 of size U(k.s3)
      // 2. fix total to a multiple of 3 by changing one back layer's size by 1
      // 3. deal: triples = total/3; types = min(k.T, triples); each type x3, extras round-robin x6
      // 4. shuffle items into all slots; reject any layer that is a triple (re-deal that layer)
      // 5. place k.locks on random non-breather comps (locked comps get a full front)
    s = init(lvl)
    if !progressPossible(s) or frontHasTriple(s) or visibleMax(s) < 3: continue
    w = solveBoosterFree(s)        // (a) DFS + canonical-hash memo, progress-bounded (P=4), 200k nodes
                                   // (b) else up to 400 softmax playouts (tau=120, cut on !progressPossible)
    if !w: continue
    m = metrics(s, rng)            // winRate over 20 playouts, deadRate, forcedEvictions, spread, frontPairs
    if !accept(m, window(n)): continue
    parRaw = min(w.len, best of 21 playouts)
    par = ceil(parRaw * (depth(lvl)==1 ? 1.10 : 1.25))
    emit(n, lvl, par, timeLimit(n, items(lvl)), attempt)
    break
  else: fail build with "level n: no accepted layout in 200 attempts" (then widen window by 10 points, log it)
```

Rules for the generator:
- Use only integer RNG (`Math.imul`, `>>>`). No `Math.log`, `exp`, `pow` or `sin` in any runtime level path,
  so a level is bit-identical on every engine. **[fact-med]**
- The solver may see hidden layers (it is omniscient). Fairness comes from the dimmed layer-2 preview plus
  unlimited undo and restart.
- Reverse-play generation (building backwards from solved) is used **only** for authored tutorial boards. It
  cannot pack dense boards: at depth 2 with T=20, only 3 of 40 builds succeeded. **[fact-high, R3]**

### 3.4 Solvability guarantee

1. Single-layer boards with F >= 1 can always be solved (M11 proof). L1 needs no search. **[fact-high]**
2. Layered boards **can** dead-end. Exhaustive BFS at C=4 proved 35%, 32% and 4% of random boards unsolvable
   at F0 = 1, 2 and 3. At C >= 5 with F0 = 3, 0 of 100 were unsolvable. **[fact-high, R3]** So every shipped
   level carries a booster-free witness found offline.
3. Tests (`tests/levels.test.js`): pin the sha256 of `levels-data.js`; check every invariant (3.1) for all 500
   levels; re-solve L1, 2, 5, 10, 13, 20, 25, 30, 40, 100, 250, 500 plus 20 seeded ones within 5 s; pin hashes of
   endless levels 501, 777, 1000. `build-levels.js` re-solves all 500 and fails on any miss.
4. Measured agent win rates (C=12; human-like softmax agent, no lookahead, no undo) **[fact-high, R3]**:

| Config | Items | Agent win | Par (witness) | Gate p50 / p90 (desktop Node) |
|---|---|---|---|---|
| depth 1 | 33-40 | 100% | about 23 | 0.3 ms |
| depth 2, back 1-2 | 49 | 98% | 41.5 | 0.7 / 1.3 ms |
| depth 2, back 1-3 | 54 | 92% | 51 | - |
| depth 2, back 2-3 | 61 | 80-84% | 59 | 0.8 / 2.3 ms |
| depth 2-3, back 1-2 | 57 | 78% | 60 | - |
| depth 2-3, back 1-3 | 65-66 | 43-53% | 78 | 1.4 / 17 ms |
| depth 3, back 1-2 | 67 | 35% | 84 | - |
| depth 3, back 1-3 | 77 | 11-13% | 105 | 26 / 210 ms |
| C=15, depth 3, back 1-3 | 96-98 | 9-10% | 125 | 51 / 456 ms |

Free slots barely matter at C=12: F0 from 3 to 8 moved the win rate only between 78% and 87%, mostly noise.
Starting front pairs help: 2-3 pairs give 87% against 78% with 0-1 pairs. Humans with lookahead and unlimited
undo will do far better than the agent; the agent is only a relative measure.

### 3.5 Difficulty knobs (ranked by effect, with how fair they feel)

1. **Back-layer depth and size**: the largest effect (100%, 98%, 80%, 50%, 11%). Fair because layer 2 is
   visible. Needs the gate.
2. **Locks**: they remove a compartment until N matches have happened. Easy to read, players accept them,
   checked by counting.
3. **Compartment count** (9, 12, 15): mainly adds length; 15 is the maximum for legibility on a phone (6 rows
   are dropped).
4. **Distinct types and confusable hue pairs**: perception load, from 1 pair at L10 to 2 pairs at L20+.
5. **F0**: about 3-6 makes little difference at C=12. 4-5 is the default; 6 only on the tutorial.
6. **Par and stars**: pure skill pressure, no generation risk.

Acceptance windows (agent win rate over 20 playouts) by block and tag:

| Block | Normal | Hard | VeryHard | Breather / tutorial |
|---|---|---|---|---|
| L1-10 | 90-100% | 75-95% | 60-90% | 95-100% |
| L11-20 | 80-100% | 60-85% | 45-80% | 90-100% |
| L21-30 | 65-95% | 45-75% | 25-60% | 85-100% |
| L31+ | 50-85% | 30-65% | 8-45% | 80-100% |

Further rejection rules: forcedEvictions (solver moves that do not place an item next to a twin) >= 2 +
floor(block/2); copy spread (mean pairwise compartment distance of the 3 copies) >= 1.5; at most 1 starting front
pair whose third copy is visible (2 on breathers); provable-dead-end rate of playouts <= 30%, except VeryHard.

### 3.6 The 40-level curve

Saw-tooth: `idx = (L-1) % 10`. idx 0 is a breather, idx 4 Hard (L5, 15, 25, 35) and idx 9 VeryHard (L10, 20,
30, 40). Hard and VeryHard levels show a red "Schwer" (hard) badge before the level and in the HUD.

Columns:
- **F0**: empty front slots at the start.
- **Layer 2** and **Layer 3**: number of compartments carrying that layer x layer-size range.
- **Items**: the total rounded to a multiple of 3.
- **Pairs**: same-hue confusable product pairs allowed.
- **Time**: timed-mode limit, `clamp(ceil5((30 + items*sPerItem(L)) * hardMult), 120, 540)` s, where
  `sPerItem` = 7.0 for L<=3, then `7 - 2*(L-3)/27`, and 5.0 from L30; `hardMult` = 1.15 on Hard and VeryHard.

| L | Tag | Grid (C) | F0 | Layer 2 | Layer 3 | Locks | Items | Triples | Types | Pairs | Time |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Tutorial | 3x3 (9) | 6 | - | - | - | 21 | 7 | 7 | 0 | 3:00 |
| 2 | Normal | 4x3 (12) | 5 | 4 × 1-2 | - | - | 36 | 12 | 12 | 0 | 4:45 |
| 3 | Normal | 4x3 (12) | 4 | 6 × 1-2 | - | - | 42 | 14 | 14 | 0 | 5:25 |
| 4 | Normal | 4x3 (12) | 4 | 6 × 1-2 | - | - | 42 | 14 | 14 | 0 | 5:25 |
| 5 | Hard | 4x3 (12) | 4 | 12 × 1-3 | - | - | 57 | 19 | 14 | 0 | 8:05 |
| 6 | Normal | 4x3 (12) | 4 | 8 × 1-2 | - | - | 45 | 15 | 14 | 0 | 5:35 |
| 7 | Normal | 4x3 (12) | 4 | 8 × 1-2 | - | - | 45 | 15 | 14 | 0 | 5:35 |
| 8 | Normal | 4x3 (12) | 4 | 10 × 1-2 | - | - | 48 | 16 | 14 | 0 | 5:50 |
| 9 | Normal | 4x3 (12) | 4 | 10 × 1-2 | - | - | 48 | 16 | 14 | 0 | 5:45 |
| 10 | VeryHard | 4x3 (12) | 4 | 12 × 2-3 | - | - | 63 | 21 | 14 | 1 | 8:25 |
| 11 | Breather | 4x3 (12) | 4 | 6 × 1-2 | - | - | 42 | 14 | 14 | 1 | 5:00 |
| 12 | Normal | 4x3 (12) | 4 | 12 × 1-2 | - | - | 51 | 17 | 14 | 1 | 5:55 |
| 13 | Normal | 4x3 (12) | 4 | 12 × 1-2 | - | 1 × N3 | 51 | 17 | 14 | 1 | 5:50 |
| 14 | Normal | 4x3 (12) | 4 | 12 × 1-2 | - | - | 51 | 17 | 14 | 1 | 5:50 |
| 15 | Hard | 4x3 (12) | 4 | 12 × 2-3 | - | - | 63 | 21 | 14 | 1 | 8:00 |
| 16 | Normal | 4x3 (12) | 4 | 12 × 1-3 | - | 1 × N3 | 57 | 19 | 14 | 1 | 6:15 |
| 17 | Normal | 4x3 (12) | 4 | 12 × 1-3 | - | - | 57 | 19 | 14 | 1 | 6:10 |
| 18 | Normal | 4x3 (12) | 4 | 12 × 1-3 | - | 1 × N3 | 57 | 19 | 14 | 1 | 6:10 |
| 19 | Normal | 4x3 (12) | 4 | 12 × 1-3 | - | - | 57 | 19 | 14 | 1 | 6:05 |
| 20 | VeryHard | 4x3 (12) | 4 | 12 × 1-2 | 6 × 1-2 | - | 60 | 20 | 14 | 2 | 7:15 |
| 21 | Breather | 4x3 (12) | 4 | 12 × 1-2 | - | - | 51 | 17 | 16 | 2 | 5:20 |
| 22 | Normal | 5x3 (15) | 5 | 15 × 1-2 | - | 1 × N4 | 63 | 21 | 16 | 2 | 6:25 |
| 23 | Normal | 5x3 (15) | 5 | 15 × 1-2 | - | 1 × N4 | 63 | 21 | 16 | 2 | 6:20 |
| 24 | Normal | 5x3 (15) | 5 | 15 × 1-2 | - | 1 × N4 | 63 | 21 | 16 | 2 | 6:15 |
| 25 | Hard | 5x3 (15) | 5 | 15 × 1-3 | 5 × 1-2 | - | 78 | 26 | 16 | 2 | 8:40 |
| 26 | Normal | 5x3 (15) | 5 | 15 × 1-3 | - | 1 × N4 | 69 | 23 | 16 | 2 | 6:40 |
| 27 | Normal | 5x3 (15) | 5 | 15 × 1-3 | - | 1 × N4 | 69 | 23 | 16 | 2 | 6:35 |
| 28 | Normal | 5x3 (15) | 5 | 15 × 1-3 | - | 1 × N4 | 69 | 23 | 16 | 2 | 6:30 |
| 29 | Normal | 5x3 (15) | 5 | 15 × 1-3 | - | 1 × N4 | 69 | 23 | 16 | 2 | 6:25 |
| 30 | VeryHard | 5x3 (15) | 5 | 15 × 2-3 | 8 × 1-2 | - | 90 | 30 | 16 | 2 | 9:00 |
| 31 | Breather | 5x3 (15) | 5 | 15 × 1-2 | - | - | 63 | 21 | 18 | 2 | 5:45 |
| 32 | Normal | 5x3 (15) | 5 | 15 × 1-3 | 5 × 1-2 | 2 × N4 | 78 | 26 | 18 | 2 | 7:00 |
| 33 | Normal | 5x3 (15) | 5 | 15 × 1-3 | 5 × 1-2 | 2 × N4 | 78 | 26 | 18 | 2 | 7:00 |
| 34 | Normal | 5x3 (15) | 5 | 15 × 1-3 | 5 × 1-2 | 2 × N4 | 78 | 26 | 18 | 2 | 7:00 |
| 35 | Hard | 5x3 (15) | 5 | 15 × 1-3 | 8 × 1-3 | - | 87 | 29 | 18 | 2 | 8:55 |
| 36 | Normal | 5x3 (15) | 5 | 15 × 1-3 | 7 × 1-2 | 2 × N4 | 81 | 27 | 18 | 2 | 7:15 |
| 37 | Normal | 5x3 (15) | 5 | 15 × 1-3 | 7 × 1-2 | 2 × N4 | 81 | 27 | 18 | 2 | 7:15 |
| 38 | Normal | 5x3 (15) | 5 | 15 × 1-3 | 7 × 1-2 | 2 × N4 | 81 | 27 | 18 | 2 | 7:15 |
| 39 | Normal | 5x3 (15) | 5 | 15 × 1-3 | 7 × 1-2 | 2 × N4 | 81 | 27 | 18 | 2 | 7:15 |
| 40 | VeryHard | 5x3 (15) | 5 | 15 × 2-3 | 10 × 1-2 | - | 93 | 31 | 18 | 2 | 9:00 |

Notes:
- New-mechanic levels get a one-time toast: L2 (back layer: "Dahinter wartet mehr" = more is waiting behind),
  L13 (lock), L20 (third layer pips).
  The Undo, Hammer, Shuffle and Freeze/Hint unlocks (L1, L2, L4, L6) get one each too.
- Locks never appear on breathers, Hard or VeryHard levels, so difficulty does not stack.
- Every time value is **provisional**. The build script runs a simulated casual player (3 s per move along a
  win playout, about 1.15 moves per item) and must see at least 25% time left on at least 90% of seeds,
  otherwise it raises `timeS` by 15 s steps and logs a warning.
  After the owner has played about 10 levels on an iPhone, retune only `sPerItem`. The target is 50-60% time
  left early and 35-45% from L30 for a casual pace.

### 3.7 Endless (L41+)

- `block = floor((L-1)/10)`; the saw-tooth idx rule continues.
- Normal: C=15, F0 = 5 (4 from L61), layer 2 on all 15 (size 1-3), layer 3 on `min(15, 7 + (block-4))`
  compartments (size 1-2, 1-3 from L61), 2 locks with N4.
- Breather = the previous block's Normal. Hard = layer 3 size 1-3 on +3 compartments, no locks.
  VeryHard = layer 2 size 2-3, no locks.
- Types = min(20, triples), pairs = 2. Time uses sPerItem 5.0 with the 540 s cap. The window is the L31+ row.
- L41-500 are baked. **L > 500** use `base = 41 + ((L - 501) mod 460)` and apply a seeded integer transform
  (`endless-<L>`) that cannot change solvability or par: type relabel, compartment permutation, slot order
  inside each layer. 460 is a multiple of 10, so the saw-tooth position is preserved.

### 3.8 Level identity, retry, modes

- Board structure = f(level number) only. The current `states.js` seed `'run-'+seed+'-'+mode+'-'+levelNo` must
  go, because it makes level N different on every run and in each mode.
- **Relaxed**: replay and restart show the **identical** board, so per-level bests compare like with like.
- **Timed**: each run draws a run seed and applies the same solvability-preserving transform as 3.7 to every
  level: same difficulty, par and time limit, a different look, and layouts cannot be memorised. A run snapshot
  stores the run seed.
- Both modes use the same baked levels; mode sets only the clock, scoring and kit slot 4.

---

## 4. Scoring and highscore

### 4.1 Timed mode (arcade run)

- **S1 Match points** = `100 x mult`, `mult = min(4, 1 + 0.5 x (chain - 1))`. chain is 1 for the first match in
  a window and the cap x4 is reached at chain 7. Config: `MATCH_POINTS 100, COMBO_STEP 0.5, COMBO_MAX 7,
  COMBO_WINDOW_MS 5000`. A hammer triple scores 0 (B3).
- **S2 Level clear** = +250 (`LEVEL_CLEAR_POINTS`).
- **S3 Time bonus** = `5 x floor(secondsLeft)` on clear (`TIME_BONUS_PER_S` 5). It is 0 if +30 s was taken in
  that level.
- **S4 Flawless** = +250 if the level was cleared with no undo, hammer, shuffle, freeze or extension.
- **S5 Run** starts at L1, and each level adds `levelScore = S1 sum + S2 + S3 + S4`. Match points earned in the
  failing level count too. The run ends on the second timeout in a level, on "Lauf beenden", or on "Neuer Lauf"
  from the title screen (armed 2 s confirm when the run score is above 0). The run snapshot (`RUN_KEY`) is saved
  after every move and on hide, so "Fortsetzen" (continue) restores it after a reload or iOS tab eviction.
- **S6 Timed highscore** = the top 10 runs `{score, level, date}`, as in the existing `save.recordRun`. best =
  `top[0].score`. Also kept: `bestLevel` (highest level reached), `bestChain`, `games`.
- **S7 Timed stars per level**: `f = secondsLeft / timeS` on clear. f >= 0.50 gives 3 stars, f >= 0.25 gives 2,
  otherwise 1. A level where +30 s was taken gets 1 star. Stars show on the clear card; the best per level is kept
  for display.

Worked example, L3 (42 items, 14 matches, 325 s):
- Expert: chain climbs 1-6 (multiplier sum 13.5), then 8 matches at x4 (32): 45.5, worth 4550 points.
  Add +250 clear, about 180 s left (+900) and Flawless (+250): **5950**, 3 stars.
- Casual: chains of 1-2, worth about 1800 points. Add +250, 100 s left (+500): **2550**, 2 stars.

The time bonus is about 15-20% of a level score, so speed counts without drowning the combo.

### 4.2 Relaxed mode (campaign)

- **S8 Level score** = `round(1000 x min(1, par / moves))`. It does not depend on board size, so L1 and L40 weigh
  the same.
- **S9 Stars**: `moves <= par` gives 3, `moves <= ceil(1.5 x par)` gives 2, otherwise 1 (the existing `stars()`
  rule).
- **S10 Flawless** = cleared with no undo, hammer, shuffle or hint. It earns a badge, no points (S8 already rewards
  efficiency).
- **S11 Records**: only the best attempt per level counts:
  `levels[n] = {best, stars, moves, flawless}`. The headline is **Σ best** (at most 1000 per level), **★ total**
  (at most 3 per level) and **reached** (highest unlocked level). These rise only by clearing new levels or beating
  an earlier attempt, never by grinding.
- Combo in relaxed mode is feedback (sound, popup, M23 hammer) and is not scored. No clock touches the relaxed score.
- **Par** = `ceil(parRaw x 1.10)` for single-layer levels and `ceil(parRaw x 1.25)` for layered ones, where parRaw
  = min(solver witness length, best of 21 playouts). It is baked per level, and the HUD shows "Züge 23 / 31"
  (moves / par). Agent par overstates the optimum by 12-40%, hence the 1.25 slack.

### 4.3 Persistence (save schema v2, `src/game/save.js`)

```js
{ v: 2,
  settings: { mode: 'relaxed'|'timed', muted, music, reducedMotion, lowGfx, bigItems, seenTips: {...} },
  records: {
    timed:   { best, bestLevel, bestChain, games, top: [{score, level, date}] /* max 10 */ },
    relaxed: { reached, games, totalBest, totalStars,
               levels: { "<n>": { best, stars, moves, flawless } } }
  } }
```

- `normalizeSave` keeps v1 timed records and maps old relaxed `top` entries to `reached = max(level)`.
- `mergeSave` takes the max for records, the max per level, and `next` for settings.
- About 30 bytes per level, so 500 levels take about 15 KB.
- The mode is asked once on the title screen and remembered. It can be changed only there, never during a run
  or a level.

### 4.4 Result cards

- **Timed clear**: matches x100 | combo extra | best chain | clear | time bonus | Flawless | level total | run total | stars | "Weiter".
- **Run over**: final score, level reached, top-10 rank or "Neuer Rekord!", "Neuer Lauf" / "Titel".
- **Relaxed clear**: moves vs par, stars, efficiency (new best or previous best), Flawless badge, "Weiter" / "Nochmal".
- **Title**: timed best run + best level; relaxed reached level, ★ total, Σ best.

---

## 5. Improvements over the original (prioritised)

**P0, must have**
1. **Timer optional, chosen once, never sprung mid-game.** That is the Reddit poster's ask; Item Sort's surprise timer at L12-27 is a reported betrayal.
2. **Generous timed mode.** About 8.6 s per item early, clock starts on first touch, free +30 s once per level. The timer appears in 17.6% of the screenshot game's reviews.
3. **Every level solvable without boosters, no false "no moves".** Exact stuck test (M11). Reviews with 247/170/116 votes cite unwinnable starts and wrong stuck messages.
4. **No ads, coins, lives, energy, shop, popups or notification dots.** Ads are mentioned in 56% of 3,990 reviews.
5. **Unlimited undo and free restart.** Almost absent from the genre (0.1% of reviews mention undo); cheap to add.
6. **Big, distinct items** (64-80 CSS px; silhouette + colour + icon, never colour alone). Look-alike and tiny items are reported.
7. **Cool and battery-friendly**: no idle rAF, transform-only animation, no filters on moving items. Heat/lag appear in 13% of reviews.
8. **Interruption-safe**: auto-pause on hide, run snapshot on every move; a phone call costs nothing.

**P1, should have**
9. **A combo that matters** (timed points, hammer at x5, visible bar/pips). Reviewers say combo and stars "do nothing".
10. **Transparent score breakdown and personal bests** on every result card, instead of meaningless star coins.
11. **Remaining-items counter** in the HUD ("18 / 51"), explicitly requested.
12. **Saw-tooth difficulty with breathers and a "Schwer" badge.** "A hard level followed by an easier one" is praised.
13. **Quiet synthesized SFX, combo-pitched chime, mute.** Players listen to audiobooks while playing.
14. **Accessibility**: reduce motion (fades, no flashing), larger items, high contrast. Older players and flashing-induced nausea are reported.

**P2, later**
15. **Moving side columns and single-slot stacks** (owner's Lv.513 screenshot; "stages with moving shelves are awesome").
16. **Sticker book of discovered products, shelf themes** (39-upvote comment: "doing the levels for no point").
17. **Daily seed** with a daily best. 18. **Golden items**. 19. **Offline PWA cache**, only if a service worker on HTTPS is accepted.

---

## 6. Visual and asset strategy

### 6.1 Art rules (extends `docs/ART-SPEC.md`)

- **Style**: flat 2D, a toon translation of the original's soft 3D. A 3-unit outline `#2A1B12` on a 100-unit
  viewBox, one 35%-white highlight on the left third, one 12%-black shade on the right 15-20%, flat saturated
  fills, and **one big icon on a light label**, plus optionally one short invented word. This matches the
  OpenMoji small-icon system (2 px stroke on 72 px, which is about 2.8%).
- **Portrait only** in the playable core: art width 34-60 units, height 78-92 units. The squat classes (loose 42,
  tub 14, short jar 17; 73 of the 180 existing SVGs) are left out of the core set or redrawn taller, because they
  read at about 60% of a bottle's size.
- **Dark bodies** use `#3D3340` or lighter plus a lighter inner rim, so the outline still separates.
- **Words**: SVG used as `<img>` cannot load web fonts, so convert a chunky label word to paths, or use plain
  system bold.
- **Forbidden in item SVGs**: `filter`, `mask`, `pattern`, group opacity, external references. These are slow or
  can crash iOS (WebKit 191197).
- **No real brands or trade dress.** Rename **"Weideglück"** (a real Milchwerke Schwaben dairy brand; 5 manifests)
  and **"Goldähre"** (one letter from ALDI's GOLDÄHREN; 4 manifests). Drop "Captain Crunchy" from the ART-SPEC
  examples (close to Cap'n Crunch). Forbidden lookalikes: white cup with red band (Nissin), red box with chocolate
  sticks (Pocky, Mikado), yellow bottle with a sun or a baby (Sunlight, Fairy), orange-leaf soda logo (Fanta),
  gold bear (Haribo), the name "Pop Rocks". Web-search every brand word before shipping.

### 6.2 Size and layout targets (390x844 CSS reference)

- Item height 64-80 CSS px; the original measures 67. Each item is a square tile about 2.0x the slot pitch,
  centred on its slot with its bottom on the plank. Wide art may overlap its neighbours slightly.
- The board uses 50-60% of the viewport height; today it is about 29%. A compartment is about 118-126 CSS px
  wide, and every tap target is at least 44 px.
- 5 rows (L22+) must still fit at 360x640 with items at least 52 px. The layout test checks 360x640, 375x667,
  390x844, 430x932 and 1280x800.
- **Back layer (layer 2)**: drawn behind the front, raised about 6%, scaled to 0.90, with **one** darkening div per
  compartment between the layers (`rgba(40,25,15,0.5)`), not a filter per item. **Layer 3 and deeper**: not drawn;
  1-2 small pips on the compartment's lower edge.
- **Shelf look**: back wall about `#D5CBC1`, pine planks `#A37955`-`#AA835E` with a light edge `#E8B488`, an
  orange HUD band about `#E99B48`, a cream page `#F4E7DE`. A static contact-shadow ellipse per slot
  (radial-gradient, drawn once).
- **Lock**: two crossed chain SVGs plus a round counter badge. Chains fall and fade in 250 ms at unlock.

### 6.3 Invented product catalogue (v1 core set, 20 products in 13 hue groups)

Sizes are art bounding boxes in 100-unit tile units. Products that share a hue group always differ in silhouette
and icon. Early levels use at most one product per hue group; levels 10+ add the confusable pairs from table 3.6.
The UI is German, so products can carry German display names. Map the existing German SVGs onto these slots
where they are close (for example dairy-berry-bell.svg, dairy-cloudy-moo.svg, and the existing ketchup, popcorn
and dish-soap items).

| # | Name (invented) | Product | Silhouette | w x h | Body colour | Hue group | Icon / word | Avoid |
|---|---|---|---|---|---|---|---|---|
| 1 | Cloudmoo Farm | milk | gable-top carton, blue wavy splash | 50x88 | white + `#4FA3E8` | WHITE | cow face, MILK | - |
| 2 | Berry Bell | strawberry milk | round-shoulder bottle, red cap | 40x86 | `#F26B9E` | PINK | strawberry | - |
| 3 | Cocoa Cubby | choco drink | brick carton with bent straw | 46x84 | `#8C5A2B` | BROWN | chocolate square | - |
| 4 | Puffy Peak | whipped cream | aerosol can, white nozzle | 38x90 | `#4FA3E8` | SKY | cream cloud | - |
| 5 | Sunpeach Grove | peach nectar | square-shoulder bottle, wide cap | 42x88 | `#F28C28` | ORANGE | peach + leaf | - |
| 6 | Kiwi Kapow | kiwi soda | slim long-neck bottle, green crown cap | 34x92 | `#9BCB3C` | LIME | kiwi slice | - |
| 7 | Zappy Grape | grape fizz | tall slim can, silver lid | 38x80 | `#8E5BD9` | PURPLE | grapes + bolt | energy-can blue/silver |
| 8 | Matcha Moji | boba tea | tapered clear cup, dome lid, fat straw | 44x92 | `#3FA34D`/`#9BD77A` | GREEN | leaf sticker, pearls | - |
| 9 | Crinkle Comet | chips | crimped pillow bag | 60x84 | `#E8453C` | RED | wavy chip, CHIPS | yellow sun banner, moustache tube |
| 10 | Kernel Kaboom | popcorn | tapered striped box, heap on top | 52x86 | `#2F6BD6` + white | BLUE | popcorn heap | - |
| 11 | Nibble Twigs | choco sticks | slim flip-top box, 5 stick tips | 40x90 | `#F7C948` | YELLOW | dipped stick | red box with sticks |
| 12 | Sour Squiggles | gummy worms | stand-up zip pouch, window | 52x84 | `#2BB3A3` | TEAL | one striped worm | gold bear |
| 13 | Bumble Hum | honey | tall hexagonal jar, black lid | 50x78 | `#F2A62B` | ORANGE | bee on black hex label | - |
| 14 | Tomato Tango | ketchup | upside-down squeeze bottle | 40x86 | `#E8453C` | RED | tomato on round label | keystone label, "57" |
| 15 | Sleepy Mole | coffee | stand-up bag, fold top, valve | 50x88 | `#3D3340` | CHARCOAL | bean, BEANS | - |
| 16 | Slurpy Swirl | cup noodles | tapered cup, peeled lid, chopsticks | 50x84 | cream + teal band | WHITE | noodle swirl | white cup with red band |
| 17 | Glintly Glass | glass cleaner | trigger spray bottle | 46x92 | `#4FA3E8` + yellow trigger | SKY | sparkle star | - |
| 18 | Bubblo Hands | hand soap | pump dispenser | 42x90 | `#8E5BD9` | PURPLE | bubble cluster | - |
| 19 | Leafy Loop | paper towels | upright wrapped roll, core hole | 48x84 | white + `#3FA34D` band | GREEN | leaf band | - |
| 20 | Lemon Zing | dish soap | squeeze bottle, sport cap | 38x90 | `#F7C948` | YELLOW | lemon half | sun logo, baby |

Same-hue pairs: 1/16, 4/17, 5/13, 7/18, 8/19, 9/14, 11/20. Each pair differs as carton vs cup, aerosol vs
trigger, bottle vs hex jar, can vs pump, cup vs roll, bag vs squeeze bottle and box vs sport-cap bottle.

### 6.4 DOM vs Canvas: DOM board, one optional confetti canvas

Keep the DOM board with one `<img>` per item (SVG file as `src`). Reasons: about 40-100 items moving one at a
time cost nothing in the DOM (canvas wins only with hundreds of moving objects); native hit-testing, CSS
transitions and keyframes, easy reduced motion and **no render loop while idle**; rasterising SVG into canvas needs
readback, which throws on file:// in Chrome (cocktail-merge forbids pixel readback), and WebKit has had
SVG-on-canvas bugs.

Rules:
- Run `img.decode()` on the level's sprites before revealing the board.
- Keep item sizes constant during play so WebKit's raster cache holds.
- `will-change: transform` only on the item that is being dragged or animated; remove it on drop. Every
  composited layer costs memory: a 76x76 tile at DPR 3 is about 208 KB, so 40 items take about 8 MB.
- Drag: `touch-action: none`, `draggable=false`, `-webkit-user-drag: none`. Pointer capture on the board root can
  lose moves on iOS (WebKit 220196), so add a window-level `pointermove`/`pointerup` fallback and test on a real
  iPhone.
- Canvas is used only for an optional full-screen confetti overlay on a level clear.

### 6.5 Juice list (cheap = CSS transform/opacity only; expensive = per-frame JS or many nodes)

| Effect | Spec | Cost |
|---|---|---|
| Pick up | lift -10% of item height, scale 1.10, tilt toward drag direction (clamped ±6°), 90 ms ease-out | cheap |
| Drag shadow | one radial-gradient ellipse div following the item, grows and fades with lift (replaces `filter: drop-shadow`) | cheap |
| Drop | squash scale(1.08, 0.90), then (0.97, 1.04), then 1, over 200 ms, origin bottom centre | cheap |
| Invalid drop | horizontal shake ±6 px, 3 cycles in 240 ms, red compartment flash, slide home in 180 ms | cheap |
| Legal-target highlight | soft inner glow on compartments while dragging or selected | cheap |
| Match | 3 items hop -12 px at scale 1.15 with 30 ms stagger, 60-80 ms hold, squeeze to the middle slot in 120 ms, pop to scale 1.3 and opacity 0 in 150 ms | cheap |
| Match sparkle | 8-12 DOM particles plus one ring, at most 24 at once | medium |
| Points floater | "+150" rises and fades over 600 ms | cheap |
| Compartment wobble | translateY 2 px, rotate 0.6°, 200 ms | cheap |
| Reveal | layer 2 slides forward and un-dims in 180 ms; the next layer fades in behind | cheap |
| Combo popup | "Kombo xN" pops at board centre with ease-back, about 8% larger per step; bar drains with `transform: scaleX` (never `width`) | cheap |
| Unlock | chains drop and fade in 250 ms, counter badge pops | cheap |
| Timer warning | amber at 30 s; red pulse scale 1 to 1.12 once per second plus tick at 10 s | cheap |
| Level clear | confetti, 100-150 pieces for 2.5 s on one canvas, then stars fly in with 150 ms stagger | expensive (only at clear; skipped in reduced motion) |
| Screen shake | not used; it fights readability | - |
| Haptics | none: `navigator.vibrate` does not exist on iOS Safari; guard any call | - |
| Sound | synthesized: pick, drop, invalid, match chime rising in pitch with chain, unlock clank, reveal swish, clear fanfare, tick | cheap |

Implementation rules:
- The slot position lives in `transform: translate3d()` (set by JS). Juice uses the individual `translate`,
  `scale` and `rotate` properties in keyframes (Safari 14.1+), so they compose without overwriting each other.
- Replace the `margin-top` keyframes `item-bob` and `item-land` in `board.css`: they cause layout and paint.
- Remove `filter: drop-shadow` from `.item.drag`.
- With `prefers-reduced-motion` or the setting on, all effects become fades.

---

## 7. Engineering conventions (carried over from cocktail-merge) and file layout

### 7.1 Conventions (v0.1.0 already follows most of them; keep them)

1. **No build step.** `index.html` loads classic `<script>` files in a fixed order: config, game (pure), art,
   audio, ui, app, main, then the inline boot guard. There are no ES modules and no bundler.
2. **One namespace `SS`.** Pure files use a UMD-style wrapper with purity markers. Browser files extend `SS`
   inside an IIFE and resolve modules that load later only at call time (`SS.app.dispatch(...)`).
   ```js
   (function (root, factory) { 'use strict';
     var isNode = typeof module === 'object' && module && module.exports;
     var api = factory(isNode ? { config: require('../config.js') } : { config: root.SS.config });
     if (isNode) module.exports = api; else { root.SS = root.SS || {}; root.SS.board = api; }
   })(typeof globalThis !== 'undefined' ? globalThis : this, function (deps) { 'use strict';
     /* @pure-begin */ ... /* @pure-end */
     return { ... };
   });
   ```
3. **Purity test.** `tests/purity.test.js` forbids `window|document|navigator|localStorage|sessionStorage|
   performance|requestAnimationFrame|setTimeout|setInterval|Date|AudioContext|Math.random` between the markers
   in `config.js` and `src/game/*.js`. Time enters as a `dtMs` argument and randomness as a seeded RNG.
4. **Feature floor: Safari / iOS 15, ES2018.** No `?.`, `??`, `||=`, optional catch binding, numeric
   separators, class fields, `#private`, `structuredClone`, `Array.prototype.at`, `Object.hasOwn`, `roundRect`,
   `ctx.filter`, `:has()`, CSS nesting, CSS `inset` or flex `gap`. A test scans the syntax.
5. **File size.** Author under 400 lines; a test caps every `src/**/*.js` and `*.css` file at 450 lines.
   Every file opens with a header comment naming its path, purpose, namespace and whether it is pure or
   browser-only.
6. **Viewport.** Measure with `visualViewport`, never `100vh`:
   ```js
   var vv = root.visualViewport, w, h;
   if (vv && !(vv.scale > 1.01) && vv.width > 0 && vv.height > 0) { w = vv.width; h = vv.height; }
   else { w = root.innerWidth || doc.documentElement.clientWidth; h = root.innerHeight || doc.documentElement.clientHeight; }
   ```
   Re-measure on `visualViewport.resize`, `resize`, `orientationchange` and `pageshow`, debounced 150 ms, plus
   one late relayout 500 ms after `orientationchange`. `html, body` are `position: fixed` with longhand offsets
   and `overflow: hidden`.
7. **Safe areas through a probe div** with `padding-*: env(safe-area-inset-*, 0px)`, read with
   `parseFloat(getComputedStyle(probe).paddingTop)`. The meta viewport includes `viewport-fit=cover,
   user-scalable=no`.
8. **Page guards.** `preventDefault` on `gesturestart/change/end`; on `touchmove` with more than one touch or
   no scrollable ancestor; on `dblclick` and `contextmenu`. Play surface `touch-action: none`, buttons
   `touch-action: manipulation`. `user-select: none`, `-webkit-touch-callout: none`,
   `-webkit-tap-highlight-color: transparent`, `overscroll-behavior: none`.
9. **Input.** Pointer Events with a touch and mouse fallback (`if (root.PointerEvent) ... else ...`). Every
   listener is wrapped in `safe(name, fn)`. A 250 ms input guard after any overlay closes.
10. **Audio unlock** inside the synchronous gesture handler: create or resume the `AudioContext`, then play a
    1-sample silent buffer on `touchend`/`pointerup`/`click`. Re-arm on `visibilitychange` to visible and on
    `pageshow` with `persisted`:
    ```js
    var b = ac.createBuffer(1, 1, ac.sampleRate), s = ac.createBufferSource();
    s.buffer = b; s.connect(ac.destination); s.start(0);
    ```
    All sound is synthesized (no audio files). Master gain, then compressor, then destination. Voice limit 12
    (7 on coarse pointers). Mute uses `setTargetAtTime(0, t, 0.02)`.
11. **Lifecycle.** On `visibilitychange` to hidden and on `pagehide`: save the run, and in timed PLAY go to
    PAUSE. On visible and on `pageshow`: `resetClock()`, then relayout (immediately if bfcache restored it).
    iOS may discard a background tab without further events, so everything is saved on hide.
12. **Storage.** One key `supermarketSorter.v1` (data `v: 2` inside) plus `RUN_KEY`. Every access is in
    try/catch, with a sticky in-memory fallback after the first failure. The pure `normalizeSave` and `mergeSave`
    take garbage and return defaults. Saves are per origin (file://, localhost and S3 differ).
13. **State machine** in `src/app/states.js`. `setState(name)` is the single entry point. All mutable app state
    lives in `SS.app.ctx`, and every cross-module call goes through `guard(name, fn)` so one broken consumer
    never stops the game.
14. **Overlays** are static `<section id="ov-*" hidden inert>` blocks in `index.html`. Buttons carry `data-act`;
    destructive ones carry `data-arm="Nochmal tippen zum ..."` ("tap again to ...") for a 2 s double-tap confirm.
    The markup between `<!-- ui-shell-begin -->` and `<!-- ui-shell-end -->` is reused by the UI screenshot harness.
15. **Boot guard.** An inline script checks one sentinel per file. On failure it shows a readable card listing the
    missing paths; on success it calls `SS.main.boot()`.
16. **Render loop.** rAF runs only while timed PLAY, an animation or the combo bar is active; relaxed idle runs
    no frames. DPR cap 2, adaptive steps [2, 1.25, 1] after 2 slow 2-second windows.
17. **Tests.** `npm test` = `node tests/run.js` (zero-dependency runner, `global.test`, Node `assert`).
    `npm run test:browser` = `playwright-core` with **system Chrome** (`CHROME_PATH`, `channel: 'chrome'`, fallback
    paths; never downloads a browser) over file:// at 390x844 DPR 2: boot without errors, one real drag, solve via
    `window.SS`, pause, reload + Continue (same board hash), disjoint HUD rects, text >= 13 px, screenshots to `docs/preview/`.
18. **Release.** `scripts/release.sh`: copy `index.html`, `src/`, `assets/`, favicon to `dist/`, verify every
    `src=`/`href=` path, write `VERSION.txt`, zip to `release/supermarket-sorter-v<version>.zip`.
19. **Deploy (DEPLOY.md).** `aws s3 cp index.html ... --cache-control no-cache --content-type "text/html; charset=utf-8"`,
    `aws s3 sync src ... --delete --cache-control no-cache` (same for assets); CloudFront optional; relative paths only.
20. **Forbidden.** fetch, XHR, Web Workers, service workers, ES modules, web fonts, remote URLs, analytics, ads.
    New data loads as a `.js` file through `<script>`.
21. **Debug.** `?debug=1` frame readout, `?level=N` jump, `?seed=N` timed-run seed; Settings "Debug-Bericht exportieren"
    (Blob download through `a.download`).

**Not carried over:** physics, projection, the 240 Hz fixed-step simulation, attract mode, dedication, background
images and their CraftPix credit, bar music and ambience, the bomb.

### 7.2 File layout (v0.1.0 plus changes; P = pure; NEW and CHG mark work)

```
index.html                      CHG  bottom booster bar, stuck sheet/banner, timeout card, lock + pip markup
src/config.js               P   CHG  scoring/timer/combo/kit constants from sections 2 and 4, GEN_VERSION
src/game/rng.js             P        mulberry32 + string hash (integer only)
src/game/levels-data.js     P   NEW  generated: SS.LEVEL_DATA (500 levels, about 68 KB)
src/game/board.js           P   CHG  layered compartments, locks, reveal(), free/visible/hidden counts,
                                     progressPossible(), snapshot/restore/hash
src/game/levels.js          P   CHG  decode baked levels, endless transform, timed-run transform, product skin
src/game/solver.js          P   CHG  progress-bounded DFS + memo, softmax playouts (build + Hint + Shuffle check)
src/game/boosters.js        P   NEW  undo stack, hammer, shuffle, freeze, hint (pure state transforms)
src/game/score.js           P   CHG  S1-S11, stars, flawless, combo per mode
src/game/game.js            P   CHG  createGame(levelSpec, mode, opts), moveItem, useBooster, undo, tick(g, dtMs) -> events
src/game/save.js            P   CHG  schema v2 + migration
src/art/catalog.js               CHG  20-product core set first, hue groups, confusable-pair table
src/art/sprites.js                    URLs, decode() preload, placeholder art
src/ui/board.js                  CHG  item size 64-80 px, back-layer dim div, depth pips, locks, window-level drag fallback
src/ui/hud.js                    CHG  countdown (amber/red), moves/par, items left, combo bar or pips, Schwer badge
src/ui/boosterbar.js             NEW  bottom bar: Undo, Hammer, combo meter, Shuffle, Freeze/Hint, Lv.N locks
src/ui/overlays.js               CHG  timeout card, stuck sheet, clear cards (4.4), run over, level grid (relaxed)
src/ui/fx.js                     NEW  sparkles, floaters, confetti canvas (lazy)
src/ui/input.js, storage.js, strings.js     (strings: German UI copy from 2.8)
src/audio/engine.js, sounds.js   CHG  new recipes: unlock clank, reveal swish, chain-pitched chime
src/app/states.js                CHG  level identity (3.8), timed run/relaxed campaign, stuck/timeout flow
src/app/loop.js                  CHG  rAF only when needed (7.1 #16)
src/main.js                      CHG  auto-pause on hide in timed mode
src/style/*.css                  CHG  remove margin-top keyframes and drag filter; translate/scale/rotate juice
scripts/build-levels.js          NEW  offline generator + gate (3.3), writes levels-data.js, fails on any unsolvable level
scripts/build-catalog.js              unchanged
tests/levels.test.js             CHG  hash pin, invariants, sample re-solve, endless hashes
tests/board.test.js              CHG  reveal, locks, progressPossible against BFS on small boards
tests/boosters.test.js           NEW  undo restores score/combo but not clock/moves; hammer layer holes; shuffle refund
tests/score.test.js              NEW  S1-S11 worked examples
tests/save.test.js               CHG  v1 -> v2 migration
tests/browser/run.js             CHG  layered level, booster bar, timeout card, stuck sheet screenshots
docs/DESIGN.md                   NEW  normative spec derived from this brief (numbered, cited by code)
```

---

## 8. Open questions for the owner

1. **Timed run start**: always L1 (decided), or also from a reached tier (10, 20, ...) with a top list per tier? L1-L20 is about 2 hours of play (resumable).
2. **Timed failure**: after the free +30 s the run ends (decided). Or "Retry level" from the level's start score (campaign-like, weaker highscore)?
3. **v2 features from your Lv.513 screenshot**: moving side columns, single-slot stacks, golden items. Which first?
4. **Product language**: German names (UI and 180 existing SVGs) or the English names in 6.3? Cut the catalogue to a portrait core of 20-40 for v1?
5. **Time limits** are provisional. Play about 10 levels on your iPhone so `sPerItem` can be tuned; should the game log median seconds per item?
6. **Relaxed stars**: keep moves-vs-par stars, or a pure zen mode with no rating?
7. **Hammer**: 0 points + 3 moves (decided), or Falcon's "complete a match" with points?
8. **Offline/PWA**: is a service worker acceptable on the HTTPS deployment (new kind of code; file:// unaffected)?
9. **Music**: SFX only (decided for v1), or a generative loop like cocktail-merge's?

---

## 9. Sources

Original game and genre mechanics
- GDD wiki of Falcon Goods Sort v5.38: https://github.com/haodhh-r1abi/GoodsSortPuzzleWiki (features/GameplayMechanics, Obstacles, CellLock, PowerUps, Boosters, Lives, WinStreak, Difficulty, LevelProgression)
- Clones: https://github.com/KardelenNaiboglu/GoodsSortingClone ; https://github.com/AmanitaDev/GoodsSort ; https://github.com/zhao1995li/GoodsSortParty
- Store listings: https://apps.apple.com/us/app/goods-puzzle-sort-challenge/id6482849843 ; https://apps.apple.com/app/id1658958534 ; https://apps.apple.com/app/id6503113766 ; https://apps.apple.com/app/id6746930732 ; https://apps.apple.com/us/app/id6463188611 ; https://www.taptap.cn/app/676508/all-info
- Booster definitions and guides: https://playgama.com/game/goods-sort-3d-triple-puzzle ; https://easegame.com/g/goods-puzzle-sort-challenge ; https://puzzlechallengehub.com/recommendation/goods-triple-sort-strategy-guide ; https://www.bubbleshooter.net/game/goods-sort/ ; https://support.arkadium.com/en/support/solutions/articles/44002663030--supermarket-sort-how-to-play-tips-scoring ; https://www.goodspuzzle.app/blog/goods-sorting-match-3-game-guide/
- Ball/water sort NP-completeness: https://arxiv.org/abs/2202.09495

Player feedback
- Screenshot source thread: https://www.reddit.com/r/CozyGamers/comments/1kr3nl8/anyone_know_a_good_sorting_game_like_this_but/
- https://www.reddit.com/r/CozyGamers/comments/1pmply0/ ; https://www.reddit.com/r/aigamedev/comments/1vi16qm/ ; https://www.reddit.com/r/darkpatterns/comments/1rhy4ca/ ; https://www.reddit.com/r/iosgaming/comments/1nt0fmz/ ; https://www.reddit.com/r/iosgaming/comments/1m08ke8/
- Reviews: https://itunes.apple.com/us/rss/customerreviews/page=1/id=6482849843/sortby=mosthelpful/json ; https://play.google.com/store/apps/details?id=puzzle.goods.triple.match
- https://www.pocketgamer.biz/why-simple-puzzle-games-keep-players-hooked-and-how-to-advertise-them/

Visuals and platform
- https://openmoji.org/styleguide/ ; https://kenney.nl/assets/food-kit ; https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_as_an_image
- https://web.dev/articles/css-individual-transform-properties ; https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count ; https://smus.com/canvas-vs-svg-performance/ ; https://caniuse.com/vibration
- WebKit: https://gl.boardgamearena.com/bug?id=38544 ; https://bugs.webkit.org/show_bug.cgi?id=191197 ; https://bugs.webkit.org/show_bug.cgi?id=256876 ; https://bugs.webkit.org/show_bug.cgi?id=243949 ; https://bugs.webkit.org/show_bug.cgi?id=220196
- Brand checks: https://www.aldi-sued.de/marken/goldaehren ; https://www.lebensmittelzeitung.net/produkte-promotions/Weideglueck-Bio-Joghurt-mild-Weideglueck-Bio-Joghurt-mild-in-sieben-koestlichen-Sorten-40216

Local
- Screenshots: `examples/original-goods-sort-screenshot.webp`, `further-deatures/WhatsApp Image 2026-10-10 at 19.24.55.jpeg`
- Template game: `/workspace/Development/private/cocktail-merge` (docs/DESIGN.md 3.10 and 5.x, src/main.js,
  src/ui/input.js, src/audio/engine.js, src/ui/storage.js, tests/, scripts/release.sh, docs/DEPLOY.md)
- Generator prototype and measurements: `/tmp/claude-1000/-workspace-Development-private-supermarket-sorter/88b3ed10-2b7c-4900-b9fa-c8003bfb48b9/scratchpad/proto/`
  (model.js, solver.js, gen.js, exp1-11.js). Copy the useful parts into `scripts/build-levels.js`; /tmp does not survive a reboot.
