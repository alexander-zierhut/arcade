#!/usr/bin/env bash
# Builds a clean, shippable copy of the game in dist/ and zips it into release/.
# Only what the browser needs is included (see docs/DEPLOY.md). What ships is listed in ../release.json and the
# steps live in the root scripts/release.mjs. This file is the override point: a game that needs something the
# manifest cannot express can do it here, before or after the exec. It must stay: games are found by it.
set -euo pipefail
cd "$(dirname "$0")/.."
exec node ../scripts/release.mjs .
