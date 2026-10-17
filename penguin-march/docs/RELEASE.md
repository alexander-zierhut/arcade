# Release checklist

The version lives in four places. `package.json` is the source of truth. `src/config.js` (`VERSION`) and the title line in `index.html` (`<p class="version">`) are checked by `scripts/check-versions.mjs`. `package-lock.json` also records the version, in two fields near the top; `scripts/bump-version.mjs` sets those too, the check does not look at them.

Commands run from `penguin-march/` unless they say otherwise. "Repository root" means the folder that holds `penguin-march/`.

## Steps

1. Choose the next version, `x.y.z`.
2. From the repository root, run `node scripts/bump-version.mjs penguin-march x.y.z`. It sets `package.json`, `package-lock.json`, `src/config.js` and the title line in `index.html`, then runs the version check. It refuses a version that is already set.
3. Run `npm test` and `npm run test:browser`. The browser run needs Chrome.
4. If the game looks different now, refresh the screenshot with `UPDATE_PREVIEW=1 npm run test:browser` and re-render the OG image from the repository root with `node scripts/og-images.mjs penguin-march`.
5. Update `docs/STATUS.md`: the version, the date and what changed.
6. From the repository root, run `node scripts/check-storage.mjs`, `node scripts/check-versions.mjs` and `npm test`. The root `npm test` builds every game and checks the site, so run `npm ci` at the root first if its dependencies are not installed.
7. Run `npm run release` and `npm run serve:dist`, then look at the title screen and play a level.
8. Commit the changed files and push to `main`. Include `docs/preview/game-play.png` and `assets/icons/og-image.png` when they changed.
9. CI runs the tests and then deploys. When the run is green, open https://arcade.alzlper.com/penguin-march/ and check that the title screen shows the new version.

## What the checks catch

- `scripts/check-versions.mjs`: a version that differs between `package.json`, `src/config.js` and `index.html`.
- `scripts/check-storage.mjs`: a storage key that does not start with `penguinMarch.`.
- `npm test`: a level string that no longer decodes or validates, or that the greedy bot cannot win.
- `npm run test:browser`: a sprite that fails to load, a console or page error, or a title, map, shop, HUD or end card that leaves the screen at one of the five sizes.

## Notes

- `bump-version.mjs` ends by printing what is left to do by hand: the STATUS entry and this checklist.
- The title line in `index.html` is replaced at start-up from `src/config.js`. The static text matters to the version check and to a reader of the file, not to what the player sees.
- This game has no what's-new texts. Those belong to `supermarket-sorter`.
