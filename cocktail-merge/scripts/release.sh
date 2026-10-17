#!/usr/bin/env bash
# Builds a clean, shippable copy of the game in dist/ and zips it into release/.
# Only what the browser needs is included (see docs/DEPLOY.md). No build step: files are copied as they are.
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./package.json').version")
STAMP=$(date +%Y-%m-%d)
rm -rf dist && mkdir -p dist release
cp index.html dist/
cp -r src dist/src
mkdir -p dist/assets && cp -r assets/backgrounds dist/assets/backgrounds
cp -r assets/icons dist/assets/icons
cp assets/icons/favicon.ico dist/favicon.ico              # browsers also ask for /favicon.ico on their own
shopt -s nullglob; for f in assets/tier-*.png; do cp "$f" dist/assets/; done
printf 'Cocktail Merge: Beach Bar\nversion %s\nbuilt %s\n' "$VERSION" "$STAMP" > dist/VERSION.txt
# sanity: every <script src> and <link href> in index.html must exist in dist/
missing=0
for p in $(grep -o 'src="src/[^"]*"' index.html | sed 's/src="//;s/"//') $(grep -o 'href="src/[^"]*"' index.html | sed 's/href="//;s/"//'); do
  [ -f "dist/$p" ] || { echo "MISSING in dist: $p"; missing=1; }
done
[ "$missing" -eq 0 ] || exit 1
ZIP="release/cocktail-merge-v${VERSION}.zip"
rm -f "$ZIP"; (cd dist && zip -qr "../$ZIP" .)
echo "dist/ ready ($(du -sh dist | cut -f1)), $ZIP ($(du -h "$ZIP" | cut -f1))"
