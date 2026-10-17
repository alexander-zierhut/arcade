# Amendment: app layer (key: app)

Files: `src/app/loop.js`, `src/app/dispatch.js`, `src/app/attract.js`, `src/app/states.js`, `src/main.js`,
`tests/browser/run.js`. Every item below states what to change in `docs/DESIGN.md` (revision 3) and why.

## A. Integration blockers found while testing (for the integrator, not DESIGN text)

1. **`index.html` doesn't load `src/render/fxdraw.js` or `src/render/guides.js`.** `render/frame.js` calls
   `CM.render.guides.aim` on every frame, so each frame throws (the loop's guard catches it and counts it).
   Add `<script src="src/render/fxdraw.js"></script><script src="src/render/guides.js"></script>` after
   `render/fx.js` and before `render/frame.js`, plus two boot-guard lines, for example
   `['src/render/fxdraw.js', function () { return !!CM.render.fxdraw; }]` and
   `['src/render/guides.js', function () { return f(CM.render.guides.aim); }]`.
2. **The boot guard checks `CM.art.backgrounds.draw`, but `src/art/backgrounds.js` (current version) exports
   `pick / start / setScene / current / state / isReady / paint / paintLive / credits / list`.** It has no `draw`,
   `load`, `ready` or `creditLine`. As a result, `index.html` shows "Missing or broken: src/art/backgrounds.js".
   Either backgrounds.js adds the fixed API, or the guard checks `f(CM.art.backgrounds.pick)` only.
   The app works with **both** shapes (see C.3).
3. With both fixed (tested on a copy of `index.html`), `node tests/browser/run.js` passes: boot, Play, a real
   pointer launch, 30 scripted launches, HUD rects, pause, the stored run, reload → Continue with the same score,
   and the title at 360×640, 375×667, 390×844 and 1920×1080 with a 160-character dedication.

## B. DESIGN 5.5: replace the `CM.app` and `CM.main` bullets with

**`CM.app`** (internal; one part per file in `src/app/`; `CM.main` re-exports the public parts)
- `ctx` [loop.js creates it]: the single shared mutable app context. Fields of 5.5 plus these additions (all
  read at call time by other files):
  `bgKey` (the scene drawn now), `playBgKey`, `attractBgKey`, `nextPlayBgKey`, `prevState`, `rotateReturn`,
  `seqStartMs` (WIN_SEQ / LOSE_SEQ start, `performance.now()` ms), `slowmoStartMs` (−1 = off), `hitStopMs`,
  `guardUntilMs`, `notReadyAtMs`, `runSavedAtMs`, `armedUntilMs`, `heldS`, `heldDir`, `dprCap` (2 → 1.5 → 1),
  `lowFx` (render halves particles), `debug` (`?debug=1`), `errors` (per-consumer counters),
  `stats {fps, steps, simMs, workMs}` (the `?debug=1` readout).
- [loop.js] `frame(nowMs)`, `guard(name, fn, ...args)` (extra arguments are passed to `fn`; returns its result or
  undefined), `fail(e)`, `start()` (starts the rAF loop once), `resetClock()` (`last = acc = 0`), `now()`,
  `applyIntents(g)`.
- [dispatch.js] `dispatch(events, source)`, `writeSave()`, `storeRun()`, `clearRun()`.
- [attract.js] `attract.start(done?)` (creates or resets the attract game and picks the title scene; `done(ok)`
  once that scene settles), `attract.step(g)`, `attract.reset()` (silent reset, keeps the scene),
  `attract.pickBackground(done?)`.
- [states.js] `setState(name)`, `newGame(seed?)`, `continueRun() → boolean`, `simulating()`, `update(nowMs)` (per
  frame: sequence timers and the 10-s run save), `onWin(e)`, `onLose()`, `keepPlaying()`, `quitToTitle()`,
  `back(key)` (P / Esc semantics of 5.7), `keyRestart()` (R, armed in PAUSE), `checkPortrait(lay)`,
  `showScene(key)`, `loadScene(key, done?)`, `overlayData(stateName)`.

**`CM.main`** (`src/main.js`): `boot()`, `relayout()` (re-measures the viewport and re-solves the layout; used by
resize, pageshow and the adaptive fallback), `handlers()` (the object given to `CM.ui.init`), `toggleMute(b?)`,
and the re-exports `setState`, `newGame`, `continueRun`, `frame`, `dispatch`.
`index.html`'s inline guard calls `CM.main.boot()` once on success. If it hasn't been called, `main.js` also boots
itself on `DOMContentLoaded`, unless `CM.bootFailed` is set, `#boot-error` exists or `body.boot-failed` is set.

**`CM.ui.init(handlers)`**: `handlers` additionally has `onPause`, `onPlayAgain`, `onTitle` and
`onToggleMusic(b)`. Every `onToggle*` takes the new boolean (or flips the stored value when it gets none).

**Intents** (`input.attach`) additionally have `escape()`, `state()` and `playing` (true only in PLAY), and
`pause(key)` receives `'p' | 'esc' | 'button'`.

**Overlay ids** for `CM.ui.showOverlay`: `'title' | 'pause' | 'win' | 'over' | 'rotate' | 'oops'` (from TITLE,
PAUSE, WIN_MENU, OVER_MENU, ROTATE, OOPS); `null` in PLAY, WIN_SEQ and LOSE_SEQ. `data` is
`{state, save, game, lay, coarse, best, wins, bestTier, highestName, score, newBest}`, plus
`{run (the RunRecord or null), hasRun, runScore, compact (H < 700), credit, credits[]}` for the title and
`{highestTier, highestTierName, runMask}` otherwise.

**Optional ui hooks** the app calls when they exist: `CM.ui.applyLayout(lay)` (or `layout`) on every relayout,
`CM.ui.refreshSettings()` (or `syncSettings`) after a settings change, `CM.ui.setMuteIcons(b)`,
`CM.ui.armRestart()` (visual for the R-key arm when the app arms it). If overlays.js has no `keyAction`, main.js
installs a fallback that handles Esc / P / R outside PLAY.

## C. DESIGN 5.7: add after "Save writes"

1. **Ownership of the presentation.**
   - `render.fx` handles the win flash, rays, confetti and the 1.10 zoom about the jug on the `win` event.
     states.js only sets the slow-mo, calls `setZoom(1, null, 400)` on Keep Playing and `setZoom(1, null, 0)`
     plus `fx.clear()` in `newGame` and `continueRun`.
   - Hit-stop is set by dispatch on `merge` events of tier 7/8 (`FX.HIT_STOP_MS`).
   - ui/hud.js owns the NEW BEST badge (it sets `ctx.newBestShown` inside `setHud`), the discovery toasts and the
     "Another Sangria!" toast.
   - For a rejected launch the app calls only `CM.ui.notReady()`, which plays the sound and asks `render.fx` to
     shake the launcher.
   - `ui.consume` runs before the save logic, so hud.js still sees the old `discovered` mask
     ("NEW COCKTAIL" vs "NEW").
2. **ROTATE returns** to PAUSE from PLAY, to WIN_MENU from WIN_SEQ, to OVER_MENU from LOSE_SEQ, and to the same
   state otherwise. Neither the attract game nor the play game ticks in ROTATE.
3. **Background scenes** (owner item 6). `newGame` picks a scene other than the previous game's. With the keyed
   API it uses `pick(playBgKey, Math.random())` and `load(key)`. With the single-current-scene API it uses
   `start(u, done, 2500)`, which also remembers the last scene across reloads. The key is stored as
   `ctx.playBgKey`, and in the run record as `meta.bgKey` so Continue shows the same scene. The title (attract
   mode) picks its own scene on every entry to TITLE, never the one it showed last. `setState` sets `ctx.bgKey` to
   the scene of the new state and (re)loads it (`setScene` for the single-scene API). With the keyed API the title
   also preloads the next game's scene. BOOT waits for the PNG overrides and the title scene, together at most
   1500 ms.
4. **Music** (owner item 7). At boot the app calls `audio.init({muted, ambience, music})`,
   `audio.setMusic(save.music !== false)` and `audio.music.start()`. It calls them again inside the first
   `pointerup` / `touchend` / `click` / `keydown` (capture). The engine only plays once its context runs, so the
   music starts with the first gesture on iOS. The "Music" toggle calls `onToggleMusic(b)`, then
   `setMusic(b)`, then the save write. Music keeps playing in every state (including pause); mute silences it
   through the master gain.
5. **Lifecycle.** `visibilitychange → hidden` and `pagehide`: in PLAY, `setState('PAUSE')`, which saves and stores
   the run. In any other state: write the save and store the run (the run is skipped when the game is over).
   On visible and on `pageshow`: `resetClock()`. On `pageshow` with `persisted`: relayout at once.
6. **`fail(e)`** also sets the failed game's `phase = 'over'`, so a corrupt game is never ticked or stored again.
   An exception in the **attract** game does not show OOPS: the attract game is recreated silently.

## D. DESIGN 5.8: notes to add under the code block

- The first frame after `start()`, `resetClock()` or entering PLAY advances nothing (`last = 0` → `real = 0`).
- Inside the step loop the game is re-read every step (`attract.step` may replace the attract game). The loop
  stops early when the state changes kind mid-frame (for example PLAY → LOSE_SEQ, or into TITLE).
- Keyboard aim speed restarts its ramp (`35 + 150·held_s`, max 110) when the held direction changes.
- `CM.app.update(nowMs)` runs every frame in a guard: WIN_SEQ → WIN_MENU at 1600 ms, LOSE_SEQ → OVER_MENU at
  1400 ms (real time), and the run snapshot every 10 s in PLAY.
- **Adaptive fallback** (7, item 7) lives in loop.js. In PLAY, the mean work time (sim + `update` + render,
  `performance.now()`) is averaged over 2-s windows. Above 12 ms: `ctx.dprCap` 2 → 1.5 → 1, `ctx.lowFx = true`,
  and `CM.main.relayout()`, which passes `min(devicePixelRatio, dprCap)` to `computeLayout`.

## E. DESIGN 5.9 and 5.4

- `RunRecord.meta` gains `bgKey: string` (optional; ignored when missing).
- `Save` gains `music: boolean` (default `true`). `src/ui/storage.js` already carries it. **`src/game/save.js`
  should add it** to `normalizeSave` (boolean, else `true`) and to `mergeSave` (a setting: it takes `next`),
  and test 46 should cover it. Until then storage.js keeps it alive on its own.
- In 2.11, "when the save is written" also includes every settings toggle (mute, ambience, music, numbers,
  relaxed).

## F. DESIGN 3.10 / 5.1

The document-level iOS page guards (WebKit `gesture*`, non-passive `touchmove`, `dblclick`, `contextmenu`) live
in `src/ui/input.js` (`installPageGuards`), not in main.js. main.js owns viewport measuring:
`visualViewport` unless it is missing or `scale > 1.01`. It re-measures on `visualViewport.resize`, `resize`,
`orientationchange` and `pageshow` (debounced 150 ms), and once more 500 ms after `orientationchange`. It reads the
safe-area probe `#safe-probe` and creates it when `index.html` has none. It sets explicit px sizes on the canvas,
`#input`, `#overlays`, `#ui` and every `[data-viewport]` element, and the CSS variables `--vw`, `--vh`,
`--stage-x` and `--stage-w`. `?debug=1` key `9` (two touching T8s at y 30) is handled in main.js.

## G. DESIGN 6.2: replace the "Optional browser smoke test" bullets with

**Optional browser smoke test** (`tests/browser/run.js`, `npm run test:browser`; playwright-core driving the system
Chrome found by `tests/browser/chrome.js`). It opens `index.html` via `file://`
(`SMOKE_PAGE=<file>` overrides the page and `SMOKE_OUT=<dir>` the screenshot folder) and exits 1 on any failure.
- **Main flow at 390×844 (DPR 2):**
  - It reaches TITLE (it stops early when the boot guard fails and prints the guard's message) and writes
    `docs/preview/smoke-title.png`.
  - It clicks the visible **Play** button and expects PLAY.
  - One real mouse press and release below the dashed line must launch a glass (this checks the input layer,
    `unprojectPointer` and the input guard).
  - It makes 30 launches through `window.CM` (`botAim` + `setAim` + `requestLaunch(g, 'key')` on
    `CM.app.ctx.game`, 650 ms apart, advanced by the real loop) and expects score > 0 and no errors counted by
    `CM.app.guard`.
  - The HUD rects (`#hud-coin`, `#hud-pill`, `#btn-pause`, `#btn-mute`, `#hud-next`, `#hud-next-label`,
    `#hud-best`) must be inside the viewport and pairwise disjoint (test 49's rules; coin and pill may overlap).
    Then it writes `smoke-play.png`.
  - It pauses with the Pause button (or P), expects PAUSE and writes `smoke-pause.png`.
  - The run record must be stored. After a reload the title must offer **Continue**, and Continue restores the
    same score.
- **Title at 360×640, 375×667, 390×844 and 1920×1080**, with a 160-character, 3-line dedication injected (an init
  script defines `CM_DEDICATION` as a getter): no page or console errors (a failed load of `assets/tier-N.png` is
  ignored), the Play button fully inside the viewport, the dedication shown, and every visible text ≥ 13 px.
- It runs Chrome only and is no substitute for the iPhone QA pass (3.10).
