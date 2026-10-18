# Status

Version 1.1.1, 2026-10-18. Ready (listed in the selector's first section). The game's design, architecture and
the way to change it are in `DESIGN.md`, `ARCHITECTURE.md` and `HOW-TO-CHANGE.md`; `RELEASE.md` is the checklist.

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
