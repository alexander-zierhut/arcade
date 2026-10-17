// src/game/danger.js (a part of CM.game)
// Danger line and loss (DESIGN 2.8): one shared grace timer, heartbeats, levels, lose.
// Runs last in every tick (5.6 step 6), after merges, so a win's suspension beats a loss.
(function (root, factory) {
  'use strict';
  var isNode = typeof module === 'object' && module && module.exports;
  var deps = isNode
    ? { config: require('../config.js') }
    : { config: root.CM.config };
  var api = factory(deps);
  if (isNode) module.exports = api;
  else { root.CM = root.CM || {}; root.CM.gameParts = root.CM.gameParts || {}; root.CM.gameParts.danger = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (deps) {
  'use strict';
  /* @pure-begin */
  // All numbers come from g.rules (config defaults + mode + overrides, resolved in createGame).

  // Emits danger{level} only when the level changes.
  function setLevel(g, level, ev) {
    if (g.dangerLevel !== level) {
      g.dangerLevel = level;
      ev.push({ type: 'danger', level: level });
    }
  }

  function updateDanger(g, ev) {
    var rules = g.rules;
    var i;

    if (g.tick < g.dangerSuspendUntil) {
      g.dangerTicks = 0;
      g.dangerTickEmitted = -1;
      g.threatTicks = 0;
      if (g.overIds.length) g.overIds = [];
      setLevel(g, 0, ev);
      return;
    }

    var dangerY = rules.DANGER_Y;
    var eligibleAge = rules.ELIGIBLE_AGE_TICKS;
    var threatY = dangerY - rules.THREAT_DIST;
    var over = null;
    var threat = false;
    var bodies = g.bodies;

    for (i = 0; i < bodies.length; i++) {           // ascending id
      var b = bodies[i];
      var edge = b.y + b.r;                          // near edge of the footprint
      if (!b.cleared && edge < dangerY) b.cleared = true;
      if (!(b.cleared || b.age > eligibleAge)) continue;
      if (edge > dangerY) {
        if (!over) over = [];
        over.push(b.id);
      } else if (edge > threatY) {
        threat = true;
      }
    }

    g.threatTicks = threat ? g.threatTicks + 1 : 0;

    if (over) {
      g.dangerTicks += 1;
      var every = rules.DANGER_TICK_EVERY;
      if ((g.dangerTicks - 1) % every === 0) {
        var nb = (g.dangerTicks - 1) / every;
        if (nb > g.dangerTickEmitted) {
          g.dangerTickEmitted = nb;
          ev.push({ type: 'dangerTick', n: nb });
        }
      }
    } else {
      g.dangerTicks = Math.max(0, g.dangerTicks - rules.DECAY);
      if (g.dangerTicks === 0) g.dangerTickEmitted = -1;
    }

    if (over) g.overIds = over;
    else if (g.overIds.length) g.overIds = [];

    var level = 0;
    if (over) level = 2;
    else if (g.threatTicks >= rules.THREAT_HOLD_TICKS || g.dangerTicks > 0) level = 1;
    setLevel(g, level, ev);

    if (g.dangerTicks >= rules.GRACE_TICKS) {
      g.phase = 'over';
      g.launchPending = false;
      ev.push({ type: 'lose', ids: (over || []).slice() });
    }
  }
  /* @pure-end */

  return { updateDanger: updateDanger };
});
