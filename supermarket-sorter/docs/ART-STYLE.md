# Style guide: the "Vorbild" look (v3, 2026-10-16)

This guide is derived from the owner's screenshot of the original game (Falcon's Goods Sort, level 535) and is
**binding for every product sprite**. It replaces sections 2 and 2b of `docs/ART-SPEC.md`; the file rules, class
boxes, natural proportions and parody rules of ART-SPEC stay. Read both.

## 1. What the original looks like (the target)

The original's products are small **3D toy renders**: chunky, rounded, softly lit plastic and cardboard objects on a
light wood shelf. Looking at the screenshot, item by item:

- **No outlines.** Nothing is drawn with a black line. Edges exist because a lit face meets a shaded face, and
  because every object is a little darker along its rim than in its middle.
- **A raised camera.** We look at the shelf from slightly above, so every cylinder shows its **top as an ellipse**
  (cans, buckets, jars, bottle caps, toilet rolls), every box shows a thin **top face**, and lids sit visibly on
  top of their containers.
- **One key light, top left, slightly in front.** The left third of every rounded body is light, the right quarter
  is dark, and there is a crisp **specular stripe** on glossy things (plastic bottles, buckets, lollipops, the
  popsicles). Cardboard and paper are matte: smooth gradient, no stripe. The **base of every object is darker**
  (ambient occlusion where it meets the shelf), and a soft dark line sits **under every lid and cap**.
- **Chunky proportions.** Bottles are fat with short necks and oversized caps; buckets are wide; tissue boxes are
  cubes; the mustard bottle is a squat barrel. Nothing is slender. Items fill their slot: about 85 % of the slot
  width, and a bottle reaches almost the row height.
- **Flat colour blocking.** Each object has ONE body colour and ONE accent (lid, band, cap). Colours are saturated
  candy tones: coral red, turquoise, lavender, lime, sky blue, sun yellow, candy pink, chocolate. Labels are a
  single white or cream panel, or a coloured band.
- **Almost no text.** Of the thirty-odd visible products, about eight carry one short word (`SNACK`, `Cheto`,
  `Klena`, `CAKE`, `BONTY`, `MUSTARD`, `candy`). The rest carry none. Where there is an icon it is one big simple
  shape (a chip, a flower, a drum skin), never several.
- **Everything casts a soft contact shadow** on the board. (In our game the board draws that shadow in CSS: do not
  paint a ground shadow in the sprite.)

## 2. Hard rules (checked by the validator or by the sheet review)

1. **No black outline anywhere.** The only stroke allowed on the outer silhouette is the **rim**: the body colour's
   rim tint (table in section 4) at `stroke-width="1.5"` and `stroke-opacity="0.7"`. Inner shapes have no stroke,
   except a 1-unit rim in their own dark tint where two same-coloured parts meet.
2. **Gradients carry the volume.** Every body, lid, cap and band is filled with a gradient (section 5). Flat fills
   are only for label panels, icons and text. Up to **6 gradients** per file (linear or radial).
3. **Top faces are visible.** Cylinders show a top ellipse with `ry = 0.18 × rx`; boxes show a top face that is a
   parallelogram 10 units deep, shifted 6 units to the right; lids sit on top as their own cylinder.
4. **Specular on gloss, none on matte.** Plastic, glass, metal, glazed and lacquered things get one white stripe
   (`fill="#FFFFFF" fill-opacity="0.55"`, rounded, 7-9 % of the body width, from 12 % below the top to 25 % above
   the base, at 22-30 % from the left edge). Cardboard, paper, cloth, bread and produce skins get none.
5. **Base occlusion.** A vertical gradient from transparent to `#1E100A` at opacity 0.38 covers the bottom 12 % of
   every body; a 2-unit-high dark band (`#1E100A`, opacity 0.3) sits directly under every lid, cap and ring.
6. **One word or none.** At most one `<text>`, at most 9 characters, `font-size` 11-16, `font-weight="900"`,
   `font-family="Arial, Helvetica, sans-serif"`, only when the word carries a parody (section 4 of ART-SPEC).
   Everything else: no text.
7. **One icon or none.** At most one icon of at most 6 shapes, 35-55 % of its panel, flat fills, no outline.
8. **Chunky.** Within the class box, draw at the WIDE end of the range: bottle width 48-50, can 56-58, jar 60-62,
   tub 62-64, box 62-64, bag 64-66, carton 56-58. Caps and lids are at least 55 % of the body width and 10-14
   units tall. Necks are short (at most 14 units).
9. **Budget:** at most 45 elements, at most 8 KB (hard 9 KB), `viewBox="0 0 100 100"`, floor at y = 95, inside
   8..92 × 4..96, horizontally centred, no `<use>`, no `<style>`, no `class`, no `opacity` on `<g>`.

## 3. Materials (how each one is built)

| Material | Body gradient | Extras |
|---|---|---|
| plastic bottle, bucket, tube | cylinder gradient (section 5), specular stripe | glossy cap with its own cylinder gradient and top ellipse |
| glass jar, glass bottle | cylinder gradient of the CONTENT colour, specular stripe, a second thin white stripe (opacity 0.3) near the right edge | metal or plastic lid with top ellipse |
| tin can | cylinder gradient of the label colour, specular stripe, a 6-unit light-grey metal rim top and bottom (`#DCDCDC` to `#8E8E8E`) | top ellipse in light grey with a smaller dark ellipse inside (the lid seam) |
| cardboard box, carton | box shading (section 5): front face slightly lighter at the top, side face darker, top face lightest; matte | a 1-unit crease line in the dark tint where faces meet |
| paper or foil bag | pillow gradient: left light, middle body, right dark, with two soft vertical creases (light stripes at opacity 0.25); crimped top edge as a zigzag or scallop | matte, no specular |
| cup / tub (yogurt, pudding) | truncated cone: wider top ellipse, cylinder gradient, lid as a flat ellipse in the accent colour with a lip | glossy: specular stripe |
| produce (fruit, vegetables) | radial gradient: light spot at 35 %/30 % of the shape, body colour at 65 %, dark tint at the edge | a small leaf or stem in leaf green; stacked or in a tray per ART-SPEC section 3 |
| bread, cake, pastry | radial or vertical gradient in bread tones (`#E0963C` to `#B86A24`), matte | crust darker at the top, a few light flour spots at most |

## 4. Palette (exact values; copy them)

Pick the body from the first column, use its light tint on the left of the gradient, its dark tint on the
right, its rim tint for the 1.5-unit rim. The accent (cap, lid, band) is a different row. At most two rows per
product, plus white `#FFFFFF`, cream `#FFF7E8` and the dark `#1E100A` for occlusion and text.

| name | body | light tint | dark tint | rim |
|---|---|---|---|---|
| coral red | `#FF5A4E` | `#FF9991` | `#B74238` | `#7C2F27` |
| orange | `#FF8C2E` | `#FFB87D` | `#B76422` | `#7C4419` |
| sun yellow | `#FFD23F` | `#FFE388` | `#B7942E` | `#7C6120` |
| lime | `#A6E22E` | `#C8ED7D` | `#7A9F22` | `#576819` |
| leaf green | `#3ECF6A` | `#87E1A3` | `#34924B` | `#2B6032` |
| turquoise | `#2FD5C8` | `#7EE5DD` | `#2A968B` | `#25635A` |
| sky blue | `#4FB6FF` | `#92D2FF` | `#3F81B1` | `#335671` |
| cobalt | `#3B6CFF` | `#85A4FF` | `#324FB1` | `#2A3771` |
| lavender | `#9D7BFF` | `#C2ADFF` | `#7459B1` | `#533D71` |
| candy pink | `#FF6FB5` | `#FFA6D1` | `#B7517E` | `#7C3852` |
| chocolate | `#7A4A2A` | `#AD8F7B` | `#5D3720` | `#452817` |
| cardboard | `#D9A86B` | `#E7C9A3` | `#9D774C` | `#6D5033` |
| cream white | `#FFF7E8` | `#FFFAF1` | `#B7ADA1` | `#7C7167` |

Metal: `#DCDCDC` light, `#B4B4B4` body, `#8E8E8E` dark, `#5A5A5A` rim. Natural produce keeps its natural hue but
uses the saturation of this table (tomato = coral red, banana = sun yellow, kiwi = lime, aubergine = lavender,
orange = orange, grapes = cobalt or lavender). The manifest `color` is the body column value.

## 5. Construction recipes (copy these, change the numbers)

**Cylinder gradient** (bottles, cans, jars, tubs, caps): horizontal, five stops.

```xml
<linearGradient id="b" x1="0" x2="1" y1="0" y2="0">
  <stop offset="0" stop-color="LIGHT"/><stop offset="0.22" stop-color="BODY"/>
  <stop offset="0.55" stop-color="BODY"/><stop offset="0.85" stop-color="DARK"/><stop offset="1" stop-color="RIM"/>
</linearGradient>
```

**Box shading** (boxes, cartons): front face `fill="BODY"` with a vertical gradient from LIGHT (top) to BODY (35 %),
side face (right, 12 units wide, top edge slanted up 6 units) `fill="DARK"`, top face (parallelogram) `fill="LIGHT"`.

**Base occlusion** (every body):

```xml
<linearGradient id="ao" x1="0" x2="0" y1="0" y2="1">
  <stop offset="0" stop-color="#1E100A" stop-opacity="0"/><stop offset="1" stop-color="#1E100A" stop-opacity="0.38"/>
</linearGradient>
<rect x="BODY_LEFT" y="BODY_BOTTOM-11" width="BODY_WIDTH" height="11" fill="url(#ao)"/>
```

**Top ellipse** of a cylinder of width W at y = TOP: `<ellipse cx="50" cy="TOP" rx="W/2" ry="W*0.09" fill="LIGHT"/>`
and for an open can a smaller `<ellipse ... rx="W/2-3" ry="(W/2-3)*0.18" fill="DARK"/>` inside.

**Specular stripe** on a body from y1 to y2 and left edge L of width W:
`<rect x="L+0.24*W" y="y1+0.12*(y2-y1)" width="0.08*W" height="0.63*(y2-y1)" rx="0.04*W" fill="#FFFFFF" fill-opacity="0.55"/>`

**Label band** on a cylinder: a path whose top and bottom edges curve like the top ellipse
(`M L,Y1 Q 50,Y1+3 R,Y1 V Y2 Q 50,Y2+3 L,Y2 Z`), `fill="#FFFFFF"`, then the icon and the word inside.

**Reference sprite (a glossy plastic bottle of coral red with a sun-yellow cap, no text):**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
<title>Referenz Flasche</title>
<defs>
<linearGradient id="b" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#FF9991"/><stop offset="0.22" stop-color="#FF5A4E"/><stop offset="0.55" stop-color="#FF5A4E"/><stop offset="0.85" stop-color="#B74238"/><stop offset="1" stop-color="#7C2F27"/></linearGradient>
<linearGradient id="c" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#FFE388"/><stop offset="0.25" stop-color="#FFD23F"/><stop offset="0.6" stop-color="#FFD23F"/><stop offset="0.88" stop-color="#B7942E"/><stop offset="1" stop-color="#7C6120"/></linearGradient>
<linearGradient id="ao" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#1E100A" stop-opacity="0"/><stop offset="1" stop-color="#1E100A" stop-opacity="0.38"/></linearGradient>
</defs>
<path d="M26,36Q26,27 36,25H64Q74,27 74,36V88Q74,94.5 67,94.5H33Q26,94.5 26,88Z" fill="url(#b)" stroke="#7C2F27" stroke-width="1.5" stroke-opacity="0.7"/>
<rect x="26" y="83.5" width="48" height="11" fill="url(#ao)"/>
<path d="M27,54Q50,57 73,54V73Q50,76 27,73Z" fill="#FFFFFF"/>
<circle cx="50" cy="63.5" r="7" fill="#FF5A4E"/><path d="M50,54q-2,4 0,8q2,-4 0,-8" fill="#3ECF6A"/>
<rect x="37" y="24" width="26" height="4" fill="#1E100A" fill-opacity="0.3"/>
<rect x="36" y="14" width="28" height="12" rx="2" fill="url(#c)" stroke="#7C6120" stroke-width="1.5" stroke-opacity="0.7"/>
<ellipse cx="50" cy="14" rx="14" ry="2.5" fill="#FFE388"/>
<rect x="37.5" y="33" width="4" height="44" rx="2" fill="#FFFFFF" fill-opacity="0.55"/>
<rect x="38" y="16" width="3" height="8" rx="1.5" fill="#FFFFFF" fill-opacity="0.5"/>
</svg>
```

Note what the reference does NOT have: no black outline, no second icon, no word, no flat shade band; and what
it has: light-to-dark cylinder, visible cap top, dark seam under the cap, base occlusion, one specular stripe,
one icon on one white band.

## 6. Per-class proportions (units, outline included)

| class | width | body top | notes |
|---|---|---|---|
| bottle | 48-50 | shoulders at y 26-30, cap 12-14 tall and 26-30 wide, neck at most 12 tall | squat and fat, like the mustard bottle in the original |
| can | 56-58 | top ellipse at y 12-16 | metal rims top and bottom, label band covers 70 % |
| jar | 60-62 | lid 11-13 tall, as wide as the body or 2 units wider | content colour shows above and below the label |
| tub | 62-64 (top), 54-56 (base) | lid ellipse at y 16-20 | truncated cone, lid in the accent colour |
| box | 62-64 | top face at y 10-14 | front, side, top faces; label panel on the front |
| carton | 56-58 | gable or brick | gable roof is two slanted faces, light and dark |
| bag | 64-66 | crimped top at y 8-12 | pillow sides bulge 3-4 units beyond the seal |
| loose | 52-66 | natural proportions (ART-SPEC 3) | stacked or in a tray; produce uses the radial gradient |

## 7. Don'ts (seen in earlier passes, now forbidden)

- A black or near-black outline around the silhouette or around inner shapes.
- Two words, a brand word plus a product word, text under 11 px, text on a cream panel with cream letters.
- Stripes, dots, checker patterns, confetti, "sparkle" stars, more than one icon.
- A flat uniform body colour with a flat shade band instead of a gradient (that is what made items look like the
  darkened back-layer items).
- Stretching a fruit or a bun to fill the box (ART-SPEC section 3).
- A ground shadow painted into the sprite.

## 8. Checklist before you return

1. Validator passes, geometry passes, the sheet was looked at.
2. At 60 px: does the object look like a lit plastic or cardboard thing, not a sticker? Is its top face visible?
3. No black outline, no second word, no clutter.
4. Body and accent from the palette, manifest `color` = the body column value, siblings' hues 60° apart.
5. The parody (if any) still reads from shape, colour and the one word.
