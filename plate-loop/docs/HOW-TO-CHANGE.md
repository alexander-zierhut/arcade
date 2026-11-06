# Plate Loop: where to change what

After any change run `npm test`; for anything the player sees also `npm run test:browser` (about 2.5 minutes) and look
at it on a 360 x 678 phone. `tests/browser/render-check.html` (serve the game folder, open it) draws
the scene for both layouts with buttons for every effect, in low-perf and no-luck variants: use it for art and
scene changes without playing a level.

## A kind's art (one of the 12 sushi pieces)

1. Edit `assets/sprites/<name>.svg` (names and order in `config.KIND_NAMES`; index = sprite index). Follow
   [ART.md](ART.md): viewBox `0 0 64 64`, flat shapes, ink outline `#2A1A12` width 2, no text, gradients, filters,
   images, under 8 KB, ids prefixed with the file name.
2. Check it: `node scripts/render-svg.js --check assets/sprites/<name>.svg` (lint) and
   `node scripts/render-svg.js /tmp/sheet.png 96 assets/sprites/*.svg` (contact sheet on the counter colour).
3. Piece sprites are loaded by name from `PL.sprites` (`KINDS` + `PROPS` in `src/render/sprites.js`). A new prop
   sprite must be added to `PROPS`, otherwise it is never loaded; a sprite used only in markup (`logo`, `chef`,
   `bell`, `icon`) is a plain `<img>` in `index.html` or `screens.js` and needs no entry. Adding a 13th kind is
   more than art: `KIND_NAMES`, `KIND_COLOURS`, `config.TIERS` (kinds range), the permutation size
   (`model.permutation` uses `KIND_NAMES.length`), the title belt list `BELT_PIECES` in `screens.js` and the
   generators' kind limits.

## A box, a plate

The takeaway box is the pair of sprites `assets/sprites/box-open.svg` and `box-closed.svg` (viewBox `0 0 132 44` = the
box rectangle, mouth on the right; ART.md has the geometry: the four slot wells are 29 units apart and the renderer
lines pieces up with them). The scene mirrors or rotates them per slot. Plates are not sprites: the rounded squares
are drawn by `squarePlate` / `colourPlate` in `src/render/scene.js` (`plate.svg` is only used on the title belt and
the how-to cards). The departure animation (the piece sliding out of its box; the reserved plate sinking through a
trapdoor where it is while a plate rises at the mouth, `HATCH_MS`) is in the `tapped` / `eject` branches of `processQueue`
and in `drawPlatesAndFlights` in the same file. Two switches change the picture without touching the engine:
`scene.plain(true)` (flat colour cubes, simple boxes, "?" tiles, glyph keys and padlocks; every `plainOn` branch) and
`scene.beltStyle('stream')` (no plates drawn: a piece on the belt is a trail of particles behind its plate's position,
`drawStream` / `drawDrains`; the band shows the free-slot counter `#slots`). Both are settings rows and saved
(`plain`, `belt`); plain graphics always use the stream (Alex: plates make no sense with plain cubes), so the belt
row is forced to "stream" and disabled while plain is on (`scene.plain` sets `streamOn`, `main.beltStyle()` reports
'stream').

## A colour

- The colour of the square plate under each kind (belt and box wells): `config.KIND_COLOURS` (same order as `KIND_NAMES`). `scene.js` has a
  fallback copy `DEFAULT_COLOURS`; keep them equal. Pick colours that differ by hue from each other, not from the
  food: the shape is what tells kinds apart for colour-blind players.
- Scene colours (counter, belt, kraft boxes, steel, ice, strip green and red): the object `C` at the top of
  `src/render/scene.js`; the same values appear in [ART.md](ART.md) and in the SVGs.
- Lock colours (A to D): `LOCK_COLOURS` in `scene.js`, `LOCK_COLOURS` in `sprites.js` (preloaded tints) and
  `LOCK_COLOUR` in `screens.js` (the how-to card). Keep the three in step.
- UI colours: the `:root` variables at the top of `src/style.css` (`--arcade-*` also theme the kit's cards). Tier
  colours: `--tier-easy` to `--tier-extreme` there (the pill and the endless chooser).
- Browser chrome: `theme-color` in `index.html`, `theme_color` and `background_color` in `manifest.webmanifest`.

## A layout (belt path, box positions)

`src/levels/layouts.js`: the functions `ringTwoCol()` and `counter()` build the rounded belt path, the box slots (`x, y,
w, h, mouth`), the mouth arc length `s` (computed from the path) and the neighbour lists (they drive ice, R18).
`tests/layouts.test.js` pins the invariants: slot counts, sizes, boxes inside the board with an 8 unit margin,
clearance from the belt, no overlaps, `s` monotone, symmetric neighbours. A new template goes into the `layouts`
object and into `list()`. Slot ids are what levels refer to, so renaming a slot or moving a mouth along the belt
changes the downstream order and can break certified levels: regenerate and re-certify all fixed levels afterwards
(next section; both plan files and `seeds.js` must still produce certified levels). Design space is 360 x 634 units; `render/layout.js` scales it to the viewport.

## A level (the 500 fixed levels)

Never edit `src/levels/levels-001-100.js` or `levels-101-500.js` by hand; both are generated and carry a header saying so.

- The difficulty of every level comes from `scripts/level-curve.mjs` (`target(id)`: structure tier, hardness window,
  candidates, `hardest` for the spikes, `noHidden` and `fullAllow` at the top). Change the curve there; the tables only
  hold the seed, the allowed mechanics, the layout and (written back) the tier.
- Levels 1-100: the seed table `src/levels/seeds.js` (`id, tier, seed, allow, layout`). Levels 101-500: one row per
  level in `scripts/level-plans/101-200.json` ... `401-500.json` (`id, tier, allow, layout, seed, note`; the note says
  what the level is for, e.g. "Lock week" or "Breather"). Change a row or the curve, then `node scripts/gen-levels.mjs`
  (all 500, about 25 minutes: every level is a candidate search; writes both level files and both tables),
  `--range 401-500` to regenerate and write one range (the rest is kept), or `--only 301-400` to try a range without
  writing anything.
- The script builds each level with `generator.generate({ hardness })` (up to 80 certified candidates, 200 for a
  spike, the first inside the window or the closest), checks the introduction schedule, and exits 1 if a level fails.
  A seed whose search misses is bumped (seed + 1, ..., six tries) and the working seed is written back into the table,
  so the table always reproduces the data; a level may end up to 0.3 under its window when nothing better was found
  (the log says "kept the hardest search result"). Review the diff of data and table together and commit them
  together. `node scripts/analyze-levels.mjs [lo-hi]` prints the hardness of the committed levels.
- `tests/levels.test.js` validates all 500 levels (also: nothing hopeless at the start, every frozen box has a plain
  neighbour), re-certifies a subset (1-100, every 7th of 101-500, every 25th), checks the introduction schedule
  (hidden 6, pairs 12, wrap 18, one-way 28, ice 35, locks 42), the curve (tier, window, spikes towering over their
  neighbours, nothing hidden at the top, the stored `hard` equals the analyser's) and regenerates a sample of 8 from
  the tables, so a hand edit fails it.
- Level numbers are the player's progress (`plateLoop.save.level` is a level number): change levels in place, add new
  ones at the end, never insert in the middle.
- Tuning: `node scripts/tune-levels.mjs` plays every level with the greedy and sloppy bots and rewrites
  `docs/levels-tuning.md` (tier means and flagged levels: an easy level the greedy bot often loses, an extreme one it
  often wins). It only reports. To act on a flag change the row's tier or seed in the table and regenerate.

## A tier band (what Easy, Normal, Hard, Extreme mean) and a difficulty

`config.TIERS`: N, number of kinds, extra boxes, empty boxes at the start, share of hidden pieces, number of
modifier kinds, each a `[min, max]`, and `maxRun` (the longest run a box may start with at its front): the
*structure* of a level. `generator.inBand` enforces them. How hard a level is to win is a separate measure, its
hardness H_k for a player who looks k moves ahead (plan R29, `generator.hardness` returns `h` for k = 0, 2, 4, 6,
8, 12, 16); the ten Endless difficulties are `generator.DIFFICULTY` (structure tier + `look` + H window + search
budget in ms, `noLuck` forced on 9 and 10, `hardest` on 10). The deeper the lookahead, the lower the numbers: the
windows of one k are not comparable with another's. Yields (extreme structure, 2026-11-06): H_6 above 1 about one
candidate in ten, above 2 about one in a hundred, above 3 one in several hundred, so the top is a matter of search
volume (the hunt). The second stage, `verify` (`generator.botRate`, plan R29b): the real-time bot with in-flight taps
plays 8-20 games and the candidate must stay under the difficulty's win share; about 80 ms per game, so it runs only
on candidates that passed the window (or on the top few of a hardest-search). The third lever, `buffer` (plan R29c):
with 'require' only levels without a one-run-at-a-time solution are accepted, certified by guided play on the real
belt (`simsolver.playGuided` + `certifyPlan`, about 0.1-0.3 s); these are the levels where the loop is a buffer from
start to end. Difficulty 10 and levels 497-500 add `tight` (plan R29d: every open box full, two of every cover, a
random deal, twelve kinds) and rank the survivors by `generator.grip` (buffer depth, covers, buried keys, free slots,
planned taps), the score calibrated on Alex's rated codes; change its weights there, and re-check the order of the
codes listed in the plan. The fixed levels follow
`scripts/level-curve.mjs`. The fixed levels are not regenerated at play time, so a new band or difficulty table only
changes Endless and future levels; after changing either run the generator tests. The pill colour of a tier is CSS
(`--tier-*`), its name a string (`tier_easy` ...); the chooser colours the difficulties by their structure tier.

## A level code (and keeping old codes alive)

A code `L<difficulty><flags>-<seed>` (`generator.encodeCode` / `decodeCode` / `replay`) names a generated level: the
letter is the code format (`generator.CODE_VERSION`, 1 = L), the flags are the mechanics switched off (n p w i k o),
the seed replays one deterministic `attempt`. A code is only as stable as everything the attempt depends on: the
generator, the solver (the search picks the first certified candidate), the rules, the layouts, `config.TIERS` and
`generator.DIFFICULTY`. `tests/codes.test.js` freezes a golden table of codes to level fingerprints and fails on
purpose when any of that changes a shared level. Then either make the change compatible, or bump `CODE_VERSION` with
a new letter, decide what old codes do (a legacy path or a clear refusal with `code_bad`) and re-freeze the table.
The share link is `?code=<code>` on the game address; the chooser's "Advanced" section switches mechanics and runs
the hunt (`app.startHunt`: chunks of 2.5 s in the worker without end, the hardest kept; `huntPlay` starts it).

## The replay and the favourites

The replay depends on the engine being deterministic for the same sequence of tick lengths and taps (R24): anything
that reads a clock, `Math.random` or the DOM inside `engine/` breaks it silently (the replay then shows a different
round). `tests/browser/ui.spec.js` plays level 1, watches the replay and asserts the same win. The recording is not
saved; persisting it (a few thousand numbers) into the save would make favourites replayable later. Favourite
entries are `{ level }` or `{ code, hard }` (`save.clean` keeps at most 200, newest first); the star buttons live on
the pause, win and lose cards (`renderStars`).

## A string

All UI text is in `src/ui/strings.js`, two tables `de` and `en`; add every key to both (a missing German key falls
back to English, a missing key shows the key). Static markup in `index.html` uses `data-i18n="key"`,
`data-i18n-aria` and `data-i18n-title`; dynamic text uses `PL.strings.t('key', { n: 3 })`. How-to card texts are
`h_<mechanic>_t` and `h_<mechanic>`. Share lines are `share_level`, `share_streak`, `share_lose`, `share_code` and
`share_code_lose` (Endless, with the level code); the lose card has two texts (`lose_text` for a jam, `lose_text_hopeless`
for R13b). The changelog is
`news.js` (de and en per entry, see RELEASE.md). The `og:title`/`og:description` and the manifest text are English
only by design (the selector card).

## A sound

`src/audio/audio.js`: the `VOICES` table has one function per sound (`eject land close refuse reveal unlock unwrap
thaw win lose tap`) built from the small `tone` and `noise` helpers (Web Audio, no files). Edit the voice or add a name
to `NAMES` and `VOICES`. Which game event plays which sound: the map `AUDIO_OF` at the top of `src/main.js`.
Master volume is `MASTER`. Voices get a `lo` flag when the performance mode is on; keep them cheaper then.

## A how-to card

Cards are pages of `screens.js` (`MECHS`: basics, hidden, pair, wrap, ice, lock, oneway). A page needs:

1. the illustration function in `ILL` (built from sprites and the `box()`, `plate()`, `ARROW` helpers; styles
   `.ibox`, `.islot`, ... in `style.css`),
2. the strings `h_<id>_t` and `h_<id>` in both languages,
3. detection in `mechanics(level)`: which level fields mean "this level uses it" (a card shows once, on the first
   level that brings the mechanic; `seen.howto` in the save remembers it).

A new rule mechanic also needs engine, generator (`ALL` and `MODS` in `generator.js`), validator (R21 combinations in
`model.validate`) and tests; start in `rules.js`, not in the card.

## The pacing (how fast things happen)

All timing constants are in `src/config.js`:

- `LAP_MS` (8000): one lap of the belt; the belt speed is perimeter / `LAP_MS`.
- `DEPART_FIRST_MS` (900): from the tap to the first piece leaving the box.
- `DEPART_GAP_MS` (900): between two pieces (units) of one tap, strictly one by one.
- `LAND_MS` (800): how long a landing piece takes to slide into its box (visual only; the engine lands it at once).
- `SLIDE_MS` (250): the short slides of the scene.

The engine reads `DEPART_*` in `sim.tap` (they set each piece's `departAt`), so changing them changes play: every level
must be re-certified (`node scripts/gen-levels.mjs`, `--legacy` for 1-100) because the bot taps and waits in sim time.
The scene reads the same values: the trapdoor time `HATCH_MS` (380 ms before each departure the reserved plate sinks
and a plate rises at the mouth) and `LAND_MS` are hard-coded or defaulted in `src/render/scene.js`; keep `HATCH_MS`
below `DEPART_FIRST_MS` and in step when you change the pacing. Rule text: plan R26, R27.

## A rule

Rules live in `src/engine/rules.js` (taps and the outbox, `wouldLand` for where a piece lands, closing, modifiers) and `model.js` (reveal and key release in
`settle`, validation); the reservation and scheduling of departures in `sim.js` (`tap`, `depart`) and `belt.js`; timing constants in `config.js` (see the pacing section). Change the
test that names the rule number first (`tests/engine.test.js`, `tests/rules-adversarial.test.js`), then the code,
then re-certify the fixed levels (`node scripts/gen-levels.mjs`; the rules in the plan, section 2, are the reference
text). `isStuck` (a jam) and `isHopeless` / `deadKinds` (R13b, a kind that can never close) decide when the lose card
shows; a bug there is either a hang or a wrong loss. `deadKinds` must stay optimistic: `tests/fixes.test.js` has the
cases, and the level suite checks that no committed level is hopeless at the start. The solver has its own copy of
the rules in a compact encoding (`src/gen/solver.js`, `land` for R12/R12b/R17/R18, `settleBox` for R15/R19): change
both, `tests/gen.test.js` compares them on random walks.

## The version

Single source: `package.json`. `node scripts/bump-version.mjs plate-loop x.y.z` (repo root) sets `package.json`, the
lockfile, the `Arcade.init` line in `index.html`, `VERSION` in `src/config.js` (shown on the title as "Version x.y.z")
and the fallback literal in `src/ui/strings.js` (`apply`); `scripts/check-versions.mjs` has a `plate-loop` entry for
those two files. Then the `news.js` entry and `docs/STATUS.md` (see [RELEASE.md](RELEASE.md)). When the level data
changes in a way players notice, bump `LEVELS_VERSION` in `src/ui/save.js` (the save keeps the level number; the
news entry tells the player).

## Icons and the OG image

`assets/sprites/icon.svg` is the source of the app icons: `node scripts/icons.js` writes `icon-192.png`,
`icon-512.png` and `apple-touch-icon.png` (system Chrome via the repo's `tests/chrome.js`). `assets/icons/favicon.svg` is drawn by hand and
released to the dist root through `release.json` `copy`. The OG image is `node ../scripts/og-images.mjs plate-loop` from a
gameplay screenshot (RELEASE.md).
