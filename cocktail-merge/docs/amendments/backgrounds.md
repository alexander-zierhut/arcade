# Amendment: image beach scenes (key: backgrounds)

Owner playtest items 2 (far-edge headroom) and 6 (image beach-bar scenes, random per game, procedural fallback).
Implemented in `src/art/backgrounds.js` (304 lines, browser-only IIFE on `CM.art`). Config block: see
`docs/amendments/backgrounds-config.md`. Review harness: `tests/browser/backgrounds.html` + `tests/browser/backgrounds.js`
(writes `docs/preview/backgrounds.png`).

---

## 1. DESIGN 4.5: insert a new first sub-section "4.5.0 Image scenes" before "**Background** (static canvas ...)"

Replace the first line of 4.5's body with:

> **Image scenes (default).** Each new game shows one of the owner-approved beach pictures in
> `assets/backgrounds/` (list and per-scene numbers in `CONFIG.BACKGROUNDS`, 5.3), picked at random and never the
> same as the previous game's scene. The procedural beach below is the **fallback**: it is drawn while the chosen
> picture is still loading, when it fails to load or is missing, and when `BACKGROUNDS.scenes` is empty. The roof
> (below), the table (4.4) and everything in front are the same for every scene.
>
> - **Fit** (`CM.art.backgrounds.fit`). The picture is scaled uniformly and placed so that
>   1. it covers the full canvas width plus the overdraw margin `mg` and a sway pad of `PAD·uiK` px on both sides;
>   2. its horizon (`horizonFrac` of its height, measured per picture) lands at `HORIZON_AT · farY` = 0.55·farY;
>   3. its top covers the canvas top (−mg);
>   4. it reaches toward the canvas bottom, but zooming for that is capped at `ZOOM_MAX` (1.25) times the scale of 1-3;
>   then it is shifted horizontally so its x-fraction `anchorX` sits at the stage centre `cx`, clamped so it still
>   covers. Portrait phones see about 60-70 % of a 16:9 picture's width; `anchorX` keeps each picture's subject in
>   frame (the beach-bar scene keeps its tiki bar on the left: anchorX 0.30).
> - **Ground.** Below the picture's bottom edge the canvas is filled with the scene's `ground[0]` sand colour, joined
>   by a soft gradient over the picture's last `SEAM` (6 %) rows, darkened by 10 % toward the canvas bottom and
>   sprinkled with seeded 1-2 px specks in `ground[1]`. (On portrait phones this is the band around the tier strip; on
>   wide canvases the sides below the picture.)
> - **Headroom haze (item 2).** Tall far glasses rise from the far table edge into the band between the horizon and
>   `farY` (T7 at y = r reaches 3.55 R above its anchor, just below the horizon at 0.55·farY). A vertical gradient in
>   the scene's `haze` colour, from alpha 0 at the horizon to `haze[3]` (0.10-0.18) at 75 % of the way to
>   `farY + 0.06 H` and back to 0, calms that band so glass outlines read cleanly. Nothing of the scene is ever drawn
>   over the glasses.
> - **Parallax (beach-bar scene).** A scene may list `layers` (sky, cloud, sea, land, decor for the beach bar). The
>   first run of static layers (the sky) goes into the cached static background; the clouds drift right at
>   4 px/s·uiK and wrap (the cloud layer tiles horizontally); the sea sways ±1.5 px·uiK with a 14 s period; land and
>   decor, the ground and the haze form one cached front canvas. If any layer fails to load, the flat `file` is used.
>   Reduced motion freezes drift and sway.
> - **Credit.** The CraftPix pictures are OGA-BY 3.0 and need the credit line on the title screen (3.5).

The existing 4.5 "Background" bullets stay as written, now headed "**Procedural fallback background**".

## 2. DESIGN 3.8, animation catalogue, row "Palms / clouds / sea"

Append: "With an image scene (4.5.0) these procedural parts are not drawn; instead the beach-bar scene's cloud layer
drifts 4 px/s·uiK and its sea layer sways ±1.5 px·uiK (14 s period). The other image scenes are static."

## 3. DESIGN 3.5, Title, add after "**Stats:**"

> - **Picture credit** (last child of the title column, under the how-to card or button): every line of
>   `CM.art.backgrounds.credits()` joined with " · ", 11 px / 600, colour `rgba(255,246,228,0.9)`,
>   `text-shadow: 0 1px 2px rgba(40,20,5,0.8)`, centred, max-width 92 % S, set with `textContent`. Currently it reads
>   "Beach 2D Backgrounds by CraftPix.net (craftpix.net), OGA-BY 3.0". It is shown even while the procedural fallback
>   is up (the pictures are part of the game). Not shown in Pause/Win/Over.

## 4. DESIGN 5.1, Files

- Add after `src/art/scenery.js`:
  `src/art/backgrounds.js        image beach scenes: random pick per game, loading, cover fit, parallax, credits (4.5.0)`
- Add after `src/art/overrides.js`'s optional assets line:
  `assets/backgrounds/            the owner-approved scene pictures + CREDITS.md (OGA-BY 3.0 / CC0); shipped`
- Add to the tests list:
  `tests/browser/backgrounds.html, backgrounds.js   review harness: every scene at 390x844 and 1280x800 -> docs/preview/backgrounds.png`
- **Script order**, step 3: `art/scenery`, **`art/backgrounds`**, `art/overrides`, `art/sprites`.
- **Forbidden** paragraph, replace the last sentence with: "The only resource loads are the local `<link>` stylesheets
  and `<script src>` files above, and `new Image()` (or `<img>`) for two purposes only: the optional
  `assets/tier-N.png` overrides (4.3) and the scene pictures in `assets/backgrounds/` (4.5.0)."
- **Boot guard** `CHECKS`, add after the scenery line:
  `['src/art/backgrounds.js', function () { return f(CM.art.backgrounds.paint) && f(CM.art.backgrounds.start); }],`

## 5. DESIGN 5.3, Config

Add the `BACKGROUNDS` block exactly as given in `docs/amendments/backgrounds-config.md`.

## 6. DESIGN 5.5, `CM.art`, add [backgrounds.js]

`CM.art.backgrounds` (all canvas CSS px; the caller applies dpr):
- `DEFAULT_LIST` — the inlined copy of `CONFIG.BACKGROUNDS.scenes`; `list() → Scene[]` (config wins when present).
- `pick(prevKey, u) → key | null` — pure: `u ∈ [0,1)` picks among the scenes other than `prevKey` (all of them when
  there is only one).
- `start(u?, done?, timeoutMs?) → key | null` — new-game choice: picks with `pick(lastKey, u ?? Math.random())`,
  remembers the key (memory + localStorage `cocktailMerge.v1.scene`, try/catch, 5.9), makes it current and loads it.
  `done(key, ok)` runs once, when the picture settled or after `timeoutMs` (then `ok = false`; the picture still
  appears when it arrives, signalled by `version()`).
- `setScene(key, done?)` — makes a scene current without touching the remembered key; `done(ok)`.
- `current() → key | null`, `state() → 'none' | 'loading' | 'layers' | 'flat' | 'failed'`, `isReady() → boolean`,
  `hasLive() → boolean` (true for a loaded layered scene).
- `version() → number` — changes whenever the current scene or its load state changes. **The renderer rebuilds its
  cached static background canvas when this differs from the value it last built with** (as well as on resize).
- `fit(scene, lay, vw, vh, margin) → {s, x, y, w, h, hY, bottom, pad}`.
- `paint(ctx, lay, vw, vh, margin) → boolean` — same contract as `paintBackground` (ctx origin = screen
  (−margin, −margin)). Draws the whole flat scene, or only the static base (sky) of a layered scene. Returns
  **false and draws nothing** when no picture is ready: the caller then paints the procedural background.
- `paintLive(ctx, lay, vw, vh, nowMs, reduced) → boolean` — screen coordinates, right after the cached background.
  For a layered scene draws clouds, sea, and the cached front (land, decor, ground, haze); returns false otherwise.
  Its pre-scaled caches (at `lay.dpr`) are rebuilt on layout, dpr or scene change; replaced canvases are released
  with `width = height = 0` (3.10).
- `credits() → string[]` — unique non-empty credit lines of all listed scenes (title, 3.5).
- `setBase(prefix)` — URL prefix for pages outside the project root (the review harness passes `'../../'`); the game
  never calls it.
- `release()` — frees the parallax caches.

## 7. DESIGN 5.7, state machine

- **BOOT**: call `CM.art.backgrounds.start(undefined, cb, 1200)` alongside `loadOverrides`; BOOT waits for both
  (each with its own timeout) before TITLE. The title/attract shows this scene.
- **newGame**: the first game after boot keeps the title's scene (it is already different from the previous session's
  last game); every later `newGame` (Play Again, New Game, Restart, Win → New Game) calls
  `CM.art.backgrounds.start()` (no wait; the procedural beach shows for the fraction of a second a cold load takes).
  **continueRun** and Keep Playing keep the current scene. Attract resets do not change it.

## 8. DESIGN 5.9, Persistence, add a bullet

- **Last scene:** key `cocktailMerge.v1.scene` holds the key of the last game's background scene (a plain string),
  read and written by `src/art/backgrounds.js` itself in try/catch; on failure it lives in memory only. It is not part
  of `Save`, so `normalizeSave`/`mergeSave` are unchanged.

## 9. DESIGN 5.10, render pipeline step 2

Replace with:
> 2. Static background canvas (with its overdraw margin; built by `CM.art.backgrounds.paint`, or by
>    `CM.art.paintBackground(…, {static: true})` when that returns false; rebuilt on resize and when
>    `CM.art.backgrounds.version()` changes). Then the live parts: if the image scene is in use,
>    `CM.art.backgrounds.paintLive(ctx, lay, vw, vh, nowMs, reduced)`; otherwise the procedural
>    `paintBackgroundLive` (clouds, foam, sea sparkles and palms). Never both.

## 10. DESIGN 7, risks, add

- **Tainted canvases on file://.** Pictures loaded from `file://` taint every canvas they are drawn into. Nothing in
  the game reads pixels back (`getImageData`, `toDataURL`, `toBlob`) from the background canvas or the render canvas;
  keep it that way. (backgrounds.js measures nothing at runtime: horizons and ground colours are configured.)
- **Memory (iOS).** A portrait phone at dpr 2 holds, besides the renderer's static background, about 6 MB of parallax
  caches for the beach-bar scene (front canvas ≈ 836×1500 device px plus small cloud and sea strips); other scenes
  hold none. Decoded pictures: one 1920×1080 (8 MB) or 3000×2000 (24 MB) image per loaded scene; previously used
  scenes stay decoded in the `Image` cache (at most the 5 listed).

## 11. DESIGN 6.3, manual QA, add

- Start 6 new games in a row: the background changes every time, never repeats back to back; with
  `assets/backgrounds/` renamed, the procedural beach appears and nothing errors. The beach-bar scene's clouds drift
  and wrap without a seam; with reduced motion they stand still. The title shows the CraftPix credit line.
