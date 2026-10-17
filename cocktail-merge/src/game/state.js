// src/game/state.js: a part of CM.game. Rules resolution, run snapshots, restoreGame and the
// state hash (DESIGN 2.13, 5.4, 5.5, 5.9). Depends only on config and physics (5.2); game.js
// uses resolveRules from here, so there is exactly one resolver.
(function (root, factory) {
  'use strict';
  var isNode = typeof module === 'object' && module && module.exports;
  var deps = isNode
    ? { config: require('../config.js'), physics: require('../physics.js') }
    : { config: root.CM.config, physics: root.CM.physics };
  var api = factory(deps);
  if (isNode) module.exports = api;
  else { root.CM = root.CM || {}; root.CM.gameParts = root.CM.gameParts || {}; root.CM.gameParts.state = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (deps) {
  'use strict';
  /* @pure-begin */
  var C = deps.config;
  var physics = deps.physics;
  var RULES_VERSION = C.RULES_VERSION;
  var MAX_ID = C.PHYS.MAX_ID;
  var HISTORY = C.SPAWN.HISTORY;
  var SPAWN_MAX = C.SPAWN.MAX_TIER;
  var MAX_TIER = 9;
  var UINT32 = 4294967296;
  var PHASES = { ready: 0, cooldown: 1, over: 2 };
  // Override keys that are not plain rule numbers.
  var SPECIAL_KEYS = { mode: true, mergeEnabled: true, spawnScript: true };

  var GAME_NUMS = ['seed', 'rng', 'tick', 'nextId', 'aimX', 'current', 'next', 'spawnCount', 'cooldown',
    'score', 'highestTier', 'runMask', 'launches', 'merges', 'dangerTicks', 'dangerTickEmitted',
    'threatTicks', 'dangerLevel', 'dangerSuspendUntil'];
  var GAME_BOOLS = ['launchPending', 'wonOnce'];
  var BODY_NUMS = ['id', 'tier', 'x', 'y', 'px', 'py', 'vx', 'vy', 'r', 'r0', 'rTarget', 'growTick',
    'invM', 'age', 'bornTick', 'chainDepth'];
  var BODY_BOOLS = ['cleared', 'launched'];

  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function fin(v) { return typeof v === 'number' && isFinite(v); }
  function int(v, lo, hi) { return fin(v) && Math.floor(v) === v && v >= lo && v <= hi; }
  function intArray(a, lo, hi) {
    if (!Array.isArray(a)) return false;
    for (var i = 0; i < a.length; i++) if (!int(a[i], lo, hi)) return false;
    return true;
  }
  function isRuleKey(k) { return has(C.TABLE, k) || has(C.PHYS, k) || has(C.RULES, k); }

  // ---- rules (2.13) -----------------------------------------------------------

  // resolveRules(overrides): config defaults -> MODES[mode] -> the remaining overrides. The result
  // is flat (TABLE + PHYS + RULES keys side by side), plus mode, RADII, mergeEnabled, spawnScript
  // and `overrides`, a plain JSON copy of the non-mode overrides (stored in snapshots so a
  // restored game gets the same rules).
  function resolveRules(overrides) {
    var o = overrides || {};
    var mode = o.mode === 'relaxed' ? 'relaxed' : 'standard';
    var rules = {}, kept = {}, srcs = [C.TABLE, C.PHYS, C.RULES, C.MODES[mode]];
    var i, k, keys;
    for (i = 0; i < srcs.length; i++) {
      keys = Object.keys(srcs[i]);
      for (k = 0; k < keys.length; k++) rules[keys[k]] = srcs[i][keys[k]];
    }
    keys = Object.keys(o);
    for (k = 0; k < keys.length; k++) {
      if (SPECIAL_KEYS[keys[k]]) continue;
      rules[keys[k]] = o[keys[k]];
      kept[keys[k]] = o[keys[k]];
    }
    rules.mode = mode;
    rules.mergeEnabled = o.mergeEnabled !== false;
    if (o.mergeEnabled === false) kept.mergeEnabled = false;
    rules.spawnScript = (o.spawnScript && o.spawnScript.length) ? o.spawnScript.slice() : null;
    if (rules.spawnScript) kept.spawnScript = rules.spawnScript.slice();
    rules.overrides = kept;
    rules.RADII = [0];
    for (var t = 1; t <= MAX_TIER; t++) {
      rules.RADII[t] = t === 1 ? C.TIERS[1].radius : C.TIERS[t].radius * rules.RADIUS_SCALE;
    }
    return rules;
  }

  // A stored override set may only hold known rule keys with numbers >= 0, mergeEnabled false
  // and a spawnScript of launcher tiers.
  function validOverrides(o) {
    if (o === undefined) return true;
    if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
    var keys = Object.keys(o);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i], v = o[k];
      if (k === 'mergeEnabled') { if (v !== false) return false; }
      else if (k === 'spawnScript') { if (!intArray(v, 1, SPAWN_MAX) || !v.length) return false; }
      else if (!isRuleKey(k) || !fin(v) || v < 0) return false;
    }
    return true;
  }

  // ---- snapshot -----------------------------------------------------------------

  // Deep copy of plain JSON-like data; functions are dropped, Maps become [key, value] arrays.
  function clone(v) {
    if (v === null || typeof v !== 'object') return typeof v === 'function' ? undefined : v;
    if (Array.isArray(v)) return v.map(clone);
    if (typeof Map !== 'undefined' && v instanceof Map) return Array.from(v.entries()).map(clone);
    var o = {};
    for (var k in v) {
      if (!has(v, k)) continue;
      var c = clone(v[k]);
      if (c !== undefined) o[k] = c;
    }
    return o;
  }

  // snapshot(g) -> plain JSON object: every GameState field except rules; world.seen as [key, tick]
  // pairs. rulesVersion is stored here too, so restoreGame(record.game) can check it (5.5, 5.9);
  // overrides is stored so test and debug games round-trip with their rules.
  function snapshot(g) {
    var s = {};
    for (var k in g) {
      if (!has(g, k) || k === 'rules' || k === 'world') continue;
      var c = clone(g[k]);
      if (c !== undefined) s[k] = c;
    }
    var w = g.world || {};
    s.world = { seen: w.seen ? Array.from(w.seen.entries()) : [], poolGrowths: w.poolGrowths || 0 };
    s.rulesVersion = RULES_VERSION;
    s.overrides = clone((g.rules && g.rules.overrides) || {});
    return s;
  }

  // ---- validation (localStorage is a trust boundary: finite is not enough) ---------

  function validBody(b, rules, nextId) {
    if (!b || typeof b !== 'object') return false;
    var i;
    for (i = 0; i < BODY_NUMS.length; i++) if (!fin(b[BODY_NUMS[i]])) return false;
    for (i = 0; i < BODY_BOOLS.length; i++) if (typeof b[BODY_BOOLS[i]] !== 'boolean') return false;
    if (!Array.isArray(b.wallSeen) || b.wallSeen.length !== 4) return false;
    for (i = 0; i < 4; i++) if (!fin(b.wallSeen[i])) return false;
    return int(b.id, 0, nextId - 1) && int(b.tier, 1, MAX_TIER) &&
      b.x >= 0 && b.x <= rules.W && b.y >= 0 && b.y <= rules.L &&
      b.r > 0 && b.r0 > 0 && b.rTarget > 0 && b.invM > 0 &&
      int(b.growTick, 0, rules.GROW_TICKS) && int(b.age, 0, Infinity) &&
      int(b.bornTick, -1, Infinity) && int(b.chainDepth, 0, Infinity);
  }

  function validCounters(s, rules) {
    var big = Infinity;
    return int(s.seed, 0, UINT32 - 1) && int(s.rng, 0, UINT32 - 1) && int(s.tick, 0, big) &&
      int(s.nextId, 1, MAX_ID - 1) && int(s.current, 1, SPAWN_MAX) && int(s.next, 1, SPAWN_MAX) &&
      int(s.spawnCount, 0, big) && int(s.cooldown, 0, rules.COOLDOWN_TICKS) &&
      (s.phase !== 'cooldown' || s.cooldown >= 1) && (s.phase !== 'ready' || s.cooldown === 0) &&
      int(s.score, 0, big) && int(s.highestTier, 1, MAX_TIER) && int(s.runMask, 0, 0x1FF) &&
      int(s.launches, 0, big) && int(s.merges, 0, big) && int(s.dangerTicks, 0, big) &&
      int(s.dangerTickEmitted, -1, big) && int(s.threatTicks, 0, big) && int(s.dangerLevel, 0, 2) &&
      int(s.dangerSuspendUntil, 0, big) &&
      intArray(s.spawnHistory, 1, SPAWN_MAX) && s.spawnHistory.length <= HISTORY &&
      intArray(s.overIds, 0, MAX_ID - 1);
  }

  // Returns the resolved rules for a valid snapshot, or null.
  function validate(s) {
    if (!s || typeof s !== 'object' || s.rulesVersion !== RULES_VERSION) return null;
    var i;
    for (i = 0; i < GAME_NUMS.length; i++) if (!fin(s[GAME_NUMS[i]])) return null;
    for (i = 0; i < GAME_BOOLS.length; i++) if (typeof s[GAME_BOOLS[i]] !== 'boolean') return null;
    if (s.mode !== 'standard' && s.mode !== 'relaxed') return null;
    if (typeof s.phase !== 'string' || !has(PHASES, s.phase)) return null;
    if (!validOverrides(s.overrides) || !Array.isArray(s.bodies)) return null;
    var o = { mode: s.mode }, ok = s.overrides || {};
    Object.keys(ok).forEach(function (k) { o[k] = ok[k]; });
    var rules = resolveRules(o);
    if (!validCounters(s, rules)) return null;
    for (i = 0; i < s.bodies.length; i++) {
      if (!validBody(s.bodies[i], rules, s.nextId)) return null;
      if (i > 0 && s.bodies[i].id <= s.bodies[i - 1].id) return null;   // strictly ascending ids
    }
    var w = s.world;
    if (!w || typeof w !== 'object' || !Array.isArray(w.seen) || !int(w.poolGrowths, 0, Infinity)) return null;
    for (i = 0; i < w.seen.length; i++) {
      var p = w.seen[i];
      if (!Array.isArray(p) || p.length !== 2 || !int(p[0], 0, Infinity) || !int(p[1], -Infinity, Infinity)) return null;
    }
    return rules;
  }

  // ---- restore --------------------------------------------------------------------

  // restoreGame(snapshot) -> GameState | null. Takes a Snapshot (5.9 passes record.game); a
  // wrong rulesVersion, a missing, non-finite or out-of-range field gives null.
  function restoreGame(s) {
    var rules = validate(s);
    if (!rules) return null;
    var g = { rules: rules, world: physics.createWorld(rules), mode: s.mode, phase: s.phase };
    var i, k;
    for (i = 0; i < GAME_NUMS.length; i++) g[GAME_NUMS[i]] = s[GAME_NUMS[i]];
    for (i = 0; i < GAME_BOOLS.length; i++) g[GAME_BOOLS[i]] = s[GAME_BOOLS[i]];
    g.spawnHistory = s.spawnHistory.slice();
    g.overIds = s.overIds.slice();
    g.bombs = int(s.bombs, 0, 99) ? s.bombs : 0;              // bombs (added later): old records restore with 0
    g.bodies = s.bodies.map(function (src) {
      var b = {};
      for (k = 0; k < BODY_NUMS.length; k++) b[BODY_NUMS[k]] = src[BODY_NUMS[k]];
      for (k = 0; k < BODY_BOOLS.length; k++) b[BODY_BOOLS[k]] = src[BODY_BOOLS[k]];
      b.wallSeen = src.wallSeen.slice();
      return b;
    });
    for (i = 0; i < s.world.seen.length; i++) g.world.seen.set(s.world.seen[i][0], s.world.seen[i][1]);
    g.world.poolGrowths = s.world.poolGrowths;
    var r = rules.RADII[g.current], max = rules.W - r;            // re-clamp the aim (setAim)
    g.aimX = g.aimX < r ? r : (g.aimX > max ? max : g.aimX);
    return g;
  }

  // ---- hash -----------------------------------------------------------------------

  // FNV-1a 32-bit over the decimal text of the values, comma separated.
  function fnv1a(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  }

  function b01(v) { return v ? 1 : 0; }

  // hash(g) -> 8 hex characters over exactly the field list of DESIGN 5.5. It does not cover
  // growTick, r0/rTarget, px/py, launched, wallSeen, world.seen, dangerLevel, overIds, launches
  // or merges; test 42's event-list comparison is what catches restore bugs in those.
  function hash(g) {
    var v = [g.tick, g.score, g.rng, g.mode === 'relaxed' ? 1 : 0,
      has(PHASES, g.phase) ? PHASES[g.phase] : 3, g.cooldown, b01(g.launchPending),
      g.current, g.next, Math.round(g.aimX * 1e3), g.spawnCount];
    var h = g.spawnHistory || [];
    v.push(h.length);
    var i;
    for (i = 0; i < h.length; i++) v.push(h[i]);
    v.push(g.highestTier, g.runMask, g.dangerTicks, g.dangerTickEmitted, g.threatTicks,
      g.dangerSuspendUntil, b01(g.wonOnce), g.nextId, g.bombs | 0);
    var bodies = (g.bodies || []).slice().sort(function (a, b) { return a.id - b.id; });
    for (i = 0; i < bodies.length; i++) {
      var b = bodies[i];
      v.push(b.id, b.tier, Math.round(b.x * 1e3), Math.round(b.y * 1e3), Math.round(b.vx * 1e3),
        Math.round(b.vy * 1e3), Math.round(b.r * 1e3), b.age, b.bornTick, b.chainDepth, b01(b.cleared));
    }
    return fnv1a(v.join(','));
  }
  /* @pure-end */
  return { snapshot: snapshot, restoreGame: restoreGame, hash: hash, resolveRules: resolveRules };
});
