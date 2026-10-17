#!/usr/bin/env bash
# Builds a clean, shippable copy of the game in dist/ and zips it into release/.
# Only what the browser needs is included (see docs/DEPLOY.md). No build step: files are copied as they are.
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./package.json').version")
STAMP=$(date +%Y-%m-%d)
node scripts/build-catalog.js >/dev/null
rm -rf dist && mkdir -p dist release
cp index.html manifest.webmanifest dist/
cp -r src dist/src
mkdir -p dist/assets/items dist/assets/items-2d dist/assets/icons
cp assets/items/*.svg dist/assets/items/
cp assets/items-2d/*.svg dist/assets/items-2d/
cp assets/icons/* dist/assets/icons/
printf 'Supermarkt Sortierer\nversion %s\nbuilt %s\n' "$VERSION" "$STAMP" > dist/VERSION.txt
# sanity: every <script src> and <link href> in index.html must exist in dist/
missing=0
for p in $(grep -o 'src="src/[^"]*"' index.html | sed 's/src="//;s/"//') $(grep -o 'href="src/[^"]*"' index.html | sed 's/href="//;s/"//') $(grep -o 'href="assets/[^"]*"' index.html | sed 's/href="//;s/"//'); do
  [ -f "dist/$p" ] || { echo "MISSING in dist: $p"; missing=1; }
done
# every product in the catalog must ship
node -e "const c=require('./dist/src/art/catalog.js');const fs=require('fs');let m=0;for(const id of c.ids){for(const d of ['items','items-2d']){if(!fs.existsSync('dist/assets/'+d+'/'+id+'.svg')){console.log('MISSING sprite '+d+'/'+id);m=1}}}process.exit(m)" || missing=1
[ "$missing" -eq 0 ] || exit 1
ZIP="release/supermarket-sorter-v${VERSION}.zip"
rm -f "$ZIP"; (cd dist && zip -qr "../$ZIP" .)
echo "dist/ ready ($(du -sh dist | cut -f1)), $ZIP ($(du -h "$ZIP" | cut -f1))"
