# Status and handoff (v0.3.1, 2026-10-16)

Read this first in a new session. It says what exists, how to run and prove it, what is tuned and what is open.

## What changed in v0.3.1 (the "Vorbild look", same day, after the owner compared v0.3.0 with the original)

- **One cabinet.** The rack and the side columns are one piece of light wood with continuous boards per row; the side
  cells sit exactly on the rack rows (one visible cell per row, 5 or 6 instead of 6 to 8; belts with more cells scroll,
  in relaxed levels at the slowest drift even when "stehen still" is on), the bottom shelf spans the full width,
  compartment backs are light, back-layer products are darkened copies (`sprites.shaded`), every product has a soft
  contact shadow. The clock formula uses the real hidden count (`levels.timeMs`).
- **HUD band** in dark wood with white numbers (level + Noch N, bunny, clock or moves, score, blue pause), combo tag or
  pips below; the action buttons are a slim row at the bottom again (owner's choice, fullscreen pays for it).
- **App mode.** `manifest.webmanifest` (fullscreen display), a Fullscreen-API toggle (Android, desktop) in the "Als App"
  card and in the settings, and a once-only "Als App spielen" card on phones with the per-platform steps
  (`save.seenInstallHint`). iOS keeps `apple-mobile-web-app-capable`.
- **Products v3** (`docs/ART-STYLE.md`, binding): the original's 3D toy-render look rebuilt in SVG by 30 Sonnet agents:
  no black outlines, cylinder and box gradients, visible top faces, specular stripes on gloss, base occlusion, chunky
  proportions, one word or none, the punchy palette. The validator enforces it (`tests/items-check.js`).
- **Silhouettes** now have a dark rim, a sheen and a "?" badge so they are not mistaken for back-layer products.
- **Rearranging inside a compartment** is allowed and free (`board.shift`, `game.shiftItem`: no move counted, no undo
  entry, no combo change); the owner hit "Da ist kein Platz" when he dragged a product one slot to the left.
  Refusals now say why ("Das Fach ist voll", "Noch verschlossen"); a drop back onto the own compartment is silent.
  Tapping a back-layer product explains "erst die vordere Reihe leer räumen".
- Golden fingerprint `golden-v031-after.json`: `levelsData`, `generate`, `score`, `stuck` unchanged since v0.2.0; `rules`
  equal to v0.3.0; `levelsGet`/`traces` differ (new catalogue, real hidden count in the clock), `save` (new field).

### Performance pass (v0.3.1, before shipping; owner: "running well even on lower end phones")

`npm run perf` (`tests/browser/perf.js`) measures the real page at a 4x CPU slowdown: timed L40 with every belt moving,
products selected and dragged, the solver moving every 300 ms; and relaxed L24. Records in `docs/proof/perf-*.json`.

| timed L40, 6 s at 4x | baseline | round 1 | final |
|---|---|---|---|
| layouts (ms) | 505 (269) | 20 (13) | ~20 (10) |
| paint ms (trace) | 218 | 78 | ~70 |
| composite ms (Layerize + Commit + UpdateLayer) | 1491 | 709 | ~620 |
| total task ms | 3812 | 2200 | ~2050 |
| frame p95 / long frames | 16.8 / 2 | 16.8 / 2 | 16.7 / 1 |

What was found and fixed (no rule, no save, no visible behaviour changed; golden fingerprint identical):
1. The selected-item bob, the land and the arrive animations animated `margin-top`: a layout on every frame while any
   product was selected or landing. Now the individual `translate` property (compositor). The bunny shimmer animated
   `filter` (a repaint per frame): now a `scale` pulse.
2. The HUD and the bottom bar wrote the same values to the DOM on every frame in timed play: writes only on change; the
   combo fill is quantised to 20 steps (its 0.25 s transition smooths them).
3. Match bursts and point popups used keyframes with CSS variables (main-thread animations): now explicit keyframes
   through the Web Animations API (compositor). The compartment flash animated `background-color`: now an opacity
   overlay.
4. `belts.setRate` set `playbackRate` on every cell animation after every action, even unchanged, which re-syncs all
   composited animations: now only on change. Shadow toggles only mutate on change.
What remains is per-action DOM work (about 19 style recalcs and 17 ms of style time per move at 4x, half of it the
match effects), the per-action save (0.2 ms) and the solver; frames stay at 16.7 ms p95 at 4x slowdown.

### 2D / 3D products (v0.3.1)

Settings → "Produkte flach (2D) statt plastisch (3D)" switches between the v3 set (`assets/items/`) and the v0.3.0 flat
set (`assets/items-2d/`, recovered from the v0.3.0 release zip). Both sets share the manifests and ids; the flat set
has its own measured sizes (`geometry-2d.json` → catalog `w2`/`h2`, measured with
`node tests/browser/items-render.js --dir assets/items-2d --geometry assets/items/manifest/geometry-2d.json`).
`save.flatIcons` (default false); the switch preloads the level and rebuilds the board. The release ships both sets.

## What changed in v0.3.0 (the "everything bigger" update, owner feedback after the first days of play)

- **One product size everywhere.** The tile of a product comes from its measured sprite size (catalog `w`/`h`), so every
  product is about 0.9 of a slot wide on the rack, the side shelves and the bottom shelf alike (`sprites.scale`).
- **Bigger board.** (v0.3.0 had the action buttons inside a two-line HUD and side shelves taller than the rack; v0.3.1
  replaced both, see above.) Slot width at 390x844 with belts went from 36 to 42.6 px; the bottom shelf's products from
  46 to 80 px tiles.
- **All 260 products redrawn** to ART-SPEC v2: a first pass by 50 Haiku agents (tall, filling the tile, German brand
  words), then a second pass by 27 Sonnet agents with explicit briefs (ART-SPEC section 4, v2.1): about 90 products are
  recognisable parodies of real German-supermarket products (Nutello, Haribö Goldbären, Milki, Kabba, Mezzi Mix,
  Fritze-Kola, Maggy, Knorri, Heinzl, Iglu, Dr. Ötti, Kerrigold, Kölle, Laibniz, Kapri-Sonne, Chikita, ...), the
  produce is drawn at natural proportions (stacked, bunched or in trays instead of stretched). Ids unchanged.
- **Turbo levels** run 3x (at least 1.8, at most 3 cells/s).
- **Forgiving controls:** a drop lands in the nearest compartment (sprite foot or finger within about half a row), a tap
  just beside a compartment counts; tap slop 10 px.
- **Debug entry** `?level=N&mode=timed|relaxed` (test mode, nothing is saved) and a feature-by-level table in
  `docs/HOW-TO-CHANGE.md`.
- **Update visibility:** NEU badge on the title's "Neuigkeiten" chip and a "Neu in Version 0.3.0" card shown once to
  players with progress (`save.seenVersion`, a new field with a default: no save-version bump).
- **Compatibility:** `STORAGE_KEY`, `RULES_VERSION` (2) and `GEN_VERSION` (1) unchanged; the baked levels are byte-identical
  (`golden-v030-before/after.json`: `levelsData`, `generate`, `score`, `stuck` equal; `levelsGet`/`traces` differ because
  the skin picks from the new catalog and turbo clocks changed, `rules` because of the turbo speed, `save` because of
  `seenVersion`). The v0.2.0 export fixture still imports (`tests/export.test.js`), plus a new `export-v0.3.0.json`.

## What the game is

A private, ad-free remake of Falcon's "Goods Sort" for the owner's mother: German UI, 260 invented German-looking
products (172 of them food, which the level skin prefers; redrawn tall and supermarket-like in v0.3), two branches ("Entspannt" without timer, "Gegen die Zeit"
with timer and moving side shelves), 300 baked levels per branch plus deterministic generation beyond, every level
provably solvable (a witness solution replayed before it is shown). Static files, no build step, iOS Safari first.

## Where things are

| Need | Place |
|---|---|
| Owner decisions (binding) | `docs/OWNER-NOTES.md` |
| Rules and numbers | `docs/DESIGN.md` (section 0.5 lists where the implementation deviates) |
| Files and data flow | `docs/ARCHITECTURE.md` |
| Knobs and procedures | `docs/HOW-TO-CHANGE.md` (also: update safety, proof of refactors) |
| Research about the original | `docs/RESEARCH.md` (historical; superseded by DESIGN and OWNER-NOTES where they differ) |
| Art contract for products | `docs/ART-STYLE.md` (the look, binding) and `docs/ART-SPEC.md` (file rules, classes, parodies) |
| Deploy to S3 | `docs/DEPLOY.md` |
| Screenshots and contact sheets | `docs/preview/` |
| Refactor proof records | `docs/proof/` (`tests/golden.js`) |
| Reference material from the research phase | `docs/research-proto/`, `docs/design-proposals/` (not used by the game) |

## Run, test, bake, release

```
npm run serve            # http://localhost:8765/ (port 8080 is taken by another service on the dev machine)
npm test                 # 42 pure tests, about 2 s, replays all 600 baked witnesses through two checkers
npm run test:browser     # 51 checks in the system Chrome (touch drags, belts, bunny, timeout, Serie, export/import, one tile
                         #   size everywhere, cabinet layout, forgiving drop, turbo speed, ?level= debug entry, what's-new card)
npm run soak             # 12 levels per branch through the real app: leaks, slow actions, heap
npm run golden -- <tag>  # behaviour fingerprint -> docs/proof/golden-<tag>.json
npm run perf -- --tag=x  # performance at a 4x CPU slowdown -> docs/proof/perf-x.json (frames, layouts, recalcs, trace buckets)
npm run items            # validate all product SVGs (ART-STYLE v3 rules), measure geometry, contact sheets
                         #   the 2D set: node tests/browser/items-render.js --dir assets/items-2d --geometry assets/items/manifest/geometry-2d.json
npm run catalog          # assets/items/manifest/*.json -> src/art/catalog.js
npm run bake             # 300 levels per branch with witnesses -> src/game/levels-data.js (cached in scripts/.cache)
npm run release          # dist/ + release/supermarket-sorter-v<version>.zip
```

## Tuning state (what has been checked against a real player)

- The owner's mother cleared timed level 14 with 1:30 of 3:45 left on the first build. The clock was tightened:
  `tauMs` 3300 - 30(L-1) ms per witness move (floor 1800), belt waits halved, 20 s slack, minimum 120/90/75 s.
  Level 14 now has about 2:40. One more data point from her decides the next notch (`src/game/rules.js`).
- Turbo levels (every tenth level from 27) now run at 1.8 to 3 cells/s ("way too slow" before); not yet played by her.
- The owner played v0.3.0 on his phone (level 44 timed reached) and asked for the v0.3.1 look; v0.3.1 (cabinet, 3D
  products, app mode, in-shelf rearranging, 2D toggle, performance pass) is built and not yet played by his mother.
- Relaxed difficulty beyond level 40 and the silhouette share are untested with a real player.
- Acceptance windows (agent win rate) were applied when baking levels 7-300 timed and 7-40 relaxed; 27 timed and
  8 relaxed baked levels missed their window after 120 attempts and shipped slightly easier (logged by the bake).

## Known limitations

- No music, only generated sound effects. No service worker (file:// must keep working); app mode is the manifest plus
  "Zum Startbildschirm" and the Fullscreen API (not available in iOS Safari, where the home-screen app is the way).
- The hint uses one coherent solver plan; it does not minimise moves.
- The catalogue's "confusable pairs" and silhouettes rely on hue and shape groups measured from the sprites; some
  foods are naturally similar in colour and are separated by lightness and class only.
- Product names are only visible in the manifests (not shown in the game yet).
- Products with a visible back-layer copy can look movable at a glance; the darkened, raised copy and the tap hint
  mitigate it, a real player has not confirmed it yet.
- The side columns show one cell per rack row; belts with more cells scroll even in relaxed levels (slow drift). The
  owner accepted the gameplay change; the clock accounts for it.
- The redrawn products were checked by validator, geometry and a visual pass over the contact sheet
  (`docs/preview/items-sheet.png`, per category `items-<cat>.png`). Redraw single products to `docs/ART-STYLE.md`
  when the owner names them. Do not use `<use>` in sprites: Chrome's `getBBox` misreports it (two sprites failed
  geometry that way and were inlined by hand). `clipPath` ids collide on the contact sheet only (each sprite is its
  own `<img>` in the game).
- Manifest `color` must be the drawn dominant colour (it drives confusable pairs and silhouettes); the suesses
  category was corrected by hand after the batch.

## Open ideas the owner mentioned or may want

1. Playtest with his mother: the v0.3.1 cabinet and 3D products (and whether she prefers the 2D toggle), the app mode
   on her phone, clock on levels 12-20, turbo level 27 (`?level=27&mode=timed`), silhouettes at 24, the stuck sheet.
2. Show the product name on a match or a "Sortiment" screen (she likes the food; names are German now).
3. Generative music like cocktail-merge.
4. Bot-based balance checks (`docs/DESIGN.md` section 9 describes the bots; only the hint-driven bot exists).
5. Performance follow-ups if a low-end phone still stutters: merge each belt's cells into one animated track (fewer
   compositor layers), batch the per-action DOM writes of the match effects into one frame (`npm run perf` first).
6. Single-product redraws to `docs/ART-STYLE.md` when the owner names weak ones; a word-count audit (about 90 products
   keep one parody word, the rest none).
