# How to change things

Every change below needs no build. Edit, reload the page, done. Run `npm test` afterwards when you
touch anything under `src/game`, `src/physics.js`, `src/projection.js` or `src/config.js`.

## The dedication

`src/dedication.js`. Change the text between the two backticks; press Enter for a new line (up to 3 lines).
A typo there cannot break the game: it falls back to a default line.

## Colours, names, order of the cocktails

`src/config.js` → `TIERS`. Each slot has `key`, `name`, `radius` (the collider, in table units), `points`,
`color` (strip badge, collection, particles), and for the jug an `accent`. The painter files are
`src/art/tierN-<key>.js`; each registers `CM.art.tiers[N]`. To swap two cocktails, swap the `key/name/color`
of the two slots (keep the slot radii), rename the two painter files, change the `art.tiers[N]` numbers inside
them, update the `<script>` tags in `index.html` and the boot-guard key list near its end, and swap the two
sprite-bounds entries in `TOPA` in `src/art/glass.js` (how tall each painter is). `npm run preview` shows the
result and fails if a painter paints outside its bounds.

## Difficulty

`src/config.js`:
- `MODES.relaxed` / `MODES.standard`: `DANGER_Y` (line position, bigger = closer to the player = more room),
  `GRACE_TICKS` (240 per second), `STAGE_SHIFT` (reach the spawn stages earlier).
- `SPAWN.WEIGHTS` (tiers 1–4 early on) and `SPAWN.STAGES` (`from` = highest tier reached, `weights` for
  tiers 1–5). Heavier late stages = fuller table and a real chance to lose.
- `PHYS.V0` launch speed, `PULL` the slide toward the far edge, `E_GLASS` / `E_WALL` bounciness,
  `RULES.SHOVE_V` the merge nudge.
Run `node tests/tune.js --seeds 200` to see bot win rates per mode (about 1.5 min).

## The bomb

Earned when two Sangria Verde jugs touch (the "Fiesta!" burst). Knobs in `src/config.js` → `RULES`: `BOMB_RADIUS`
(table units; 16.5 makes the blast diameter a third of the table width), `BOMB_MAX` (charges you can hold), `BOMB_POINTS_PER_TIER`. Rules live in
`src/game/bomb.js`, the button in `index.html` + `src/style/hud.css` (`.hud-bomb`), the aiming in `src/ui/input.js`
(`mapBomb`), the reticle in `src/render/guides.js`, the explosion in `src/render/fx.js` (`bomb`) and
`src/audio/sounds.js` (`boom`). Keyboard: B arms, Esc disarms. Tests: `tests/bomb.test.js`.

## Test scenarios

Add `?scenario=jugs`, `?scenario=fiesta`, `?scenario=bomb` or `?scenario=full` to the game URL and every new game starts
prepared (two jugs a nudge apart, jugs that burst at once, two bomb charges with a full table, a crowded table). See
`src/app/scenarios.js`. Add `&debug=1` for the collider overlay and the frame readout.

## Sound and music

`src/config.js` → `AUDIO`: `MERGE_GAIN` (merge glass vs clinks), `MUSIC` (music bus, max 0.12),
`MUSIC_LOOKAHEAD_S`, the `LITE_*` phone limits (voices, clinks per second, partials). Recipes are in
`src/audio/sounds.js` (merge = `mergeSound`, bumps = `clinkSound`/`thockSound`); the music generator and its
chord templates are in `src/audio/music.js`. Defaults for the toggles live in `src/game/save.js` (`defaults()`).

## Backgrounds

Drop an image into `assets/backgrounds/` and add a scene to `BACKGROUNDS` in `src/config.js` (key, file,
`horizonFrac` = where sky meets sea in the image, `anchorX` for the portrait crop, optional parallax `layers`,
`credit`). A random scene is chosen per new game, never the previous one. Keep `assets/backgrounds/CREDITS.md`
current; the credit line shows in Settings.

## Replacing a cocktail with a picture

Put `assets/tier-N.png` (transparent, standing on its bottom edge) next to `index.html` and set `PNG_OVERRIDES: true`
in `src/config.js` (off by default, so the page never probes for missing files). `src/art/overrides.js` loads them
and uses them instead of the painters; a missing or broken file silently falls back.

## Favicon

`assets/icons/` holds PNGs and an `.ico` rendered from the Cosmopolitan painter by `node tests/browser/icons.js`;
re-run it after changing tier 3's art.

## Title, overlays, layout

Markup in `index.html`, styles in `src/style/overlays.css` (title, cards, sheets, collection cards) and
`src/style/hud.css`. Layout numbers (table size on screen, HUD rects, tier strip) come from
`src/projection.js` + `config.VIEW`.

## Checking your change

| What | Command |
|---|---|
| Rules and numbers | `npm test` |
| The real page boots and plays | `npm run test:browser` |
| How the cocktails look | `npm run preview` → `docs/preview/cocktails.png` |
| Difficulty | `node tests/tune.js --seeds 200` |
| Performance on a device | Settings → Export debug report, then read the JSON (frame times, work per frame); `CM.render.debugStatic()` in the console shows whether the static scene canvas is in use |
| Live tinkering | `python3 -m http.server 8765` then open `preview.html` / `play-dev.html` / `index.html` |
| Ship it | `npm run release` → `dist/` and `release/*.zip`; see `docs/DEPLOY.md` |

Keep every source file under 400 lines (a test enforces 450) and ES2018 syntax (no `?.`, `??`), for iOS Safari 15.
