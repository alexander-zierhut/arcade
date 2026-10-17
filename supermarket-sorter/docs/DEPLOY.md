# Deploy

The normal path is the arcade repo's GitHub Actions workflow, which deploys this game to
https://arcade.alzlper.com/supermarket-sorter/ (see the root `README.md`, "Content hashes and caching"). The central
build hashes the `dist/` script and stylesheet paths, so nothing in the game needs to version its files. The S3 steps
below are only a manual fallback.

## Manual fallback: deploy to S3

Nothing in the game needs a server. Upload static files, keep the paths.

## Build a release

`npm run release` (`scripts/release.sh`, which runs the shared root `scripts/release.mjs` with this game's
`release.json`) copies exactly the shipped files into `dist/` and zips them into
`release/supermarket-sorter-v<version>.zip` (version from `package.json`). It regenerates `src/art/catalog.js`
from the product manifests first and refuses to build if a script, stylesheet or product sprite is missing
(`scripts/check-dist.js`).
Serve `dist/` locally with `npm run serve:dist` (port 8766) to check it before uploading.

## What to upload

```
index.html
manifest.webmanifest (app mode: "Zum Startbildschirm hinzufügen" (Add to Home Screen) launches without browser chrome; served as application/manifest+json)
src/                 (the whole folder, with its sub-folders; src/game/levels-data.js holds the baked levels)
assets/items/*.svg   (the 3D product sprites and the golden bunny; the manifests are not needed at runtime)
assets/items-2d/*.svg (the flat 2D set for the settings toggle "Produkte flach" (Flat products))
assets/icons/        (favicon + Apple touch icon)
VERSION.txt          (optional)
```

Leave out: `tests/`, `docs/`, `node_modules/`, `examples/`, `scripts/`, `package*.json`, `assets/items/manifest/`.

## Commands

```bash
# one-time: a bucket with static website hosting (or serve through CloudFront, see below)
aws s3 mb s3://YOUR-BUCKET
aws s3 website s3://YOUR-BUCKET --index-document index.html

# every upload: sync dist/ with no-cache so edits show on the next reload
npm run release
aws s3 sync dist s3://YOUR-BUCKET --delete --cache-control no-cache
aws s3 cp dist/index.html s3://YOUR-BUCKET/index.html --cache-control no-cache --content-type "text/html; charset=utf-8"
```

Content types are inferred from extensions by the CLI (`.js` → `text/javascript`, `.css` → `text/css`,
`.svg` → `image/svg+xml`, `.png`). The manifest needs it explicitly:
`aws s3 cp dist/manifest.webmanifest s3://YOUR-BUCKET/manifest.webmanifest --cache-control no-cache --content-type "application/manifest+json"`.
If a file shows as `binary/octet-stream`, add `--content-type` explicitly;
SVG sprites must be served as `image/svg+xml` or `<img>` will not render them.

## HTTPS

The S3 website endpoint is http only. For https put CloudFront in front: origin = the bucket, default root
object `index.html`, the free ACM certificate. No redirects, rewrites or CORS rules are needed; the game
only requests its own files. After each upload invalidate `/*`:

```bash
aws cloudfront create-invalidation --distribution-id YOUR-DIST-ID --paths "/*"
```

## Local test server

`npm run serve` serves the working tree on port 8765 for every device in the LAN (port 8080 is taken by another
service on the dev machine). The game needs no build, so the server always shows the current files.

## Notes

- `file://` keeps working: double-clicking `index.html` is still a supported way to play.
- Saves are per origin: the S3 URL, `file://` and `localhost` each keep their own highscores and run.
- Audio starts on the first tap (browser rule); all sounds are generated, there are no audio files.
- On iPhone, "Add to Home Screen" from Safari's share sheet gives a full-screen icon without browser bars.
