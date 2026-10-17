// src/game/game.js: assembles CM.game (DESIGN 5.5) from the parts in src/game/ and owns
// createGame, aiming, launch requests, tick (the normative order of 5.6), continueAfterWin
// and debugAddBody. Tests require this file and see the whole CM.game API.
(function (root, factory) {
  'use strict';
  var isNode = typeof module === 'object' && module && module.exports;
  var parts = isNode ? null : (root.CM && root.CM.gameParts) || {};
  var deps = isNode
    ? {
      config: require('../config.js'), physics: require('../physics.js'),
      spawn: require('./spawn.js'), merge: require('./merge.js'), danger: require('./danger.js'),
      aim: require('./aim.js'), state: require('./state.js'), save: require('./save.js'),
      chime: require('./chime.js'), bomb: require('./bomb.js')
    }
    : {
      config: root.CM.config, physics: root.CM.physics,
      spawn: parts.spawn, merge: parts.merge, danger: parts.danger, aim: parts.aim,
      state: parts.state, save: parts.save, chime: parts.chime, bomb: parts.bomb
    };
  var api = factory(deps);
  if (isNode) module.exports = api;
  else { root.CM = root.CM || {}; root.CM.game = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (deps) {
  'use strict';
  /* @pure-begin */
  var config = deps.config;
  var physics = deps.physics;
  var spawn = deps.spawn;
  var merge = deps.merge;
  var danger = deps.danger;
  var aim = deps.aim;
  var state = deps.state;
  var save = deps.save;
  var chime = deps.chime, bomb = deps.bomb;

  // 2.13: one resolver for the whole namespace, owned by state.js (restoreGame needs it too).
  var resolveRules = state.resolveRules;

  // ---- creation -------------------------------------------------------------

  function createGame(seed, overrides) {
    var rules = resolveRules(overrides);
    var s = Number(seed) >>> 0;                          // 2.7: seed >>> 0 ('7' -> 7, NaN -> 0)
    var g = {
      seed: s, rng: s, tick: 0, mode: rules.mode,
      world: physics.createWorld(rules),
      bodies: [], nextId: 1,
      aimX: rules.W / 2, current: 1, next: 1, spawnHistory: [], spawnCount: 0,
      phase: 'ready', cooldown: 0, launchPending: false,
      score: 0, highestTier: 1, runMask: 1, launches: 0, merges: 0,
      dangerTicks: 0, dangerTickEmitted: -1, threatTicks: 0,
      dangerLevel: 0, overIds: [], dangerSuspendUntil: 0,
      wonOnce: false,
      bombs: 0,                                          // bomb charges (game/bomb.js)
      rules: rules
    };
    g.current = spawn.drawSpawn(g);
    g.next = spawn.drawSpawn(g);
    // 2.2: what sits in the launcher is discovered. Without a spawnScript current is 1, so this
    // is the runMask = 1 of 5.5; a script (2.7 step 1 runs before the opening) may start elsewhere.
    g.runMask = 1 << (g.current - 1);
    setAim(g, g.aimX);
    return g;
  }

  // ---- aiming ---------------------------------------------------------------

  function aimBounds(g) {
    var r = g.rules.RADII[g.current];
    return { min: r, max: g.rules.W - r };
  }

  // Clamps to [R[current], W - R[current]]; a non-finite x keeps the current aim (re-clamped).
  function setAim(g, x) {
    var r = g.rules.RADII[g.current];
    var max = g.rules.W - r;
    var v = (typeof x === 'number' && isFinite(x)) ? x : g.aimX;
    g.aimX = v < r ? r : (v > max ? max : v);
  }

  function nudgeAim(g, dx) {
    setAim(g, g.aimX + dx);
  }

  // ---- launch requests (2.12) -----------------------------------------------

  function requestLaunch(g, mode) {
    var m = mode === 'pointer' ? 'pointer' : 'key';
    if (g.phase === 'ready') {
      g.launchPending = true;
      return 'queued';
    }
    if (g.phase === 'cooldown' && (m === 'pointer' || g.cooldown <= g.rules.BUFFER_TICKS)) {
      g.launchPending = true;
      return 'buffered';
    }
    return 'rejected';
  }

  function cancelLaunch(g) {
    g.launchPending = false;
  }

  // ---- tick (5.6) -----------------------------------------------------------

  function doLaunch(g, ev) {
    var rules = g.rules;
    var r = rules.RADII[g.current];
    var blocker = aim.spawnBlocker(g, g.aimX, r);        // the same predicate as the aim guide
    if (blocker) {
      ev.push({ type: 'launchBlocked', blockerId: blocker.id });
      return;
    }
    var body = physics.makeBody(g.nextId, g.current, g.aimX, rules.LAUNCH_Y, 0, -rules.V0, r);
    g.nextId += 1;
    body.launched = true;
    body.bornTick = -1;
    body.chainDepth = 0;
    body.cleared = false;
    body.age = 0;
    body.growTick = rules.GROW_TICKS;                    // fully grown under this game's rules
    g.bodies.push(body);
    g.launches += 1;
    ev.push({ type: 'launch', id: body.id, tier: body.tier, x: body.x });
    if (body.tier > g.highestTier) g.highestTier = body.tier;

    g.current = g.next;
    g.next = spawn.drawSpawn(g);
    setAim(g, g.aimX);                                   // re-clamp for the new current tier
    var bit = 1 << (g.current - 1);
    if ((g.runMask & bit) === 0) {                       // NEXT never discovers; the launcher does
      g.runMask |= bit;
      ev.push({ type: 'discover', tier: g.current });
    }
    ev.push({ type: 'next', current: g.current, next: g.next });
    g.phase = 'cooldown';
    g.cooldown = rules.COOLDOWN_TICKS;
  }

  // Exactly one fixed step. Returns a fresh event array ([] once the run is over).
  function tick(g) {
    if (g.phase === 'over') return [];
    var ev = [];
    g.tick += 1;
    if (g.phase === 'cooldown') {
      g.cooldown -= 1;
      if (g.cooldown <= 0) { g.cooldown = 0; g.phase = 'ready'; }
    }
    // 5.6 step 3 reads as: the flag is cleared only when the launch branch runs (launch or
    // launchBlocked). Clearing it every tick would drop buffered launches (2.12, tests 37a/37c).
    if (g.launchPending && g.phase === 'ready') {
      doLaunch(g, ev);
      g.launchPending = false;
    }
    physics.stepWorld(g.world, g.bodies, g.tick, ev, g.rules);
    if (g.rules.mergeEnabled) merge.resolveMerges(g, ev);
    danger.updateDanger(g, ev);
    return ev;
  }

  // 2.9: after the Win menu's "Keep playing".
  function continueAfterWin(g) {
    g.dangerTicks = 0;
    g.dangerTickEmitted = -1;
  }

  // ---- tests and ?debug=1 ---------------------------------------------------

  // debugAddBody(g, tier, x, y, vx?, vy?, opts?) with opts
  // { age = 0, cleared = false, bornTick = 0, chainDepth = 0, launched = false }.
  function debugAddBody(g, tier, x, y, vx, vy, opts) {
    var o = opts || {};
    var body = physics.makeBody(g.nextId, tier, x, y, vx || 0, vy || 0, g.rules.RADII[tier]);
    g.nextId += 1;
    body.growTick = g.rules.GROW_TICKS;                  // fully grown under this game's rules
    body.age = typeof o.age === 'number' ? o.age : 0;
    body.cleared = !!o.cleared;
    body.launched = !!o.launched;
    if (body.launched) {
      body.bornTick = -1;
      body.chainDepth = 0;
    } else {
      body.bornTick = typeof o.bornTick === 'number' ? o.bornTick : 0;
      body.chainDepth = typeof o.chainDepth === 'number' ? o.chainDepth : 0;
    }
    g.bodies.push(body);                                 // the largest id so far: order is kept
    return body;
  }
  /* @pure-end */

  return {
    createGame: createGame,
    restoreGame: state.restoreGame,
    snapshot: state.snapshot,
    rngNext: spawn.rngNext,
    pickWeighted: spawn.pickWeighted,
    drawSpawn: spawn.drawSpawn,
    aimBounds: aimBounds,
    setAim: setAim,
    nudgeAim: nudgeAim,
    requestLaunch: requestLaunch,
    cancelLaunch: cancelLaunch,
    tick: tick,
    continueAfterWin: continueAfterWin,
    isMergeEligible: merge.isMergeEligible,
    multiplier: merge.multiplier,
    pointsFor: merge.pointsFor,
    firstHit: aim.firstHit,
    botAim: aim.botAim,
    debugAddBody: debugAddBody,
    hash: state.hash,
    normalizeSave: save.normalizeSave,
    mergeSave: save.mergeSave,
    chimeFreqs: chime.chimeFreqs,
    useBomb: bomb.useBomb,
    bombRadius: bomb.bombRadius,
    maxBombs: bomb.maxBombs
  };
});
