# Status

Version 1.0.0, 2026-10-18.

## What is in it

- A gate runner. The waddle is steered left and right. Gates come in pairs (`+k`, `-k`, `xk`, `/k`), and the side the waddle is on decides which one applies.
- Snow walls and seal packs, which the waddle shoots down or dodges.
- Iced allies. Breaking one gives penguins or the big penguin, which doubles the fire rate for the rest of the level.
- Fish, which add one penguin each.
- A walrus at the end of every level.
- 50 authored levels, then generated levels without end.
- Riot levels: every 4th authored level and every 5th generated level.
- A shop with three upgrades (bigger waddle, faster snowballs, harder snowballs), five levels each.
- One to three stars per level, by how much of the peak waddle is still alive at the end. Coins for every win; replaying a level already won pays a quarter.
- Progress kept in the browser, a sound toggle, and pause with Escape or P.
- A phone-first layout with mouse, touch and keyboard steering.

## What is tested

- `npm test`: 25 unit tests under Node. They cover the game rules, the save format and the level set. Every authored level is won by the greedy bot, both with the shop its economy allows and with the reference shop. Generated levels 51 to 300 are won with a maxed shop.
- `npm run test:browser`: the real game in headless system Chrome. It covers boot and sprite loading, steering, pause, a full level played by mouse, buying and reload, a lost level, layout at five screen sizes, and no page or console errors.
- CI: the version and storage checks, the built site, and each game booted in Chrome.

## Known limitations

- Sound is synthesised in the browser. There are no sound files.
- Levels beyond 50 are generated and calibrated the first time they are played. In Node that takes 50 to 100 ms per level. The result is kept in memory for the page session only.
- The waddle draws at most 220 penguins (`DRAW_CAP`) and at most 400 count for damage (`SHOOT_CAP`). The badge shows the real number.
- There is no save in the middle of a level. A reload returns to the title screen.
- Waddle sizes grow large in the later authored levels (thousands by level 40, since + gates scale with the waddle and can be shot up to double). The badge shows the number; the drawing is capped.

## Ideas for later

- Save the level in progress, so a reload can resume it.
- Calibrate the generated levels at build time, so that the first play of a level does not wait.
- Ice floes drifting in the sea beside the road, for more motion.
- A "sloppy" bot in the tests (greedy with a share of random gate picks) to measure mid-level difficulty, not only the best and the random play.
- Offer real sound files as an option, keeping the synthesised sounds as the fallback.
