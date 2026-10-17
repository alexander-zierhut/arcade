# Supermarket Sorter

A private, ad-free shelf-sorting game for the mobile browser: drag products into compartments, three of a kind
disappear, clear the shelf. Two tracks: **Relaxed** (no timer, sorting gets harder: layers, locks, outlines) and
**Against the clock** (timer plus running side shelves that get faster with the level). Every level is provably
solvable: it is only shown once a solution exists and has been replayed.

The game starts in English; German is available in the settings.

- Play: open `index.html` (double-click works) or run `npm run serve` and open `http://localhost:8765/`.
- Tests: `npm test` (pure game rules, generator, proof replays), `npm run test:browser` (the real game in Chrome),
  `node tests/browser/soak.js 20` (long play sessions, memory, performance), `npm run perf` (performance at 4x
  CPU throttling, values in `docs/proof/perf-*.json`).
- Bake levels: `npm run bake` writes `src/game/levels-data.js` (300 per track, with witness solutions).
- Turbo levels (every tenth from 27) make the side shelves race (1.8 to 3 cells/s); outline products from level 24.
- Test a level directly: `index.html?level=34&mode=timed` (or `mode=relaxed`); nothing is saved in test mode.
- Products: 260 invented German products as SVG, 3D-style like the original (`assets/items/`, style guide
  `docs/ART-STYLE.md`, file rules `docs/ART-SPEC.md`) and as a flat 2D set (`assets/items-2d/`, switchable in the
  settings). About 90 of them wink at real supermarket products (Nutello, Haribö, Milki, Maggy ...); 172 are food
  items, which the levels prefer. Catalog via `npm run catalog`, check via `npm run items`.
- As an app: `manifest.webmanifest`; "Add to home screen" starts without an address bar, and on Android there is
  also a fullscreen button (home screen → "As an app", or settings).
- Publish: `npm run release` builds `dist/` and a zip; the repo's GitHub Actions workflow deploys `dist/` to
  `arcade.alzlper.com/supermarket-sorter/`. Saves survive updates (see `docs/HOW-TO-CHANGE.md`, section Update safety);
  the settings also offer saving and loading as a file.

Documents: `docs/STATUS.md` (state and handover, read first), `docs/OWNER-NOTES.md` (decisions), `docs/DESIGN.md`
(rules and numbers, section 0.5 = deviations of the implementation), `docs/ARCHITECTURE.md` (files),
`docs/HOW-TO-CHANGE.md` (tuning, update safety, test mode, refactor proof, performance), `docs/ART-STYLE.md` and
`docs/ART-SPEC.md` (products), `docs/DEPLOY.md` (S3), `docs/RESEARCH.md` (research on the original).
