# Arcade

Browser games, one folder each, published at https://arcade.alzlper.com/: a selector page at the root
and every game under `/<game>/`.

- `cocktail-merge`: cocktail physics-merge game
- `supermarket-sorter`: shelf-sorting match-3 grocery game

## How it fits together

A game is any top-level folder that has `scripts/release.sh`. Nothing lists the games anywhere: the
workflow, the site build and the selector page all discover them from the folders.

- `<game>/scripts/release.sh` builds the shippable files into `<game>/dist` (`npm run release` inside
  the game). The release is what gets published; sources, tests and docs stay out.
- `<game>/index.html` carries Open Graph tags. The selector page is built from `og:title`,
  `og:description` and `og:image`, so a game's card is whatever the game itself says it is.
- `scripts/build-site.mjs` builds everything into `_site/`: each game's release under `_site/<game>/`
  and the selector at `_site/index.html`. Check it locally with
  `node scripts/build-site.mjs && python3 -m http.server --directory _site`.
- `.github/workflows/ci.yml` tests the games whose files changed in the push or pull request (a change
  outside every game folder tests all of them), then on `main` builds `_site/` and uploads it with
  `scripts/deploy.sh` to the Scaleway bucket `arcade.alzlper.com` (`nl-ams`). It needs the repository
  secrets `SCW_ACCESS_KEY` and `SCW_SECRET_KEY`, the same pair the minigames repo uses.

## Content hashes and caching

The games are written without a bundler and their `release.sh` copies plain files. Caching is handled
once, centrally, by the site build, so a game does not need to know about it:

- `build-site.mjs` renames every script and stylesheet that a game's `index.html` references to
  `name.<10 hex of sha256>.ext` (`src/main.js` → `src/main.3f9c2a7b1e.js`) and rewrites the references.
  Files a game loads by name at runtime (sprites, backgrounds, the web manifest, icons) keep their names.
  The hashed paths are listed in `_site-immutable.txt`.
- `deploy.sh` uploads in an order that never leaves a page pointing at a missing file: hashed files first
  as `public, max-age=31536000, immutable` (skipped when already in the bucket), then everything else as
  `no-cache`, then the HTML pages, then it deletes what the build no longer contains.
- Result: browsers and the CDN keep scripts for a year, but a new `index.html` (never cached) always
  names the exact scripts it was built with, so a release can never mix old and new code. A changed
  sprite under an unchanged name may be served from a cache for up to the CDN's browser TTL; that is
  cosmetic, and a game that needs a hard cut can rename the file.

For a game this means: reference scripts and stylesheets with plain relative paths in `index.html`
(no query strings), and load runtime assets by stable names. Nothing else.

## Storage

All games live on one origin, `https://arcade.alzlper.com`, and the browser keys localStorage,
sessionStorage, IndexedDB, cookies and service workers by origin, not by path. Two games that use the
same key would read each other's saves. The rule:

- Every storage key of a game starts with the game's prefix: the folder name in camelCase plus a dot.
  `cocktail-merge` owns `cocktailMerge.*`, `supermarket-sorter` owns `supermarketSorter.*`.
- The prefix is declared once as `STORAGE_KEY` in the game's config (both games use
  `<prefix>v1` for the save and `<prefix>v1.run` for the running game) and every other key is derived
  from it, so a rename of the save format is one change.
- Games use localStorage only. IndexedDB, cookies, BroadcastChannel and service workers are shared
  across the origin as well; if a game ever needs one, its database name, cookie name or channel name
  takes the same prefix, and a service worker must be registered with a `scope` of the game's folder,
  never `/`.
- A game's folder name is also its prefix, so renaming a folder means either keeping the old
  `STORAGE_KEY` (saves survive, the check below needs an exception) or migrating the keys in the game.

`node scripts/check-storage.mjs` enforces this (CI runs it on every push): keys handed to storage calls
and `*_KEY` constants must carry the game's prefix, no game may contain another game's prefix, and the
origin-wide APIs above are flagged.

## Versions

A game's version is stated in several places that must agree. `package.json` is the source of truth
(`release.sh` names the zip and `dist/VERSION.txt` from it); the other places are listed per game in
`RULES` in `scripts/check-versions.mjs` (supermarket-sorter: `src/config.js`, the static title in
`index.html`, the export fixture `tests/fixtures/export-v<version>.json`, non-empty `whatsnew_text` in
German and English; cocktail-merge: `package.json` only).

- `node scripts/check-versions.mjs` fails on any mismatch (CI runs it).
- `node scripts/bump-version.mjs <game> <x.y.z>` sets all of those places, creates the new fixture from
  the previous one and runs the check. It does not write the what's-new texts or `docs/STATUS.md`; it
  reminds you. The per-game checklist is `<game>/docs/RELEASE.md`.

## Adding a game

1. Create a folder at the repo root, say `my-game/`, with the game inside. The folder name becomes the
   URL: `https://arcade.alzlper.com/my-game/`.
2. Add `package.json` with at least `test` and `test:browser` scripts (CI runs both; `npm run
   test:browser` may be a no-op if the game has no browser tests) and commit `package-lock.json`, since
   CI installs with `npm ci`.
3. Add `scripts/release.sh`. It must write a complete, self-contained `dist/` with `dist/index.html`
   and only relative paths. Copy one of the existing scripts as a start: they copy the shipped files,
   write `dist/VERSION.txt` and fail if a referenced script or stylesheet is missing.
4. Put Open Graph tags in `index.html` and make sure `release.sh` ships the image:

   ```html
   <meta property="og:title" content="My Game">
   <meta property="og:description" content="One or two sentences shown on the card.">
   <meta property="og:image" content="https://arcade.alzlper.com/my-game/assets/icons/og-image.png">
   <meta property="og:image:width" content="1200">
   <meta property="og:image:height" content="630">
   ```

   The image is 1200×630 and is also the card's picture on the selector. Without an `og:image` the
   card still works, with a plain placeholder instead of a picture.
   `node scripts/og-images.mjs <game>` renders the image from a gameplay screenshot: add the game to
   the table at the top of that script (screenshot path under the game's `docs/preview/`, colours, title,
   pitch, tags) and commit the result. A real mid-game shot sells the game better than an icon does.
5. Add a `.gitignore` in the folder for `node_modules/`, `dist/` and `release/` (the root one covers
   `node_modules/` already).
   Prefix every storage key with the folder name in camelCase (`myGame.`), declared as `STORAGE_KEY`;
   see "Storage" above. `node scripts/check-storage.mjs` tells you if something is off.
6. Run `node scripts/build-site.mjs` once and open `_site/` to see the card, then push. CI tests the new
   folder and the next deploy publishes it.

## Renaming a game

The folder name is the URL, and the deploy deletes what is no longer in the build. To keep old links and
home-screen icons working, add the old name to `REDIRECTS` in `scripts/build-site.mjs`: the build then puts
a small page at the old URL that forwards to the new one. Saved games survive the rename on their own,
since localStorage belongs to the origin, not the path.

## Tests

`npm ci && npm test` at the root builds the site into a temp dir (not `_site/`) and checks it: every script,
stylesheet and preview image a page references exists and is content-hashed, `_site-immutable.txt` lists
exactly the hashed files, the selector has a card per game, the redirects and `VERSION.txt` are there; then
it serves the build and boots every game in headless Chrome (no failed request, no console error, the
game's global is up). A new game needs one line in `BOOT` in `tests/site.test.mjs`. Each game has its own
`npm test` and `npm run test:browser`. `bash scripts/deploy.sh --dry-run` prints the upload plan.
