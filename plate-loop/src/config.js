// src/config.js: constants of Plate Loop (storage key, version, timing, kinds, tier bands)
(function (root) {
  'use strict';
  var PL = root.PlateLoop = root.PlateLoop || {};

  // Tier bands of plan 5.4. Ranges are [min, max], inclusive. extraBoxes = boxes minus kinds,
  // emptyBoxes = boxes without a piece at the start, hidden = share of pieces that start hidden,
  // mods = number of modifier kinds a level uses, maxRun = the longest run a box may start with at its front (what one tap
  // takes; a box that starts with three of a kind at the front is a free move; Alex 2026-11-06). maxSame (optional, unused
  // by the tiers: the dealer cannot reach it) would cap the pieces of one kind per box.
  var TIERS = {
    easy:    { N: [8, 10], kinds: [4, 7],  extraBoxes: [2, 3], emptyBoxes: [2, 3], hidden: [0, 0.2],   mods: [0, 1], maxRun: 4 },
    normal:  { N: [6, 8],  kinds: [7, 10], extraBoxes: [1, 2], emptyBoxes: [1, 2], hidden: [0.2, 0.4], mods: [1, 2], maxRun: 3 },   // maxRun: the run at the front
    hard:    { N: [5, 6],  kinds: [9, 12], extraBoxes: [1, 1], emptyBoxes: [1, 1], hidden: [0.3, 0.5], mods: [2, 3], maxRun: 2 },
    extreme: { N: [4, 4],  kinds: [10, 12], extraBoxes: [1, 1], emptyBoxes: [0, 1], hidden: [0.3, 0.5], mods: [2, 3], maxRun: 2 }
  };

  PL.config = {
    STORAGE_KEY: 'plateLoop.',
    VERSION: '0.2.2',
    LAP_MS: 8000,
    SLIDE_MS: 250,
    DEPART_FIRST_MS: 900,         // tap -> the first unit gets onto its plate (the piece slides out)
    DEPART_GAP_MS: 900,           // between the units of one tap
    LAND_MS: 800,                 // a landing piece slides into the box (visual only)
    MIN_N: 4,
    MAX_N: 10,
    KIND_NAMES: ['salmon', 'tuna', 'tamago', 'ebi', 'unagi', 'ikura', 'kappa', 'tekka', 'california', 'inari', 'tako', 'uni'],
    KIND_COLOURS: ['#F28C6B', '#C8102E', '#FFD23F', '#FF69B4', '#7B4B2A', '#FF8C00', '#2E7D32', '#6A1B9A', '#26A5C9', '#3F51B5', '#D8A7D0', '#8BC34A'],
    TIERS: TIERS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = PL.config;
})(typeof window !== 'undefined' ? window : globalThis);
