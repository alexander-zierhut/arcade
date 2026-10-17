# Arcade

Browser games, one folder each. Every game has its own `package.json` and `scripts/release.sh`,
which builds the shippable files into `<game>/dist` (`npm run release`).

- `cocktail-merge`: cocktail physics-merge game
- `supermarket-sorter`: shelf-sorting match-3 grocery game

On every push to `main`, `.github/workflows/deploy.yml` builds each game and publishes them to
GitHub Pages at `/<game>/`, with an overview page listing all games at the root. A new game is
picked up automatically if it has a `scripts/release.sh` that writes `dist/index.html`.
