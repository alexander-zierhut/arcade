# Plate Loop: the art spec

Every sprite of the game is a small hand-written SVG in `assets/sprites/`, drawn to this page. The renderer
rasterises each once into a canvas bitmap, so a sprite must look right when scaled to **40 px** (a piece on a
plate on a 360 px wide phone) and still look good at 128 px (how-to cards, the title). Draw bold, simple shapes;
no detail smaller than 3 units in a 64-unit box survives.

## The scene

A quiet sushi counter at night: top-down with a slight tilt (we look down at about 60°, so a piece shows its
top and a little of its front face). The counter is slate (a cool night tone, so the kraft boxes and the plate
colours pop), the belt steel with a green light strip, the plates cream, the takeaway boxes kraft paper. The
accent of the whole game (buttons, chips, the belt strip) is a vibrant green. The sprites sit on these:

| name | hex | used for |
|---|---|---|
| counter | `#22303A` | the table (background of every contact sheet); grain `#2B3C47` |
| belt | `#4A5361` | the conveyor; top edge `#6B7584`, outline `#262E38`; strip `#3FD47A` normal, `#FF4D4D` when full |
| accent | `#3FD47A` | buttons, chips, card borders, the belt strip; text on it `#10241A` |
| plate | `#F4EBDD` | an empty plate: a rounded square (corner radius 22 %), drawn by the renderer; rim `#D9CBB5`; shadow `#C9B89F`. `plate.svg` is only used on cards |
| kind plate | `config.KIND_COLOURS` | a plate carrying a piece (belt or box slot) is a solid rounded square in the piece's kind colour (Alex: as much colour area as possible): coral, red, yellow, pink, brown, orange, dark green, purple, teal, indigo, lilac, lime (hue-spread on purpose, not the food's own colour); hidden piece: steel `#8A93A1` |
| kraft | `#D9A86C` | box body; sides `#B8864A`; tray `#F1DDB3`; grooves `#E9D2A0`; lid `#DDAE72` |
| ink | `#2A1A12` | every outline (stroke-width 2 in a 64 box) |
| cream text | `#F4EBDD` | text on dark; cards are cream with ink `#1E2A33` |
| tiers | easy `#2BB5A0`, normal `#4F7CFF`, hard `#F2C14E`, extreme `#E05297` | the level pill |
| steel | `#B8C0CC` | cloche, shutter, clips; dark `#7E8794`; light `#E3E8EF` |
| ice | `#BDEBFF` | frost; dark `#7FC8E8` |

The sprites' own colours (the food) stay warm and natural; the plate under a piece carries the kind colour.

## Style rules (every file)

- Flat vector: fills, at most **one shade tone** (the fill darkened ~15 %) and **one highlight** (white at
  30-40 % opacity, an ellipse or a short stroke). No gradients, filters, patterns, masks, text, images, scripts,
  external references. `stroke-linejoin="round"`, `stroke-linecap="round"`.
- Every closed shape has the ink outline `#2A1A12`, `stroke-width="2"` (in a 64-unit viewBox; scale the width
  with the viewBox: 3 in 96, 4 in 128, 8 in 256, 16 in 512).
- The file starts with `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 W H" width="W" height="H">`,
  nothing before it (no XML prolog needed), ends with `</svg>`. Under 8 KB. Every `id` (if any) is prefixed with
  the file name (`salmon-shadow` in `salmon.svg`), so files can be inlined together.
- Leave a 2-unit margin: nothing touches the viewBox edge.
- Shadow: a piece on a plate casts a soft ink ellipse at 20 % opacity under its base, slightly offset down.
- Readable by shape **and** colour: a colour-blind player must tell every kind apart by silhouette alone.

## The pieces (12 kinds, `assets/sprites/<name>.svg`, viewBox `0 0 64 64`)

A piece fills about 52 × 44 units, centred, base around y = 50 (it sits on a plate that the renderer draws
underneath; do not draw the plate). Viewed from above-front: the top surface is the main shape, a thin front
face (the shade tone) under it gives the tilt. Nigiri = a rice pillow (white `#FFFFFF`, shade `#E6E0D6`, with
3-4 tiny rice-grain ticks) with the topping draped over it. Maki = a slice seen from above: a nori ring
(`#1E2A1F`, shade `#101810`) around white rice with the filling in the middle. Gunkan = a nori wall around rice
with the topping heaped on top.

| id | file | kind colour (for tints) | what it looks like |
|---|---|---|---|
| 0 | `salmon.svg` | `#FF8A5B` | salmon nigiri: coral-orange slab with 3 pale diagonal fat lines, over rice |
| 1 | `tuna.svg` | `#D7263D` | tuna nigiri: deep red slab, one lighter sheen, over rice |
| 2 | `tamago.svg` | `#FFD23F` | tamago nigiri: yellow egg block with a dark nori band around the middle, over rice |
| 3 | `ebi.svg` | `#FF6B6B` | ebi nigiri: a butterflied shrimp, coral with white chevron stripes and a red tail tip, over rice |
| 4 | `unagi.svg` | `#7A4A1E` | unagi nigiri: brown glazed eel with 2 dark grill lines and a glossy highlight, a thin nori strap across, over rice |
| 5 | `ikura.svg` | `#FF7F11` | ikura gunkan: nori cup heaped with 8-10 bright orange roe balls, each with a white glint |
| 6 | `kappa.svg` | `#6CC24A` | kappa maki slice: nori ring, white rice, a green cucumber square in the middle |
| 7 | `tekka.svg` | `#C8102E` | tekka maki slice: nori ring, white rice, a red tuna square in the middle |
| 8 | `california.svg` | `#F4A261` | california roll slice: inside-out (rice outside, speckled with orange roe dots), a thin nori ring inside, avocado green and crab pink in the middle |
| 9 | `inari.svg` | `#C98B3A` | inari: a golden-brown fried tofu pouch, pillow-shaped with a folded top edge, a little rice showing at the opening |
| 10 | `tako.svg` | `#B56FA8` | tako nigiri: an octopus slice, white flesh with a purple-pink skin edge and 2-3 sucker dots, over rice |
| 11 | `uni.svg` | `#F6A21E` | uni gunkan: nori cup with a mound of orange-yellow sea urchin tongues (4-5 lobes) on top |

## The overlays and props

| file | viewBox | what |
|---|---|---|
| `plate.svg` | `0 0 64 64` | a round plate seen from above-front: cream disc (r ≈ 28) with a rim ring (`#D9CBB5`) and a thin dark shadow under its lower edge; a faint blue-grey ring line as decoration. Empty: no food. |
| `cloche.svg` | `0 0 64 64` | a steel cloche (dome cover) sitting on a plate-sized footprint: dome `#B8C0CC`, dark side `#7E8794`, a bright highlight stroke, a small knob on top. Covers a hidden piece. |
| `clip.svg` | `0 0 64 64` | a wooden chopstick clip / skewer joining two pieces: a horizontal bamboo stick (`#D9B36A`, shade `#B08A3E`) with a rounded end cap at each side and a red cord loop in the middle. Drawn over the seam between two pieces. |
| `padlock.svg` | `0 0 64 64` | a padlock, body in the kind colour placeholder `#FF00FF` (the renderer substitutes the lock's colour), steel shackle `#B8C0CC`, keyhole in ink. |
| `keytag.svg` | `0 0 64 64` | a small key with a tag: key in steel, tag a rounded rectangle in the placeholder `#FF00FF` with a hole and a ring. It hangs on a piece. |
| `noreturn.svg` | `0 0 64 64` | a round "no returns" sign: lantern-orange disc, white ring, a white arrow pointing down into a slot with a bar across the way out (the one-way flap's sign). No letters. |
| `stamp.svg` | `0 0 64 64` | a round "done" sticker for a closed box: cream disc, ink ring, a bold green check mark (`#3BA55D`), a tiny red ribbon tail. |
| `bell.svg` | `0 0 128 128` | a brass counter bell ("order up"): dome `#E0A92B` (shade `#B6851A`), black base, a button on top, two motion arcs on each side. For the win card. |
| `chef.svg` | `0 0 128 128` | a friendly sushi chef from the chest up, shrugging (palms up), white jacket, headband with a red dot, calm face (dots for eyes, a small mouth), no teeth, no text. For the lose card. |
| `logo.svg` | `0 0 256 128` | the title art: a short curved piece of belt (dark steel, green strip) with three plates on it carrying a salmon nigiri, a kappa maki and an ikura gunkan, composed from the finished sprites. No lantern, no letters (the name is HTML text). |
| `icon.svg` | `0 0 512 512` | the app icon: a rounded square (radius 96) filled `#2B1B14`, a cream plate centred (r ≈ 170) with a salmon nigiri on it, a lantern-orange ring around the plate suggesting the belt. Bold, readable at 48 px. |

## Rendering check

`node scripts/render-svg.js --check assets/sprites/*.svg` validates the rules above. `node scripts/render-svg.js
out.png 128 assets/sprites/salmon.svg` renders one sprite; with several files it renders a contact sheet on the
counter colour. Look at the PNG: at 128 px it must read instantly as the thing in the table, at 40 px (render
with 40) it must still be told apart from every other kind.

## The takeaway box (`box-open.svg`, `box-closed.svg`, viewBox `0 0 132 44`)

The box body is a sprite, drawn horizontally with the **mouth on the right** (the renderer mirrors or rotates it
for the other sides and overlays the square plates and pieces). The renderer maps the whole 132 × 44 sprite onto
the box rectangle. Geometry: the **back wall** x 0..16 is the lid folded back (kraft band `#DDAE72`, a crease, a
thumb notch); the **four slots** are 29 units each, x 16..45, 45..74, 74..103, 103..132, with a rounded-square
well (side 25, r 5, `#E9D2A0` / `#D2B27A`) centred at y 22; the far wall (y 0..6) shows its inner face `#E9C78F`,
the near wall (y 38..44) its outer face `#B8864A`; a cream label sticker with a red dot sits on the far wall; the
open right end has a short folded lip. `box-closed.svg`: the lid down over the whole sprite (`#DDAE72`), a light
top strip, a tuck tab at the mouth end, a translucent window at x 92..120, creases at the left, the middle
x 46..86 plain for the stamp the renderer draws. Calm: no twine, no flap, few details.
