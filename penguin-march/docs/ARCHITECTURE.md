# Architecture

Penguin March is a gate-runner for the browser. A waddle of penguins marches up a road. The player steers it left and right. The waddle passes numbered gates (`+k`, `-k`, `xk`, `/k`), shoots snow walls and seal packs, frees iced allies, collects fish, and at the end of each level fights a walrus. There are 50 hand-written levels, then generated levels without end. Between levels a three-upgrade shop makes the waddle bigger, its snowballs faster and its snowballs harder. Every 4th authored level and every 5th generated level is a riot level, where the numbers are large on purpose.

There is no build step and no runtime dependency. `index.html` loads 15 plain scripts from `src/`, in a fixed order. Each file attaches itself to one global object, `window.PM`. Under Node the same files load with `require`, which is how the tests run them.

## Folder layout

- `index.html`: the page. A canvas, the HUD and the menu layers, and the script tags.
- `src/`: the game. 15 scripts and `style.css`.
- `assets/sprites/`: 18 SVG sprites, loaded by name at runtime.
- `assets/icons/`: favicon, apple touch icon and the OG image (see DEPLOY.md).
- `tests/`: unit tests (`*.test.js`), `helpers.js`, and `browser/` (real Chrome tests and a preview tool).
- `docs/`: these documents, and `docs/preview/` (screenshots).
- `scripts/release.sh`: a thin wrapper. The steps live in the root `scripts/release.mjs`.
- `release.json`: what ships.

## Module map

The load order is the order of the script tags in `index.html`. Each module only reads what the modules before it put on `PM`.

`src/config.js` (`PM.config`) holds every tuned number, the level-count constants, `C.rng(seed)` (a small seeded generator) and `C.refShop(n)`. It is loaded first.

`src/sim.js` (`PM.sim`) is the rule set. It is pure: no DOM, no timers, no `Math.random`. It exports `create`, `step`, `run`, and the helpers `dps`, `shooters`, `target`, `overlap`, `packCount`, `applyGate`, `gateText`, `gateGood` and `bumpable`.

`src/bot.js` (`PM.bot`) holds the greedy steering policy `greedy`, a random-gate policy `random`, and `buyWhatYouCan`, the shop choice of a player who spends whenever they can. The greedy bot looks 55 units ahead. The tests and the preview tool use it as the solver.

`src/calibrate.js` (`PM.calibrate`) turns relative numbers into absolute ones by playing a level with the bot. It exports `calibrate`, `isRel`, `available`, `expectedN` and `contactZ`. See "Calibration" below.

`src/levels-data.js` (`PM.LEVEL_DATA`) is `{ v: 1, levels: [...] }`: the 50 authored level strings.

`src/knobs.js` (`PM.knobs`) maps a level number to the difficulty ranges used for generated levels. `PM.knobs.growth` is exported too.

`src/gen.js` (`PM.gen`) places the things of a generated level. It exports `generate(n)`.

`src/levels.js` (`PM.levels`) is the entry point for levels. `get(n)` returns the decoded, calibrated and validated level, cached in memory. It also exports `decode`, `encode`, `validate` and `LANE_X`.

`src/save.js` (`PM.save`) keeps progress in localStorage. It exports `load`, `save`, `clear`, `fresh`, `normalize`, `recordWin` and `buy`. See "Save" below.

`src/assets.js` (`PM.assets`) loads and rasterises the sprites. `get(name)` returns the bitmap or null, `aspect(name)` the height ratio, and `MANIFEST` maps each name to its file and raster width.

`src/audio.js` (`PM.audio`) plays 12 short sounds synthesised with WebAudio. It exports `unlock`, `play(name)`, `setMuted` and `isMuted`. The audio context is created on the first press or key.

`src/input.js` (`PM.input`) turns pointer drags and keys into a steering target. It exports `attach`, `target`, `set` and `reset`, plus the hooks `onPress` and `onKey`.

`src/render.js` (`PM.render`) draws a state on the canvas in fake perspective, and turns the sim's events into pops, shakes and confetti. It exports `init`, `resize`, `draw`, `events`, `toRoadX`, `project`, `fmt`, `banner`, `clearEffects`, `burst`, `size` and `roadW`.

`src/ui.js` (`PM.ui`) builds and shows the HTML layers: title, level map, shop, pause, end and HUD. It never touches the sim. It exports `init`, `show`, `hud`, `end`, `renderMap`, `renderShop` and `syncMute`.

`src/main.js` (`PM.app`) is the screen state machine and the loop. It boots on DOMContentLoaded. It exports `start`, `pause`, `resume`, `retry`, `next`, `quitToMap`, `showTitle`, `setBot`, and `reset`. The current screen is `PM.app.state` and the running sim is `PM.app.sim`.

`src/style.css` styles the menus. The world itself is drawn on the canvas.

## The sim contract

`PM.sim.create(def, upgrades)` returns a state. `def` is a calibrated level, `{ n, tag, length, bossHp, riot, entities }`. `upgrades` is `{ size, rate, dmg }`, each a shop level from 0 to 5. The def is not changed: the entities are copied.

`PM.sim.step(state, dt, targetX)` advances the state by `dt` seconds. The waddle moves toward `targetX`, clamped to the road and limited to `STEER * dt` per step. Main passes the current `x` when there is no target.

`PM.sim.run(state, policy, dt = 1/60, maxSeconds = 600)` calls `step` until the phase is `WON` or `LOST`, with `policy(state)` giving the target. It drops events as it goes.

The phases are `RUN` (walking), `BOSS` (the fight), `WON` and `LOST`. When the waddle is `BOSS_DIST` units before the end of the road, the fight starts: the remaining entities are removed, the waddle stands still, and the walrus walks in at `BOSS_SPEED`. The walrus takes damage from the start of the fight and eats `BOSS_EAT` penguins per second once it reaches the waddle.

State fields: `levelNo`, `tag`, `riot`, `length`, `phase`, `t` (seconds), `z` (distance along the road), `x` (sideways, -1 to 1), `n` (waddle size), `peak` (the largest size), `lost` (penguins lost to walls, packs and the walrus), `rate` and `dmg` (from the shop), `big` (the big penguin is freed), `entities` (z-sorted copies, each with `id`, `alive` and `hp0`; gates also carry `val0` and `hits`), `boss` (`hp`, `hp0`, `z`, `eating`), `coins` and `stars` (set on a win), and `events`.

A gate pair is one row. The waddle takes the side it overlaps more. On a tie it takes the right side only when it is right of centre.

Events are objects `{ type, z, x, text, good }` pushed to `state.events`. The types are `gate`, `bump` (a + gate was raised), `kill` (seals shot), `break` (a wall or pack is gone), `ally` (ice freed), `miss` (ice walked past), `hit` (a wall or pack cost penguins), `pickup` (fish), `eat` (walrus bite), `boss` (a periodic pulse for the screen shake), `bossStart` and `win`. Main hands them to the renderer and clears the list.

## Units

All hit points are in penguins. A wall showing 40 costs 40 penguins if it is not shot down. A pack of 12 seals costs 12, because each seal is `SEAL_HP` (1). Shooting uses the same unit, so "how much can the waddle shoot before contact" and "how much does contact cost" compare directly.

Each penguin fires `rate` snowballs per second, and each snowball does `dmg` penguin-units. The waddle therefore deals `dps = min(n, SHOOT_CAP) * (2 if big else 1) * rate * dmg` per second to the first thing in front of it that overlaps it sideways. The shop sets:

- `rate = BASE_RATE (1.6) * (1 + 0.2 * rate level)`
- `dmg = BASE_DMG (0.12) * (1 + 0.35 * dmg level)`
- the starting size is `START_SIZE[size level]`: 4, 6, 9, 13, 18 or 25.

The comment in `config.js` gives two checks: at shop 0 a waddle shoots about 0.9 times its own size off a wall while it walks up to it, and fully upgraded about 4.9 times.

Boss hit points are damage in the same unit. A level gives them as seconds of the waddle's fire (`~s`), and calibration multiplies by the dps at that point.

## Level strings

Each authored level is one string in `src/levels-data.js`. The grammar below is copied from the header of `src/levels.js`:

```
Authored format, one string per level:   tag|length|boss|token token ...
A token is  kind[lane]@z[:args]  with kind
  g   gate pair, args  left,right  where each side is +k, -k, xk or /k      g@40:+9,-10   g@40:x2,/2
  w   snow wall with hp, lane L, R or C (C = full width, the default)         wL@60:30   w@80:50
  p   seal pack of k seals, lane L, R or C (full width)                      p@90:8
  a   iced ally, args gift/lock: gift +k penguins or "big", lock = hp        aR@100:+12/25   aL@100:big/40
  f   chain of k fish starting at z, FISH_GAP apart, lane L, R or C          fC@120:12
Numbers can be relative to the waddle that arrives there (calibrate.js fixes them by playing the level):
  ~f on a wall, pack or lock: f times what the waddle can shoot off it on the way (w@60:~0.8)
  !b on a wall or pack: everything the waddle can shoot plus b times the waddle (w@60:!0.15 costs 15%)
  +~f / -~f on a gate, +~f on an ally gift: f times the waddle (g@40:+~0.5,-~0.3   aR@100:+~0.4/~0.5)
  ~s as the boss: s seconds of the waddle's fire when the fight starts (tag|300|~8|...)
z is the distance along the road; the boss waits at `length`, the fight starts BOSS_DIST before it, so every
token must sit between z = 2 and length - BOSS_DIST - 2. Lanes: L is x = -0.5, R is x = +0.5, C is x = 0.
```

Notes on the format:

- The tag is a label. `riot` also sets the riot flag.
- `validate()` enforces the z range above and that every number is absolute after calibration.
- `encode()` writes an absolute level back to this format. The tests check that every authored and generated level survives a round trip.

## Calibration

A relative number says how a thing compares with the waddle, not how many penguins it has. `calibrate(def, shop)` in `src/calibrate.js` turns those into numbers. `levels.get(n)` calls it for every level that has relative numbers, with `shop = C.refShop(n)`.

The reference shop is what a player is expected to own at level n. `REF_SHOP_LEVELS` lists the levels where one more shop point is expected: 3, 4, 5, 7, 9, 12, 15, 18, 21, 25, 29, 33, 38, 43 and 48. Each point goes to size, rate and damage in turn. So level 3 has one size level, level 4 adds a rate level, level 5 adds a damage level, and from level 48 on the reference shop is 5/5/5.

Calibration plays the level with the greedy bot in two passes.

- A relative thing gets a provisional number when it is 60 units ahead (`FIX_DIST`), so the bot can plan around it.
- It gets its final number when it is 34 units ahead (`REFIX_DIST`), from the size the waddle is then expected to have (`expectedN`: the better side of every gate pair in front of it).
- Pass 2 starts from the finals of pass 1 as provisional numbers, so the bot plays the level as it will ship.

What each form means:

- `~f` on a wall, pack or lock: `f` times the damage the waddle can deal before it arrives (`available`). The window is shorter when another row stands in front of it.
- `!b` on a wall or pack: that damage plus `b` times the waddle's size, so it costs `b` of the waddle.
- `+~f` on a gate or gift: `f` times the expected size, at least 1.
- `~s` as the boss: `s` seconds of the waddle's fire at the end of the dry run, or half the peak if the dry run was lost.

Calibration takes about 50 to 100 ms per level in Node.

## Levels after 50

`src/knobs.js` maps a level number to ranges. The growth `g = n - 50` rises linearly to level 150 and then slowly, as a square root. The share ranges for walls, lane walls, packs and gates ramp from their level-50 values to plateaus over 60 units of growth. The walrus fires for 12 to 14 seconds (level 50 asks for 15; it reaches the waddle after about 15). The road is `min(420, 365 + 0.4g)` units long and has `min(22, 19 + g/25)` rows before the boss, with at most three `x` gates per level. Riot levels use a fixed 20x gate and a rising `+` gate. The tests check that level 51 sits next to level 50 (walrus hit points within half to one and a half times, road not more than 20 units shorter).

`src/gen.js` places the things. `generate(n)` seeds the generator with `n * 7919 + 13`, so a level number always gives the same level. A regular level spreads its rows along the road with a little jitter. The first and last rows are gates. Rows 1 and 2 are gates, fish or allies. Later rows are weighted: about 36% gates, 20% walls, 18% packs, 12% allies and 14% fish, with no two packs and no two fish in a row. A riot level opens with two absurd gates and a 100-fish chain, then toy threats, and ends with an x3 and x4 gate.

Generated levels go through the same `calibrate` and `validate` as the authored ones. The tests play levels 51 to 300 with a maxed shop.

## Rendering

`src/render.js` draws in fake perspective. The header of the file gives the formula:

```
sx = cx + X * F / dz,  sy = horizon + CAM_H * F / dz,  with F = 0.85 * screen height
```

`dz` is the distance from the camera, which sits `CAM_BACK` (6) units behind the waddle and `CAM_H` (3.2) above the road. `horizon` is 27% of the screen height. A road position `x` in [-1, 1] is `X = x * ROAD_W` world units, where `ROAD_W` is 1.6 and is widened by up to 1.7 times on wide screens.

Everything that moves is a sprite drawn bottom-anchored at its projected foot and scaled by its world width. A missing sprite falls back to a flat shape. The waddle is a sunflower layout of up to `DRAW_CAP` (220) penguins. The badge shows the real count. Things more than 95 units ahead (`DRAW_FAR`) are not drawn.

## Input

`src/input.js` gives one steering target per frame.

- Pointer: press anywhere on the canvas and drag. The client x is mapped to road x at the waddle's depth (`render.toRoadX`) and multiplied by `GAIN` (1.35). A finger at 74% of the half width already reaches the edge.
- Keys: the left or right arrow, or A or D, pushes toward that edge while it is held. A key press clears the pointer target until the next drag.
- Escape or P pauses and resumes (in `main.js`). The pause button does the same.

## Save

Progress lives under one key, `penguinMarch.v1`, as JSON:

```
{ v: 1, reached: 3, stars: { "1": 3, "2": 1 }, coins: 80, upgrades: { size: 0, rate: 0, dmg: 0 }, muted: false }
```

`save.load()` never throws. `normalize` keeps the usable fields (`reached` at least 1, stars from 1 to 3 for numeric level keys, coins as a non-negative whole number, shop levels from 0 to 5, `muted` as a boolean) and starts fresh for anything else. The save is written on a win (`recordWin` keeps the best stars, unlocks the next level and adds the coins; a level already won pays a quarter of its coins again, and `recordWin` returns what was awarded), on every purchase, and on a sound toggle.

The key starts with the game prefix, as the Storage section of the root README requires. `scripts/check-storage.mjs` enforces that. The README also names a `.run` key for a level in progress. This game has no such key, so a reload during a level returns to the title.

## Tests

`npm test` runs the Node tests in `tests/*.test.js`. `tests/helpers.js` loads every module, decodes an absolute level string (`level(str)`), plays a level with a policy (`play`) and provides a fake storage (`fakeStorage`).

- `tests/sim.test.js` (13 tests) checks the rules on tiny hand-made levels: gate sides and the four operators, the tie in the middle of the road, `+` gates stopping at double while `x` and minus gates stay fixed, walls before and after contact, lane walls, packs that move, die and bite, allies that give penguins or the big penguin and the miss, fish, the boss start, win and eating, stars, the event shape, determinism, and the shooter cap with the big penguin.
- `tests/levels.test.js` (9 tests) checks that all 50 authored levels decode, validate and round-trip through `encode`; that generated levels are deterministic and round-trip; that the reference shop never runs ahead of the shop the bot's economy gives; that the greedy bot wins every authored level with the shop its economy affords and with exactly the reference shop; that a random-gate bot loses at least half of the non-riot levels from level 5 on; that a maxed shop wins levels 51 to 300, with riot levels peaking at 500 or more; that the first ten generated levels win with a 5/5/4 shop; and that the knobs are monotone after level 50 and keep the walrus under 15 seconds of fire at level 400.
- `tests/save.test.js` (3 tests) checks the round trip and the key prefix, broken and foreign values, and buying.

`VERBOSE=1 npm test` prints the level curve from `levels.test.js`: every authored level (tag, result, size, peak, lost, time, stars, walrus hit points, shop, coins), and every tenth generated level from 51 on.

`npm run test:browser` runs `tests/browser/run.js` in the system Chrome. `tests/browser/chrome.js` finds it through `CHROME_PATH`, then Playwright's Chrome channel, then the usual install paths. The run boots the page and checks that every sprite loaded. It steers by pointer and by keyboard, pauses, plays level 1 to the end by mouse, buys an upgrade and reloads to see it saved, loses a hard level, checks the layout at three phone sizes, a tablet and a desktop size, and fails on any page or console error. It also writes `tests/browser/artifacts/game-play.png`, and copies it to `docs/preview/game-play.png` (the OG image source) when that is missing or `UPDATE_PREVIEW=1` is set. `tests/browser/serve.js` is the static server it uses.

`npm run preview [level] [width height]` runs `tests/browser/preview.js`. It plays a level with the bot and writes screenshots to `tests/browser/artifacts/preview/` (or `OUT=<dir>`).

## How to change things

- **Tune a number:** change it in `src/config.js`, then run `npm test`. Relative numbers in levels calibrate again by themselves. Absolute ones, such as `x2` or `+1000`, do not.
- **Edit a level:** change its string in `src/levels-data.js` and keep the grammar. `npm test` checks that it decodes, validates and is won by the bot. `VERBOSE=1 npm test` shows where it sits on the curve.
- **Change difficulty beyond level 50:** change the ranges in `src/knobs.js`. Placement is in `src/gen.js`. `npm test` runs the maxed-shop check up to level 300 and the monotone check.
- **Add a sprite:** put the SVG in `assets/sprites/` and add `name: ['file.svg', rasterWidth]` to `MANIFEST` in `src/assets.js`. Draw it with `A.get(name)` in `src/render.js`. `release.json` already ships `assets/sprites/*.svg`. The browser test fails if a manifest entry does not load.
