# Cocktail Merge: Beach Bar. Final Design Document

> Status: **final and canonical, revision 3**. This document is implementer-ready: every number is a decision, and nothing is left open. Revision 2 resolves all 67 review gaps; section 0.3 maps each gap to its resolution. Revision 3 folds in the owner's requirements A-G (the gift is for Reem; a green-and-yellow Sangria Verde as the winning jug; iOS first; static S3 hosting; optional PNG art overrides; a colour contact sheet; many small source files); the "Revision 3" block at the end of 0.2 lists where each one landed.
> Base design: "feel" (the judges' winner). Grafts come from "visual" and "engineering" as the judges recommended. Section 0.2 lists every graft and every rejected idea.
> Numbers marked **(measured)** come from a throwaway Node prototype of the revision-1 rules (Standard mode, 120 seeds per row unless noted). Every win rate carries its 95% Wilson interval. Revision 2 changes a few rules (2.6 launched-glass exemption, 2.12 refused launches) and adds the Relaxed mode (2.13); those are re-measured by the **tuning gate** (8, step 2) with 400 seeds before the art pass, and the gate decides the final Relaxed numbers by a fixed ladder. Numbers marked *(estimate)* are not measured. Numbers marked *(art)* are purely aesthetic.

---

## 0. Summary and decision log

### 0.1 Summary

- **Genre.** This is a Suika / "watermelon game" physics merge on a beach-bar table.
  - "Gravity" is a gentle constant pull toward the **far** edge of the table.
  - The player aims left/right below a dashed line near their own edge, then releases. The glass slides away up the table, bumps the others softly, and merges with any glass of the same tier it touches.
  - There are 9 tiers, from a Tequila Shot to a **Sangria Verde** jug, green and yellow (Reem's favourite colour and the owner's). Making the jug wins.
  - A glass that lingers across the dashed line loses the game after a grace timer (2.5 s Standard, 4.0 s Relaxed).
- **Session.** A win takes about 150 launches, or about 7 minutes at a human pace. A run in progress survives reloads and killed tabs (5.9).
- **Difficulty.** The game ships with **Relaxed** as the default mode (2.13), because for a gift, never reaching the jug is the main failure risk. Relaxed must reach a measured win rate of ≥ 70% for the smart bot and ≥ 40% for the sloppy bot (8, step 2). Standard mode is the revision-1 rule set: **(measured)** the smart bot wins 57.5% [49-66%] at human pace and random aiming wins 11% [7-18%].
- **Feel pillars.**
  1. Every new glass-glass contact clinks, scaled by impact speed.
  2. Every merge pops: squash, ring, particles and a steel-pan note.
  3. Real chain reactions (counted by merge lineage) climb a pentatonic scale, with growing labels, shake, and hit-stop on big tiers.
  4. Nothing jitters: a 240 Hz position-based solver lets piles come to rest.
  5. What you see is what counts: every glass stands on a footprint whose near edge is exactly the edge the danger rule tests (3.2, 4.6).
- **Gift touches.**
  - The gift is for **Reem**. The dedication (shipped as the 2-line placeholder "For Reem, with love." / "Cheers to sunny days together!", which the owner edits) hangs on a swinging green card tag with a yellow ribbon on the title screen. It lives in its own one-purpose file, `src/dedication.js`, and a typo there can never break the game (5.2).
  - A discovery collection persists across runs.
  - The title screen shows a "Sangrias mixed: N" counter.
  - Attract mode plays behind the title screen.
- **Tech.**
  - Vanilla HTML/CSS/JS and Canvas 2D, with zero build and zero install. The game works from `file://` and from a static S3 bucket (5.12); nothing requires a server.
  - Plain `<script src>` files share the global namespace `CM`. The code is many small files, one feature each, every file under about 400 lines (5.1).
  - The pure deterministic core is unit-tested with `node tests/run.js`.
  - **Primary platform: iOS Safari and iOS Chrome (the same WebKit engine) on a modern iPhone.** Secondary: Android Firefox, then desktop browsers. The iOS rules are normative (3.10).
  - Minimum browsers: iOS/iPadOS 15 (Safari, and Chrome or Firefox on iOS, which use WebKit), Safari 15 (macOS), Chrome/Android WebView 80, Firefox 78 (Firefox for Android 79), Edge 80. Revision 3 raised the floor from Safari 13 to 15 (3.10). CSS that the Chrome/Edge/WebView 80 floor lacks (`inset`, flexbox `gap`) is not used (3.10).

### 0.2 Decision log (grafts and rejections)

| Source | Idea | Decision |
|---|---|---|
| feel | 240 Hz PBD solver, velocity from positions, restitution only above 18 u/s, Coulomb table friction | **Kept**, plus a per-contact `MAX_CORR` cap, a final wall clamp and a post-derivation VMAX clamp (from engineering) |
| feel | Lineage-based chain depth, pentatonic chime climb, labels, hit-stop on tiers 7/8, win slow-mo + zoom, gold merge-hint aim guide, attract mode, DOM HUD/overlays, danger 2× decay, launch buffer | **Kept** |
| feel | Weak tilt (S_FAR 0.82, kY = 0.88 kX) | **Replaced** by a pinhole projection: far/near width 0.72; vertical compression C_NEAR solved per screen in [0.85, 0.98] (3.2) |
| feel | 60/40 opening for launches 1-3 | **Replaced** by visual's 1 + 1 opening plus progressive unlock (measured: no significant balance change) |
| feel | Float-second timers | **Replaced** by integer ticks (visual) |
| visual | Hanging paper dedication tag, persistent discovery bitmask (silhouette / dimmed / colour), "Sangrias mixed: N", impact wobble, string lights, baked glow on tiers 8/9, cream strip and NEXT box with green border, equal-height strip icons, seed-42 golden RNG test, new-contact impact filter | **Grafted** |
| visual | Per-glass countdown ring | **Grafted in revision 1, replaced in revision 2** by a single fuse on the dashed line, because the timer is shared by the whole table (2.8, 3.8) |
| visual | Hidden random launch jitter | **Rejected**: it breaks the exact aim guide. PBD plus the friction model already prevents unstable columns |
| visual | Double-press R | **Adopted in revision 2** as the "armed" confirmation for Restart and New Game (3.5) |
| visual | Per-body danger counter that resets instantly; canvas-drawn HUD; auto-pause on window blur; time-window chain counter; impulse solver | **Rejected** |
| engineering | Newest-id-first merge order, 250 ms input guard after overlays, jug aura, normative `tick()` order returning events, full signatures, `MAX_CORR`, pure `normalizeSave`, purity test (fixed), area-invariant test, thatch drawn over glasses, `visualViewport` handling, explicit win-over-lose precedence, aim re-clamp on tier change, coincident-centre normal | **Grafted** |
| engineering | Freezing the sim on win, dark coin pill, no table friction, time-window combo | **Rejected** |

**Revision 3: owner requirements** (decisions, not suggestions; no gameplay rule or gameplay number changed)

| Req | Decision | Where it landed |
|---|---|---|
| A | The gift is for **Reem**. `src/dedication.js` ships the 2-line placeholder "For Reem, with love." / "Cheers to sunny days together!", which the owner edits. The "edit only this file" safety design (`String.raw`, separate classic script, config fallback, boot guard, vm test 47) is unchanged | 0.1, 5.2, 6.3 |
| B | Tier 9 becomes **Sangria Verde**, a big jug of white/green sangria: key deep jade `#0F8A5F` (HSL lightness 0.30, vs 0.54 for T5 Mojito `#4CC97A` and 0.62 for T4 lime `#C6E05A`) plus a second key colour, accent sunny yellow `#FFD23F`. Green liquid `#B5EE8A → #3DBE6E → #0F8A5F`, lemon wheels and lime wheels, green apple and grapes, a yellow satin ribbon at the neck, a yellow handle highlight, a yellow-gold baked glow `rgba(255,210,63,0.65)` and aura. New palette tokens verde / verde-gold / tag-green. Icon mode thickens the ribbon so the yellow reads in the strip. Win celebration in green and yellow (pale-yellow flash, alternating rays, jade-then-yellow rings, confetti 30/20/30/10/10% jade, light green, yellow, lemon, white; Fiesta likewise). Win card: jade border, yellow title ribbon, "Sangria Verde!". Title tag: jade card `#17734C` with cream text (5.5:1) on a yellow ribbon with a bow and a yellow heart. The neighbour argument holds: T8 purple 267° → T9 jade 159° (108° apart). No wine or burgundy colour remains | 0.1, 2.5, 3.4, 3.5, 3.8, 4.1, 4.2, 4.3, 5.3, 5.7, 6.2 (test 47), 6.3, 7 |
| C | **iOS first.** Primary platform iOS Safari and iOS Chrome (WebKit) on a modern iPhone; secondary Android Firefox, then desktop. New normative 3.10: synchronous audio unlock with the silent-buffer trick and `'interrupted'` / bfcache resume; JS px viewport from `visualViewport` (never `100vh`) with a late re-measure after rotation; safe areas; `touch-action: none`, WebKit gesture events, a non-passive `touchmove` guard, no callout or selection; Pointer Events with a touch + mouse fallback; DPR cap 2; the adaptive fallback measures work time (12 ms) instead of the frame interval, so Low Power Mode does not trigger it. Feature floor **Safari 15** (raised from 13); `OffscreenCanvas`, `requestIdleCallback`, `:has()`, `ctx.filter` and similar are never used. The 6.3 checklist runs on an iPhone first | 0.1, 3.1, 3.6, 3.9, 3.10, 6.2, 6.3, 7, 8 |
| D | **Static S3 hosting**, no server: new 5.12 Deploy note (upload `index.html` + `src/` [+ `assets/`]; `tests/`, `docs/`, `node_modules/`, `examples/` stay out; HTTPS through CloudFront; `Cache-Control: no-cache`; `file://` keeps working; saves are per origin); relative paths only | 0.1, 5.1, 5.12, 6.3, 7, 8 |
| E | **Optional PNG override**: `assets/tier-1.png` … `tier-9.png` load with `new Image()` (not fetch; works from `file://`), procedural fallback on error, BOOT waits at most 1500 ms, drawn 2.0 R wide with the bottom-centre at anchor +0.40, so the glass stands on the same footprint; no pixel read-back. The Forbidden list allows image loading for this one purpose | 4.3, 5.1, 5.2, 5.5, 5.7, 6.2, 6.3, 7 |
| F | **Colour contact sheet** `tests/browser/contact-sheet.js` (playwright-core + system Chrome, `npm run preview`) writes `docs/preview/cocktails.png`: the 9 cocktails at R = 96 px in colour, the coin, the NEXT box, the strip and a slice of the table. The greyscale 28-px sheet is kept as `docs/preview/cocktails-small.png` because it checks readability, a different purpose. The owner approves the colour sheet before the juice pass | 5.1, 6.2, 6.3, 7, 8 |
| G | **Many small files**, each under about 400 lines (enforced at 450 by test 55): `src/game/` (8 pure parts assembled into `CM.game`), `src/art/` (glass, garnish, one painter per tier, coin, scenery, overrides, sprites), `src/render/` (frame, fx), `src/audio/` (engine, sounds), `src/ui/` (hud, overlays, input, storage), `src/app/` (loop, dispatch, attract, states), `src/style/` (3 sheets). Public APIs unchanged. New deliverables `docs/ARCHITECTURE.md`, `docs/HOW-TO-CHANGE.md` and `docs/DEPLOY.md`, written after implementation from the real code | 5.1, 5.2, 5.5, 5.7, 5.9, 5.10, 5.11, 6.2 (test 55), 8 |

### 0.3 Revision 2: gap resolutions

| Gap(s) | Resolution | Where |
|---|---|---|
| 1 | Opening draws `goto` step 6: they are pushed to `spawnHistory` and counted. Rule B needs history ≥ 3, rule C history ≥ 7. Test 26 | 2.7 |
| 2, 41 | HUD rects computed in pure `computeLayout`: coin fully on screen, pill ≤ 40% S, Pause/Mute right-aligned against NEXT, NEW BEST replaces the BEST line under the pill, number font fits its box. Tests 49 + browser smoke | 3.4 |
| 3, 39 | One anchor: the sprite's base-ellipse centre = the exact footprint centre. Everything on the table plane uses the exact projected footprint, whose lowest pixel is `Y(y + r)`, the edge the danger rule tests. Widest body part ≈ 0.95 R. Debug overlay. Test 53 | 3.2, 4.2, 4.6, 5.10 |
| 4, 56 | Immunity applies only to merge-born bodies; launched glasses merge from age 0. Test 15 | 2.6 |
| 5, 55 | A launch whose circle overlaps a body is refused (`launchBlocked`); `firstHit` reports `blocked`. Test 38 | 2.12, 5.6 |
| 6 | Intent latch: aim = value + dirty flag, launch = one-shot latch consumed by the first step; result routed to the UI; cleared on exit from PLAY | 3.6, 5.8 |
| 7 | Last input wins: pointer aim is applied only when the pointer moved; keys nudge relative to the current aim | 3.6 |
| 8 | `dispatch(events, source)`; attract events reach only `render.fx` | 5.7 |
| 9, 45 | Scale extended to 15 notes, every index clamped, pure `chimeFreqs` tested; audio handlers wrapped in try/catch. Test 24 | 3.9 |
| 10, 44 | Unlock on pointerdown, pointerup, touchend, click, keydown (capture, passive); silent buffer; resume on visibility | 3.9 |
| 11, 43 | Blur on entering PLAY, HUD buttons `tabindex=-1` and blurred after clicks, hidden overlays `inert`, game keys `preventDefault` on keydown and keyup, `:focus-visible` | 3.5, 3.6 |
| 12, 64 | Danger tests use `{PULL: 0}`; `debugAddBody` gains `launched`; the T8 pair is placed after tick 599. Tests 23, 31-36 | 6.2 |
| 13 | Final uncapped wall clamp after the iterations | 2.4 |
| 14, 53 | Dedication moves to `src/dedication.js` as a `String.raw` template; config falls back to a default; index.html shows a visible boot error. Tests 47 | 5.2 |
| 15, 64 | Test 37 split into scenarios; "request at tick T" defined | 6.2 |
| 16 | Immunity tested via exported `isMergeEligible` plus a neighbour placed after tick t+23 | 6.2 test 14 |
| 17 | Growth sets `r = rTarget` exactly on the last tick; braces in pseudo-code | 2.4 |
| 18 | Weight arrays always have 5 entries `w[0..4]`, `w[0] = 0`. Test 28 | 2.7 |
| 19 | `dangerTickEmitted` prevents re-emission. Test 34 | 2.8 |
| 20 | No per-glass rings: one fuse on the dashed line shows the shared timer | 2.8, 3.8 |
| 21, 65 | `bestAtRunStart`; `bestTier` on every discover; wins saved synchronously on the `win` event; saves merge with stored values. Test 46 | 2.11, 5.9 |
| 22 | Discovery = appeared in the launcher or created by a merge; tier 1 is discovered at run start; NEXT never discovers. Test 40 | 2.2 |
| 23 | Jug burst requires `tick ≥ dangerSuspendUntil` | 2.10 |
| 24, 58 | Every exit from PLAY clears `launchPending`, the latch and the tracked pointer; Esc in WIN_MENU = Keep Playing. Test 37d | 5.7 |
| 25 | Pointer mapping inverts the current zoom; background overdraw margin for shake. Test 54 | 3.6, 5.10 |
| 26, 60 | Pointer downs above `farY` do nothing; dragging above `farY` enters a visible cancel state; the how-to text mentions cancel | 3.6, 3.7 |
| 27 | Continuous stage rule `S = min(vw, round(0.62·vh))`; coarse-pointer landscape below 500 px height shows a blocking "turn upright" overlay | 3.1 |
| 28, 63 | Strip height derived from slot width; each icon fits its slot box (equal height where it fits, width-capped otherwise) | 3.4 |
| 29 | Ids < 2²⁰ asserted; `a.wallSeen[k]` | 2.4 |
| 30 | `copyPrev` dropped; render interpolates `px,py → x,y` | 5.8 |
| 31 | Per-body FX state in a `Map` deleted on merge; ghosts start from the parent's current pop and squash | 3.8 |
| 32 | Gold hint checks the target's immunity; the guide is a static snapshot | 5.10 |
| 33 | `typeof globalThis !== 'undefined' ? globalThis : this`; minimum browsers stated | 5.2, 0.1 |
| 34 | A voice = one recipe invocation; cap 12; chimes and stings bypass the drop rule | 3.9 |
| 35 | `hash` covers all simulation state | 5.5 |
| 36, 48 | Relaxed mode (default) with a measured acceptance gate, a sloppy bot, 400 seeds and a fixed ladder; one human playtest before shipping | 2.13, 8 |
| 37 | Contact pool 2048 entries; grows only if full and counts it; soak asserts 0 growths | 2.4 |
| 38 | HUD and strip hidden in TITLE and PAUSE | 3.5 |
| 40 | The dashed line is redrawn through the (transparent) launcher glass; test that the launcher footprint stays behind the line | 4.4, 5.10, test 53 |
| 42 | Full-viewport input layer above the strip; strip `pointer-events: none`; aim zone = everything at or below the table's far edge, hinted below the dashed line; chevron marker | 3.6 |
| 46 | rAF scheduled first; each consumer in try/catch; sim errors show an "Oops" overlay | 5.8 |
| 47 | Run snapshot saved on hide, pause, win and every 10 s; `restoreGame`; title "Continue". Test 42 | 5.9 |
| 49 | Wilson CIs everywhere, 25% row removed, phone CPU marked as an estimate, 400-seed gate | 9 |
| 50 | C_NEAR grows with spare height up to 0.98 until the far edge reaches 27% H; S_FAR 0.72 kept and justified | 3.2 |
| 51 | Text floor 13 px, body 15 px, BEST 14 px, tier digits 13 px on a ≥ 18 px disc, how-to on a cream card | 3.4, 3.5, 4.3 |
| 52 | Title is a flex column; how-to collapses into a button below 700 px height | 3.5 |
| 54 | Pointer releases buffer through the whole cooldown; launcher cooldown ring; "not ready" shown at the launcher | 2.12, 3.8 |
| 57 | THREAT_DIST 5 u held 0.5 s; static level-0 line; steady orange level 1; pulsing only at level 2 | 2.8, 3.8 |
| 59 | New body renders from the smoothed launcher x, blended out over 60 ms | 3.8 |
| 61 | Clink f0 2600 Hz with a 7 kHz lowpass, ≤ 12 clinks/s, growing-body impacts silent, one coin ding per merge, separate Ambience toggle | 3.9 |
| 62 | T4 becomes a wide coupe; T8 drink and key colour purple; T2 darker. Greyscale contact-sheet QA | 2.5, 4.3 |
| 66 | Restart and New Game (over a saved run) are armed confirmations; Quit keeps the run | 3.5 |
| 67 | `touch-action: manipulation`, `-webkit-user-select`, `-webkit-touch-callout`, `:focus-visible` | 3.6 |

---

### 0.4 Revision 4: build round and owner playtest (2026-10-03)

The code is the reference for these; the per-subsystem notes written during the build live in
`docs/amendments/` (physics-feel, art-fixes, backgrounds, render, audio, ui, app, integrator) and are kept as
design notes. `docs/ARCHITECTURE.md`, `docs/HOW-TO-CHANGE.md` and `docs/DEPLOY.md` describe the real files.

| Change | Where it landed |
|---|---|
| Gentle merges: birth radius = largest non-overlapping, growth relaxed by positions only (never velocity), shove clamped | `physics.js`, `game/merge.js`, amendments/physics-feel.md |
| Radii ×0.8 (T9 = 35 % of the table width); Relaxed `RADIUS_SCALE` 1.00 | `config.js` TIERS, MODES |
| Tier order: **4 = Mojito, 5 = Margarita** (owner); Mojito painted at ×0.86, Margarita at ×1.08, sprite bounds follow | `config.js`, `art/tier4-mojito.js`, `art/tier5-margarita.js`, `art/glass.js` TOPA |
| Progressive spawns: tier-5 glass enters from highestTier 6, heavier stages to 8; Standard reaches stages one tier earlier (`STAGE_SHIFT` 1) | `config.js` SPAWN.STAGES, `game/spawn.js` |
| Standard mode: `DANGER_Y` 120, `GRACE_TICKS` 480; Relaxed 133 / 960 | `config.js` MODES |
| Image background scenes (5 approved, random per game, parallax beach bar); procedural beach as fallback | `art/backgrounds.js`, `assets/backgrounds/` |
| Glass merge sound (struck wine glass partials), clinks, generative bar music with its own toggle; `MERGE_GAIN` 0.55, `MUSIC` 0.11; ambience default off; phone-lite mix (`LITE_*`), music look-ahead 1.5 s, `latencyHint: 'playback'` on touch devices | `audio/*`, `config.js` AUDIO, `game/save.js` |
| Title: dedication tag with a white heart, blurred + darkened backdrop, credit line moved into Settings | `index.html`, `style/overlays.css` |
| Collection as contact-sheet cards (coloured number badge), two columns on phones | `ui/overlays.js`, `style/overlays.css` |
| Performance mode (pins DPR 1.25, fewer particles) + adaptive fallback on real frame intervals; debug report export (Settings) | `app/loop.js`, `app/perf.js`, `main.js`, `ui/overlays.js` |
| Save gains `music`, `lowGfx`; `ambience` defaults to false | `game/save.js`, `ui/storage.js` |
| **Bomb** (owner feature): a jug burst (two Sangria Verde touching) earns a charge (max `BOMB_MAX` 3); the HUD button under NEXT arms it; a tap on the table clears every glass whose centre lies within `BOMB_RADIUS` 16.5 u (blast diameter = a third of the table width) for `BOMB_POINTS_PER_TIER` 5 per tier; charges are snapshotted and hashed; Esc or the button disarms; key B arms | `game/bomb.js`, `game/merge.js`, `game/game.js`, `game/state.js`, `ui/hud.js`, `ui/input.js`, `render/guides.js`, `render/fx.js`, `audio/sounds.js`, `app/loop.js`, `main.js`, `tests/bomb.test.js` |
| Three owner-drawn cartoon scenes join the rotation (eight in total): sunflower field at sunset, Müngstener Brücke, Schwebebahn over Wuppertal (`assets/backgrounds/*.jpg`, converted from PNG) | `config.js` BACKGROUNDS, `art/backgrounds.js`, `assets/backgrounds/CREDITS.md` |
| Phone audio: music with about half the oscillators on touch devices, wave ambience nodes exist only while enabled; quality fallback needs two slow windows below 45 fps and steps 2 → 1.25 → 1 (a resize blinks); canvases transparent on resize over a sand page background | `audio/music.js`, `audio/engine.js`, `app/loop.js`, `render/frame.js`, `style/base.css` |
| Two-canvas renderer: static scene on `#game-bg` (redrawn on change only), per-frame layer on `#game`; parallax frozen on phones; title blur desktop-only; adaptive DPR floor 1.0 | `render/frame.js`, `index.html`, `style/base.css`, `style/overlays.css`, `app/loop.js` |

Measured with the gate (200 seeds): Standard smart bot 93 %, random 19 %; Relaxed smart 96 %, random 25 %.
The aiming bots always target a matching glass, so they overstate human win rates; the owner's own
playtest decides the final numbers.

## 1. Reference screenshots (forensic summary)

### 1.1 `examples/images.jpeg` (335×597, "Tasty Travels" ad; main reference)

| Region (% height) | Content |
|---|---|
| 0-12% | **Thatched palapa roof** across the full width. Golden-olive straw with a ragged hem, and wooden beams showing through. |
| 1-6%, left | **Coin counter.** A gold coin with a darker rim overlaps the left end of a **cream pill**. "8800" is set in a heavy **dark-brown** rounded font. |
| 1-12%, right | **NEXT box.** A cream rounded square holding a small red drink, with "NEXT" in white heavy caps with a dark outline below it. |
| 10-28% | Pale sky, turquoise sea with a white foam line, sand, and palms at both edges. Wooden benches poke in at the sides from 35% to 80%. |
| 13-28%, centre | "To-Go Order" paper card hanging from a cord on a clothespin. **The mechanic is ignored**, but the hanging-tag motif is reused for the dedication. |
| 27-84% | **Table.** A light honey-wood frame around a **glass top over sand**, with shells and a starfish visible under the glass and a glossy diagonal sheen. Perspective: the far edge spans about 58% of the image width and the near edge about 95%. The table is about 1.07 times as tall as it is wide. |
| 27-60% | **Pile** of about 40 drinks packed at the far half, drawn in a ¾ view (rim ellipses about 0.3) with painter's order: nearer glasses are bigger and drawn in front. Tall far glasses rise above the table edge over the sea. White specular streaks sit on the left of each glass, and garnishes overflow the rims. |
| centre | A thin white vertical aim line from the launcher up the table. |
| ~69% | White **dashed line** across the table. |
| ~73% | **Launcher glass**: a small pink stemmed drink with an orange wheel. |
| 87-94% | **Tier strip**: a cream pill shaped like a right-pointing arrow with a **green outline**, holding equal-height drink icons from small to large. |
| bottom | Sand with starfish. Logo and ad button (dropped). |

### 1.2 `examples/unnamed.webp` (166×296)

- **Layout.** Same composition, but the table is a plank table with **stronger perspective**: the far end is about 55-70% of the near width.
- **HUD.**
  - Round NEXT medallion at the top left.
  - Coin pill on a wooden plaque at the top centre.
  - ADS badge at the top right (dropped).
- **Roof.** Thatch roof with **string lights**.
- **Table.** The dashed line sits about 80% of the way down the table, with the launcher cup below it.
- **Tier strip.** Discovered tiers in colour; **undiscovered tiers as black silhouettes**; a right-pointing arrow.

### 1.3 Keep / adapt / drop

| Keep | Adapt | Drop |
|---|---|---|
| Thatch roof (drawn over the glasses), string lights, sea, palms, side benches, sand foreground; glass-top-over-sand table with wood frame; pinhole perspective with a far edge 72% of the near width; a tall receding table (1.07 tall per unit width on phones, matching screenshot 1); ¾-view cartoon glasses with painter's order; coin counter top-left (gold coin, cream pill, dark-brown number); NEXT box top-right (cream, green border, "NEXT" label); cream arrow-shaped tier strip with green outline and equal-height icons; silhouettes for undiscovered tiers | The vertical aim line becomes a dotted perspective aim guide that stops at the first glass it would hit and turns gold on a guaranteed same-tier merge. The order-card motif becomes the dedication tag. Score = coins. Pause and mute buttons sit right-aligned beside the NEXT box | Order card mechanics, ads, logo, green ad square, lane-shooter mechanics, gear button |

**Far/near ratio.** The screenshots measure 0.55-0.70. We keep **S_FAR = 0.72**, at the top of that range, because it keeps a T1 at the far edge ≥ 27 px wide on a 360-px phone (0.65 would give 24 px, below the 26-px readability floor of the contact-sheet check in 6.3).

---

## 2. Core loop and exact rules

### 2.1 Simulation space and time

All gameplay uses **table units (u)**, which are independent of the screen.

| Constant | Value | Note |
|---|---|---|
| `W` | **100 u** | x ∈ [0, 100], left to right |
| `L` | **160 u** | y = 0 is the **far** edge (the pull points toward it); y = 160 is the **near** edge (player side) |
| `DANGER_Y` | **130 u** Standard, **133 u** Relaxed | The dashed line |
| `LAUNCH_Y` | **144 u** | Launcher centre. A Standard T4 (r 10.6) spans 133.4-154.6, entirely between the line and the near wall |
| Walls | x = 0, x = 100, y = 0, y = 160 | All four are hard walls |
| `DT` | **1/240 s** | Fixed step. **Every gameplay timer is an integer tick count** (table 2.1b) |

**2.1b Tick constants** (seconds × 240, rounded):

| Name | Ticks | Seconds |
|---|---|---|
| `COOLDOWN_TICKS` | 96 | 0.40 |
| `BUFFER_TICKS` | 36 | 0.15 (keyboard only; pointer releases buffer through the whole cooldown, 2.12) |
| `MERGE_IMMUNE_TICKS` | 24 | 0.10 (merge-born bodies only) |
| `GROW_TICKS` | 29 | 0.121 |
| `CHAIN_WINDOW_TICKS` | 240 | 1.0 |
| `ELIGIBLE_AGE_TICKS` | 288 | 1.2 |
| `GRACE_TICKS` | 600 Standard, 960 Relaxed | 2.5 / 4.0 |
| `DANGER_TICK_EVERY` | 120 | 0.5 |
| `THREAT_HOLD_TICKS` | 120 | 0.5 |
| `WIN_SUSPEND_TICKS` | 720 | 3.0 |
| `IMPACT_NEW_TICKS` | 12 | 0.05 |

### 2.2 Loop

1. **Start of a run.** The launcher holds the **current** glass (tier 1-4) at (aimX, 144). The NEXT box shows the **next** glass. Opening: current = 1, next = 1. `createGame` sets `runMask = 0b1` (tier 1 is in the launcher, so it is discovered) and `highestTier = 1`; the app ORs `runMask` into `save.discovered` in `newGame`.
2. **Aim.** The player moves left/right. `aimX` is clamped to `[R[current], 100 − R[current]]` and **re-clamped every time `current` changes**. The aim guide shows the exact straight path.
3. **Launch.** On release the glass becomes a body at (aimX, 144) with velocity (0, −150 u/s), unless that spawn circle overlaps a body, in which case the launch is refused (2.12).
4. **Hand-off.** In the same tick, `current ← next` and `next ← drawSpawn()`. If the new `current` tier is not in `runMask`, it is discovered now (set the bit, emit `discover`). **NEXT never discovers.** The NEXT sprite flies into the launcher during the **96-tick cooldown**, and launching is possible again when the cooldown ends.
5. **Repeat.** Glasses slide, bump, settle and merge, until a loss (or a win, followed by continue or restart).

**Discovery** therefore means "appeared in the launcher or was created by a merge". `highestTier` is separate: the highest tier launched or merged this run (it drives the spawn unlock, 2.7).

### 2.3 Forces and integration (per step, per body, ascending id)

| Parameter | Value | Why |
|---|---|---|
| `PULL` | **120 u/s²**, `vy −= PULL·DT` | Gentle gravity toward the far edge |
| `DRAG` | **0.8 /s**, `v *= exp(−0.8·DT)` (×0.996672) | Mild damping |
| `FRICTION` | **20 u/s²** Coulomb: `speed ← max(0, speed − 20·DT)` along v̂ | Mild table friction that kills creep, so piles settle |
| `VMAX` | **260 u/s** | 1.083 u per step, which is less than r₁ = 6, so there is no tunnelling (unit-tested) |
| `V0` | **150 u/s**, straight (0, −1) | **(measured)** On an empty table the glass reaches y ≤ 20 in 0.87 s and hits the far wall at 136 u/s |
| Mass | `m = (r/6)²`, recomputed from the current r | Standard T1 = 1.00 … T9 = 13.44 |

### 2.4 Collision solver (normative; `physics.stepWorld`)

```
stepWorld(world, bodies, tick, events) {
  n = bodies.length
  // 1. integrate (ascending id)
  for (b of bodies) {
    b.age += 1
    if (b.growTick < GROW_TICKS) {
      b.growTick += 1
      if (b.growTick === GROW_TICKS) {
        b.r = b.rTarget                                   // exact, no float residue
      } else {
        b.r = b.r0 + (b.rTarget - b.r0) * easeOutCubic(b.growTick / GROW_TICKS)
      }
      b.invM = 1 / massOf(b.r)
    }
    b.vy -= PULL*DT ; b.vx *= DRAG_F ; b.vy *= DRAG_F
    sp = |v| ; if (sp > 0) { ns = max(0, sp - FRICTION*DT) ; v *= ns/sp }
    if (|v| > VMAX) { v *= VMAX/|v| }
    b.px = b.x ; b.py = b.y                               // end-of-previous-tick position
    b.x += b.vx*DT ; b.y += b.vy*DT
  }

  // 2. position solve, ITER = 10
  world.nContacts = 0                                     // pooled records, no allocation
  for (it = 0; it < 10; it++) {
    for (i = 0; i < n; i++) { a = bodies[i]
      for (k of [left, right, far, near]) {
        if (a penetrates wall k) {
          move a out fully (hard, uncapped)
          if (it === 0) record {a, b: null, wall: k, n: outward normal, vnPre = v_a·n_out}
        }
      }
      for (j = i+1; j < n; j++) { b = bodies[j]
        d = |b - a| ; if (d >= a.r + b.r) continue
        nrm = d > 1e-9 ? (b - a)/d : (1, 0)                // coincident-centre guard
        pen = a.r + b.r - d
        if (it === 0) record {a, b, n: nrm, vnPre = (vb - va)·nrm}
        corr = min(pen, MAX_CORR)                         // 0.5 u per contact per iteration
        wa = a.invM/(a.invM + b.invM) ; wb = b.invM/(a.invM + b.invM)
        a.pos -= nrm*corr*wa ; b.pos += nrm*corr*wb
      }
    }
  }
  // 2b. final wall clamp (uncapped), every body, before velocity derivation
  for (b of bodies) { b.x = clamp(b.x, b.r, 100 - b.r) ; b.y = clamp(b.y, b.r, 160 - b.r) }

  // 3. velocity from positions
  for (b of bodies) { v = (pos - (px, py))/DT ; if (|v| > VMAX) { v *= VMAX/|v| } }

  // 4. restitution, tangential damping, impact events (record order)
  for (c of contacts[0 .. nContacts-1]) {
    if (c.wall) { vn = -(v_a·n_out) ; vApp = c.vnPre ; E = E_WALL ; invSum = a.invM }
    else        { vn = (vb - va)·n ; vApp = -c.vnPre ; E = E_GLASS ; invSum = a.invM + b.invM }
    target = (vApp > REST_V) ? E*vApp : 0
    if (vn < target) { j = (target - vn)/invSum ; apply impulse j along the separating normal }
    if (!c.wall) { t = (-n.y, n.x) ; vt = (vb - va)·t ; jt = -vt*TAN_DAMP/invSum ; apply ±jt·t }
    last = c.wall ? a.wallSeen[k] : (world.seen.get(pairKey(a.id, b.id)) ?? -1e9)
    isNew = !(last >= tick - IMPACT_NEW_TICKS)
    if (isNew && vApp > IMPACT_V) {
      emit impact {a, b|null, wall, x, y (contact point), vn: vApp, tierA, tierB,
                   growing: a.growTick < GROW_TICKS || (b && b.growTick < GROW_TICKS)}
    }
    if (c.wall) a.wallSeen[k] = tick ; else world.seen.set(pairKey(a.id, b.id), tick)
  }
  if (tick % 240 === 0) { delete world.seen entries older than tick - IMPACT_NEW_TICKS }
}
```

- **Ids and keys.** Ids are integers < 2²⁰ (1,048,576); `makeBody` throws if not (a run uses a few hundred; endless play would need about 58 hours of non-stop merging). `pairKey(i, j) = min(i, j)·1048576 + max(i, j)`, so keys are exact and below 2⁴⁰. `world.seen` is a `Map`. `a.wallSeen` is a 4-entry array indexed by wall `k` (0 left, 1 right, 2 far, 3 near), initialised to −1e9.
- **Contact pool.** `world.pool` holds **2048** pre-allocated contact records, enough for every pair plus every wall of 60 bodies (60·59/2 + 4·60 = 2010). If it is ever full, one record is appended and `world.poolGrowths++`. The soak test asserts `poolGrowths === 0`.
- **Bounds by construction.** Step 2b guarantees `r ≤ x ≤ 100 − r` and `r ≤ y ≤ 160 − r` after every tick, so test 9 holds exactly.

| Parameter | Value | Note |
|---|---|---|
| `ITER` | **10** | **(measured)** 0.004% of resting contacts overlap more than 0.5 u |
| `MAX_CORR` | **0.5 u** per contact per iteration | Caps the velocity injected by merge growth (feel decision; its balance effect is below the measurement noise and is not a decision input) |
| `E_GLASS` / `E_WALL` | **0.22 / 0.30** | Soft bounce. **(measured)** The far wall returns 41 u/s from a 136 u/s hit |
| `REST_V` | **18 u/s** | Below this, contacts are perfectly inelastic, so piles do not micro-bounce |
| `TAN_DAMP` | **0.10** | Glasses roll off each other and the pile spreads |
| `IMPACT_V` | **18 u/s** | Plus the new-contact filter (12 ticks), so a resting pile never clinks |
| Cost | **(measured)** 6-7 ms CPU per simulated second in Node, about 0.1 ms per 60 Hz frame on desktop | About 0.6 ms per frame on a mid-range phone *(estimate)*; `?debug=1` shows the measured sim ms per frame. O(n²) suits n ≤ 45 (measured max 31) |

### 2.5 Tier table

| Tier | Key | Name | R (u) Standard | R (u) Relaxed (×0.91 for t ≥ 2) | Mass (Std) | Ø at launch row, 390-px phone (Std) | Key colour | `BASE` points when created |
|---|---|---|---|---|---|---|---|---|
| 1 | `shot` | Tequila Shot | **6.0** | 6.0 | 1.00 | 39 px | `#F5C542` | 0 (launch only) |
| 2 | `oldfashioned` | Old Fashioned | **7.4** | 6.73 | 1.52 | 48 px | `#B3561C` | **10** |
| 3 | `cosmo` | Cosmopolitan | **9.0** | 8.19 | 2.25 | 59 px | `#FF5C8A` | **30** |
| 4 | `mojito` | Mojito | **10.6** | 9.65 | 3.12 | 69 px | `#4CC97A` | **60** |
| 5 | `margarita` | Margarita | **12.4** | 11.28 | 4.27 | 81 px | `#C6E05A` | **100** |
| 6 | `sunrise` | Tequila Sunrise | **14.4** | 13.10 | 5.76 | 94 px | `#FF4F2E` | **150** |
| 7 | `pinacolada` | Piña Colada | **16.6** | 15.11 | 7.65 | 109 px | `#2EB5A8` | **210** |
| 8 | `coconut` | Coconut Cocktail | **19.0** | 17.29 | 10.03 | 125 px | `#9B5DE5` | **280** |
| 9 | `sangria` | Sangria Verde | **22.0** | 20.02 | 13.44 | 144 px | `#0F8A5F` jade, accent `#FFD23F` yellow | **360** (plus the win bonus) |

The Relaxed column is for the rung chosen by the tuning gate (8, step 2; Appendix 9), `RADIUS_SCALE = 0.91`: the starting rung 0.94 left the smart bot at 68.0%, below the 70% target, so the ladder stepped down once. The column is `R_std[t]·RADIUS_SCALE` for t ≥ 2 (T1 always stays 6.0); if the rung moves again (8, step 8), it is recomputed.

How the radii are justified:

- **Ratios.** Consecutive Standard radii grow by 1.14-1.23 (T7→T8 is the smallest step, 1.145). Relaxed keeps the same ratios for t ≥ 2; only T1→T2 shrinks (1.12 at 0.91).
- **Every merge frees space.** `2·R[t]² > R[t+1]²` for all t, in both modes (unit-tested).
- **T1 is readable.** It is ≥ 36 px wide at the launch row on a 360-px phone and 27 px at the far edge.
- **T9 fits.** It is 44% of the table width (40% Relaxed), so after a win it dominates a corner but leaves room to play on.
- **Balance.** These are the feel prototype's tuned radii, and they were re-measured with the revision-1 rules (Appendix 9).
- **Points.** `BASE[t] = 10·T(t−1)`, using triangular numbers. Points do not depend on the mode.
- **Colours.** Neighbouring tiers differ in hue: T1 yellow, T2 deep amber, T3 pink, T4 lime, T5 green, T6 red-orange, T7 teal, T8 purple, T9 deep jade with a sunny-yellow accent.
  - T8 → T9 is a strong hue step: purple (hue 267°) to jade (159°), 108° apart.
  - T9 is the only tier with two key colours (`color` jade `#0F8A5F`, `accent` yellow `#FFD23F`). Its jade is much darker than T5's mint green `#4CC97A` (HSL lightness 0.30 vs 0.54; greyscale luma 96 vs 155) and far from T4's lime `#C6E05A` (hue 72°, luma 201). Neither is its neighbour, and the jug silhouette, the yellow ribbon and the lemon wheels separate it further. T9's greyscale luma (96) stays well below T8's (127), so T8 and T9 also separate in greyscale.

### 2.6 Merge rule (normative; runs after `stepWorld` each tick)

`isMergeEligible(g, a, b)` (exported, pure):

```
a.tier === b.tier
&& (a.bornTick < 0 || a.age >= MERGE_IMMUNE_TICKS)      // launched bodies: eligible from age 0
&& (b.bornTick < 0 || b.age >= MERGE_IMMUNE_TICKS)      // merge-born bodies: immune for 24 ticks
&& (a.tier < 9 || (g.wonOnce && a.age >= 24 && b.age >= 24 && g.tick >= g.dangerSuspendUntil))
```

1. **Candidates.** All pairs i < j with `isMergeEligible(g, a, b)` and `dist ≤ rA + rB + TOUCH_EPS (0.5 u)`. Tier-9 pairs are only the jug burst (2.10).
2. **Order.** Sort the candidates by:
   - `tier` ascending,
   - **`max(idA, idB)` descending** (the newest glass merges first: "the glass I threw merges"),
   - `min(idA, idB)` ascending.
3. **Greedy disjoint matching.** Walk the sorted list and accept a pair only if neither body has been used this tick. For example, three mutually touching T1s with ids 1, 2 and 3 merge as **(1, 3)**, and T1 #2 is left over.
4. **For each accepted pair (tier < 9), in order:**
   - New body:
     - `tier + 1`, `id = nextId++`.
     - Position = midpoint, clamped to `[r0, 100 − r0] × [r0, 160 − r0]`, where `r0 = max(rA, rB)`. `px, py` = that position.
   - Velocity = mass-weighted average × **0.5**.
   - `r = r0`, `rTarget = R[tier+1]`, `growTick = 0`. The radius grows over 29 ticks with easeOutCubic, and the capped PBD solver pushes neighbours aside gently.
   - Lineage and danger fields:
     - `age = 0` (so it is merge-immune for 24 ticks, which gives chains a visible beat of at least 0.1 s per link),
     - `cleared = true`, `launched = false`, `bornTick = tick`,
     - `chainDepth = 1 + max(parentDepth(A), parentDepth(B))`, where `parentDepth(p) = (p.bornTick ≥ 0 && tick − p.bornTick < 240) ? p.chainDepth : 0`.
   - **Shove.** Every body not used and not created this tick, within `range = R[new] + r_o + 6`, gets `Δv = SHOVE_V·(1 − d/range)` (SHOVE_V = 40 u/s) along the direction away from the midpoint (coincident: (1, 0)).
   - **Bookkeeping, in this order:**
     - remove the parents;
     - `score += points = round(BASE[new] · mult(depth))`;
     - emit `merge`;
     - if the tier is not in `runMask`, set the bit and emit `discover`;
     - `highestTier = max(highestTier, new)`;
     - if `new == 9 && !wonOnce`, run the win (2.9).
5. **Tier-9 pair (jug burst).** Remove both jugs and create no body. The depth comes from lineage as above. `score += round(1000·mult(depth))`. Emit `jugBurst`.
6. **Id order is preserved automatically.** New ids are larger than all existing ids, so appending keeps `bodies` sorted by id.

**Why launched glasses are exempt.** A thrown glass covers about 15 u in 24 ticks. With immunity, a throw at a same-tier glass sitting close to the dashed line (the normal late-game case) would bounce off instead of merging, exactly when the board is tense. Spawning on top of a glass is impossible (2.12), so the exemption cannot cause instant merges at the launcher.

`mult(d) = min(4, 1 + 0.5·(d − 1))`: depth 1 ×1, 2 ×1.5, 3 ×2, 4 ×2.5, 5 ×3, 6 ×3.5, 7+ ×4.

**(measured, revision-1 rules)** Merge depth distribution with the smart bot: depth 1 75%, 2 20%, 3 4.2%, 4 1.0%, 5+ 0.4%. A depth-3+ chain happens about once every 18 merges, about 7 times per winning run: special, but regular.

### 2.7 Spawn (tiers 1-4, tier 5 via STAGES from revision 4; deterministic)

**RNG.** mulberry32 over the uint32 `g.rng` (initialised to `seed >>> 0`):

```js
function rngNext(g){ var a = (g.rng + 0x6D2B79F5) | 0; g.rng = a >>> 0;
  var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
```

For seed 42, the first values are `0.6011037519, 0.4482905590, 0.8524657935, 0.6697340414, 0.1748138987` (verified).

**Weight arrays** always have **5 entries** `w[0..4]`, indexed by tier, with `w[0] = 0`.

**`drawSpawn(g)`, in exactly this order** (`h = g.spawnHistory`):

1. **Script (tests only).** If `g.rules.spawnScript` is set: `t = script[g.spawnCount % script.length]`; go to step 6.
2. **Opening.** If `g.spawnCount < OPENING (2)`: `t = 1` (no RNG consumed); go to step 6. `createGame` calls `drawSpawn` twice, so current = 1, next = 1, `spawnCount = 2`, `spawnHistory = [1, 1]`.
3. **Progressive unlock.** `cap = clamp(highestTier, 2, 4)`. `w = [0, 40, 30, 20, 10]`, then `w[k] = 0` for every k in cap+1..4.
4. **Draw.** `t = pickWeighted(w, rngNext(g))`.
5. **Repeat rules** (`last = h[h.length − 1]`):
   - **Rule A (no back-to-back 4).** If `t === 4 && last === 4`: `w[4] = 0`; `t = pickWeighted(w, rngNext(g))`.
   - **Otherwise, rule B (no 4 equal in a row).** If `h.length ≥ 3` and `h[−1] === h[−2] === h[−3] === t`: `w[t] = 0`; `t = pickWeighted(w, rngNext(g))`.
   - **Then rule C (T1 drought).** If `h.length ≥ 7` and none of the last 7 entries is 1: `t = 1` (no RNG).
6. **Record.** Push t to `h` (drop the oldest beyond 8 entries). `g.spawnCount += 1`. Return t.

`pickWeighted(w, u)`: `s = w[1] + w[2] + w[3] + w[4]`; if `s ≤ 0` return 1. `u *= s`; for t = 1..4: if `u < w[t]` return t, else `u −= w[t]`. If the loop falls through (float edge), return the highest t with `w[t] > 0`.

After the opening, the first random draw (the third `drawSpawn`) consumes exactly one RNG value: rule A needs a 4, rule B needs a history of three equal t, and `highestTier = 1` caps at tier 2.

**(measured)** Over 100k default draws: T1 39.5-40%, T2 30.2-30.4%, T3 20.5-20.7%, T4 9.3-9.4%. There are never 8 draws without a T1, never "4, 4", and never four equal draws in a row.

**Not included:**
- A mercy small-spawn rule. The feel prototype measured that it hurts: more small glasses means more pieces.
- Launch jitter.

### 2.8 Danger line and loss (normative; `updateDanger`)

```
updateDanger(g, ev) {
  if (g.tick < g.dangerSuspendUntil) {
    g.dangerTicks = 0 ; g.dangerTickEmitted = -1 ; g.threatTicks = 0 ; g.overIds = [] ; setLevel(0) ; return
  }
  over = [] ; threat = false
  for (b of bodies) {                                   // ascending id
    if (!b.cleared && b.y + b.r < DANGER_Y) b.cleared = true
    if (!(b.cleared || b.age > ELIGIBLE_AGE_TICKS)) continue
    if (b.y + b.r > DANGER_Y) over.push(b.id)
    else if (b.y + b.r > DANGER_Y - THREAT_DIST) threat = true      // THREAT_DIST = 5 u
  }
  g.threatTicks = threat ? g.threatTicks + 1 : 0
  if (over.length) {
    g.dangerTicks += 1
    if ((g.dangerTicks - 1) % DANGER_TICK_EVERY === 0) {
      nb = (g.dangerTicks - 1) / DANGER_TICK_EVERY
      if (nb > g.dangerTickEmitted) { g.dangerTickEmitted = nb ; emit dangerTick{n: nb} }
    }
  } else {
    g.dangerTicks = max(0, g.dangerTicks - DECAY)                 // DECAY = 2
    if (g.dangerTicks === 0) g.dangerTickEmitted = -1
  }
  g.overIds = over
  setLevel(over.length ? 2 : (g.threatTicks >= THREAT_HOLD_TICKS || g.dangerTicks > 0) ? 1 : 0)   // emits danger{level} on change
  if (g.dangerTicks >= GRACE_TICKS) { g.phase = 'over' ; g.launchPending = false ; emit lose{ids: over} }
}
```

- **Eligibility.** A launched glass never counts while it passes through the line. A glass that cannot get past the line (pile too full) counts after 1.2 s.
- **What is tested is what is drawn.** `y + r` is the near edge of the glass's footprint. The renderer draws every footprint (contact shadow) with its lowest pixel at exactly `Y(y + r)` (3.2), so "over the line" means "its shadow crosses the dashed line".
- **One global timer.** It decays twice as fast as it fills, so a jostling glass cannot dodge the loss by flickering, and a brief bump does not stick. Because the timer is shared, it is shown once, as a fuse on the dashed line (3.8), not on individual glasses.
- **No heartbeat stutter.** `dangerTickEmitted` records the highest heartbeat emitted, so a glass flickering around a boundary (for example dangerTicks 241 → 239 → 241) does not repeat it. It resets when the timer is fully drained.
- **Exact numbers.** Standard (GRACE 600): continuously over the line from tick 1 gives `dangerTick` n = 0..4 at dangerTicks 1, 121, 241, 361 and 481, and `lose` at tick 600 (not 599). Relaxed (GRACE 960): n = 0..7 at 1, 121, …, 841, and `lose` at tick 960. In general n runs from 0 to `floor((GRACE_TICKS − 1)/120)`.
- **Levels.** Level 1 needs a threat (an eligible glass within 5 u of the line) held for 0.5 s, or a draining timer. So a pile front that merely sits near the line does not keep the line orange all game.

### 2.9 Win, precedence and continue

- **First T9 of a run** (`!wonOnce`):
  - emit `merge` (360 × mult) and then `win{id, points}` with `points = round(1000·mult(depth))`;
  - `score += points`;
  - `wonOnce = true`, `dangerTicks = 0`, `dangerTickEmitted = −1`, `dangerSuspendUntil = tick + 720`.
- **Win beats lose.** Because the suspension is set before `updateDanger` runs, a loss can never fire in the same tick as a win, nor during the following 3 s of sim time.
- **The core keeps simulating after the win.** The app runs the win sequence (5.7) with slow-mo, so chains in progress finish. The app then stops feeding ticks while the Win menu is open.
- **The winning jug stays.** No jug burst can happen while `tick < dangerSuspendUntil` (2.6), and the win sequence lasts less than 3 s of sim time, so the jug the camera zooms on is still there when the Win menu opens, even when two T9s were created in the same tick.
- **`continueAfterWin(g)`** sets `dangerTicks = 0`, `dangerTickEmitted = −1` and leaves everything else unchanged.
- **Later T9s** score 360 × mult. The app shows the toast "Another Sangria!" and no overlay.

### 2.10 Jug burst ("Fiesta!")

- **Trigger.** After the first win, two touching T9s that are both age ≥ 24, at a tick ≥ `dangerSuspendUntil`, are both removed. Score `+1000 × mult` and emit `jugBurst`.
- **Presentation.** The FX label is "Fiesta!". There is a big fruit fountain and the jug-burst sound.
- **Purpose.** It keeps endless play from locking up.

### 2.11 Scoring and best

- **Merges.** `points = round(BASE[tier] × mult(depth))`. Launches give 0.
- **Bonuses.** The win bonus and the jug burst both use the multiplier of the merge that caused them.
- **Typical scores.** **(measured, Standard)** 6,000-12,000 on a win.
- **Best score (app).**
  - `app.bestAtRunStart = save.best` is captured in `newGame` (and restored with a saved run, 5.9).
  - The live `save.best = max(save.best, score)` updates as the score climbs.
  - "NEW BEST!" shows once per run, the first time `score > app.bestAtRunStart > 0` (so a first-ever run never shows it).
- **`bestTier`** = `max(save.bestTier, tier)` on every `discover` event from the play game.
- **`wins`** is incremented on the `win` event, and the save is written synchronously in that dispatch (not when the Win menu appears).
- **When the save is written:**
  - `win`, `lose`, `discover` and continue;
  - pause;
  - `visibilitychange → hidden` and `pagehide`;
  - throttled to at most once per 2 s while the score is a new best.
- **Every write merges** with the stored value through the pure `mergeSave(stored, next)`: `best`, `bestTier` and `wins` take the max, `discovered` is ORed, settings (`muted`, `ambience`, `showNumbers`, `relaxed`) take `next`. Two open tabs therefore can never lower a best.

### 2.12 Launch timing, buffering and refusal

`requestLaunch(g, mode)` is called at a step boundary (5.8), `mode` is `'pointer'` or `'key'` (default `'key'`), and it returns one of:

- `'queued'`: `phase == 'ready'`. Sets `launchPending = true`; the launch happens in the tick that runs next.
- `'buffered'`:
  - `mode === 'pointer'` and `phase == 'cooldown'` (any remaining cooldown), or
  - `mode === 'key'` and `phase == 'cooldown' && cooldown ≤ BUFFER_TICKS (36)`.

  Sets `launchPending = true`; the launch fires on the tick the cooldown reaches 0. There is only one pending slot, so rapid taps launch at most once per cooldown.
- `'rejected'`: otherwise (key presses early in the cooldown, and `phase == 'over'`). The app shows the "not ready" feedback at the launcher (3.8).

**Why pointers buffer longer.** A touch aim is press, drag, release. A release 0.2 s after the previous launch is a deliberate throw; dropping it would feel like lost input. Keys keep the short window so a held or mashed key cannot queue throws blindly.

`cancelLaunch(g)` sets `launchPending = false`. The app calls it on every exit from PLAY (5.7).

**Refused launch.** In `tick` step 3, if the spawn circle at (aimX, 144) with radius `R[current]` overlaps any body (`d < R[current] + r_o`), the launch is refused: no body is created, `launchPending` is cleared, `current`, `next` and the phase are unchanged, and `launchBlocked{blockerId}` is emitted. The UI shows the not-ready feedback and flashes the blocker. This cannot deadlock: any body overlapping the spawn circle has `y + r > LAUNCH_Y − R[4]` (133.4 Standard, 134.4 Relaxed), which is beyond `DANGER_Y` in both modes, so it either moves away or becomes eligible and ends the run through the danger timer; meanwhile the player can re-aim.

### 2.13 Modes: Relaxed (default) and Standard

| Rule | Standard | **Relaxed (default)** |
|---|---|---|
| `DANGER_Y` | 130 | **133** |
| `GRACE_TICKS` | 600 (2.5 s) | **960 (4.0 s)** |
| `RADIUS_SCALE` (tiers 2-9) | 1.00 | **0.91** (set by the tuning gate: the starting rung 0.94 missed the smart-bot target; Appendix 9) |

- The mode is a persisted setting (`save.relaxed`, default `true`), shown in Pause as "Relaxed table" with the note "applies to the next game". A run keeps the mode it started with (stored in its snapshot).
- Both modes share one best score, one `wins` counter and one discovery mask.
- `createGame(seed, overrides)` resolves rules as: config defaults → `CONFIG.MODES[overrides.mode || 'standard']` → the remaining overrides. `rules.RADII[t] = t === 1 ? 6.0 : TIERS[t].radius·RADIUS_SCALE`.
- **Guards** (test 47): in both modes `DANGER_Y ≤ LAUNCH_Y − R[4] − 0.4` (Standard 133.0, Relaxed 133.95) and `LAUNCH_Y + R[4] ≤ L`.
- **Acceptance targets** (tuning gate, 8 step 2, 400 seeds, launch every 1.4 s): Relaxed smart bot ≥ 70%, Relaxed sloppy bot ≥ 40% and ≤ 85%. Standard has no target; it is reported only.

---

## 3. UI/UX and layout

### 3.1 Stage and viewport

- **Canvas.** A full-viewport canvas: `position: fixed; top: 0; right: 0; bottom: 0; left: 0; width: 100vw; height: 100dvh` (fallback `100vh`) as the pre-script default. Once the scripts run, JS sets explicit CSS px sizes from the measured viewport, because `100vh` is wrong on iOS (3.10).
- **Viewport size.** Measured and re-measured as specified in 3.10, on every platform: `visualViewport.width/height`, with `innerWidth/innerHeight` when `visualViewport` is missing or `visualViewport.scale > 1.01`; re-measured on `visualViewport.resize`, `resize`, `orientationchange` and `pageshow`, debounced 150 ms, plus once more 500 ms after `orientationchange`.
- **DPR.** `dpr = min(devicePixelRatio, 2)` (iPhones report 3; 3.10). The adaptive fallback is in 7, item 7.
- **Stage** (the gameplay column), one continuous rule for every aspect ratio:
  - `S = min(vw, round(0.62·vh))`, `H = vh`, centred horizontally.
  - The background (sky, sea, sand, palms, benches, roof and string lights) **extends across the full canvas**, so there are never letterbox bars.
- **Safe areas.** A hidden probe div with `padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)` is read with `getComputedStyle`.
- **Cache rebuilds.** Layout is recomputed on every resize. Sprite caches are rebuilt only when `kX·dpr` changes by more than 2%, or when the mode's radii change.
- **Landscape phones.** If `matchMedia('(pointer: coarse)')` matches, `vw > vh` and `vh < 500`, `computeLayout` returns `needsPortrait = true` and the app shows the blocking ROTATE overlay ("Turn your phone upright to play", with a rotating-phone icon). From PLAY it pauses first. It disappears as soon as the condition is false. Tablets in landscape (vh ≥ 500) play normally.

### 3.2 Projection (pinhole; pure, in `projection.js`)

Physics is flat circles; only drawing is projected.

```
S_FAR = 0.72 ; TABLE_FILL = 0.96 ; C_NEAR_MIN = 0.85 ; C_NEAR_MAX = 0.98
F      = S_FAR*L/(1 - S_FAR)            = 411.4286
s(y)   = F/(F + L - y)                  // depth scale: 0.72 far .. 1.0 near; s(130)=0.9320, s(144)=0.9626
kX     = TABLE_FILL*S/110               // px per u at the near edge (110 = table + 2×5 u frame)
A      = cNear*F*kX                     // cNear solved per layout (below)
X(x,y) = cx + (x - 50)*kX*s(y)
Y(y)   = nearY - A*(1 - s(y))           // table height on screen = 0.28·A
hScale(y) = kX*s(y) ; vScale(y) = A*s(y)²/F ; c(y) = vScale/hScale = cNear*s(y)
footprint(x, y, r) = { X: X(x, y), Y: (Y(y - r) + Y(y + r))/2,
                       rx: r*kX*s(y), ry: (Y(y + r) - Y(y - r))/2 }   // lowest pixel = Y(y + r) exactly
unprojectX(px, y) = 50 + (px - cx)/(kX*s(y))       // aim always uses y = LAUNCH_Y
unprojectY(py)    = L + F - F/(1 - (nearY - py)/A)
```

- Lines of constant x project to **straight lines** converging toward the vanishing point, so the aim guide needs no special code.
- `c < 1` everywhere (at most 0.98 at the near edge), so footprints never read as seen from below.
- **The footprint is the single table-plane primitive.** Contact shadows, caustics, merge rings, the aim ghost and the debug colliders are all drawn from `footprint()`, so they agree with each other and with the danger rule.

**Vertical layout solve** (stage px):

1. HUD: the rects of 3.4; `hudBottom` is their lowest edge.
2. Tier strip:
   - `slotW = (0.86·S − 12)/9`
   - `stripH = max(44, min(0.07H, 1.25·slotW + 10))`
   - `stripBottom = H − safeBottom − max(0.035H, 16)`, `stripTop = stripBottom − stripH`
3. Table:
   - `kX = 0.96·S/110`
   - `nearY = stripTop − 0.018H − 10·kX` (the 10·kX covers the near frame and the apron)
   - `farTarget = max(hudBottom + 0.12H, 0.27H)`
   - `cNear = clamp((nearY − farTarget)/(0.28·F·kX), 0.85, 0.98)`, `A = cNear·F·kX`, `farY = nearY − 0.28·A`
4. If, with `cNear = 0.85`, `farY < hudBottom + 0.12H` (room for tall far glasses), recompute `kX = (stripTop − 0.018H − hudBottom − 0.12H)/(10 + 0.28·0.85·F) = (…)/107.92`, then `nearY` and `farY`.

Spare height first makes the table taller (up to cNear 0.98, about 1.07 tall per unit width, as in screenshot 1). Only height left over after that goes to sky and sea, keeping the table and launcher near the thumb.

**Reference values (computed from the formulas, safe areas 0):**

| Viewport | S | kX | cNear | far edge | danger line (y 130) | launcher | near edge | T1 at launch / far |
|---|---|---|---|---|---|---|---|---|
| 360×640 | 360 | 3.142 | 0.98 | 175 px (27%) | 444 (69%) | 482 (75%) | 530 (83%) | 36 / 27 px |
| 360×780 | 360 | 3.142 | 0.98 | 301 (39%) | 570 (73%) | 608 (78%) | 656 (84%) | 36 / 27 px |
| 375×667 | 375 | 3.273 | 0.98 | 183 (27%) | 463 (69%) | 503 (75%) | 552 (83%) | 38 / 28 px |
| 390×844 | 390 | 3.404 | 0.98 | 326 (39%) | 617 (73%) | 659 (78%) | 710 (84%) | 39 / 29 px |
| 412×915 | 412 | 3.596 | 0.98 | 367 (40%) | 674 (74%) | 719 (79%) | 773 (84%) | 42 / 31 px |
| 768×1024 | 635 | 5.542 | 0.887 | 276 (27%) | 705 (69%) | 767 (75%) | 843 (82%) | 64 / 48 px |
| 1366×768 | 476 | 4.154 | 0.887 | 207 (27%) | 529 (69%) | 575 (75%) | 632 (82%) | 48 / 36 px |
| 1920×1080 | 670 | 5.847 | 0.886 | 292 (27%) | 744 (69%) | 809 (75%) | 889 (82%) | 68 / 51 px |
| 844×390 (coarse) | 242 | n/a | n/a | n/a | n/a | n/a | n/a | `needsPortrait` overlay |

### 3.3 Regions (portrait)

| Band | Range | Contents | Layer |
|---|---|---|---|
| Roof | 0 - 7.5% H (hem jag to 8.5%) | Thatch, beams, string lights | Canvas, drawn **over** the glasses |
| HUD | `hudTop` .. `hudBottom` | Coin pill, BEST line, Pause, Mute, NEXT | DOM |
| Scenery | 0 .. farY + 2% | Sky (to 60% of farY), sea band, beach, palms | Canvas |
| Table | farY − 5 u frame .. nearY + apron | Frame, glass-over-sand surface, danger line, launch zone | Canvas |
| Tier strip | `stripTop` .. `stripBottom` | Strip (display only, `pointer-events: none`) | DOM |
| Foreground | below the strip | Sand, starfish, shells | Canvas |
| Input layer | full viewport | Transparent `#input` div receiving all gameplay pointer input | DOM, above canvas and strip, below HUD buttons and overlays |

Side benches are drawn from 35% to 80% H at the outer stage edges. On wide canvases they are also drawn beyond the stage.

### 3.4 HUD (DOM; absolutely positioned from rects computed by `projection.computeLayout`)

The HUD rects are computed in pure code (stage px, offset by the stage x when applied) so a Node test can prove they never overlap:

```
m     = round(0.04·S) ; pillH = max(round(0.055·H), 40) ; D = round(1.25·pillH) ; N = round(min(0.15·S, 72))
top   = hudTop = max(safeTop, round(0.012·H)) ; cy = top + D/2
coin  = {x: m,            y: top,              w: D,  h: D}           // fully on screen
next  = {x: S − m − N,    y: top,              w: N,  h: N}
label = {x: next.x − 6,   y: top + N + 2,      w: N + 12, h: 20}      // "NEXT"
mute  = {x: next.x − 52,  y: cy − 22,          w: 44, h: 44}
pause = {x: mute.x − 52,  y: cy − 22,          w: 44, h: 44}
pill  = {x: m + D/2,      y: cy − pillH/2,     w: min(0.40·S, pause.x − 10 − (m + D/2)), h: pillH}
best  = {x: m + D + 4,    y: pill.y + pillH + 3, w: pill.x + pill.w − (m + D + 4), h: 20}
hudBottom = max(best.y + 20, label.y + 20, top + D)
```

The coin overlaps the left half of the pill by design; every other pair of rects is disjoint (test 49). On a 390×844 phone: coin 16..74, pill 45..201, Pause 212..256, Mute 264..308, NEXT 316..374, `hudBottom` = 91.

**Coin pill**
- Fill `#FFF3D6`, border 3 px `#E2B66B`, shadow `0 3px 0 #C8964A`, radius 999 px. Padding-left `D/2 + 6` px, padding-right 12 px.
- **Coin icon:** the `coin` rect, painted on a 64-px canvas by `art.paintCoin`:
  - radial gradient `#FFE58A → #FFC93C → #E89B14`;
  - rim `#C77A0A` (6%);
  - embossed star `#E8A317` with highlight `#FFF4B8`.
- **Number:** `800 clamp(18px, 5.6vw, 28px) var(--font)`, colour `#5A3A14`, tabular numbers, `toLocaleString('en-US')`. Fit rule: whenever the text changes length, reduce the font by 1 px while its width exceeds the pill's inner width, down to 14 px.
- **BEST line** (the `best` rect): `BEST 12,340` at 14 px / 800, `#7A4A22`, white 1-px text-shadow.
- **"NEW BEST!" badge:** replaces the BEST line in the same rect for 2 s, then the BEST line returns. Pink `#FF5C8A` pill, white 14 px / 900 text. Pops 0 → 1 over 300 ms easeOutBack, once per run.

**Pause and Mute**
- `<button tabindex="-1">`s, 44 px circles, at the `pause` and `mute` rects (right-aligned against the NEXT box).
- Fill `#FFF3D6`, border 3 px `#E2B66B`.
- Inline SVG icons with stroke `#7A4A22` 3 px: pause bars; speaker / speaker with slash.
- `aria-label`: "Pause" and "Sound on" / "Sound off". Keyboard users use P and M.
- After a pointer click the button calls `blur()`.

**NEXT box**
- The `next` rect, radius 14 px.
- Fill `#FFF6E4`, border 3 px `#4C8B2B` (ui-green), 2-px inner white line (`box-shadow: inset 0 0 0 2px #fff`).
- Contains a canvas with the next tier's icon (`paintIcon`, icon mode) fitted to 78%.
- "NEXT" label (the `label` rect): 14 px / 900, white, `-webkit-text-stroke: 3px #7A4A22; paint-order: stroke fill`, letter-spacing 1 px, centred.

**Tier strip** (display only, no tooltips, `pointer-events: none`)
- Width 92% S, centred, height `stripH` (3.2).
- A cream pill (`#FFF4E0`) with border 3 px `#4C8B2B` and `box-shadow: 0 4px 0 rgba(122,74,34,.35)`, ending in a right-pointing **arrow head**: a CSS clip-path triangle 6% S wide, with the same fill and an outline drawn by a second, larger green triangle behind it.
- **9 equal slots**, each `slotW` wide, with 6 px padding at the pill ends.
- **Icon fit.** Each slot's canvas box is `boxW = 0.9·slotW`, `boxH = stripH − 10`. Each icon is scaled by `min(boxH / spriteH[t], boxW / spriteW[t])` (sprite bounds from the 4.2 table; for a tier whose PNG override is active, the Sprite's `w`/`h` from its image rect, 4.3), so icons are equal height wherever that fits and width-capped otherwise (T8 and T9 on narrow phones). Icons are bottom-aligned.
- **T9 icon (icon mode).** Icon mode depends on the call site, never on a pixel size: `paintIcon` (strip, NEXT, collection, toast) always calls `paintTier(..., {icon: true})`, and `buildSprites` (in-world sprites, which the 2× win-card jug reuses) never does. Icon mode paints the T9 neck ribbon at width 0.16 (instead of 0.10) and the yellow handle highlight at 0.07 (instead of 0.04). The yellow then still reads beside the jade at 28 px, so the green-and-yellow jug is recognisable in the strip. The silhouette and dimmed states are unchanged.
- **Slot states:**

  | State | Look |
  |---|---|
  | Never discovered (persisted mask) | Silhouette `#3A2A1A` at 85% alpha |
  | Discovered in an earlier run, not yet this run | Full sprite at alpha 0.45 with `filter: saturate(0.3)` (alpha only where unsupported) |
  | Discovered this run (`runMask`) | Full colour |
  | Highest tier this run | Gold halo behind the icon (radial `#FFE36B` α 0.7 → 0) pulsing in scale 1 → 1.06 at 1 Hz, plus a 3 px gold underline `#FFC93C` |

- Drink names are shown in the Pause card's collection grid (3.5), not in tooltips.

**Visibility.** HUD and strip are visible (`visibility: visible`) in PLAY, WIN_SEQ, LOSE_SEQ, WIN_MENU and OVER_MENU, and hidden in TITLE, PAUSE, ROTATE and OOPS. On the title, only the title's own mute toggle is shown.

**Text-size floor.** No visible text is smaller than 13 px anywhere; body copy is 15 px; BEST and the NEW BEST badge are 14 px. Canvas texts use `max(13, size·uiK)`.

### 3.5 Overlays (DOM)

**Shared styling and behaviour**
- Backdrop `rgba(40,20,5,0.45)`, fading in over 200 ms.
- **Card:**
  - `#FFF6E4`, border 4 px `#E2B66B`, radius 22 px, shadow `0 10px 0 #C48A3E`, max-width min(88% S, 380 px), max-height 86% H with `overflow-y: auto`;
  - enters with scale 0.85 → 1 (320 ms easeOutBack) and opacity over 160 ms.
- **Title text:** 900 weight, `#7A3A12`, white stroke 4 px.
- **Primary button:** gradient `#FFB13B → #FF8A1F`, bottom border 5 px `#D9650F`, white text with `0 2px 0 #A84A00`.
- **Secondary button:** gradient `#5BC0EB → #2E9CD1`, bottom border `#1F79A8`.
- All buttons: min height 52 px, 17 px / 900 text, press scale 0.94 over 80 ms plus the UI click, `touch-action: manipulation`.
- **Hidden overlays** get the `hidden` attribute **and** `inert`, so nothing inside can keep or take focus.
- **Focus.** When an overlay opens, its primary button is focused. The ring uses `:focus-visible` only (`outline: 3px solid #4C8B2B; outline-offset: 3px`), so touch users never see it. When an overlay closes, `document.activeElement.blur()` runs, and entering PLAY focuses the canvas (`tabindex="-1"`).
- **Armed confirmation** (destructive actions). When the run's score > 0, the first tap on Restart (or the R key in Pause), or on New Game over a saved run, turns the button red-orange with the label "Tap again to restart" ("Tap again to start over") for 2 s; a second activation within those 2 s performs it, otherwise it disarms. Win and Game Over actions need no confirmation.

**1. Title** (a flex column, centred in the stage)
- **Behind it, attract mode:** a separate game instance (seed 42, current mode), muted, launching every 1.2 s at `botAim` with its own seeded noise RNG. It resets silently on lose, on win, and after 43,200 ticks (3 min sim). Its events only reach `render.fx` (5.7).
- **Bottom gradient:** `rgba(40,20,5,0 → 0.35)` from 50% to 100% H.
- **Layout:** `display: flex; flex-direction: column; align-items: center`, children spaced by `margin-top: clamp(8px, 2vh, 20px)` on every child but the first (not flexbox `gap`, which Chrome/Edge/WebView 80-83 lack, 3.10), from `max(9% H, safeTop + 8)` down to `stripBottom`, children in this order: tag, logo, icon row, buttons, stats, how-to. Nothing is positioned by fixed % H.
- **Hanging dedication tag** (the order-card motif):
  - A **yellow ribbon** (3 px, tag-ribbon `#FFD23F` with 1 px `#D9A400` edges) hangs from the roof hem at the stage centre to a clothespin (10×24 px, `#C98B4A`, with a darker seam) and ends there in a small yellow bow (two loops 14×9 px, knot 5 px, two 12 px tails with V-notched ends). The pin holds a **green card tag** (Reem's colour on the owner's yellow).
  - Tag width min(80% S, 340 px).
  - Tag look:
    - fill tag-green `#17734C` (deep jade), radius 6 px, with a 2 px inset line `rgba(255,255,255,0.18)`;
    - faint ruled lines: `repeating-linear-gradient(transparent 0 23px, rgba(255,255,255,.07) 23px 24px)`;
    - a punched hole at the top centre, ringed 2 px cream `#FFF3D6`;
    - shadow `0 6px 0 rgba(11,70,45,.35)`;
    - padding 14 px 18 px.
  - Text: `CONFIG.DEDICATION` inserted via **`textContent`** with `white-space: pre-line` (line breaks typed in `dedication.js` are kept).
    - Font: italic `"Segoe Print","Bradley Hand","Snell Roundhand","Comic Sans MS",cursive`, colour tag-text `#FFF8E1` (contrast 5.5:1 on `#17734C`), `text-shadow: 0 1px 0 rgba(0,0,0,.25)`, 20 px.
    - Auto-shrink by 1 px steps down to 15 px until it fits in 3 lines; beyond that, CSS line-clamp 3 with an ellipsis.
    - A small inline-SVG heart in yellow `#FFD23F` (1 px `#D9A400` outline) sits at the bottom right.
  - The whole tag group swings ±2° about the ribbon top: `transform-origin: top center`, 3.2 s `ease-in-out infinite alternate`. No swing under reduced motion.
- **Logo:**
  - "Cocktail Merge" (`CONFIG.GAME_TITLE`): white fill, 6 px `#FF6B3D` stroke, shadow `0 5px 0 #B8461E`, size clamp(40px, 12vw, 64px);
  - a green ribbon subtitle "Beach Bar" (`#4C8B2B`, white 18 px).
- **Icon row:** 9 tier icons bob ±4 px with a 1.6 s period, phase offset 0.12 s per icon. Undiscovered tiers show as silhouettes.
- **Buttons:**
  - If a valid saved run exists: **Continue** (primary, shows "Score 4,210") and **New Game** (secondary, armed when the saved run's score > 0).
  - Otherwise: **Play** (primary).
- **Stats:** "Best: 12,340 · Highest: Mojito" (15 px). On a second line, only when wins > 0: "Sangrias mixed: N".
- **How to play** (3.7): a cream card (`#FFF6E4`, radius 14 px, padding 10 px 14 px, 15 px `#5A3A14` text, no text stroke). If `H < 700`, the card is replaced by a secondary "How to play" button that opens it as a small overlay with a Close button.
- **Mute toggle** top-right (44 px, same style as the HUD button).

**2. Pause**
- Title "Paused", then "Score 4,210" (15 px).
- Buttons: **Resume** (primary), **Restart** (armed), **Quit to Title** (keeps the run; Title then offers Continue, so no confirmation).
- Toggles (switch rows, 44 px tall, 15 px labels): "Sound", "Ambience", "Relaxed table" (note under it, 13 px: "applies to the next game"), "Show tier numbers". All persisted.
- **Collection:** a 3×3 grid of the 9 drinks: icon (40 px) in its slot state plus the name at 13 px below; never-discovered drinks show a silhouette and "???".
- On fine pointers, a key help line (13 px): "P pause · M mute · R restart".

**3. Win** (trimmed in green with yellow accents)
- Card: the shared card, but with a 4 px jade border `#0F8A5F` and shadow `0 10px 0 #0B6A48`.
- Title "Sangria Verde!" in jade `#0F8A5F` with the 4 px white stroke, set on a yellow ribbon banner (`#FFD23F`, folded ends `#D9A400`, 6 px taller than the text).
- The jug sprite at 2×, rotating ±4° (2 s sine), with a sunburst behind it: 12 rays alternating yellow `#FFD23F` α 0.40 and green `#5FD08A` α 0.30, at 0.1 rev/s.
- Text "You mixed the ultimate pitcher!", then score and best, with a "NEW BEST!" ribbon `#FF5C8A` if applicable.
- Buttons: **Keep Playing** (primary) and New Game.

**4. Game over**
- Title "Last Call!", subtitle "The table is full."
- Score, best, the NEW BEST ribbon if applicable, and "Highest drink:" with icon and name.
- Buttons: **Play Again** (primary) and Title.

**5. Discovery toast** (in play, tiers ≥ 5, the first time in a run)
- A banner below `hudBottom` with a mini sprite and the text "NEW: Mojito!", or "NEW COCKTAIL: Mojito!" if this is the first time ever (persisted mask). 15 px / 900.
- Slides down over 220 ms easeOutBack, holds 1.2 s, slides up over 200 ms easeInCubic. `pointer-events: none`.
- Suppressed for tier 9 (the win takes over).

**6. "Another Sangria!" toast**: the same component. **"Fiesta!"** is a canvas floater (3.8).

**7. ROTATE** (3.1): full-screen cream card "Turn your phone upright to play" with a rotating-phone SVG; no buttons.

**8. OOPS** (5.8): "Oops! The bar tipped over." (15 px body: "Your best score is safe.") Buttons: **Restart** (primary) and Title.

### 3.6 Input mapping

**Zones** (screen y in stage coordinates, after inverting the view zoom, see below):

| Zone | Pointer down | Hover (mouse, no button) | During a drag |
|---|---|---|---|
| Above the table (`y < farY`: sky, sea, roof) | Nothing (no aim, no launch) | No aim change | **Cancel state** (see below) |
| Table and below (`y ≥ farY`, including the strip and the sand) | Starts a gesture and aims | Aims | Aims |

The **primary aim zone** is everything below the dashed line; it is where the first-run hint points and where the finger does not hide the pile.

| Action | Touch | Mouse | Keyboard |
|---|---|---|---|
| Aim | Pointer down at `y ≥ farY` sets the aim from the finger x, absolute and Suika-style, mapped at the launch row; drag follows | Hover at `y ≥ farY` aims (applied only when the pointer actually moved); press-drag as touch | ←/→ or A/D held: speed `min(110, 35 + 150·held_s)` u/s, relative to the current aim; Shift ×0.35 |
| Launch | Pointer up of the tracked gesture outside the cancel state | Same (button release) | Space / Enter / ↑ / W (keydown, ignore repeat) |
| Cancel | Drag above `farY` and release there; or `pointercancel` | Same | n/a |
| Pause | Pause button | Pause button | P or Esc (toggles) |
| Mute | Mute button | Mute button | M |
| Restart | Pause → Restart (armed) | same | R in Pause (armed), Win or Game over |
| Overlays | Tap | Click | Tab / Shift+Tab, Enter/Space activate (native), Esc as in 5.7 |

**Cancel state.** While a gesture's pointer is above `farY`, the launcher shows a red ✕ badge (`#FF4D4D` disc, white ✕, 18 px·k) and the aim guide is drawn grey at α 0.3; the aim is frozen at its last value. Moving back to `y ≥ farY` resumes aiming. Releasing in the cancel state does nothing.

**Pointer handling**
- Gameplay pointer listeners live on the full-viewport `#input` layer (above canvas and strip, below HUD buttons, toasts with `pointer-events: none`, and overlays).
- Pointer Events as the primary path, with `setPointerCapture` (touch + mouse fallback per 3.10). Only the first active pointer id (or touch `identifier`) is tracked; others are ignored.
- **View inversion.** Every pointer position goes through `projection.unprojectPointer(lay, render.view(), px, py)`, which removes the current win zoom (scale and centre) before `unprojectX` at `LAUNCH_Y`. Shake is not inverted (it is at most 9 px and decays in 0.12 s).
- `#input` and the canvas: `touch-action: none`. Buttons and overlays: `touch-action: manipulation`.
- `body { overscroll-behavior: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent }`.
- `contextmenu` is prevented.
- Viewport meta: `width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover`. iOS ignores `user-scalable=no`; 3.10 lists what actually prevents zoom, scrolling, callouts and selection there.
- Pointer Events are the primary path; a touch + mouse fallback for engines without `PointerEvent` is specified in 3.10.

**Intents** (in `src/ui/input.js`, consumed by `applyIntents` in `src/app/loop.js` at step boundaries, 5.8)
- `aimX` + `aimDirty`: pointerdown and pointermove set them only when the stage x changed since the last application. This is "last input wins": a key nudge applied after the last pointer movement is never overwritten by a stationary mouse.
- `launch`: a one-shot latch holding `'pointer'` or `'key'`. It survives frames in which no step runs (hit-stop, `acc < DT`) and is consumed by the first step, after the aim.
- Held keys: `input.heldDir()` and `input.precise()`, nudged once per step.
- **Every exit from PLAY** clears the latch and `aimDirty`, releases pointer capture, forgets the tracked pointer id and clears held keys.

**Input guard**
- Launch intents are ignored for **250 ms** after the app enters PLAY from any overlay.
- A pointer launch also requires that its pointer down began while in PLAY. A tap that closes a menu therefore never launches.

**Keyboard and focus**
- In PLAY, a global `keydown` and `keyup` handler (capture) calls `preventDefault()` for Space, Enter, the arrow keys, W, A, S, D, P, M, R and Esc, so the page never scrolls and no button is activated natively.
- Outside PLAY, events whose target is a `<button>` are left to the browser (native activation), and only Esc and R are handled globally.
- `blur` on the window clears held keys.
- `visibilitychange → hidden` auto-pauses (from PLAY), saves and stores the run.
- There is **no** auto-pause on window blur.

**First-run hint.** In a run with `save.best === 0`, until the first launch, a canvas-drawn hand icon (white, 3-px brown outline, 34 px·k) slides left and right ±20 u along the row y = 152, 1.6 s period, with the text "Drag here" (15 px).

### 3.7 How-to-play text (English)

- **Touch:**
  - "Drag left or right below the dashed line, then let go to slide a drink."
  - "Two identical drinks that touch mix into the next one."
  - "Don't let drinks stay past the dashed line!"
  - "Changed your mind? Slide your finger up off the table and let go."
- **Desktop:** "Aim with the mouse or ←/→. Click or press Space to slide.", followed by the second and third lines, then "Changed your mind? Drag up off the table and let go."
- **Choosing the variant:** use `matchMedia('(pointer: coarse)')`.

### 3.8 Animation catalogue (render-only; never affects the sim)

Easings (in `src/render/fx.js`):
- `easeOutCubic = 1−(1−t)³`
- `easeInCubic = t³`
- `easeOutBack = 1 + 2.70158(t−1)³ + 1.70158(t−1)²`
- `easeInOutSine = −(cos πt − 1)/2`
- `easeInQuad = t²`

`px·k` means px × `uiK` (`uiK = kX/3.4`, the stage scale).

**FX state ownership.** Per-body FX state (pop scale, squash spring, wobble, flash, launch offset) lives in a `Map` keyed by body id, created lazily and **deleted** when the body is removed (on its `merge` or `jugBurst` event, and on `fx.clear()` for a new game). Merge parent ghosts copy the parent's **current** pop scale, squash and wobble as their start values. Merge rings, particles, light rays and floaters belong to the event, not to a body.

| Moment | Spec |
|---|---|
| Idle launcher | Scale 1 + 0.02·sin(2π·1.2t) |
| Aim smoothing | Rendered launcher x: `x += (aimX − x)·(1 − exp(−25·dt))`. The sim uses the exact aim |
| Launcher marker | A white chevron (▲, 10 px·k, 2 px brown outline) on the table at y = 158 below the rendered launcher x, so the aim point is visible even when the finger covers the launcher |
| Launch | The new body starts with a render-only x offset equal to (smoothed launcher x − aimX), blended linearly to 0 over 60 ms, so it never jumps sideways. Squash spring kicked to sq = −0.12 (taller and thinner); whoosh |
| Cooldown ring | Around the launcher footprint: a thin white arc (2 px·k, α 0.7) filling clockwise from 12 o'clock over the 96-tick cooldown; hidden when ready |
| Not ready / launch refused | The launcher glass shakes horizontally ±4 px·k (3 cycles, 180 ms), the cooldown ring flashes orange `#FFB347`, and the not-ready sound plays. On `launchBlocked` the blocker blinks the red silhouette twice (150 ms on/off) |
| NEXT → launcher | On the `next` event, after 120 ms the new current sprite flies from the NEXT box centre to the launcher along a quadratic bezier (control point 20% S above the midpoint), scale 0.6 → 1.0, 260 ms easeOutCubic. If a launch happens first, it snaps |
| New NEXT appears | Scale 0.5 → 1, 240 ms easeOutBack |
| Impact squash | On an impact with vn > 20, per body: `sq = max(sq, min(0.10, (vn−20)/700))`. Spring `sq'' = −420·sq − 16·sq'`. Draw scaleY = 1 − sq, scaleX = 1 + 0.5·sq, about the anchor |
| Impact wobble | On an impact with vn > 30: `θ(t) = A·e^(−t/0.18)·sin(2π·5t)`, `A = min(0.12, (vn−18)/400)` rad, signed by the contact normal's x. Rotates about the anchor, about 0.6 s |
| Merge: parents | Ghost sprites (from the event's ax/ay/bx/by and the parents' current FX values) move to the midpoint, scale ×1 → ×0.7, alpha 1 → 0, 90 ms easeInQuad |
| Merge: child pop | popScale 0.55 → 1.18 (0-110 ms easeOutCubic), then → 1.0 (110-260 ms easeInOutSine) |
| Merge: flash | White silhouette over the child, alpha 0.85 → 0, 140 ms |
| Merge: ring | Footprint ellipse (`footprint()` scaled about its centre) radius r → 2.1r, width 5 → 1 px·k, alpha 0.9 → 0, in the tier key colour, 380 ms easeOutCubic. Tier ≥ 6 adds a white ring 80 ms later; for T9 that second ring is yellow `#FFD23F`, so the jug's rings are jade then yellow |
| Merge: particles | `min(26, 8 + 2·tier)` particles (×0.5 under reduced motion). Speed 80-220 px/s·k, drag 3/s, size 2-5 px·k, life 450-700 ms, fade over the last 40%, spin ±6 rad/s. Shapes per tier in 4.3 |
| Score floater | "+60" in max(13, 16·uiK) px, fill `#FFE07A`, 3 px stroke `#6B3A0A`, rises 36 px·k over 800 ms easeOutCubic, fades over the last 300 ms |
| Chain label (depth ≥ 2) | "CHAIN ×N" plus a word for depth 3 "Cheers!", 4 "Tasty!", 5 "Smooth!", 6 "On fire!", 7+ "Legendary!". Size 18 + 3·depth px·k (max 34). Gradient `#FFD23F → #FF7B1C`, 4 px stroke `#7A3A00`. Pops 0.3 → 1 (250 ms easeOutBack), rises 30 px, 900 ms |
| "Fiesta!" | Same style at 34 px·k, plus 80 confetti pieces in the green-and-yellow win palette (5.7) and 2 jug ghosts shrinking to 0 over 250 ms |
| Coins fly (tier ≥ 5) | 3 + (tier − 5) coin sprites (max 6) fly from the merge point to the coin icon along a bezier, staggered 60 ms, 450-650 ms easeInCubic. **One** coin ding plays when the first coin arrives |
| Coin counter | The value tweens over 450 ms easeOutCubic. The coin spins once (scaleX = cos) over 300 ms. The pill bumps 1 → 1.12 → 1 over 180 ms |
| Screen shake | For merges of tier ≥ 6: amplitude 2 / 3.5 / 5 / 8 px·k for tiers 6/7/8/9, plus 1 px per chain depth above 2, capped at 9. Random offset per frame × exp(−t/0.12 s). Off under reduced motion |
| Hit-stop | Merges creating tier 7 / 8: the accumulator is not fed for 50 / 70 ms real time. Rendering continues; a launch latched meanwhile fires on the first step afterwards |
| Light rays | Tier ≥ 7 merges: 8 rays `rgba(255,240,180,0.35)` behind the child, rotating 0.8 rad/s, scale 0.5 → 1.4, alpha → 0, 600 ms. A T9 merge (and the win) uses 8 rays alternating yellow `rgba(255,210,63,0.40)` and green `rgba(95,208,138,0.30)` |
| Tier discovered | The strip icon pops 0 → 1.25 → 1 (400 ms easeOutBack), a shine bar sweeps across (500 ms), a "NEW" label (13 px) shows for 1.2 s, plus 6 sparkles |
| Danger line, level 0 | Static white dashes, alpha 0.75 (no motion) |
| Danger line, level 1 | Steady orange `#FFB347`, alpha 0.9 (no pulse) |
| Danger line, level 2 | `#FF4D4D`, 4 Hz pulse, width 2 → 4 px·k. Red bottom vignette alpha = 0.35·dangerTicks/GRACE. Offending glasses (`overIds`) blink a red silhouette (alpha 0.5, 4 Hz) |
| Danger fuse | The shared timer, drawn on the dashed line whenever dangerTicks > 0: from both table edges toward the centre, a solid bar (4 px·k, round caps) covers the fraction `f = dangerTicks/GRACE_TICKS` of each half. Red `#FF4D4D` while any glass is over; orange `#FFB347` while it drains. When the two ends meet, the run is lost |
| Jug aura | Behind every T9 on the table: a yellow-gold radial (the T9 accent `#FFD23F`) α 0.35 → 0, radius 1.4 × footprint rx, pulsing in scale 1 ± 0.06 at 1 Hz |
| Jug sparkles | 2 four-point white sparkles at the T9 highlight points, scale 0 → 1 → 0, 1.5 s period, offset 0.75 s |
| Win sequence / lose sequence | 5.7 |
| String lights | Bulb brightness 0.75-1.0, 0.7 Hz, per-bulb phase |
| Palms / clouds / sea | Sway ±2° at 0.25 Hz (right palm phase π/2); clouds drift 3 px/s; foam sine (amplitude 0.4% H, wavelength 18% S, 0.3 rad/s); 12 sea sparkles twinkling at 0.5-1.2 Hz |

Reduced motion (`prefers-reduced-motion: reduce`):
- no shake, zoom, palm sway, tag swing or wobble;
- particle counts halved.

### 3.9 Sound (WebAudio, fully synthesised; `src/audio/`)

**Graph**
- `voices → (StereoPanner, pan = (x−50)/50·0.6, skipped if unsupported) → sfxBus 1.0 → master 0.9 → DynamicsCompressor(threshold −14 dB, knee 10, ratio 3.5, attack 3 ms, release 120 ms) → destination`.
- Clinks additionally pass a shared `BiquadFilter` lowpass at 7 kHz (Q 0.7) before the sfxBus.
- `ambience → ambBus 0.12 → master`.
- Mute (HUD button, M, Pause "Sound"): `master.gain.setTargetAtTime(0 | 0.9, now, 0.02)`. "Ambience" off sets `ambBus` to 0 the same way.
- A shared 1-s noise buffer is generated once with a seeded LCG.

**Unlock**
- `unlockFromGesture()` is registered on `window` for `pointerdown`, `pointerup`, `touchend`, `click` and `keydown`, all `{capture: true, passive: true}`. (A touch `pointerdown` is not a user activation; `pointerup`, `touchend` and `click` are.)
- The first call creates the `AudioContext`. Every call while `state !== 'running'` calls `resume()`. Creation, `resume()` and the silent buffer all happen synchronously inside the gesture handler, never after an `await`, a promise or a timer (3.10). The first call from `touchend`, `pointerup` or `click` also plays a 1-sample silent buffer (the iOS idiom).
- Once `state === 'running'`, all five listeners are removed.
- On `visibilitychange → visible`, and on `pageshow` with `persisted` (3.10), if the state is `'suspended'` or `'interrupted'`, `resume()` is called and the five listeners are re-registered until it runs again.
- If there is no AudioContext, every call is a no-op.

**Fault isolation.** Every entry point (`consume`, `click`, `notReady`, `ambience`) wraps its body in try/catch and logs once per error message, so an audio fault can never break dispatch or the frame loop.

**Limits**
- A **voice** is one logical sound: one recipe invocation (a clink, a chime with its pop, fizz, sub and grace note, a coin ding, …), tracked until its longest stop time.
- At most **12** voices at once. When full, a new voice whose peak gain is below 0.03 is dropped. Merge chimes, the win jingle, the lose sting and the Fiesta sound bypass the drop rule.
- Clinks: impacts whose `growing` flag is set are silent; at most 3 per frame (the loudest), at most 12 per rolling second, at most one per pair per 80 ms, and at least 30 ms between clinks quieter than 0.15.
- Coin dings: one per merge (on the first coin's arrival), and at least 40 ms apart.
- Every node disconnects on `onended`.

**Merge chime pitch** comes from the pure `CM.game.chimeFreqs(k, d) → {f, grace}`:

```
SCALE = [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50, 1174.66, 1318.51, 1567.98,
         1760.00, 2093.00, 2349.32, 2637.02, 2793.83, 3135.96]           // 15 entries
note(i) = SCALE[min(max(i, 0), SCALE.length − 1)]                        // every lookup clamped
i = (k − 2) + min(d − 1, 5) ; f = note(i) ; grace = k ≥ 7 ? note(i + 2) : null
```

The highest index used is 14 (k = 9, d ≥ 6, grace), so the clamp never triggers with valid input; it guards against invalid input.

| Sound | Recipe |
|---|---|
| **Clink** (glass-glass; `vn`, mean radius ř) | Gain `g = 0.32·clamp((vn−18)/140, 0, 1)^1.2`; skip if g < 0.02. `f0 = 2600·(6/ř)^0.6` Hz (T1 2600 Hz, T9 1190 Hz), ±2.5% detune (`Math.random`, audio only). Sine partials f0×[1, 2.32, 4.25] with gains g×[1, 0.45, 0.2], through the 7 kHz lowpass. Attack 2 ms, then `setTargetAtTime(0, t+0.002, τ)` with τ = [0.09, 0.05, 0.03]·(ř/6)^0.3. Stop at +0.5 s |
| **Wall thock** | `g = 0.25·clamp((vn−18)/140, 0, 1)^1.2`. Triangle 220 → 140 Hz (exponential, 70 ms), τ 0.05. Plus noise → bandpass 1200 Hz Q 1.5, peak 0.5g, τ 0.02 |
| **Launch whoosh** | Noise → bandpass Q 0.9 sweeping 500 → 2200 Hz over 0.22 s; gain 0 → 0.10 at 25 ms → 0 at 0.26 s. Plus noise → lowpass 300 Hz at gain 0.04 with a 0.35 s linear fade (wood slide) |
| **Merge chime** (tier k, depth d) | f from `chimeFreqs`. **Steel-pan voice:** carrier sine f, FM from a sine at 2f with depth f·1.6 Hz decaying τ 0.06. Amplitude attack 4 ms to `min(0.4, 0.28·(1 + 0.08(d−1)))`, τ = 0.22·(1 + 0.06k), stop at 1.2 s. Second partial sine 2f at 0.25× peak, τ 0.12. **Pop:** sine 260 → 760 Hz (exponential, 45 ms), peak 0.18, τ 0.03. **Fizz (k ≥ 5):** noise → highpass 4 kHz, 0.04, τ 0.25. **k ≥ 7:** sub sine f/4 (0.18, τ 0.35) plus a grace note (pan voice at `grace`, +90 ms, 0.6× gain) |
| **Coin ding** | Sines 1975.5 Hz (0.06) and 2637 Hz (0.04), τ 0.06 |
| **Discovery sparkle** | Sines 2637 / 3136 / 3951 Hz at +0 / 40 / 80 ms, 0.05, τ 0.08 |
| **Danger tick** (n = 0..7) | Triangle `880·2^(n/12)` Hz, 50 ms, 0.07, τ 0.02 (a rising heartbeat) |
| **Win jingle** (~2.2 s) | Pan voices C5 E5 G5 C6 E6 at 0/0.10/0.20/0.30/0.40 s (0.26, τ 0.25). Chord C5+E5+G5+C6 at 0.62 s (0.18 each, τ 0.6). Shimmer: sines 2093 + 3136 Hz with 9-Hz 50% tremolo, 0.04, fading 0.6 → 2.0 s. Shaker: noise → highpass 6 kHz bursts every 0.125 s from 0.62 to 1.6 s, 0.05, τ 0.03 |
| **Lose sting** (~1.9 s) | Sawtooth → lowpass Q 6. Notes G4 392.00 (0-0.28), F♯4 369.99 (0.30-0.58), F4 349.23 (0.60-0.88), E4 329.63 (0.90-1.90). Cutoff sweeps 1800 → 700 Hz per note. Gain 0.12. The last note has 5.5-Hz ±8-Hz vibrato and fades (τ 0.35) from 1.2 s |
| **Fiesta (jug burst)** | Chime k = 9, d = 3, plus noise splash (bandpass 800 → 300 Hz, 0.4 s, 0.12) and the shaker for 0.6 s |
| **UI click** | Sine 1400 → 1000 Hz over 35 ms, 0.07 |
| **Not-ready** | Sine 300 Hz, 40 ms, 0.04 |
| **Ambience** | Noise → lowpass 500 Hz → gain LFO 0.09 Hz between 0.02 and 0.07 (waves), into the ambBus (0.12). Plays on the title and in play when "Ambience" is on; ducked to 0 in pause; respects mute |

**Haptics** (play game only). If `navigator.vibrate` exists and sound is not muted:
- merge tier ≥ 6: 12 ms;
- win: [30, 40, 30];
- lose: 80 ms.

iOS has no `navigator.vibrate`, so on the primary platform haptics are a silent no-op.

### 3.10 iOS first (normative)

The primary platform is **iOS Safari and iOS Chrome on a modern iPhone**. Both use WebKit, as do Firefox and Edge on iOS, so they behave the same. Secondary platforms are Android Firefox, then desktop browsers. Where another section and this one disagree, this section wins on iOS.

| Topic | Rule |
|---|---|
| Feature floor | **Safari 15 / iOS 15** (raised from 13). This guarantees unprefixed `AudioContext`, `StereoPannerNode`, `visualViewport`, Pointer Events and `ui-rounded`; `webkitAudioContext` stays as a harmless fallback. **Never used:** `OffscreenCanvas`, `requestIdleCallback`, `:has()`, canvas `ctx.filter`, `ctx.roundRect`, `structuredClone`, `Array.prototype.at`, `Object.hasOwn`, CSS nesting, ES modules, top-level `await`, service workers. **Within the Safari floor but above the Chrome/Edge/WebView 80 floor (0.1), so written with a fallback that works everywhere:** CSS `inset` (Chrome 87; always written as the `top`/`right`/`bottom`/`left` longhands) and flexbox `gap` (Chrome 84, and `@supports` cannot detect it for flexbox; the title column spaces its children with margins, 3.5). Anything newer than 15.0 is only a progressive enhancement with an equivalent fallback: `inert` (15.5; the `hidden` attribute already removes the subtree from focus and hit testing), `:focus-visible` (15.4; written as a rule of its own so older engines drop only that rule), `100dvh` (15.4; superseded by the JS px sizes below), `overscroll-behavior` (16; backed by the `touchmove` guard below) |
| Audio unlock | The listeners of 3.9. Inside the **same synchronous handler**: create the `AudioContext` if needed, call `resume()`, and on the first `touchend`, `pointerup` or `click` start a 1-sample silent `AudioBuffer` into `destination` (the iOS silent-buffer trick). Re-arm the listeners on `visibilitychange → visible` and on `pageshow` with `persisted` (back-forward cache) whenever the state is `'suspended'` or `'interrupted'` (phone call, Siri, another app's audio). The iPhone ringer switch silences Web Audio; this is accepted, and QA checks with the switch on |
| Viewport height | `100vh` is never trusted (on iOS it includes the area behind the toolbars). `html, body` are `position: fixed; top: 0; right: 0; bottom: 0; left: 0; width: 100%; height: 100%; overflow: hidden` (longhands, never `inset`). JS sets explicit CSS px sizes on the canvas, `#input` and the overlay root from `vw = visualViewport.width`, `vh = visualViewport.height`; if `visualViewport` is missing or `visualViewport.scale > 1.01`, it uses `innerWidth`/`innerHeight`. CSS `100vh`, then `100dvh`, is only the pre-script default. Re-measure on `visualViewport.resize`, `resize`, `orientationchange` and `pageshow` (debounced 150 ms), plus once more 500 ms after `orientationchange`, because iOS reports the new size late |
| Safe areas | `viewport-fit=cover`. The probe div of 3.1 reads `env(safe-area-inset-top/bottom/left/right)`. The HUD top uses `safeTop` (notch or Dynamic Island) and the strip uses `safeBottom` (home indicator). Left and right insets matter only in landscape, which is blocked on phones (3.1) |
| Zoom, scroll, callout, selection | `user-scalable=no` stays in the meta tag but is not relied on. The game surface (`#input`, canvas) has `touch-action: none`; buttons and overlays have `touch-action: manipulation` (no double-tap zoom). `gesturestart`, `gesturechange` and `gestureend` (WebKit pinch) are `preventDefault`ed on `document`. A non-passive `touchmove` listener on `document` calls `preventDefault()` unless the touch started inside an overlay card that can scroll (`scrollHeight > clientHeight`); this blocks pull-to-refresh and rubber-banding where `overscroll-behavior` is missing. `dblclick` and `contextmenu` are prevented. `body` and everything in it get `-webkit-user-select: none; user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent` (no long-press "Save image" on the canvas, no text selection in the HUD or overlays). There are no text inputs, so the iOS focus zoom never triggers |
| Input | Pointer Events with `setPointerCapture` (3.6). If `window.PointerEvent` is undefined, `src/ui/input.js` falls back to `touchstart/touchmove/touchend/touchcancel` (non-passive; the first `identifier` is tracked) plus `mousedown/mousemove/mouseup`, feeding the same internal handlers. `pointercancel` and `touchcancel` (for example the home-indicator swipe) are a cancel. The left-edge back swipe in Safari cannot be prevented; it does nothing when the game is the tab's first page, and QA checks it |
| Resolution and performance | `dpr = min(devicePixelRatio, 2)`: iPhones report 3, and 2 looks the same at these sizes while drawing 56% fewer pixels. The adaptive fallback (7, item 7) measures **work time** per frame (sim plus render, `performance.now()` around the work inside `frame`), not the rAF interval: Low Power Mode caps iOS rAF at 30 Hz and ProMotion may run at 120 Hz, and the fixed-step loop already handles any rate. Sprite caches are bounded (`rp ≤ 220`); a replaced cache canvas is released by setting `width = height = 0` before it is dropped, because WebKit frees canvas memory late and iOS reloads tabs that exceed its canvas memory budget |
| Lifecycle | Save, store the run and auto-pause on `visibilitychange → hidden` and on `pagehide`; iOS may discard a background tab without any further event. On `pageshow` with `persisted`: reset `last` and `acc`, re-measure the viewport and re-arm audio |
| Storage | `localStorage` works in Safari over http(s), including private browsing (session-only there). It may throw on `file://`; the wrapper handles that (5.9). A home-screen web app has storage separate from Safari's |
| QA | The manual checklist (6.3) is executed **on an iPhone first** (Safari, then Chrome), then on Android Firefox, then on desktop. The Chrome-based browser smoke test (6.2) is no substitute |

---

## 4. Visual style guide

### 4.1 Palette

| Token | Hex |
|---|---|
| sky-top / sky-horizon | `#6CC9F2` / `#BDEBFF` |
| sea-deep / sea-shallow / foam | `#1CA7C9` / `#47D1D0` / `#E9FBF8` |
| sand / sand-dark / sand-light | `#F2D6A2` / `#E5C287` / `#FBE7C2` |
| palm-trunk / trunk-ring | `#8B5A2B` / `#6E4420` |
| palm-leaf / leaf-dark / leaf-light | `#3E9B3A` / `#2D7A2A` / `#5BBE4A` |
| thatch / thatch-dark / thatch-light / beam | `#C9A15A` / `#A87D3C` / `#E0BE73` / `#7A4A22` |
| twine / bulb / bulb-glow | `#8B6B3E` / `#FFE08A` / `rgba(255,216,107,0.45)` |
| wood-top / wood-bevel / wood-highlight / apron-top / apron-bottom / grain | `#D6A465` / `#A8743F` / `#ECC487` / `#9A5E2C` / `#6E3F1A` / `#B98146` |
| bench / bench-gap | `#C58A4E` / `#8C5426` |
| table-sand-far / table-sand-near / ripple | `#F1DDB0` / `#E9CF98` / `#D7B67A` |
| ui-cream / ui-border / ui-shadow / ui-text / ui-green | `#FFF3D6` / `#E2B66B` / `#C8964A` / `#5A3A14` / `#4C8B2B` |
| coin-light / coin / coin-dark / coin-rim | `#FFE58A` / `#FFC93C` / `#E89B14` / `#C77A0A` |
| danger-warn / danger | `#FFB347` / `#FF4D4D` |
| verde (T9 key) / verde-deep / verde-light | `#0F8A5F` / `#0B6A48` / `#5FD08A` |
| verde-gold (T9 accent) / verde-gold-edge / verde-gold-light | `#FFD23F` / `#D9A400` / `#FFE98A` |
| tag-green / tag-text / tag-ribbon (title dedication tag) | `#17734C` / `#FFF8E1` / `#FFD23F` |
| glass-tint / glass-edge / glass-outline | `rgba(220,245,255,0.28)` / `rgba(255,255,255,0.85)` / `rgba(40,60,80,0.35)` |
| silhouette | `#3A2A1A` |

The table wood is a light honey colour, matching screenshot 1.

**Font stack** (`--font`): `ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`, at weight 800/900. No web fonts.

### 4.2 Shared glass recipe (`src/art/glass.js`)

**Units, anchor and authoring coordinates**
- Recipes use **footprint units**: 1.0 = collider radius R.
- **Anchor.** The drawn sprite's **base-ellipse centre** is the anchor, and the renderer places the anchor at the centre of the body's exact footprint (`footprint().X, .Y`, 3.2). So the glass stands exactly on its collider.
- **Authoring coordinates.** The per-tier numbers in 4.3 are written with the base at y = +0.45 and the body rising upward (negative y). `paintTier` applies `ctx.translate(0, −0.45)` first, which puts the base at the anchor. Anchor coordinates = authoring coordinates − 0.45.
- **Width.** The widest part of every body reaches **0.95** (so two touching glasses nearly touch on screen, with a 0.1 R gap that reads as glass thickness). Garnishes and handles may protrude up to 0.4 beyond that.
- **The sprite is isotropic:** perspective comes from scale s(y), position and depth order, not from per-glass skew.
- **Baked ellipse ratios.** Sprites are cached, so their own ellipses use constants: the base ellipse **K_BASE = 0.55**, rims and liquid surfaces **K_RIM = 0.42** (rims are higher above the table, closer to eye height, so they read flatter; this keeps the reference's flat-rim look). The **table-plane** elements (shadow, caustic, rings, ghost, debug colliders, cooldown ring) are never baked; they always use the exact live footprint, whose ratio is c(y) ∈ [0.61, 0.98]. The base ellipse always lies inside its footprint (base rx ≤ 0.95, ry ≤ 0.55·0.95 ≤ the footprint's ≥ 0.61).

**Steps**
1. **Back garnish** (straws behind the glass, umbrella stick).
2. **Body path:** fill glass-tint.
3. **Liquid:** clip to the interior (the body inset by 0.06); vertical gradient up to the fill line; surface ellipse (rx = interior half-width, ry = K_RIM·rx) in a lighter colour.
4. **Contents:** ice, fruit, leaves and bubbles, inside the clip.
5. **Glass edge:** stroke glass-edge at 0.06, then glass-outline at 0.035 outside it.
6. **Rim:** ellipse (ry = K_RIM·rx), white stroke 0.07 at α 0.9, back half α 0.5.
7. **Highlights:**
   - left streak, white α 0.55, width 0.10, 15-80% of body height, round caps;
   - right streak, α 0.25, width 0.05;
   - sparkle dot r 0.05 at the upper left.
8. **Front garnish.**
9. **Base ellipse** at authoring y = +0.45 (the anchor), ry = K_BASE·rx, stroked with glass-edge.

**Reusable helpers** (all in `src/art/garnish.js`, all taking R-units):
- `citrusWheel(ctx, x, y, r, rot, pal, nSeg)`: rind 0.16r, pith 0.07r, flesh, segment lines 0.05r, centre dot.
- `citrusWedge(...)`: a half-disc sector of the same.
- `leaf(ctx, x, y, len, w, ang, pal)`: almond shape made of two quadratics, with a light half and a midrib.
- `cherry(ctx, x, y, r, col)`: body, highlight dot at (−0.35r, −0.35r) with r 0.25r, stem `#5B3A1A` curving up 1.6r.
- `straw(ctx, x0, y0, x1, y1, w, base, stripe, bend?)`: rounded bar, diagonal stripes every 1.2w, top-opening ellipse, optional 30° bend at 70%.
- `iceCube(ctx, x, y, s, rot)`: rounded square, fill `rgba(255,255,255,0.40)`, lighter top face α 0.65, edge `rgba(255,255,255,0.85)`.
- `bubbles(ctx, n, region, rnd)`: rings r 0.03-0.06, white α 0.6.

**Palettes**
- lime: rind `#3F8F2A`, pith `#EAF7C8`, flesh `#A6DB4F`, segment `#D8F28A`
- orange: `#E86A00` / `#FFE3B3` / `#FF9F1C` / `#FFC85C`
- lemon: `#E8C21A` / `#FFF7CC` / `#FFE45C` / `#FFF0A0`
- mint: `#2E9E4F`, light `#5FD27A`, vein `#8FD99A`

**Determinism.** Pattern randomness (specks, bubbles, fibres) uses `mulberry32(1000 + tier)`, so sprites are identical across runs.

**Sprite bounds** (R-units, **anchor coordinates**; x ∈ [−1.45, 1.45], y from `−TOPA[t]` to `+0.6`):

| Tier | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|
| TOPA (= authoring top + 0.45) | 1.95 | 1.85 | 1.95 | 1.90 | 2.85 | 2.90 | 3.55 | 2.75 | 2.75 |

- Tiers 8 and 9 add 0.2 padding on all sides for the baked glow.
- **Cache resolution:** `rp = min(220, ceil(R·kX·dpr·1.15))` device px per R-unit.
  - Canvas = bounds × rp.
  - Anchor pixel = (1.45·rp, TOPA·rp), plus padding.
- **Draw scale:** in-world sprites are drawn with `drawImage` at scale `R·kX·s(y)·popScale·dpr / rp` (`imageSmoothingQuality = 'high'`), with the anchor pixel on the footprint centre.
- **Extra caches per tier:** a white silhouette (flash) and a red `#FF3B3B` silhouette (danger blink), both made with `source-in`.
- **Baked glow (T8, T9):** draw the finished sprite once more underneath with `shadowBlur = 0.25·rp` and `shadowColor = rgba(255,240,180,0.55)` for T8, and the yellow-gold `rgba(255,210,63,0.65)` (the T9 accent) for T9.

### 4.3 Per-tier recipes (R-units, authoring coordinates: base at +0.45)

**T1 Tequila Shot** (key `#F5C542`)
- **Body:** tapered shot glass, bottom half-width 0.70 at +0.45, top 0.95 at −0.95. Solid base block 0.18 thick (`rgba(230,250,255,0.5)`).
- **Liquid:** `#FFD966` → `#E8A317`, fill −0.55, surface `#FFE89A`, white glint ellipse 0.25 × 0.05.
- **Garnish:**
  - `citrusWheel` (lime) r 0.42 at (0.6, −1.0), rotated −20°, 8 segments;
  - 6 salt specks (white, r 0.04) on the left rim.
- **Particles:** lime squares `#A6DB4F` (3 px) and white salt dots.

**T2 Old Fashioned** (key `#B3561C`)
- **Body:** low tumbler, bottom 0.85 at +0.45, top 0.95 at −0.75, base 0.22. Five crystal-cut facet lines on the lower 35% (white α 0.25, 0.02).
- **Liquid:** `#B35A1E` → `#8C3F10` (deep amber, clearly darker than T1), fill −0.35, surface `#D9803A`.
- **Contents:**
  - one big `iceCube` 0.9 × 0.85 at (−0.05, −0.2), rotated 8°, poking 0.3 above the surface;
  - the submerged part is overlaid with `rgba(160,70,20,0.35)`.
- **Garnish:**
  - orange-peel spiral ribbon, width 0.16, from (0.6, −0.95), 1.5 turns down over the rim, `#FF8C1A` with light edge `#FFC066`;
  - `cherry` r 0.15 `#B3122E` at (−0.4, 0.15).
- **Particles:** peel curls and ice chips `#EAF7FF`.

**T3 Cosmopolitan** (key `#FF5C8A`)
- **Body:** martini glass (narrow, deep V).
  - V-bowl rim at −1.05 (half-width 0.95). The sides are quadratics to the point (0, −0.05) with control point (±0.52, −0.20).
  - Stem −0.05 → +0.35 (width 0.08). Foot ellipse at +0.45, rx 0.55.
- **Liquid:** fill −0.85, `#FF7AA2` → `#D81B60`, surface `#FF9DBB`.
- **Garnish:**
  - lime wheel r 0.32 at (0.82, −1.05), slotted onto the rim (redraw the rim stroke over its lower third);
  - thin orange zest curl `#FFA43A` (width 0.06) at the left rim;
  - 6 white frost dots on the rim front.
- **Particles:** droplets `#FF5C8A` / `#FFB0C8`.

**T4 Margarita** (key `#C6E05A`)
- **Body:** wide, shallow coupe ("sombrero"), clearly different from T3's deep V.
  - Bowl: rim at −0.85 (half-width 0.95), a broad rounded bowl (cubic sides with control points (±0.95, −0.45) and (±0.45, −0.40)) down to a bowl bottom at −0.40 (half-width 0.25).
  - Stem −0.40 → +0.35 (width 0.09); foot ellipse at +0.45, rx 0.6.
- **Liquid:** `#F0F59A` → `#B5D43B` with 12 frosty speckles `#FAFDD8`, fill −0.75, surface `#F7FAC8`.
- **Salt rim:** a thick white band 0.16 on the rim's outer side plus 24 dots (r 0.04, alternating `#FFFFFF` / `#E9E9E9`, placed every 15° ± 4° along the rim ellipse).
- **Garnish:** lime wedge (half-disc) r 0.40, clearly offset outside the rim at (−1.0, −0.95), rotated −35°.
- **Particles:** lime-yellow droplets and salt.

**T5 Mojito** (key `#4CC97A`)
- **Body:** highball, bottom 0.88 at +0.45, top 0.95 at −1.75, base 0.18.
- **Liquid:** `rgba(220,255,210,0.85)` → `rgba(150,220,140,0.9)`, fill −1.45, surface `#E9FFE0`.
- **Contents:**
  - 3 ice cubes (0.45);
  - 2 lime wheels r 0.28 (α 0.9);
  - 6 mint `leaf`s (0.35 × 0.16) near the bottom and top;
  - 10 bubbles;
  - 4 crushed-ice quads heaped above the surface to −1.6.
- **Garnish:**
  - straw from (0.25, −0.4) to (0.55, −2.2), width 0.12, white with stripes `#2FA84F` (the part in the liquid is drawn behind at α 0.55);
  - mint sprig of 4 leaves at (−0.3, −1.85), angles −60°/−20°/20°/60°.
- **Particles:** mint leaves and bubble rings.

**T6 Tequila Sunrise** (key `#FF4F2E`)
- **Body:** hurricane glass.
  - Foot at +0.45 (rx 0.55); stem to +0.15.
  - Bowl: bottom +0.1 (0.45), bulge 0.95 at −0.4, waist 0.66 at −1.15, flared rim 0.90 at −1.75.
- **Liquid:**
  - gradient stops from the bottom: 0 `#C81D3A`, 0.45 `#FF6A1A`, 1.0 `#FFD23F`;
  - fill −1.5, surface `#FFE57A`;
  - **sunrise rays:** 5 thin lines from the bottom centre fanning ±35°, white α 0.12, width 0.04;
  - 3 ice cubes near the top.
- **Garnish:**
  - orange wheel r 0.42 at (0.85, −1.8);
  - `cherry` r 0.16 `#C3102F` on a white pick at (0.5, −2.15);
  - red/white straw `#E63946` from (−0.3, −0.8) to (−0.7, −2.3).
- **Particles:** orange and red droplets.

**T7 Piña Colada tiki mug** (key `#2EB5A8`)
- **Body:** opaque ceramic barrel, +0.45 to −1.45 (half-widths 0.92 bottom / 0.95 belly / 0.85 top).
  - Glaze: radial gradient centred (−0.35, −0.6): `#34C3B5` → `#1E8A80`.
  - Rim lip `#5FE0D2`. Outline `#145E57` at 0.06.
- **Carved face** (`#145E57`, lower edges highlighted `#5FE0D2` 0.03):
  - brow band with 6 zigzag teeth at −1.05;
  - eyes: ellipses 0.22 × 0.15 at (±0.35, −0.75) with pupils `#FFE7A8` r 0.05;
  - trapezoid nose;
  - mouth: rect at y −0.25, 1.0 × 0.22, with 4 cream teeth `#F3E6C8`.
- **Ceramic highlight:** a white α 0.35 vertical ellipse at (−0.6, −0.5), 0.10 × 0.55.
- **Top:**
  - foam dome, ellipse rx 0.86 ry 0.3 at −1.45 plus a bulge of 0.18, `#FFF6E0` shaded `#F2E2BF`, overflowing the lip by 0.05;
  - 6 cinnamon dots `#C88A4A`.
- **Garnish:**
  - pineapple wedge at (0.65, −1.6): `#FFD54A`, rind `#D9A21B` with crosshatch, 3 spiky leaves `#3FA34D`;
  - **paper umbrella:** fan canopy of radius 0.7 tilted 20°, centred (−0.35, −2.25), 6 panels alternating `#FF6FA8` / `#FFD1E3`, white ribs α 0.6, scalloped edge, stick `#F5E6C8` into the foam;
  - `cherry` r 0.14 at (0.2, −1.75).
- **Particles:** pineapple chunks and cream dots.

**T8 Coconut Cocktail** (key `#9B5DE5`)
- **Shell:**
  - a half coconut: rim ellipse at −0.6 (rx 0.95, ry 0.34), with a rounded lower half to +0.45;
  - radial gradient `#A87444` → `#7A4A22` → `#4A2C12`;
  - 20 curved fibre strokes `#3A220C` α 0.5;
  - outline `#3A220C` 0.06.
- **Rim:** cut rim ring `#5A3518` 0.05 plus meat ring `#FFF8EC` 0.08.
- **Drink:** a violet butterfly-pea colada: surface radial `#C9A6FF` → `#7B3FD1`, a ripple ellipse `#D9C2FF`, and 3 ice bits. (Purple separates T8 from T7's teal, T3's pink and T9's jade.)
- **Garnish:**
  - 2 bendy `straw`s to y −1.9 (yellow `#FFD23F` and pink `#FF5C8A`, white stripes, 30° bend at 70%);
  - **hibiscus** at (−0.55, −0.8): 5 petals r 0.30, radial `#FF6F91` → `#E0245E`, centre `#B3123E`, stamen `#FFD23F` with 4 dots;
  - **frangipani** at (0.5, −0.75): 5 white petals r 0.2 with centre `#FFE27A`;
  - a `leaf` `#3E9B3A` behind them.
- **Baked glow.**
- **Particles:** petals `#FF3D6E` / `#FFFFFF` and violet droplets `#9B5DE5`.

**T9 Sangria Verde** (key verde `#0F8A5F`, accent verde-gold `#FFD23F`): a big jug of white/green sangria, green for Reem and yellow for the owner.
- **Body:** glass pitcher.
  - Bottom 0.78 at +0.45, belly 0.95 at −0.4, neck 0.78 at −1.55, rim flare 0.84 at −1.75.
  - Spout lip to (−0.95, −1.8).
  - **Outline** (right side; the left side mirrors it except at the top), three quadratics: bottom (0.78, +0.45) → belly (0.95, −0.4) with control point (0.95, +0.15); belly → neck (0.78, −1.55) with control point (0.95, −1.0); neck → rim (0.84, −1.75) with control point (0.78, −1.68). On the left, the last segment runs from (−0.78, −1.55) to the spout lip (−0.95, −1.8) with control point (−0.80, −1.72). The belly is smooth (both of its controls lie on x = ±0.95); the slight crease at the neck, where the flare starts, is intended.
  - Half-widths that follow from the belly → neck quadratic (x = 0.95 − 0.17·u², y = −0.4 − 1.2·u + 0.05·u², u ∈ [0, 1]): 0.84 at −1.32 and −1.35, 0.82 at −1.40, 0.81 at −1.45, 0.80 at −1.48.
- **Handle:** C-shaped: a quadratic from (0.85, −1.4) to (0.85, −0.2) with control point (1.71, −0.8), so it peaks at x = 1.28 (y −0.8). Glass-tinted stroke 0.14 with glass-edge / glass-outline outlines (as in 4.2 step 5) and a **yellow highlight** along its outer curve (`#FFE45C`, width 0.04, α 0.9; 0.07 in icon mode, 3.4): the same quadratic offset outward, from (0.89, −1.38) to (0.89, −0.22) with control point (1.75, −0.8), round caps. It is art only.
- **Ribbon:** a yellow satin ribbon tied around the neck at y −1.40: width 0.10 (0.16 in icon mode), fill `#FFD23F`, folds and edges `#D9A400`, a sheen line `#FFF0A0` along its centre (rx 0.82 at −1.40). It is the band between two **front half-ellipses** (ry = K_RIM·rx, centred on x = 0) that follow the outline: the upper edge at y −1.45 (rx 0.81) and the lower edge at −1.35 (rx 0.84); in icon mode −1.48 (rx 0.80) and −1.32 (rx 0.84). The back half is never drawn. A bow at (0.30, −1.40): two loops 0.22 × 0.14 at ±35°, a knot r 0.06, and two tails curving down to (0.18, −1.00) and (0.48, −1.05) with V-notched ends.
- **Draw order of the T9 extras:** all in 4.2 step 8 (front garnish), after the rim lemon wheel and the mint sprig: the handle stroke and outlines, then the handle's yellow highlight, then the ribbon band with its folds and sheen, then the bow (loops, knot, tails) last. The lime wedge behind the lemon is step 1.
- **Liquid:** fresh green: `#B5EE8A` (top) → `#3DBE6E` → `#0F8A5F` (bottom), fill −1.35, surface `#D4F7B0` with 2 floating mint leaves.
- **Contents** (α 0.9, under a 15% liquid-colour wash, light enough that the lemons stay yellow):
  - 3 lemon wheels r 0.32 (lemon palette; the main yellow inside the jug);
  - 2 lime wheels r 0.28 (lime palette);
  - 3 green-apple cubes `#F4F8D0` with skin `#7CC242`;
  - 4 green grapes (`#C9E86B` with shade `#8DBF3A`, r 0.08, white highlight dot);
  - 3 ice cubes.
- **Garnish:** lemon wheel upright on the rim at (0.55, −1.95), r 0.32; a lime wedge r 0.24 behind it at (0.80, −1.80); mint sprig of 3 leaves at (−0.2, −2.0).
- **Glass highlights:** a strong band at x −0.78..−0.60 (α 0.6) and a belly reflection arc (α 0.5).
- **Extras:**
  - baked glow in yellow-gold (4.2);
  - **live:** the yellow-gold jug aura and 2 sparkles (3.8);
  - particles are green-and-yellow fruit confetti: lemon wedges `#FFE45C`, lime wedges `#A6DB4F`, green grapes `#C9E86B`, mint leaves `#2E9E4F`.

**Optional tier numbers** (Pause toggle, persisted): a cream disc `#FFF3D6` with a 1.5 px `#7A4A22` outline and a bold `#7A4A22` digit, drawn live (not baked) at anchor offset (0.6, −0.25)·Rpx. Disc diameter `max(18 px, 0.7·Rpx)`, digit `max(13 px, 0.5·disc)`.

**Particle shapes per tier:** as listed above. Shapes are drawn as small paths: squares, circles, leaf ellipses, petal teardrops, wedges. All share one 256-particle pool, and the oldest particle is recycled.

**Optional PNG override** (`src/art/overrides.js`). The procedural painters above are the default and the only art that ships. If the owner later drops pictures into `assets/tier-1.png` … `assets/tier-9.png` (any subset), the game uses them instead:
- **Loading.** At BOOT, for each t: `var img = new Image(); img.onload = …; img.onerror = …; img.src = 'assets/tier-' + t + '.png'` (relative URL). This is an image load, not `fetch` or XHR, so it works from `file://`, http and https. BOOT waits until all 9 have settled (load or error) or 1500 ms have passed, whichever comes first. An image that has not settled by that deadline is ignored for the rest of the session: its `onload` after the deadline is a no-op, so a tier never changes its art, bounds, strip icon or NEXT icon mid-run. A tier whose image fails (missing file, S3 403/404, or `naturalWidth === 0`) keeps its procedural painter.
- **Standing on the same footprint.** The picture shows the drink upright on a transparent background, centred, with the bottom of the glass on the image's bottom edge. In R-units it is drawn `2.0` wide (the collider diameter) and `2.0·naturalHeight/naturalWidth` tall, scaled down uniformly if that exceeds 3.6. Its bottom-centre sits at anchor (0, +0.40), the front of a procedural base ellipse, so it stands on the contact shadow exactly like the procedural glass. That tier's sprite bounds become the image rect (+0.2 padding for the T8/T9 glow), recorded in the Sprite's `ax, ay, w, h` (5.5).
- **Everything else is unchanged.** Shadow, caustic, rings and the danger rule use the footprint; the white and red silhouettes (`source-in` works on images) and the baked glow are built from the override like any sprite. The strip icons, NEXT, the collection and the toast are painted by `paintIcon` from the same painter or override image (icon mode, 3.4; the icon fit uses the Sprite's `w`/`h`, not the 4.2 table); the win card uses the cached in-world sprite; the contact sheet uses both paths, as the game does.
- **No pixel read-back.** Images loaded from `file://` taint canvases in Chrome and Firefox. Drawing is unaffected, but `getImageData`, `toDataURL` and `toBlob` would throw, so no code ever reads pixels back from a sprite canvas.
- **Owner guidance** (repeated in `docs/HOW-TO-CHANGE.md`): PNG with alpha, at most 1024 px on the longer side (iOS canvas memory), the glass body filling about 95% of the image width.

### 4.4 Table

- **Frame.**
  - Shape: the outer polygon is the projection of (−5, −5) … (105, 165); the inner polygon is the play area.
  - Top face `#D6A465`, 2 px inner bevel `#A8743F`, 1 px outer highlight `#ECC487`.
  - 6 grain lines per side (`#B98146` α 0.4) and mitred corners with a darker seam.
- **Apron:**
  - from the near outer edge down 6·kX px;
  - gradient `#9A5E2C → #6E3F1A`, a top highlight `#ECC487`, grain lines;
  - two legs (dark wood rects, 8%·S wide) peeking below on wide stages.
- **Surface (glass over sand).**
  - Fill gradient `#F1DDB0` (far) → `#E9CF98` (near).
  - 18 ripple curves `#D7B67A` α 0.15.
  - Under the glass at α 0.5: 6 shells, 2 starfish `#F7A35C`, 10 pebbles. Their positions are stored in sim space (seed 7), so they foreshorten.
  - Two diagonal sheen bands (white α 0 → 0.12 → 0; widths 40% and 14% of the table) from the upper left.
  - An inner frame shadow (2 u, `rgba(0,0,0,0.13) → 0`).
  - A faint cyan inner edge `rgba(159,227,230,0.5)` at 1.5 px.
- **Launch zone** (y DANGER_Y..160): tint `rgba(120,80,30,0.06)`.
- **Danger line** (y = DANGER_Y): dashes 3 u, gaps 2 u (in projected x), width max(2 px, 0.6·vScale(DANGER_Y)), round caps, drawn live by level (3.8) with `CM.art.paintDangerLine` (`src/art/scenery.js`), so the renderer and the contact sheet share the code.
- **Through the launcher.** Glasses are transparent, so after the body pass the dashed line is drawn a second time at α 0.5, clipped to the launcher sprite's bounding rect. The player's own unlaunched glass therefore never looks "over the line": the line visibly runs behind it, and its footprint (shadow) sits clearly below the line (test 53).
- **Caching:** frame, surface and apron are pre-rendered to an offscreen canvas per layout.

### 4.5 Background and roof

**Background** (static canvas per layout, full canvas width plus an overdraw margin `mg = ceil(12·uiK)` px on every side, drawn at (−mg, −mg) so shake never exposes an edge; live parts are listed in 3.8)
- **Sky:**
  - gradient from the top down to 60% of farY;
  - 3 clouds (each a cluster of 4 white circles, α 0.8, r 18-34 px·k), drifting live.
- **Sea:**
  - band from 60% of farY to 85% of farY, gradient sea-shallow (top) → sea-deep;
  - foam line live.
- **Sand:**
  - below the sea, with 400 seeded speckles (1-2 px, sand-dark / sand-light);
  - foreground with 2 starfish and 3 shells under the strip.
- **Palms:** bases at (8% S, 0.9·farY) and (92% S, 0.85·farY), height 22% H.
  - Curved trunk with 9 rings; 7 fronds of 10 notches each; 3 coconuts `#6B4423`.
  - When the canvas is wider than the stage, add 1 extra palm per side at ±0.3 S outside the stage.
- **Benches:** plank rectangles `#C58A4E` with gaps `#8C5426` at the stage edges (and beyond), 35-80% H.

**Roof layer** (drawn after the glasses, before floaters; cached static part plus live bulbs)
- Band 0-6% H, `#C9A15A`, with 140 seeded straw strokes (2 px, lengths 20-40 px·k, ±6°, thatch-dark / thatch-light α 0.6).
- Jagged hem: 36 teeth, depth 6-14 px·k, down to 7.5% H.
- Beam `#7A4A22` at 5.5-6.5% H.
- **String lights:**
  - a catenary of twine (`#8B6B3E`, 2 px) per stage width, from (0, 7.5% H) through (S/2, 10.5% H) to (S, 7.5% H), repeated across the canvas;
  - 9 bulbs per span: ellipse 5×7 px·k `#FFE08A` with a radial glow r 14 px·k (bulb-glow → 0), twinkling.

### 4.6 Shadows and caustics

All of these are drawn in one pass before any glass, and all use the body's exact footprint `fp = footprint(lay, x, y, r)` (3.2). The contact shadow and the caustic are painted by `CM.art.paintShadow(ctx, fp, tier)` (`src/art/scenery.js`), which the render shadow pass (5.10) and the contact sheet (6.2) both call.

- **Contact shadow = the footprint.** A pre-rendered radial sprite stretched to the ellipse (fp.X, fp.Y, fp.rx, fp.ry): `rgba(60,35,10,0.30)` at the centre → `rgba(60,35,10,0.24)` at 0.75 → 0 at 1.0. Its visible lower edge is at `Y(y + r)`, the exact edge the danger rule tests, so "the shadow crosses the dashed line" means "over the line".
- **Coloured caustic:** an ellipse in the tier key colour at α 0.16, centred at (fp.X − 0.15·fp.rx, fp.Y + 0.10·fp.ry), with radii 0.7·fp.rx and 0.7·fp.ry (light from the far upper left).
- **Jug aura:** 3.8.

---

## 5. Architecture

### 5.1 Files

**Code organisation rule (owner requirement).** Many small, readable files, one feature each, rather than a few large ones. Every source file stays under about **400 lines** (target 50-300). When a file grows past that, it is split by feature before more code goes in; the planned next splits are `src/art/scenery.js` → `background.js`, `table.js`, `roof.js`, and `src/ui/overlays.js` → `title.js`, `menus.js`. The split never changes a public API (5.5): several files add their parts to one namespace.

```
index.html                    DOM shell: canvas, #input layer, HUD, strip, overlays, title tag; 3 <link> stylesheets;
                              ordered <script src>; inline boot guard
src/dedication.js             the ONLY file a non-developer edits: the dedication text (5.2)
src/style/base.css            tokens, reset, iOS-first rules (3.10), safe areas, reduced motion, focus-visible
src/style/hud.css             coin pill, BEST line, Pause/Mute, NEXT box, tier strip
src/style/overlays.css        cards, buttons, title (tag swing, ribbon, logo), toasts, ROTATE, OOPS
src/config.js                 PURE  constants, modes, tiers; DEDICATION with fallback
src/physics.js                PURE  bodies, integrate, PBD solve, wall clamp, restitution, impact filter
src/projection.js             PURE  layout solve (stage, table, HUD rects, strip) + sim<->screen mapping
src/game/spawn.js             PURE  rngNext, pickWeighted, drawSpawn (2.7)
src/game/merge.js             PURE  isMergeEligible, resolveMerges, multiplier, pointsFor, win, jug burst (2.6, 2.9, 2.10)
src/game/danger.js            PURE  updateDanger (2.8)
src/game/aim.js               PURE  firstHit, botAim
src/game/state.js             PURE  snapshot, restoreGame, hash
src/game/save.js              PURE  normalizeSave, mergeSave (2.11, 5.9)
src/game/chime.js             PURE  chimeFreqs (3.9)
src/game/game.js              PURE  createGame, aim/launch, tick (5.6), continueAfterWin, debugAddBody; assembles CM.game
src/art/glass.js              shared glass recipe (4.2 steps), anchor transform, sprite bounds table
src/art/garnish.js            helpers: citrusWheel, citrusWedge, leaf, cherry, straw, iceCube, bubbles; fruit palettes
src/art/tier1-shot.js         one painter per tier (4.3), registered as CM.art.tiers[t]:
src/art/tier2-oldfashioned.js   tier1-shot, tier2-oldfashioned, tier3-cosmo, tier4-margarita, tier5-mojito,
src/art/…                       tier6-sunrise, tier7-pinacolada, tier8-coconut, tier9-sangria-verde
src/art/tier9-sangria-verde.js
src/art/coin.js               paintCoin
src/art/scenery.js            background, table, roof, paintShadow, paintDangerLine (4.4, 4.5, 4.6)
src/art/overrides.js          optional assets/tier-N.png loader (4.3)
src/art/sprites.js            paintTier dispatch (override or painter), buildSprites, silhouettes, baked glow, paintIcon
src/render/fx.js              easings, FX system (3.8): particles, rings, rays, floaters, confetti, shake, zoom
src/render/frame.js           init/resize/draw: render pipeline (5.10), aim guide, debug overlay
src/audio/engine.js           AudioContext, graph, unlock (3.9, 3.10), mute, ambience, voice limits
src/audio/sounds.js           sound recipes (3.9 table), consume(events), haptics
src/ui/storage.js             localStorage wrapper (5.9)
src/ui/input.js               pointer (+ touch/mouse fallback) and keyboard, intents, input guard (3.6, 3.10)
src/ui/hud.js                 coin pill, BEST / NEW BEST, Pause/Mute, NEXT box, tier strip; setHud, consume
src/ui/overlays.js            title (tag, buttons, stats, how-to), Pause, Win, Over, ROTATE, OOPS, toasts, armed confirm
src/app/loop.js               fixed-step loop, time scale, applyIntents, guard()/fail() (5.8)
src/app/dispatch.js           event routing and save writes (5.7)
src/app/attract.js            attract-mode game (3.5)
src/app/states.js             app state machine, win/lose sequences, newGame, continueRun (5.7)
src/main.js                   boot, viewport measuring and resize wiring (3.1, 3.10); defines CM.main
assets/tier-1.png … tier-9.png   OPTIONAL owner art (4.3); the folder does not ship
tests/run.js                  zero-dependency runner; loads tests/*.test.js
tests/helpers.js              newGame, stepN, place, assertions
tests/physics.test.js, game.test.js, spawn.test.js, projection.test.js, purity.test.js
tests/tune.js                 tuning-gate script (not a test): bots × modes × 400 seeds, Wilson CIs (8, step 2)
tests/browser/chrome.js       finds the system Chrome for playwright-core (channel 'chrome', or env CHROME_PATH)
tests/browser/run.js          OPTIONAL smoke test (never needed to play)
tests/browser/contact-sheet.html   harness page: loads src/ by relative paths and lays out the sheet
tests/browser/contact-sheet.js     writes docs/preview/cocktails.png and docs/preview/cocktails-small.png (6.2)
docs/DESIGN.md                this document
docs/ARCHITECTURE.md          file map, namespaces, data flow, frame loop
docs/HOW-TO-CHANGE.md         dedication, colours, difficulty knobs, PNG overrides, adding a painter, tests, contact sheet
docs/DEPLOY.md                the S3 steps of 5.12 in full, with commands
docs/preview/                 contact-sheet output
```

`docs/ARCHITECTURE.md`, `docs/HOW-TO-CHANGE.md` and `docs/DEPLOY.md` are deliverables, **written after implementation from the real code** (8, step 9), not from this document.

**Stylesheet order:** `src/style/base.css`, `hud.css`, `overlays.css`.

**Script order** in `index.html` (end of `<body>`, no `defer`, no `type="module"`), then the inline boot guard:
1. `dedication`, `config`, `physics`, `projection`;
2. `game/spawn`, `game/merge`, `game/danger`, `game/aim`, `game/state`, `game/save`, `game/chime`, `game/game`;
3. `art/glass`, `art/garnish`, `art/tier1-shot` … `art/tier9-sangria-verde`, `art/coin`, `art/scenery`, `art/overrides`, `art/sprites`;
4. `render/fx`, `render/frame`;
5. `audio/engine`, `audio/sounds`;
6. `ui/storage`, `ui/input`, `ui/hud`, `ui/overlays`;
7. `app/loop`, `app/dispatch`, `app/attract`, `app/states`, `main`.

Every path is relative (`src/...`, never `/src/...`), so the same files work from `file://`, from a sub-folder and from an S3 bucket root.

**Forbidden:** `fetch`, XHR, workers and service workers, ES modules, web fonts, remote URLs of any kind. The only resource loads are the local `<link>` stylesheets and `<script src>` files above, and `new Image()` (or `<img>`) for **one purpose only**: the optional `assets/tier-N.png` overrides (4.3).

**`package.json`** already declares `"test": "node tests/run.js"` and `playwright-core` as a **dev-only** dependency for the optional browser scripts; revision 3 adds `"preview": "node tests/browser/contact-sheet.js"`. The game has zero runtime dependencies.

### 5.2 Module pattern, dedication and boot guard

Pure files use this pattern. The root is `globalThis` where it exists and the top-level `this` otherwise (the global object in a classic script), so the word `window` never appears in pure files:

```js
// src/game/merge.js (a part of CM.game)
(function (root, factory) {
  'use strict';
  var isNode = typeof module === 'object' && module && module.exports;
  var deps = isNode
    ? { config: require('../config.js'), physics: require('../physics.js') }
    : { config: root.CM.config, physics: root.CM.physics };
  var api = factory(deps);
  if (isNode) module.exports = api;
  else { root.CM = root.CM || {}; root.CM.gameParts = root.CM.gameParts || {}; root.CM.gameParts.merge = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (deps) {
  'use strict';
  /* @pure-begin */
  // ... implementation ...
  /* @pure-end */
  return { isMergeEligible: isMergeEligible, resolveMerges: resolveMerges /* , ... */ };
});
```

- Each pure file requires only what it needs, by relative path: physics and projection need config; the `src/game/` parts need config and, where they create or read bodies (merge, state), physics; `game/game.js` needs config, physics and every part.
- **Assembling a namespace.** The parts of `CM.game` register under `CM.gameParts.<name>`; `src/game/game.js` (browser) or its `require`s (Node) collect them and export `CM.game` with exactly the API of 5.5. Tests `require('../src/game/game.js')` and see the same API as before the split.
- Browser-only files use the simpler form `(function (root) { var CM = root.CM; var art = CM.art = CM.art || {}; ... })(typeof globalThis !== 'undefined' ? globalThis : this);` and may use any DOM API. Each adds its own functions to the shared namespace object (`CM.art`, `CM.render`, `CM.audio`, `CM.ui`, `CM.app`) and never replaces it.
- **Tier painters.** Each `src/art/tierN-*.js` first does `art.tiers = art.tiers || {};` and then sets `art.tiers[N] = { key, paint(ctx, h, opts), particles: [...] }`, so no file has to create `CM.art.tiers` before it. `glass.js` sets `CM.art.glass` (the step helpers, the anchor transform and the `TOPA` bounds table) and `garnish.js` sets `CM.art.garnish` (the 4.2 helpers and fruit palettes); `h` holds both and `opts.icon` selects the icon-mode widths (3.4). `sprites.js` calls the override image if one loaded (4.3), otherwise this painter.
- **Load-time and call-time references (normative).** A file may read another file's functions at load time (for example `var tick = CM.game.tick;` at the top of its IIFE) only if that file appears **earlier** in the script order (5.1). References to files that load later are resolved at call time, written in full as `CM.ui.toast(...)`, `CM.app.dispatch(...)` or `CM.app.ctx.state`, and are never cached in a load-time variable. The backward references in the current file list are: `ui/hud.js` → `CM.ui.toast` (overlays.js); `app/loop.js` → `CM.app.dispatch` (dispatch.js), `CM.app.attract.step` (attract.js) and `CM.app.simulating` (states.js); `app/dispatch.js` → `CM.app.setState` and the sequence handlers (states.js). App state lives only in `CM.app.ctx` (5.5), which `app/loop.js`, the first app file, creates.

**`src/dedication.js`** (the whole file):

```js
// EDIT THE TEXT BETWEEN THE TWO BACKTICKS ( ` ) BELOW. Press Enter for a new line (max 3 lines).
// Quotes ' " and backslashes \ are fine. Do not type a backtick ` or the pair ${ inside the text.
// The two lines below are a placeholder: change them to your own words, or keep them.
var CM_DEDICATION = String.raw`For Reem, with love.
Cheers to sunny days together!`;
```

- The shipped text is exactly the 2-line placeholder above ("For Reem, with love." / "Cheers to sunny days together!"); the owner edits it. This file stays the only one a non-developer touches, and `docs/HOW-TO-CHANGE.md` explains it first.

- `String.raw` keeps every character literally (no escape sequences), so quotes, apostrophes and backslashes cannot break it.
- It is a separate classic script, so even a syntax error in it cannot stop the other scripts: the game boots with the fallback text.

**`config.js`** reads it defensively:

```js
DEDICATION: (typeof CM_DEDICATION === 'string' && CM_DEDICATION.trim()) ? CM_DEDICATION.trim() : 'For you, with love.',
```

The whole config object is deep-frozen with a recursive `Object.freeze`.

**Boot guard** (inline, last in `index.html`). Namespaces are assembled from many files, so the existence of a namespace object proves nothing about its files. The guard therefore checks **one sentinel per source file**, as a list of `[path, test]` pairs:

```js
function f(x) { return typeof x === 'function'; }
var CHECKS = [
  ['src/config.js',        function () { return !!CM.config.TIERS; }],
  ['src/physics.js',       function () { return f(CM.physics.stepWorld); }],
  ['src/projection.js',    function () { return f(CM.projection.computeLayout); }],
  ['src/game/spawn.js',    function () { return !!CM.gameParts.spawn; }],
  ['src/game/merge.js',    function () { return !!CM.gameParts.merge; }],
  ['src/game/danger.js',   function () { return !!CM.gameParts.danger; }],
  ['src/game/aim.js',      function () { return !!CM.gameParts.aim; }],
  ['src/game/state.js',    function () { return !!CM.gameParts.state; }],
  ['src/game/save.js',     function () { return !!CM.gameParts.save; }],
  ['src/game/chime.js',    function () { return !!CM.gameParts.chime; }],
  ['src/game/game.js',     function () { return f(CM.game.tick); }],
  ['src/art/glass.js',     function () { return !!CM.art.glass; }],
  ['src/art/garnish.js',   function () { return f(CM.art.garnish.citrusWheel); }],
  ['src/art/coin.js',      function () { return f(CM.art.paintCoin); }],
  ['src/art/scenery.js',   function () { return f(CM.art.paintTable) && f(CM.art.paintShadow); }],
  ['src/art/overrides.js', function () { return f(CM.art.loadOverrides); }],
  ['src/art/sprites.js',   function () { return f(CM.art.paintTier) && f(CM.art.buildSprites); }],
  ['src/render/fx.js',     function () { return f(CM.render.fx.consume); }],
  ['src/render/frame.js',  function () { return f(CM.render.draw); }],
  ['src/audio/engine.js',  function () { return f(CM.audio.init); }],
  ['src/audio/sounds.js',  function () { return f(CM.audio.consume); }],
  ['src/ui/storage.js',    function () { return f(CM.ui.storage.load); }],
  ['src/ui/input.js',      function () { return f(CM.ui.input.attach); }],
  ['src/ui/hud.js',        function () { return f(CM.ui.setHud); }],
  ['src/ui/overlays.js',   function () { return f(CM.ui.showOverlay); }],
  ['src/app/loop.js',      function () { return !!CM.app.ctx && f(CM.app.frame); }],
  ['src/app/dispatch.js',  function () { return f(CM.app.dispatch); }],
  ['src/app/attract.js',   function () { return f(CM.app.attract.step); }],
  ['src/app/states.js',    function () { return f(CM.app.setState); }],
  ['src/main.js',          function () { return f(CM.main.boot); }]
];
['shot', 'oldfashioned', 'cosmo', 'margarita', 'mojito', 'sunrise', 'pinacolada', 'coconut', 'sangria-verde']
  .forEach(function (name, i) {
    CHECKS.push(['src/art/tier' + (i + 1) + '-' + name + '.js', function () { return f(CM.art.tiers[i + 1].paint); }]);
  });
```

- Every test runs in its own try/catch (a throw counts as a failure, so a missing `window.CM` fails them all). `src/dedication.js` is deliberately not listed: its failure falls back (5.2 above).
- If any test fails, the guard replaces the body with a readable cream card: "The game could not start. If you just edited src/dedication.js, check that the text is between two backticks. If you just uploaded the game, check that the whole src/ folder was uploaded.", followed by "Missing or broken:" and every failing path, one per line (set with `textContent`).
- A new source file adds its line here in the same change. The list is complete from the first playable build on (8, step 3, ships stubs).

If `CM_DEDICATION` is not a string but the game started, `main` logs a console warning and the title shows the fallback text.

### 5.3 Config (shape and values)

```js
{
  GAME_TITLE: 'Cocktail Merge', GAME_SUBTITLE: 'Beach Bar', DEDICATION: /* 5.2 */,
  DEDICATION_FALLBACK: 'For you, with love.',
  STORAGE_KEY: 'cocktailMerge.v1', RUN_KEY: 'cocktailMerge.v1.run', RULES_VERSION: 2,
  TABLE: { W: 100, L: 160, DANGER_Y: 130, LAUNCH_Y: 144, FRAME: 5 },
  PHYS: { DT: 1/240, ITER: 10, PULL: 120, DRAG: 0.8, FRICTION: 20, VMAX: 260, V0: 150,
          E_GLASS: 0.22, E_WALL: 0.30, REST_V: 18, TAN_DAMP: 0.10, MAX_CORR: 0.5,
          IMPACT_V: 18, IMPACT_NEW_TICKS: 12, CONTACT_POOL: 2048, MAX_ID: 1048576 },
  RULES: { TOUCH_EPS: 0.5, MERGE_IMMUNE_TICKS: 24, GROW_TICKS: 29, MERGE_VEL_KEEP: 0.5,
           SHOVE_V: 40, SHOVE_PAD: 6, CHAIN_WINDOW_TICKS: 240, COOLDOWN_TICKS: 96, BUFFER_TICKS: 36,
           GRACE_TICKS: 600, DECAY: 2, ELIGIBLE_AGE_TICKS: 288, THREAT_DIST: 5, THREAT_HOLD_TICKS: 120,
           DANGER_TICK_EVERY: 120, WIN_SUSPEND_TICKS: 720,
           WIN_BONUS: 1000, JUG_BURST: 1000, MULT_STEP: 0.5, MULT_MAX: 4, RADIUS_SCALE: 1 },
  MODES: { standard: {},
           relaxed:  { DANGER_Y: 133, GRACE_TICKS: 960, RADIUS_SCALE: 0.91 } },   // RADIUS_SCALE set by the gate (Appendix 9)
  SPAWN: { OPENING: 2, WEIGHTS: [0, 40, 30, 20, 10], MIN_CAP: 2, MAX_TIER: 4, T1_DROUGHT: 7, MAX_REPEAT: 3, HISTORY: 8 },
  TIERS: [null, { id: 1, key: 'shot', name: 'Tequila Shot', radius: 6.0, points: 0, color: '#F5C542' }, /* ... per 2.5 ... */
          { id: 9, key: 'sangria', name: 'Sangria Verde', radius: 22.0, points: 360, color: '#0F8A5F', accent: '#FFD23F' } ],
  VIEW: { S_FAR: 0.72, TABLE_FILL: 0.96, C_NEAR_MIN: 0.85, C_NEAR_MAX: 0.98, STAGE_ASPECT: 0.62,
          FAR_MIN_FRAC: 0.27, HEADROOM: 0.12, PORTRAIT_BLOCK_VH: 500, DPR_MAX: 2, K_BASE: 0.55, K_RIM: 0.42 },
  FX: { /* every number from 3.8 */ },
  AUDIO: { MASTER: 0.9, AMBIENCE: 0.12, MAX_VOICES: 12, CLINKS_PER_SEC: 12, CLINK_F0: 2600, CLINK_LOWPASS: 7000,
           SCALE: [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50, 1174.66, 1318.51, 1567.98,
                   1760.00, 2093.00, 2349.32, 2637.02, 2793.83, 3135.96] },
  APP: { INPUT_GUARD_MS: 250, RUN_SAVE_EVERY_MS: 10000, ATTRACT_RESET_TICKS: 43200, ARM_MS: 2000 }
}
```

**Difficulty knobs:** the `MODES.relaxed` entry, set by the tuning gate (8, step 2). The guard `DANGER_Y ≤ LAUNCH_Y − R[4] − 0.4` holds in both modes and is asserted in test 47.

### 5.4 Data model

```ts
interface Body {
  id: number; tier: number;          // id < 2^20
  x: number; y: number; px: number; py: number; vx: number; vy: number;   // px,py = position at the end of the previous tick
  r: number; r0: number; rTarget: number; growTick: number; invM: number;
  age: number;            // ticks since birth
  cleared: boolean; launched: boolean;
  bornTick: number;       // tick of merge birth; -1 if launched
  chainDepth: number;     // 0 if launched
  wallSeen: number[];     // 4 entries, indexed by wall k; last tick touching that wall
}
type Phase = 'ready' | 'cooldown' | 'over';
interface GameState {
  seed: number; rng: number; tick: number; mode: 'standard' | 'relaxed';
  world: { seen: Map<number, number>; pool: Contact[]; nContacts: number; poolGrowths: number };
  bodies: Body[]; nextId: number;
  aimX: number; current: number; next: number; spawnHistory: number[]; spawnCount: number;
  phase: Phase; cooldown: number; launchPending: boolean;
  score: number; highestTier: number; runMask: number; launches: number; merges: number;
  dangerTicks: number; dangerTickEmitted: number; threatTicks: number;
  dangerLevel: 0|1|2; overIds: number[]; dangerSuspendUntil: number;
  wonOnce: boolean;
  rules: object;          // resolved config + mode + overrides
}
type GameEvent =
  | { type: 'launch'; id: number; tier: number; x: number }
  | { type: 'launchBlocked'; blockerId: number }
  | { type: 'next'; current: number; next: number }
  | { type: 'impact'; a: number; b: number | null; wall: -1|0|1|2|3; x: number; y: number; vn: number;
      tierA: number; tierB: number; growing: boolean }
  | { type: 'merge'; a: number; b: number; id: number; tier: number; x: number; y: number;
      ax: number; ay: number; bx: number; by: number; depth: number; points: number }
  | { type: 'discover'; tier: number }
  | { type: 'win'; id: number; points: number }
  | { type: 'jugBurst'; a: number; b: number; x: number; y: number; depth: number; points: number }
  | { type: 'danger'; level: 0|1|2 }
  | { type: 'dangerTick'; n: number }
  | { type: 'lose'; ids: number[] };
interface Save { v: 1; best: number; bestTier: number; muted: boolean; ambience: boolean; showNumbers: boolean;
                 relaxed: boolean; wins: number; discovered: number /* bitmask, bit t-1 */ }
interface RunRecord { v: 1; rulesVersion: 2; game: Snapshot; meta: { bestAtRunStart: number; newBestShown: boolean } }
```

`Snapshot` is a plain JSON object holding every `GameState` field except `rules` (rebuilt from `mode`) and with `world.seen` as an array of `[key, tick]` pairs; contact records are not stored (they are rebuilt every tick).

### 5.5 Public APIs (exact signatures)

Each namespace below may be assembled from several files (5.1, 5.2); the split never changes what callers see. The file that owns each part is given in brackets where a namespace spans files.

**`CM.physics`**
- `makeBody(id, tier, x, y, vx, vy, r, r0?) → Body`. Throws if `id ≥ 2²⁰`. Sets `px = x, py = y`, `wallSeen = [−1e9 ×4]`. If `r0` is given, the body grows from `r0` to `r`; otherwise it starts at `r` with `growTick = GROW_TICKS`.
- `massOf(r) → number`
- `createWorld(rules) → World` (pool pre-allocated)
- `stepWorld(world, bodies, tick, events, rules) → void` (2.4)
- `pairKey(i, j) → number`

**`CM.game`** (assembled in `src/game/game.js` from the parts in `src/game/`)
- `createGame(seed, overrides?) → GameState`.
  - `overrides` may set `mode`, any `RULES`/`PHYS`/`TABLE` key, plus `mergeEnabled: boolean` and `spawnScript: number[]` (for tests).
  - Calls `drawSpawn` twice; sets `runMask = 1`, `highestTier = 1`, `dangerTickEmitted = −1`.
- `restoreGame(snapshot) → GameState | null`. Returns null if `rulesVersion` differs or any field is missing or non-finite.
- `snapshot(g) → Snapshot`
- `rngNext(g) → number`
- `pickWeighted(w /* 5 entries */, u) → tier`
- `drawSpawn(g) → tier`
- `aimBounds(g) → {min, max}`
- `setAim(g, x) → void` (clamps)
- `nudgeAim(g, dx) → void`
- `requestLaunch(g, mode?: 'pointer' | 'key') → 'queued' | 'buffered' | 'rejected'`
- `cancelLaunch(g) → void`
- `tick(g) → GameEvent[]`: exactly one fixed step; returns a fresh array; `[]` if `phase === 'over'`.
- `continueAfterWin(g) → void`
- `isMergeEligible(g, a, b) → boolean` (2.6; tier/age/win rules, not distance)
- `multiplier(depth) → number`
- `pointsFor(tier, depth) → number`
- `firstHit(g, x, r) → { y, id, tier, age, launched, blocked }`.
  - Sweeps a circle of radius r from (x, LAUNCH_Y) toward y = 0, ignoring bodies whose centre y ≥ LAUNCH_Y.
  - If the start circle already overlaps a body: `{y: LAUNCH_Y, id, tier, age, launched, blocked: true}`.
  - Far wall: `id = 0`, `tier = 0`, `y = r`.
- `botAim(g, u) → number`. Scans x from r to 100 − r in 1-u steps.
  - If the first hit is the current tier (and not blocked): score `1000 + 0.1·yHit`.
  - If blocked: score −1e9.
  - Otherwise: score `−yHit`.
  - Takes the best x, adds `(u − 0.5)·4` (smart bot; the tuning script uses ·12 for the sloppy bot), and clamps.
- `debugAddBody(g, tier, x, y, vx?, vy?, opts?) → Body`. `opts`: `{ age = 0, cleared = false, bornTick = 0, chainDepth = 0, launched = false }`; `launched: true` forces `bornTick = −1`, `chainDepth = 0`.
- `hash(g) → string`: FNV-1a 32-bit, 8 hex characters, over, in this order: `tick, score, rng, mode (0/1), phase (0/1/2), cooldown, launchPending (0/1), current, next, round(aimX·1e3), spawnCount, spawnHistory (length then entries), highestTier, runMask, dangerTicks, dangerTickEmitted, threatTicks, dangerSuspendUntil, wonOnce (0/1), nextId`, then per body in id order `id, tier, round(x·1e3), round(y·1e3), round(vx·1e3), round(vy·1e3), round(r·1e3), age, bornTick, chainDepth, cleared (0/1)`.
- `normalizeSave(raw: unknown) → Save` (5.9)
- `mergeSave(stored: Save, next: Save) → Save` (2.11)
- `chimeFreqs(k, d) → { f, grace }` (3.9)

**`CM.projection`**
- `computeLayout(vw, vh, dpr, safe: {top, bottom}, opts: {coarse: boolean}) → Layout`. The layout contains:
  - `stage {x, y, w, h}`, `kX`, `cNear`, `A`, `F`, `cx`, `nearY`, `farY`;
  - `hud {top, bottom, coin, pill, best, pause, mute, next, label}` (rects, 3.4), `strip {top, bottom, h, slotW, iconBox}`;
  - `uiK = kX/3.4`, `dpr`, `needsPortrait`.
- `scaleAt(y) → s`
- `project(lay, x, y, out?) → {X, Y}` (CSS px, canvas coordinates including the stage offset)
- `footprint(lay, x, y, r, out?) → {X, Y, rx, ry}` (exact, 3.2)
- `ratioAt(lay, y) → c`
- `unprojectX(lay, px, y)`
- `unprojectY(lay, py)`
- `unprojectPointer(lay, view: {zoom, aboutX, aboutY}, px, py) → {x, sy}`: removes the zoom, then returns the sim x at `LAUNCH_Y` and the un-zoomed screen y (for the zone tests).

**`CM.art`** (`src/art/`)
- `tiers[t] = { key, paint(ctx, h, opts), particles }` [one `tierN-*.js` per tier]
- `paintTier(ctx, tier, rp, opts?)` [sprites.js]: draws at the anchor in R-units scaled by `rp` (applies the −0.45 translate). Uses the override image when one loaded (4.3), else `tiers[tier].paint`. `opts.icon` selects icon-mode widths (3.4).
- `loadOverrides(timeoutMs, done)` [overrides.js]: starts the 9 `new Image()` loads; calls `done()` once all have settled or after `timeoutMs` (BOOT passes 1500).
- `hasOverride(t) → boolean` [overrides.js]
- `buildSprites(lay, radii) → Sprite[]`, where `Sprite = {canvas, white, red, ax, ay, rp, w, h}`. Never passes `{icon: true}`; in-world sprites and the 2× win-card jug use these.
- `paintIcon(canvas, tier, state: 'none' | 'earlier' | 'run' | 'best')` [sprites.js]: always calls `paintTier(..., {icon: true})` (3.4); used by the strip, NEXT, the collection and the toast.
- `paintCoin(canvas)`
- `paintBackground(ctx, lay, vw, vh, margin)`
- `paintTable(ctx, lay, rules)`
- `paintRoof(ctx, lay, vw)`
- `paintShadow(ctx, fp, tier)` [scenery.js]: the contact shadow and the coloured caustic of 4.6 for the footprint `fp`.
- `paintDangerLine(ctx, lay, rules, level, nowMs, alpha?)` [scenery.js]: the dashed line of 4.4 in the look of `level` (3.8); `alpha` (default 1) is used for the second pass through the launcher.
- `glass`, `garnish` [glass.js, garnish.js]: the helper objects (4.2) that `sprites.js` passes to the painters as `h`; internal to `CM.art`.

**`CM.render`** (`init`, `resize`, `draw`, `view` in `src/render/frame.js`; `fx`, `shake`, `setZoom` in `src/render/fx.js`)
- `init(canvas)`
- `resize(lay)`
- `draw(app, alpha, realDt, nowMs)`, where `app` is `CM.app.ctx`
- `fx.consume(events, game, lay)`
- `fx.clear()`
- `shake(px)`
- `setZoom(target, about, ms)`
- `view() → {zoom, aboutX, aboutY}` (the current eased zoom, for input inversion)

**`CM.audio`** (`src/audio/engine.js`; `consume`, `click`, `notReady` in `src/audio/sounds.js`)
- `init()`
- `unlockFromGesture()`
- `setMuted(b)`, `isMuted()`, `setAmbience(b)`
- `consume(events, game)`
- `click()`, `notReady()`
- `ambience(on)`

**`CM.ui`** (`storage` in `src/ui/storage.js`; `input` in `src/ui/input.js`; `setHud`, `setHudVisible`, `notReady`, `consume` in `src/ui/hud.js`; `init`, `showOverlay`, `toast` in `src/ui/overlays.js`. `hud.consume` forwards toast-worthy events to `toast`.)
- `init(handlers)`. `handlers` = `{ onPlay, onContinue, onResume, onRestart, onQuit, onKeepPlaying, onNewGame, onToggleMute, onToggleAmbience, onToggleNumbers, onToggleRelaxed }`.
- `storage.load() → Save`, `storage.save(Save)` (merges via `mergeSave`), `storage.loadRun() → RunRecord | null`, `storage.saveRun(RunRecord)`, `storage.clearRun()`
- `showOverlay(id | null, data?)`
- `setHudVisible(b)`
- `toast(text, tier)`
- `setHud(game, save)`
- `notReady()`
- `consume(events, game)`
- `input.attach(inputLayer, getLayout, getView, intents)`. `intents` = `{ aimX, aimDirty, launch: null | 'pointer' | 'key', pause(), mute(), restart() }`.
- `input.heldDir() → -1 | 0 | 1`, `input.precise() → boolean`
- `input.reset()` (clears the latch, `aimDirty`, the tracked pointer and held keys)
- `input.guardUntil(ms)`

**`CM.app`** (internal; one part per file in `src/app/`; `CM.main` re-exports the public parts)
- `ctx` [loop.js, the first app file, creates it]: the single shared mutable app context `{ state, game, attract, save, lay, intents, acc, last, timeScale, bestAtRunStart, newBestShown }`. `state` is the 5.7 state name, `game` the play game, `attract` the attract game, `intents` the object passed to `input.attach`. Every app file reads and writes app state only through `CM.app.ctx`, looked up at call time (5.2); no file keeps its own copy. Elsewhere in this document, `app` (for example `app.bestAtRunStart` or `render.draw(app, …)`) means this object.
- `frame(nowMs)`, `guard(name, fn)`, `fail(e)` [loop.js]
- `dispatch(events, source: 'play' | 'attract')` [dispatch.js]
- `attract.start()` (creates or resets the attract game), `attract.step(g)` (the per-tick bot: a launch every 1.2 s, the silent resets of 3.5) [attract.js]
- `setState(name)`, `newGame(seed?)`, `continueRun()`, `simulating() → boolean` [states.js]

**`CM.main`** (`src/main.js`, re-exporting the `CM.app` parts: `frame` from `app/loop.js`, `dispatch` from `app/dispatch.js`, `setState`, `newGame`, `continueRun` from `app/states.js`)
- `boot()`, `setState(name)`, `newGame(seed?)`, `continueRun()`, `frame(nowMs)`, `dispatch(events, source: 'play' | 'attract')`

### 5.6 `tick(g)`: normative order

```
0. if g.phase === 'over' return []
1. ev = []; g.tick += 1
2. if g.phase === 'cooldown': g.cooldown -= 1; if g.cooldown === 0: g.phase = 'ready'
3. if g.launchPending && g.phase === 'ready':
     r = R[g.current]
     blocker = first body (ascending id) with dist((aimX, LAUNCH_Y), b) < r + b.r
     if blocker: emit launchBlocked{blockerId}                     (no state change besides the flag below)
     else:
       body = makeBody(g.nextId++, g.current, g.aimX, LAUNCH_Y, 0, -V0, r); body.launched = true; body.bornTick = -1
       push; g.launches++; emit launch; g.highestTier = max(g.highestTier, body.tier)
       g.current = g.next; g.next = drawSpawn(g); setAim(g, g.aimX)  /* re-clamp */
       if current tier not in runMask: set bit, emit discover
       emit next
       g.phase = 'cooldown'; g.cooldown = COOLDOWN_TICKS
   g.launchPending = false
4. physics.stepWorld(g.world, g.bodies, g.tick, ev, g.rules)
5. if mergeEnabled: resolveMerges(g, ev)      (2.6, 2.9, 2.10)
6. updateDanger(g, ev)                        (2.8; suspended after a win, so win beats lose)
7. return ev
```

### 5.7 App state machine (`src/app/states.js`)

```
BOOT --(layout, PNG overrides settled or 1500 ms, sprites, storage, run record)--> TITLE   (attract game running, muted)
TITLE --Continue / Enter (run saved)--> PLAY(restored)
TITLE --Play / Enter (no run) | New Game (armed if run score > 0)--> PLAY(new)
                                                            seed = ?seed=N or (Date.now() ^ 0x9E3779B9) >>> 0
PLAY --P / Esc / button / hidden--> PAUSE
PAUSE --Resume / Esc / P--> PLAY       (acc = 0; last = now)
PAUSE --Restart / R (armed if score > 0)--> PLAY(new) ; PAUSE --Quit--> TITLE (run kept)
PLAY --win event--> WIN_SEQ --1600 ms--> WIN_MENU
WIN_MENU --Keep Playing / Enter / Esc--> PLAY (continueAfterWin; zoom back 400 ms) ; --New Game / R--> PLAY(new)
PLAY --lose event--> LOSE_SEQ --1400 ms--> OVER_MENU
OVER_MENU --Play Again / Enter / R--> PLAY(new) ; --Title / Esc--> TITLE
any --needsPortrait--> ROTATE (from PLAY via PAUSE) --upright--> previous overlay state (PAUSE if from PLAY)
any --uncaught error in a sim tick--> OOPS --Restart--> PLAY(new) ; --Title--> TITLE
```

- **Entering PLAY** from any overlay arms the 250 ms input guard, blurs `document.activeElement` and focuses the canvas.
- **Leaving PLAY** (to PAUSE, WIN_SEQ, LOSE_SEQ, ROTATE, OOPS or TITLE) calls `CM.game.cancelLaunch(game)` and `ui.input.reset()` (latch, `aimDirty`, tracked pointer with `releasePointerCapture`, held keys). A buffered launch therefore never fires during WIN_SEQ or right after a resume.
- **Esc** in WIN_MENU = Keep Playing; in OVER_MENU = Title; in PAUSE = Resume; in TITLE and ROTATE it does nothing.
- **newGame** creates the game with `mode = save.relaxed ? 'relaxed' : 'standard'`, sets `CM.app.ctx.bestAtRunStart = save.best`, ORs `runMask` into `save.discovered`, clears the stored run and calls `fx.clear()`.

**Event routing.** `dispatch(events, source)`:
- `source === 'attract'`: events go **only** to `render.fx.consume` (visuals). They never reach `ui`, `audio`, `save`, haptics, the run record or `setState`. The attract game resets silently on `lose`, on `win`, and after 43,200 ticks.
- `source === 'play'`: events go to `render.fx`, `audio`, `ui`, the save logic and the state machine, each in its own try/catch (5.8).

**Save writes** (play source only):
- `discover`: `save.discovered |= 1 << (tier − 1)`, `save.bestTier = max(save.bestTier, tier)`, write.
- `win`: `save.wins += 1`, `save.discovered |= 1 << 8`, `save.best = max(save.best, score)`, write synchronously, store the run record.
- `lose`: write; clear the run record.
- best: as described in 2.11.

**WIN_SEQ** (real time):

| Time | What happens |
|---|---|
| 0 ms | Pale-yellow flash: `fillStyle = 'rgb(255,246,200)'` with `globalAlpha` 0.35 → 0 over 120 ms. timeScale eases to 0.25 over 100 ms. Zoom 1.0 → 1.10 about the jug over 600 ms easeInOutSine. Green-and-yellow light rays (3.8). 140 confetti pieces (8×14 px·k rectangles in the **win palette**: 30% verde `#0F8A5F`, 20% verde-light `#5FD08A`, 30% verde-gold `#FFD23F`, 10% verde-gold-light `#FFE98A`, 10% white; launched from both bottom corners at 600-1100 px/s·k, angle 60-80°, gravity 900, drag 0.6/s, spin ±8 rad/s, life 2.5 s). Win jingle. Haptics. Input disabled (not in PLAY) |
| 900 ms | timeScale → 1 |
| 1600 ms | Stop feeding ticks; show WIN_MENU (the save was already written on the event) |

**LOSE_SEQ:**

| Time | What happens |
|---|---|
| 0 ms | The core is already 'over'. Lose sting plays. Offending glasses blink the red silhouette 3 times (150 ms on/off). Shake 5 px·k decaying over 400 ms |
| 0-600 ms | `rgba(40,20,10,0.35)` overlay fades in over the table |
| 1400 ms | OVER_MENU appears |

### 5.8 Fixed-timestep loop

```js
// src/app/loop.js: the first app file; it creates the shared context (5.5)
var ctx = CM.app.ctx = { state: 'BOOT', game: null, attract: null, save: null, lay: null, intents: null,
                         acc: 0, last: 0, timeScale: 1, bestAtRunStart: 0, newBestShown: false };
var DT = 1/240, MAX_FRAME = 0.1, MAX_STEPS = 24;
function frame(nowMs) {
  requestAnimationFrame(frame);                // scheduled FIRST: no exception below can stop the loop
  var real = Math.min((nowMs - ctx.last) / 1000, MAX_FRAME); ctx.last = nowMs;
  var ts = updateTimeScale(real);              // ctx.timeScale: 0 during hit-stop; win slow-mo 0.25; else 1
  try {
    if (CM.app.simulating()) {                 // states.js, at call time: PLAY, WIN_SEQ (play game); TITLE (attract game)
      var isAttract = ctx.state === 'TITLE';
      var g = isAttract ? ctx.attract : ctx.game, source = isAttract ? 'attract' : 'play';
      ctx.acc += real * ts; var n = 0;
      while (ctx.acc >= DT && n < MAX_STEPS) {
        if (ctx.state === 'PLAY') applyIntents(g);       // aim (if dirty) → nudge → latched launch
        else if (isAttract) CM.app.attract.step(g);       // attract.js, at call time
        var ev = CM.game.tick(g);
        if (ev.length) CM.app.dispatch(ev, source);       // dispatch.js, at call time
        ctx.acc -= DT; n++;
      }
      if (n === MAX_STEPS) ctx.acc = 0;        // no spiral of death
    }
  } catch (e) { fail(e); }                     // sim error → OOPS overlay, best score already saved
  guard('render', function () { CM.render.draw(ctx, ctx.acc / DT, real, nowMs); });
}
function applyIntents(g) {
  var it = ctx.intents;
  if (it.aimDirty) { CM.game.setAim(g, it.aimX); it.aimDirty = false; }
  var dir = CM.ui.input.heldDir();
  if (dir) CM.game.nudgeAim(g, dir * keySpeed() * DT * (CM.ui.input.precise() ? 0.35 : 1));
  if (it.launch) {
    var res = CM.game.requestLaunch(g, it.launch); it.launch = null;
    if (res === 'rejected') guard('ui', CM.ui.notReady);
  }
}
// guard(name, fn), fail(e) and updateTimeScale(real) are defined in this file too
CM.app.frame = frame; CM.app.guard = guard; CM.app.fail = fail;
```

- **Fault isolation.** `dispatch` calls `render.fx.consume`, `audio.consume`, `ui.consume`, the save logic and the state machine each inside `guard(name, fn)`, a try/catch that logs the first occurrence of each message and increments a per-consumer error counter shown in `?debug=1`; it never rethrows. Only an exception from `CM.game.tick` itself reaches `fail(e)`, which stores the save, discards the (possibly corrupt) run record and shows OOPS.
- **Interpolation.** The renderer draws each body at `lerp(px, x, alpha)`, `lerp(py, y, alpha)`: `px, py` are the position at the end of the previous tick (set by integrate) and `x, y` the current one. Bodies born this tick have `px = x`, `py = y`. Removed bodies are not drawn; their merge ghosts use the event's `ax, ay, bx, by`.
- Hit-stop and slow-mo only change how much real time feeds the accumulator. The sim always advances in whole ticks, and inputs land on tick boundaries.
- A recorded list of `(tick, action, value)` therefore replays bit-identically in Node.

### 5.9 Persistence

- **Settings and records:** key `cocktailMerge.v1` holds a JSON `Save`.
- **Run in progress:** key `cocktailMerge.v1.run` holds a `RunRecord` (5.4), a few kB.
  - Written on `visibilitychange → hidden`, `pagehide`, entering PAUSE, the `win` event, and every 10 s of real time in PLAY.
  - Cleared on the `lose` event, in `newGame`, and by `fail(e)`.
  - Kept on Quit to Title. The title then shows **Continue**.
  - Restored with `CM.game.restoreGame(record.game)` plus `record.meta`; an invalid record (null result or a parse error) is discarded silently and the title shows Play.
  - JSON round-trips doubles exactly, so a restored game is bit-identical (test 42).
- **Robustness:** every access is wrapped in try/catch. On failure (Safari `file://`, private mode, quota), the wrapper falls back to an in-memory object.
- **`normalizeSave(raw)`** (pure, in `src/game/save.js`):
  - Parse a string with try/catch.
  - Non-objects become the defaults `{v:1, best:0, bestTier:1, muted:false, ambience:true, showNumbers:false, relaxed:true, wins:0, discovered:0}`.
  - `best` and `wins`: finite integers ≥ 0, else 0.
  - `bestTier`: integer 1..9, else 1.
  - `muted` and `showNumbers`: booleans, else false. `ambience` and `relaxed`: booleans, else true.
  - `discovered = (n >>> 0) & 0x1FF`.
  - Unknown `v`: keep valid fields, then set `v = 1`.
- **`storage.save(next)`** reads the stored value, normalises it, and writes `mergeSave(stored, next)` (2.11).

### 5.10 Render pipeline (`render.draw`, in `src/render/frame.js`)

1. Clear the canvas to sand `#F2D6A2`. Reset the transform. Apply dpr, then (except for the vignette) shake and win zoom.
2. Static background canvas (with its overdraw margin), then live clouds, foam, sea sparkles and palms.
3. Static table canvas, then the danger line by level (`CM.art.paintDangerLine`), then the danger fuse.
4. **Aim guide** (PLAY, phase ready or cooldown):
   - Compute `firstHit(g, aimX, R[current])`. The guide is a **static snapshot** of the current board; the pile may shift during flight.
   - Dots every 6 u from y = 144 − r to the hit point, projected. Radius 2 px·uiK·s(y), white, α 0.55 fading to 0.25.
   - A ghost footprint outline (`footprint()`) at the hit point.
   - **Gold merge hint** (dots and ghost turn `#FFD23F` with a 4-Hz glow) only if: hit tier = current tier, not blocked, and the target is launched or `age + travel ≥ 24`, where `travel = floor((LAUNCH_Y − yHit)/(V0·DT))`.
   - If `blocked`: no dots; the ghost is drawn red at the launcher.
   - In the cancel state: grey at α 0.3. During cooldown: α 0.35.
5. Shadow pass: footprint shadows and caustics (`CM.art.paintShadow`), jug auras (all bodies plus the launcher glass), the launcher cooldown ring and the launcher chevron.
6. **Bodies sorted by interpolated y ascending (ties broken by id).**
   - Merge ghosts and the launcher glass (at y = 144) are inserted into the same sort.
   - Each sprite gets pop scale, squash, wobble, flash, launch offset and the danger blink.
   - Tier-number discs are drawn if enabled.
7. Danger line second pass through the launcher (4.4; `paintDangerLine` at α 0.5); the cancel ✕ badge; the first-run hand hint.
8. FX: merge rings, light rays, particles, confetti, jug sparkles.
9. **Roof layer** (thatch plus string lights), drawn over the glasses so tall far glasses tuck under it.
10. Floating texts: score floaters, chain labels, "Fiesta!".
11. Danger vignette (screen space).

`?debug=1` adds:
- a readout of FPS, steps per frame, measured sim ms per frame, bodies, dangerTicks, threatTicks, seed, tick, pool growths and per-consumer error counts;
- **collider overlay**: every body's exact footprint ellipse (cyan, 1 px) drawn over the sprites, with a short red tick at `Y(y + r)`, so sprite/collider/danger agreement can be checked by eye;
- key `9`, which places two touching T8s at (40, 30) and (60, 30) with age 24 to test the win.

### 5.11 Node testability

- **Pure files** (`config`, `physics`, `projection` and every file in `src/game/`):
  - never touch DOM, time or randomness globals;
  - iterate arrays only, sorted by id;
  - allocate nothing in the hot loop (the contact pool is pre-allocated with 2048 entries; growth is counted, 2.4).
- **Tests require them directly:** `require('../src/game/game.js')` (the assembled `CM.game`), `require('../src/physics.js')`, `require('../src/projection.js')`.

### 5.12 Deploy (static S3 hosting)

The owner uploads static files to an S3 bucket with static website hosting; nothing in the game needs a server, and `docs/DEPLOY.md` repeats this with commands.
1. **Upload** `index.html` and the whole `src/` folder to the bucket root, keeping the paths (plus `assets/` only if override PNGs were added, 4.3). Nothing else is needed: `tests/`, `docs/`, `node_modules/`, `examples/` and `package*.json` stay out.
2. **HTTPS:** the S3 website endpoint serves only http, so put CloudFront in front (origin = the bucket, default root object `index.html`, the free ACM certificate); no redirects, rewrites, CORS rules or server code are needed, because the game makes only same-origin requests for its own files (and the optional `assets/tier-N.png`, whose 403/404 is handled by the procedural fallback, 4.3).
3. **Cache headers:** `Cache-Control: no-cache` on every file (the whole game is a few hundred kB and revalidation is cheap), so a re-upload, such as a dedication edit, shows on the next reload; after uploading behind CloudFront, invalidate `/*`. Content types by extension: `text/html; charset=utf-8`, `text/javascript; charset=utf-8`, `text/css; charset=utf-8`, `image/png`.
4. **`file://` keeps working:** double-clicking `index.html` stays a supported way to play, so nothing may depend on being served (relative paths only, no fetch, modules or workers, 5.1).
5. **Saves are per origin:** `file://` play and the S3 URL keep separate best scores and collections; that is expected.

---

## 6. Test plan

### 6.1 Runner

`tests/run.js` is about 40 lines:

- It defines a global `test(name, fn)`.
- It loads `tests/*.test.js` in sorted order.
- Assertions use Node's built-in `assert`.
- Each test runs in try/catch. The runner prints `✓ name` or `✗ name: message` and then `N/M passed`, and sets `process.exitCode = 1` on any failure.

`tests/helpers.js` provides:

- `newGame(seed, overrides)`
- `stepN(g, n) → events[]` (concatenated)
- `place(g, tier, x, y, vx = 0, vy = 0, opts = {age: 24, cleared: true})` (wraps `debugAddBody`)

**Conventions:**
- "After tick T" means after the call to `tick(g)` that set `g.tick === T` has returned. "A request at tick T" means `requestLaunch` called after tick T.
- Unless a test says otherwise, tests never call `requestLaunch`, run in Standard mode, and physics tests use `mergeEnabled: false` where merges would interfere.
- Every test that needs a body to stay where it was placed uses `{PULL: 0}` and zero velocity.

### 6.2 Unit tests

**Physics** (`physics.test.js`)

1. **Rest at the far wall.** A T1 at (50, 100), v = 0. After 1200 ticks: `|y − 6| < 0.01` and speed < 0.5.
2. **Launch travel.** A T1 launched from (50, 144) on an empty table reaches y ≤ 20 between tick 192 and tick 228 (0.80-0.95 s; measured 0.87 s). Its far-wall `impact` has vn in [125, 145] (measured 136).
3. **Wall restitution.**
   - A hit at 136 u/s rebounds at 0.30 × 136 ± 15% (measured 41).
   - A body that touches the far wall moving at 15 u/s rebounds at ≤ 0.5 u/s.
4. **Overlap resolution.** Two T5s placed 2 u overlapped, `PULL = 0`: after 1 tick the penetration is < 0.05 u.
5. **MAX_CORR.** Two T5s placed 10 u overlapped, PULL = 0: after 1 tick, both speeds are ≤ 260 and the penetration is ≤ 10 − 0.5·10 + 0.01. After 30 ticks the penetration is < 0.05 u.
6. **Momentum.** With PULL = DRAG = FRICTION = TAN_DAMP = 0, a head-on T2 vs T6 collision away from the walls conserves total momentum to relative error < 1e-9, and kinetic energy after ≤ before.
7. **Settling.** Seeded (seed 3): 25 bodies of random tiers 1-6 placed at random in y 20..120, `mergeEnabled: false`, 4800 ticks (20 s). Max speed < 1 u/s; max penetration < 0.05 u (measured < 0.005 for seeds 1-10).
8. **No tunnelling.**
   - `VMAX·DT < R[1]`.
   - A T1 at VMAX toward a T1 resting at the far wall never ends a tick with centre distance < R1 (i.e. never more than half overlapped), and never passes it.
9. **Bounds.** After every tick of every physics test, every body satisfies `r ≤ x ≤ 100 − r` and `r ≤ y ≤ 160 − r` (±1e-12, guaranteed by the final wall clamp), with no NaN.
10. **Impact filter.**
    - The settled pile from test 7 emits **0** impact events over the next 480 ticks.
    - A T1 launched into it emits ≥ 1.
    - A pair that bounces apart and re-touches within 12 ticks emits only one impact.
    - An impact involving a body with `growTick < GROW_TICKS` has `growing: true`.
11. **Coincident centres.** Two T3s at the same point separate along +x without NaN.
12. **Ids and keys.** `makeBody(1048576, …)` throws; `pairKey(3, 7) === pairKey(7, 3) === 3·1048576 + 7`; wall contacts update `a.wallSeen[k]`.

**Merges and chains** (`game.test.js`)

13. **Basic merge.** Two T1s touching (age 24) produce exactly one T2 at the midpoint (±1e-9 at birth) in that tick, with score +10 and events `merge` (points 10, depth 1).
14. **Immunity (exact ticks).** `{PULL: 0}`. Two T1s merge at tick t into a T2 (merge-born). `isMergeEligible(g, child, T2_other)` (with a separately placed age-24 T2) is false after each of ticks t … t+23 and true after tick t+24. Integration: after tick t+23, place an age-24 T2 overlapping the child by 0.3 u; the pair merges in tick t+24, not earlier.
15. **Launched glasses are exempt.** `{PULL: 0}`. A T1 placed at (50, 128) (age 24). Launch a T1 at aim 50. A `merge` of the two occurs within 10 ticks of the launch, and no `impact` between those two ids precedes it.
16. **Triple.** Three mutually touching T1s with ids 1, 2, 3: after one tick there is one T2 and one T1, the merged pair is **(1, 3)**, and T1 #2 remains.
17. **Ordering.**
    - A T1 pair (ids 5, 6) and a T3 pair (ids 1, 2) touching in the same tick: the T1 merge is emitted first.
    - Two T1 pairs (1, 2) and (3, 4): the (3, 4) merge is emitted first (newest first).
18. **Chain lineage.** A T1 + T1 whose T2 touches an existing T2 → depths [1, 2], total score 10 + 45 = 55. Two unrelated simultaneous merges both have depth 1.
19. **Growth.** The child's r equals max(rA, rB) at birth, is monotonic, and `r === R[t+1]` (strict equality) after tick birth + 29 and later.
20. **Shove.** `{PULL: 0}`. A neighbour at distance R_new + r_o + 1 receives Δv = 40·(1 − d/range) ± 5% away from the midpoint (measured after the birth tick).
21. **Area invariant and ratios.** In both modes: `2·R[t]² > R[t+1]²` for t = 1..8; radii strictly increasing; ratios R[t+1]/R[t] in [1.14, 1.25] for t = 2..8; R[2]/R[1] ≥ 1.08.
22. **Tier 9.**
    - T8 + T8 → T9 emits `merge` then `win` exactly once; score += 360 + 1000.
    - A second T9 later emits no `win`.
    - Two touching T9s *before* any win just collide.
    - Two touching age-24 T9s while `tick < dangerSuspendUntil` do not burst; after it, they produce `jugBurst`, remove both, and add 1000 × mult.
    - No tier 10 ever exists.
23. **Win beats lose.** `{PULL: 0}`. A T5 placed at y with `y + r = 135` (cleared) at tick 0, so dangerTicks reaches 599 after tick 599. After tick 599, place two touching age-24 T8s at (30, 30) and (30 + 37.9, 30). Tick 600: a `win` event, no `lose`, `phase !== 'over'`, `dangerTicks === 0`. No `lose` occurs before tick 600 + 720.
24. **Chime math.** `chimeFreqs(k, d)` for every k ∈ 2..9 and d ∈ 1..10 returns a finite `f` in [523.25, 3135.96], and for k ≥ 7 a finite `grace`; `chimeFreqs(9, 6).grace === 3135.96`.

**Spawn** (`spawn.test.js`)

25. **Golden RNG.** Seed 42 → `0.6011037519, 0.4482905590, 0.8524657935, 0.6697340414, 0.1748138987` (±1e-9). The same seed gives identical sequences of 1000 values; seeds 1 and 2 differ within the first 10.
26. **Opening.** For 50 seeds, after `createGame`: `current === 1`, `next === 1`, `spawnCount === 2`, `spawnHistory` deep-equals `[1, 1]`, `g.rng === seed >>> 0`. The third `drawSpawn` advances `g.rng` exactly as one `rngNext` call on a clone does.
27. **Unlock.**
    - With `highestTier = 2`, 10,000 draws contain no 3 or 4.
    - With `highestTier = 3`, they contain no 4.
    - `pickWeighted([0, 40, 30, 20, 10], u)` over 100,000 uniform u values gives 40/30/20/10 ± 1%.
28. **pickWeighted edges.** `pickWeighted([0,40,30,0,0], 0.999) === 2`; `pickWeighted([0,40,30,0,0], 0) === 1`; `pickWeighted([0,0,0,0,0], 0.5) === 1`; `pickWeighted([0,0,30,0,0], 0.9999999999) === 2`.
29. **Rules.** 100,000 draws with `highestTier = 4`: all in 1..4, no "4, 4", no four equal in a row, never 8 consecutive draws without a T1.
30. **Distribution.** Same setup: T1 ∈ [0.38, 0.42], T2 ∈ [0.29, 0.32], T3 ∈ [0.19, 0.22], T4 ∈ [0.085, 0.10].

**Danger, launch, aim** (`game.test.js`; all with `{PULL: 0}`)

31. **Exact loss tick (Standard).** A T5 placed with `y + r = 135`, `cleared = true`, at tick 0. `dangerTick` n = 0..4 at ticks 1, 121, 241, 361, 481 (exactly 5). `lose` at tick 600, not 599. `tick()` returns `[]` afterwards.
32. **Exact loss tick (Relaxed).** `{mode: 'relaxed', PULL: 0}`, a T5 with `y + r = 138`: `dangerTick` n = 0..7 at ticks 1, 121, …, 841 (exactly 8); `lose` at tick 960.
33. **Decay.** Over the line for 240 ticks, then the body is removed via splice in the test. dangerTicks reaches 0 at exactly 120 ticks later. No loss.
34. **No heartbeat re-emission.** Drive dangerTicks to 241 (one `dangerTick{2}`), remove the body for 1 tick (241 → 239), restore it for 2 ticks (→ 241): no second `dangerTick{2}`; continuing, `dangerTick{3}` fires once at 361. After a full drain to 0, crossing again emits n = 0 again.
35. **Eligibility.**
    - A body added with `{launched: true, cleared: false, age: 0}` at (50, 140) adds nothing to dangerTicks while age ≤ 288, and counts from age 289.
    - A launched glass that passes the line (PULL default) is `cleared`.
36. **Levels.**
    - An eligible body with `y + r = 127` (inside the 5-u threat band): `danger{1}` exactly after tick 120, not before.
    - An eligible body with `y + r = 122`: stays at level 0.
    - `danger{2}` when one is over.
    - `danger{1}` while decaying; `danger{0}` when calm.
37. **Cooldown, buffer, cancel (exact).** A launch fires on tick L.
    - (a) `requestLaunch(g, 'key')` at tick L+50 → `'rejected'`. At tick L+60 (cooldown 36) → `'buffered'`; the launch fires on tick L+96.
    - (b) In a fresh scenario with no request during the cooldown: a request at tick L+96 → `'queued'`; it fires on tick L+97.
    - (c) `requestLaunch(g, 'pointer')` at tick L+10 → `'buffered'`; it fires on tick L+96.
    - (d) `'buffered'` at tick L+60, then `cancelLaunch(g)`, then 200 ticks: no `launch` event.
38. **Refused launch.** A T4 placed at (50, 144), age 24. With aim 50 and current 1: `requestLaunch` → `'queued'`; the next tick emits `launchBlocked{blockerId}`, no `launch`, no new body, `current`, `next` and `phase` unchanged, `launchPending === false`, and no body speed > 160 u/s or NaN over the next 60 ticks. `firstHit(g, 50, 6)` returns `blocked: true, y: 144`; `firstHit(g, 80, 6)` (start circle clear) ignores the T4, whose centre is not above the start, and returns the far wall (`id 0`, `y 6`).
39. **Aim.**
    - `setAim(−5)` gives R[current].
    - `setAim(1e6)` gives 100 − R[current].
    - With aim 95 and current 1, launching while next = 4 makes `aimX === 100 − 10.6` after the tick.
40. **Launch body and discovery.** vx = 0, vy = −150, x = aimX, launched = true, bornTick = −1, chainDepth 0. After `createGame`, `runMask === 1`. With `spawnScript: [2]` (so next = 2 after the opening): the launch tick that makes T2 `current` emits `discover{2}`; while T2 was only NEXT, no `discover{2}` was emitted.

**Determinism, persistence and soak**

41. **Replay and hash.**
    - Seed 1234 plus a scripted list of 60 launches (aims from `mulberry32(99)`, one every 288 ticks) gives the same `hash()` in two runs.
    - Changing one aim by 0.01 u changes the hash. Seed 1235 gives a different hash.
    - Changing only `dangerTicks`, `spawnHistory[0]`, `cooldown` or `launchPending` on a copy changes the hash.
42. **Snapshot round trip.** For seed 77 after 3000 ticks of `botAim` play: `JSON.parse(JSON.stringify(snapshot(g)))` → `restoreGame` gives `hash(restored) === hash(g)`; then the original and the restored game, fed the same scripted intents for 1000 ticks, produce identical event lists and identical hashes. `restoreGame` returns null for a wrong `rulesVersion` and for a snapshot with a NaN body field.
43. **Soak.** 5 seeds × up to 400 launches with `botAim` every 336 ticks, in both modes. Each run ends (win, lose, or the 400-launch cap). Also:
    - no NaN;
    - max bodies ≤ 45;
    - `world.poolGrowths === 0`;
    - the fraction of contacts (bodies with age > 24) overlapping > 0.5 u is < 0.05%;
    - max such overlap < 8 u;
    - total runtime < 40 s.
44. **Scoring.**
    - `BASE = [_, 0, 10, 30, 60, 100, 150, 210, 280, 360]`.
    - `multiplier(1..8) = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4]`.
45. **`normalizeSave`.**
    - `'{'`, `null`, `{best: −5}`, `{best: 'x'}` and `{discovered: 1e9}` yield valid defaults; the mask is masked to `0x1FF`; defaults have `relaxed: true`, `ambience: true`.
    - `{v:1, best:1234, muted:true, wins:2, discovered:31, relaxed:false}` is preserved.
46. **`mergeSave`.** `mergeSave({best: 900, bestTier: 6, wins: 2, discovered: 0b11, muted: false, …}, {best: 500, bestTier: 7, wins: 1, discovered: 0b100, muted: true, …})` → best 900, bestTier 7, wins 2, discovered 0b111, muted true.
47. **Config and dedication guards.**
    - Without `CM_DEDICATION` defined (plain Node require), `config.DEDICATION === 'For you, with love.'`.
    - `src/dedication.js`, run with `vm.runInNewContext`, defines `CM_DEDICATION` as a non-empty string (catches a broken edit before shipping).
    - Tier colours (and T9's `accent`) match `/^#[0-9A-F]{6}$/i`; `TIERS[9].color === '#0F8A5F'` and `TIERS[9].accent === '#FFD23F'`. Spawn weights sum to 100 with `WEIGHTS[0] === 0`.
    - In both modes: `DANGER_Y ≤ LAUNCH_Y − R[4] − 0.4` and `LAUNCH_Y + R[4] ≤ L`.
    - `AUDIO.SCALE.length === 15`.

**Projection and layout** (`projection.test.js`)

48. For 360×640, 360×780, 375×667, 390×844, 412×915, 768×1024, 1366×768 and 1920×1080 (`coarse` true for widths < 500, safe 0 and safe {47, 34}):
    - `S === min(vw, round(0.62·vh))`;
    - `cNear ∈ [0.85, 0.98]`;
    - farY ≥ hudBottom + 0.12H − 0.5;
    - nearY + 10·kX ≤ stripTop;
    - T1 diameter at the launch row ≥ 34 px on phones (width < 500).
    - 844×390 with `coarse: true` returns `needsPortrait === true`; with `coarse: false` it returns false.
49. **HUD rects.** At 360×640, 375×667, 390×844 and 1920×1080: all HUD rects lie inside the stage; every pair of `pill, best, pause, mute, next, label` is disjoint, and `coin` intersects only `pill`; the strip's icon box fits inside its slot (`iconBox.w ≤ slotW`).
50. `project(50, 160)` returns (cx, nearY). `scaleAt(0) = 0.72` and `scaleAt(160) = 1` (±1e-12). Y is strictly increasing in y.
51. **Round trips.** `unprojectX(project(x, 144).X, 144) = x` for x ∈ {6, 37.3, 50, 94} (±1e-9). `unprojectY(project(·, y).Y) = y` (±1e-6).
52. **Straight aim lines.** Points with x = 20 at y = 0, 80 and 160 are collinear on screen (|cross| < 1e-6).
53. **Footprint and danger agreement.**
    - `ratioAt(y) ∈ [0.61, 0.98]` and always < 1.
    - For random (x, y, r): `footprint().Y + footprint().ry === Y(y + r)` (±1e-9).
    - A body with `y + r = DANGER_Y + 0.1` has its footprint's lowest pixel below (greater than) `Y(DANGER_Y)`; with `y + r = DANGER_Y − 0.1`, above it.
    - The launcher footprint's top edge `Y(LAUNCH_Y − R[4])` is below `Y(DANGER_Y)` in both modes (the launcher glass never stands over the line).
54. **Zoom inversion.** For zoom 1.10 about a point P: zooming a screen point and passing it through `unprojectPointer` returns the original sim x at `LAUNCH_Y` (±1e-9).

**Purity** (`purity.test.js`)

55. For each pure file (`src/config.js`, `src/physics.js`, `src/projection.js` and every `src/game/*.js`):
    - it has exactly one `/* @pure-begin */ … /* @pure-end */` pair;
    - extract the text between the markers and strip block and line comments;
    - assert no match for `/\b(window|document|navigator|localStorage|sessionStorage|performance|requestAnimationFrame|setTimeout|setInterval|Date|AudioContext)\b|Math\.random/`.
    - Also assert that the whole file contains no `window`. (The wrapper uses the `globalThis`/`this` root; `dedication.js` is not a pure file and is not scanned.)
    - **File size:** every `src/**/*.js` and `src/**/*.css` file has at most 450 lines (the ~400-line rule of 5.1 with a small margin), so a file that outgrows the rule fails the suite instead of being noticed late.

**Optional browser smoke test** (`tests/browser/run.js`, playwright-core driving the **system Chrome** found by `tests/browser/chrome.js`: `channel: 'chrome'`, or the path in `CHROME_PATH`):
- Loads `index.html` via `file://` at 360×640, 375×667, 390×844 and 1920×1080: no console errors (a failed load of `assets/tier-N.png` is ignored, because the overrides are optional); the HUD elements' `getBoundingClientRect()`s satisfy test 49's rules; every visible text element has computed `font-size ≥ 13px`; the title's Play button is fully inside the viewport with a 160-character, 3-line dedication injected.
- It runs Chrome only and is no substitute for the iPhone QA pass (3.10).

**Colour contact sheet** (`tests/browser/contact-sheet.js`, run with `npm run preview`; a review tool, not a test, never needed to play). It lets the owner review the art early, at large size and in colour.
- Uses playwright-core with the system Chrome (`tests/browser/chrome.js`); if Chrome is not found, it prints how to set `CHROME_PATH` and exits with code 1.
- Opens `tests/browser/contact-sheet.html` via `file://` at a 1600×2100 CSS px viewport, device scale factor 1, and screenshots exactly that viewport (not `fullPage`). The harness loads `src/dedication.js`, `config.js`, `projection.js`, every `src/art/` file and the three stylesheets by relative path, and draws with the real `CM.art` code (override PNGs included when present, so the sheet shows what the game will show). Everything on the sheet is drawn by `CM.art`: sprites (`paintTier`), icons (`paintIcon`), the coin, the table (`paintTable`), shadow and caustic (`paintShadow`, 4.6) and the danger line (`paintDangerLine`, 4.4), so no physics, game, render, ui or app file is loaded. The NEXT box and the strip are built from the same markup as in `index.html` (styled by `hud.css`) and filled with `paintIcon`.
- **Layout** (CSS px): the 3×3 grid (1440×1560) at (80, 20); below it, at y 1600, one row 200 px tall holding the coin, the NEXT box and the strip, left to right with 40 px gaps; the table slice (1200×260) centred at y 1820. Total height 2100.
- **Content of `docs/preview/cocktails.png`** (the folder is created if missing):
  - a 3×3 grid of the 9 cocktails in colour at R = 96 CSS px (cells 480×520; T9 is about 290 px tall), each standing on a patch of the glass-over-sand table surface with its contact shadow and caustic, labelled with tier number, name and key-colour swatch with hex (T9 shows the jade and the yellow swatch);
  - the coin at 128 px;
  - the NEXT box at 2× (the `index.html` markup and `hud.css`, holding T3);
  - the tier strip of the 390×844 layout at 2×, showing each slot state (silhouette, dimmed, colour, highest);
  - a 1200×260 px slice of the near table: frame, apron, launch zone, the danger line at level 0 and a T3 in the launcher at y 144.
- **`docs/preview/cocktails-small.png`**, the readability sheet (kept from revision 2 because it serves a different purpose: it checks that tiers are distinguishable at play size, not how the art looks): all 9 sprites at 28 px tall, once in colour and once in greyscale (CSS `filter: grayscale(1)` on a copy).

### 6.3 Manual QA checklist

**Execute this checklist on an iPhone first** (iOS Safari, then iOS Chrome; 3.10), then on Android Firefox, then on desktop. An item that names no platform applies to all of them.

**Loading and platforms**
- [ ] Double-clicking `index.html` (`file://`) works in Chrome, Firefox and Safari with no console errors (failed loads of the optional `assets/tier-N.png` are expected and ignored).
- [ ] `python3 -m http.server` works the same.
- [ ] The Network tab shows only local files and no font downloads (failed `assets/tier-N.png` requests are expected when no overrides exist).
- [ ] The S3 URL (https, through CloudFront) works on the iPhone exactly like `file://`; only `index.html` and `src/` (plus `assets/` if any) were uploaded (5.12).
- [ ] iPhone Safari and iPhone Chrome (notch or Dynamic Island, home indicator, URL-bar collapse and expand via visualViewport): no scroll, rubber-band, pull-to-refresh, pinch or double-tap zoom, long-press callout or text selection anywhere; a rapid double-tap on Pause does not zoom; the strip is never hidden behind the toolbar.
- [ ] Android Firefox: the same checks.
- [ ] iPhone Safari: a swipe from the left screen edge during aiming does not lose the run (it is the tab's first page).
- [ ] iPhone in Low Power Mode (30 Hz rAF): the game runs at normal speed and the adaptive fallback does not trigger (7, item 7).
- [ ] Landscape phone: the "Turn your phone upright" overlay blocks play; turning back resumes into Pause.

**Title**
- [ ] Out of the box the tag reads "For Reem, with love." / "Cheers to sunny days together!": a jade-green card with cream text, hanging from a yellow ribbon with a bow, with a yellow heart.
- [ ] The dedication from `src/dedication.js` hangs on the swinging tag.
- [ ] Edit the text (with quotes, an apostrophe and a backslash) and reload: the change shows.
- [ ] Delete one backtick and reload: the game still starts with "For you, with love."; restore it.
- [ ] Test lengths of 10, 90 and 160 characters, plus line breaks and an emoji: ≤ 3 lines with auto-shrink.
- [ ] 360×640 and 375×667 with a 160-character, 3-line dedication: no overlap, Play fully visible, "How to play" collapses into a button.
- [ ] The attract mode runs silently; HUD and strip are hidden.
- [ ] Leave the title open for 10 minutes: the discovered mask, best score and wins are unchanged, and no sound or vibration happened.
- [ ] "Sangrias mixed" appears after the first win.

**Aim and launch**
- [ ] The launcher follows the finger, absolute at the launch row, with the finger resting below the dashed line and over the tier strip.
- [ ] Taps in the sky, sea or roof do nothing.
- [ ] Dragging up off the table shows the red ✕ and greyed guide; releasing there cancels; dragging back resumes.
- [ ] The guide converges correctly in perspective and stops at the first glass.
- [ ] The gold hint appears only when a merge will happen.
- [ ] A release 0.2 s after a launch fires as soon as the cooldown ends; the cooldown ring fills at the launcher.
- [ ] Launching onto a glass sitting in the launch zone shows the not-ready shake and flashes the blocker; nothing explodes.
- [ ] The launched glass does not jump sideways on a fast flick-and-release.
- [ ] Mouse hover and click work; keyboard aim accelerates, Shift is precise, Space launches; with the mouse resting on the table, arrow keys still move the aim.
- [ ] Click Pause with the mouse, resume, press Space: exactly one launch, no pause/mute toggle. Same after Mute.
- [ ] The tap that closes a menu never launches.
- [ ] A rapid tap test (10 taps/s) launches once per cooldown.
- [ ] A Space press during a tier-7/8 hit-stop still launches right after it.

**Feel**
- [ ] Glasses slide away and slow naturally, and the bounce is soft.
- [ ] A 25-glass pile settles within about 2-4 s with no shimmer and no clink spam.
- [ ] Touching glasses look touching (side by side and front to back); with `?debug=1` the collider overlay matches the drawn footprints.
- [ ] Merges pop; wobble shows on hard hits; a glass merging again mid-pop does not flicker.
- [ ] A thrown glass that grazes a same-tier glass merges.
- [ ] Chain chimes climb, and a chain of 4+ feels like a moment.
- [ ] Hit-stop on tiers 7/8 reads as impact, not lag.
- [ ] 10 minutes of play: clinks never sound shrill; ambience can be turned off separately.

**Danger**
- [ ] The line stays white and still while the pile is comfortably back; it turns steady orange only when a glass hovers within 5 u for 0.5 s.
- [ ] Over the line: red pulse, rising heartbeat ticks, vignette, offending glasses blink, and the fuse grows from both edges.
- [ ] A glass is "over" exactly when its shadow crosses the dashed line.
- [ ] The loaded launcher glass (T3/T4) never looks over the line: the dashed line shows through it.
- [ ] A brief bounce over the line does not lose.
- [ ] Losing shows the sequence and "Last Call!", and the best score persists.

**Win** (`?debug=1`, key 9)
- [ ] Slow-mo, zoom, confetti and jingle; a chain in progress finishes; overlay; the jug is still on the table.
- [ ] The jug reads as green and yellow (jade liquid, yellow ribbon, lemons and handle highlight, yellow-gold glow and aura); the flash, rays, rings and confetti are green and yellow; the Win card has a jade border and a yellow title ribbon reading "Sangria Verde!".
- [ ] Close the tab during the celebration and reopen: "Sangrias mixed" counts the win; Continue resumes after the win.
- [ ] Keep Playing continues the same board; aiming is accurate while the zoom eases out. Esc in the Win menu = Keep Playing.
- [ ] A second jug shows the toast.
- [ ] Two jugs give "Fiesta!".

**Strip and NEXT**
- [ ] On a first-ever run, T1 is in colour from the start; T2 turns colour when it reaches the launcher, not when it appears in NEXT.
- [ ] Silhouettes become colour with the NEW pop.
- [ ] A new run shows earlier discoveries dimmed.
- [ ] Touching the strip aims, never shows a tooltip.
- [ ] The toast appears for tiers ≥ 5.
- [ ] NEXT always matches the next launched glass, and the fly-in is correct.
- [ ] Readability sheet (`docs/preview/cocktails-small.png`): all 9 sprites at 28 px, in colour and in greyscale, are distinguishable (T3 vs T4, T7 vs T8, T1 vs T2 and T5 vs T9 in particular).
- [ ] Colour sheet (`docs/preview/cocktails.png`) reviewed and approved by the owner (8, step 4).

**Pause and settings**
- [ ] Pause via button, P, Esc and tab hide; nothing moves; ambience is silent; HUD and strip hidden; collection grid shows names.
- [ ] Restart and R need a second tap within 2 s when the score > 0.
- [ ] Quit to Title, then Continue: the same board, score and NEXT.
- [ ] Mute is remembered and also stops haptics. Ambience and "Relaxed table" are remembered; Relaxed applies from the next game.
- [ ] The tier-number toggle is remembered; digits are readable on far T1s.

**Audio unlock**
- [ ] iPhone, Play as the first-ever tap: the UI click is audible and the first launch whooshes.
- [ ] iPhone Chrome and Android Firefox, same.
- [ ] iPhone: a phone call or Siri interrupts the game; after returning, sound works (the `'interrupted'` state is resumed). With the ringer switch on silent the game is silent, as accepted.
- [ ] Switch apps and come back: sound still works.

**Robustness and performance**
- [ ] Rotate mid-game: the layout rebuilds, the state is unaffected and sprites stay sharp.
- [ ] Leave for 5 minutes: auto-paused, no time jump.
- [ ] Kill the tab mid-run (swipe away) and reopen: Continue restores the run.
- [ ] Private mode and Safari `file://` storage failure: no crash.
- [ ] Put a PNG at `assets/tier-3.png` and reload (`file://` and S3): it is used on the table, in the strip, in NEXT and in the collection, standing on its shadow; delete it and reload: the procedural Cosmopolitan returns, no crash.
- [ ] Reduced motion: no shake, zoom, sway or swing.
- [ ] 60 fps on the target iPhone and on a mid-range Android in Firefox with 30+ glasses during a chain (`?debug=1`); record the measured sim ms per frame in Appendix 9.
- [ ] Desktop 1920×1080 and 1366×768: stage centred with extended scenery; shake never shows a canvas edge.

---

## 7. Risks and resolutions

1. **Pile jitter, overlaps, phantom velocity.**
   - Resolution: PBD at 240 Hz × 10 iterations, final wall clamp, velocity from positions, restitution only above 18 u/s, Coulomb friction.
   - **(measured)** 0.004% of contacts overlap > 0.5 u; dropped piles settle with < 0.005 u overlap.
2. **Merge-growth explosions.**
   - Resolution: growth over 29 ticks from max(rA, rB); `MAX_CORR` 0.5 u per contact per iteration; VMAX clamp after velocity derivation; half-speed merged velocity; shove ≤ 40 u/s; launches onto an occupied spawn circle are refused.
3. **Tunnelling.** `VMAX·DT = 1.08 u < 6 u`, unit-tested.
4. **Difficulty wrong for a gift.**
   - Relaxed mode is the default, with measured acceptance targets (smart ≥ 70%, sloppy 40-85%) and a fixed ladder (8, step 2), plus one human playtest before shipping.
   - **(measured, Standard, revision-1 rules)** Smart bot 57.5% [49-66%] at 3.0 s pace, 39% [31-48%] at 1.4 s; random aim 11% [7-18%].
   - Do **not** add a mercy spawn rule.
5. **Multi-contact ambiguity.** Deterministic sort (tier asc, newest first, min id), greedy disjoint matching, ids kept sorted. Tests 16-17.
6. **Unfair losses.** Eligibility rule, a global timer with grace and 2× decay, footprint shadows that match the danger test exactly, the line drawn through the launcher, visible threat states, heartbeat ticks and the line fuse, win suspension, and win-beats-lose.
7. **Phone performance.**
   - Resolution: sprite caches (no per-frame paths for glasses), cached background, table and roof, DPR ≤ 2, a 256-particle pool, and a solver at about 0.6 ms per frame *(estimate; measured in QA)*.
   - **Adaptive fallback:** if the mean **work time** per frame (sim plus render, measured with `performance.now()` inside `frame`, not the rAF interval, 3.10) exceeds 12 ms over 2 s, drop DPR to 1.5, then to 1, and halve particles (logged in `?debug=1`). Measuring work rather than the frame interval keeps iOS Low Power Mode (30 Hz rAF) from triggering it.
8. **Audio policies.**
   - Resolution: lazy context created and resumed on activation-triggering events (pointerup, touchend, click, keydown) as well as pointerdown, a silent-buffer kick on iOS, resume on visibility, voice caps, rate limits, a compressor, and try/catch around every audio entry point.
   - The iOS silent switch is accepted.
   - The iOS specifics (synchronous unlock inside the gesture, `'interrupted'` state, back-forward cache) are normative in 3.10.
   - Without an AudioContext, everything is a silent no-op.
9. **`file://` limits.** IIFEs on the global `CM`, no modules, fetch or workers, relative paths only, everything procedural (the optional PNG overrides load with `new Image()`, which works from `file://`, and nothing reads pixels back from a possibly tainted canvas, 4.3), and a try/catch storage wrapper. The same files deploy unchanged to S3 (5.12).
10. **Tier confusion.** Unique silhouettes per tier (T3 deep V vs T4 wide coupe), size steps ≥ 14%, distinct key hues (T8 purple; T9 deep jade plus yellow, far darker than T5's green), the greyscale readability sheet and the colour contact sheet (6.2), and the optional tier numbers.
11. **Finger occlusion.** Aim zone below the dashed line and over the strip, absolute x mapping at the launch row, the launcher chevron, the aim guide extending above the finger, and the gold merge hint.
12. **Resize, rotation and the iOS URL bar.** The sim is in table units. Only layout and caches rebuild (debounced; caches only on > 2% scale change). The viewport is measured in JS px, never `100vh`, with a late re-measure after rotation (3.10). Landscape phones get a blocking rotate overlay.
13. **Spiral of death / tab sleep.** Frame dt clamped to 0.1 s, at most 24 steps per frame, auto-pause on hidden, accumulator reset on resume.
14. **Board lock after a win.** The jug burst ("Fiesta!").
15. **Dedication breaks the game, the layout or injects markup.** Separate `dedication.js` with `String.raw`, a config fallback, a visible boot guard, a vm parse test; `textContent`, `pre-line`, auto-shrink and a 3-line clamp.
16. **Accidental launch from a menu tap.** The 250 ms guard plus the "pointer down began in PLAY" rule; focus management so Space/Enter never activate a hidden or HUD button.
17. **Cross-engine float differences.** Only same-engine determinism is promised (Node tests, in-browser replay, and run restore in the same browser).
18. **Tall far glasses overlapping the HUD.** The roof layer is drawn over the glasses; the HUD sits in the corners; layout reserves 12% H above the far edge.
19. **Lost progress.** The run is snapshotted on hide, pause, win and every 10 s; wins are saved on the event; saves merge across tabs.
20. **A runtime error freezes the game.** rAF scheduled first, per-consumer try/catch, OOPS overlay for sim errors.

---

## 8. Implementation order

1. `config.js`, `dedication.js`, `physics.js`, `projection.js`, the `src/game/` files and `tests/` (all unit tests green, including the file-size check of test 55).
2. **Tuning gate** (`node tests/tune.js`, uses the real core; must pass before step 4):
   - Bots, each with its own seeded noise RNG: **smart** = `botAim` with uniform ±2 u noise, launch every 336 ticks (1.4 s); **sloppy** = `botAim` with uniform ±6 u noise, every 336 ticks; **random** = uniform x, every 216 ticks (0.9 s).
   - 400 seeds per bot per mode, cap 400 launches. Report win rate with 95% Wilson interval, average launches to win, max bodies and overlap fraction, in Appendix 9.
   - **Relaxed ladder.** Start at `RADIUS_SCALE = 0.94`. If the smart bot is below 70% or the sloppy bot below 40%, step down to 0.91, then 0.88; if still below at 0.88, also set `GRACE_TICKS = 1200`. If the sloppy bot is above 85% at 0.94, step up to 0.97. Take the first rung that meets all targets and write it into `MODES.relaxed`, the 2.5 table and Appendix 9.
   - Standard is reported only and stays as specified.
3. `src/main.js` and `src/app/` (loop, dispatch, states), `src/ui/input.js` with the iOS rules of 3.10, `src/ui/storage.js`, and `src/render/frame.js` with placeholder footprint ellipses. **Stubs for the boot guard:** the guard's file list (5.2) is complete from this step on and is never shortened, so every file that steps 4-6 write ships now as a stub that passes its sentinel: `src/art/glass.js` and `garnish.js` export their helper objects with no-op helpers; each `tierN-*.js` registers a painter that draws a disc in the tier key colour; `coin.js`, `scenery.js`, `overrides.js` (calls `done()` at once) and `sprites.js` export minimal versions; `render/fx.js`, `audio/engine.js` and `audio/sounds.js` export no-ops; `ui/hud.js` shows the score as plain text; `ui/overlays.js` shows a bare Play button; `app/attract.js` does nothing. Steps 4-6 replace the stubs file by file. Playable; first check on an iPhone.
4. `src/art/`: the glass recipe, garnish helpers, the 9 tier painters (T9 Sangria Verde in green and yellow), coin, scenery, sprite caches and the PNG override loader; then `npm run preview` writes `docs/preview/cocktails.png` and `cocktails-small.png`. **Art review:** the owner approves the colour sheet before step 5.
5. Juice (`src/render/fx.js`, 3.8), then `src/audio/` (3.9).
6. HUD, strip, overlays, the title tag, persistence (save and run), attract mode.
7. Phone QA pass (6.3) **on an iPhone first**, then Android Firefox and desktop; the performance fallback; the optional `tests/browser/run.js` smoke test; a test upload to S3 (5.12).
8. **One human playtest** before handing over the gift: someone who has not played plays 3 Relaxed runs. If they have not mixed a Sangria in 3 runs, move Relaxed one rung easier on the ladder and re-run the gate's numbers for the record.
9. **Write the handover docs from the real code:** `docs/ARCHITECTURE.md` (file map, namespaces, data flow, frame loop), `docs/HOW-TO-CHANGE.md` (the dedication first; then colours, difficulty knobs, PNG overrides, adding a painter, running tests and the contact sheet) and `docs/DEPLOY.md` (5.12 with exact upload and cache-header commands). Every path and name in them is checked against the files as shipped.

---

## 9. Appendix: measurements

**Re-validation prototype** (Node, the exact revision-1 rules of this document in Standard mode, including all grafts):

- smart bot = `botAim` with ±2 u noise;
- random bot = uniform x;
- 120 seeds per row unless noted; brackets are 95% Wilson intervals. At 120 seeds an interval is about ±9 points, so differences smaller than that are not evidence and were not used for decisions.

| Configuration | Win rate [95% CI] | Avg launches to win | Max bodies | Contacts > 0.5 u overlap |
|---|---|---|---|---|
| **Smart bot, launch every 1.4 s** | **39%** [31-48%] | 148 | 31 | 0.004% |
| **Smart bot, every 3.0 s (human pace)** | **57.5%** [49-66%] | 150 | 28 | 0.002% |
| **Random aim, every 0.9 s** | **11%** [7-18%] | 150 | 39 | 0.008% |
| DANGER_Y 132, smart 1.4 s / 3.0 s | 43% [34-52%] / 61% [52-69%] | 150 | 31 | n/a |
| DANGER_Y 133, smart 1.4 s | 44% [35-53%] | 151 | 31 | n/a |
| Opening variants, smart 1.4 s: (1+1, unlock) / (1+1 only) / (neither) | 39% / 47.5% [39-56%] / 39% | ~148 | ~30 | n/a (all within noise; the gentle onboarding is kept for UX) |
| Merge depth distribution (smart bot) | 1: 75%, 2: 20%, 3: 4.2%, 4: 1.0%, 5+: 0.4% | | | |
| Single launch, empty table | Reaches y ≤ 20 at 0.87 s; far-wall hit 136 u/s; rebound 41 u/s; rests at y = 6.000 | | | |
| 25 dropped bodies, merges off, seeds 1-10 | All speeds < 1 u/s by 20 s (most < 4 u/s within 1.4-5.4 s); max overlap 0.004 u | | | |
| Spawn, 100k draws × 3 seeds | T1 39.5-39.9%, T2 30.2-30.4%, T3 20.5-20.7%, T4 9.3-9.4%; longest run without T1 = 7; zero "4, 4"; zero 4-in-a-row | | | |
| CPU | 6-7 ms per simulated second in Node | | | |

- The DANGER_Y rows show a trend (+4 points) that is **inside the noise**; DANGER_Y alone is therefore not relied on. The Relaxed mode combines it with a longer grace and smaller radii, and the gate measures the combination with 400 seeds (interval about ±5 points).
- An earlier 40-seed comparison of `MAX_CORR` 0.5 vs uncapped (25% vs 22.5%, intervals about ±14 points) was removed: it cannot resolve a difference, and `MAX_CORR` is a feel decision.
- The phone CPU figure in 2.4 is an estimate; the measured value from the QA pass (`?debug=1`) is recorded here when available.

**Tuning gate results** (implementation step 2, `node tests/tune.js`, the real core of `src/`; full 400 seeds per row, no cuts):

- Seeds 1-400 per row, cap 400 launches. Bots as in 8 step 2, each with its own mulberry32 noise RNG seeded from the game seed: smart = `botAim(g, u, 4)` (uniform ±2 u), sloppy = `botAim(g, u, 12)` (uniform ±6 u), both one launch attempt every 336 ticks (1.4 s); random = uniform x over `aimBounds`, every 216 ticks (0.9 s).
- A run is a win when the `win` event fires; "avg launches to win" is `g.launches` at that tick. "Max bodies" is the largest body count in any run of the row (the average per-run maximum in brackets). "Contacts > 0.5 u overlap" counts, after every tick, the touching pairs (`d < rA + rB`) whose penetration exceeds 0.5 u, merge-growth transients included.
- Every run ended in a win or a loss; none reached the 400-launch cap. Wall time 184 s for all 9 rows (15 child processes).

| Mode / rung | Bot | Win rate [95% CI] | Avg launches to win | Max bodies | Contacts > 0.5 u overlap |
|---|---|---|---|---|---|
| Standard | smart | **39.0%** [34-44%] | 151 | 30 (22.2) | 0.0125% |
| Standard | sloppy | **39.8%** [35-45%] | 153 | 30 (22.1) | 0.0125% |
| Standard | random | **8.5%** [6-12%] | 144 | 37 (28.7) | 0.0185% |
| Relaxed, `RADIUS_SCALE` 0.94 | smart | **68.0%** [63-72%] | 167 | 34 (23.0) | 0.0112% |
| Relaxed, `RADIUS_SCALE` 0.94 | sloppy | **69.5%** [65-74%] | 170 | 33 (23.0) | 0.0111% |
| Relaxed, `RADIUS_SCALE` 0.94 | random | **25.0%** [21-29%] | 161 | 42 (32.1) | 0.0156% |
| **Relaxed, `RADIUS_SCALE` 0.91 (chosen)** | smart | **75.3%** [71-79%] | 172 | 34 (23.0) | 0.0108% |
| **Relaxed, `RADIUS_SCALE` 0.91 (chosen)** | sloppy | **74.3%** [70-78%] | 174 | 34 (23.3) | 0.0105% |
| **Relaxed, `RADIUS_SCALE` 0.91 (chosen)** | random | **32.0%** [28-37%] | 174 | 42 (33.0) | 0.0148% |

- **Chosen rung: `MODES.relaxed = { DANGER_Y: 133, GRACE_TICKS: 960, RADIUS_SCALE: 0.91 }`.** At the starting rung 0.94 the smart bot was 68.0%, below the 70% target, so the ladder stepped down once. At 0.91 smart (75.3% ≥ 70%) and sloppy (74.3%, inside 40-85%) both meet the targets. `GRACE_TICKS` stays 960. The 0.88 and 1200-tick rungs were not needed and were not run.
- 68.0% at 0.94 is inside the noise of 70% (interval 63-72%), but the ladder is applied to the point estimate as written.
- Standard reproduces the revision-1 smart-bot figure (39% at 1.4 s) exactly.
- **The sloppy bot is not weaker than the smart bot** in either mode (±6 u noise vs ±2 u changes the win rate by less than 2 points, well inside the noise). With radii of 6-22 u and an aim that targets a same-tier glass, a 6 u miss still hits or nudges that glass most of the time. The 85% ceiling therefore binds on the same number as the 70% floor; the 8 step 8 human playtest is the real check of the "sloppy" end.
- The overlap fractions (0.010-0.019%) are higher than the 0.004% of the revision-1 table because this gate samples every pair after every tick of full games, including the ticks right after merges, where a neighbour can start up to about 4 u inside the new body; they are all far below 0.1%.

**Earlier "feel" prototype findings, carried over:**
- An impulse-only solver at 120 Hz left 1.06% of contacts > 0.5 u overlapped, and the settle p90 was ≥ 10 s (phantom velocity at walls). It was rejected in favour of PBD.
- The mercy spawn rule reduced the smart-bot win rate from 45% to 35%. It was rejected.
- Larger top-tier radii made the smart bot lose more than 50% of runs; smaller radii made random aim win. The Standard radii are 6 / 7.4 / 9 / 10.6 / 12.4 / 14.4 / 16.6 / 19 / 22; Relaxed scales tiers 2-9 by the gate's `RADIUS_SCALE`.
