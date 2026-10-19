# Releasing a new version

1. `node scripts/bump-version.mjs supermarket-sorter <x.y.z>` (from the repo root). It sets `package.json`,
   `VERSION` in `src/config.js`, the `Arcade.init` line in `index.html`, and copies the previous
   `tests/fixtures/export-v<old>.json` to `export-v<x.y.z>.json` (version and `exportedAt` updated).
2. By hand: add the entry for the new version to `news.js` (version, date, `de` and `en`; one `<p>` per point, the
   most important point first). The kit shows it as the changelog card once to every returning player, and the
   selector's "What's new" button and its "New" label come from it.
3. By hand: update `docs/STATUS.md`.
4. `npm test` and `npm run test:browser`.
5. `node scripts/check-versions.mjs` must pass (CI runs it). `npm run release` builds `release/supermarket-sorter-v<x.y.z>.zip`.
6. Never delete an old fixture; one per released version is the forward-compatibility contract (`tests/export.test.js`).
   If the save format changed, bump `SAVE_VERSION` / `RULES_VERSION` as described in `HOW-TO-CHANGE.md` and
   regenerate the new fixture from a real export instead of copying.
