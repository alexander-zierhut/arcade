# Deploy

Penguin March is published as a static folder at https://arcade.alzlper.com/penguin-march/. This file covers what goes into the release, how the site build changes it, and how to check it before pushing.

## What ships

`release.json` lists the files:

- `index.html`
- `src/` (the 15 scripts and `style.css`)
- `assets/sprites/*.svg` (the 18 sprites)
- `assets/icons/` (favicon, apple touch icon and the OG image)

It also copies `assets/icons/favicon.svg` to `favicon.svg` at the top of the release.

Not shipped: `docs/`, `tests/`, `scripts/`, `package.json`, `package-lock.json`, `node_modules/`, and the `dist/` and `release/` folders themselves.

## Building the release

`npm run release` runs `scripts/release.sh`. That file changes to the game folder and calls the root `scripts/release.mjs` with it. The shared script:

1. reads `release.json` and the `version` in `package.json`;
2. deletes and recreates `dist/`, and makes sure `release/` exists;
3. copies the listed files (the `*.svg` entry copies the matching files of `assets/sprites/`);
4. writes `dist/VERSION.txt`;
5. fails if a `src` or `href` in `index.html` is missing from `dist/`;
6. zips `dist/` into `release/penguin-march-v<version>.zip` (this needs the `zip` command).

`dist/` holds `index.html`, `favicon.svg`, `src/`, `assets/` and `VERSION.txt`. The zip has the same tree.

`VERSION.txt` has three lines:

```
Penguin March
version 1.0.0
built 2026-10-18
```

The first line is `name` from `release.json`, the second is the `package.json` version, and the third is the build date in local time.

## Site build and hashing

The root `scripts/build-site.mjs` builds every game and the selector page into `_site/`. For this game it runs `release.sh`, copies `dist/` to `_site/penguin-march/`, and then rewrites that copy's `index.html`:

- each `<script src="...">` and `<link rel="stylesheet" href="...">` is renamed to `name.<10 hex characters of sha256>.ext`, and the reference is rewritten (`src/main.js` becomes `src/main.3f9c2a7b1e.js`, for example);
- the og:image and twitter:image files under this game's URL are hashed the same way;
- sprites, icons and the favicon keep their names, because the game loads them by name at runtime.

The hashed paths go into `_site-immutable.txt`. `scripts/deploy.sh` uploads those files with a one-year immutable cache. Everything else is `no-cache`, and the HTML pages are uploaded last. A new `index.html` always names the scripts it was built with, so old and new code never mix.

`index.html` must use plain relative paths for scripts and stylesheets. The build renames only references that are relative, have no query string and exist in the release. A `?v=` query or an absolute path is skipped, so that file keeps its name and loses the immutable cache. A reference to a missing file stops the build.

## Open Graph and the OG image

`index.html` carries the Open Graph and Twitter tags: `og:title` ("Penguin March"), `og:description`, `og:url`, and `og:image`, an absolute URL under `https://arcade.alzlper.com/penguin-march/`, with a size of 1200 by 630. It also has `twitter:card` and `twitter:image`. The selector page builds this game's card from `og:title`, `og:description` and `og:image`.

The image is `assets/icons/og-image.png`, 1200 by 630. The root script `scripts/og-images.mjs` renders it from `docs/preview/game-play.png`, a phone screenshot, with the title, subtitle, pitch and tags from its table. Run it from the repository root:

```
node scripts/og-images.mjs penguin-march
```

It looks for Chrome at `/usr/bin/google-chrome`, `/usr/bin/google-chrome-stable` and `/usr/bin/chromium`. If none exists, it uses the path in `CHROME_PATH`, so set that when Chrome is installed elsewhere.

`npm run test:browser` takes that screenshot (the "preview shot" step: level 5 played by the bot, the moment a gate pair is close) and writes it to `tests/browser/artifacts/game-play.png`. It copies it to `docs/preview/game-play.png` only when that file is missing or `UPDATE_PREVIEW=1` is set, so a routine test run does not change the repository. `npm run preview` writes its screenshots to `tests/browser/artifacts/preview/` and never touches `docs/`.

If `assets/icons/og-image.png` were missing, the root site build would stop with "references assets/icons/og-image.png, which is not in the release"; `npm run release` alone would still pass, because its check looks only at `src` and `href`.

## Where it is published

- The bucket is `arcade.alzlper.com` at Scaleway, region `nl-ams`. The game is served at https://arcade.alzlper.com/penguin-march/.
- `.github/workflows/ci.yml` runs on every push and pull request:
  - `changes` runs `scripts/check-storage.mjs` and `scripts/check-versions.mjs`, then picks the games whose files changed;
  - `test` runs `npm ci`, `npm test` and `npm run test:browser` in each picked game;
  - `deploy` runs only on `main`, and only when no test job failed. It builds the site, runs the root `npm test` on the built site (every game boots in headless Chrome), then runs `scripts/deploy.sh`.
- The deploy needs the repository secrets `SCW_ACCESS_KEY` and `SCW_SECRET_KEY`.

## Checking a release locally

1. In `penguin-march/`, run `npm run release`. The result is `dist/` and `release/penguin-march-v<version>.zip`.
2. Run `npm run serve:dist` and open http://localhost:8091/ to play the built files.
3. For the whole site, run `node scripts/build-site.mjs && python3 -m http.server --directory _site` from the repository root, then open http://localhost:8000/penguin-march/.
4. Run `BUCKET=arcade.alzlper.com S3_ENDPOINT=https://s3.nl-ams.scw.cloud bash scripts/deploy.sh --dry-run` to print the upload plan without changing the bucket. It needs the AWS CLI and credentials.

For development, `npm run serve` serves the source tree on http://localhost:8090/. No build is needed.
