# Deploy to S3

Nothing in the game needs a server. Upload static files, keep the paths.

## Build a release

`npm run release` (`scripts/release.sh`, which runs the shared root `scripts/release.mjs` with this game's
`release.json`) copies exactly the shipped files into `dist/` and zips them into
`release/cocktail-merge-v<version>.zip` (version from `package.json`). Upload the contents of `dist/`, or serve
`dist/` locally with `npm run serve:dist` (port 8766).

## What to upload

```
index.html
src/            (the whole folder, with its sub-folders)
assets/backgrounds/   (the eight scenes + CREDITS.md)
assets/icons/         (favicon + Apple touch icon, rendered from the Cosmopolitan painter)
assets/tier-N.png     (only if you added picture overrides)
```

Leave out: `tests/`, `docs/`, `node_modules/`, `examples/`, `package*.json`, `preview.html`,
`play-dev.html`, `src-watch.js`, `assets/candidates/`.

## Commands

```bash
# one-time: a bucket with static website hosting (or serve through CloudFront, see below)
aws s3 mb s3://YOUR-BUCKET
aws s3 website s3://YOUR-BUCKET --index-document index.html

# every upload: sync only what the game needs, with no-cache so edits show on the next reload
aws s3 cp index.html s3://YOUR-BUCKET/index.html --cache-control no-cache --content-type "text/html; charset=utf-8"
aws s3 sync src s3://YOUR-BUCKET/src --delete --cache-control no-cache
aws s3 sync assets/backgrounds s3://YOUR-BUCKET/assets/backgrounds --delete --cache-control no-cache
# optional picture overrides
# aws s3 cp assets/tier-1.png s3://YOUR-BUCKET/assets/tier-1.png --cache-control no-cache
```

Content types are inferred from extensions by the CLI (`.js` → `text/javascript`, `.css` → `text/css`,
`.png`, `.svg`). If a file shows as `binary/octet-stream`, add `--content-type` explicitly.

## HTTPS

The S3 website endpoint is http only. For https put CloudFront in front: origin = the bucket, default root
object `index.html`, the free ACM certificate. No redirects, rewrites or CORS rules are needed; the game
only requests its own files. After each upload invalidate `/*`:

```bash
aws cloudfront create-invalidation --distribution-id YOUR-DIST-ID --paths "/*"
```

## Notes

- `file://` keeps working: double-clicking `index.html` is still a supported way to play.
- Saves are per origin: the S3 URL, `file://` and `localhost` each keep their own best score and collection.
- Audio starts on the first tap (browser rule); music and sounds are generated, there are no audio files.
- The CraftPix background set requires its credit line, which the Settings sheet shows.
