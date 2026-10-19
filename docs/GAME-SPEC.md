# The game spec: what every arcade game does

This is the contract between a game and the arcade. A new game is built from this page and from
[`shared/README.md`](../shared/README.md) (the kit's API) alone: **do not read the other games for it**. Their
art, colours, sounds, names and feel are their own, and the next game gets its own. What is the same in every
game is not re-built either: it comes from the kit in `shared/`, so every game gets it the same way and a fix in the
kit reaches all of them.

`node scripts/check-storage.mjs`, `node scripts/check-versions.mjs` and the root `npm test` (`tests/spec.test.mjs`)
check the parts of this page a script can check; CI runs them on every push.

## 1. Folder, URL, storage

- One folder at the repo root, say `my-game/`. The folder name is the URL (`https://arcade.alzlper.com/my-game/`)
  and the game's **id** in the kit (`Arcade.init({ game: 'my-game' })`).
- Every storage key starts with the folder name in camelCase plus a dot (`myGame.`), declared once as
  `STORAGE_KEY` in the game's config (README "Storage"). Use `Arcade.storage` (it prefixes for you) or your own
  wrapper with that prefix. localStorage only; no service worker, cookie, IndexedDB or BroadcastChannel.
- `shared` inside the game folder is a symlink to the repo's `shared/` (`ln -s ../shared shared`); the release
  copies it in, so the deployed game is self-contained.
- `release.json` lists what ships: at least `index.html`, `news.js`, `shared`, `manifest.webmanifest`, the sources
  and the assets, and says when the game went live (`"released": "YYYY-MM-DD"`: the selector shows a "New!" badge
  on the card for two weeks from that day). `scripts/release.sh` is the thin wrapper every game has (copy it).

## 2. index.html

The head carries the Open Graph tags (the selector's card is built from them) and the web manifest:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#RRGGBB">
<meta property="og:type" content="website">
<meta property="og:title" content="My Game">
<meta property="og:description" content="One or two sentences shown on the card.">
<meta property="og:url" content="https://arcade.alzlper.com/my-game/">
<meta property="og:image" content="https://arcade.alzlper.com/my-game/assets/icons/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<link rel="manifest" href="manifest.webmanifest">
<link rel="stylesheet" href="shared/arcade.css">
```

The body starts with the kit, in this order, before any script of the game, and `Arcade.init` right after it (so
the loading screen is on the screen before the game's own scripts even load):

```html
<script src="shared/core.js"></script>
<script src="shared/ui.js"></script>
<script src="shared/app.js"></script>
<script src="shared/perf.js"></script>
<script src="shared/stats.js"></script>
<script src="shared/campaigns.js"></script>
<script src="shared/news.js"></script>
<script src="shared/share.js"></script>
<script src="shared/backup.js"></script>
<script src="shared/menu.js"></script>
<script src="shared/hooks.js"></script>
<script src="news.js"></script>
<script>Arcade.init({ game: 'my-game', title: 'My Game', version: '1.0.0' });</script>
```

`version` must equal `package.json`'s (`scripts/check-versions.mjs`; `scripts/bump-version.mjs` sets both).
Scripts and stylesheets are referenced with plain relative paths, no query strings (the site build hashes them).

## 3. The web manifest and the icons

`manifest.webmanifest` with `name`, `short_name`, `start_url: "./"`, `scope: "./"` (never `/`), `display:
"fullscreen"`, `background_color`, `theme_color`, and icons of **192 and 512 px** (PNG, `purpose: "any"`), plus
`assets/icons/apple-touch-icon.png` (180 px) linked in the head. Chrome needs the manifest and the two icons to offer
the install prompt; the kit's "play as an app" flow (section 7) rests on it. The OG image (1200×630) is rendered by
`node scripts/og-images.mjs my-game` from a gameplay screenshot.

## 4. Languages

Every game speaks **German and English**. The kit holds the player's choice for the whole arcade
(`Arcade.lang.get()`, a browser-language default); the game reads it at boot, listens to `Arcade.on('lang', …)`
and offers the switch in its settings (`Arcade.lang.set(code)` or a `data-arcade="lang"` button). The game's own
strings live in one table per language in the game (`src/ui/strings.js` or similar), with the `title` in the kit's
`init` in the game's title language. A game that is not translated yet says so in `init` (`langs: ['en']`) so the
kit's own cards speak the game's language too; that is a gap to close, not a choice.

## 5. The title screen

Every title has the same structure, in the game's own look, so the games read as one creator's games without
looking alike:

1. the logo (name and sub line) and the game's own art,
2. the primary **play** button (continue / start), optionally one secondary mode,
3. a **chip row**: how to play, the game's own sheets (highscores, collection, …), settings,
4. **the way home**: a round house button in a corner of the title (`<button data-arcade="home"
   aria-label="Alle Spiele / All games">` with a house icon in the game's style), or a chip in the row, or the
   link in the footer line,
5. a footer line with the **version**.

No news chip and no backup buttons: the changelog is the kit's card (section 11), the backup lives in the
selector's profile. The kit wires every `data-arcade="…"` element (home, install, fullscreen, app, share, news,
perf, lang, backup-export, backup-import), hides the ones that cannot work on this device, and keeps the state
attributes (`data-arcade-unseen` and `data-arcade-new` on news, `aria-pressed` on perf and fullscreen) current.
The game styles them.

## 6. Pause menu and settings

The pause card has resume, restart, the game's own extras, and quit to the title. The settings (a sheet from the
title and the pause card) hold the game's switches (sound, music, the game's own options) and the standard ones:
**performance mode** (`Arcade.perf`), **language** (section 4) and, where the game offers one, fullscreen. A game
renders them itself (its own switch rows, `Arcade.menu.items()` lists them with labels) or drops `data-arcade`
buttons in; either way the kit holds the state, the same in every game.

## 7. Play as an app

Nothing to build: the kit catches the browser's install prompt, offers it once on phones in a browser tab (with the
iOS steps where Safari has no prompt, and fullscreen where only that exists), and keeps the entries in the menus
(`data-arcade="install"` / `"fullscreen"` / `"app"`). The game only needs the manifest (section 3). Do not add an
"as an app" button of your own.

## 8. The way home

`Arcade.home()` or a `data-arcade="home"` element: the title screen has one (section 5); the pause card may.

## 9. Loading screen

The kit shows its loading screen from `Arcade.init` on. The game loads what it needs to show its title without
anything popping in (its sprites, backgrounds, fonts), reports `Arcade.loading.progress(done, total)` when it can,
and calls **`Arcade.ready()`** once the title can be shown. Never show the title with assets still arriving; the
loading screen hides itself after 12 s at the latest, so a stuck load never traps the player.

## 10. Screens and the performance mode

The game tells the kit where it is: `Arcade.screen('title' | 'menu' | 'play' | 'pause' | 'win' | 'lose' | 'end')`
on every screen change (the state machine's one line). This drives the play statistics, the performance
sampling (frames are measured while the screen is `play`) and the campaign moments (a card may show on a quiet
screen, never during play).

The game has a cheap mode and applies it when `Arcade.perf.low()` is true, at boot and on `Arcade.on('perf', fn)`:
lower canvas resolution, fewer particles, fewer things drawn, shorter animations, and `body.arcade-low-perf` for
CSS. The kit switches to it by itself when the measured frames say the device cannot keep up (and tells the
player), and the player can set it in the settings. A game's own "performance mode" switch sets `Arcade.perf`, it
does not keep a second state.

## 11. News

`news.js` in the game folder, newest first, both languages, a date per entry:

```js
window.ARCADE_NEWS = [
  { "version": "1.0.1", "date": "2026-10-18", "de": "<p><b>Neu:</b> …</p>", "en": "<p><b>New:</b> …</p>" }
];
```

The entry for the current version must exist (`scripts/check-versions.mjs`). One `<p>` per point; the first
point of a version is the most important one. Write it for the player (what changed for them), not for the repo.

The game builds nothing for it. The kit shows the changelog as one card for every game: one change per page
(version, date, its points as a list), "older" / "newer" to page through all of them, "Got it" to close. It
opens **by itself on the title screen** when something changed since the player was last here (the seen version
is stored under the game's prefix as `seenVersion`), once per version, never on a first visit. A game may also
offer it from a menu (`data-arcade="news"` or `Arcade.news.open()`). The selector has a "What's new" button on
every card that opens the same card for that game (with a "New" label for a week after a change); reading it
there counts as seen in the game.

## 12. Share

Every end card (level won, level lost, game over, streak banked) has a **share** button
(`data-arcade="share"`, or the game's own button calling `Arcade.share.go()`), and the game sets the line before
the card opens: `Arcade.share.set({ line: 'Level 12 cleared: 4,520 points' })`. The kit shares a picture (the OG image
with the line on a band) plus the text and the game's address where the browser can, the text alone where only
that works, and copies the text everywhere else.

## 13. Campaigns and statistics

Nothing to build in the game: `shared/hooks.js` lists the campaigns (a card every N minutes across all games,
after M minutes of play), the kit shows them on quiet screens; the play statistics (sessions and play time per
game, this device only) collect from `Arcade.screen`. They travel with the backup.

## 14. Backup

Nothing to build in the game: the selector page exports and imports every game's progress on the device (every
localStorage key of the origin), so a player switches phones with one file. A game that offers its own
export / import keeps it; it may also offer the arcade-wide one with `data-arcade="backup-export"` /
`"backup-import"`.

## 15. Tests

CI runs, per changed game, `npm test` (unit tests, node) and `npm run test:browser` (the real game in headless
Chrome, `tests/browser/run.js`, with the harness `tests/browser/chrome.js` copied from an existing game). The
browser suite must: boot without console errors or failed requests, play through the core loop with real pointer
input, pause and resume, reload and continue a stored run, check the layout (HUD, cards and buttons inside the
viewport) at 360×640, 390×844, 430×932, 768×1024 and 1280×800, and write a preview screenshot to `docs/preview/`.
The root `npm test` builds the site and boots every game (one line in `BOOT` in `tests/site.test.mjs`), checks the
kit in it and this spec. `node scripts/check-storage.mjs` and `node scripts/check-versions.mjs` run on every push.
A game is beta until its suites and a real phone say otherwise (`"status": "beta"` in `release.json`).

## 16. Docs per game

`README.md` (what it is, how to run and test), `docs/ARCHITECTURE.md` (files and the event flow),
`docs/HOW-TO-CHANGE.md` (where to change what), `docs/RELEASE.md` (the release checklist), `docs/STATUS.md`
(version, what changed, known gaps). Written for the next person, in English.
