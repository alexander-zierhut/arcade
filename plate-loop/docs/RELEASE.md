# Plate Loop: release checklist

Run from the repo root (`arcade/`) unless noted. The game is in beta: `release.json` has `"status": "beta"` and the
selector lists it in the beta section. Keep it until the suites and a real phone say otherwise (GAME-SPEC 15);
switching to ready means removing that line.

1. **Bump the version.** `node scripts/bump-version.mjs plate-loop x.y.z` sets `package.json`, `package-lock.json`, the
   `Arcade.init` line in `index.html`, `VERSION` in `src/config.js` and the fallback literal in `src/ui/strings.js`, then
   runs `scripts/check-versions.mjs` (which has a `plate-loop` entry for those places).
2. **News.** A new first entry in `plate-loop/news.js`: `version`, `date` (today), `de` and `en`, one `<p>` per
   point, the most important first, written for the player. `check-versions` fails when the entry or a language is
   missing. Players with an older seen version get the changelog card on the title screen.
3. **Status.** Update `plate-loop/docs/STATUS.md`: version, what changed, known gaps.
4. **Levels** (only if rules, belt, sim, layouts or the generator changed, or a table row changed). Regenerate
   (`node scripts/gen-levels.mjs`, `--legacy` for 1-100), review the data diff, optionally `node scripts/tune-levels.mjs`
   to refresh `docs/levels-tuning.md`. `npm test` re-certifies a subset; the generator run certifies all 500.
5. **Tests.** `cd plate-loop && npm test && npm run test:browser`, then the root `npm test` (builds the site, boots every
   game, checks the kit and the spec) and `node scripts/check-storage.mjs`. The browser suite writes
   `tests/browser/artifacts/game-play.png` and creates `docs/preview/game-play.png` only when it is missing (set
   `UPDATE_PREVIEW=1` to replace it); if you changed anything visual, look at them (and at
   `tests/browser/render-check.html`).
6. **OG image** (first release, or when the look changed). `node scripts/og-images.mjs plate-loop` renders
   `plate-loop/assets/icons/og-image.png` (1200 x 630, used by the `og:image` tag and the share picture) from
   `plate-loop/docs/preview/game-play.png` using the `plate-loop` entry in the `GAMES` table of `scripts/og-images.mjs`
   (colour, ink, accent, title, sub, pitch, tags: edit it there). Replace the preview first (`UPDATE_PREVIEW=1 npm run
   test:browser`) when the look changed, then commit both PNGs. App icons, if the icon changed: `node plate-loop/scripts/icons.js`.
7. **Package.** `plate-loop/scripts/release.sh` (a thin wrapper around `scripts/release.mjs`) builds `plate-loop/dist/`
   and the zip in `plate-loop/release/` from the file list in `release.json`: `index.html`, `news.js`, `shared`,
   `manifest.webmanifest`, `src` (whole, including the 500 levels and `seeds.js`), `assets/sprites/*.svg`,
   `assets/icons`, and `favicon.svg` copied to the root. Both folders are ignored by git. Serve `dist/` and boot it once.
8. **`release.json`.** `"released": "YYYY-MM-DD"` is the date the game went live (the selector shows "New!" for two
   weeks from it): it currently says 2026-11-04, set it to the real go-live day when the game first ships.
   `"status": "beta"` stays until the real-phone test (Android, 360 x 678 class) and the suites are clean; then delete the line.
9. **Commit and deploy.** Commit as usual, push; CI runs the unit and browser suites per changed game,
   `check-versions` and `check-storage`. Deploy with the repo's `scripts/deploy.sh` / the pipeline. Afterwards open the
   live URL, check the title shows the new version, the changelog card opens once, and the selector card shows the OG
   image and the "What's new" button.

Storage keys must keep the `plateLoop.` prefix (`scripts/check-storage.mjs`). A change to the save format needs a
migration in `ui/save.js` `clean()` (it already tolerates missing and damaged data; never throw there).
