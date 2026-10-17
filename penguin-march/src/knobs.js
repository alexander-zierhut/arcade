// src/knobs.js: how hard level n is, as numbers, for n beyond the authored levels. gen.js draws every value from
// these ranges, so the difficulty curve is this file. Threat sizes are relative to the waddle (calibrate.js turns
// them into hit points by playing the level), so the curve is a share: a 0.8 wall can be shot down with room to
// spare, a 1.1 wall costs penguins unless it is dodged. The shares rise from the authored level 50 to a plateau,
// the rest of the growth is in the road length and the boss (square-root slow after level 150). Pure.
(function (root) {
  'use strict';
  var PM = root.PM = root.PM || {};
  var C = PM.config || (typeof require === 'function' ? require('./config.js') : null);

  /** growth(n): 0 at level 50, linear to level 150, then square-root slow. */
  function growth(n) {
    var t = Math.max(0, n - C.AUTHORED_LEVELS);
    return t <= 100 ? t : 100 + 4 * Math.sqrt(t - 100);
  }

  /** ramp(g, from, to, over): from at g=0 to `to` at g=over, flat after. */
  function ramp(g, from, to, over) { return from + (to - from) * Math.min(1, g / over); }

  /** knobs(n) -> every range the generator needs for level n. */
  function knobs(n) {
    var g = growth(n);
    var riot = n > C.AUTHORED_LEVELS && (n - C.AUTHORED_LEVELS) % C.RIOT_EVERY_GEN === 0;
    return {
      n: n,
      riot: riot,
      length: Math.round(Math.min(420, 365 + 0.4 * g)),             // level 50 is 365 long
      rows: Math.round(Math.min(22, 19 + g / 25)),                  // things on the road before the boss
      wallShare: [ramp(g, 0.55, 0.75, 60), ramp(g, 0.85, 1.0, 60)],  // full-width walls: must be shot, never lethal
      laneShare: [ramp(g, 0.8, 1.0, 60), ramp(g, 1.1, 1.4, 60)],     // lane walls/packs: dodge or pay
      packShare: [ramp(g, 0.5, 0.7, 60), ramp(g, 0.8, 0.95, 60)],
      gateAdd: [0.35, 0.8],                                          // + gates as a share of the waddle
      gateSub: [0.2, 0.45],                                          // - gates as a share of the waddle
      mulChance: 0.35,                                               // share of good gates that are x2 (x3 rarely)
      maxMuls: 3,                                                    // ... but at most this many per level: x2 compounds fast
      allyGift: [0.3, 0.7],
      allyLock: [0.4, 0.7],
      fishChain: [8, 16],
      bossSecs: ramp(g, 12, 14, 100),                                // seconds of fire the walrus takes (level 50: 15; it bites after ~15)
      // riot levels: the numbers are the show
      riotMul: 20,
      riotAdd: Math.round(1000 + 100 * g),
      riotFish: 100,
      riotBossSecs: 3
    };
  }

  PM.knobs = knobs;
  PM.knobs.growth = growth;
  if (typeof module !== 'undefined' && module.exports) module.exports = knobs;
})(typeof window !== 'undefined' ? window : globalThis);
