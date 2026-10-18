# Supermarkt Sortierer: DESIGN (v0.2 rules, implementer-ready)

Version 2, 2026-10-10 (revised after the design critique). Binding order: `docs/OWNER-NOTES.md` > this document > `docs/RESEARCH.md` > the three
proposals in `docs/design-proposals/` (feel.md, puzzle.md, engineering.md), from which this document is synthesised.
Normative words MUST / SHOULD / MAY. Rule ids (`R12`, `R-B3`) are meant to be cited in code comments as `DESIGN R12`.
Facts about the original cite its GDD wiki (https://github.com/haodhh-r1abi/GoodsSortPuzzleWiki, `features/*.html`):
WIKI-GM (GameplayMechanics), WIKI-OB (Obstacles), WIKI-CL (CellLock), WIKI-DF (Difficulty). Measurements cite the
full-model prototype `docs/research-proto/full/` (PROTO) as reported in puzzle.md 3.3.

---

## 0. Summary and decision log

**One paragraph.** The v0.1.0 board grows from "compartments of item ids" to "compartments with a front row of item
ids plus a queue of up to 5 back layers (type codes)", gains lock counters, take-only conveyor belts (two vertical
side belts, later a horizontal belt in "Gegen die Zeit"), the golden bunny and silhouette items. Belt *motion* lives
only in the view (Web Animations on the compositor, zero JS per frame); the pure rules see a belt as a time-free pool
of take-only cells. That one choice lets the solver, undo, the save format and the tests ignore time, and it is what
makes solvability provable: every level ships with a witness move list that three independent checkers replay (an
independent test checker, the real `SS.game` API, and the phone itself before it shows the level). Levels L1-L300
per branch are baked by `scripts/build-levels.js`; L301+ are generated on the phone, deterministically per level
number, under a node-count budget, with a proven fallback. The guiding feel principle: **things you drop onto never
move; only things you take from move.**

### 0.1 Decision log

| # | Topic | Options considered | Decision | Why (evidence) |
|---|---|---|---|---|
| D1 | Code base | rewrite / evolve | Evolve v0.1.0: `SS`, pure `src/game/`, DOM `<img>` per item, tests, release script | It works and follows cocktail-merge conventions (RESEARCH 0 #1) |
| D2 | Centre rack | 3-column grid (puzzle G3x3/G3x4) / 2 columns + caps | 2 columns of 3-slot compartments + optional centred top/bottom cap, shapes A4..A10, C <= 10 | Owner's decoded Lv.513 rack (1 + 8 + 1); A12 dropped: 7 rack rows give 54 px items at 375x667 |
| D3 | Layers | per-slot / whole-layer; depth 3 / 6 | Whole-layer advance, depth <= 6, layers 4-6 sparse (1-2 items) | Owner (binding); PROTO: dense depth-6 boards give 0% agent wins, sparse deep layers keep them playable |
| D4 | Deeper layers on screen | nothing / count pips | Front + darkened next layer drawn, nothing else by default; optional count pips (max 4 dots) behind the setting "Tiefe anzeigen" (default **off**) | Owner: only the current layer and the darkened one behind it are shown, "never the deeper ones"; the opt-in setting serves players who ask for a count |
| D5 | Locks | ads (original) / matches | Chain + badge = matches still needed; every real match (player triple or cascade) lowers every lock by 1; bunny spend and orphan sweep do not | Owner: "opens after that many matches" (literal reading, puzzle 1.4); WIKI-CL: every match decrements, default 4 |
| D6 | Side shelves | depth-1 cells / stacks | Model: cell = stack `[t, ...]` + `barred`; v1 data always depth 1; bars after the take | Owner's description; screenshots show dark products behind side cells, so stacks cost no refactor if the owner says so (Q1) |
| D7 | Belt direction | feel's right belt down from L45 / all up | Both vertical belts move up (out at the top, back in at the bottom), always | Owner's words; feel's "↑↓" rejected (judge 2 hard fault) |
| D8 | Belt motion owner | model phase + WAAPI (feel) / view-only CSS (engineering) | View-only WAAPI per cell; hit test from `getBoundingClientRect` at pointerdown with lag compensation; model has no phase | One clock (the compositor) can never disagree with a hit test; WAAPI `updatePlaybackRate` allows the in-level speed ramp |
| D9 | Horizontal shelves | none / extra conveyor / sliding compartments | Timed only: one take-only conveyor row under the rack, moving left, appears after k matches (integer) | Owner: "very hard levels, or later in a level"; drop targets stay still (D-principle); form asked in Q2 |
| D10 | Golden bunny | auto-collect, no slot (engineering) / tap triggers own front (puzzle) / collect-then-spend (feel) | Occupies a slot; tap collects it (free action) into the HUD counter; spend clears the **whole** chosen unlocked compartment (front and all back layers; bunnies inside are collected first), then orphan sweep and valve R-K5 | Owner: the bunny "frees a compartment (clears it)"; screenshot 19.24.55 shows the bunny in a front slot and the counter 0 -> 2; front-only clear and acting in place are the alternatives in Q3 |
| D11 | Orphans | keep until win (feel) / immediate sweep | Sweep check after **every** action (O(T), a later match of a 6-copy type can create an orphan too); `swept[t]` set; back-layer copies of swept types are dropped when their layer arrives | Owner: 1-2 leftovers = solved; orphans must never clog slots or fool the stuck test (puzzle D6) |
| D12 | Win test | board empty / no triple possible | Win when `matchable == 0`, `matchable = Σ remaining[t] over t with remaining[t] >= 3`, kept as an integer counter | Owner's orphan rule; WIKI-GM `IsCompleteLevel` |
| D13 | Silhouette items | not covered by any proposal | Per-item flag; flat one-colour shape drawn with a canvas; colour differs from the product; never on confusable pairs; from L24, share rising to an asymptote of 25% | Owner 19:55 "We want this too"; the solver is unaffected (the type is known) |
| D14 | Stuck test | heuristic / exact | Exact O(items) `movesPossible` for belts and bunnies (1.9); stuck fires on `!movesPossible` even while a bunny is held (so the sheet can offer it), and spend targets pass a stuck filter; checked against exhaustive BFS in tests | No false "Kein Platz mehr", ever |
| D15 | Undo | 1 per level / -5 s in timed / unlimited | Relaxed: unlimited, cap 300. Timed: unlimited except that a **take is a barrier** (undo never puts a product back on a shelf, the bars stay). Never rewinds clock, moves or belt motion | Hidden layers make blind dead ends possible; owner: from the side shelves "nothing can go back", which is where the timed tension comes from; the relaxed exception is asked in Q6 |
| D16 | Helper kit | hammer, shuffle, freeze, wand, hint | Rückgängig (both), Goldhase (both), Tipp (relaxed), "+30 Sekunden" once per level (timed); no Einfrieren | Fewest buttons for a 60-plus player; owner: the original's boosters are "not needed as such" |
| D17 | Branch tracks | same boards / two tracks | L1-L20 share knob rows (same order of teaching), then timed hardens clock + speed + horizontal belt, relaxed hardens depth, locks, types, free space | Owner's branch definitions |
| D18 | Proof | trust the generator / witness | Every level carries a witness; replayed by an independent checker (tests), by `SS.game` (tests), and by the phone before showing | Owner: "beweisen"; a replay is a proof that cannot share a bug with the search (puzzle D2, feel D13) |
| D19 | Dealing | uniform random / banded | Banded deal: the 3 copies of a type lie within about 2 layers of each other; band width widens slowly in the tail | PROTO: agent win 13% -> 33% at depth 3-4; DFS p50 556 -> 46 ms at depth 4-6 |
| D20 | Budgets | milliseconds / nodes | Node counts only; integer RNG and integer playout weights; no floats in level paths | Level n must be bit-identical on every device and in CI |
| D21 | Baked vs runtime | bake 150 / 300 / 600 per branch | Bake L1-L300 per branch with witnesses; L301+ generated on the phone in a background job | Phone rarely runs the solver; 300 keeps the build under 20 min |
| D22 | Time limit | per item (research) / from the witness | `timeS` derived at runtime from the witness length, belt waits and the level tag (4.6); never baked | PROTO Theorem 2 makes it achievable by construction; retunable on the owner's iPhone without a rebake (engineering D13) |
| D23 | Belt speed | baked / runtime | Runtime function of (branch, L, tag); timed rises 0.20 -> 1.00 cells/s by L100 then asymptotically to 1.40; relaxed still to L40, then 0.08 -> 0.12 | Owner: faster with level in timed, still or slow in relaxed |
| D24 | Timed highscore | run from L1, 2nd timeout ends it / Serie | "Serie": progress is never lost; a 2nd timeout or a restart banks the streak into the top 10 | A 60-plus player must never replay hours after one bad timeout (judges 1 and 2) |
| D25 | Relaxed highscore | Σ best only / recent records / weighted top 10 | Headline Σ best + ★ total; top 10 of weighted single-level scores `best × (100 + n) / 100` | A real list without a clock; late levels rank higher so the list keeps moving |
| D26 | Combo | 3 s / 5 s / 6 s window | Timed 6000 ms window, multiplier x4 cap at combo 7; relaxed 3-move window, no points | Belt waits and 60-plus reaction time (feel D15) |
| D27 | Retry | new transform per run / identical | Identical board in both branches | "I almost had it" needs the same board; per-level bests compare like for like |
| D28 | Plateau | caps by design / keep hardening | Past the structural caps an integer asymptotic squeeze keeps hardening: time factor, belt speed, silhouettes, confusable pairs, band width | Owner: "keeps getting harder"; boards cannot grow past the phone screen |
| D29 | Render loop | continuous rAF / on demand | No continuous rAF; 250 ms timer in timed PLAY; WAAPI for belts; rAF only while a JS animation runs | Cool phone, long battery; relaxed idle = 0 callbacks |
| D30 | Rules version | keep / bump | `RULES_VERSION` 1 -> 2, save `v` 1 -> 2, `VERSION` 0.2.0 | Board snapshots change shape |

**Rejected (one line each).** Hammer (the bunny is a clearer hammer), Shuffle (moves dozens of products the player did
not touch, destroys her mental map), Einfrieren (redundant with a fair clock and "+30 s"; the owner does not need the
original's boosters), Magic Wand (solves the level for her), hidden "?" items (luck; RESEARCH 0.1; distinct from
silhouettes), bombs, lives, coins, ads, moving drop targets, per-run board transforms, reverse-construction generation
(RESEARCH: 3/40 successes at depth 2), Web Workers and fetch (break `file://`), view-only belt slow-down while a finger
is down (grabbing detaches the product at once, so it is not needed), "Das Produkt ist weggefahren" refusals
(the hand spot, 7.4, replaces them), a front-row-only bunny clear as the default (contradicts the owner's "clears it"; kept as alternative (a) in Q3), a continuous rAF.

### 0.2 Where this deviates from RESEARCH.md "Decisions at a glance"

| Research decision | Here | Reason |
|---|---|---|
| #2 depth <= 3; moving shelves and golden item in v2 | depth 6; belts, locks, bunny, silhouettes in v1 | Owner (binding) |
| 3-column grid | 2 columns + caps | Owner's layout; side belts need the width |
| #4 same boards in both modes | shared L1-L20, then two tracks | Owner's branch notes |
| #5 bake 500, transforms after | bake 300 per branch, runtime generation after | Infinite and harder; transforms only as fallback |
| #7 `sPerItem` 7.0-5.0 | witness-derived time, τ 3.4 -> 1.8 s per witness move | Owner: about 6:00 on a ~110-item Lv.513 board (4.6 gives 6:00 with the final rule) |
| #8 combo window 5 s | 6 s | Belt waits, 60-plus reaction time |
| #9 Hammer/Shuffle/Freeze/Hint kit | Undo, Goldhase, Tipp, +30 s | Fewer, bigger buttons |
| Timed run from L1, ends on 2nd timeout | Serie, progress kept | No progress loss |
| Timed retry = new transform | identical board | Fair comparison |
| P1 #14 "larger items / high contrast" setting (`bigItems`) | dropped; setting "Kontrast erhöhen" instead (darker plank, 2 px item outline, `highContrast` in the save) | The 2-column rack plus two side belts leave 35-38 px wide slots; bigger items do not fit, more contrast does |
| (owner: up to 6 layers deep, seen on a timed Lv.513) | timed depth 4 to L120, 5 on Sehr schwer from L121, **6 on Sehr schwer from L201** (layers 5-6 sparse, 1-2 items, inside the 110 cap) | τ-time grows with \|W\|, so deep timed boards stay rare and sparse; the timed player still meets 6 layers in hard levels |

### 0.3 What changes in v0.1.0 (file by file; details in section 8)

| File | Change |
|---|---|
| `src/config.js` | `VERSION 0.2.0`, `RULES_VERSION 2`, `GEN_VERSION 1`, `COMBO_WINDOW_MS 3000 -> 6000`, `COMBO_MAX 8 -> 7`, `TIME_WARN_S 10` + new `TIME_AMBER_S 30`, new keys of 5.3, belt/tail/silhouette constants, `TAIL_W_RATIO` and `TAIL_DEEP_CAP` (3.6, 3.7), `SKIN_POOL_V1` (4.8); `MOVE_BONUS` removed (relaxed uses efficiency) |
| `src/game/board.js` | comps gain `back`, `lockAt`, `col/row`; items gain `sil`; new `belts`, `remaining`, `matchable`, `matches`, `bunnies`; new `reveal`, `sweepOrphans`, `applyThresholds` (incl. the starved valve R-K5), `take`, `collect`, `spend`, `movesPossible`, `progressPossible`, `stuckTargets`; `isDeadlocked` becomes a thin alias of `!movesPossible && bunnies == 0`; `createBoard(spec)` accepts the decoded level (old `{rows, cols, fill}` spec still accepted for the old tests) |
| `src/game/belts.js` | NEW (pure): belt cells as stacks, take, bar, appear, availability counts |
| `src/game/rules.js` | NEW (pure): win, stuck wrapper, per-branch combo, speed ramp, time limit, star rules, `casualBot` (lives here, not in `gen.js`, so `timeLimit` has no load-order cycle) |
| `src/game/game.js` | `createGame(level, mode, opts)` kept; `moveItem` kept (now also takes from belts), new `collect`, `spend`, `undo`, `extend`, `rescue`; `tick` per 2.3; event `deadlock` renamed `stuck` (no longer terminal) |
| `src/game/score.js` | `multiplier`, `matchPoints`, `clearBonus`, `stars` kept; per-branch rules of 5.1/5.2; `efficiency` new |
| `src/game/solver.js` | rewritten inside the file (same `SS.solver` module): compiled state, `solveP` (node budget, resumable), integer playouts, `verify`, `hint`; old `solve(board)` and `nextMove(board)` kept as wrappers (old unit tests; `tests/browser/run.js` and `soak.js` drive takes with `nextMove`) |
| `src/game/gen.js` | NEW (pure): knobs (L61+ formulas only; the hand-set L7-L60 rows live in build-only `scripts/knob-rows.js`), banded deal, invariants, gate, metrics, transform |
| `src/game/levels.js` | `generate()`/`curve()` replaced by `get(mode, n)`, `decode`, `encode`, `skin`, `tailJob`; `parLowerBound` kept; the 4 old `generate`/`curve` tests are rewritten against `get(mode, n)` (8.7) |
| `src/game/levels-data.js` | NEW, generated: 2 x 300 levels with witnesses |
| `src/game/save.js` | schema v2 (5.4); `normalizeSave`, `mergeSave`, `recordRun` kept, `recordLevel` new |
| `src/ui/board.js` | keeps geometry, build, pointer routing, drag layer; animations move to `boardfx.js`; belts to `ui/belts.js` |
| `src/ui/belts.js`, `boardfx.js`, `bottombar.js`, `coach.js` | NEW (7.3-7.6) |
| `src/ui/hud.js` | bunny counter (tappable), amber/red clock, Kombo bar (timed) or 3 pips (relaxed), "Schwer" badge, "Noch N" (N = `matchable`) |
| `src/ui/overlays.js` | INTRO card, stuck sheet/banner, timeout card, Serie card, two-tab Bestenliste, settings additions |
| `src/ui/strings.js` | new German keys and their English twins (7.7); `howto_text` rewritten |
| `src/app/states.js` | states INTRO, STUCK, TIMEOUT added; level identity (mode, n) replaces the `'run-' + seed` seed; LOSE shows the banked Serie |
| `src/app/run.js` | NEW: Serie bookkeeping, run record v2, tail job scheduling |
| `src/app/loop.js` | `want(reason, on)`: runs only while a reason is on; 250 ms clock timer instead of per-frame tick |
| `src/style/board.css`, `belts.css` | backs, dim, pips, chains, bars, silhouettes; NEW belt CSS |
| `scripts/build-levels.js`, `scripts/prove-levels.js`, `scripts/authored.js`, `scripts/knob-rows.js`, `scripts/tune.js` | NEW |
| `scripts/build-catalog.js` | CHG: writes `shapeGroup`, `silhouetteOk`, `hueFamily` per product (4.8) |
| `assets/items/manifest/silhouette-overrides.json` | NEW: manual `shapeGroup` / `silhouetteOk` overrides |
| `src/art/catalog.js` | regenerated by `build-catalog.js` (new fields) |
| `tests/*` | new and changed tests of 8.7 (31 old tests: 18 unchanged, 10 rewritten, 3 extended); `tests/bots/*.js` NEW; `purity.test.js` exempts `levels-data.js` from the 450-line cap |

### 0.4 Known limitations (accepted, one line each)

- Whole-compartment spend (owner's "clears it") removes up to 18 products in one move, so bunny levels are easier to 3-star in relaxed; Q3 offers front-only if he prefers.
- Relaxed undo can still put a taken product back on its shelf (Q6 default, forgiving mode); timed follows the owner's "nothing can go back" strictly.
- The stuck filter (1.9) only guarantees that a spend leaves an immediate move, not that the level stays winnable; a full check needs a solver run at the stuck moment; undo, rescue and restart remain.
- The valve R-K5 opens a lock or belt without a visible match (the badge jumps to 0); rare (only after spends) and better than an unwinnable level.
- Silhouette counts may fall short of the permille target when a level has few unique shapes (logged, never forced, because forcing would break R-S3).
- Tail levels (L301+) are certified but not window-filtered one by one; their difficulty is held statistically (median per tag within +-10 points, `npm run proof`).
- casualBot is a timing model; the mother's real pace and visual confusion (silhouettes, confusable pairs, the dark layer) are only measured in the playtest (9.3).
- If casualBot still fails after 8 time steps the time is accepted and logged (target <= 1% of levels); "+30 Sekunden" covers those few tight levels.
- Undo re-hides a layer the player has already seen (RESEARCH B2).
- Tipp is not node-deterministic across devices (time-boxed slices); hints are not part of level identity.
- The player can delay a bunny collect (do not touch it) but not refuse it; delaying is all the certificate ever needs (3.1).
- `bigItems` is dropped for layout reasons; "Kontrast erhöhen" replaces it (0.2).

---

### 0.5 Implemented deltas (v0.2.0 as shipped, 2026-10-11)

The code follows this document except where listed here. These are decisions taken during implementation and the
first playtest; they override the sections they touch.

| Topic | Shipped | Where |
|---|---|---|
| Clock | `tauMs = max(1800, 3300 - 30(L-1))` ms per witness input (× squeeze), belt waits halved, 20 s slack, minimum 120 s (L≤6), 90 s (L≤20), 75 s; tightened after the owner's mother cleared L14 with 1:30 of 3:45 left | `rules.timeLimitS`, `levels.timeMs` |
| Turbo levels | every level with index 6 from L27 (27, 37, ...) runs the side belts at 1.8× (at least 1.08, at most 1.8 cells/s; v0.3.2, 40% slower than the 3× / 1.8..3 of v0.3), badge "Turbo-Regal!", coach mark, clock multiplier +15 % | `rules.isTurbo`, `rules.speed100` |
| Products | 260 products in three tiers (172 tasty food, drinks and pantry, non-food); the skin picks tier 1 first, so levels show food | `scripts/build-catalog.js` (TIER1/TIER3), `levels.pickProducts` |
| Baked levels | 300 per branch; acceptance windows up to L300 timed and L40 relaxed (`--windows-until=40`); deeper relaxed boards never meet the windows | `scripts/build-levels.js` |
| Runtime generation | 12 attempts × 30 000 nodes + 64 playouts per level beyond the baked data; remix fallback of a baked level | `config.TAIL_*`, `levels.raw` |
| Export / import | Settings: "Spielstand sichern" / "Spielstand laden"; JSON with app, format, version, saveVersion, rulesVersion; import merges (progress only grows); fixture per release in `tests/fixtures/` | `save.exportRecord/importRecord`, `storage.exportAll/importAll`, `main.js` |
| Save v2 | records per mode with reached level, Serie, top 10, per-level bests; v1 migrates; newer records are read as-is | `save.normalizeSave` |
| Run record | one per mode (`supermarketSorter.v1.run.<mode>`), dropped on a rules-version mismatch | `storage.loadRun` |
| Undo in timed | cannot reach back past a take (the undo stack is cleared by a take) | `game.act` |
| Hint | one coherent plan cached while the board develops as predicted (no oscillation) | `solver.hint` |
| Silhouette rendering | canvas (`drawImage` + `source-in`), because CSS `mask-image` is blocked from `file://` | `sprites.silhouette` |
| Stuck sheet | one modal sheet in both branches (the timed clock keeps running) | `states.onStuck` |
| Not built | Oma/Casual/Profi bots of section 9, `scripts/prove-levels.js`, the bench page, music | |

v0.3.0 (2026-10-16) deltas, overriding 7.2 and ART-SPEC v1:

| Topic | Shipped | Where |
|---|---|---|
| One product size | the tile of a product is `slotW × min(90 / w, 170 / h)` from its measured bounding box, on the rack, the side shelves and the bottom shelf alike; rows are `HEAD + 1.7 slotW + PLANK` | `sprites.scale`, `board.computeGeometry`, `belts.tileFor` |
| Geometry | (v0.3.0, superseded by the v0.3.1 cabinet geometry below) side shelves taller than the rack, bottom shelf between them | `board.computeGeometry` |
| HUD | (v0.3.0, superseded by the v0.3.1 HUD band below) one wrapping row with the action buttons at the right and no bottom bar | `index.html`, `hud.css`, `hud.js`, `bottombar.js`, `main.relayout` |
| Forgiving input | a drop lands in the compartment under the finger, else the nearest one to the sprite's foot, else the nearest to the finger (within 0.55 of a row); a tap just beside a compartment counts; the nearest free slot is chosen (unchanged); tap slop 10 px | `board.dropTarget`, `board.compNear` |
| Products v2 | all 260 redrawn tall (class boxes of ART-SPEC v2), German brand words, familiar supermarket looks with invented names; ids unchanged | `assets/items/`, `docs/ART-SPEC.md` |
| Debug entry | `?level=N&mode=timed|relaxed` loads a level in test mode; nothing is recorded | `main.boot`, `states.debugLevel` |
| What's new | `save.seenVersion`; players with progress see the card once per version, new players get the NEU badge on the title until they open "Neuigkeiten" | `main.whatsNewOnBoot`, `overlays` |

v0.3.1 (2026-10-16, the "Vorbild look"):

| Topic | Shipped | Where |
|---|---|---|
| Cabinet geometry | side cells = rack rows (pitch `compH + GAP`, aligned), belts with more cells than rows scroll (relaxed: drift 0.08 cells/s even with "stehen still"), bottom shelf full width, frame height = rack stack only; width-limited on every phone | `board.computeGeometry`, `board.beltSpeed`, `levels.timeMs` (real hidden count) |
| Look | one light-wood cabinet with continuous boards, light compartment backs, darkened back-layer copies on canvas, contact shadows per occupied slot, dark HUD band, slim bottom action row, blue pause | `board.css`, `belts.css`, `hud.css`, `base.css` tokens, `sprites.shaded`, `board.syncShadows` |
| Silhouettes | dark rim + sheen + "?" badge (canvas) | `sprites.silhouette` |
| App mode | `manifest.webmanifest`, Fullscreen API toggle, "Als App spielen" card once on phones (`save.seenInstallHint`) | `main.setFullscreen`, `main.installHintOnBoot`, `overlays` |
| Products v3 | the original's 3D look in SVG, see `docs/ART-STYLE.md`; `TARGET_W` 93 | `assets/items/`, `tests/items-check.js` |
| Shift | a front product may be rearranged to a free slot of its own compartment, free of charge (no move, no undo, no combo); drag or tap-select then tap the slot | `board.shift`, `game.shiftItem`, `ui/board.tryShift` |
| 2D/3D products | setting `flatIcons`: the flat v0.3.0 set in `assets/items-2d` with its own measured sizes | `sprites.setFlat`, `main.applySpriteSet` |
| Performance | compositor-only item animations, change-only HUD writes, Web-Animations bursts, opacity flash overlay, change-only belt playback rate; `npm run perf` | `board.css`, `hud.js`, `bottombar.js`, `boardfx.js`, `belts.js` |
| Refusal feedback | the toast names the reason (full, locked, source locked); a drop onto the own compartment without a free slot springs back silently; a tap on a back-layer product explains the rule | `ui/board.refuseReason`, `main.js` handlers |

v0.3.3 (2026-10-18, one HUD row; owner: the products were still smaller than the original's on his phone in the browser):

| Topic | Shipped | Where |
|---|---|---|
| One HUD row | the bottom action row is gone; Rückgängig, Tipp (relaxed) and Goldhase (count, arms a spend) are 44 px buttons in the HUD row beside the pause button, icons only under 640 px; `ui/bottombar.js` folded into `ui/hud.js`; the band is 56 px + safe area, the board gets everything below it down to the bottom safe area | `index.html`, `hud.css`, `ui/hud.js`, `main.relayout` |
| Pills | level pill with "Noch N" under it; middle pill with the clock and the Serie score under it (timed) or the moves and the par under them (relaxed); the xN combo badge after the score with reserved space (the row never shifts); narrow tiers at 399 and 359 px | `hud.css`, `ui/hud.js` |
| Difficulty as colour | the level pill is amber (hard), red (very hard) or violet (turbo) instead of carrying a badge; the intro card still names it | `hud.css .pill-level.hard/.vhard/.turbo` |
| Combo line | the combo window is a progress line drawn on the band's own 4 px bottom edge (green, amber from x2), no text; relaxed drains in thirds (3 moves) | `hud.css .combo-bar`, `ui/hud.js` |
| Measured | 360×678 (owner's phone in Chrome): cabinet 272 → 331 px (76 → 92 % of the width); levels without the bottom shelf and app/fullscreen mode reach the full width; see `docs/STATUS.md` | `tests/browser/layout.js`, `run.js` |

## 1. Game model, formal

### 1.1 Terms

| Symbol | Meaning |
|---|---|
| C | centre compartments (Fach), each with 3 fixed slot positions 0..2 |
| front(c) | the 3 front slots of c: item id or 0 (v0.1.0 field `slots`, unchanged) |
| back(c) | queue of layers behind the front; `back[0]` = next layer (drawn dark), `back[1..]` = deep (never drawn; optional count pips); depth = 1 + `back.length` <= 6; `back[0..2]` = layers 2-4 (layer 1 = front) |
| layer | `[t|null, t|null, t|null]` plus `sil: [0|'#RRGGBB' x3]`; `t` = type code, `'*'` = golden bunny, null = hole that keeps its position |
| lockAt(c) | 0 = open, else the match count at which c opens; badge shows `max(0, lockAt - matches)` |
| belt | `{ id: 'L'|'R'|'H', axis: 'y'|'x', appearAt, appeared, cells: [Cell] }` |
| Cell | `{ stack: [{ t, sil: 0|'#RRGGBB' }], barred }`; v1 data: `stack.length <= 1`. One silhouette encoding everywhere: `sil = 0 | '#RRGGBB'` |
| F | empty front slots of unlocked compartments |
| c_t | copies of type t in unlocked fronts |
| s_t | copies of t on top of unbarred cells of appeared belts |
| Hk | number of unlocked compartments with `back.length > 0` |
| remaining[t] | copies of t anywhere: fronts (locked too), back layers, all belt cells (appeared or not) |
| matchable | `Σ remaining[t]` over t with `remaining[t] >= 3` (integer, kept incrementally) |
| matches | real matches made in this level |
| bunnies | collected, unspent golden bunnies (level-scoped) |
| swept[t] | 1 once type t has been swept as orphan (1.8); arriving copies of t are dropped (R-L3) |
| totalMatches | `(Σ remaining[t] at start) / 3`, fixed per level (ramp R-B8, `appearAt` shares 4.2) |

### 1.2 Centre rack shapes

Two columns of 3-slot compartments, R rows, plus 0-2 caps centred above and below (a cap is a normal 3-slot
compartment standing alone in its row, as on Lv.513). Index order: top cap, then rows left-to-right, then bottom cap.

| Shape | Grid | Caps | C | Rack rows | Side belt window Wv | First used |
|---|---|---|---|---|---|---|
| A4 | 2x2 | - | 4 | 2 | - | L1 |
| A5 | 2x2 | top | 5 | 3 | - | L2 |
| A6 | 2x3 | - | 6 | 3 | - | L3 |
| A7 | 2x3 | top | 7 | 4 | - | L5 |
| A8 | 2x3 | top + bottom | 8 | 5 | 6 | L7 |
| A9 | 2x4 | top | 9 | 5 | 6 | L10 |
| A10 | 2x4 | top + bottom | 10 | 6 | 8 | L20; the Lv.513 shape |

`Wv = ceil(rackRows × 6 / 5)` (a side cell is 5/6 of a rack row tall; Lv.513 shows 7-8 side cells next to 6 rows).

### 1.3 Layers (whole-layer advance)

- **R-L1** A front is **empty** when its 3 slots hold no item (product or bunny).
- **R-L2** When the front of c is empty and `back(c)` is non-empty, `back[0]` moves forward into the same slot
  positions (holes stay holes), each non-null code gets a fresh item id (silhouette flags travel with it), `back`
  shifts. This is a **reveal**; it costs no move.
- **R-L3** Arriving copies of a type t with `swept[t] = 1` (1.8) are dropped; a layer left empty by that filter is
  skipped and the next one is revealed (bounded by depth).
- **R-L4** Back layers hold 1-3 items; layers 2-3 use the level's "Rück" range, layers 4-6 hold 1-2 (sparse).
  No layer, front or back, starts as a triple of one type (generator invariant G3), so a reveal never matches by
  itself; if one ever does, it clears as a cascade match (counts for locks and combo, costs no move).
- **R-L5** Only `back[0]` is drawn (darkened); deeper layers are not shown (owner). Only with the opt-in setting
  "Tiefe anzeigen" (default **off**) do `back[1..]` show as pips (one dot per hidden layer, max 4, "+" beyond). The
  contents of deeper layers are never drawn in any setting.

### 1.4 Locks

- **R-K1** A locked compartment accepts no drops, gives no items and is no bunny target. Its front products are
  visible behind the chains (as in the screenshot); its `back[0]` is not drawn while locked. An orphan sweep that
  empties a locked front triggers the reveal as usual: the new front is drawn behind the chains, its `back[0]` stays
  undrawn while locked, and the badge stays.
- **R-K2** `matches += 1` for every real match (player triple or cascade). Bunny spends, orphan sweeps and reveals do
  not count. At `matches >= lockAt` the chains fall (300 ms) and the compartment is normal from the next input on.
  A threshold that spends and sweeps made unreachable opens through the valve R-K5.
- **R-K3** Start counters 2..8. With k locks the counters are N, N+1, .., N+k-1 (e.g. 4, 5, 6): two small rewards beat
  one big one. A locked compartment starts with a full front (3 items) and MAY have back layers. Never a bunny inside.
- **R-K4** Locks never appear on Pause, Schwer or Sehr schwer levels (difficulty does not stack).
- **R-K5** **Starved-threshold valve** (2.2 step 5). `θ` = the smallest pending threshold (`lockAt` of locked
  compartments, `appearAt` of belts not yet appeared). `out[t]` = copies of t with `remaining[t] >= 3` in unlocked
  fronts, unlocked back layers and unbarred cells of appeared belts; `reach = matches + Σ_t floor(out[t] / 3)`. If
  `reach < θ`, everything pending at `θ` opens now (`unlock` / `beltAppear` with `reason: 'starved'`), reveals and the
  sweep run, and the check repeats until `reach >= θ` or nothing is pending. `reach` is an upper bound on the matches
  possible before `θ` opens, so the valve never opens anything that could still open by itself. Without spends
  `reach = Σ_t floor(initialOut[t] / 3)` depends only on which thresholds are pending (a match moves one unit from the
  sum into `matches`; moves, takes and reveals change nothing), and the witness proves it `>= θ`; so the valve fires
  only after a spend or sweep, never in a witness replay, and certificates are unchanged.

### 1.5 Side shelves (belts)

- **R-B1** A belt is a loop of `Nb` cells, `Wv` visible at once. Vertical belts L and R stand left and right of the
  rack and move **up** (out at the top, back in at the bottom). The horizontal belt H (timed only) is one row under
  the rack and moves **left**.
- **R-B2** **Take-only:** the top product of an unbarred cell of an appeared belt can be moved into an empty front slot
  of an unlocked compartment. Nothing is ever dropped onto a belt or put back.
- **R-B3** When a cell's stack becomes empty (v1: after its one product is taken or swept), bars come down from above
  (250 ms) and the cell stays barred for the rest of the level. Barred cells keep travelling.
- **R-B4** For the rules a belt is a **time-free pool**: every unbarred cell of an appeared belt is available at any
  time, because every cell passes the window within one period `Nb / v` seconds. Motion is a view concern (D8).
- **R-B5** Moving belts have `Nb = Wv + h` (h >= 1 hidden cells, so a wrapping cell is never visible twice); still
  belts (`v = 0`) have `Nb = Wv` (all cells visible; required by Theorem 1). If the relaxed setting "Regale stehen
  still" stops a belt with `Nb = Wv + 1`, the view draws its cells at `Wv / Nb` of the pitch so every cell is visible.
- **R-B6** `appearAt = k > 0`: the belt slides in (600 ms, toast "Nachschub!") once `matches >= k`. Its products count
  in `remaining` from the start (the HUD counter includes them) but are not available before it appears. The level
  reserves the belt's screen row from the start (an empty rail), so the rack never relayouts mid-level. A starved
  `appearAt` opens through R-K5.
- **R-B7** When every cell of a belt is barred, its animation stops and the belt dims to 60% (the "done" signal).
- **R-B8** Speed is a runtime function (4.6); in timed from L31 the view ramps it piecewise at match events:
  `v_eff = v × (1 + 0.30 × matches / totalMatches)` (event `beltSpeed`; `totalMatches` per 1.1).

### 1.6 Golden bunny

- **R-G1** `'*'` items are placed by the generator in `back[0..2]` (layers 2-4; they arrive with a reveal) or, in timed from
  L23, in a belt cell. A bunny occupies its slot. It is not a type: it never matches, never counts in `remaining`,
  `matchable` or the item counter.
- **R-G2** **Collect:** tapping (or starting a drag on) a bunny in an unlocked front or an unbarred appeared belt cell
  flies it to the HUD counter (+1). Free action: no move, does not touch the combo. It frees the slot (so it can
  trigger a reveal); a belt cell is barred (reason `collect`). The player decides *when* by not touching the bunny;
  that is all the certificate needs, because it fixes when each collect happens (3.1).
- **R-G3** **Spend:** tap the bunny button (HUD pill or bottom bar; it arms, legal targets glow), then tap an unlocked
  compartment whose front holds at least one product. Any bunny in that compartment (front or back layers) is
  collected first (+1 each, `collect` events); then **every product of the compartment, front and all back layers,
  vanishes** (golden burst 450 ms; the dark layer and any pips fade with it; owner: it "frees a compartment (clears
  it)"), and the orphan sweep (1.8) and the valve (R-K5) run. The compartment stays empty: three free slots. One move;
  0 points; not a match (locks unaffected); combo unchanged. Tap the armed button again or empty board to disarm.
  While stuck, only compartments that pass the stuck filter (1.9) glow and accept the spend.
- **R-G4** **Earned:** +1 the first time the combo reaches 5 in a level (both branches). **Rescue:** when stuck with
  0 bunnies, the stuck sheet offers one free "Rettungshase" per level if a compartment passes the stuck filter (1.9); using it caps the level at 2 stars and removes
  "Fehlerfrei"/"Ohne Hilfe".
- **R-G5** Bunnies are per level (counter starts at 0). Unspent bunnies, and bunnies still on the board, are collected
  at the clear: timed +150 points each; relaxed badge "Goldhase gespart".

### 1.7 Silhouette items

- **R-S1** A silhouette is a normal, movable item of a normal type with a flag `sil = '#RRGGBB'`. It is drawn as a
  flat one-colour shape of its own sprite; the colour comes from the 8-colour silhouette palette and MUST differ from
  the product's hue family (4.8, `catalog.hueFamily`), so the shape is the only hint (owner's ketchup example).
- **R-S2** It matches exactly like its type. When it is part of a match it "colours in" (150 ms cross-fade to the real
  sprite) before the pop: the confirmation. Holding or selecting it does not reveal it. In the dark next layer it is
  drawn as a dark silhouette (no extra information either way).
- **R-S3** Generator rules: at most one silhouette per triple of a type (so >= 2 copies of every type look normal);
  never on a type of a confusable pair; only on products with `silhouetteOk` and a `shapeGroup` no other type of the
  level shares (catalogue fields, 4.8); never on L1-L23; at most 1 per compartment layer. Count =
  `min(round(items × permille / 1000), eligibleTriples)`; a shortfall is logged in the proof stats, never forced.
- **R-S4** The flag is view data: rules, solver and witness ignore it.

### 1.8 Orphans and winning

- **R-W1** Type t is an **orphan** when `1 <= remaining[t] <= 2`. Orphans arise only after a spend, either at once or
  after a later match of a type that had 6 copies (types are dealt in multiples of 3 and a match removes exactly 3,
  but a spend removes any number: 6 - 2 = 4 copies leave an orphan after the next match).
- **R-W2** **Orphan sweep** is checked after **every** action (2.2 step 4; O(T): is there a t with
  `1 <= remaining[t] <= 2` and `!swept[t]`?). For each such t: all copies in fronts (locked ones too) and on belt cells
  vanish (fade 300 ms, toast "Einzelstücke räumen wir weg" once per level), `swept[t] = 1`, emptied belt cells are
  barred (reason `orphan`), and back-layer copies are dropped on arrival (R-L3). Then reveals run again for fronts the
  sweep emptied. Invariant (tested): after every action no front or belt cell holds a type with `remaining < 3`. The
  HUD "Noch N" shows `matchable`, so hidden orphans never show in it.
- **R-W3** **Win** as soon as `matchable == 0` (normally: no products left). Hidden orphans may remain behind; the
  level counts as solved (owner; WIKI-GM `IsCompleteLevel`). Checked once per action, after resolution, never by polling.
- **R-W4** On win the leftovers (orphans, dark layers, bunnies) fly into a basket at the bottom (60 ms stagger,
  400 ms each), then the clear card.

### 1.9 Free space and stuck (exact)

```
movesPossible(b) =                                                             // stuck fires on !movesPossible
     a bunny lies in an unlocked front or an unbarred appeared belt cell       // collect frees a slot
  || F >= 1 && exists t: c_t + s_t >= 3 && F >= 3 - min(c_t, 3)               // a triple is reachable
  || F >= 3 && Hk > 0                                                          // a front can be emptied to reveal
progressPossible(b) = movesPossible(b)
  || b.bunnies > 0 && stuckTargets(b).length > 0                               // a spend that helps (filter below)
isDeadlocked(b) = !movesPossible(b) && b.bunnies == 0                          // v0.1.0 alias, old tests
```

Proof (extends RESEARCH M11). With one hole, unlocked front items can be permuted arbitrarily (an item can always jump
into the hole; two jumps swap two items), so c_t copies can be gathered in one compartment X with all holes moved
into X; each take consumes one hole, so a triple of t is reachable iff `F >= 3 - c_t` (and F >= 1). Emptying a front of
k items needs `F - (3 - k) >= k`, i.e. `F >= 3`. A take of type u changes `c_u += 1, s_u -= 1, F -= 1`, which leaves
u's condition unchanged and worsens every other type's, so takes alone never create progress. Locks and late belts open
only through matches (or the valve R-K5, which needs a spend first). Hence if `movesPossible` is false, no sequence
of moves and takes can produce a match, reveal or collect; only a spend or the rescue can change the situation, and
that is exactly what the stuck sheet offers, also while she holds a bunny. Cost O(items).

**Stuck filter (`stuckTargets`).** A spend or rescue can leave F unchanged or lower it (the sweep it triggers can empty
another front whose next layer then arrives). So while stuck, a compartment is a legal spend or rescue target only if
a simulated spend on a scratch copy (collect bunnies inside, clear the compartment, sweep, valve, reveals) wins or
leaves `movesPossible` true. At most 10 simulations (one per unlocked compartment with a product), each O(items).
If none qualifies, the sheet hides the bunny buttons and shows "Rückgängig oder Level neu starten". Outside the stuck
state every unlocked compartment with a product is a spend target (free choice). With stacked side cells (Q1) `s_t` counts only stack tops and the test gains one bounded clause
(take a top to expose a twin); the BFS test (8.7) covers both.

**Rack full, nothing matches, per branch:**

| | Entspannt | Gegen die Zeit |
|---|---|---|
| Detection | `!movesPossible` after an action's resolution, also while bunnies > 0 | same |
| Shown | Modal bottom sheet "Kein Platz mehr" over a dimmed board; nothing is recorded | Non-modal banner over the rack; the **clock keeps running** |
| Buttons, in this order | Rückgängig (primary) · "Goldhase einsetzen" if bunnies > 0, else "Rettungshase" (once per level); hidden when `stuckTargets` is empty · Level neu starten | Rückgängig (greyed when the undo stack is empty, e.g. right after a take, R-U2) · Goldhase / Rettungshase (same rule) · Level neu (banks the Serie, 5.1) |

Early warning: when an action other than a match leaves `F == 1`, the last free slot glows amber (two pulses) and,
once per level, the hint "Nur noch 1 Platz frei. Bilde erst einen Dreier." appears (event `warnSpace`).

### 1.10 Undo

- **R-U1** Every model-changing action (move, take, collect, spend, rescue) pushes a snapshot: fronts, backs, locks,
  belt cells (stack, barred), `belts[].appeared`, `swept`, `matches`, `bunnies`, `rescueUsed`, `bunnyEarned`, score,
  levelScore, combo, comboLeftMs, comboMovesLeft, warn flags. `remaining` and `matchable` are recomputed from the
  restored board; the ramp rate follows from the restored `matches`. Cap 300 (oldest dropped).
- **R-U2** Undo restores it exactly. **Relaxed:** an undone take puts the product back into its cell wherever the belt
  is now (bars lift 200 ms). **Timed:** a take is an undo barrier: applying a take clears the undo stack, so undo never
  goes back past a take and the bars stay (owner: from the side shelves "nothing can go back"; the relaxed exception is
  Q6). An undone reveal re-hides the layer (she has seen it; accepted, RESEARCH B2); an undone match removes its
  points; locks re-close; a belt that appeared through the undone match slides out again (300 ms) and the speed ramp
  drops back (`updatePlaybackRate`); bunnies return; types swept by the undone action are un-swept, so their real
  back-layer copies arrive again.
- **R-U3** Undo never rewinds the clock, the belt animation or `moves` (moves only grow). It costs nothing in either branch.
- **R-U4** Undo is unavailable after `cleared` and while a match animation of the last action is still running
  (150 ms guard). The last 20 snapshots are persisted in the run record (a reload keeps short undo).

---

## 2. Rules, action pipeline, tick order, events

### 2.1 Rules

| Id | Rule |
|---|---|
| R1 | Pickable: front items of unlocked compartments; top products of unbarred cells of appeared belts that are at least 50% inside the window at pointerdown or at any moment of the last 150 ms (R21); bunnies (collect only). |
| R2 | A move takes one front item to an empty front slot of a different unlocked compartment; it lands in the slot under the finger if empty, else the nearest empty slot. |
| R3 | A take moves one belt product to an empty front slot of an unlocked compartment (same landing rule); the cell is barred (R-B3). |
| R4 | Drops on the own compartment, a full or locked compartment, a belt or outside spring back in 180 ms (`SPRING_MS`); a belt product flies back to its cell's *current* rect. Not a move, no undo entry, no combo effect. |
| R5 | The model changes only on a validated drop or tap (RESEARCH M5). |
| R6 | Three identical products in one front clear at once (match, `MATCH_MS` 320). Only that compartment is busy during the animation. |
| R7 | Reveal per R-L1..R-L5; order: target compartment, then source, then spend target, then compartments emptied by the sweep. |
| R8 | Locks per R-K1..R-K4. |
| R9 | Belts per R-B1..R-B8. |
| R10 | Bunny per R-G1..R-G5. |
| R11 | Silhouettes per R-S1..R-S4. |
| R12 | Orphans and win per R-W1..R-W4. |
| R13 | `moves += 1` per move, take or spend; collect, rescue grant, undo and hint add 0. |
| R14 | Timed: the clock starts on the first pointerdown on the board after the intro card and any coach mark are closed. |
| R15 | Timed: amber at <= 30 s (silent), red pulse and a tick each second at <= 10 s. |
| R16 | Timed: first time the clock hits 0: card "+30 Sekunden" (free, once per level) or "Serie beenden". Second time: "Zeit abgelaufen", the Serie is banked, the same level restarts (identical board), progress kept. |
| R17 | Timed combo: each match `combo += 1` and refills a 6000 ms window; window empty -> `comboEnd`, `combo = 0`. Undo restores combo and window. |
| R18 | Relaxed combo: each match `combo += 1`, `comboMovesLeft = 3`; each move or take without a match lowers it by 1; 0 -> `comboEnd`. No points. |
| R19 | Combo 5 first reached in a level grants +1 bunny (R-G4). |
| R20 | Belts move only in PLAY. Timed: they start together with the clock (R14), so she cannot study them while the clock stands still. Relaxed: they start when PLAY begins. Pause, overlays, coach marks and a hidden page pause their animations. |
| R21 | Belt hit test: the touch point must lie in the cell rect at pointerdown, inflated by 10 px across the belt axis and by `v_eff × 150 ms × pitch` on the trailing side along the axis (lag compensation). |
| R22 | A belt product being dragged or selected is reserved: it leaves the belt visually at once (pointerdown, no slop wait); its cell shows a faint outline; the model is unchanged until the drop commits. |
| R23 | Tap mode on a belt: the selected product lifts to a still "hand spot" at the belt's inner edge level with the finger and waits there; a tap on a compartment takes it; a tap on it or on empty board cancels (it flies back to its moving cell). |
| R24 | HUD counters (bunnies, "Noch N", lock badges) update on the frame of the event that changed them. |
| R25 | Tipp (relaxed): highlights one input of a winning line from the live state (`solveP`, 25 000 nodes in total, in slices time-boxed to 4 ms with `performance.now()`, about 150 nodes at 25 µs/node, one slice per frame; a hint needs no node-exact determinism); "Kein Weg gefunden: Rückgängig oder neu starten" otherwise, keeping nothing. |
| R26 | Restart is always available and shows the identical board. |
| R27 | Level n of mode m yields the same board, skin and silhouettes on every device and every run. |
| R28 | A coach mark pauses clock and belts; it has one big button "Alles klar" and never auto-dismisses. |
| R29 | Locked compartments and belts are never hint drop targets; belts may be hint sources. |
| R30 | Belt speed changes only at match events (piecewise constant), so `updatePlaybackRate` is exact. |
| R31 | The game never moves a product the player did not touch, except reveals, matches, the orphan sweep, belt motion and the win basket. |
| R32 | No input is lost: a pointerdown during a match animation on another compartment is processed normally. |
| R33 | Score never decreases except through undo of the matches that earned it. |
| R34 | Reduced motion: belts still move (they are the mechanic) with no easing; matches, reveals and the sweep become 150 ms fades; no confetti. |
| R35 | `RULES_VERSION = 2`; a saved run with another version is dropped (timed: its Serie is banked first) with the toast "Neue Spielregeln: Level startet neu". |
| R36 | All randomness is seeded integer RNG (mulberry32, `Math.imul`); no float math in level paths. |

### 2.2 Action pipeline (pure, synchronous, `game.js`; normative order)

```
act(g, action):                              // action ∈ {move, take, collect, spend, rescue}
  if g.status != 'playing' or !legal(action): return []
  pushUndo(g); if action ∈ {move, take, spend}: g.moves += 1; ev = []
  1  apply           -> move | take + bar(take) | collect + bar(collect)? | collect* + spend | bunnyEarned(rescue)
                        timed take: g.undo = [] after apply (undo barrier, R-U2)
  2  match           (move/take only) target holds a triple -> match, combo, score; matches += 1
  3  revealLoop      over [target, source, spend target] until stable -> reveal*, match* (cascade, step 2 rules)
  4  sweepOrphans    after EVERY action, O(T): any t with 1 <= remaining[t] <= 2 && !swept[t]
                     -> sweep, swept[t] = 1, bar(orphan)*, then revealLoop again
  5  thresholds      lockTick* (each still-locked comp, if matches changed), unlock*, beltAppear*, beltSpeed?;
                     then valve R-K5: unlock* / beltAppear* {reason:'starved'}; if anything opened: steps 3-5 again
  6  relaxed combo   no match in this action and action ∈ {move, take}: comboMovesLeft -= 1 -> comboEnd?
  7  combo-5 bunny   -> bunnyEarned {reason:'combo5'}
  8  warnSpace       F == 1 and no match in this action -> warnSpace
  9  win             matchable == 0 -> finishWon -> cleared (bonus collects remaining bunnies)
  10 stuck           else if !movesPossible -> stuck {F, targets: stuckTargets(b), rescueAvailable} (once per distinct
                     board hash); was stuck and now not -> unstuck
  return ev
```

Undo is `undo(g) -> [undo, unstuck?]`; `extend(g)` -> `[extended]`. The event order of every action kind is pinned by
a golden test (8.7). Thresholds run after reveal and sweep (engineering order): a reveal can never change `matches`, so
the order only affects animation, and one threshold pass per action is simpler to test.

### 2.3 Tick order (`SS.game.tick(g, dtMs)`, pure, dt clamped to 100 ms)

```
1 if g.status != 'playing' or !g.started or g.frozen: return []      // frozen = coach mark / overlay
2 g.elapsedMs += dt
3 timed combo: comboLeftMs -= dt; at <= 0 and combo > 0 -> comboEnd, combo = 0
4 timed clock: timeLeftMs -= dt; crossing 30000 -> timeWarn{level:'amber'}; crossing 10000 -> timeWarn{level:'red'}
              <= 0: timeLeftMs = 0; !extended -> status 'timeout', timeout{canExtend:true}
                                    else      -> status 'lost',    timeout{canExtend:false}
5 belts are not in the tick (D8)
```

The app calls `tick` from a 250 ms timer in timed PLAY only. Relaxed never ticks except for `elapsedMs`, which is
computed from timestamps at the clear.

### 2.4 Events (existing names kept; `deadlock` renamed `stuck`)

| Event | Status | Payload | Consumers |
|---|---|---|---|
| move | kept | item, product, from, fromSlot, to, toSlot | board fly, sound drop |
| take | new | item, product, belt, cell, to, toSlot | belts view (reparent), sound drop |
| collect | new | where ('comp'/'belt'), ref, bunnies | fly to counter, sparkle |
| spend | new | comp, removed:[{id, product}], hidden (back-layer products cleared), bunnies | golden burst over the whole compartment |
| match | kept (+cascade flag) | comp, product, items, slots, combo, points, cascade | pop, chime pitch by combo, HUD |
| combo / comboEnd | kept | combo, multiplier | HUD bar or pips, popup |
| score | kept | delta, score | HUD |
| reveal | new | comp, layer:[{id, product, slot, sil}], next:[{product, slot, sil}], depthLeft | dark layer slides forward, new dark layer fades in |
| lockTick | new | comp, left | badge pulse |
| unlock | new | comp, reason ('matches'/'starved') | chains fall, clank |
| bar | new | belt, cell, reason ('take'/'orphan'/'collect') | bars fall |
| sweep | new | products:[t], items:[{id or belt/cell}] | fade, one-time toast |
| beltAppear | new | belt, reason ('matches'/'starved') | slide in, "Nachschub!" |
| beltSpeed | new | belt, rate | `updatePlaybackRate` |
| bunnyEarned | new | reason ('combo5'/'rescue'), bunnies | toast, counter pop |
| warnSpace | new | comp, slot, first | amber glow, one-time hint |
| timeWarn | new | level ('amber'/'red') | HUD colour, tick sound |
| timeout | kept (+canExtend) | canExtend, score | timeout card / Serie card |
| extended | new | addMs | HUD flash |
| stuck | renamed from `deadlock` | F, targets:[ci], rescueAvailable | stuck sheet (relaxed) / banner (timed); bunny buttons only if `targets` is non-empty |
| unstuck | new | - | hide sheet or banner |
| undo | new | changed:{comps:[ci], cells:[[belt, cell]], belts:[{id, appeared, rate}]} | re-render only those; a belt with `appeared: false` slides out (300 ms); `rate` -> `updatePlaybackRate` |
| cleared | kept (extended) | bonus breakdown, stars, badges, leftovers, bunniesCollected, score, levelScore, moves, elapsedMs, timeLeftMs | basket sweep, clear card, records |

---

## 3. Solvability and the proof

### 3.1 What "solvable" means, and why time can be ignored

A level is **solvable** iff a sequence of moves, takes and bunny collects, **without** spend, rescue, undo, hint or
"+30 s", reaches `matchable == 0`. Placed bunnies are part of the board (they occupy slots until collected); the
certificate never spends one. `A(level)` = the state machine of section 1 with every belt replaced by a multiset of
its available products and no clock.

- **Theorem 1 (relaxed).** A level is winnable in play iff `A(level)` has a winning sequence. (⇐) Execute the witness;
  a take of a product in cell k waits until k is in the window, at most one period `Nb / v`, or not at all when
  `v = 0`, because still belts show every cell (R-B5). No rule depends on time. (⇒) Every real play is an A-sequence.
- **Theorem 2 (timed).** Executing the witness at τ seconds per input finishes within
  `τ·|W| + Σ_takes h_b / v_b` seconds, because each take waits at most the hidden arc `h_b = Nb - Wv` of its belt.
  The time limit (4.6) is at least this bound plus 20 s, so a player who follows the certificate at pace τ always
  finishes. Whether a human finds a line that fast is the tuning part (3.6, section 9).
- **Bunny and orphan lemma.** A collect is **not** monotone: collecting the last item of a front empties it, the next
  layer is revealed and up to 3 items arrive, so F can drop by up to 2 compared with leaving the bunny in place. The
  certificate therefore fixes when each collect happens (a collect token at a definite position), and the player can
  always reproduce that timing, because a bunny is collected only when touched (R-G2). A spend only removes items and
  is outside the certificate; after a spend the player may be stuck, and undo restores the certified state (timed:
  only back to the last take, R-U2; otherwise rescue or restart). The sweep only removes types that can never match
  again, so it cannot destroy a solution; the valve R-K5 only opens thresholds that can no longer open by themselves
  and never fires without a spend.

So the proof obligation per level is exactly: **find a witness for `A(level)` and replay it.**

### 3.2 Solver for the full model (`src/game/solver.js`, pure)

State: `front: Int8Array(C*3)` (code + 1, sorted per compartment for keys), `ptr: Int8Array(C)` (layers consumed),
static `layers`, `lockAt: Int8Array(C)`, `pool: Int16Array(T)` (available belt products per type), `later` (belts with
`appearAt > 0` and their counts), `matches`, `left` (= matchable). Key: a 64-bit Zobrist pair in two Int32 halves over
(per open compartment: ptr + sorted front; finished compartments as one sorted multiset; pool counts;
`min(matches, maxPendingThreshold)`). Moves: centre -> centre (front type of unlocked a to unlocked b != a with a hole)
and pool -> centre by **type** (belt products of one type are interchangeable in A, which removes cell branching).
A collect is applied automatically only when it is provably harmless (the bunny's front still holds another item, or
its compartment has no back layers: then it only frees a slot); otherwise it is branched as an ordinary move (ordering
+500). Undo-in-place, no array clones.

```
solveP(s0, nodeBudget, P = 4):                // progress-bounded DFS with dead-state memo (PROTO solveP, extended)
  order moves by score: +1000 completes a triple; +300 pair into a 2-item front; +120 pair; +250 take into a pair;
                        +60/+80 empties a front with layers / without; -60 pollutes a pair; -30 into an empty front;
                        -200 breaks a pair; takes into a compartment without a twin: -150
  prune: !movesPossible (1.9); a take of t only into a compartment holding t, or into an empty compartment when
         no front holds t; no immediate reversal
  rem = progress(match | reveal | unlock | appear) ? P : rem - 1; skip if rem < 0 or memo[key] >= rem
  return { solved: path } | UNKNOWN (budget hit) | UNSOLVABLE (relative to P)
playouts(s0, n, rng):                          // only after UNKNOWN; integer softmax table, no Math.exp
  W = [1000, 607, 368, 223, 135, 82, 50, 30, 18, 11, 7, 4, 2, 1]; weight = W[min(13, (best - score) / 40 | 0)]
verify(level, witness) -> bool                 // replay through the rules (3.4)
```

Soundness: a returned path is replayed before acceptance, so heuristics and pruning can only lower the acceptance
rate, never pass an unsolvable level. Production speed target: <= 10 µs/node on desktop Node, <= 25 µs/node on an
iPhone 12 (PROTO measured 50-70 µs/node with string keys and clones; the speed-up is unproven, hence build step 2b).

### 3.3 Generation: banded deal + gate (`src/game/gen.js`, pure, same code offline and on the phone)

```
generate(mode, n, attemptLimit, nodeBudget, withMetrics):
  k = knobs(mode, n)                                          // section 4
  for a in 0 .. attemptLimit-1:
    rng = SS.rng.create('gen' + GEN_VERSION + '-' + mode + '-' + n + '-' + a)
    L = bandedDeal(k, rng)                                    // 3.3.1
    if !invariants(L): continue                               // G1-G11 (3.3.2)
    r = solveP(compile(L), nodeBudget, 4); if r is UNKNOWN: r = playouts(compile(L), k.playouts, rng)
    if !r.solved: continue
    if !verify(L, r.path): throw new Error('solver/rules mismatch')    // a bug, never expected
    W = withMetrics ? shorten(L, r.path) : r.path            // offline: beam 200 + 31 playouts, shortest verified
    if withMetrics: m = metrics(L, W, rng); if !accept(m, window(mode, n, tag)): continue
    return { level: L, witness: W, attempt: a, par: ceil(1.25 × min(|W|_mt, bestPlayout_mt)) }
  return null
```

`|W|_mt` counts only move and take tokens (a collect costs 0 moves, R13); par, the τ term of the time limit (4.6) and
all metrics use it. Tail levels (`withMetrics = false`) are not shortened, so the phone scales them:
`|W|_mt := ceil(TAIL_W_RATIO × |W_raw|_mt / 1000)` (3.7).

**3.3.1 Banded deal.** Front sizes so that `Σ(3 - front) = F0` (locked compartments full, no front empty); back layer
sizes from the plan (layers 2-3 from "Rück", 4-6 from 1-2); belt cells all filled; total fixed to a multiple of 3 by
+-1 on random back layers (never below 1). Slots are sorted by `layer × 1000 + rng.int(1000) × jitter` (jitter 0.6),
shallow first; the deal sequence is `t1 t1 t1 t2 t2 t2 ...` (types round-robin, extra triples become 6-copy types),
locally shuffled in windows of `Wband` slots (15 to L60, then 4.7) with step `Wband / 2`, so the copies of a type lie
within about two layers. Belt products: every `round(total / beltItems)`-th position of the sequence (with jitter)
goes to the belts, cycling L, R, (H). Bunny: added into a free position of `back[0..2]` (layers 2-4; or a belt cell, timed
idx 2 from L23). Locks: chosen among compartments whose front holds no copy of a type that appears only in locked
compartments. Silhouettes: chosen last by the skin RNG (4.8), never affecting the deal.

**3.3.2 Invariants (`tests/levels.test.js` checks all baked levels).** G1 no front empty at start; G2 every type count
% 3 == 0; G3 no layer is a triple; G4 F0 >= 1 and `movesPossible(start)`; G5 moving belts `Nb >= Wv + 1`, still
belts `Nb == Wv`; G6 locked compartments start full, no bunny inside; G7 bunnies only in `back[0..2]` (layers 2-4) or timed belt
cells, at most one per compartment; G8 depth <= 6, deep layers (4-6) hold 1-2 items; G9 types <= 24; G10 items <= 110
(timed) / 120 (relaxed); G11 silhouettes obey R-S3.

**3.3.3 Acceptance windows** (agent win rate over 40 integer-softmax playouts that see fronts, the dark layer and belts,
no lookahead, no undo; bake only):

| Band | Normal | Schwer | Sehr schwer | Pause / tutorial |
|---|---|---|---|---|
| L1-20 | 85-100% | 70-95% | 55-90% | 95-100% |
| L21-40 | 70-100% | 50-85% | 35-75% | 90-100% |
| L41-60 | 55-90% | 35-70% | 20-55% | 85-100% |
| L61-300 | 45-85% | 25-65% | 12-45% | 80-100% |

Extra feel filters (reject): fewer than 2 starting front pairs with a visible third (front or belt) on Normal, Pause and
tutorial levels; `warnRate` (share of playouts that hit `F == 1` after a take) > 50% before L41; a compartment whose
front and next layer share no type with anything else visible; the bunny in the last layer of the last compartment.
**Relaxation ladder** when 400 attempts find no accepted layout: (1) F0 + 1, (2) every deep-layer count - 1, (3) locks
- 1; each step logged; the build fails after step 3 and prints the knob row.

### 3.4 The proof: three replays per level

1. **Certificate per baked level**, shipped inside `levels-data.js` (needed for the phone check and the timed bot):
   tokens of 3 chars (8.3).
2. **Independent checker** `tests/helpers/replay.js` (<= 150 lines), written from the rules tables of sections 1-2,
   sharing no code with `board.js`, `belts.js` or `solver.js`: every token must be legal, the final state must satisfy
   R-W3, no token may be a spend. `tests/witness.test.js` runs it over all 600 baked levels.
3. **Shipped rules**: the same test replays every witness through `SS.game` (`moveItem`, `collect`) and asserts
   `cleared`, so the shipped rules and the checker agree on every level.
4. **On the phone**: `SS.levels.get(mode, n)` calls `verify(level, witness)` (< 1 ms, 130 tokens x O(C)) before the
   level is shown; baked and generated levels alike. A level without a passing witness is never shown (3.7).
5. **Hash pins**: `tests/levels.test.js` pins sha256 of `levels-data.js` and of the generated tail L301-L303 per mode
   (generated once in `npm test`; the pin already proves determinism), so any change to generation is deliberate (bump
   `GEN_VERSION`). L301-L310 generated twice and the full tail run in `npm run proof`.
6. **Tail proof run** `node scripts/prove-levels.js <mode> 301 1300` (`npm run proof`, not part of `npm test`) recomputes
   exactly what every phone builds, replays every witness and writes `docs/proof/<mode>-301-1300.txt` (certified,
   fallbacks, attempts p50/p95, nodes p50/p90/max, ms, sha256 of all level strings). It also computes the 40-playout
   agent win rate per tag over L301-L1300 and **fails** if a tag's median leaves its L61-300 window (3.3.3) by more
   than +-10 points, reports the step of par and `timeS` from L300 to L301, the casualBot step-cap rate (3.5) and the
   silhouette shortfall (R-S3).

### 3.5 Timed feasibility (second gate)

`casualBot` (pure, in `rules.js`, so `timeLimit` needs no later file) replays the witness order with human timing
**tied to the level**: a rack input (move or collect) takes `max(2000, 1250 × τ(L) / 1000)` ms, a take waits until the
cell is in the middle 60% of the window plus 0.6 s, and 20% detour rack inputs are added (so one witness rack step
costs about 1.5 × τ(L): the casual pace scales with the certificate pace, and `squeeze` shrinks both). It runs over
20 belt start phases (`k / 20` of the period, deterministic). A time passes when >= 90% of runs finish with >= 25% of
the time left (L1-30), >= 20% (L31-60), >= 15% (L61+). **Order (normative):** `timeS0` = the 4.6 formula; then
`+15 s` steps until it passes (max 8); then `clamp(…, Tmin, 540)`. If it still fails after 8 steps the value is
accepted and logged (`timeCapHit`); the proof run reports that rate (target <= 1%, 9.2). O(|W| × 20), so it runs at
runtime inside `timeLimit()` (4.6), never baked.

### 3.6 Budgets (decided; node counts are part of level identity, wall times are estimates)

| Task | Where | Budget |
|---|---|---|
| Bake gate per attempt | Node | 2 000 000 nodes, then 600 playouts; 400 attempts per level |
| Full bake, 2 x 300 levels | Node | <= 20 min cold; cached per (mode, n, GEN_VERSION, knob hash) in `scripts/.cache/` |
| Witness tests (2 checkers x 600 levels) | `npm test` | <= 4 s |
| Tail in `npm test` (L301-L303 per mode, once) | `npm test` | <= 4 s (6 generations at 0.3-0.9 s) |
| `movesPossible` + sweep check + valve | phone, every action | < 0.05 ms |
| `stuckTargets` (only when stuck) | phone | <= 10 simulated spends, < 1 ms |
| `verify` on load | phone | < 1 ms |
| Tipp | phone | 25 000 nodes in total; slices time-boxed to 4 ms (`performance.now()`, about 150 nodes at 25 µs), one per frame |
| Tail gate | phone, background job | `TAIL_ATTEMPTS 12` x `TAIL_NODES 30 000` + 64 playouts each; worst case 360k nodes ≈ 9 s at 25 µs, typically 1-3 attempts |
| Tail job slice | phone | <= 4 ms every 50 ms (`setTimeout`), paused during drags and animations |
| Parse `levels-data.js` (≈ 360 KB, gzip ≈ 120 KB) | phone | < 5 ms |

Build assertion (engineering 3.7): for the L291-L300 knob rows, the runtime gate (12 x 30k, no windows) must certify
within 3 attempts for >= 95% of 200 seeds; otherwise the build lowers the integer constant `TAIL_DEEP_CAP` in
`config.js` (maximum deep-layer items of a tail level, starting at the L300 value) by 1 until it does. `knobs()` reads
only the stored constant, so every device computes identical knobs, and the tail hash pin covers it.

### 3.7 Baked vs runtime, and failure handling

| Range | Source | Phone cost | If it fails |
|---|---|---|---|
| L1-L6 | hand-written boards (`scripts/authored.js`, 4.3), certified like all others | parse + verify | build fails |
| L7-L30 | generator under the hand-set rows of 4.4/4.5, hand-reviewed contact sheets | parse + verify | reroll pinned in `scripts/level-pins.json` |
| L31-L300 | generator under the formulas of 4.7, windows on | parse + verify | relaxation ladder, then build fails |
| L301+ | `generate(mode, n, 12, 30000, false)` on the phone, background job | 1-3 attempts typical | fallback remix |

- **Background job.** While level n is played (n >= 300), `SS.levels.tailJob(mode, n + 1)` runs in slices. The result
  is stored in the run record and in `supermarketSorter.v1.tail` (last 4 per mode) as
  `{ gen: GEN_VERSION, catHash, mode, n, level, witness }` (`catHash` = 32-bit FNV-1a of the ordered `SKIN_POOL_V1`
  ids); entries whose `gen` or `catHash` differ from the running build are dropped on load, so a reload never
  regenerates and an update never serves a stale level. If the player reaches n + 1 first (only after a fresh load deep in the tail), the card
  "Regal wird eingeräumt…" shows a progress bar and the job runs in 12 ms slices per frame.
- **Fallback remix** when all 12 attempts fail: base = baked level `201 + ((n - 301) mod 100)` with the same saw-tooth
  index; seeded integer transform `remix-<mode>-<n>`: type relabel, mirror of the two columns, permutation of rows of
  the 2-column block, swap of top/bottom cap when both exist, belt cell rotation. These maps commute with the rules,
  so the witness is transformed alongside and replayed anyway. Runtime-derived knobs (speed, time, silhouettes, skin)
  follow level n, so even a remix gets harder. CI target: fallback rate <= 2% over L301-L1300.
- **Corrupt data** (a baked witness fails `verify`): the same remix path, a console error, and the soak test fails.
- **Tail difficulty and par.** Tail levels skip the acceptance windows and the feel filters and keep the unshortened
  witness. So that L301 is no step down from L300, par and the τ term use
  `|W|_mt := ceil(TAIL_W_RATIO × |W_raw|_mt / 1000)`, where `TAIL_W_RATIO` (permille, per mode, in `config.js`) =
  the median of `|W_short| / |W_raw|` over L201-L300, measured by `build-levels.js`. Difficulty is held statistically by
  `npm run proof` (median agent win rate per tag within +-10 points of the L61-300 window, 3.4 item 6).
---

## 4. Levels

### 4.1 Structure

- **Saw-tooth** (WIKI-DF: level%10 == 4 Hard, == 9 VeryHard): `idx = (L-1) % 10`; from L10: idx 0 = Pause (from L11),
  idx 4 = Schwer, idx 9 = Sehr schwer, else Normal; L1-L2 Tutorial, L3-L9 Normal. Schwer and Sehr schwer show a red
  "Schwer" badge on the intro card and in the HUD.
- **Shared knob rows L1-L20** in both modes, so every mechanic is taught once and in the same order. L1-L11 are the
  identical boards (seed key `shared`); from L12 the boards are generated per mode (timed belts have `Nb = Wv + 1`,
  relaxed belts stand still with `Nb = Wv`).
- **Diverging from L21:** timed adds belt speed, the in-level ramp (L31), the horizontal belt (L34), less time per
  input; relaxed adds depth (4 layers at L22, 5 at L35, 6 at L50), more locks, more types, confusable pairs, F0 3.
- **Curation:** L1-L6 are hand-written (4.3). L7-L30 come from the generator under the hand-set rows below; the build
  writes contact sheets `docs/preview/levels/<mode>-<n>.png` (UI screenshot harness) and any level can be pinned to an
  attempt number in `scripts/level-pins.json` (`{ "relaxed-17": 4 }`). L31-L300 follow the formulas of 4.7 with
  acceptance windows; L301+ run the same formulas on the phone (3.7).

**Mechanic introductions** (never on a Schwer or Sehr schwer level; one new thing per level):

| Level | Both modes | Timed only | Relaxed only |
|---|---|---|---|
| L1 | drag, three alike clear | | |
| L2 | tap-tap, Rückgängig | | |
| L3 | dark next layer, reveal | | |
| L6 | golden bunny: collect, spend | | |
| L7 | lock | | |
| L8 | third layer (count pips only if "Tiefe anzeigen" is on) | | |
| L12 | side shelves (take-only, bars) | moving at 0.20 cells/s | standing still |
| L22 | | | fourth layer |
| L23 | | bunny on a belt ("schnapp ihn") | |
| L24 | silhouette items (exactly 2) | | |
| L31 | | in-level speed ramp (no coach mark) | |
| L34 | | horizontal belt, appears after 50% of the matches | |
| L35 / L50 | | | fifth / sixth layer (on Schwer / Sehr schwer, already known mechanic: depth) |
| L41 | | | drifting shelves 0.08 cells/s |

### 4.2 Knob columns

| Column | Meaning |
|---|---|
| Rack | shape (1.2) |
| F0 | empty front slots of unlocked compartments at start |
| Ebenen-Plan | `Lk×n` = n compartments have a layer k (layer 1 = front; `L2×10 L3×4` = all 10 have a next layer, 4 a third) |
| Rück | size range of layers 2-3; layers 4-6 always 1-2 |
| Schlösser | `k×Nn` = k locks with counters n, n+1, ... |
| Seite Nb/Wv | cells per side belt / visible cells |
| v | side belt speed in cells/s (runtime, 4.6); `+` = in-level ramp |
| Horiz. | horizontal belt: `Start`, or appears after that share of the level's matches (`appearAt = floor(share × totalMatches)`, `totalMatches` per 1.1) |
| Typen | distinct product types (types < triples means some types have 6 copies) |
| Hase | placed bunnies; `1 Band` = on a belt cell |
| Silh. | silhouette items (4.8) |
| Items | products in rack + belts (multiple of 3; generator target +-3) |
| Zeit≈ / Par≈ | estimates with `|W| ≈ items × (0.75 + 0.12 × (depth - 1))`; the real values come from the witness |

### 4.3 Authored L1-L6 (exact boards; compartments in index order, layers front/next/... separated by `/`, `.` hole, `*` bunny)

| L | Shape | Rack | Items / types / F0 | Teaches |
|---|---|---|---|---|
| 1 | A4 | `AB.` `BA.` `CAB` `CC.` | 9 / 3 / 3 | Drag; the coach hand moves C from compartment 2 into compartment 3: instant triple |
| 2 | A5 | cap `AB.` ; `CDA` `BC.` `DCB` `A.D` | 12 / 4 / 3 | Tap product, tap compartment; "Rückgängig" pulses once after the first move |
| 3 | A6 | `AB./CD.` `BCA` `DA./B..` `C.D` `EE.` `E..` | 15 / 5 / 6 | Dark row: "Ist die vordere Reihe leer, rückt die dunkle nach vorn" |
| 4 | A6 | `AB./CD.` `CAE/F..` `BFG` `DE./G.A` `FG.` `EBC/D..` | 21 / 7 / 3 | Practice; emptying compartment 3 brings the third A |
| 5 | A7 | cap `ABC/DE.` ; `DF./GA.` `EGH/I..` `BI./FC.` `HAD` `CE./HB.` `FGI` | 27 / 9 / 3 | First full-size board, no pressure |
| 6 | A7 | cap `AB./CD.` ; `EFA/G..` `HCI` `DE./ID*` `BGF/H..` `GI./AE.` `FHC/B..` | 27 / 9 / 3 + bunny | Empty compartment 3: the bunny arrives; tap it, then spend it |

The strings in `scripts/authored.js` are the truth; the witness tests cover them like every other level.

### 4.4 "Gegen die Zeit" (timed), L1-L60

| L | Tag | Rack | F0 | Ebenen-Plan | Rück | Schlösser | Seite Nb/Wv | v | Horiz. | Typen | Hase | Silh. | Items | Zeit≈ |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Tut | A4 | 3 | - | - | - | - | - | - | 3 | - | - | 9 | 2:00 |
| 2 | Tut | A5 | 3 | - | - | - | - | - | - | 4 | - | - | 12 | 2:00 |
| 3 | Normal | A6 | 6 | L2×2 | 1-2 | - | - | - | - | 5 | - | - | 15 | 2:00 |
| 4 | Normal | A6 | 3 | L2×4 | 1-2 | - | - | - | - | 7 | - | - | 21 | 2:05 |
| 5 | Normal | A7 | 3 | L2×5 | 1-2 | - | - | - | - | 9 | - | - | 27 | 2:30 |
| 6 | Normal | A7 | 3 | L2×6 | 1-2 | - | - | - | - | 9 | 1 | - | 27 | 2:25 |
| 7 | Normal | A8 | 3 | L2×6 | 1-2 | 1×N2 | - | - | - | 10 | - | - | 30 | 2:40 |
| 8 | Normal | A8 | 3 | L2×6 L3×2 | 1-2 | - | - | - | - | 11 | - | - | 33 | 3:10 |
| 9 | Normal | A8 | 4 | L2×5 | 1-2 | - | - | - | - | 9 | - | - | 27 | 2:25 |
| 10 | S.schwer | A9 | 3 | L2×9 L3×3 | 1-3 | - | - | - | - | 11 | 1 | - | 48 | 3:25 |
| 11 | Pause | A8 | 4 | L2×6 | 1-2 | - | - | - | - | 10 | - | - | 30 | 2:00 |
| 12 | Normal | A8 | 4 | L2×6 | 1-2 | - | 7/6 | 0.20 | - | 11 | - | - | 42 | 3:25 |
| 13 | Normal | A8 | 4 | L2×8 | 1-2 | 1×N3 | 7/6 | 0.20 | - | 12 | - | - | 45 | 3:30 |
| 14 | Normal | A9 | 4 | L2×9 | 1-2 | - | 7/6 | 0.20 | - | 12 | - | - | 51 | 3:45 |
| 15 | Schwer | A9 | 4 | L2×9 L3×3 | 1-3 | - | 7/6 | 0.20 | - | 12 | 1 | - | 60 | 4:55 |
| 16 | Normal | A8 | 4 | L2×8 L3×2 | 1-2 | 1×N3 | 7/6 | 0.20 | - | 12 | - | - | 48 | 3:55 |
| 17 | Normal | A9 | 4 | L2×9 L3×3 | 1-2 | - | 7/6 | 0.20 | - | 13 | - | - | 54 | 4:10 |
| 18 | Normal | A9 | 4 | L2×9 L3×3 | 1-2 | 1×N3 | 7/6 | 0.20 | - | 13 | - | - | 54 | 4:05 |
| 19 | Normal | A9 | 4 | L2×9 L3×4 | 1-2 | - | 7/6 | 0.20 | - | 13 | - | - | 57 | 4:15 |
| 20 | S.schwer | A10 | 4 | L2×10 L3×5 | 2-3 | - | 9/8 | 0.20 | - | 14 | 1 | - | 81 | 6:45 |
| 21 | Pause | A9 | 5 | L2×9 | 1-2 | - | 7/6 | 0.21 | - | 11 | - | - | 51 | 3:55 |
| 22 | Normal | A9 | 5 | L2×9 L3×3 | 1-2 | 1×N3 | 7/6 | 0.22 | - | 12 | - | - | 54 | 3:55 |
| 23 | Normal | A9 | 5 | L2×9 L3×3 | 1-2 | 1×N3 | 7/6 | 0.23 | - | 12 | 1 Band | - | 54 | 3:50 |
| 24 | Normal | A9 | 5 | L2×9 L3×3 | 1-2 | 1×N3 | 7/6 | 0.24 | - | 12 | - | 2 St. | 54 | 3:45 |
| 25 | Schwer | A10 | 5 | L2×10 L3×3 | 1-3 | - | 9/8 | 0.25 | - | 12 | 1 | 2.0% | 69 | 5:05 |
| 26 | Normal | A9 | 5 | L2×9 L3×3 | 1-2 | 1×N3 | 7/6 | 0.26 | - | 12 | - | 2.1% | 54 | 3:40 |
| 27 | Normal | A9 | 5 | L2×9 L3×3 | 1-2 | 1×N3 | 7/6 | 0.27 | - | 12 | - | 2.2% | 54 | 3:35 |
| 28 | Normal | A9 | 5 | L2×9 L3×3 | 1-2 | 1×N3 | 7/6 | 0.28 | - | 12 | - | 2.3% | 54 | 3:30 |
| 29 | Normal | A9 | 5 | L2×9 L3×3 | 1-2 | 1×N3 | 7/6 | 0.29 | - | 12 | - | 2.4% | 54 | 3:30 |
| 30 | S.schwer | A10 | 5 | L2×10 L3×4 | 2-3 | - | 9/8 | 0.35 | - | 14 | 1 | 2.5% | 78 | 5:25 |
| 31 | Pause | A9 | 5 | L2×9 | 1-2 | - | 7/6 | 0.31+ | - | 12 | - | 1.3% | 51 | 3:15 |
| 32 | Normal | A9 | 5 | L2×9 L3×4 | 1-2 | 1×N3 | 7/6 | 0.32+ | - | 13 | - | 2.7% | 57 | 3:25 |
| 33 | Normal | A9 | 5 | L2×9 L3×4 | 1-2 | 1×N3 | 7/6 | 0.33+ | - | 13 | 1 Band | 2.8% | 57 | 3:25 |
| 34 | Normal | A9 | 5 | L2×9 L3×4 | 1-2 | 1×N3 | 7/6 | 0.34+ | 50% | 13 | - | 2.9% | 63 | 5:00 |
| 35 | Schwer | A10 | 5 | L2×10 L3×5 | 1-3 | - | 9/8 | 0.35+ | 40% | 13 | 1 | 3.0% | 81 | 6:25 |
| 36 | Normal | A9 | 5 | L2×9 L3×4 | 1-2 | 1×N3 | 7/6 | 0.36+ | - | 13 | - | 3.1% | 57 | 3:15 |
| 37 | Normal | A9 | 5 | L2×9 L3×4 | 1-2 | 1×N3 | 7/6 | 0.37+ | - | 13 | - | 3.2% | 57 | 3:10 |
| 38 | Normal | A9 | 5 | L2×9 L3×4 | 1-2 | 1×N3 | 7/6 | 0.38+ | - | 13 | - | 3.3% | 57 | 3:10 |
| 39 | Normal | A9 | 5 | L2×9 L3×4 | 1-2 | 1×N3 | 7/6 | 0.39+ | - | 13 | - | 3.4% | 57 | 3:05 |
| 40 | S.schwer | A10 | 5 | L2×10 L3×6 | 2-3 | - | 9/8 | 0.45+ | Start | 14 | 1 | 3.5% | 90 | 6:35 |
| 41 | Pause | A9 | 5 | L2×9 | 1-2 | - | 8/6 | 0.41+ | - | 13 | - | 1.8% | 51 | 3:40 |
| 42 | Normal | A10 | 4 | L2×10 L3×7 | 1-2 | 2×N4 | 10/8 | 0.42+ | - | 14 | - | 3.7% | 72 | 4:30 |
| 43 | Normal | A10 | 4 | L2×10 L3×7 | 1-2 | 2×N4 | 10/8 | 0.43+ | - | 14 | 1 Band | 3.8% | 72 | 4:30 |
| 44 | Normal | A10 | 4 | L2×10 L3×7 | 1-2 | 2×N4 | 10/8 | 0.44+ | - | 14 | - | 3.9% | 72 | 4:25 |
| 45 | Schwer | A10 | 4 | L2×10 L3×7 L4×2 | 1-3 | - | 10/8 | 0.45+ | 40% | 14 | 1 | 4.0% | 90 | 7:05 |
| 46 | Normal | A10 | 4 | L2×10 L3×7 | 1-2 | 2×N4 | 10/8 | 0.46+ | - | 14 | - | 4.1% | 72 | 4:15 |
| 47 | Normal | A10 | 4 | L2×10 L3×8 | 1-2 | 2×N4 | 10/8 | 0.47+ | - | 14 | - | 4.2% | 72 | 4:10 |
| 48 | Normal | A10 | 4 | L2×10 L3×8 | 1-2 | 2×N4 | 10/8 | 0.48+ | - | 14 | - | 4.3% | 72 | 4:10 |
| 49 | Normal | A10 | 4 | L2×10 L3×8 | 1-2 | 2×N4 | 10/8 | 0.49+ | - | 14 | - | 4.4% | 72 | 4:05 |
| 50 | S.schwer | A10 | 4 | L2×10 L3×8 L4×2 | 2-3 | - | 10/8 | 0.55+ | Start | 15 | 1 | 4.5% | 102 | 7:20 |
| 51 | Pause | A9 | 5 | L2×9 | 1-2 | - | 8/6 | 0.51+ | - | 14 | - | 2.3% | 51 | 3:05 |
| 52 | Normal | A10 | 4 | L2×10 L3×9 | 1-2 | 2×N4 | 10/8 | 0.52+ | - | 15 | - | 4.7% | 75 | 4:00 |
| 53 | Normal | A10 | 4 | L2×10 L3×9 | 1-2 | 2×N4 | 10/8 | 0.53+ | - | 15 | 1 Band | 4.8% | 75 | 3:55 |
| 54 | Normal | A10 | 4 | L2×10 L3×9 | 1-2 | 2×N4 | 10/8 | 0.54+ | - | 15 | - | 4.9% | 75 | 3:50 |
| 55 | Schwer | A10 | 4 | L2×10 L3×9 L4×3 | 1-3 | - | 10/8 | 0.55+ | 40% | 15 | 1 | 5.0% | 96 | 6:15 |
| 56 | Normal | A10 | 4 | L2×10 L3×9 | 1-2 | 2×N4 | 10/8 | 0.56+ | - | 15 | - | 5.1% | 75 | 3:50 |
| 57 | Normal | A10 | 4 | L2×10 L3×10 | 1-2 | 2×N4 | 10/8 | 0.57+ | - | 15 | - | 5.2% | 75 | 3:45 |
| 58 | Normal | A10 | 4 | L2×10 L3×10 | 1-2 | 2×N4 | 10/8 | 0.58+ | - | 15 | - | 5.3% | 75 | 3:45 |
| 59 | Normal | A10 | 4 | L2×10 L3×10 | 1-2 | 2×N4 | 10/8 | 0.59+ | - | 15 | - | 5.4% | 75 | 3:45 |
| 60 | S.schwer | A10 | 4 | L2×10 L3×9 L4×2 | 2-3 | - | 10/8 | 0.65+ | Start | 16 | 1 | 5.5% | 105 | 6:45 |

Timed notes: Normal levels stay at 54-78 items while τ falls and belts speed up, so their clock falls from about 4:15 (L19) to 3:45 (L59); Schwer and Sehr schwer sit at 5:00-7:20. Bunnies: Schwer, Sehr schwer, and idx 2 from L23 on a belt. Locks never on Pause/Schwer/Sehr schwer. Confusable pairs: 1 from L31, 2 from L61.

### 4.5 "Entspannt" (relaxed), L1-L60

| L | Tag | Rack | F0 | Ebenen-Plan | Rück | Schlösser | Seite Nb/Wv | v | Typen | Hase | Silh. | Items | Par≈ |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Tut | A4 | 3 | - | - | - | - | - | 3 | - | - | 9 | 9 |
| 2 | Tut | A5 | 3 | - | - | - | - | - | 4 | - | - | 12 | 12 |
| 3 | Normal | A6 | 6 | L2×2 | 1-2 | - | - | - | 5 | - | - | 15 | 17 |
| 4 | Normal | A6 | 3 | L2×4 | 1-2 | - | - | - | 7 | - | - | 21 | 23 |
| 5 | Normal | A7 | 3 | L2×5 | 1-2 | - | - | - | 9 | - | - | 27 | 30 |
| 6 | Normal | A7 | 3 | L2×6 | 1-2 | - | - | - | 9 | 1 | - | 27 | 30 |
| 7 | Normal | A8 | 3 | L2×6 | 1-2 | 1×N2 | - | - | 10 | - | - | 30 | 33 |
| 8 | Normal | A8 | 3 | L2×6 L3×2 | 1-2 | - | - | - | 11 | - | - | 33 | 41 |
| 9 | Normal | A8 | 4 | L2×5 | 1-2 | - | - | - | 9 | - | - | 27 | 30 |
| 10 | S.schwer | A9 | 3 | L2×9 L3×3 | 1-3 | - | - | - | 11 | 1 | - | 48 | 60 |
| 11 | Pause | A8 | 4 | L2×6 | 1-2 | - | - | - | 10 | - | - | 30 | 33 |
| 12 | Normal | A8 | 4 | L2×6 | 1-2 | - | 6/6 | 0.00 | 11 | - | - | 42 | 46 |
| 13 | Normal | A8 | 4 | L2×8 | 1-2 | 1×N3 | 6/6 | 0.00 | 12 | - | - | 45 | 49 |
| 14 | Normal | A9 | 4 | L2×9 | 1-2 | - | 6/6 | 0.00 | 12 | - | - | 48 | 53 |
| 15 | Schwer | A9 | 4 | L2×9 L3×3 | 1-3 | - | 6/6 | 0.00 | 12 | 1 | - | 60 | 75 |
| 16 | Normal | A8 | 4 | L2×8 L3×2 | 1-2 | 1×N3 | 6/6 | 0.00 | 12 | - | - | 48 | 60 |
| 17 | Normal | A9 | 4 | L2×9 L3×3 | 1-2 | - | 6/6 | 0.00 | 13 | - | - | 54 | 67 |
| 18 | Normal | A9 | 4 | L2×9 L3×3 | 1-2 | 1×N3 | 6/6 | 0.00 | 13 | - | - | 54 | 67 |
| 19 | Normal | A9 | 4 | L2×9 L3×4 | 1-2 | - | 6/6 | 0.00 | 13 | - | - | 54 | 67 |
| 20 | S.schwer | A10 | 4 | L2×10 L3×5 | 2-3 | - | 8/8 | 0.00 | 14 | 1 | - | 81 | 101 |
| 21 | Pause | A10 | 4 | L2×10 L3×4 | 1-2 | - | 8/8 | 0.00 | 14 | - | - | 63 | 78 |
| 22 | Normal | A10 | 3 | L2×10 L3×4 L4×2 | 1-2 | 2×N3 | 8/8 | 0.00 | 14 | - | - | 66 | 92 |
| 23 | Normal | A10 | 3 | L2×10 L3×4 L4×2 | 1-2 | 2×N3 | 8/8 | 0.00 | 14 | - | - | 66 | 92 |
| 24 | Normal | A10 | 3 | L2×10 L3×4 L4×2 | 1-2 | 2×N3 | 8/8 | 0.00 | 14 | - | 2 St. | 66 | 92 |
| 25 | Schwer | A10 | 3 | L2×10 L3×5 L4×2 | 1-3 | - | 8/8 | 0.00 | 15 | 1 | 2.0% | 75 | 105 |
| 26 | Normal | A10 | 3 | L2×10 L3×5 L4×2 | 1-2 | 2×N3 | 8/8 | 0.00 | 15 | - | 2.1% | 69 | 96 |
| 27 | Normal | A10 | 3 | L2×10 L3×5 L4×3 | 1-2 | 2×N3 | 8/8 | 0.00 | 15 | - | 2.2% | 69 | 96 |
| 28 | Normal | A10 | 3 | L2×10 L3×5 L4×3 | 1-2 | 2×N3 | 8/8 | 0.00 | 15 | - | 2.3% | 69 | 96 |
| 29 | Normal | A10 | 3 | L2×10 L3×6 L4×3 | 1-2 | 2×N3 | 8/8 | 0.00 | 15 | - | 2.4% | 72 | 100 |
| 30 | S.schwer | A10 | 3 | L2×10 L3×6 L4×3 | 2-3 | - | 8/8 | 0.00 | 16 | 1 | 2.5% | 87 | 121 |
| 31 | Pause | A10 | 4 | L2×10 L3×4 | 1-2 | - | 8/8 | 0.00 | 14 | - | 1.3% | 63 | 78 |
| 32 | Normal | A10 | 3 | L2×10 L3×6 L4×3 | 1-2 | 2×N4 | 8/8 | 0.00 | 16 | - | 2.7% | 72 | 100 |
| 33 | Normal | A10 | 3 | L2×10 L3×7 L4×4 | 1-2 | 2×N4 | 8/8 | 0.00 | 16 | - | 2.8% | 75 | 105 |
| 34 | Normal | A10 | 3 | L2×10 L3×7 L4×4 | 1-2 | 2×N4 | 8/8 | 0.00 | 16 | - | 2.9% | 75 | 105 |
| 35 | Schwer | A10 | 3 | L2×10 L3×7 L4×4 L5×1 | 1-3 | - | 8/8 | 0.00 | 17 | 1 | 3.0% | 84 | 130 |
| 36 | Normal | A10 | 3 | L2×10 L3×7 L4×4 | 1-2 | 2×N4 | 8/8 | 0.00 | 17 | - | 3.1% | 75 | 105 |
| 37 | Normal | A10 | 3 | L2×10 L3×8 L4×4 | 1-2 | 2×N4 | 8/8 | 0.00 | 17 | - | 3.2% | 75 | 105 |
| 38 | Normal | A10 | 3 | L2×10 L3×8 L4×4 | 1-2 | 2×N4 | 8/8 | 0.00 | 17 | - | 3.3% | 75 | 105 |
| 39 | Normal | A10 | 3 | L2×10 L3×8 L4×5 | 1-2 | 2×N4 | 8/8 | 0.00 | 17 | - | 3.4% | 78 | 109 |
| 40 | S.schwer | A10 | 3 | L2×10 L3×8 L4×5 L5×1 | 2-3 | - | 8/8 | 0.00 | 18 | 1 | 3.5% | 96 | 148 |
| 41 | Pause | A10 | 4 | L2×10 L3×4 | 1-2 | - | 9/8 | 0.08 | 16 | - | 1.8% | 66 | 82 |
| 42 | Normal | A10 | 3 | L2×10 L3×9 L4×5 L5×2 | 1-2 | 3×N4 | 9/8 | 0.08 | 18 | - | 3.7% | 84 | 130 |
| 43 | Normal | A10 | 3 | L2×10 L3×9 L4×5 L5×2 | 1-2 | 3×N4 | 9/8 | 0.08 | 18 | - | 3.8% | 84 | 130 |
| 44 | Normal | A10 | 3 | L2×10 L3×9 L4×5 L5×2 | 1-2 | 3×N4 | 9/8 | 0.08 | 18 | - | 3.9% | 84 | 130 |
| 45 | Schwer | A10 | 3 | L2×10 L3×10 L4×6 L5×2 | 1-3 | - | 9/8 | 0.08 | 19 | 1 | 4.0% | 96 | 148 |
| 46 | Normal | A10 | 3 | L2×10 L3×10 L4×6 L5×2 | 1-2 | 3×N4 | 9/8 | 0.08 | 19 | - | 4.1% | 87 | 134 |
| 47 | Normal | A10 | 3 | L2×10 L3×10 L4×6 L5×2 | 1-2 | 3×N4 | 9/8 | 0.08 | 19 | - | 4.2% | 87 | 134 |
| 48 | Normal | A10 | 3 | L2×10 L3×10 L4×6 L5×2 | 1-2 | 3×N4 | 9/8 | 0.08 | 19 | - | 4.3% | 87 | 134 |
| 49 | Normal | A10 | 3 | L2×10 L3×10 L4×6 L5×2 | 1-2 | 3×N4 | 9/8 | 0.08 | 19 | - | 4.4% | 87 | 134 |
| 50 | S.schwer | A10 | 3 | L2×10 L3×10 L4×6 L5×2 L6×2 | 2-3 | - | 9/8 | 0.08 | 20 | 1 | 4.5% | 111 | 188 |
| 51 | Pause | A10 | 4 | L2×10 L3×5 | 1-2 | - | 9/8 | 0.08 | 18 | - | 2.3% | 66 | 82 |
| 52 | Normal | A10 | 3 | L2×10 L3×10 L4×7 L5×3 | 1-2 | 3×N5 | 9/8 | 0.08 | 20 | - | 4.7% | 90 | 139 |
| 53 | Normal | A10 | 3 | L2×10 L3×10 L4×7 L5×3 | 1-2 | 3×N5 | 9/8 | 0.08 | 20 | - | 4.8% | 90 | 139 |
| 54 | Normal | A10 | 3 | L2×10 L3×10 L4×7 L5×3 | 1-2 | 3×N5 | 9/8 | 0.08 | 20 | - | 4.9% | 90 | 139 |
| 55 | Schwer | A10 | 3 | L2×10 L3×10 L4×7 L5×3 L6×1 | 1-3 | - | 9/8 | 0.08 | 21 | 1 | 5.0% | 102 | 173 |
| 56 | Normal | A10 | 3 | L2×10 L3×10 L4×8 L5×3 L6×1 | 1-2 | 3×N5 | 9/8 | 0.08 | 21 | - | 5.1% | 93 | 157 |
| 57 | Normal | A10 | 3 | L2×10 L3×10 L4×8 L5×3 L6×1 | 1-2 | 3×N5 | 9/8 | 0.08 | 21 | - | 5.2% | 93 | 157 |
| 58 | Normal | A10 | 3 | L2×10 L3×10 L4×8 L5×3 L6×1 | 1-2 | 3×N5 | 9/8 | 0.08 | 21 | - | 5.3% | 93 | 157 |
| 59 | Normal | A10 | 3 | L2×10 L3×10 L4×8 L5×3 L6×1 | 1-2 | 3×N5 | 9/8 | 0.08 | 21 | - | 5.4% | 93 | 157 |
| 60 | S.schwer | A10 | 3 | L2×10 L3×10 L4×8 L5×3 L6×2 | 2-3 | - | 9/8 | 0.08 | 22 | 1 | 5.5% | 114 | 193 |

Relaxed notes: depth reaches 6 at L50 (Sehr schwer), L55 (Schwer) and every Normal from L56, with sparse deep layers; F0 never below 3; at most 114 items (cap 120); belts still until L40 (`v` 0.00 = standing). Confusable pairs: 1 from L21, 2 from L31, 3 from L46. Par (shown "Züge 23 / 31") is baked from the witness: `ceil(1.25 × min(|W|_mt, best playout_mt))` (move and take tokens only, 3.3).

### 4.6 Runtime-derived knobs (`rules.js`; never baked, so they retune without a rebake)

Integer arithmetic: speeds in centi-cells/s, factors in permille, times in ms; `floor` = integer division.

```
squeeze(L)  = L <= 150 ? 1000 : 1000 - floor(150 × (L-150) / (L-150+300))        // permille, -> 850, never reached
τ(L)        = max(1800, 3400 - 30 × (L-1)) × squeeze(L) / 1000                      // ms per witness input
waits       = Σ over belts b: items_b × h_b × 100 / v100_b                          // seconds, Theorem 2 bound
m(tag)      = L <= 9 ? 1500 : Pause 1100 | Normal 1000 | Schwer 1100 | Sehr schwer 1200
timeS0      = 5 × ceil(((τ(L) × |W|_mt + 500 × collects) / 1000 + waits + 20) × m / 1000 / 5)   // |W|_mt: move + take tokens
timeS       = clamp(casualBotSteps(timeS0), Tmin, 540), Tmin = L <= 20 ? 120 : 90       // 3.5: +15 s steps, max 8, then clamp
              tail (L301+): |W|_mt := ceil(TAIL_W_RATIO × |W_raw|_mt / 1000) (3.7)
timed v100  = L < 12 ? none : L <= 20 ? 20 : L <= 100 ? min(100, 20 + (L-20)) + (Sehr schwer ? 5 : 0)
              : 100 + floor(40 × (L-100) / (L-100+400))                              // -> 140
H belt      = 80% of v100, moving left; Nb 8, Wv 5, so h_H = 3 always (the side-belt h below does not apply)
ramp        = timed L >= 31: v_eff = v × (1000 + 300 × matches / totalMatches) / 1000, applied at match events
h (hidden)  = side belts, timed: L <= 40 ? 1 : L <= 80 ? 2 : 3 ; relaxed moving: 1 ; still: 0
relaxed v100= L < 41 ? 0 : L <= 100 ? 8 : 8 + floor(4 × (L-100) / (L-100+300))      // -> 12; setting forces 0
```

Sanity against the owner's example, with the final rule (formula, casualBot steps, clamp): a Lv.513-like Sehr schwer
board (A10, 108 items, depth 4, |W|_mt ≈ 120 of which 30 takes, 1 collect; side belts 2 x 11 cells at 1.20 cells/s with
h 3; H belt 8 cells at 0.96 cells/s with h_H 3).
- `squeeze(513) = 1000 - floor(150 × 363 / 663) = 918`, `τ = 1800 × 918 / 1000 = 1652 ms`.
- `waits = 2 × 11 × 3 / 1.20 + 8 × 3 / 0.96 = 55 + 25 = 80 s`.
- `timeS0 = 5 × ceil((198.2 + 0.5 + 80 + 20) × 1.2 / 5) = 360 s`.
- casualBot: rack input `max(2000, 1.25 × 1652) = 2065 ms`; 90 rack inputs + 18 detours = 223 s; 30 takes at about
  2.1 s average (wait for the middle 60% + 0.6 s) = 63 s; about 286 s, 90th percentile over 20 phases about 296 s,
  i.e. 18% left >= 15%: no step. Result **6:00**.
- The same board tagged Normal (m = 1.0): `timeS0 = 300 s`; the bot needs `296 / 0.85 = 349 s`, so 4 steps:
  **6:00** as well. Both are far from the 540 s clamp and the 8-step cap.

### 4.7 Formulas for L61+ (baked to L300, generated after; same code)

```
tag, idx as 4.1; band(L) = floor((L-61) / 20)
TIMED (cap 110 items):
  shape      A10 (Pause A9)            F0   Normal 4 (3 from L121), Pause 5, Schwer/Sehr schwer 4
  plan       Normal L2×10 L3×10 L4×min(6, 1+band); Schwer +L4×2 (Rück 1-3); Sehr schwer +L4×2 (Rück 2-3); Pause L2×9
  depth max  4; 5 on Sehr schwer from L121 (+ L5×2); 6 on Sehr schwer from L201 (+ L5×2 L6×1, layers 5-6 hold 1-2
             items, trimmed from L4 to stay <= 110 items) (0.2)
  locks      Normal 2×N4 (2×N5 from L121); never on Pause/Schwer/Sehr schwer
  side belts Nb = 8 + h(L), Wv 8
  H belt     Sehr schwer: Start; Schwer: after 40%; Normal idx 2 and 7: after 50% (L61-100); every Normal from L101: after 50%
  types      min(18, 16 + floor((L-61)/40)); confusable pairs 2 (L61), 3 (L151)
  bunny      Schwer, Sehr schwer (back[0..2]), idx 2 (belt cell)
RELAXED (cap 120 items, trimmed from the deepest layer):
  shape      A10                       F0   3 (Pause 4)
  plan       Normal L2×10 L3×10 L4×min(10, 8+band) L5×min(8, 3+band) L6×min(6, 1+floor((L-61)/30));
             Schwer: Normal + L6×1, Rück 1-3; Sehr schwer: Normal + L6×2, Rück 2-3; Pause L2×10 L3×5
  locks      Normal 3×N(min(6, 5 + floor((L-61)/40))); never on Pause/Schwer/Sehr schwer
  side belts Nb = 9, Wv 8 (still when the setting is on)
  types      min(24, 22 + floor((L-61)/50)); confusable pairs 3 (L61), 4 (L101)
  bunny      Schwer and Sehr schwer, back[0..2]
BOTH:
  Wband      15 (L <= 60), else 15 + floor(9 × (L-60) / (L-60+200))                 // copies spread wider, -> 24
  silhouettes permille: L < 24: 0; L24: exactly 2 items; L25-60: 20 + (L-25); L > 60: 55 + floor(195 × (L-60) / (L-60+300))  // -> 250
              Pause levels: half
  breather   previous block's Normal minus one layer, F0 + 1, no locks, no H belt
```

**Why this keeps getting harder forever (D28):** past the structural caps (timed about L180, relaxed about L140) five
integer asymptotes keep rising every level: `squeeze` (time per input, -> 85%), timed belt speed (-> 1.40 cells/s),
silhouette share (-> 25%), band width `Wband` (-> 24, so copies of a type lie further apart), and confusable pairs.
None reaches its limit, so level n + 1 is never easier in structure-of-tag than level n. Because casualBot is tied to
τ(L) (3.5), `squeeze` shrinks the bot's time too, so the time limit really falls instead of being set by fixed bot
steps. Infinite novelty also comes from the per-level product skin.

### 4.8 Product skin, confusable pairs, silhouette colours

- **Skin:** type code -> product id by a seeded pick (`skin-<mode>-<n>`, integer RNG) from the frozen, ordered list
  `SKIN_POOL_V1` (the 180 product ids as of v0.2.0, in `config.js`, not `SS.catalog` order; products added later join
  only a `SKIN_POOL_V2` together with a `GEN_VERSION` bump, so a new product never reskins existing levels). L1-L9: no two products of the same colour family. A **confusable pair** = two products of the same
  `cls` whose colours are within 30° hue; the skin places exactly the number the tables ask for.
- **Hue family** = `floor(hue / 30)` (12 families, from the catalogue `color`); a colour is **achromatic**, its own
  13th family, when saturation < 0.15 or lightness > 0.92 or < 0.08 (e.g. the 11 white `#FFFFFF` products).
  `scripts/build-catalog.js` writes `hueFamily` per product. Skins are part of
  level identity (R27). The board keeps product ids as item `type` (v0.1.0 semantics unchanged).
- **Silhouette selection:** after the skin, the RNG picks `min(round(items × permille / 1000), eligibleTriples)`
  silhouette positions among eligible items (R-S3: one per eligible triple); the shortfall is logged in the proof stats.
  When the target is > 0, the skin pick prefers products with a unique shape group: rejection sampling, up to 50
  integer-RNG redraws per type until its `shapeGroup` is unique in the level, else the last draw stays. Eligible products: `silhouetteOk == true` and a `shapeGroup` no other type of the level has.
  `scripts/build-catalog.js` sets `shapeGroup = cls + aspect bucket` (viewBox height/width in steps of 0.25) and reads
  manual overrides from `assets/items/manifest/silhouette-overrides.json`, set by eye on the contact sheet of all 180
  silhouettes (`docs/preview/silhouettes.png`). L24 places exactly 2 silhouettes of 2 different types whose other two
  copies are visible in fronts at the start.
- **Silhouette palette** (8 colours): `#2E7D32` green, `#C62828` red, `#1565C0` blue, `#6A1B9A` purple, `#EF6C00`
  orange, `#00838F` teal, `#6D4C41` brown, `#AD1457` pink. The RNG picks among those whose hue family differs from the
  product's `hueFamily` (an achromatic product may take any of the 8).

---

## 5. Scoring and highscore

### 5.1 "Gegen die Zeit": points, combo and the Serie

| Item | Rule | Config key |
|---|---|---|
| Match | `100 × mult`, `mult = min(4, 1 + 0.5 × (combo - 1))`, x4 at combo 7 | `MATCH_POINTS 100`, `COMBO_STEP 0.5`, `COMBO_MAX 7` |
| Combo | R17: 6000 ms window, refilled per match, drains in `tick`, paused with the game | `COMBO_WINDOW_MS 6000` |
| Cascade match | as a match (rare) | |
| Bunny spend, orphans | 0 points, combo unchanged | |
| Clear bonus | +250 | `LEVEL_CLEAR_POINTS 250` |
| Time bonus | +5 per full second left; 0 if "+30 s" was taken | `TIME_BONUS_PER_S 5` |
| Bunnies left at the clear | +150 each (counter and board) | `BUNNY_LEFT_POINTS 150` |
| Fehlerfrei | +250 if no undo, spend, rescue or "+30 s" | `FLAWLESS_POINTS 250` |
| Stars | `f = timeLeft / timeLimit`: f >= 0.50 -> 3, >= 0.25 -> 2, else 1; "+30 s" -> 1; rescue -> max 2 | `STAR_F [500, 250]` |

**What a run is: the Serie.** Progress and highscore are separate, because she must never lose progress.
- **Progress:** the reached timed level is stored permanently; "Weiterspielen" always starts the current level.
- **Serie:** the running sum of level scores over consecutive levels, starting at 0 on the first timed level and after
  every banking. Match points of an unfinished level count when it is banked.
- **Banked** (written into the top 10, then reset to 0) when: the clock hits 0 the second time in a level (R16),
  the player taps "Level neu" in timed, or "Serie beenden" (timeout card, stuck banner, pause menu; armed 2 s confirm).
  The same level then restarts with a new Serie. Quitting to the menu or a reload does **not** bank; "Weiterspielen"
  continues the Serie.
- **Top 10** (timed): `{ score, level, fromLevel, date }` (`level` = last level played, the v0.1.0 field), sorted by
  score, then level. Shown "1. 48 250 Punkte · Level 12-19 · 03.11.". The best entry is the "Rekord".
- **Per-level best** (timed): `{ best, stars }` per level, shown on the clear card ("Bestwert 2 950").
- Card wording on banking: "Serie gespeichert: 48 250 Punkte, Platz 2. Weiter geht's mit Level 19."

### 5.2 "Entspannt": efficiency, stars, records

| Item | Rule |
|---|---|
| Level score | `round(1000 × min(1, par / moves))` (moves = moves + takes + spends, R13) |
| Stars | moves <= par -> 3; <= ceil(1.5 × par) -> 2; else 1; rescue -> max 2 |
| Combo | R18 3-move window; HUD 3 pips + "Kombo xN"; no points; combo 5 gives the bunny |
| Badges | "Ohne Hilfe" (no undo, Tipp, rescue), "Goldhase gespart" (a bunny left at the clear) |
| Per level | `{ best, stars, moves, badges }`, best attempt only |
| Headline | **Gesamtpunkte** = Σ best over all levels, **★ total**, **Level erreicht** |
| Top 10 | weighted single-level results `round(best × (100 + n) / 100)`, entries `{ score, level, date }`, at most one entry per level (its highest weighted score), so replays via "Nochmal" cannot fill the list |

A relaxed level is never lost: stuck shows the sheet; leaving costs nothing; replay shows the identical board.

### 5.3 Retry semantics

| Situation | Entspannt | Gegen die Zeit |
|---|---|---|
| Stuck | sheet: Rückgängig / Goldhase or Rettungshase / Level neu; nothing recorded | banner, same buttons; "Level neu" banks the Serie |
| Timeout 1 | - | "+30 Sekunden" (free) or "Serie beenden" |
| Timeout 2 | - | Serie banked, the same level restarts, progress kept |
| Restart | identical board, free | identical board, banks the Serie |
| Quit to menu | board in progress saved | board and Serie saved; clock paused |
| Reload / tab killed | resume the exact board | resume; clock and belts paused until the first touch |
| Earlier levels | "Nochmal" on the clear card replays that level (best attempt counts) | per-level best only; the Serie is not touched by replays from the clear card |

### 5.4 Save schema v2 (`save.js`; storage key unchanged `supermarketSorter.v1`)

```js
{ v: 2, muted, music, lowGfx, haptics, reducedMotion, stillBelts, showDepth /* default false */, highContrast,
  seenTips: { drag, tap, layers, bunny, lock, depth, belts, beltBunny, sil, hbelt, drift, warn, orphan },
  records: {
    timed:   { reached, best, bestLevel, games,                  // the Serie lives only in the run record (8.8)
               top: [{ score, level, fromLevel, date }],            // 10
               levels: { "<n>": { best, stars } } },
    relaxed: { reached, totalBest, totalStars,
               top: [{ score, level, date }],                       // 10, weighted (5.2)
               levels: { "<n>": { best, stars, moves, badges } } } } }
```

`normalizeSave` maps v1: `timed.top[i]` -> `{ ..., fromLevel: 1 }`; relaxed v1 `top` -> `reached = max(level) + 1`
(entries dropped, they were run totals). `mergeSave` (called by `ui/storage.save` on every write) merges:
settings from the newer write; `reached`, `best`, `bestLevel`, `games`: max; `seenTips`: logical OR per key; per level:
the **whole entry** with the higher `best` (tie: fewer `moves`, then more `stars`), `badges` = union, `stars` = max;
`totalBest`/`totalStars` recomputed from the merged levels; timed `top`: union deduplicated by
(score, level, fromLevel, date), sorted, 10; relaxed `top`: at most one entry per level (the higher weighted score),
sorted, 10. The Serie is not in the save, so banking (reset to 0 in the run record) can never be undone by a merge.
About 30 bytes per relaxed level.

---

## 6. Boosters and helpers (no ads, no economy)

| Helper | Branch | Available | Charges | Effect on layers | Effect on belts | Score effect |
|---|---|---|---|---|---|---|
| Rückgängig | both | L2 (button visible from L1) | relaxed unlimited, cap 300; timed unlimited back to the last take (R-U2) | restores fronts, backs, locks, swept types exactly | relaxed: the product returns to its cell, bars lift; timed: a take is a barrier, bars stay; belt motion not rewound | removes undone points; loses Fehlerfrei / Ohne Hilfe |
| Goldhase | both | L6 | placed per level + 1 at combo 5 (once per level) | spend clears the **whole target compartment** (front and all back layers; bunnies inside collected first), then orphan sweep and valve | collect from a cell bars it; belts are never spend targets; orphan copies on belts are swept | 0 points; timed +150 per bunny left; relaxed badge |
| Rettungshase | both | when stuck with 0 bunnies and `stuckTargets` non-empty (1.9) | 1 per level | as Goldhase | as Goldhase | max 2 stars; loses Fehlerfrei / Ohne Hilfe |
| Tipp | relaxed | L4 | unlimited, 3 s cooldown | may suggest emptying a front | may suggest a take | loses Ohne Hilfe |
| +30 Sekunden | timed | at the first timeout | 1 per level | - | belts keep their speed | time bonus 0, 1 star, no Fehlerfrei |

- **Bunny frequency (placed):** L6, L10, L15, L20 (teaching); then timed: Schwer, Sehr schwer (back layers) and idx 2
  from L23 (belt cell) = 3 per 10 levels; relaxed: Schwer and Sehr schwer = 2 per 10. Plus at most one combo-5 bunny
  and one rescue per level. Expected spendable bunnies per 10 levels: timed about 4-5, relaxed about 3-4.
- **Certification:** every level is certified **with** its placed bunnies (collect only) and **without** any helper.
- Tipp runs on the live state, never the stored witness (the witness is valid only from the start).
- Bunnies do not carry over between levels; collect, spend and rescue are undoable (timed: not past a take).
- Balance: a whole-compartment spend can remove up to 18 products in one move, which makes bunny levels easier to
  3-star in relaxed; accepted as the owner's literal reading (0.4), Q3 offers the front-only alternative.

---

## 7. UI/UX for the owner's mother

### 7.1 Screens and flow

`TITLE` (two huge buttons "Entspannt spielen" / "Gegen die Zeit", each with its reached level and "Weiterspielen";
Bestenliste; Anleitung; Einstellungen) -> `INTRO` card per level (level number, "Schwer" badge, one line about a new
mechanic; tap anywhere) -> `PLAY` <-> `PAUSE` (Weiter, Level neu [armed], Anleitung, Einstellungen, Zum Menü) ->
`WIN` clear card (stars fly in, breakdown, big "Weiter", small "Nochmal") -> next `INTRO`. Plus `STUCK` (relaxed sheet,
timed banner), `TIMEOUT` card, `LOSE` = "Serie gespeichert" card (score, rank, "Neuer Rekord!"), `BESTENLISTE` with two
tabs. The mode is chosen on the title only. Einstellungen: Ton, Bewegung reduzieren, Regale stehen still (relaxed),
Tiefe anzeigen (default off), Kontrast erhöhen, Sparmodus.

### 7.2 Layout at 390x844 CSS px (iPhone 12-15; all values from `computeGeometry`)

(Historical design numbers. The shipped layout is the v0.3.1 cabinet described in section 0.5: HUD band of 80 px, slot
width 42.6 px at 390 px with side columns, one side cell per rack row, bottom action row of 68 px.)

| Zone | Height | Content |
|---|---|---|
| Safe top | 47 | - |
| HUD row 1 | 56 | `Lv. 23` · bunny counter (tappable = spend) · timer "04:53" or "Züge 12 / 31" · ★ score · pause. Widths (`computeGeometry`): viewport < 406 px (every iPhone 12-15, 375 and 390 included): 60 · 48 · 96 · 80 · 44 = 328 + 4 × 6 gaps = **352 px** (fits 359 at 375, 374 at 390); viewport >= 406: 72 · 52 · 104 · 88 · 48 = 364 + 24 = 388 px |
| HUD row 2 | 30 | "Kombo x3" bar (timed) or 3 pips (relaxed) · "Noch 54" (= `matchable`) |
| Board | rest, about 560 (488 with an H belt) | side belt 64 · gap 6 · rack (2 columns + caps) · gap 6 · side belt 64 |
| H belt row (only if the level has one; reserved from the start) | 72 | one row of cells, Wv 5 |
| Bottom bar | 84 | Rückgängig (72x72) · Goldhase with count (72x72) · Tipp (relaxed) |
| Safe bottom | 34 | - |

Compartment width `(390 - 16 - 2×64 - 2×6 - 6) / 2 = 114`, slot 38 wide; rack row `560 / 6 = 93` for A10 -> items
70-76 px tall (RESEARCH 6.2 target 64-80). Without belts (L1-L11) a compartment is 181 wide and items reach 80 px.
At 375x667 with A10 + belts: rows 70 px, items 58 px (floor 52; below it `computeGeometry` drops the HUD row 2 into row 1).
Slots are narrower than 44 px, so **the whole compartment is the drop target** and a pick resolves to the item whose
slot column (38 x full compartment height) contains the finger. Side cells are 64 wide and `boardH / Wv` tall: 70 px
(560 / 8) without an H belt, 61 px (488 / 8) with one (still >= 44 px).

### 7.3 Drawing in the DOM (one element per visible product; cost rules)

| Element | DOM | Cost rule |
|---|---|---|
| Front item | `<img class="item">` in `#items`, `translate3d` (existing) | composited only while moving |
| Silhouette item | `<canvas class="item sil">` drawn once: `drawImage(sprite)`, then `globalCompositeOperation = 'source-in'`, `fillRect(colour)`; cached per (product, colour) and copied with `drawImage` | displaying a tainted canvas is allowed on `file://`; CSS `mask-image` is rejected because it fetches in CORS mode and fails on `file://` in Chromium/Firefox |
| Next layer | `<img class="item back">` (or silhouette canvas) in `#backs` behind the fronts, scale 0.88, raised 6% | static |
| Darkening | one `<div class="dim">` per compartment, `rgba(40,25,15,0.55)`; never a per-item filter | static |
| Depth pips (only with "Tiefe anzeigen" on; default off) | `<i class="pip">` x min(4, back.length - 1) on the plank (8 px cream dots), "+" beyond | static |
| Kontrast erhöhen (setting) | plank one step darker; static items get `filter: drop-shadow(0 0 1px #2A1B12)` x2 (2 px outline), removed while an item flies | static only |
| Lock | `<div class="lock">`: two crossed chain SVGs (data URI) + round blue badge 40 px with the counter (no "AD") | badge pop 200 ms on `lockTick`; chains drop + fade 300 ms on `unlock` |
| Belt | `<div class="belt">` (`overflow: hidden`) with `Nb` absolutely positioned `<div class="cell">` (plank, item child, `<div class="bars">`) | one WAAPI animation per cell |
| Bars | 5 wooden bars SVG, `translateY(-100%) -> 0`, 250 ms ease-out; cell darkens to 80% | once per bar |
| Bunny | golden sprite `assets/items/special-golden-bunny.svg` + shimmer (opacity keyframe on a highlight `<i>`, 2 s) | off in reduced motion |
| Free-slot warning | box-shadow pulse x2 on the last free slot | on `warnSpace` |

**Belt animation (D8).** Each cell k gets `el.animate([{transform: translate3d(0, (Nb-1)·p, 0)}, {transform:
translate3d(0, -p, 0)}], { duration: Nb / v × 1000, iterations: Infinity, easing: 'linear' })` with `currentTime =
(k / Nb) × duration + phaseMs` (vertical; the H belt uses x and moves left). A cell wraps from just above the window to
just below it, invisible because `Nb >= Wv + 1`. `beltSpeed` -> `anim.updatePlaybackRate(rate)`; pause ->
`anim.pause()`; resume -> `play()`; a barred-out belt -> `cancel()` and dim. `phaseMs` is saved cosmetically in the
run record. Still belts get no animation (cell k at `k × p`).

### 7.4 Input with moving sources

1. Drag is primary, tap-tap an equal fallback (RESEARCH M4). Drop targets are only the static compartments.
2. **Belt pick on pointerdown** (no slop wait): `belts.hit(x, y)` reads `getBoundingClientRect()` of the belt's cells
   (<= 11 rects, once per pointerdown) and applies R1/R21; the product is reparented to `#items` at its current position
   and follows the finger, the cell shows a faint outline. Moving < 8 px and lifting = tap-select.
3. **Tap-select hand spot** (R23): the product lifts out and waits still at the belt's inner edge level with the finger
   until a compartment is tapped (take) or the product / empty board is tapped (cancel).
4. Cancelled drag: the product flies 300 ms (ease-out) to its cell's **current** rect, read at drop time, then is
   reparented back.
5. While a product is held, legal compartments glow green; full ones show nothing; locked ones stay chained.
6. Window-level `pointermove/pointerup` fallback (RESEARCH 6.4, WebKit 220196). Rendering never reads layout during
   animations; the only reads are `getBoundingClientRect` at pointerdown and drop.

### 7.5 Feedback and juice (transform/opacity only)

| Moment | Visual | Sound |
|---|---|---|
| Pick | lift -10%, scale 1.10, soft shadow | soft "tock" |
| Drop | squash 1.08/0.90 -> 0.97/1.04 -> 1, 200 ms | wood "clack" |
| Invalid | shake +-6 px 240 ms, slide home | quiet "bonk" |
| Match | silhouettes colour in (150 ms), hop, squeeze, pop; 10 sparkles; "+150" floater | chime, +1 semitone per combo step (max +6) |
| Reveal | dark layer slides forward 180 ms and brightens; new dark layer fades in | "swish" |
| Lock tick / open | badge pulse / chains fall | tick / clank |
| Take | bars fall after the product leaves | ratchet "klick" |
| Bunny collect / spend | arc to the counter with trail 600 ms / golden burst wiping the whole compartment (dark layer and pips fade with it) | sparkle arpeggio / whoosh |
| Orphan sweep | fade 300 ms, toast once | soft pop |
| Combo x3 / x5 | popup "Kombo x3!"; x5 adds "Goldhase!" | rising chime |
| Clear | basket sweep, confetti canvas 2 s, stars 150 ms stagger | fanfare |
| Time amber / red | pill colour / pulse 1 -> 1.12 per second | - / tick |

No screen shake, no flashing, no vibration dependence (iOS Safari has none).

### 7.6 Onboarding (one coach mark per mechanic, first appearance only, `seenTips`, re-readable in "Anleitung")

| First at | Mechanic | Coach mark (German, one sentence + animated hand) |
|---|---|---|
| L1 | drag, match | "Zieh drei gleiche Produkte in ein Fach." |
| L2 | tap, undo | "Du kannst auch tippen: erst das Produkt, dann das Fach. Vertan? Rückgängig." |
| L3 | layers | "Dahinter wartet mehr: Ist die vordere Reihe leer, rückt die dunkle nach vorn." |
| L6 | bunny | "Ein Goldhase! Tipp ihn an. Dann tippst du auf ihn oben und auf ein Fach: Es wird leer geräumt." |
| L7 | lock | "Dieses Fach ist verschlossen. Nach 2 Dreiern geht es von selbst auf." |
| L8, only if "Tiefe anzeigen" is on (else when it is first switched on) | pips | "Die Punkte zeigen, wie viele Reihen noch dahinter stecken." |
| L12 | side shelves | "Aus den Seitenregalen kannst du nur nehmen, nicht zurücklegen. Achte auf freien Platz in der Mitte!" |
| first `warnSpace` | free space | "Nur noch 1 Platz frei. Bilde erst einen Dreier." |
| first orphan sweep | orphans | "Einzelstücke räumen wir weg: Davon gibt es keinen Dreier mehr." |
| timed L23 | bunny on a belt | "Schnapp dir den Goldhasen, wenn er vorbeikommt." |
| L24 | silhouettes | "Nur der Umriss: Welches Produkt ist das? Es passt zu seinen Geschwistern wie jedes andere." |
| timed L34 | horizontal belt | "Nachschub! Unten fährt jetzt ein weiteres Regal vorbei." |
| relaxed L41 | drift | "Die Seitenregale wandern jetzt langsam. Stillstand: Einstellungen." |

Coach marks pause clock and belts (R28); the timed clock starts only after "Alles klar" and the first touch (R14).
String keys, in table order: `coach_drag`, `coach_tap`, `coach_layers`, `coach_bunny`, `coach_lock` (uses `{n}` with the
`lock_hint_1`/`lock_hint_n` wording), `coach_depth`, `coach_belts`, `coach_warn`, `coach_orphan`, `coach_beltBunny`,
`coach_sil`, `coach_hbelt`, `coach_drift`; `seenTips` uses the same names without the prefix (5.4, incl. `orphan`).

### 7.7 Accessibility and strings

Targets >= 44 px (bottom buttons 72x72 with a 15 px label, side cells 64 x 61-70, whole compartment as drop zone); text >=
17 px (HUD numbers 24 px bold); products distinguished by shape and icon, never colour alone (confusable pairs only
from L21/L31, staggered after silhouettes are introduced at L24 so the screen does not overload); "Bewegung
reduzieren" + `prefers-reduced-motion` (R34); "Regale stehen still" (relaxed); unlimited undo; every destructive button
armed with a 2 s "Nochmal tippen" confirm; auto-pause on hide; nothing auto-dismisses in relaxed.
New string keys (`strings.js`): `stuck_title` "Kein Platz mehr", `undo` "Rückgängig", `bunny` "Goldhase",
`bunny_rescue` "Rettungshase", `bunny_found` "Goldhase gefunden!", `bunny_arm` "Tippe auf ein Fach: es wird ganz leer
geräumt", `hint` "Tipp", `hint_none` "Kein Weg gefunden: Rückgängig oder neu starten", `lock_hint_1` "Öffnet sich nach
einem Dreier", `lock_hint_n` "Öffnet sich nach {n} Dreiern", `orphan` "Einzelstücke räumen wir weg", `warn_space` "Nur noch 1 Platz frei", `belt_appear`
"Nachschub!", `building` "Regal wird eingeräumt …", `extend` "+30 Sekunden", `end_serie` "Serie beenden",
`serie_banked` "Serie gespeichert: {score} Punkte, Platz {rank}. Weiter geht's mit Level {n}.", `hard` "Schwer", `left` "Noch {n}",
`moves_par` "Züge {m} / {par}", `rules_changed` "Neue Spielregeln: Level startet neu", `still_belts` "Regale stehen
still", `show_depth` "Tiefe anzeigen", `timeout_title` "Die Zeit ist um!", `timeout_body` "Du bekommst einmal
30 Sekunden geschenkt.", `stuck_banner` "Kein Platz mehr: Rückgängig oder Goldhase", `stuck_none` "Rückgängig oder Level
neu starten", `rescue_body` "Ein Rettungshase hilft dir. Höchstens 2 Sterne.", `badge_flawless` "Fehlerfrei",
`badge_nohelp` "Ohne Hilfe", `badge_bunny` "Goldhase gespart", `tab_timed` "Gegen die Zeit", `tab_relaxed` "Entspannt",
`total_best` "Gesamtpunkte {n}", `stars_total` "★ {n}", `reached` "Level erreicht {n}", `level_best` "Bestwert {n}",
`reduce_motion` "Bewegung reduzieren", `high_contrast` "Kontrast erhöhen", `toast_combo5` "Kombo x5: Goldhase!",
`protocol_copied` "Protokoll kopiert", plus the 13 `coach_*` keys with the 7.6 sentences. INTRO card lines:
`intro_level` "Level {n}", `intro_new` "Neu: {mechanic}", `intro_tap` "Tippe, um zu starten", and one `intro_<mechanic>`
per 4.1 introduction ("Reihen dahinter", "Verschlossene Fächer", "Goldhase", "Seitenregale", "Umrisse", "Regal unten").

`howto_text` is rewritten, one paragraph per mechanic (the old text promised "das ganze Regal leer" and combo points in
both modes):
"**Ziehe** ein Produkt in ein anderes Fach, oder **tippe** es an und dann auf das Zielfach. Stehen **drei gleiche**
Produkte in einem Fach, verschwinden sie." / "**Reihen dahinter:** Ist die vordere Reihe eines Fachs leer, rückt die
dunkle Reihe nach vorn." / "**Schloss:** Ein verschlossenes Fach öffnet sich von selbst. Die Zahl zeigt, wie viele
Dreier noch fehlen." / "**Seitenregale:** Daraus kannst du nur nehmen, nicht zurücklegen. Danach schließt sich das
Fach. Achte auf freien Platz in der Mitte." / "**Goldhase:** Tipp ihn an. Dann tippe oben auf den Hasen und auf ein
Fach: Es wird ganz leer geräumt." / "**Umrisse:** Manche Produkte siehst du nur als Umriss in einer fremden Farbe. Sie
passen zu ihren Geschwistern wie jedes andere." / "**Einzelstücke zählen nicht:** Gibt es von einem Produkt keinen
Dreier mehr, räumen wir es weg. Sind alle Dreier gebildet, ist das Level geschafft." / "**Gegen die Zeit:** Schnelle
Dreier hintereinander geben Kombo-Punkte. **Entspannt:** ohne Uhr, mit möglichst wenigen Zügen."
Every new key gets an English twin in the `en` table (same keys; `tests/strings.test.js` asserts equal key sets).

---

## 8. Engineering plan on the existing code

### 8.1 Data model (`src/game/board.js` + `src/game/belts.js`, pure)

```js
Board = { v: 2, shape: 'A10', rows, cols: 2, cap: 3,                // rows/cols kept so old call sites work
  comps: [{ slots: [id|0, id|0, id|0],                              // front row, v0.1.0 meaning unchanged
            back: [{ t: [code|null|'*' x3], sil: [0|'#RRGGBB' x3] }],// queue, back[0] = dark next layer
            lockAt: 0|N, row, col }],                               // col 0 | 1 | 'c' (cap)
  belts: [{ id: 'L'|'R'|'H', axis: 'y'|'x', appearAt, appeared,
            cells: [{ stack: [{ t, sil }], item: id|0, barred }] }],  // item = id of the stack top when on screen
  items: { id: { id, type, sil, at: 'c'|'b', comp|belt, slot|cell } },// front + belt-top items only (as v0.1.0)
  remaining: { type: n }, matchable, matches, bunnies, swept: { type: 1 }, nextId, count }
```

| Function (all pure, names final) | Change | Est. lines |
|---|---|---|
| `createBoard(spec)` | accepts the decoded level `{shape, comps:[{layers, lockAt}], belts:[...], sil}`; old `{rows, cols, fill}` still works | 50 |
| `isOpen(b, ci)`, `frontEmpty(b, ci)` | new | 4 |
| `canMove(b, id, toComp, toSlot?)` | + target open, source open, belt cell unbarred and appeared | 14 |
| `move(b, id, toComp, toSlot?)` | returns `[move|take, bar?, match?]`; no reveal (game.js orchestrates) | 28 |
| `reveal(b, ci)` | mints ids, filters swept types, skips empty layers | 25 |
| `collect(b, ref)`, `spend(b, ci)` | new; `spend` collects bunnies inside, then clears front and all back layers | 28 |
| `sweepOrphans(b)` | new; O(T) check after every action, sets `swept`; returns `sweep` + `bar` events | 25 |
| `applyThresholds(b, prevMatches)` | `lockTick` / `unlock` / `beltAppear`, then the starved valve R-K5 | 32 |
| `movesPossible(b)`, `progressPossible(b)`, `stuckTargets(b)` | 1.9 incl. the stuck filter (<= 10 simulated spends on a scratch copy); `isDeadlocked(b)` = `!movesPossible(b) && b.bunnies == 0` alias | 45 |
| `counts(b)` | c_t, s_t, F, Hk in one pass | 15 |
| `snapshot(b)` / `restore(s)` / `hash(b)` / `canonical(b)` | extended with backs, locks, belts (cells and `appeared`), `swept`, matches, bunnies; `remaining`/`matchable` recomputed on restore | 40 |
| `belts.js`: `createBelts`, `topOf`, `take`, `bar`, `available`, `appear`, `snapshot/restore` | new file | 150 |

### 8.2 Rules (`src/game/game.js` + `src/game/rules.js`, pure)

```js
createGame(level, mode, opts)   // level = decoded level + { n, tag, skin, witness, par }; opts.score, opts.serie
moveItem(g, itemId, toComp, toSlot)  -> events     // centre item or belt top (take): one entry point, as v0.1.0
collect(g, ref) / spend(g, toComp) / rescue(g) / undo(g) / extend(g) -> events
start(g)                         // first touch: clock starts (R14)
tick(g, dtMs) -> events          // 2.3
snapshot(g) / restore(s)         // run record incl. the last 20 undo entries
// rules.js: isWon, isStuck, comboStep(g, matched), rampRate(g), timeLimit(mode, L, level, witness), stars(g), speed(mode, L, tag),
//           casualBot(level, witness, mode, L, timeS) (3.5; here so timeLimit needs nothing loaded later)
```

`g` adds `started`, `undo: []`, `comboMovesLeft`, `bunnyEarned`, `rescueUsed`, `extended`, `flawless`, `stuckHash`,
`warned`, `frozen`. Status values: `playing | timeout | won | lost`. The existing `combo`, `comboLeftMs`, `bestCombo`,
`moves`, `matches`, `elapsedMs`, `timeLeftMs`, `score`, `levelScore` keep their names.

### 8.3 Levels (`levels.js`, `levels-data.js`, `gen.js`)

```js
// src/game/levels-data.js (generated by scripts/build-levels.js; do not edit; exempt from the line cap)
SS.LEVEL_DATA = { v: 2, gen: 1, timed: [ /* L1..300 */ ], relaxed: [ /* L1..300 */ ] };
// level = "<shape>|<tag>|<locks>|<belts>|<rack>|<sil>|<par>|<witness>"
//  shape  A4..A10            tag  t|n|p|h|v           locks "ci:N;ci:N" or "-"
//  belts  "<id><appearAt>:<cells>" joined by ';' e.g. "L0:3a7b0c1;R0:6e7f8g9;H12:abcd0123"; '*' bunny; "(ab)" = stack (v1 never)
//  rack   comps joined by ',', layers joined by '/', layer = exactly 3 chars: base-36 type (0-9a-n), '.' hole, '*' bunny
//  sil    "-" (silhouettes are chosen at runtime by the skin RNG, 4.8; the field is reserved for pinned overrides)
//  witness 3 chars per input: "<from><type><to>" move (from/to = comp 0-9) | "<L|R|H><cell><to>" take | "*<comp>." or "*<L|R|H><cell>" collect
```

About 200 B board + 400 B witness per level, 600 levels ≈ 360 KB (gzip ≈ 120 KB), parse < 5 ms. `levels.js` exposes
`decode`, `encode`, `get(mode, n)` (baked, cached tail or null; always `verify`s), `skin(level, mode, n, catalog)`,
`tailJob(mode, n) -> { step(nodes) -> 'running'|'done'|'fallback', result }`, `parLowerBound` (kept). `gen.js`:
`knobs` (L61+ formulas; the hand-set L7-L60 rows of 4.4/4.5 live in build-only `scripts/knob-rows.js` and are passed in
by `build-levels.js`; the phone never needs them), `bandedDeal`, `invariants`, `generate`, `metrics`, `transform`.
`solver.js`: `compile`, `solveP` (resumable job), `playouts`, `verify`, `hint`, `solve(board)` kept as a wrapper for
the old tests, and `nextMove(board)` kept: it wraps `hint()` on the live state and returns `{ item, to }` (centre move)
or `{ item, belt, cell, to }` (take; `item` = id of the cell's top product), which `tests/browser/run.js` and
`tests/browser/soak.js` use to drive moves and takes through the DOM.

### 8.4 View (`src/ui/`)

- `board.js` (kept as coordinator): `computeGeometry(board, area, beltCount, hasH)` (rack rects with centred caps, belt
  rects, pitches, tile sizes), build once per level (compartments with `.dim`, pips, `.lock`; back imgs of `back[0]`;
  front items; silhouettes via `SS.sprites.silhouette(product, colour)`), pointer routing, drag layer, tap mode.
- `boardfx.js` (NEW): `apply(events)` incremental animations (moved out of `board.js`); `reveal` reuses the 1-3 back
  elements (drop `.back`, set `data-id`, animate forward) and fades in the new `back[0]`; `undo` rebuilds only the
  compartments and cells in `changed`.
- `belts.js` (NEW): belt DOM, WAAPI per cell, `hit(x, y)` with R1/R21, reparenting, bars, H slide-in, pause/resume,
  `phaseMs()` for the run record.
- `bottombar.js` (NEW): Rückgängig, Goldhase + count, Tipp. `coach.js` (NEW): coach marks of 7.6.
- `sprites.js` (CHG): `silhouette(product, colour)` canvas cache; preload adds the bunny sprite.

### 8.5 Render loop and performance budget

| State | rAF | Timers | Compositor |
|---|---|---|---|
| Relaxed idle (still or drifting belts) | none | none | drifting belt cells only |
| Timed PLAY | none | 250 ms `tick` + HUD text (only when the second changes) | belts; Kombo bar as a CSS `scaleX` transition over the remaining window |
| Drag, fly, sweep, confetti | while running | - | - |
| Tail job | none | 50 ms `setTimeout`, <= 4 ms slices, paused while a pointer is down or an animation runs | - |

`app/loop.js` gets `want(reason, on)` with reasons `clock`, `anim`, `tailgen`; it runs only while one is on.
Budgets: frame p95 <= 20 ms in the browser test at CDP CPU x4 (16.7 ms target on an iPhone 12); action handler (drop ->
events -> DOM writes) <= 8 ms; idle relaxed 0 rAF callbacks per second; DOM nodes <= 250 (30 front + 30 back + 30 belt
items + 10 compartments x 4 + 30 cells x 3 = 220, plus headroom; 30 cells = 2 x 11 side + 8 H at timed L > 80); composited layers <= 40 (belt cells + dragged item + Kombo bar);
`will-change` only on belt cells and the dragged item; no filters on moving elements; level build < 40 ms.

### 8.6 File layout and line budgets (cap 450, author target <= 400)

| File | Status | Now | Target | Content |
|---|---|---|---|---|
| `src/config.js` | CHG | 35 | 110 | constants of 0.3, 5.1, 3.6, 4.6 |
| `src/game/board.js` | CHG | 177 | 400 | 8.1 |
| `src/game/belts.js` | NEW | - | 180 | belt model |
| `src/game/rules.js` | NEW | - | 280 | win, stuck, combo, ramp, time limit, stars, speed, `casualBot` |
| `src/game/game.js` | CHG | 108 | 380 | action pipeline, undo, tick |
| `src/game/score.js` | CHG | 41 | 130 | 5.1, 5.2 |
| `src/game/solver.js` | REWRITE in place | 79 | 420 | 3.2 |
| `src/game/gen.js` | NEW | - | 380 | 3.3 (L61+ knob formulas, deal, invariants, gate, metrics), remix |
| `src/game/levels.js` | CHG | 74 | 360 | 8.3 |
| `src/game/levels-data.js` | NEW, generated | - | exempt | 600 levels, one per line |
| `src/game/save.js` | CHG | 70 | 170 | 5.4 |
| `src/ui/board.js` | CHG | 315 | 400 | geometry, build, input |
| `src/ui/boardfx.js`, `belts.js`, `bottombar.js`, `coach.js` | NEW | - | 300, 280, 140, 150 | 8.4 |
| `src/ui/hud.js` / `overlays.js` / `strings.js` | CHG | 50 / 193 / 67 | 160 / 420 / 170 | 7.1, 7.7 |
| `src/app/states.js` / `run.js` / `loop.js` | CHG / NEW / CHG | 198 / - / 16 | 360 / 240 / 45 | states, Serie + tail scheduling, `want()` |
| `src/style/board.css` / `belts.css` | CHG / NEW | ~90 / - | 260 / 120 | backs, dim, pips, chains, silhouettes / belts, bars |
| `scripts/build-levels.js`, `prove-levels.js`, `authored.js` | NEW | - | 380, 180, 60 | bake, proof run (+ tail stats 3.4), L1-L6 |
| `scripts/knob-rows.js` | NEW, build-only | - | 200 | hand-set L7-L60 rows, 2 modes (120 rows) |
| `scripts/tune.js` | NEW | - | 400 | `npm run tune` driver (9.1) |
| `tests/bots/oma.js`, `careful.js`, `profi.js` | NEW | - | 150 each | bots of 9.1 |
| `scripts/build-catalog.js` | CHG | - | +60 | `shapeGroup`, `silhouetteOk`, `hueFamily` |
| `assets/items/manifest/silhouette-overrides.json` | NEW | - | - | manual silhouette overrides |
| `src/art/catalog.js` | regenerated | - | exempt (as now) | new catalogue fields |
| `scripts/release.sh` | CHG | - | +10 | runs `npm test`, `npm run proof`, `npm run tune`; aborts on any failure |
| `tests/helpers/replay.js` | NEW | - | 150 | independent checker |
| `assets/items/special-golden-bunny.svg` | NEW | - | - | gold `#F2B632`, outline `#2A1B12` |

`index.html` load order: `config, game/rng, game/board, game/belts, game/rules, game/score, game/game, game/solver,
game/gen, game/levels-data, game/levels, game/save, art/catalog, art/sprites, ui/strings, ui/storage, ui/input,
ui/boardfx, ui/belts, ui/board, ui/bottombar, ui/coach, ui/hud, ui/overlays, audio/engine, audio/sounds, app/run,
app/states, app/loop, main` (every existing src script included, so `purity.test` stays green). Namespaces: `SS.belts`
(model, `game/belts.js`) and `SS.ui.belts` (view, `ui/belts.js`), `SS.rules`, `SS.gen`, `SS.ui.boardfx`,
`SS.ui.bottombar`, `SS.ui.coach`, `SS.app.run`. `rules.js` requires nothing loaded after it (casualBot lives there), so
Node `require` has no cycle.

### 8.7 Tests to add, and migration of the old tests

The old suite has **31** unit tests (the earlier "32" was a miscount): **18 unchanged, 10 rewritten, 3 extended**.
The browser and soak tests keep calling `SS.solver.nextMove(board)` (kept, 8.3).

| Old test | Status | Change |
|---|---|---|
| levels: generate gives three copies per type, no starting triple, a free slot | rewritten | `get(mode, n)` for L1-L60 of both modes: G2, G3, G4 |
| levels: the same number and seed reproduce the level | rewritten | `get(m, n)` twice is equal, `get(m, n) != get(m, n + 1)`; tail determinism via the hash pin |
| levels: the curve never adds free slots | rewritten | knob rows: within a tag, F0 never rises from one 10-level block to the next (Pause and breather excepted) |
| levels: the greedy solver clears 120 generated levels | rewritten | L1-L120 per mode: witness replays through `SS.game` (fast smoke; full set in `witness.test`) |
| game: a match scores MATCH_POINTS, the next within the window doubles | rewritten | mode `'timed'` (relaxed has no points, R18) |
| game: tick ends the combo with a comboEnd event | rewritten | mode `'timed'` (relaxed combo is move-based, R18) |
| game: clearing the board wins with a bonus and stars (relaxed) | rewritten | relaxed: `levelScore = round(1000 × min(1, par / moves))`, stars by par, no `MOVE_BONUS` (removed), no match points |
| game: timed mode counts down, time bonus, loses on timeout | rewritten | first 0 -> status `'timeout'`, `timeout{canExtend:true}`; `extend()`; second 0 -> `'lost'` |
| save: normalizeSave turns garbage into defaults | rewritten | expects `v: 2` and the v2 default records (5.4) |
| save: mergeSave takes settings from next and the union of records | rewritten | mode `'timed'` (relaxed v2 keeps no run totals), plus the 5.4 merge rules |
| purity: pure modules never touch the browser / load under Node; line cap | extended | PURE list + `belts`, `rules`, `gen`, `levels-data`; `levels-data.js` exempt from the cap |
| board (8), game: plain move, free slots, snapshot (3), rng (3), levels: solver (2), save: recordRun (1), purity: index.html (1) | unchanged | `{rows, cols, fill}` shim, `solve(board)` wrapper, `isDeadlocked` alias (bunnies 0) |

| File | Tests |
|---|---|
| `tests/board.test.js` (CHG) | reveal only at an empty front, holes kept; swept types filtered, empty layer skipped; lock opens at N real matches, not on spend; locked comp refuses drops; take bars the cell; drop onto a belt refused; spend collects bunnies inside, clears the whole compartment (front and backs), then sweep and valve; sweep after a match: 6-copy fixture (spend removes 2, a match removes 3 -> `sweep` event, `remaining` 0, back-layer copy dropped on reveal); starved valve fixture (`lockAt` 4, spends leave 2 possible matches -> `unlock {reason:'starved'}`); win with hidden orphans; random-action property: after every action no front or belt cell holds a type with `remaining < 3`, and `matchable` equals a recount |
| `tests/stuck.test.js` (NEW) | `movesPossible` vs exhaustive BFS (moves, takes, collects) on 3000 random small states with belts and bunnies (C <= 4, depth <= 3, <= 4 belt cells; plus 500 with stacked cells): 0 disagreements; stuck fires while bunnies > 0; every compartment in `stuckTargets` leaves a move after the spend (BFS), and an empty list hides the bunny buttons |
| `tests/belts.test.js` (NEW) | take, bar reasons, undo unbars, `appearAt`, stack tops, availability counts |
| `tests/game.test.js` (CHG) | golden event order of 2.2 for move, take, collect, spend, cascade; undo restores layers, belts, locks, bunnies, score but not clock or moves; undo of a spend restores later reveals (un-sweeps); undo of the match that made a belt appear hides it again and lowers the rate (`undo.changed.belts`); timed: a take clears the undo stack, relaxed: undo of a take unbars; combo-5 bunny once; rescue once; clock starts on `start()`; "+30 s" once; ramp rate per match |
| `tests/score.test.js` (NEW) | worked examples of 5.1/5.2, Serie banking, weighted relaxed top 10 |
| `tests/solver.test.js` (NEW) | witnesses on 30 fixed seeds; a fixture where an early collect loses (the solver still finds the line because that collect is branched); `nextMove` returns a take on a belt-only position; `verify` rejects a tampered witness; node-budget determinism (same result twice); pool abstraction equals a per-cell model on 100 small boards |
| `tests/witness.test.js` (NEW) | all 600 baked witnesses through `tests/helpers/replay.js` **and** through `SS.game` |
| `tests/levels.test.js` (CHG) | sha256 pin of `levels-data.js`; G1-G11 on all 600; decode/encode round trip; tail L301-L303 per mode generated once and hash-pinned (L301-L310 twice and L301-L1300 only in `npm run proof`); tail cache entries with another `gen`/`catHash` are dropped; remix preserves the witness; skin and silhouette rules (R-S3) on 200 levels |
| `tests/save.test.js` (CHG) | v1 -> v2 migration, garbage input; banking then a merge keeps the Serie at 0 (it is not in the save); per-level tie (equal best: fewer moves wins, badges union, stars max); relaxed top 10 holds one entry per level; `seenTips` OR |
| `tests/strings.test.js` (NEW) | `de` and `en` have the same key set; every `SS.strings` key used in `src/` exists |
| `tests/purity.test.js` (CHG) | add `belts.js`, `rules.js`, `gen.js`, `levels-data.js` to PURE; exempt `levels-data.js` from the 450-line cap |
| `tests/browser/run.js` (CHG) | layered board shows `.back` and `.dim`; reveal; timed L12 belts have running animations; real touch take on a moving cell bars it; cancel returns to the moved cell; tap-select hand spot; lock opens; silhouette canvas renders on `file://`; stuck sheet (`?level=test-stuck`); timeout card; HUD rects disjoint at 375x667 and 390x844; frame p95 <= 20 ms at CPU x4; 200 belt picks with 120 ms simulated latency: 0 misses |
| `tests/browser/soak.js` (CHG) | 30 levels per mode with solver moves incl. takes through the DOM at 4x speed: no console errors, DOM nodes stable +-5%, no leaked animations, heap growth < x3 |
| `npm run proof` | `scripts/prove-levels.js` per mode, L301-L1300 (3.4 item 6), incl. tail win rate per tag, L300 -> L301 step, step-cap rate |
| `npm run tune` | `scripts/tune.js` with `tests/bots/*.js` (9.1), checks 9.2 |

### 8.8 Migration

- `RULES_VERSION` 1 -> 2. On boot, a stored run with `rulesVersion < 2`: timed with score > 0 is banked via
  `recordRun` (`fromLevel 1`), relaxed is ignored; the run is removed; toast "Neue Spielregeln: Level startet neu".
- Save `v: 1` -> `v: 2` through `normalizeSave` (5.4). Storage key unchanged.
- Run record v2 (`RUN_KEY`, the only copy of the Serie; the save has none, 5.4): `{ v: 2, rulesVersion: 2, mode, levelNo, serie: { score, fromLevel }, game:
  SS.game.snapshot(g), tail: { level, witness } | null, phaseMs: { L, R, H } }`, written after every action and on hide.
- The `'run-' + seed + '-' + mode + '-' + levelNo` seed in `states.js` is removed: level identity is (mode, n).

### 8.9 Build order (each step ends green: `npm test`, then `npm run test:browser` where the view changed)

1. **Config + model.** `config.js` keys; `board.js` backs, locks, reveal, `remaining/matchable`; `belts.js`;
   `movesPossible` + `stuckTargets` + valve R-K5 + `tests/stuck.test.js` (BFS). Old tests still pass through the `{rows, cols, fill}` shim.
2. **Solver first, then measure.** (a) Port `docs/research-proto/full/fm.js` + `genb.js` into `solver.js` with Int32
   Zobrist keys, typed fronts, undo in place; `tests/solver.test.js`. (b) Benchmark µs/node on desktop and on the
   owner's iPhone (`index.html?bench=1` page prints it). Gate: desktop <= 10 µs, iPhone <= 25 µs. If missed, halve
   `TAIL_NODES` (15 000) and bake 500 levels per mode before step 6; record the measured numbers in `docs/proof/bench.txt`.
3. **Rules.** `rules.js`, `game.js` action pipeline 2.2, collect/spend/rescue/undo/extend, tick 2.3, `score.js`;
   `tests/game.test.js` golden event order, `tests/score.test.js`.
4. **Levels.** `gen.js` (L61+ knobs, banded deal, invariants, gate, metrics, transform), `scripts/knob-rows.js`
   (L7-L60), `rules.js` casualBot, `scripts/build-catalog.js` (`shapeGroup`, `hueFamily`), `levels.js`
   decode/encode/get/skin/tailJob, `scripts/authored.js` (L1-L6), `scripts/build-levels.js`; bake a 30-level draft
   per mode; `tests/helpers/replay.js` + `tests/witness.test.js`.
5. **View.** `computeGeometry` for A4-A10 + belts + H row; backs, dim, pips, chains; `ui/belts.js` WAAPI + hit test +
   hand spot; silhouette canvases; `boardfx.js`; `bottombar.js`; HUD bunny pill, Kombo bar/pips, clock colours;
   overlays (INTRO, STUCK, TIMEOUT, LOSE = Serie card, Bestenliste tabs); `coach.js`; strings; `loop.js` `want()`.
6. **App.** `run.js` (Serie, run record v2, tail job), `states.js` states, `save.js` v2 + migration; full bake of
   2 x 300 (cache on); hash pins; `npm run proof` for both modes; fix knobs until fallback <= 2%.
7. **Browser and soak.** `tests/browser/run.js` and `soak.js` additions; performance thresholds of 9.2.
8. **Tune and ship.** `npm run tune` (9.1) against 9.2; contact sheets reviewed, pins set; iPhone checklist 9.3 with the owner;
   `VERSION 0.2.0`; `scripts/release.sh`.

Estimate: 3-4 working days for one implementer (engineering's "few hours" was optimistic for this scope).

---

## 9. Test and tuning plan

### 9.1 Bots (casualBot in `rules.js`; Oma, Careful, Profi in `tests/bots/*.js`; driver `scripts/tune.js`; integer RNG)

| Bot | Models | Policy | Timing |
|---|---|---|---|
| Witness | proof | certificate replay | - |
| Oma-Bot | the owner's mother | integer softmax over the solver's move scores, no lookahead; sees fronts, dark layer, visible belt cells; undo once after each stuck (max 3 per level); collects bunnies at once, spends on the fullest compartment when F <= 1 | 3.5 s per rack input; take = wait until the cell is in the middle 60% + 0.8 s |
| Casual-Bot | runtime time gate (3.5) | same, no undo | `max(2.0 s, 1.25 × τ(L))` per rack input + 20% detours / middle 60% + 0.6 s |
| Careful-Bot | mother with undo | greedy + 2-ply lookahead, undo on stuck (max 20) | - |
| Profi-Bot | an expert | 2-ply lookahead, keeps 1 slot free | 1.4 s / 0.3 s |

**`npm run tune`** (`scripts/tune.js`, <= 400 lines): both modes x L1-L300, 20 seeded runs per level and bot (seeds
`tune-<bot>-<mode>-<n>-<k>`); timed runs spread over 20 belt phases; Oma and Careful get undo as in the table. It
writes `docs/proof/tune.txt` (every 9.2 metric per band and tag) and exits non-zero on any 9.2 breach;
`scripts/release.sh` runs `npm test`, `npm run proof` and `npm run tune` and aborts on any failure. Results are cached
per (GEN_VERSION, RULES_VERSION, bot file hash).

Every bot run can export a debug log (moves, undos, restarts, stuck events, time per level) as JSON. In the game the
pause menu long-press "Protokoll" exports the same log for the owner's sessions with his mother: the last 5 levels
are kept **in memory only**; the export builds a JSON `Blob`, `URL.createObjectURL`, and clicks a temporary
`<a download="protokoll-<date>.json">` (works on `file://`, no fetch); where download is unsupported it falls back to
`navigator.clipboard.writeText` and the toast "Protokoll kopiert".

### 9.2 Acceptance thresholds (the build or the release fails otherwise)

| Metric | Threshold |
|---|---|
| Baked levels | 100% witnesses replay in both checkers; G1-G11 hold; window hit or a logged relaxation |
| Tail proof run L301-L1300 per mode | 100% emitted levels replay; fallback <= 2%; attempts p95 <= 3; device nodes p90 <= 120k per level; median agent win rate per tag within +-10 points of its L61-300 window |
| Timed: Oma-Bot clears without "+30 s" | L1-20 >= 90%, L21-40 >= 75%, L41-60 >= 60% of Normal levels |
| Timed: Oma-Bot clears at all (with "+30 s") | >= 90% Normal, >= 70% Schwer, >= 55% Sehr schwer |
| Timed: Casual-Bot time left | the 3.5 thresholds (25 / 20 / 15%) on >= 90% of 20 belt phases; step-cap hits (8 steps without passing) <= 1% of levels per mode, L1-L1300 |
| Relaxed: Careful-Bot wins within 3 x par | >= 95% of L1-60, >= 85% of L61-300 |
| Relaxed: Oma-Bot stuck events per level | Normal <= 0.5, Schwer <= 1.2, Sehr schwer <= 2.0 |
| Relaxed: level length (Oma-Bot) | Normal 4-10 min, Sehr schwer <= 18 min |
| Relaxed: median moves / par (Casual-Bot) | 0.9-1.2 |
| Skill shows | Profi-Bot >= 1.8 x Oma-Bot timed level score |
| Breather after Sehr schwer | Oma-Bot time-left fraction >= 45% |
| warnSpace hits (Oma-Bot, Normal) | <= 2 per level |
| Performance | frame p95 <= 20 ms at CPU x4; action <= 8 ms; idle relaxed 0 rAF/s; 0 of 200 belt picks missed at 120 ms latency |
| Unit tests | old 31 (18 unchanged, 10 rewritten, 3 extended) + about 65 new; `npm test` < 10 s (tail: L301-L303 per mode, once) |

Bots do not model visual confusion (silhouettes, confusable pairs, the dark layer); only the playtest catches it.

### 9.3 iPhone playtest checklist (owner first, then his mother; Safari from S3 and from `file://`)

1. L1-L3: drag feels direct, items >= 64 px tall, German text readable at arm's length without glasses (17 px floor).
2. L3: is the dark row understood before reading the coach mark? (watch, do not explain)
3. L6: bunny collected, then spent; the whole compartment empties (dark row included). Does that feel right?
4. L7: does she know when the lock opens (badge counts down on each Dreier)?
5. L12 / timed L12: take-only understood; bars come down; "Kein Platz mehr" appears when expected; Rückgängig works.
6. Fill the rack to 1 free slot: amber warning visible and understood.
7. Timed L12, L34, L60: grab a product from a moving shelf; no miss on 10 deliberate taps; tap-select, look away 5 s,
   tap a compartment: it moves.
8. L24 silhouettes: does she find the product from the shape? Is the colour misleading but fair? Count wrong guesses.
9. Orphan finish after a bunny spend: the level ends and feels "won".
10. Timeout: "+30 Sekunden" card readable; second timeout banks the Serie and keeps progress; wording understood.
11. Phone call / app switch / lock screen mid-level: auto-pause, belts frozen, resume exact; reload: same board, same
    barred cells.
12. Undo across a take: relaxed: the product returns to its moving cell, bars lift; timed: Rückgängig stops at the
    take and the bars stay. Is that understood (Q6)?
13. 20 minutes of timed play: phone not warm, battery drain < 6% per 20 min on an iPhone 12, no stutter.
14. Reduced motion on: belts usable, no bursts. "Regale stehen still" on (relaxed L41+): every cell visible.

Tuning order after the playtest (no structural change): τ slope, timed belt speed slope, combo window, F0, acceptance
windows, silhouette share.

---

## 10. Open questions for the owner (defaults are implemented unless he says otherwise)

1. **Side cells: one product or a small stack?** Your Lv.513 screenshots show a dark product behind most side products.
   Default: one product per side cell, bars after the take (as you described). The model already stores cells as
   stacks, so "2-3 products, bars after the last" costs one data field and one test.
2. **Horizontal shelves:** default = one more take-only conveyor row under the rack, moving left (the centre never
   moves, so drops stay easy). Or do the centre compartments themselves slide sideways in the original?
3. **Golden bunny:** default (your words: it "frees a compartment, clears it") = tap to collect it into the counter,
   then spend it on any compartment: that compartment is cleared completely, front and every row behind it.
   Alternatives: (a) clear only the front row (the rows behind move forward; keeps deep levels harder), or (b) act
   where it stands, clearing its own compartment immediately.
4. **Timed highscore as a "Serie":** progress is never lost; a second timeout or a restart banks the streak into the
   top 10. Is that the highscore you want? Alternative: a strict run from Level 1, with checkpoint starts at every
   10th level reached.
5. **Relaxed shelves:** standing still until L40, then a very slow drift (0.08 cells/s, switchable off). Or always still?
6. **Undo and the side shelves:** you said nothing taken from a side shelf can go back. Default: in "Gegen die Zeit"
   Rückgängig never undoes a take (the bars stay; undo works only back to the last take); in "Entspannt" Rückgängig
   may undo a take (the product returns to its cell, the bars lift), because that mode is meant to be forgiving for
   your mother. Should "Entspannt" also keep taken products for good?

Written-down defaults that are not questions: silhouettes from L24 with a share rising to 25%, never on confusable
pairs; deeper layers are never shown (count pips only if the setting "Tiefe anzeigen" is switched on, default off);
undo costs nothing (timed: not past a take, Q6); a lock or late shelf that can no longer open through matches opens by
itself (R-K5); timed depth 6 only on Sehr schwer from L201; no Einfrieren.
