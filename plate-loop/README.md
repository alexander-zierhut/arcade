# Plate Loop

Game 4 of the arcade (`https://arcade.alzlper.com/plate-loop/`). A sushi conveyor puzzle: plates ride a closed
belt, boxes stand around it, and you tap boxes so that four of a kind end up in one box before the belt jams.
No boosters, no undo, no lives. The idea is a remake of the mechanic behind *Loop Sort*, re-themed.

Status: **0.1.0, first beta, not yet released** (see [docs/STATUS.md](docs/STATUS.md)).

## How it plays

- The belt has N plates (4 to 10, per level) and runs one lap in about 8 s. Boxes hold 4 pieces each.
- Tap a box: its front run (the front piece plus the visible pieces of the same kind behind it; a hidden piece ends
  the run) is taken out of the box and paced out one piece at a time: the first piece rides away 0.9 s after the tap,
  then one more every 0.9 s. At the tap each piece gets a reserved free plate (the nearest one behind the mouth), which
  rides empty, slides up to the mouth and is there exactly when its piece has slid out.
- A plate that passes a box drops its piece in when the box is empty or its front piece is the same kind and
  there is room, with two preferences that make a kind skip boxes only to complete a box. Four of a kind close the
  box for good.
- Lost: every plate is full and no box can take any piece on the belt. Won: every kind sits in a closed box.
- Twists, introduced one by one: hidden pieces (cloche), bound pairs, wrapped boxes (cloth), frozen boxes (ice),
  locked boxes with a key on a piece (shutter), one-way boxes.
- Modes: 500 fixed levels (progress = highest cleared), and Endless (pick Easy / Normal / Hard / Extreme, optional
  "no luck" = nothing hidden; the score is the streak of cleared generated levels).

The rules are numbered R1 to R28 in `../docs/plans/plate-loop.md` section 2 (that section is the current rule text,
including the changes after the first playtest); the tests and code comments cite those numbers. The plan is the
design record, these docs describe what is built.

## Run

No build step. Any static server on this folder works (`shared` is a symlink to `../shared`, the server must
follow it):

```sh
cd plate-loop
node -e "require('./tests/browser/serve.js').serve('.').then(s => console.log(s.url))"   # or python3 -m http.server
```

The arcade's own site build (`../scripts/build-site.mjs`) picks the game up from its folder; nothing is registered.

## Test

```sh
npm install              # once: playwright-core, only needed for the browser suite and the scripts
npm test                 # node --test "tests/*.test.js": engine, rules-adversarial, gen, gen-adversarial, levels, layouts, rng
npm run test:browser     # tests/browser/run.js: headless Chrome, boot, ui.spec.js + scene.spec.js, real levels played with
                         # real pointer taps, layout at five viewports, preview screenshot (needs a system Chrome; a few minutes)
node tests/browser/ui.spec.js      # UI + kit integration alone (also scene.spec.js); exit 1 on a failure, screenshots of
                                   # failed checks go to tests/browser/artifacts/
```

From the repo root, `npm test` also builds the site and boots this game (`BOOT` in `tests/site.test.mjs`), and
`node scripts/check-versions.mjs` / `node scripts/check-storage.mjs` check the version places and the storage keys.
`npm test` in the game folder takes about 15 s because `levels.test.js` re-certifies a subset of the 500 levels.

## Folder

```
index.html  news.js  manifest.webmanifest  release.json  package.json   what the arcade reads
shared/                      symlink to ../shared (the arcade kit; never edited here)
src/                         the game, see docs/ARCHITECTURE.md
src/levels/                  layouts.js, levels-001-100.js + levels-101-500.js (generated data), seeds.js (seed table of 1-100)
assets/sprites/*.svg         the art, drawn to docs/ART.md; assets/icons/ the app icons and og-image.png
tests/                       node suites, tests/browser/ (static server, run.js, ui.spec.js, scene.spec.js, render check page)
scripts/                     gen-levels.mjs and tune-levels.mjs (level data, dev only), level-plans/*.json (seed table of
                             101-500), render-svg.js (contact sheets, SVG lint), icons.js (app icons), release.sh
docs/                        API.md (module contract), ART.md (sprite spec), ARCHITECTURE.md, HOW-TO-CHANGE.md,
                             RELEASE.md, STATUS.md, levels-tuning.md (generated report), preview/ (screenshots)
```

Plain ES5 in `src/` (var, functions, no classes or arrow functions), one global `PlateLoop`, every engine, gen and
levels file also sets `module.exports` so node loads it directly. Storage keys start with `plateLoop.`
(`plateLoop.save` holds the progress). Everything the kit does (loading screen, language, install, performance
mode, news card, share, backup) comes from `shared/`; see `../docs/GAME-SPEC.md`.
