# Amendment: integration round (key: integrator)

Applies on top of the other amendments in this folder. Section numbers refer to DESIGN.md revision 3.

## 3.8 FX: chain labels (append to the "Chain label" row)

Only the newest chain label is shown: a new `CHAIN ×d` label removes any chain label still on screen, so a fast
chain never stacks two half-faded labels on top of each other. (`src/render/fx.js`, `text()`.)

## 4.2 Glass building blocks: step 7 highlights (append)

The default sparkle dot (88 % of the height range) is clamped onto the front wall, at least 0.10 below the lowest
point of the front rim (`rimY + K_RIM·rimRx + 0.10`), and never below `y0`. This fixes the "droplet over the rim"
look on T1 and T6, the same rule `glass.condensation` already applies to droplets (`src/art/glass.js`).

## 5.3 / src/art/sprites.js

The fallback radius list in `sprites.js` (used only when no radii are passed) now matches the revision-4 tier radii:
`[0, 5.2, 5.92, 7.2, 8.48, 9.92, 11.52, 13.28, 15.2, 17.6]`.

## Appendix 9 / 2.8: difficulty decision

Option (a) of `physics-feel.md` §9 is taken for this round: the danger lines stay at y 130 (Standard) and 133
(Relaxed). A careful player nearly always wins (smart bot 99.5 %); a careless one loses about half the time (random
bot 50.5 % / 55 % wins). Moving the line to meet the old targets (y ≈ 77-88) would shrink the play area by more
than the glasses shrank, which works against owner item 8. If the owner wants it harder, the next lever is
option (b), `DANGER_Y` 115 / 118 (random < 40 %, smart 98 %), which also needs the test edits listed in
`physics-feel.md` §9.

## 5.9 Save: `music` field (pending)

The `src/game/save.js` and `tests/spawn.test.js` diff in `audio.md` A14 was not applied in this round. Until it is,
`src/ui/storage.js` carries `music` itself (default true), so the setting is persisted and restored correctly.
