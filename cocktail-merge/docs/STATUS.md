# Status

Version 1.2.0, 2026-11-01. Ready (listed in the selector's first section). The game's design, architecture and
the way to change it are in `DESIGN.md`, `ARCHITECTURE.md` and `HOW-TO-CHANGE.md`; `RELEASE.md` is the checklist.

## What changed in 1.2.0 (three tables, a best per table, the Pineapple Punch)

Every new game (Play, New Game, Play Again, Restart, the R key) opens a chooser: Easy (the former Relaxed), Normal (the
former Standard) or Hard (Normal plus tier 10, the Pineapple Punch, between the Margarita and the Sunrise; DESIGN 2.13).
The chooser shows each table's best; the best is kept per table (`save.bests`), the HUD, the end cards and the share
line say which table, and the title line lists the tables played. A save from before 1.2.0 keeps its single best as
the best of the table it was set to; stored runs restore (old mode names map). The "Relaxed table" switch is gone from
the settings. The strip shows the mode's ladder (10 slots on Hard); the collection shows ten drinks in Hard's order.
Tier ids never changed: the Punch is id 10, the merge order per mode is a ladder of ids (`rules.LADDER / NEXT / RANK /
TOP`); size-dependent effects go by rank. New painter `src/art/tier10-pineapple-punch.js` (a round punch goblet with
ice, one glass straw, a pineapple ring with its crown on the rim), no baked glow.

## What changed in 1.1.2 (the arcade's changelog and profile)

Nothing in the game's own files but the version and the `news.js` entry: the arcade kit now opens the changelog
card by itself on the title once per version for a returning player (one change per page, older / newer), the
selector's "What's new" button shows the same, and the selector's profile holds the backup of every game.
`release.json` says when the game went live (`"released"`, the selector's "New!" badge for two weeks).

## What changed in 1.1.1 (the arcade kit)

The game loads the arcade kit (`shared/`, see `../docs/GAME-SPEC.md` and `../shared/README.md`) first. Nothing in
the game's look or rules changed; the proof was a DOM snapshot of 16 screens at 360×678 and 390×844 before and
after, identical except:

- a round "All games" button in the title's top-left corner (the mute button's counterpart; a fourth chip would
  have pushed the inline how-to card off a 390×844 title), `data-arcade="home"`,
- a Share button on the win card and the game-over card (`Arcade.share`: the OG image with the score line),
- the performance mode switch sets the arcade's (`arcade.perf`): the kit measures frames while playing and
  switches by itself (with a toast); `save.lowGfx` mirrors it and `applyLowGfx` applies it as before,
- the kit's loading screen covers the boot (the title scene load), `Arcade.screen()` is told every state change,
- `manifest.webmanifest` (new, 192 / 512 px icons) makes the game installable; the kit offers it once on phones,
- `news.js` holds what changed per version (this entry; the selector's card shows it).

Gap against the spec: the game is English only (`langs: ['en']` in `Arcade.init`).
