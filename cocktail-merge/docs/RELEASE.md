# Releasing a new version

1. `node scripts/bump-version.mjs cocktail-merge <x.y.z>` (from the repo root). The version lives only in
   `package.json`; `scripts/release.sh` (via the root `scripts/release.mjs`) takes the zip name and `dist/VERSION.txt` from it. (`RULES_VERSION`
   in `src/config.js` is the save-format version, not the release version; leave it unless a saved run can
   no longer be restored.)
2. `npm test` and `npm run test:browser`.
3. `node scripts/check-versions.mjs` must pass (CI runs it). `npm run release` builds `release/cocktail-merge-v<x.y.z>.zip`.
