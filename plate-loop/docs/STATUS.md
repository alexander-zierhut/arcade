# Plate Loop: status

**Version 0.1.0, first beta, not yet released.** Written 2026-11-04 (refreshed at the end of the first build).
`release.json` says `"status": "beta"` and already carries `"released": "2026-11-04"`; set that to the real go-live
day when the game first ships (the selector's "New!" badge counts two weeks from it).

## What is in it

- The engine for rules R1 to R28 as changed by the first playtest (`src/engine/`): a tap takes the run out of the box
  and paces it out one piece per 0.9 s (first after 0.9 s) on plates reserved at the tap; a hidden piece ends a run; landing with conditional pouring (R9) and
  the completion preference (R10b); closing, hidden pieces, bound pairs, wrapped, frozen, locked and one-way boxes; loss
  detection; deterministic sim with per-plate positions.
- Two layouts, `ring-2col` (14 boxes) and `counter` (12 boxes), belt direction per level.
- Solver, tick-accurate bot (also the greedy and sloppy tuning bots) and reverse-play generator for all four tiers.
- **500 fixed levels**: 1-100 from `src/levels/seeds.js`, 101-500 from `scripts/level-plans/*.json`, all certified by
  `scripts/gen-levels.mjs`; tuning report in `docs/levels-tuning.md` (`scripts/tune-levels.mjs`).
- The canvas scene (square kind-colour plates, box sprites, departure animation, covers, effects), 12 sushi kinds plus
  props as SVG sprites, the performance mode, synthesised sounds, kind permutation per attempt.
- Title, endless chooser (tier and "no luck"), how-to cards per mechanic (shown at first contact), pause (the game also
  pauses when a kit sheet opens), settings, win and lose cards with share lines, German and English, save under
  `plateLoop.save`.
- Arcade kit integration: loading screen and `Arcade.ready`, `Arcade.screen` on every screen, `Arcade.share.set`,
  `data-arcade` buttons (home, perf, lang, fullscreen, app, news, share), news entry 0.1.0 (de, en), manifest, icons,
  OG image, `release.json`, `scripts/release.sh`, BOOT line in `tests/site.test.mjs`, `plate-loop` entries in
  `scripts/check-versions.mjs` and `scripts/og-images.mjs`.
- Endless mode: generated levels at the chosen tier, streak per tier saved.
- Tests: `npm test` runs 300 node tests (297 pass, 3 marked todo): engine, rules-adversarial, gen, gen-adversarial,
  levels (all 500 validated, a subset re-certified), layouts, rng. `npm run test:browser` (`tests/browser/run.js`,
  about 2.5 minutes): boot, `ui.spec.js`, `scene.spec.js`, real levels played with real pointer taps, layout at 360x640,
  390x844, 430x932, 768x1024, 1280x800, preview screenshot; 142 checks pass. The root `npm test` boots the game.

## Known gaps

- **No real-phone test yet** by the author (an Android phone, 360 x 678 class) and no before/after proof captures of
  every screen. This is what keeps the game in beta.
- **Boxes are 41 px tall at 360x640** (smallest measured by the browser suite; 44 wanted, 40 is the suite's floor).
  Plates measure 37 px there (36 wanted). Larger viewports are fine (47 px and up).
- **Tuning flags** (`docs/levels-tuning.md`): level 59 is tiered easy but the greedy bot wins only 1 of 3; levels 25,
  100 and 163 are tiered extreme but a naive (greedy) bot wins 2 of 3. Bands (`config.TIERS`) are first guesses and the
  tuning used only two bots; nothing is re-tiered automatically.
- **Endless levels have `id: 0`** (`generator.generate` without `opts.id`), so the kind permutation of a generated level
  depends on the attempt counter only, and anything keyed by level id (save `attempts`, share line) must not be used for
  them. Endless uses `app.mode === 'endless'` for that.
- **The solver's model is narrower than real play**: one run in flight, kicks only through empty boxes. A level it calls
  unsolvable could be won by juggling several runs, so the generator may discard winnable levels. Certified levels are
  always winnable. Documented in ARCHITECTURE.md.
- **3 todo tests** in `tests/gen-adversarial.test.js`: two stricter frozen-box checks (every frozen box has a neighbour
  that is not frozen / is plain from the start; the generator only guarantees a chain of frozen boxes that ends at an
  unfrozen one, which a passing test covers), and `rng.create` truncates seeds with `seed | 0` (seeds that differ
  beyond 32 bits or in the fraction give the same stream).
- Endless generates on the main thread in a `setTimeout` (up to 12 attempts, each solve + certify); the time on a
  low-end phone is unmeasured and could show as a frozen "preparing" button on Hard and Extreme.
- The audio mute flag is written twice (`plateLoop.save.sound` and `plateLoop.sound`); the `tap` sound is defined but
  unused.
- API.md still describes the pre-playtest belt and sim in sections 4 to 6 and 8; ARCHITECTURE.md lists the differences.
  `config.KIND_COLOURS` differs from the hex values in API.md and ART.md (the code's list is in use). A stale comment about
  pieces leaving "at once" in the header of `tests/browser/scene.spec.js`.
- Mid-level state is not saved by design: a reload restarts the level (same structure, new kind permutation).
- Not built (plan): the "neck" layout, a daily level, levels beyond 500.
