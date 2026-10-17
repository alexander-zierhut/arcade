# How to change things

Everything is plain files; edit, reload. No build. Run `npm test` after a rules change and `npm run test:browser`
after a view change.

| I want to… | Where |
|---|---|
| change a number (combo window, points, time warning, undo cap, tap slop) | `src/config.js` |
| change the difficulty curve of levels 1-60 | the `TIMED` / `RELAXED` rows in `src/game/gen.js` (one line per level, columns explained above the table), then rebake |
| change the curve beyond level 60 | `knobs()` formulas in `src/game/gen.js`, then rebake |
| change belt speed, time limits, star thresholds | `src/game/rules.js` (`speed100`, `timeLimitS`, `stars`); no rebake needed |
| change scoring | `src/game/score.js` and `rules.js` (multiplier) |
| edit an authored level 1-6 | `AUTHORED` in `src/game/levels.js` (letters = types, `.` hole, `*` bunny, `/` next layer), then rebake |
| rebake levels | `node scripts/build-levels.js 300 both` (cached per level in `scripts/.cache/`; `--fresh` ignores the cache; `--no-windows` skips the acceptance windows) |
| add or redraw a product | `assets/items/<id>.svg` + its manifest in `assets/items/manifest/`, check with `node tests/items-check.js`, then `node tests/browser/items-render.js` (geometry + contact sheet) and `node scripts/build-catalog.js` |
| change German or English texts, coach marks | `src/ui/strings.js` |
| change when a coach mark appears | `TIPS` in `src/app/run.js` |
| tune the clock after a playtest | `tauMs`, the slack and the minimums in `rules.timeLimitS`; the belt-wait share in `levels.timeMs`; no rebake |
| change which levels are turbo or how fast | `rules.isTurbo`, the factor and cap in `rules.speed100` |
| prefer other products in levels | the `TIER1` / `TIER3` category lists in `scripts/build-catalog.js`, then `npm run catalog` |
| change the look of the cabinet, items, belts, HUD, cards | colour tokens in `src/style/base.css`; `board.css` (cabinet, boards, compartments, shadows), `belts.css`, `hud.css` (band, pills, bottom row), `overlays.css` |
| change how products are drawn | `docs/ART-STYLE.md` (binding look) and `docs/ART-SPEC.md` (file rules); the validator in `tests/items-check.js` enforces the v3 rules |
| change how many side cells are visible | they equal the rack rows (`computeGeometry`); the drift speed for belts that must scroll in still levels is `DRIFT100` in `src/ui/board.js` |
| change how large products are | `TARGET_W` (share of a slot a product fills in width, 0.90) and `MAX_H` (row height in slots, 1.7) in `src/art/sprites.js`; the per-product scale comes from the measured `w`/`h` in the catalog (`npm run items`, then `npm run catalog`) |
| change paddings, belt width, visible cells of the bottom shelf, the largest slot | the constants at the top of `src/ui/board.js` (`PAD`, `GAP`, `BELT_W_K`, `H_VISIBLE`), `SLOT_MAX_PX` in `src/config.js` |
| change how forgiving drops and taps are | `compNear` / `dropTarget` in `src/ui/board.js` (snap radius 0.55 of a row), `TAP_SLOP_PX` in `src/config.js` |
| switch or add a product set | `SS.sprites.setFlat`, `assets/items-2d/` (flat set), `geometry-2d.json` and `w2`/`h2` in the catalog; the setting is `save.flatIcons` |
| change the what's-new card | `whatsnew_text` in `src/ui/strings.js`; it shows once per `VERSION` to players with progress (`save.seenVersion`), new players get the NEU badge on the title until they open it |
| change the "Als App spielen" card or fullscreen | `install_text` in `strings.js`, `main.setFullscreen`, `manifest.webmanifest` (display, colours, icons) |
| change silhouette colours or rules | `SIL_PALETTE` and `skin()` in `src/game/levels.js` |
| change what counts as a confusable pair | `confusablePairs()` in `src/game/gen.js` and `pickProducts()` in `levels.js` |

## Testing a level directly (debug mode)

Open the game with `?level=34&mode=timed` (or `mode=relaxed`): the level loads straight away in **test mode**. Nothing is
recorded (no progress, no highscores, no stored board), "Nächstes Level" continues in test mode, "Zum Menü" leaves it.
Example on the dev server: `http://localhost:8765/?level=27&mode=timed`.

Levels that introduce something (play these to check a feature):

| Level | What is new there |
|---|---|
| 1, 2 | tutorial: drag (1), tap-to-move (2); rack A4, A5, no belts |
| 3 | back layers (dark row behind) |
| 6 | golden bunny in a back layer |
| 7 | first locked compartment (chain, opens after 2 matches) |
| 10 | first "Sehr schwer" (A9, three layers) |
| 11 | first "Verschnaufpause" |
| 12 | side shelves: timed moving at 0.2 cells/s with 1 hidden cell, relaxed standing still (all cells visible) |
| 15 | first "Schwer" with belts |
| 20 | rack A10 (6 rows), 8 visible belt cells |
| 23 | timed: the bunny rides on a belt |
| 24 | silhouettes (exactly 2 products shown as flat shapes) |
| 27, 37, 47, … | timed: **Turbo-Regal** (Turbo shelf) (belts at 1.8x, 1.08 to 1.8 cells/s; v0.3.2, was 3x / 1.8 to 3) |
| 31 | timed: belts speed up during the level (ramp up to 1.3x with the matches) |
| 34 | timed: the bottom shelf appears after half of the matches ("Nachschub!") |
| 40 | timed: the bottom shelf is there from the start; also the densest "Sehr schwer" with everything |
| 41 | relaxed: side shelves start drifting slowly (0.08 cells/s); timed: 2 hidden cells |
| 42 | two locked compartments |
| 50 | relaxed: six layers deep |
| 61 | first generated-by-formula level (the tables end at 60) |
| 101 | timed: bottom shelf on every normal level, 3 hidden cells from 81 |
| 301 | first level generated at runtime (beyond the baked 300) |

Moving a product to a free slot of its own compartment is a free rearrangement (`board.canShift`/`shift`): it does not
count as a move and has no undo entry. Only moves between compartments (and takes from belts) are moves.

Rules that must stay true (the tests enforce them): every shipped level has a witness that replays through both the
independent checker (`tests/helpers/replay.js`) and the real rules; `progressPossible` agrees with an exhaustive search;
types always come in multiples of three; the pure modules never touch the DOM.

## Update safety (what keeps a player's progress through updates)

Progress lives in the browser's localStorage, per origin. These rules keep it through every future version:

1. **Never rename `STORAGE_KEY`** (`supermarketSorter.v1`). The `v1` in the name is the key's name, not the record's
   version; the record carries its own `v` and `normalizeSave` migrates older records (v1 and v2 today). When you add a
   field, give it a default in `normalizeSave`; when you change the shape, bump `SAVE_VERSION` in `save.js` and add a
   migration branch. A record from a *newer* version is read as-is with unknown fields ignored, so a downgrade is harmless.
2. **Levels are identified by (mode, number).** Adding levels, re-baking, changing knobs, products or the generator keeps
   the reached level, the per-level bests and the highscores. Only bump `GEN_VERSION` when generation changes (it is part
   of the level seeds) so that the tail stays deterministic per version.
3. **`RULES_VERSION`** only guards the board in progress: bump it when a stored board (snapshot of `SS.game`) can no longer
   be restored by the new rules. The player then restarts that one level from its intro card; nothing else changes.
   Do not bump it for balance changes (time limits, speeds, scores): they are computed at runtime.
4. **Products**: a removed product id in an old board shows a placeholder sprite instead of crashing (`sprites.js`).
5. **Export / import**: Settings → "Spielstand sichern" writes a JSON file with `app`, `format`, `version`, `saveVersion`
   and `rulesVersion`; "Spielstand laden" merges it in (progress only ever grows; boards in progress are restored when
   the rules version matches). `tests/fixtures/export-v<version>.json` is the export of each released version and
   `tests/export.test.js` imports every fixture: **add a fixture for every release and never delete one**, so the test
   proves that the current version still reads every older file.
6. **Deploy with `Cache-Control: no-cache`** (see DEPLOY.md) so a new version loads on the next reload while the saved
   progress stays in the browser.

## Proving a refactor changed nothing

`node tests/golden.js <tag>` writes `docs/proof/golden-<tag>.json`: one hash each for the baked level data, the
skinned levels a player gets, scripted game traces (moves, collects, a spend, undos, ticks), runtime generation,
the rules tables, scoring, save import/merge and the stuck test on random boards. Run it before and after a change;
identical hashes mean identical behaviour of the whole pure core. For the view, take the same screenshots before and
after (title, a level intro, a played level) and compare pixels, not PNG bytes (the encoder is not byte-stable).
`docs/proof/golden-before.json` and `golden-after.json` are the records of the v0.2.0 refactor.

## Keeping it fast on low-end phones

`npm run perf -- --tag=<tag>` before and after a view change, then compare `docs/proof/perf-<tag>.json` (layouts, style
recalcs, trace buckets). The rules that the v0.3.1 pass established: animate only `transform`, `translate`, `scale`
and `opacity`; never animate `margin`, `filter`, `background` or `box-shadow` on anything that moves often; give bursts
and popups explicit keyframes through `element.animate` (keyframes that read CSS variables run on the main thread);
write the DOM only when a value changed (the HUD runs every frame in timed play); never set `playbackRate` on an
animation that already has that rate (it re-syncs every composited belt cell).

## Adding products

1. Draw to `docs/ART-STYLE.md` (the look) and `docs/ART-SPEC.md` (file rules, class box, natural proportions, parody
   rule), one SVG per product, a manifest per category. The v0.3 passes were done by agents with
   `--check-only --sheet` renders to look at; a new product also needs a flat version in `assets/items-2d/` (or it
   shows the placeholder there). No `<use>`, no black outline, gradients for volume (the validator enforces it).
2. `npm run items`: validator (text rules) and headless render (floor line, bounds, class box, contact sheets,
   `assets/items/manifest/geometry.json` for shape groups).
3. Put the category into `TIER1` in `scripts/build-catalog.js` if it is food, then `npm run catalog`.
4. `npm test` and `npm run test:browser`. No rebake needed: the skin picks products at runtime per level.

## Test suites and what they guard

| Suite | Guards |
|---|---|
| `npm test` | rules, generator invariants, every baked witness through the independent checker and the real rules, stuck test vs exhaustive search, save migration, export fixtures, purity and file-size rules |
| `npm run test:browser` | the real page on a simulated phone: drags, taps, belts, bunny, locks, timeout, Serie, stuck sheet, undo, export/import, viewports, frame timing |
| `npm run soak` | many levels through the app: DOM leaks, animations, heap, slow actions |
| `npm run golden -- <tag>` | behaviour fingerprint for refactors (see below) |
| `npm run perf -- --tag=<tag>` | performance at a 4x CPU slowdown; compare `docs/proof/perf-<tag>.json` before and after a view change. Rules that keep it fast: animate only `transform`/`translate`/`scale`/`opacity` (never `margin`, `filter`, `background`, `box-shadow`), explicit keyframes instead of CSS-variable keyframes, write the DOM only on change, never set `playbackRate` on unchanged animations |
| `npm run items` | every product sprite against the art spec and geometry |
