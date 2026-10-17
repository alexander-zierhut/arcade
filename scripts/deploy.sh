#!/usr/bin/env bash
# Uploads _site/ (from scripts/build-site.mjs) to the bucket, in an order that never leaves a page
# pointing at a file that is not there yet, with the cache headers the build relies on:
#   1. hashed scripts and stylesheets (_site-immutable.txt): immutable, cached for a year; a file that is
#      already in the bucket under its name is skipped, it cannot have changed
#   2. everything else except HTML: no-cache (sprites, icons, the manifest, VERSION.txt)
#   3. the HTML pages last, no-cache, with their charset
#   4. whatever the bucket still has that the build no longer does is removed (old hashed files too; the
#      browsers that loaded them keep them, the new pages never ask for them)
# Needs BUCKET, S3_ENDPOINT and the AWS_* credentials in the environment. Run by .github/workflows/ci.yml.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${BUCKET:?set BUCKET}" "${S3_ENDPOINT:?set S3_ENDPOINT}"
[ -f _site/index.html ] || { echo "no _site/: run node scripts/build-site.mjs first"; exit 1; }
s3() { aws s3 "$@" --endpoint-url "$S3_ENDPOINT" --only-show-errors; }
NO_CACHE="no-cache, max-age=0, must-revalidate"

immutable_args=()
while IFS= read -r f; do [ -n "$f" ] && immutable_args+=(--include "$f"); done < _site-immutable.txt
if [ "${#immutable_args[@]}" -gt 0 ]; then
  s3 sync _site "s3://$BUCKET" --exclude "*" "${immutable_args[@]}" --size-only \
    --cache-control "public, max-age=31536000, immutable"
fi

exclude_args=(--exclude "*.html")
while IFS= read -r f; do [ -n "$f" ] && exclude_args+=(--exclude "$f"); done < _site-immutable.txt
s3 sync _site "s3://$BUCKET" "${exclude_args[@]}" --cache-control "$NO_CACHE"
# the CLI does not know this extension; Chrome refuses a manifest served as octet-stream
while IFS= read -r f; do
  s3 cp "_site/$f" "s3://$BUCKET/$f" --content-type "application/manifest+json" --cache-control "$NO_CACHE"
done < <(cd _site && find . -name '*.webmanifest' | sed 's#^\./##')

while IFS= read -r f; do
  s3 cp "_site/$f" "s3://$BUCKET/$f" --content-type "text/html; charset=utf-8" --cache-control "$NO_CACHE"
done < <(cd _site && find . -name '*.html' | sed 's#^\./##')

s3 sync _site "s3://$BUCKET" --delete --size-only
echo "deployed to https://$BUCKET/ ($(wc -l < _site-immutable.txt | tr -d ' ') immutable files)"
