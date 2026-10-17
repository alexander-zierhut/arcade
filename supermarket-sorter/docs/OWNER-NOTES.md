# Owner notes (verbatim decisions, 2026-10-10)

These are the owner's own statements about the game, translated where needed. They override research findings
and earlier assumptions. Screenshots of the real app (level 513) are in `further-deatures/`.

## Who it is for
- A free, ad-free alternative to the original, made mostly for the owner's mother. German UI, German-looking
  products (done: 180 products, German label words and brand names).

## The real app, decoded from the owner's screenshots and explanations
- Centre rack: a tall rack, two columns of compartments with 3 slots each, plus one single centred compartment at
  the top and one at the bottom. Three identical products side by side in one compartment clear.
- **Layers (depth):** behind the front products lie more products, up to 6 layers deep per compartment.
  **The whole layer advances as one:** products of layer 2 become reachable only when all three products of
  layer 1 are gone (matched or moved away), and so on. Visually only the current layer and the one behind it
  (darkened) are shown, never the deeper ones.
- **Locked compartments:** chain plus a number. In the original the number is how many ads to watch to cheat it
  open early; we do not want that. We keep locked compartments and use the number to show when the
  compartment opens by itself (decision: after that many matches).
- **Side shelves (left and right):** single-slot compartments that scroll vertically in a loop (out at the top,
  back in at the bottom). Products can only be TAKEN from them, never put there or put back. Once a product has
  been taken, bars come down from above and close that compartment. So the player must watch the free space
  in the centre rack: pulling products in without matching can leave no room, and nothing can go back.
  The scroll speed rises with the level. In very hard levels, or later in a level, horizontally scrolling
  shelves are added as well, so even more moves.
- **Timer:** around 6 minutes at level 513 (an example, not a rule).
- **Golden bunny:** a special item; it "frees a compartment" (clears it). Keep it. Mechanic consequence stated by
  the owner: when the bunny has removed products and only 1 or 2 of a kind remain, so no further triple is
  possible, the level must count as SOLVED, not stuck.
- **Silhouette items (added 19:55):** sometimes an item is shown only as a flat single-colour silhouette (for
  example a green bottle shape that turns out to be the ketchup). It is a normal, movable item of a normal type
  and matches like any other; the player just has to guess the product from its shape. This has nothing to do
  with the back layers. The colour of the silhouette does not have to be the product's real colour (the owner's
  example: a green silhouette for the ketchup), so the shape is the only hint. We want this too.
- **Solvability:** every level must always work out. With the layers especially, the generator must PROVE that it
  only produces solvable levels (owner's words: "muss man irgendwie beweisen dass der Generator auch wirklich
  nur funktionierende Level generiert").
- Boosters in the original (hammer, wand, clock freeze, shuffle) are ad-driven; not needed as such.
- HUD in the original: level, bunny counter, timer, stars as points, combo bar, pause.

## Branches
- "Gegen die Zeit" (timed): shorter time plus faster moving shelves as the level rises; later horizontal shelves.
  Faster rotation also brings products around sooner, so a shorter timer stays achievable.
- "Entspannt" (relaxed): no timer. The sorting itself gets harder: layers, locks, product variety, little free
  space. Moving shelves may stand still here, or move only slowly, without time pressure.

## Levels
- Not "5 levels and done after 10 minutes". Levels are authored or cleverly designed (quality not left to
  random chance) and then continue procedurally so the game is infinite and keeps getting harder.

## Other
- Highscore required. Option to play with or without timer required.
- Static files on S3, mobile browser, no build step, modelled on ../cocktail-merge.

## Later decisions (same day, after the first build)

- Food first: "she said she always likes looking at food". 80 extra tasty food products were drawn and the level skin
  prefers food over drinks and non-food. A burger exists now (she asked).
- The clock was "still generous" (level 14 cleared with 1:30 left), so it was tightened; more data points welcome.
- "There should definitely be some levels where the belt speed goes crazy as a challenge": turbo levels every tenth
  level from 27 (belts 2.5×).
- Horizontal belts: timed only, from level 34 (see DESIGN 4.4 and 4.7).
- Future updates must never destroy progress; progress is keyed by mode and level number, saves are versioned and
  migrated, a rules change only restarts the board in progress. Export/import of the progress as a versioned JSON
  file lives in the settings, with a fixture test per release.
- Implementation by Claude directly (no agents for code); agents were used for research, design and the asset batches
  (Sonnet) and are fine for future asset batches.
- Everything is in German by default with an English toggle.

## Decisions of 2026-10-16 (v0.3.0, after the first days of play)

- **Products were too small and differed in size** between rack, side shelves and the bottom shelf. Decision: one size
  everywhere; the HUD is compressed into one bar at the top (two lines on a narrow phone), the bottom bar is gone, the
  board gets the rest of the screen and the full width.
- **Products fill their tile:** every sprite was redrawn tall (portrait, like the original), and the game scales each
  product from its measured width so that all products are about 0.9 of a slot wide.
- **Less generic products:** "if things look like something you can actually get in a German supermarket, that would be
  way more fun". Products evoke familiar types; about one in three may be a playful near-name (the owner's example:
  a hazelnut spread that says NUTELLO). Never the real name, logo or mascot. The asset redraw may use Haiku agents.
- **Turbo levels were "way too slow for a turbo level"**: belts now run 3x, at least 1.8 cells/s, capped at 3 cells/s.
- **Debug entry** `?level=N&mode=timed|relaxed` for testing single levels without playing up to them; nothing is saved.
- **Controls less punishing:** a drop lands in the nearest compartment (sprite foot or finger within about half a row),
  a tap just beside a compartment counts for it; the nearest free slot is chosen as before.
- **Update must be compatible** with existing players (progress, records, boards in progress) and **visible**: a NEU badge
  on the title and a "Neu in Version x" card once per version.
- The side shelves may stand taller than the rack (8 visible cells need more height than 6 rows at the unified size);
  the bottom shelf then sits between them. It spans the full width when no side shelves are in the way.

## Decisions of 2026-10-16, evening (v0.3.1)

- The owner compared v0.3.0 on his phone with the original: "the Vorbild just looks so much better, better UI, more
  stylish, clearer lines, so much more contrast", plus "it needs fullscreen", "lots of unused room left and right".
  Decisions: fullscreen/app mode; one cabinet with side cells aligned to the rack rows (fewer visible cells accepted);
  action buttons back in a slim bottom row; light compartment backs with darkened back items; contact shadows.
- Products: "way more 3D, just try to match the style of the Vorbild", "less to no text, less noisy, more contrast, a
  little more neon". `docs/ART-STYLE.md` was written from the original's screenshot and is binding. Silhouette items
  must not look like back-layer items (rim, sheen, "?" badge).
- Agents: Sonnet for product passes, at most 30 at a time; Claude does the code and the QA itself.
- Later the same evening: "within the same shelf I can't change the slot ... that should still be possible": rearranging
  inside a compartment is allowed and free. "Before we ship this version I need you to put work into performance ...
  two rounds ... I don't want any functionality to change at all and all states of players to be kept intact": done with
  a measuring harness (`npm run perf`), no rule or save change. "Do you still have all of the 2D icons? I want a toggle
  in the settings between 2D and 3D icons": the v0.3.0 flat set is kept in `assets/items-2d/` and switchable.
