# Plate Loop: architecture

The rules (R1 to R30) are in `../../docs/plans/plate-loop.md` section 2 (the current text: a hidden piece ends a run,
R9 pouring only while the box can be completed, R10b completion preference, R12b a lid frees what is under it, R13b
hopeless positions are lost, R26 scheduled departures on reserved plates, R29/R30 hardness and the curve). The module contract
is [API.md](API.md), the sprite spec [ART.md](ART.md). This page says which file does what, how an event travels from
a tap to the screen, and where API.md is out of date (the code is the truth).

## Layers

```
engine/   pure state machine: model (parse, validate, hash), rules (R5-R21), belt (per-plate geometry), sim (real-time driver)
levels/   layouts (belt path + box slots, design units), levels-001-100 + levels-101-500 (frozen data), seeds (table of 1-100)
gen/      rng, solver (abstract search + analyze), bot (replays in the real sim), generator (reverse play + modifiers + hardness search + codes), worker (the search thread)
render/   layout (design units to pixels), sprites (SVG to canvas), scene (draws sim state, animations)
ui/       strings (de, en), save, input (pointer to box), screens (title, cards, pill)
audio/    synthesised sounds
main.js   boot, state machine, game loop; window.PlateLoop.app
scripts/  gen-levels.mjs, tune-levels.mjs (dev only, node; they load the files above through require)
```

Dependencies only point downwards in this list. `engine/`, `gen/` and `levels/` never touch `document`,
`window.Arcade` or timers and have no `Date.now` or `Math.random` (all randomness is seeded through `gen/rng.js`
or `model.permutation`), so the sim is deterministic (R24). `render/`, `ui/`, `audio/` and `main.js` never change
engine state; the scene only reads the sim. `src/config.js` is loaded first by everything.

## Files

| file | holds |
|---|---|
| `src/config.js` | `PL.config`: `STORAGE_KEY`, `VERSION`, `LAP_MS` (8000), `SLIDE_MS`, `MIN_N`/`MAX_N`, `KIND_NAMES` (index = sprite index), `KIND_COLOURS` (plate colour per kind), `TIERS` (the bands of plan 5.4) |
| `src/engine/model.js` | `parse(level, opts)` to a state, `validate` (R1-R3, R12, R13b, R15, R17, R19-R21 messages), `clone`, `hash`, `permutation(levelId, attempt)` (R23), `expose` (one piece: reveal, key release), `settle` (exposes front units until nothing changes), `frontUnit`, `isCovered` |
| `src/engine/rules.js` | `tap` (moves a run into the box's outbox), `canEject`, `ejectUnit`, `accepts`, `wouldLand` (the one landing predicate: R8, R9, R10b), `tryLand` (land, close, R12b expose everything under the lid, unwrap, thaw, unlock, reveal), `inTransit`, `isWon`, `isStuck` (R13), `deadKinds` / `isHopeless` (R13b), `runLength`, `freePlates`, pouring helpers. Mutate the given state, return events |
| `src/engine/belt.js` | the loop: N plates with their own arc positions (`pos`, unwrapped `up`), mouth crossings in time order (`advance`), `nearest` / `nextFree` free plate to a mouth, `dropBehind` / `teleport`, `reaching`, `nextFree`, `timeToMouth`. No piece state |
| `src/engine/sim.js` | `create`, `tap` (rules.tap, then reserves a plate per piece and schedules its departure), `tick(dt)` (sub-steps so no crossing is skipped, lands pieces, detects win and loss), `plates`, `nextEjectPlate` |
| `src/gen/rng.js` | mulberry32: `create(seed)` with `next/int/pick/shuffle`, `permutation(n, seed)` |
| `src/gen/solver.js` | `solve(level, opts)` (abstract search, one run in flight at a time, compact integer state), `applyMove` (same transition on a real state), `downstream`, `analyze` (the whole position graph: winning states, shortest depth, the win chance of a random mover, of a random tapper with natural landings and of lookahead players `look[k]` for k = 0..16 who avoid every move that is provably lost within k plies; Monte-Carlo when capped) |
| `src/gen/bot.js` | `certify(level, moves)` replays a solution in the real sim with real taps and kicks; `play(level, { skill })` with `perfect`, `greedy`, `sloppy` (the tuning bots) |
| `src/gen/generator.js` | `generate({ tier, seed, allow, layout, id, hardness, look, hardest, verify, buffer, candidates, budgetMs })` (buffer: 'require' / 'prefer' / null, plan R29c; a buffer level carries `buffer: true` and H 9; tight: the difficulty-10 recipe of R29d, `level.tight`, ranked by `grip(level, layout, plan)`): reverse-play deal (front runs capped by `TIERS.maxRun`), modifier placement (ice keeps a plain neighbour, pairs of two kinds, hidden pieces of a different kind than the piece in front), solve, metrics, band check, certify, with `hardness` a search over candidates for the window on the H of the `look`-move player, with `verify` the real-time bot stage (`botRate`, plan R29b); `hardness` (h for k = 0..16, plan R29), `DIFFICULTY` (the ten Endless difficulties), `encodeCode` / `decodeCode` / `replay` (level codes), `metrics`, `inBand` |
| `src/gen/parksolver.js` | the strict solver plus a parking lot (riders of up to N kinds that land whenever a box accepts them): `solve(level, { layout, from, capacity })`, from a real sim's position too; fast (level 150 in 1,900 nodes); `depth(level)` = the smallest lot capacity that still wins (0 strict, N = no slack); `analyze` = the lookahead players on the parking graph (study only: real levels cap at 150k states) |
| `src/gen/simsolver.js` | `playGuided(level)`: guided play on the real belt (re-plan with parksolver after every tap, follow the plan while taps are accepted); `certifyPlan(level, plan)` replays taps at their sim times (R24); the certificate of buffer levels (plan R29c) |
| `src/gen/worker.js` | `PL.search.run(msg, post)`: `init` (importScripts of the engine files the page names), `search`, `replay`; the same file is the Web Worker main.js starts for Endless, and the inline fallback |
| `src/levels/layouts.js` | `PL.layouts['ring-2col']` and `['counter']`: rounded belt path, box slots with mouth side and mouth arc length `s`, neighbours, `pointAt`, `project`, `measure`, `mouths` |
| `src/levels/levels-001-100.js` | `PL.levels` = levels 1-100, generated, frozen. `levels-101-500.js` appends 101-500 (`PL.levels = PL.levels.concat([...])`, `PL.levelsMeta.count = 500`); `index.html` loads both in that order |
| `src/levels/seeds.js` | `PL.seeds`: the seed table of levels 1-100 (id, tier, seed, allow, layout). Levels 101-500 have `scripts/level-plans/*.json` instead (id, tier, allow, layout, seed, note). Every level carries `hard` (its H) |
| `scripts/level-curve.mjs` | `target(id)`: the difficulty curve of the 500 levels (structure tier, H window, candidates, `hardest` spikes, `noHidden`, `fullAllow`); used by the generator script and the level tests |
| `scripts/gen-levels.mjs` | regenerates all 500 levels from the tables and the curve (a candidate search per level, about 25 minutes), writes both level files and both tables (tier and bumped seed written back); `--range 401-500` one range written, `--only 301-400` a dry run. `scripts/analyze-levels.mjs` prints the hardness of the committed levels |
| `scripts/tune-levels.mjs` | plays every level with the greedy and sloppy bots (3 seeds each) and writes `docs/levels-tuning.md` (tier means, flagged levels, one row per level). Only reports, never re-tiers |
| `src/render/layout.js` | design space 360 x 634 to pixels: `compute`, `sampler(template)`, `pt/rect/inv/arc` |
| `src/render/sprites.js` | loads every SVG of `assets/sprites/` it needs as text, rasterises each once into a canvas, `tinted(name, hex)` replaces `#FF00FF` (and `#CC00CC` darkened) for padlocks and key tags |
| `src/render/scene.js` | `create(canvas, template)`: counter, belt, box sprites (`box-open`, `box-closed`), square kind-colour plates, covers (cloth, ice, shutter), animations (trapdoors at departures). Two looks: `plain(true)` (flat colour cubes, simple boxes, glyph keys and padlocks) and `beltStyle('stream')` (no plates: a piece is a trail of particles, a landing sucks it into the box). Static layers are cached in offscreen canvases and rebuilt only when a signature changes |
| `src/ui/strings.js` | `de` and `en` tables, `t(key, vars)` (falls back to `en`, then the key), `apply(el)` fills `data-i18n`, `data-i18n-aria`, `data-i18n-title` |
| `src/ui/save.js` | `plateLoop.save` via `Arcade.storage`: `level` (highest cleared + 1), `attempts`, `endless` (best per difficulty 1-10, last difficulty, no-luck; the first beta's per-tier bests are moved over), `sound`, `plain`, `belt`, `seen.howto`, `levelsVersion` (2 since the rebuild; `migrated()` fires once for an old save); every read goes through `clean()` |
| `src/ui/input.js` | pointer events on the canvas to `scene.hit` to `onTap(boxIndex)`; taps only (short, little movement, single touch) |
| `src/ui/screens.js` | static markup in `index.html` filled and wired here: title, endless chooser (ten difficulties, forced no-luck, the code field), how-to cards, pause, settings (sound, graphics, belt, kit rows), win and lose cards (the level code to copy, the lose text per reason), level pill, free-slot counter (`setSlots`); calls `Arcade.screen` and `Arcade.share.set` |
| `src/audio/audio.js` | Web Audio synthesis, one voice per sound name, quieter in low-perf mode |
| `src/main.js` | boot (`?code=` in the address starts that level), state machine, rAF loop, rounds, endless (the search in a Web Worker with a progress label, or inline), level codes, `setPlain` / `setBelt`; exports `PL.app` |
| `src/style.css` | all styling; the `--arcade-*` variables theme the kit's cards |

`index.html` loads the kit, `news.js`, `Arcade.init`, then `src/` in the order: config, engine, gen, levels, render,
ui (strings, save, input, screens), audio, main. The gen files ship to the browser because Endless generates levels
at play time.

## Data shapes

Level (as in `levels-*.js` and the generator output): `{ id, tier, seed, layout, dir, N, kinds, boxes:
[{ id, pieces, mods }] }`. Pieces are listed back to front (last = front). Sugar: `3`, `'h:3'` hidden, `'k:A:3'`
key A on a kind 3 piece, `'hk:A:3'`, `['p', a, b]` bound pair. Mods: `lock`, `oneway`, `wrap`, `ice`. API.md section 2
has the full text. Fixed levels have ids 1 to 500; a generated (Endless) level has `id: 0` unless `generate` gets `opts.id`.

State (`model.parse`): `boxes[]` (each with `pieces`, `outbox`, `pending` (= `outbox.length`), `closed`, `wrap`, `ice`,
`lock`, `oneway`), `locks`, `belt` (N entries, piece or null), `pouring` (kind to box index), `closedKinds`,
`neighbours`, `index` (box id to index), `initialEvents`. Kind numbers in the level are structural; the picture comes
from `model.permutation(level.id, attempt)` applied by the scene (`scene.kindMap`).

Events (`{ type, ..., time }`): `tapped`, `eject`, `land`, `close`, `reveal`, `unlock`, `unwrap`, `thaw`, `refuse`,
`won`, `lost`.

## Event flow

1. **Tap.** `input.js` turns a pointer tap into `scene.hit(x, y)` (a box index), `app.tap(i)` calls `sim.tap`.
   `sim.tap` calls `rules.tap`: if `canEject` allows k pieces (R5: the run, a hidden piece ends it, limited by free
   plates; a pair needs two), they leave `box.pieces` into `box.outbox` at once, the new front is revealed and its key
   released right away (R7), and the box stops pouring. Events `tapped { box, k, pieces, plan }`, `reveal*`, `unlock*`.
   A refused tap returns `{ ok: false, reason }` and logs a `refuse` event; `main.js` flashes it (the box shakes) and
   plays the refuse sound for `full`, `pair`, `pending`.
2. **Reservation and departure** (R26), `sim.tap` and `sim.tick`. In the tap every piece in the outbox gets a reserved
   plate: the free, unreserved plate that reaches the mouth soonest (`belt.nextFree`, i.e. the nearest one behind it), so
   the player sees it coming. Unit j (a bound pair is one unit with two plates) is scheduled at `departAt = tap time +
   DEPART_FIRST_MS + j * DEPART_GAP_MS` (900 ms, then every 900 ms, strictly one by one). `tapped.plan` lists
   `[{ piece, plate, from, departAt }]` (`from` = where the plate is at the tap, layout arc length). Reserved plates
   ride empty and are not free for other taps (`reservedPlates`, `nextEjectPlate`). In `sim.tick` the belt is stopped at
   each `departAt` (`interval`, `departDue`, `depart`): the reserved plate is lifted and dropped just behind the mouth
   (`belt.dropBehind`: 0.5 units behind it, a pair mate one plate width further back, further still while another plate
   is closer than 0.9 width), `rules.ejectUnit` puts the piece from the outbox on it, and the event `eject { box, plate,
   piece, pair, from, to, teleported: true, departAt }` is stamped with `departAt`. `sim.skip[plate]` makes the first
   crossing of its own source mouth a departure, not a landing. Plates get uneven spacing over a level (intended).
3. **Tick.** `main.js` `frame(ts)` runs on `requestAnimationFrame` while the state is PLAY, WIN or LOSE (the belt keeps
   moving under the end cards), capped at 100 ms per frame, and pauses the game first when a kit sheet is open
   (`Arcade.sheetOpen()`: changelog, campaign, app hint). `sim.tick` splits dt into sub-steps of at most half a plate
   spacing, `belt.advance` moves every plate and returns the mouth crossings in time order; each crossing of a plate
   that carries a piece calls `rules.tryLand`.
4. **Landing.** `tryLand` asks `wouldLand` (R8 accepts; R9 a pouring box attracts its kind past other boxes only while
   count + pieces in transit can reach 4, `inTransit` counts plates and outboxes; R10b an empty box lets a piece ride on
   while some matching box can be completed; a box with a pending outbox lets pieces pass). On a landing: `land`,
   pouring is updated, four of a kind give `close` (R12), then every piece under the lid is exposed (R12b: `reveal`
   with its slot `index`, `unlock`), `unwrap` (R17) and `thaw` of neighbours (R18), and `model.settle` reveals and
   releases keys (R15, R19) until nothing changes.
5. **End.** After each crossing with events `sim` runs `rules.isWon` / `rules.isStuck` / `rules.isHopeless` and sets
   `status` to `won` or `lost` (R13 jam, R13b hopeless; the `lost` event carries `reason` and, for R13b, `kinds`);
   `isStuck` uses the same `wouldLand`. `tick` returns the events stamped with the instant of their crossing.
6. **Screen.** `main.js` hands every event to `scene.flash(ev)` (animation queue) and `audio.play` (map `AUDIO_OF`; a
   successful tap plays `eject` once, from `app.tap`). On `won` or `lost` it waits 600 ms, then `finish()` saves
   progress (`save.cleared`, `save.bestStreak`) and shows the win or lose card via `screens.show`. `scene.render(sim,
   dt)` draws the current state plus running animations and never writes to the sim.
7. **Kit.** `screens.show` calls `Arcade.screen('title' | 'menu' | 'play' | 'pause' | 'win' | 'lose')`; only the play
   state reports `play`, so the kit's play time counts real play. The share line is set when a win or lose card opens.
   `Arcade.ready()` is called once the sprites and the `<img>` assets loaded (or after 9 s, with `app.assets.failed` set).

Round start (`startRound`): `save.attempt(id)` (level mode) or a counter (endless) gives the attempt number,
`sim.create` + `scene.create`, `kindMap = model.permutation(level.id, attempt)`, then the how-to cards for mechanics the
player has not seen (`screens.unseen`), then PLAY. A level restarts from scratch on reload or retry: mid-level state is
not saved. Progress past level 500 wraps to the Endless chooser (`next()`), `levelsTotal()` is `PL.levels.length`.
Endless (`startEndless(difficulty, noLuck)`): `nextRound` sends `{ cmd: 'search', tier, seed, allow, hardness, hardest,
candidates: 150, budgetMs }` (from `generator.DIFFICULTY`) to the search worker (`src/gen/worker.js`, started once with
the page's own script addresses so content-hashed file names work; inline in a `setTimeout` when there is no Worker)
and shows the progress on the Go / Next button ("Searching for a level … 37 (best 3.4)"); the reply's level gets a code
(`generator.encodeCode(difficulty, noLuck, level.seed)`, shown on the end cards and in the share text with `?code=`).
Favourites (`save.favs`, `save.toggleFav` / `isFav`; `screens.currentFav` says what the star on the pause and end
cards refers to; the favourites card plays a fixed level with `app.start(id)` and a coded one with `app.playCode`).
Replays: `rec` in main.js collects every frame's dt while the state is PLAY (and during the end delay) and every
accepted tap as `{ i: frame index, box }`; `watchReplay` builds a fresh sim and scene of the same level and kind
permutation and sets the state REPLAY, `replayFrame` runs `speed = ceil(total / 30 s)` recorded frames per real frame
(taps applied before their frame), muted, the scene rendered with the sim time advanced; `stopReplay` (end of the
recording + 1.2 s, the pause button, Escape) shows the end card again from `lastEnd` without touching progress.
`playCode(code)` replays a code (`cmd: 'replay'`) as the first round of a run at that code's difficulty and with its
mechanics (the code's flags name the mechanics switched off; the chooser's "Advanced" chips set them, saved as
`endless.disabled`). The hunt (`startHunt`) sends 2.5 s chunks with `hardest: true` without end, keeps the overall
best and reports candidates / best H / time of the last new best to `screens.huntStatus`; `huntPlay` starts the best
(after the running chunk returned), `huntStop` and leaving the chooser drop it. A stale reply (the player left the
chooser) is dropped by a token. Only the basics card is shown in Endless.

### The picture (scene.js)

Plates are rounded squares drawn by the scene: cream when empty, a solid kind colour (`KIND_COLOURS` through the
permutation) when carrying a piece, steel for a hidden piece. Boxes are the `box-open` / `box-closed` sprites (132 x 44
units, mouth on the right, mirrored or rotated per slot) with the pieces on tile wells. The `tapped` event carries
the plan and the scene animates it: the piece slides slowly out of its box slot over the whole wait (until `departAt`);
during the last `HATCH_MS` (380 ms) its reserved plate sinks through a trapdoor where it is (the engine moves it to the
mouth at `departAt`) while a plate rises through a trapdoor at the mouth and takes the piece's colour, so the piece
arrives exactly on it when the engine's `eject` happens. No plate ever travels faster than the belt. A landing piece
slides into the box over `LAND_MS` (800 ms, visual only; the engine lands it at once).
Plain graphics (`plain(true)`, saved as `plain`): no sprites on the tiles (the colour tile is the cube), "?" tiles for
hidden pieces, flat slate boxes with slot wells and a check mark on a closed lid in the kind's colour, a solid cloth,
flat ice, glyph padlocks and keys, a striped post for one-way boxes. The stream belt (`beltStyle('stream')`, saved as
`belt`): no plates are drawn; a piece on the belt is a trail of 34 particles behind its plate's arc position (seeded
per piece id), poured out at belt speed from the `eject` time; a landing (`land`) leaves a drain: the trail keeps
flowing into the mouth and vanishes there; the band shows free/total slots (`screens.setSlots`, updated every frame
by main.js) and turns red when full. Plain graphics always use the stream: there are never plates with plain cubes. `scene.staged()` counts pieces still sliding out
(tests use it), `scene.platePoint(i)` and `mouthPoint(box)` give pixel positions for the browser tests.
Performance mode: `Arcade.perf.low()` is read at boot and on `Arcade.on('perf')`; the canvas ratio drops to 1 and the
scene drops shadows, particles, steam, the jiggle and the plate streak, and redraws at most about every 28 ms.

## Certification (what makes a level shippable)

`generator.attempt` deals by reverse play, places modifiers, runs `solver.solve`, checks `inBand`, then `bot.certify`
replays the abstract solution in `PL.sim` with real taps. Only certified levels are produced. The solver's model is an
abstraction: one run in flight at a time, the run goes to one destination box downstream, kicks only pass through
*empty* boxes. So a level the solver calls unsolvable could still be won by juggling several runs; the other direction
holds (solved and certified means winnable). The bot is the judge of whether the player can do it. If you change
`rules.js`, `belt.js`, `sim.js` or `layouts.js` (mouth positions change the downstream order), regenerate and
re-certify the fixed levels (`node scripts/gen-levels.mjs`, `--legacy` for 1-100).

## Where API.md is out of date

API.md was the brief and has been patched for the outbox and `rules.tap`, but these parts still describe the model
before the first playtest. The code wins.

- Section 4, "Exact R9": the real rule is `rules.wouldLand` (conditional pouring and R10b, see above). `tryLand` returns
  `[]` while the box has `pending > 0`. Extra exports: `pendingUnit`, `syncPending`, `endPouringOf`. `isStuck` can also
  be true with free plates (nothing can land and no box can be tapped, e.g. only pairs that do not fit).
- Section 5 (belt) and 6 (sim): plates have individual positions (`b.pos[i]`, `b.up[i]`), not `phase + i * spacing`;
  new `nearest`, `dropBehind`, `teleport`; `advance` crossings carry `at`. `sim.tap` moves the run into the outbox,
  reserves plates and schedules the departures (steps 1-2 above) and returns `{ ok, k, reason, events }`; `tick` stops the
  belt at each `departAt` to run the departures and otherwise only lands pieces; `tapped` carries `plan`, `eject` events carry
  `from`, `to`, `teleported`, `departAt`; new config `DEPART_FIRST_MS`, `DEPART_GAP_MS`, `LAND_MS`. `sim.create` also takes
  `opts.mouths` and `opts.plate`; extra `nextEjectPlate`.
- Section 3: `model.parse(level, opts)` takes `{ layout, neighbours, raw }`; the state also has `index`, `neighbours`,
  `nextPieceId`, `initialEvents`; `model.pieceId` is a function `pieceId(state)`. Extra exports `settle`, `frontUnit`,
  `isCovered`, `pub`.
- Section 8: `scripts/gen-levels.mjs` (not `src/levels/gen-levels.mjs`) writes `levels-101-500.js` from
  `scripts/level-plans/*.json`; `--legacy` rebuilds 1-100 from `seeds.js`; `PL.levelsMeta` is `{ generated, count }`.
  `generator.metrics(level, solution, layout)` takes the layout, `generate` also takes `id` and returns `attempts`; solver
  moves may carry `dest2` and `solve` takes `optimal`, `slack`, `step`; `bot.certify` takes `trace`.
- Section 10: `scene.render(sim, dtMs, now)` has no `fx` argument (animations come from `scene.flash(event)`); extra scene
  controls `resize`, `noLuck`, `kindMap`, `invalidate`, `layout`, `boxRect`, `stats`, `staged`, `platePoint`, `mouthPoint`.
  `sprites` loads the kinds plus `plate cloche clip padlock keytag noreturn stamp box-open box-closed`; `bell`, `chef`,
  `logo`, `icon` are plain `<img>` files. Audio names are `eject land close refuse reveal unlock unwrap thaw win lose tap`
  (`tap` is never played); `setMuted` writes the flag to `plateLoop.save` and also to a separate `plateLoop.sound` key.
  `save` also holds `endless.tier`, `endless.noLuck`, `seen.howto`. `app.state` can also be `'HOWTO'`; `'MODES'` is derived
  from the open card.
- Kind colours: `config.KIND_COLOURS` (copied as `DEFAULT_COLOURS` in `scene.js`) differs from the hex values in API.md
  section 1 and in the "kind colour (for tints)" column of ART.md; the code's list is the one in use.
- Stale comments: the header of `tests/browser/scene.spec.js` says the pieces leave "at once" at the tap; they now leave
  on the 900 ms schedule.
