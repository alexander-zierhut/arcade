# Plate Loop: status

**Version 0.2.2, beta.** 0.2.2 (late 2026-11-06): buffer levels (plan R29c, parksolver + simsolver: levels without a
one-run-at-a-time solution, certified by guided play on the real belt) at difficulty 10, in the hunt and on the spikes
from 225 on, the real-time bot stage (R29b) on the top difficulties and the top of the curve, the tight recipe
(R29d) with the grip ranking at difficulty 10 and 497-500, hidden pieces as a choice at 10, and the lookahead
measure of 0.2.1. Earlier: 0.1.0 went live on 2026-11-04; the first players found two bugs within a day and the game
was far too easy. 0.2.0 (2026-11-06) fixed the bugs, rebuilt all 500 levels on a measured difficulty curve, gave
Endless ten difficulties with shareable level codes, and added two looks (plain graphics, stream belt), favourites
and replays. 0.2.1 (the same evening, after Alex beat a "4.7" first try) changed the measure to lookahead players
(plan R29: H_k for k = 0 to 16), rebuilt the levels again around deep traps, added the hunt's lookahead setting and
three deal rules (no front run of three on Hard/Extreme, no pair of one kind, hidden pieces of a different kind).
`release.json` keeps `"status": "beta"` and `"released": "2026-11-04"`.

## What is in it

- The engine for rules R1 to R30 (`src/engine/`): a tap takes the run out of the box and paces it out one piece per
  0.9 s on plates reserved at the tap; a hidden piece ends a run; landing with conditional pouring (R9) and the
  completion preference (R10b); closing, hidden pieces, bound pairs, wrapped, frozen, locked and one-way boxes;
  **R12b** (a closing lid reveals what is under it and frees a key inside); loss by a jam (R13) and by a hopeless
  position (**R13b**, `rules.deadKinds`: a kind whose last pieces are shut away for good); deterministic sim.
- Two layouts, `ring-2col` (14 boxes) and `counter` (12 boxes), belt direction per level.
- Solver with `analyze` (the whole position graph: win chance of a random tapper), tick-accurate bot, reverse-play
  generator with a hardness search (`generate({ hardness })`), the ten Endless difficulties (`DIFFICULTY`) and level
  codes (`L7-ABCDE`).
- **500 fixed levels on a difficulty curve** (`scripts/level-curve.mjs`): levels 1-15 gentle (H under 1.1), the mean
  H above 2 from level 100 on (a random tapper wins one game in a hundred or fewer), every 25th level a spike (the
  hardest of 200 candidates, H 3 to 4.7), nothing hidden from 401 on. Every level solver-solved, bot-certified, with
  its hardness stored (`level.hard`). Regenerating all 500 takes about 25 minutes.
- Endless: difficulty 1-10 (structure tier plus hardness window), the search in a Web Worker with a progress label
  (2.5 to 20 s budget, 0.6 of that in the performance mode), "no luck" forced from 9 on, the level code on the end
  cards (tap to copy) and in the share text as `?code=`, a code field in the chooser, `?code=` in the address starts
  that level. "Advanced": one chip per mechanic (saved, carried in the code as flags) and the hunt (search without
  end, live candidates / best hardness / seconds since the last new best, "Play the best"). Codes carry a format
  letter; `tests/codes.test.js` freezes golden codes so a future change cannot silently alter shared levels. Bests
  per difficulty (the first beta's per-tier bests are carried over).
- The canvas scene: square kind-colour plates, box sprites, trapdoor departures (no plate races along the belt any
  more), covers, effects; plain graphics (flat cubes, simple boxes) and the stream belt (particles, free-slot counter)
  as settings; 12 sushi kinds plus props as SVG sprites, the performance mode, synthesised sounds, kind permutation.
- Title, endless chooser, how-to cards, pause, settings (sound, graphics, belt, kit rows), win and lose cards (two
  lose texts: jam, hopeless), German and English, save under `plateLoop.save` with `levelsVersion` 2.
- **Favourites**: a star on the pause, win and lose cards marks the level on screen (a fixed level by number, a
  generated one by its code); the title's "Favourites" chip lists them with Play and Remove; they live in the save, so
  the arcade's backup and export carry them.
- **Replays**: every round records each frame's time step and the taps between frames; "Watch replay" on the end
  cards re-runs the round bit for bit on a fresh sim (the engine is deterministic), sped up so it fits into 30 s
  (1x to 120x, the pill shows "Replay 12x"), muted; the pause button or Escape ends it, the end card comes back.
  Not persisted: a reload loses the recording.
- Arcade kit integration as before; news entry 0.2.0 (de, en).
- Tests: `npm test` (node): engine, rules-adversarial, fixes (the two bugs and R13b), gen, gen-adversarial, levels
  (all 500 validated and not hopeless, a subset re-certified, the curve, the stored hardness, 8 regenerated from the
  tables), layouts, rng. `npm run test:browser`: boot, `ui.spec.js` (incl. the chooser, codes, the new settings rows),
  `scene.spec.js`, real levels, layouts at five viewports.

## Known gaps

- Seven levels of 401-500 ended up to 0.8 under their hardness window on the first full run; the top range was
  regenerated with every mechanic allowed (`fullAllow`), see the log of that run in the commit message. If some still
  sit under the window the level suite reports them; raising `candidates` in the curve is the lever.
- The hardness H is computed on the abstract model (one run in flight, natural landings). It ignores the number of
  plates N and the real-time juggling of several runs, so a big-N level can play easier than its H says; the hard
  and extreme structures keep N at 4 to 6 where the model is close to real play.
- The Endless search at difficulty 9-10 needs up to 20 s on a desktop and more on a slow phone (the budget is wall
  time, so the phone gets fewer candidates and a somewhat easier level); the progress label shows the best H found.
- The stream belt is an experiment next to the plates (Alex wants to compare both on the phone; plain graphics
  always use the stream): particles are plain rounded squares in the kind colour, not chopped sushi sprites; the key
  tag rides at the head of the trail. Not done from the original: the belt slowing down when it is full, and the
  stream filling the box slot by slot (a landing uses the usual slide).
- The browser suite checks the trapdoor timings only through `staged()` and the engine positions; no pixel test of
  the hatch or the stream.
- Still open from 0.1.0: boxes are 41 px tall at 360x640 (44 wanted); endless levels have `id = seed`; API.md
  sections 4-6 describe the pre-playtest belt (ARCHITECTURE.md lists the differences); the mute flag is written twice;
  mid-level state is not saved by design; the "neck" layout and a daily level are not built.
