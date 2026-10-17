# Architecture

A browser game with no build step: `index.html` loads plain `<script>` files in a fixed order and every file
adds its part to one global namespace, `CM`. The game runs from `file://` (double-click `index.html`), from a
local static server and from an S3 bucket. The normative rules live in `DESIGN.md`; this file is the map.

## Layers and files

```
index.html                 DOM shell: canvas, input layer, HUD, tier strip, overlays, inline boot guard
src/dedication.js          the dedication text (the ONLY file a non-developer edits)
src/config.js              every number: table, physics, rules, modes, spawn stages, tiers, audio, FX, backgrounds
src/physics.js         P   circle bodies, fixed 240 Hz step, position-based solver, walls, restitution, impact events
src/projection.js      P   layout solve (stage, table, HUD rects, strip) and the pseudo-perspective mapping
src/game/              P   the rules, assembled into CM.game by game/game.js
  spawn.js                 seeded RNG, weighted draw, progressive unlock + STAGES (tier-5 glass late in a run)
  merge.js                 merge eligibility, resolution, chain depth, points, win, jug burst
  danger.js                danger line, threat/grace timers, loss
  aim.js                   firstHit (aim guide), botAim (tests, attract mode, tuning gate)
  state.js                 snapshot/restore (Continue after reload), hash (determinism)
  save.js                  normalizeSave / mergeSave (best, wins, collection, settings)
  chime.js                 chain-depth pitch table
  bomb.js                  bomb charges: earned by a jug burst, spent on a blast circle (owner feature)
  game.js                  createGame, setAim, requestLaunch, tick (the normative order), continueAfterWin
src/art/                   procedural painters (Canvas 2D) + image scenes
  glass.js, garnish.js     shared glass recipe (profile, liquid, rim, highlights) and garnish helpers
  tier1-shot.js … tier9-sangria-verde.js   one painter per tier, registered as CM.art.tiers[t]
  coin.js, scenery.js      coin, procedural beach fallback, table, roof, shadows, danger line
  overrides.js             optional assets/tier-N.png replacing a painter
  sprites.js               sprite caches per DPR, silhouettes, glow, paintIcon (strip, NEXT, collection)
  backgrounds.js           the image scenes in assets/backgrounds/, random per game, parallax layers
src/render/                frame.js (pipeline, caches, headroom), fx.js (state), fxdraw.js (particles, labels,
                           confetti, vignette), guides.js (aim guide, debug overlay)
src/audio/                 engine.js (context, iOS unlock, buses, voice limits), sounds.js (glass recipes per
                           event), music.js (generative bar music, look-ahead scheduler)
src/ui/                    storage.js (localStorage wrapper), input.js (pointer/touch/keyboard → intents),
                           hud.js (coins, BEST, NEXT, strip), overlays.js (title, pause, win, over, sheets)
src/app/                   loop.js (fixed-step loop, adaptive quality), perf.js (frame recorder + debug report),
                           dispatch.js (events → consumers + saves), attract.js (title demo), states.js (state machine)
src/main.js                boot, viewport measuring, settings handlers, lifecycle (hide/pagehide/pageshow)
src/style/                 base.css (tokens, iOS rules), hud.css, overlays.css
```

`P` = pure: attaches to `CM` in the browser and to `module.exports` under Node, never touches `window`
or the DOM, so `tests/*.test.js` run the real rules in Node.

## Data flow per frame

1. `app/loop.js` is driven by `requestAnimationFrame`. It accumulates real time (scaled by hit-stop /
   win slow-mo) and runs whole fixed steps of `CM.game.tick(g)` at 240 Hz. Before each step it applies
   the input intents (aim, launch) collected by `ui/input.js`.
2. `tick` returns events (`launch`, `impact`, `merge`, `discover`, `danger`, `win`, `lose`, …).
   `app/dispatch.js` hands them to `render.fx` (particles, labels, shake), `audio` (clinks, glass
   merges, stingers), `ui.hud` (coins, strip, toasts) and `app/states.js` (win/lose sequences, saves).
3. `render/frame.js` draws on two stacked canvases. `#game-bg` holds the static scene (background image,
   table, roof) and is redrawn only when layout, pixel ratio, scene or danger line change. `#game` is cleared
   every frame and gets shadows → sprites far to near → aim guide → danger line → FX → string lights → labels →
   screen-space effects. During the win zoom or a shake, or when a scene animates its parallax layers on
   desktop, everything is drawn on `#game` instead. Glasses come from sprite caches, so per-frame work is a
   handful of blits, which matters on phones where Firefox rasterizes canvas in software.
4. `app/perf.js` records the frame interval and the JS work per frame; `loop.js` lowers the pixel-ratio
   cap (2 → 1.5 → 1.25) when frames run slow for 2 s, and Settings → Performance mode pins 1.25.

## State machine (app/states.js)

`BOOT → TITLE ⇄ PLAY ⇄ PAUSE`, `PLAY → WIN_SEQ → WIN_MENU → PLAY (Keep playing) | TITLE`,
`PLAY → LOSE_SEQ → OVER_MENU → PLAY | TITLE`, plus `ROTATE` (landscape phone) and `OOPS` (a sim exception).
The title runs an attract game behind the overlay. A run snapshot is saved every 10 s and on hide, so
`Continue` restores the exact game after a reload.

## Persistence (ui/storage.js, game/save.js)

One localStorage key `cocktailMerge.v1` holds `{best, bestTier, wins, discovered (bitmask), muted, music,
ambience, relaxed, showNumbers, lowGfx}`; the run snapshot has its own key. Everything is per origin, so
`file://` and the S3 URL keep separate records. All access is in try/catch with an in-memory fallback.

## Tests

- `npm test` → `tests/run.js`: 111 unit tests over the pure core (physics, merge, spawn, danger, save,
  projection, purity/file-size/ES2018 rules).
- `npm run test:browser` → headless Chrome smoke test of the real `index.html` (boot, Play, launches,
  score, pause, Continue, title layouts at four sizes).
- `npm run preview` → the colour contact sheet `docs/preview/cocktails.png` of all painters.
- `node tests/tune.js` → the difficulty gate: bots play 200–400 seeded games per mode.
- `node tests/browser/audio-check.js`, `render-check.js`, `ui-check.js`, `backgrounds.js` → per-subsystem
  headless checks with screenshots in `docs/preview/`.

Dev pages at the repo root (not shipped): `preview.html` (live painters), `play-dev.html` (rules harness
with metrics export), `src-watch.js` (reload banner when sources change).
