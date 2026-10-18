// src/config.js: every number the game is tuned by, in one place. Loaded first; the other files read PM.config.
// Units: the road runs along z (forward) and x (sideways, -1 = left edge, +1 = right edge). Time in seconds.
// Hit points are in penguins: a wall showing 40 costs 40 penguins if it is not shot down, a pack of 12 seals costs
// 12, the walrus has as many hit points as the penguins it would take to bite through. Snowball damage is in the
// same unit, so "how much can the waddle shoot before contact" and "how much does contact cost" compare directly.
(function (root) {
  'use strict';
  var PM = root.PM = root.PM || {};

  var C = {
    VERSION: '1.0.1',
    STORAGE_KEY: 'penguinMarch.v1',          // every storage key of this game starts with "penguinMarch." (README "Storage")

    // the run
    SPEED: 6,                 // road units per second the waddle advances
    STEER: 3.2,               // max sideways speed (x units per second)
    WADDLE_HALF: 0.32,        // half-width of the waddle on the road (x units), used for every overlap test
    RANGE: 28,                // how far ahead (z units) snowballs reach
    CAM_BACK: 6,              // camera distance behind the waddle (render only)

    // shooting: every penguin fires RATE snowballs per second, each does DMG damage (penguin units); the sim
    // applies that as damage per second to the first thing in front that overlaps the waddle sideways.
    // At shop 0 a waddle shoots about 0.9x its own size off a wall while walking up to it; maxed about 4.9x.
    BASE_RATE: 1.6,
    BASE_DMG: 0.12,
    RATE_STEP: 0.2,           // per shop level, times BASE_RATE
    DMG_STEP: 0.35,           // per shop level, times BASE_DMG
    START_SIZE: [4, 6, 9, 13, 18, 25],   // waddle size by shop level 0..5
    MAX_SHOP: 5,
    PRICES: [120, 260, 500, 900, 1500],  // price of shop level 1..5, same for every upgrade
    SHOOT_CAP: 400,           // at most this many penguins count for damage (riot levels still melt everything)

    // things on the road
    GATE_BUMP_HITS: 6,        // snowball hits it takes to raise a + gate by one (x gates do not change)
    GATE_BUMP_MAX: 1,         // a + gate can be raised by at most this times its printed value (+8 -> +16)
    SEAL_HP: 1,               // damage to kill one seal (a seal costs one penguin on contact)
    PACK_SPEED: 2.5,          // seals come toward the waddle at this speed (on top of the road speed)
    FISH_GAP: 1.2,            // z distance between fish in a chain
    ALLY_BIG_MULT: 2,         // the big penguin doubles the fire rate for the rest of the level

    // the boss
    BOSS_DIST: 22,            // the fight starts when the boss is this far ahead
    BOSS_SPEED: 1.5,          // boss walks toward the waddle at this speed (the waddle stands still)
    BOSS_EAT: 6,              // penguins eaten per second once it reaches the waddle
    BOSS_HIT_EVERY: 0.35,     // seconds between "hit" events on the boss (for the screen shake)

    // rewards
    COIN_BASE: 20,
    COIN_PER_LEVEL: 5,
    COIN_PER_PENGUIN: 1,
    COIN_PENGUIN_CAP: 100,
    STAR_THRESHOLDS: [0.25, 0.6],   // share of the peak waddle still alive at the end -> 2 / 3 stars (1 star = won)

    // levels
    AUTHORED_LEVELS: 50,      // levels 1..50 come from levels-data.js, everything after from gen.js
    RIOT_EVERY_GEN: 5,        // generated levels: every 5th is a riot level
    // Relative numbers in a level ("a wall worth 80% of what the waddle can shoot") are turned into absolute ones
    // against the shop a player is expected to have by then: one shop point per threshold passed, handed out
    // size, rate, dmg, size, ... (calibrate.js). A player who bought more has it easier, one who bought less harder.
    REF_SHOP_LEVELS: [3, 4, 5, 7, 9, 12, 15, 18, 21, 25, 29, 33, 38, 43, 48],
    FIX_DIST: 60,             // relative numbers get a provisional value when the thing is this far ahead (beyond the bot's look-ahead)
    REFIX_DIST: 34,           // ... and their final value here, just before it comes into RANGE, from the waddle as it is then
    DRAW_CAP: 220             // penguins drawn at most; the badge shows the real number
  };

  /** Small deterministic generator (LCG). rng(seed) -> function returning [0, 1). The sim never calls Math.random. */
  C.rng = function (seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  };

  /** refShop(n) -> { size, rate, dmg } the shop a player is expected to have at level n. */
  C.refShop = function (n) {
    var points = 0;
    for (var i = 0; i < C.REF_SHOP_LEVELS.length; i++) if (n >= C.REF_SHOP_LEVELS[i]) points++;
    var keys = ['size', 'rate', 'dmg'], shop = { size: 0, rate: 0, dmg: 0 };
    for (var p = 0; p < points; p++) shop[keys[p % 3]]++;
    return shop;
  };

  PM.config = C;
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
})(typeof window !== 'undefined' ? window : globalThis);
