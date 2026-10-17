# Amendment: render (src/render/*)

Written by the render agent. Merge these into docs/DESIGN.md. Section numbers refer to revision 3.

## A. 5.1 Files: the render pipeline is four files, not two

Owner rule: every source file stays under 400 lines. fx.js plus frame.js came to about 640 lines, so the drawing
code is split into two more files. Replace the two `src/render/` lines of the 5.1 file list with:

```
src/render/fx.js              easings, FX state (3.8): per-body looks, ghosts, pools, consume(events), shake, zoom, view
src/render/fxdraw.js          draws the FX pools: rays, rings, particles, confetti, floaters, flying coins, sparkles,
                              danger vignette, win flash, lose dim
src/render/guides.js          aim guide + gold merge hint, launcher cooldown ring + chevron, cancel badge,
                              first-run hand hint, ?debug=1 colliders and readout
src/render/frame.js           init/resize/draw/view: render pipeline (5.10), caches, headroom zoom, background choice
```

**Script order**: replace step 4 with:
4. `render/fx`, `render/fxdraw`, `render/guides`, `render/frame`;

(Step 3 also gains `art/backgrounds` after `art/scenery`; that comes from the backgrounds amendment.)

**Boot guard (5.2)**: add these two lines after the `src/render/fx.js` line:

```js
  ['src/render/fxdraw.js', function () { return f(CM.render.fxdraw.over); }],
  ['src/render/guides.js', function () { return f(CM.render.guides.aim); }],
```

`index.html` must load all four render files in that order.

## B. 5.5 `CM.render`: additions to the exact API

Everything in 5.5 is kept as specified. These are additions:

- `fx.notReady()`: shakes the launcher (±4 px·k, 3 cycles, 180 ms) and flashes the cooldown ring orange.
  `app/loop.js` already calls it when `requestLaunch` returns `'rejected'`. There is no game event for this.
- `shake(px, ms?)`: `px` is in px·k. Without `ms` it decays as exp(−t/0.12 s) (3.8). With `ms` it decays over `ms`
  (τ = ms/3, cut at `ms`); the lose sequence uses `shake(5, 400)`. A weaker shake never cuts off a stronger one.
- `setZoom(target, about, ms)`: `about` is `{x, y}` in **world px**, the canvas px that `projection.project` returns.
  `null` keeps the previous centre. Under reduced motion the target is forced to 1.
- `view()` returns the **composite** of the headroom zoom (section C) and the win zoom, as `{zoom, aboutX, aboutY}`.
  Pass it straight to `projection.unprojectPointer`. Inversion was checked to be exact during the win zoom.
- `render.headroom() → number`: the current headroom zoom (1 = none), shown in the `?debug=1` readout.
- `render.fxdraw.*`, `render.guides.*`, plus `fx.update/look/ghosts/ghostAt/launcherAt/note/setBase/view/pools`, are
  internal to the render files.

**Sequence visuals come from `fx.consume`**, so `states.js` only times the states:
- `win` (play game only): pale-yellow flash 0.35 → 0 over 120 ms; green-and-yellow rays at the jug for 1.5 s;
  140 confetti from the two bottom corners of the stage; `setZoom(1.10, jug, 600)`.
  `states.js` calls `setZoom(1, null, 400)` on Keep Playing and `fx.clear()` in newGame (both already done).
- `lose` (play game only): the offending glasses blink the red silhouette 3 times (150 ms on/off), `shake(5, 400)`,
  and the `rgba(40,20,10,0.35)` dim fades in over 600 ms. The dim shows only while `state` is LOSE_SEQ or OVER_MENU.
- `jugBurst`: two jug ghosts shrink to 0 over 250 ms (from each jug's last drawn position); "Fiesta!" at 34 px·k;
  80 confetti from the burst point; T9 rings; `shake(8)`.
- Attract-game events (detected as `game === CM.app.ctx.attract`) never trigger the win or lose sequence visuals.

**App-context fields the renderer reads** (all optional, read at call time):

| Field | Use |
|---|---|
| `state` | Which game to draw: TITLE → `attract`; BOOT → table only; otherwise `game` |
| `lay` | The layout. A new object automatically triggers `resize` |
| `bgKey` | The image scene to draw (section D) |
| `intents.cancel` | Cancel state: grey guide at α 0.3 and the ✕ badge. `ui/input.js` sets it |
| `save.showNumbers` | Tier-number discs |
| `save.best` | First-run hand hint |
| `dprCap` | Caps the canvas DPR (adaptive fallback of `app/loop.js`). If it is missing, frame.js runs its own 12 ms / 2 s fallback |
| `lowFx` | Halves particles and confetti |
| `stats`, `errors` | `?debug=1` readout |

Hit-stop is not part of render: `app/dispatch.js` sets `ctx.hitStopMs` from the merge events.

**FX timing.** Events are stamped on the draw timeline: the last `nowMs` passed to `draw`, plus the real time since
that frame. This keeps FX correct whatever clock the caller's `nowMs` comes from.

## C. 3.2 / 5.10: headroom for tall far glasses (owner item 2)

`projection.computeLayout` reserves `HEADROOM·H = 0.12 H` above the far edge. That is not enough on short or wide
viewports. The tallest sprite standing at y = r (max over tiers of `TOPA[t]·R[t]·kX·s(R[t])` above its anchor; T9
and T7 are about equal) then rises into the HUD and the string lights.

Measured with the current radii:
- 360×640 standard: just fits.
- 1366×768: about 15 px too tall.

**Resolution (render side; projection.js is unchanged).** At every layout or radius change, frame.js computes:

```
limit = max(hud.bottom, 0.105·H + 9·uiK) + 4              // HUD bottom, or the lowest string-light bulb
top   = min over t of footprint(50, R_t, R_t).Y − TOPA_t·R_t·kX·s(R_t)
z     = top ≥ limit ? 1 : max(0.75, (nearY − limit)/(nearY − top))
```

The table, glasses and FX (the "world" layer) are drawn scaled by `z` about `(cx, nearY)`. The near edge, the
launcher row and the strip therefore stay where they are, and only the far part of the table moves down by
`(1 − z)·(nearY − farY)`. The background and roof are not scaled. The procedural background and the image scenes get
a layout whose `farY` is the drawn far edge, so the sand and horizon bands line up with it.

`render.view()` folds `z` into the zoom it returns, so pointer input stays exact. ui/input's `sy < farY` test
compares un-zoomed (world) y with `lay.farY`, which is the drawn far edge after inversion.

Typical values: 1.000 on 360×640, 375×667, 390×844 and 412×915; 0.970 on 1366×768.

**Better long-term fix (optional, for whoever owns projection.js):** add the term above to `farTarget` in step 3 of
the layout solve, as `farTarget = max(hudBottom + 0.12H, 0.27H, limit + tallest)`. computeLayout knows `kX`, and the
tallest extent is linear in `kX`. When that lands, frame.js computes `z = 1` and needs no change.

## D. Background choice (4.5 / backgrounds amendment)

frame.js draws the first background layer as follows:

1. **Fixed API.** If `CM.art.backgrounds.draw` and `.ready` exist, and `ready(app.bgKey)` is true, it calls
   `draw(ctx, key, vw + 2m, vh + 2m, farTop + m, nowMs)` translated by (−m, −m), where m is the 12·uiK shake margin.
   `farTop` is the drawn outer far edge.
2. **Current backgrounds.js API.** Otherwise, if `.paint`, `.isReady()` and `.paintLive` exist and `isReady()` is
   true, `paint()` goes into a static cache, rebuilt when `version()` changes, and `paintLive()` runs every frame.
3. **Fallback.** Otherwise the cached procedural `paintBackground(..., {static: true})` plus `paintBackgroundLive`.

frame.js never calls the procedural painter uncached per frame.

## E. Deviations from the spec

1. **4.2 draw scale smoothing.** The in-world sprite pass uses `imageSmoothingQuality = 'low'` (bilinear), not
   `'high'`. Sprites are always drawn at 0.55–1.03× their cache resolution, where bilinear looks the same
   (side-by-side check). Chrome's `'high'` and `'medium'` rebuild the mipmaps of canvas sources on every `drawImage`:
   measured 28.7 ms vs 8.6 ms per flushed frame at DPR 2 with 40 glasses (headless software raster).
2. **5.10 step 8 light rays** are drawn at the end of step 5 instead, after the shadows and before the bodies.
   3.8 says the rays are "behind the child"; drawing them over the glasses would wash out the pile.
3. **3.8 chain label.** "CHAIN ×N" and the depth word are on two lines (the word at 0.8 size), stacked above the
   score floater, so neither overlaps the other on a 360-px stage.
4. **3.8 win rays** last 1.5 s, not the 600 ms of the merge rays, so they cover most of the 1.6 s WIN_SEQ. The T9
   merge rays keep 600 ms.
5. **3.6 hand hint.** "Drag here" (15 px·k) is drawn 30 px·k above the row y = 152, so it stays on the table and off
   the strip.

## F. Performance notes

All measured in headless Chrome with software raster at 390×844 and 40 glasses; an iPhone GPU canvas is much faster.
- Render JS time (without the GPU flush): median 0.5–0.7 ms per frame.
- Flushed frame cost:
  - DPR 1: about 12.5 ms, of which the glasses take 6 ms.
  - DPR 2, procedural background: about 9 ms.
  - DPR 2, layered `beach-bar` scene: about 46 ms. `backgrounds.paintLive` alone is about 18 ms, because it redraws
    several full-width layer caches every frame.

**Recommendation for the backgrounds owner:** cache the slow-moving parallax layers more coarsely, for example
redraw at most every 100 ms. Alternatively, flatten everything except the drifting clouds into one static canvas.

Allocation: draw-list item objects, footprint outputs and every FX pool (16 ghosts, 24 rings, 6 ray slots,
256 particles, 240 confetti, 16 texts, 18 coins) are allocated once. Fonts for tier discs are cached per pixel size.
The only per-frame allocations left are the rare ray gradients and the debug readout strings.

## G. Review tool

`node tests/browser/render-check.js [query] [out.png] [WxH] [dpr]` opens `tests/browser/render-check.html`. The page
loads the full script order with main.js's auto-boot disabled through `CM.bootFailed`, stages a game with
`createGame` + `debugAddBody` and draws it. The default output is `docs/preview/render-check.png` at 390×844.

Queries:
- `?scene=<key>|proc`: background scene, or the procedural beach.
- `&state=play|danger|win|cancel|live`. `live` runs a real game with a bot, sending every event through `fx.consume`.
- `&numbers=1`, `&debug=1`, `&mode=standard|relaxed`.
- With `live`: `&secs=N`, and `&win=1`, which drops a T8 pair at 20 s and a T9 pair at 40 s.

Suggested package.json script: `"render-check": "node tests/browser/render-check.js"`.
