# Arcade

Browser games, one folder each, published at https://arcade.alzlper.com/ with a selector page at the root
and every game under `/<game>/`.

- `cocktail-merge`: cocktail physics-merge game
- `supermarket-sorter`: shelf-sorting match-3 grocery game

## Layout

Every game has its own `package.json`, tests and `scripts/release.sh`, which builds the shippable files
into `<game>/dist` (`npm run release` inside the game). The game's `index.html` carries Open Graph tags
(`og:title`, `og:description`, `og:image`); the selector page is built from them, so a game's card is
whatever the game itself says it is.

`node scripts/build-site.mjs` builds everything into `_site/`: each game's release under `_site/<game>/`
and the selector at `_site/index.html`. Serve it with `python3 -m http.server --directory _site` to check.

## Deploy

`.github/workflows/ci.yml` runs each game's unit and browser tests on every push and pull request, and on
`main` builds `_site/` and syncs it to the Scaleway bucket `arcade.alzlper.com` (`nl-ams`). It needs the
repository secrets `SCW_ACCESS_KEY` and `SCW_SECRET_KEY` (the same pair the minigames repo uses).

## Adding a game

Create a folder with `scripts/release.sh` that writes `dist/index.html`, give the page Open Graph tags
with a 1200×630 image, and add the folder to the `matrix.game` list in `ci.yml` so its tests run.
