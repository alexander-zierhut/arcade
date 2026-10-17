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
  outside every game folder tests all of them), then on `main` builds `_site/` and syncs it to the
  Scaleway bucket `arcade.alzlper.com` (`nl-ams`). It needs the repository secrets `SCW_ACCESS_KEY` and
  `SCW_SECRET_KEY`, the same pair the minigames repo uses.

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
5. Add a `.gitignore` in the folder for `node_modules/`, `dist/` and `release/` (the root one covers
   `node_modules/` already).
6. Run `node scripts/build-site.mjs` once and open `_site/` to see the card, then push. CI tests the new
   folder and the next deploy publishes it.

## Renaming a game

The folder name is the URL, and the deploy deletes what is no longer in the build. To keep old links and
home-screen icons working, add the old name to `REDIRECTS` in `scripts/build-site.mjs`: the build then puts
a small page at the old URL that forwards to the new one. Saved games survive the rename on their own,
since localStorage belongs to the origin, not the path.
