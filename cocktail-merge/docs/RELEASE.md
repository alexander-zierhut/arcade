# Releasing a new version

1. `node scripts/bump-version.mjs cocktail-merge <x.y.z>` (from the repo root). The version lives in
   `package.json` and the `Arcade.init` line in `index.html`; `scripts/release.sh` (via the root `scripts/release.mjs`) takes the zip name and `dist/VERSION.txt` from it. (`RULES_VERSION`
   in `src/config.js` is the save-format version, not the release version; leave it unless a saved run can
   no longer be restored.)
2. By hand: add the entry for the new version to `news.js` (version, date, `de` and `en`; one `<p>` per point, the
   most important point first; `check-versions` requires it). The kit shows it as the changelog card once to every
   returning player, and the selector's "What's new" button comes from it. Update `docs/STATUS.md`.
3. `npm test` and `npm run test:browser`.
4. `node scripts/check-versions.mjs` must pass (CI runs it). `npm run release` builds `release/cocktail-merge-v<x.y.z>.zip`.
