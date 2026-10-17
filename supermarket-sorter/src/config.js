// src/config.js: every number in one place. Loaded first; pure (no DOM).
(function (root) {
  'use strict';
  var SS = root.SS = root.SS || {};
  var config = {
    VERSION: '0.3.1',
    RULES_VERSION: 2,                     // bump when a saved run can no longer be restored
    GEN_VERSION: 1,                       // bump when level generation changes (level identity)
    STORAGE_KEY: 'supermarketSorter.v1',
    RUN_KEY: 'supermarketSorter.v1.run',
    TAIL_ATTEMPTS: 12, TAIL_NODES: 30000, // runtime generation beyond the baked levels (deterministic per level)
    // scoring (DESIGN 5.1, 5.2)
    MATCH_POINTS: 100,
    COMBO_WINDOW_MS: 6000,                // timed: a match within this window after the last one grows the combo
    COMBO_MOVES: 3,                       // relaxed: moves without a match that keep the combo alive
    COMBO_STEP: 0.5,                      // multiplier = 1 + COMBO_STEP * (combo - 1), capped at COMBO_MAX_MULT
    COMBO_MAX_MULT: 4,
    TIME_BONUS_PER_S: 5,                  // timed: points per full second left on clear
    LEVEL_CLEAR_POINTS: 250,
    BUNNY_LEFT_POINTS: 150,
    FLAWLESS_POINTS: 250,
    EXTEND_MS: 30000,                     // "+30 Sekunden" once per level
    UNDO_CAP: 300, UNDO_PERSIST: 20,
    TIME_AMBER_S: 30,
    TIME_WARN_S: 10,                      // timer turns red and ticks
    // timing of the view (ms)
    MOVE_MS: 220,
    MATCH_MS: 320,
    SPRING_MS: 180,
    DRAG_LIFT: 1.12,
    TAP_SLOP_PX: 10,
    // layout
    SLOT_MAX_PX: 92,                      // largest slot width (a compartment is 3 slots); the board grows with the screen up to this
    DPR_CAP: 2,
    AUDIO: { MASTER: 0.8 }
  };
  SS.config = config;
  if (typeof module !== 'undefined' && module.exports) module.exports = config;
})(typeof globalThis !== 'undefined' ? globalThis : this);
