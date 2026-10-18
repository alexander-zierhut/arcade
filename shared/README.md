# The arcade kit (`shared/`)

What every game has in common, built once: the loading screen, the language preference, "play as an app",
the way home, the performance mode, the campaign hooks, the local play statistics, the news sheet, the share
button and the backup of every game's progress. Plain ES5 files loaded with `<script>` tags, one global
`window.Arcade`, no build step. [`docs/GAME-SPEC.md`](../docs/GAME-SPEC.md) says what a game does with it;
this page is the API.

Every game folder has `shared` as a symlink to this folder; the release copies the files in. The kit's UI
(loading screen, sheets, toast) lives under `#arcade-ui` and takes the game's colours from CSS variables on
`:root` (see `arcade.css`: `--arcade-bg`, `--arcade-card`, `--arcade-ink`, `--arcade-accent`,
`--arcade-accent-ink`, `--arcade-muted`, `--arcade-font`, `--arcade-radius`).

## Files, in load order

| file | what it holds |
|---|---|
| `core.js` | `Arcade._` (internals), `Arcade.pure` (node-tested helpers), the kit's strings (`Arcade.t`), `Arcade.storage` / `Arcade.shared`, `Arcade.lang`, `Arcade.on` / `off` |
| `ui.js` | `Arcade.loading`, `Arcade.sheet`, `Arcade.closeSheet`, `Arcade.toast`, `Arcade.ready` |
| `app.js` | `Arcade.app` (install prompt, fullscreen, platform, the app hint), `Arcade.home` |
| `perf.js` | `Arcade.perf` (the performance mode, measured and manual) |
| `stats.js` | `Arcade.stats` (sessions and play time, this device) |
| `campaigns.js` | `Arcade.campaigns`, `Arcade.screen`, `Arcade.current` (the screen moments) |
| `news.js` | `Arcade.news` (the game's `news.js`) |
| `share.js` | `Arcade.share` |
| `backup.js` | `Arcade.backup` |
| `menu.js` | `Arcade.menu.items`, `Arcade.wire`, `Arcade.refresh`, `Arcade.run`, `Arcade.init` |
| `hooks.js` | the campaign list (edit this one) |
| `arcade.css` | the kit's UI |

`tests/kit.test.mjs` (root `npm test`) runs the pure helpers and the storage / backup wrappers in node;
`tests/site.test.mjs` exercises the kit in every game in headless Chrome.

## Start

```html
<script src="shared/core.js"></script> … <script src="shared/menu.js"></script>
<script src="shared/hooks.js"></script>
<script src="news.js"></script>
<script>Arcade.init({ game: 'my-game', title: 'My Game', version: '1.0.0' });</script>
```

`Arcade.init(options)`:

| option | default | meaning |
|---|---|---|
| `game` | | the folder name; the storage prefix is derived from it |
| `title` | document.title | shown on the loading screen and in the share text |
| `version` | | the game's version (news, seen state) |
| `langs` | `['de', 'en']` | the languages the game speaks; the kit's cards follow |
| `loading` | `true` | show the loading screen now |
| `autoHint` | `true` | the once-only "play as an app" hint on phones |
| `home` | `'../'` | where `Arcade.home()` goes |
| `share` | `{ image: <og:image> }` | the share picture; `url` overrides the page address |
| `news` | `window.ARCADE_NEWS` | the news list |
| `quiet` | | `function` returning true while the game shows a card of its own (no kit card then); may be set later on `Arcade.config()` |

Then, from the game:

- `Arcade.ready()` when the title can be shown (hides the loading screen; the hint or a campaign may follow).
- `Arcade.screen(name)` on every screen change: `'title' 'menu' 'play' 'pause' 'win' 'lose' 'end'`.
- `Arcade.share.set({ line })` when an end card opens.
- `Arcade.wire(el)` for markup with `data-arcade` rendered after init.

## `data-arcade` elements

Any element with `data-arcade="<id>"` runs that entry on click and is hidden when the entry cannot work on this
device. With `data-arcade-auto` the kit sets its label (in the current language); without it the game labels it.
Ids: `home`, `install` (the browser's prompt, when it offered one), `fullscreen` (when there is no prompt and the
API exists), `app` (the hint sheet, phones in a tab), `share`, `news` (gets `data-arcade-unseen="1|0"`), `perf`
(toggles, `aria-pressed`), `lang` (cycles), `backup-export`, `backup-import`. `Arcade.menu.items()` returns the same
entries as `{ id, label, run, visible }` for menus a game renders itself; `Arcade.run(id)` runs one.

## API

**Events.** `Arcade.on(name, fn)` → unsubscribe function; `Arcade.off(name, fn)`. Events: `init`, `ready`, `lang`
(code), `perf` (low: boolean), `screen` (name), `campaign` (id), `import` ({ count, games, pending }).

**Storage.** `Arcade.storage.get(name, fallback)` / `set(name, value)` / `remove(name)` / `key(name)` /
`persistent()`: JSON values under the game's prefix, never throws (memory fallback). `Arcade.shared.get/set/remove`:
the kit's own `arcade.*` keys (language, perf, stats, campaigns, session, installHint, pendingImport).

**Language.** `Arcade.lang.get()` (stored choice, else the browser's language, limited to `langs`), `stored()`,
`set(code)` (emits `lang`), `list()`, `toggle()`. `Arcade.t(key, vars)`: the kit's own strings.

**Loading.** `Arcade.loading.show(label)`, `progress(done, total)`, `hide()`, `visible()`. `Arcade.ready()`.

**UI.** `Arcade.sheet({ title, html, node, buttons: [{ label, primary, keep, onClick }], onClose, dismissable })`
(one at a time), `Arcade.closeSheet()`, `Arcade.sheetOpen()`, `Arcade.toast(text, ms)`.

**App.** `Arcade.app.platform()` → `'ios' | 'android' | 'desktop'`; `isStandalone()`; `canInstall()`,
`install()` → Promise<boolean>; `canFullscreen()`, `isFullscreen()`, `setFullscreen(on?)`; `hint()` (the sheet),
`hintWanted()`. `Arcade.home()`.

**Performance.** `Arcade.perf.low()` → boolean (apply the cheap mode when true); `mode()` → `'auto' | 'low' |
'high'`; `set(mode)`; `toggle()`; `label()`; `sample()` (started by `screen('play')`). Stored arcade-wide; a
measured verdict holds 14 days. The body gets `arcade-low-perf`.

**Stats.** `Arcade.stats.summary()` → `{ v, sessions: [{ id, g, s, e, p }], games: { id: { sessions, playMs,
last, first } } }`; `playMs()`; `session()`.

**Campaigns.** `Arcade.campaigns.define(list)` (hooks.js), `list()`, `due(screen)`, `show(campaign)`. A campaign:
`{ id, every, after, screens, from, until, max, title, text, button, dismiss, url, onceClicked }` (hooks.js explains
each). `Arcade.screen(name)`, `Arcade.current()`.

**News.** `Arcade.news.list()` (newest first), `latest()`, `text(entry, lang?)`, `seen()`, `unseen()`,
`markSeen()`, `open()`.

**Share.** `Arcade.share.set({ line, text })`, `context()`, `text()`, `image(line)` → Promise<File|null>,
`go()` → Promise<{ method: 'share' | 'share-text' | 'clipboard' | 'none' }>.

**Backup.** `Arcade.backup.games` (the selector sets `[{ id, title }]`), `exportText()`, `describe(text)`,
`importText(text, confirm?)` (inside a game: stored as pending, written by the next `init`; outside: at once),
`applyPending()`, `download()`, `pick()` (file dialog, confirm, import, reload). Format: `{ kind: 'arcade-backup',
format: 1, date, origin, kit, keys: { key: value } }`, every localStorage key of the origin.

**Pure helpers** (`Arcade.pure`, no DOM): `prefixOf`, `pickLang`, `compareVersions`, `newsSorted`, `newsPlain`,
`backupEncode`, `backupDecode`, `backupGames`, `campaignDue`, `perfVerdict`, `statsFold`, `shareText`.

## Changing the kit

Every game ships a copy at release time, so a change reaches all of them with the next deploy. Keep it plain ES5
(the games have no build step), keep every DOM use guarded (the tests load the files in node), keep the kit's
keys under `arcade.` (`scripts/check-storage.mjs` checks), and run the root `npm test` plus one game's browser
suite. The kit never draws into a game's canvas and never reads a game's own keys.
