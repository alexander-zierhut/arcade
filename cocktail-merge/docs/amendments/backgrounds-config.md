# Amendment: CONFIG.BACKGROUNDS (key: backgrounds)

Target: `src/config.js` (DESIGN 5.3). Paste the block below into the config object literal, after `APP: { ... }`
(add a comma after the APP entry). The object is deep-frozen like the rest of the config; `src/art/backgrounds.js`
only reads it. The same list is inlined in `src/art/backgrounds.js` as `DEFAULT_LIST` (used when
`CONFIG.BACKGROUNDS` is missing), so the two must be kept in sync; config wins when present.

Paths are relative to `index.html`. Field meanings:

| Field | Meaning |
|---|---|
| `HORIZON_AT` | the image horizon lands at `HORIZON_AT * lay.farY` (canvas px) |
| `ZOOM_MAX` | the fit may zoom past "cover width + top" by at most this factor to reach the canvas bottom |
| `PAD` | extra horizontal cover beyond the overdraw margin, px per uiK (room for the sea sway) |
| `SWAY_S` | period of a layer's sway, seconds |
| `SEAM` | height of the soft blend from the image bottom into the ground fill, fraction of the drawn image height |
| `key` | stable id (persisted as the last scene) |
| `file` | the flat image; always required (fallback for a layered scene) |
| `w`, `h` | the image's natural size (the fit is computed before it loads) |
| `horizonFrac` | measured horizon row / image height |
| `anchorX` | image x-fraction kept at the stage centre (clamped so the image still covers the canvas) |
| `ground` | `[fill, speck]` colours of the sand below the image bottom (match the image's bottom rows) |
| `haze` | `[r, g, b, alpha]` light veil over the headroom band, horizon to far table edge (item 2) |
| `credit` | attribution line shown on the title screen ('' when none is required) |
| `layers` | optional parallax layers in draw order: `file`, `top`/`bottom` (opaque rows as fractions of the image height), `speed` (drift, px/s per uiK; the layer must tile horizontally), `sway` (amplitude, px per uiK) |

Anchor choices (measured on the 390x844 portrait fit, where about 60-70 % of the image width is visible):
beach-bar 0.30 keeps the whole tiki bar (image x 0.05-0.30) in frame on the left; palms-parasol 0.47 centres the
parasol and both near palms; island-sailboat 0.40 keeps the island and the sailboat; sunset 0.47 keeps the sun
and the boat; day-beach 0.42 keeps the island and the big palm.

```js
  BACKGROUNDS: {
    HORIZON_AT: 0.55, ZOOM_MAX: 1.25, PAD: 4, SWAY_S: 14, SEAM: 0.06,
    scenes: [
      { key: 'beach-bar', file: 'assets/backgrounds/craftpix-beach-bar.png', w: 1920, h: 1080,
        horizonFrac: 0.524, anchorX: 0.3, ground: ['#F1F2BC', '#DCDB9E'], haze: [255, 251, 236, 0.16],
        credit: 'Beach 2D Backgrounds by CraftPix.net (craftpix.net), OGA-BY 3.0',
        layers: [
          { file: 'assets/backgrounds/beach-bar-layers/sky.png', top: 0, bottom: 1, speed: 0, sway: 0 },
          { file: 'assets/backgrounds/beach-bar-layers/cloud.png', top: 0.06, bottom: 0.47, speed: 4, sway: 0 },
          { file: 'assets/backgrounds/beach-bar-layers/sea.png', top: 0.38, bottom: 1, speed: 0, sway: 1.5 },
          { file: 'assets/backgrounds/beach-bar-layers/land.png', top: 0.69, bottom: 1, speed: 0, sway: 0 },
          { file: 'assets/backgrounds/beach-bar-layers/decor.png', top: 0.31, bottom: 1, speed: 0, sway: 0 }
        ] },
      { key: 'palms-parasol', file: 'assets/backgrounds/craftpix-palms-parasol.png', w: 1920, h: 1080,
        horizonFrac: 0.487, anchorX: 0.47, ground: ['#FFD91C', '#F2C200'], haze: [255, 250, 230, 0.18],
        credit: 'Beach 2D Backgrounds by CraftPix.net (craftpix.net), OGA-BY 3.0' },
      { key: 'island-sailboat', file: 'assets/backgrounds/craftpix-island-sailboat.png', w: 1920, h: 1080,
        horizonFrac: 0.451, anchorX: 0.4, ground: ['#FEE883', '#EBD06A'], haze: [255, 252, 240, 0.14],
        credit: 'Beach 2D Backgrounds by CraftPix.net (craftpix.net), OGA-BY 3.0' },
      { key: 'sunset', file: 'assets/backgrounds/craftpix-sunset.png', w: 1920, h: 1080,
        horizonFrac: 0.470, anchorX: 0.47, ground: ['#1F1915', '#2E241D'], haze: [255, 196, 120, 0.10],
        credit: 'Beach 2D Backgrounds by CraftPix.net (craftpix.net), OGA-BY 3.0' },
      { key: 'day-beach', file: 'assets/backgrounds/spriteattack-day-beach.png', w: 3000, h: 2000,
        horizonFrac: 0.518, anchorX: 0.42, ground: ['#F6E46C', '#E2CC52'], haze: [255, 252, 238, 0.16],
        credit: '' }
    ]
  }
```

Notes
- `spriteattack-day-beach.svg` is not listed: the PNG renders identically and decodes faster on iOS; the SVG stays in
  the folder as the licensed source.
- To add a scene: drop the image into `assets/backgrounds/`, measure its horizon row, add an entry here (and to
  `DEFAULT_LIST`), list its credit in `assets/backgrounds/CREDITS.md`, then run `node tests/browser/backgrounds.js`
  and look at `docs/preview/backgrounds.png`.
