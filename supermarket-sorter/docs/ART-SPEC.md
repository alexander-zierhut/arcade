# Art spec: product items (v3, 2026-10-16)

Every product on the shelf is one standalone SVG file in `assets/items/`. This document is the contract
for whoever draws them (people or agents). Items drawn to this spec look like one set, read at 60 px on a
phone, and render cheaply on iOS Safari.

**What changed in v2 (the redraw of 2026-10-16):** products fill their tile (portrait, standing tall, see the
class boxes in section 3), labels may carry a short brand word, the budget is larger (section 1), and every
product should feel like something you could pick up in a German supermarket (section 4). Product ids and
file names never change: saved games refer to them.

**What changed in v3 (the style pass of 2026-10-16):** the owner compared the game with the original and asked for
products that look like the original's 3D toy renders: no outlines, gradients for volume, visible top faces, one
word or none, punchy colours. **`docs/ART-STYLE.md` is the binding style now** and replaces sections 2 and 2b of
this file wherever they differ. Everything else (file rules, class boxes, natural proportions, the parody rule
of section 4) stays.

## 1. File rules

- One file per product: `assets/items/<id>.svg`, `<id>` is kebab-case and starts with the category slug,
  for example `dairy-moo-milk.svg`.
- Root element exactly: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">`,
  then `<title>Product name</title>` as the first child.
- Units are viewBox units (1 unit = 1 % of the tile). The item **stands on the floor line y = 95**: its lowest
  painted pixel (outline included) is at y = 95 ± 1. Nothing may be painted below y = 96.5 or above y = 4,
  left of x = 8 or right of x = 92. No ground shadow: the shelf draws its own.
- Horizontally centred: the bounding box centre is at x = 50 ± 2.
- Allowed elements: `svg g title path rect circle ellipse line polyline polygon text tspan defs linearGradient
  radialGradient stop clipPath`. No `use` (Chrome misreports its bounding box).
- Forbidden: `image filter fe* mask pattern script style foreignObject a animate* set marker symbol`,
  external hrefs, CSS classes, `opacity` on a `<g>` (group opacity forces an offscreen buffer on iOS; put
  `fill-opacity` / `stroke-opacity` on the shape instead), embedded fonts, `@import`.
- Budget: at most 45 elements (v3), at most 8 KB (hard limit 9 KB). Round coordinates to one decimal. No editor
  metadata, no comments, no `id` attributes except for `defs` children that are referenced.
- At most six gradients per file (linear or radial), see ART-STYLE section 5.

## 2. Style rules (the "one set" look)

1. **Outline.** Every silhouette-defining shape has `stroke="#2A1B12" stroke-width="3" stroke-linejoin="round"
   stroke-linecap="round"`. Internal detail lines use the same colour at `stroke-width="2"` or `1.5`.
   The outline is what makes items pop against the wooden shelf; never omit it on the outer shape.
2. **Light from the top left.** Exactly one highlight: a rounded shape on the left third of the body,
   `fill="#FFFFFF" fill-opacity="0.35"`, no stroke. Exactly one shade: a band on the right 15-20 % of the body,
   `fill="#000000" fill-opacity="0.12"`, no stroke. Boxes and cartons may lighten their top face with
   `fill="#FFFFFF" fill-opacity="0.2"`.
3. **Flat, saturated, cheerful fills.** One main body colour per product (the manifest `color`). Caps, lids,
   rims and ribbons in a second colour (the manifest `accent`). Label panels are light (`#FFF6E0`, `#FFFFFF`,
   `#FFF1C9`) or a dark contrast (`#2A1B12`, `#1F3A5F`) so the icon reads.
4. **One big icon on the label.** A fruit, animal, plant, drop, star, flame, leaf, cow face, bee, wheat ear,
   fish, snowflake. At most 8 shapes, filling 35-50 % of the label panel. The icon is the main recogniser at
   60 px, so make it big and simple, with a 2-unit outline where it meets a light background.
5. **Text is optional and small in number.** At most two `<text>` elements, each one word of 2-8 letters,
   `font-size` 9-16, `font-family="Arial, Helvetica, sans-serif" font-weight="900" text-anchor="middle"`,
   with a fill that contrasts the panel. Typically one brand word (`NUTELLO`, `MÜLLA`) and, if there is room,
   one plain product word (`MILCH`, `SAFT`, `KEKSE`). Uppercase reads best at 60 px; a brand word may use
   Title case when the familiar product does. Long words should be short in units: keep every `<text>` inside
   the label panel. The item must still be recognisable with the text removed.
6. **Material cues, cheaply.** Glass: a second, thinner inner highlight line. Metal cans: a flat lighter lid
   ellipse with a pull-tab shape. Cardboard: a straight gable or flap. Plastic bag: a wavy top seal with
   two small crimp lines. Produce: a leaf or stem in a contrasting green.
7. **Palette.** Prefer these hues (any of them, in both a light and a deep tint):
   red `#E8453C`, orange `#F28C28`, yellow `#F7C948`, lime `#9BCB3C`, green `#3FA34D`, teal `#2BB3A3`,
   sky `#4FA3E8`, blue `#2F6BD6`, purple `#8E5BD9`, pink `#F26B9E`, brown `#8C5A2B`, cream `#FFF6E0`,
   white `#FFFFFF`, charcoal `#2A1B12`. Avoid muddy greys and desaturated pastels: they vanish on the shelf.

## 2b. The v3 look: clean, bold, a little 3D

1. **One shape, one colour, one icon.** A product is recognised by its silhouette (section 3), its body colour and
   ONE big icon (35-55 % of the label panel). Remove everything that does not help recognition at 40 px: no
   small decorations, no second icon, no stripes-and-dots patterns, no fine lines inside the icon. At most 40
   elements per file; most products need 15-25.
2. **Text: one word or none.** At most ONE `<text>` element, at most 9 characters, `font-size` 11-16, white or the
   dark outline colour on a contrasting panel. Use it only when the word carries the parody (NUTELLO, HARIBÖ,
   KELLOS, MAGGY, ...). Everything else has NO text; the product word (MILCH, SAFT, KÄSE) is dropped. Long
   brand words are shortened to their first syllables (MÜHLER, WEIHEN, FRUCHTZ.).
3. **3D with gradients.** The body gets a vertical-axis cylinder shading: a `linearGradient` from left to right with
   three stops, light tint at 0 %, the body colour at 45 %, a darker shade at 100 % (for boxes and cartons: a
   lighter top/front face and a darker side strip instead). Caps, lids and rims get the same treatment with the
   accent colour. Up to 3 `linearGradient` per file. Keep the single white highlight stripe (fill-opacity 0.5,
   stronger than before) on the left third. The dark shade band on the right is now part of the gradient.
4. **Heavy outline, more contrast.** Outer silhouette: `stroke="#1F1410" stroke-width="3.5"`. Inner lines 2.
   Labels are white `#FFFFFF` or near-black `#1F1410` panels, never cream; label text and icons contrast hard
   with the panel. No muddy or pastel fills on the body.
5. **Punchy palette.** Body and accent colours come from this list (or a clearly brighter tint of them):
   hot red `#FF2E4D`, orange `#FF7A1A`, sun yellow `#FFD400`, lime `#8CE600`, green `#1DC86A`, mint `#19E3C2`,
   sky `#2EB8FF`, electric blue `#2A5BFF`, violet `#8A3DFF`, magenta `#FF2DAA`, pink `#FF7AC8`, chocolate
   `#6B3A1E`, white `#FFFFFF`, black `#1F1410`. Natural produce keeps natural hues but saturated (tomato
   `#FF2E4D`, banana `#FFD400`, kiwi `#8CE600`, aubergine `#8A3DFF`). Wood and bread tones: `#E0963C`, `#B86A24`.
6. **The parody must survive the simplification.** The trade dress is carried by shape, body colour, the colour of
   the lid/band and the one word; drop the rest.

## 3. Silhouette classes

Draw each product in exactly one class. Width and height are the bounding box in units, outline included.
**Fill the tile:** every product stands tall (portrait) and reaches close to the top of its box. The game
scales each sprite so that its measured width fills about 0.9 of a shelf slot, so a short, squat drawing ends
up small on the shelf and a tall one ends up big. When a product is naturally wide (a baguette, a sugar cane,
a bar of chocolate), stand it upright or lean it, stack two or three of them, or put it in an upright pack.

| class  | width | height | notes |
|--------|-------|--------|-------|
| bottle | 40-50 | 86-91  | tall, cap on top, neck, shoulders, label band |
| carton | 48-58 | 84-91  | gable-top or brick carton |
| can    | 48-58 | 74-88  | tall cylinder (0.5 l look), lid ellipse, straight sides |
| jar    | 54-62 | 72-84  | tall glass with a screw lid; a short jar may stand on a second one or be a tall "family size" |
| bag    | 56-66 | 82-91  | standing pouch or bag, wavy top seal, puffy sides |
| box    | 54-64 | 82-91  | upright cuboid, front panel is the label |
| tub    | 56-64 | 68-80  | tall cup, bucket or tub, wider at the top, lid |
| loose  | 52-66 | 56-91  | produce, bread, bars: NEVER stretch a single fruit, vegetable or bun out of its natural proportions (a round tomato stays round, a kiwi stays an egg). Reach the box by showing two or three of them (a stack, a bunch, a pair on a leaf), a net, a tray with a label band or a paper sleeve, or a whole item with a cut half in front |

Keep the class silhouettes distinct from each other: a bottle has a neck, a carton a gable, a can an elliptical
lid, a jar a wide screw lid, a bag a wavy seal, a box straight edges, a tub a wider top, loose things an organic
outline. Some levels show a product as a flat one-colour silhouette and the player must guess it from the shape
alone, so the outline must carry the identity.

Within one category the four products must use at least **two different classes**, and any two siblings must differ
in class OR in body hue (at least 60° apart). A parody keeps its real trade-dress colour even when that brings two
siblings close in hue (v3): the level generator keeps confusable products apart at runtime anyway, using the
manifest `color` and the measured shape group.

## 4. Familiar, but invented (brand rules v2)

The player is a German grandmother who said that products which look like things from a real German
supermarket are much more fun than generic ones. So every product should **evoke a familiar product type as
it sits on a German shelf**, while staying legally its own thing:

- **Borrow the type, not the trademark.** Use the packaging shape, the usual colour family and the usual label
  layout of that kind of product (a hazelnut spread is a squat-to-tall glass with a white lid and a cream label
  with a big brand word; a German beer is a brown bottle with an oval label; a Quark is a white tub with a
  blue or green band; a muesli is a tall box with a bowl photo; a Knäckebrot is a flat upright pack; a Maggi-style
  seasoning is a tiny brown bottle with a yellow-and-red label; a Weißwurst is a glass jar with a blue-white lid).
- **Recognisable parodies (owner's wish, v2.1):** at least one product in four, food first, must be recognised at a
  glance as a wink at a specific famous German-supermarket product: the owner's own example is a jar that looks like
  the famous hazelnut spread but says `NUTELLO`. Recognition comes from the trade dress (shape, colour family, label
  layout, the typical logo placement, the typical lid) plus a near-name that reads as a parody: a changed syllable or
  ending (`Nutello`, `Hariboh`, `Mezzi Mix`, `Kabba`, `Iglu`), a pun (`Hohes Z`, `Dr. Ötti`, `Nimm 3`, `Fritze Kola`).
  Never the real name itself, never the real logo or mascot copied (no purple cow, no gold bear with that face, no
  captain, no rooster), and no real company name in the text. The manifest `name` is German (brand word plus
  product word, e.g. `Nutello Nuss-Nougat-Creme`); the manifest `description` names what it winks at.
- The remaining products are honest category-typical products with their own invented brand.
- **Never copy** a real logo, a real mascot (no purple cow, no gold bear with that face, no rooster, no tiger),
  a real slogan, a real company name, a flag or a celebrity. Change at least two salient elements of the
  familiar look (for example the accent colour and the icon) so that nobody could mistake it for the real pack.
- Generic product forms are always fine (a soup can, a honey jar, a ketchup squeeze bottle, a cola can in brown
  or orange, a crisps bag), as long as they are drawn with character: a distinctive icon, a bold colour, a
  readable brand word.

## 5. Manifest

Each category has one manifest file `assets/items/manifest/<category>.json`:

```json
{
  "category": "dairy",
  "items": [
    {
      "id": "dairy-moo-milk",
      "file": "dairy-moo-milk.svg",
      "name": "Moo Fresh Milk",
      "class": "bottle",
      "color": "#4FA3E8",
      "accent": "#FFFFFF",
      "label": "MILK",
      "icon": "cow face",
      "description": "Blue plastic milk bottle with a white cap and a smiling cow on the label"
    }
  ]
}
```

`color` is the dominant body colour (the one you would name if asked "what colour is it"). `label` is the
word printed on it or `""`. `class` is the silhouette class from section 3.

## 6. Self-check before you finish

1. Open the file as text: root tag, title, no forbidden element, no `opacity=` on a `<g>`, no `style`,
   no `class`, under 60 elements, under 7 KB.
2. Mentally scale it to 60 px: is the silhouette obvious? Is the icon one big shape? Would you confuse it
   with any sibling in your category at a glance? If yes, change the colour or the class.
3. The bottom of the outline sits on y = 95, the item is centred, nothing leaves the 8..92 × 4..96 box, and the
   product reaches the top of its class box (section 3): tall, not squat.
4. The outline, highlight and shade are present and follow section 2.
5. The brand is invented and the design is not a famous product in disguise.

## 7. Pipeline after drawing

1. `node tests/items-check.js` checks every file against sections 1, 2.5 and 5.
2. `node tests/browser/items-render.js` renders every product in Chrome, checks the floor line, bounds and class box,
   writes `assets/items/manifest/geometry.json` (measured width/height, used for shape groups and for the on-shelf
   scale) and the contact sheets `docs/preview/items-sheet.png` / `items-small.png`.
   `node tests/browser/items-render.js --check-only --sheet <png> <category>` only checks the named categories and
   writes one contact sheet to `<png>` (no shared files are touched: safe to run in parallel).
3. `node scripts/build-catalog.js` merges the manifests into `src/art/catalog.js` with the hue of `color`, a
   `shapeGroup` (class + aspect bucket, or an override from `assets/items/manifest/silhouette-overrides.json`),
   `silhouetteOk` and a `tier` (1 food, 2 drinks/pantry, 3 non-food; the level skin prefers lower tiers).
4. The game loads sprites as `<img src="assets/items/<id>.svg">` (or `assets/items-2d/` when the player chose flat
   products); silhouettes and darkened back-layer copies are canvases drawn from the same file.
5. The flat set in `assets/items-2d/` is frozen at v0.3.0 (ART-SPEC v2 look, black outlines). A new product needs a file
   in both sets, or the flat set shows the placeholder; measure it with
   `node tests/browser/items-render.js --dir assets/items-2d --geometry assets/items/manifest/geometry-2d.json`.
