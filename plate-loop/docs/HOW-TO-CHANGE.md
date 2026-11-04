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
the how-to cards). The departure animation (the piece sliding out, the reserved plate sliding up to the mouth) is in the
`tapped` / `eject` branches of `processQueue` and in `drawPlatesAndFlights` in the same file.

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

- Levels 1-100: the seed table `src/levels/seeds.js` (`id, tier, seed, allow, layout`). Change a row, then
  `node scripts/gen-levels.mjs --legacy` (rewrites `seeds.js` if a seed had to be bumped, and `levels-001-100.js`).
- Levels 101-500: one row per level in `scripts/level-plans/101-200.json` ... `401-500.json` (`id, tier, allow, layout,
  seed, note`; the note says what the level is for, e.g. "Lock week" or "Breather"). Change a row, then
  `node scripts/gen-levels.mjs` (all four files, writes `levels-101-500.js`) or `--only 301-400` to try one file
  without writing the data.
- The script builds each level with the generator, certifies it with the tick-accurate bot, checks the introduction
  schedule, and exits 1 if a level fails. A seed that yields nothing is bumped (seed + 1, ...) and the working seed is
  written back into the table, so the table always reproduces the data. Review the diff of data and table together
  and commit them together.
- `tests/levels.test.js` validates all 500 levels, re-certifies a subset (1-100, every 7th of 101-500, every extreme),
  checks the introduction schedule (hidden 6, pairs 12, wrap 18, one-way 28, ice 35, locks 42; extremes at 25, 50, 75,
  100 and every multiple of 25 after) and regenerates a sample of 10 from the tables, so a hand edit fails it.
- Level numbers are the player's progress (`plateLoop.save.level` is a level number): change levels in place, add new
  ones at the end, never insert in the middle.
- Tuning: `node scripts/tune-levels.mjs` plays every level with the greedy and sloppy bots and rewrites
  `docs/levels-tuning.md` (tier means and flagged levels: an easy level the greedy bot often loses, an extreme one it
  often wins). It only reports. To act on a flag change the row's tier or seed in the table and regenerate.

## A tier band (what Easy, Normal, Hard, Extreme mean)

`config.TIERS`: N, number of kinds, extra boxes, empty boxes at the start, share of hidden pieces, number of
modifier kinds, each a `[min, max]`. `generator.inBand` enforces them; Endless uses them directly (`generate({ tier })`).
The fixed levels were generated against the bands of their time and are not regenerated at play time, so a new band
only changes Endless and future levels. After changing a band run the generator tests (every produced level must
stay solvable, certified and in the band). The pill colour of a tier is CSS (`--tier-*`), its name a string
(`tier_easy` ...).

## A string

All UI text is in `src/ui/strings.js`, two tables `de` and `en`; add every key to both (a missing German key falls
back to English, a missing key shows the key). Static markup in `index.html` uses `data-i18n="key"`,
`data-i18n-aria` and `data-i18n-title`; dynamic text uses `PL.strings.t('key', { n: 3 })`. How-to card texts are
`h_<mechanic>_t` and `h_<mechanic>`. Share lines are `share_level`, `share_streak`, `share_lose`. The changelog is
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
The scene reads the same values: the 800 ms in which the reserved plate slides up to the mouth (`slideStart` in the
`tapped` branch of `processQueue`) and `LAND_MS` are hard-coded or defaulted in `src/render/scene.js`; keep them below
`DEPART_FIRST_MS` and in step when you change the pacing. Rule text: plan R26, R27.

## A rule

Rules live in `src/engine/rules.js` (taps and the outbox, `wouldLand` for where a piece lands, closing, modifiers) and `model.js` (reveal and key release in
`settle`, validation); the reservation and scheduling of departures in `sim.js` (`tap`, `depart`) and `belt.js`; timing constants in `config.js` (see the pacing section). Change the
test that names the rule number first (`tests/engine.test.js`, `tests/rules-adversarial.test.js`), then the code,
then re-certify the fixed levels (`node scripts/gen-levels.mjs`; the rules in the plan, section 2, are the reference text). `isStuck` decides when the lose card shows; a bug there is either a hang or a
wrong loss.

## The version

Single source: `package.json`. `node scripts/bump-version.mjs plate-loop x.y.z` (repo root) sets `package.json`, the
lockfile, the `Arcade.init` line in `index.html`, `VERSION` in `src/config.js` (shown on the title as "Version x.y.z")
and the fallback literal in `src/ui/strings.js` (`apply`); `scripts/check-versions.mjs` has a `plate-loop` entry for
those two files. Then the `news.js` entry and `docs/STATUS.md` (see [RELEASE.md](RELEASE.md)).

## Icons and the OG image

`assets/sprites/icon.svg` is the source of the app icons: `node scripts/icons.js` writes `icon-192.png`,
`icon-512.png` and `apple-touch-icon.png` (system Chrome via the repo's `tests/chrome.js`). `assets/icons/favicon.svg` is drawn by hand and
released to the dist root through `release.json` `copy`. The OG image is `node ../scripts/og-images.mjs plate-loop` from a
gameplay screenshot (RELEASE.md).
