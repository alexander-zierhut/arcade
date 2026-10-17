// src/game/chime.js: a part of CM.game. Merge chime pitch on the pentatonic scale (DESIGN 3.9).
(function (root, factory) {
  'use strict';
  var isNode = typeof module === 'object' && module && module.exports;
  var deps = isNode
    ? { config: require('../config.js') }
    : { config: root.CM.config };
  var api = factory(deps);
  if (isNode) module.exports = api;
  else { root.CM = root.CM || {}; root.CM.gameParts = root.CM.gameParts || {}; root.CM.gameParts.chime = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (deps) {
  'use strict';
  /* @pure-begin */
  var AUDIO = (deps.config && deps.config.AUDIO) || {};
  var SCALE = (AUDIO.SCALE && AUDIO.SCALE.length) ? AUDIO.SCALE
    : [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50, 1174.66, 1318.51, 1567.98,
       1760.00, 2093.00, 2349.32, 2637.02, 2793.83, 3135.96];

  function toInt(v, d) { return (typeof v === 'number' && isFinite(v)) ? Math.round(v) : d; }

  // Every lookup is clamped, so invalid input still yields a note on the scale.
  function note(i) { return SCALE[Math.min(Math.max(i, 0), SCALE.length - 1)]; }

  // chimeFreqs(k, d) -> {f, grace}: tier k (2..9) created at chain depth d (>= 1).
  function chimeFreqs(k, d) {
    k = toInt(k, 2);
    d = toInt(d, 1);
    var i = (k - 2) + Math.min(d - 1, 5);
    return { f: note(i), grace: k >= 7 ? note(i + 2) : null };
  }
  /* @pure-end */
  return { chimeFreqs: chimeFreqs };
});
