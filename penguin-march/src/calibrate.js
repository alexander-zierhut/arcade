// src/calibrate.js: turns the relative numbers in a level into absolute ones by playing it. A level author writes
// "a wall worth 80% of what the waddle can shoot down on the way" (w@62:~0.8) or "a gate that adds half the
// waddle" (g@40:+~0.5,-~0.3) instead of guessing hit points that fit a waddle whose size depends on every gate
// before it. calibrate(def, shop) runs the greedy bot (src/bot.js) through the level with that shop: a relative
// thing gets a provisional number when it comes within FIX_DIST (so the bot can plan around it) and its final
// number at REFIX_DIST, from the waddle as it is then, with the best choice at any gate still in between applied.
// Deterministic. Pure.
//
// Relative forms (rel fields on the entities, set by levels.js / gen.js):
//   wall  { hpRel: f }         hp = f x damage the waddle can deal before reaching it   (f > 1 costs penguins)
//   wall  { hpBite: b }        hp = that damage + b x waddle size                        (costs b of the waddle)
//   pack  { hpRel / hpBite }   the same, with the pack walking toward the waddle
//   ally  { giftRel: f }       gift = f x waddle size;  { hpRel: f } lock as a wall
//   gate  { valRel: f }        + or - value = f x waddle size (at least 1)
//   boss  def.bossSecs         boss hp = that many seconds of the waddle's fire when the fight starts
(function (root) {
  'use strict';
  var PM = root.PM = root.PM || {};
  var C = PM.config || (typeof require === 'function' ? require('./config.js') : null);
  var S = PM.sim || (typeof require === 'function' ? require('./sim.js') : null);
  var B = PM.bot || (typeof require === 'function' ? require('./bot.js') : null);

  function isRel(e) { return e.hpRel != null || e.hpBite != null || e.giftRel != null || e.valRel != null; }

  /** Where the waddle meets e: a wall where it stands, a pack somewhere in between (it walks toward the waddle). */
  function contactZ(state, e) {
    return e.type === 'pack' ? state.z + (e.z - state.z) * C.SPEED / (C.SPEED + C.PACK_SPEED) : e.z;
  }

  /** Damage a waddle of n deals to e between coming into range and touching it. The window is RANGE, or less
   *  when another row (a gate being shot up, a wall, a pack) sits closer in front of e: fire goes to that first. */
  function available(state, n, e) {
    var save = state.n; state.n = n;
    var d = S.dps(state);
    state.n = save;
    var pack = e.type === 'pack', cz = contactZ(state, e), prev = state.z;
    for (var i = 0; i < state.entities.length; i++) {
      var o = state.entities[i];
      if (!o.alive || o === e || o.type === 'fish' || o.z <= state.z || o.z >= cz) continue;
      if (o.type === 'ally' && Math.abs(o.x - e.x) > 0.5) continue;     // an ally in the other lane does not block
      if (o.z > prev) prev = o.z;
    }
    var span = Math.min(C.RANGE, cz - prev);
    return d * Math.max(0.5, span) / (C.SPEED + (pack ? C.PACK_SPEED : 0));
  }

  /** The waddle size to expect when e is met: the current one with the better side of every gate pair before that. */
  function expectedN(state, e) {
    var n = Math.max(1, state.n), seen = {}, cz = contactZ(state, e);
    for (var i = 0; i < state.entities.length; i++) {
      var g = state.entities[i];
      if (!g.alive || g.type !== 'gate' || g.z <= state.z || g.z >= cz || seen[g.pair] || g.val == null) continue;
      var other = null;
      for (var j = i + 1; j < state.entities.length; j++) if (state.entities[j].pair === g.pair) { other = state.entities[j]; break; }
      seen[g.pair] = true;
      var a = S.applyGate(n, g), b = other && other.val != null ? S.applyGate(n, other) : a;
      n = Math.max(1, Math.max(a, b));
    }
    return n;
  }

  /** fix(e, rel, state): e gets its absolute numbers from the rel fields (kept on `rel` so it can be fixed again). */
  function fix(e, rel, state) {
    var n = expectedN(state, e);
    if (rel.valRel != null) e.val = Math.max(1, Math.round(rel.valRel * n));
    if (rel.giftRel != null) e.gift = Math.max(1, Math.round(rel.giftRel * n));
    if (rel.hpRel != null) e.hp = Math.max(1, Math.round(rel.hpRel * available(state, n, e)));
    if (rel.hpBite != null) e.hp = Math.max(1, Math.round(available(state, n, e) + rel.hpBite * n));
    e.val0 = e.val; e.hp0 = e.hp;
  }

  function relOf(e) {
    var rel = { hpRel: e.hpRel, hpBite: e.hpBite, giftRel: e.giftRel, valRel: e.valRel };
    delete e.hpRel; delete e.hpBite; delete e.giftRel; delete e.valRel;
    return rel;
  }

  function copyFixed(from, to) {
    if (to.type === 'gate') to.val = from.val;
    if (to.type === 'ally') to.gift = from.gift;
    if (to.type !== 'gate' && to.type !== 'fish') to.hp = from.hp;
  }

  /**
   * calibrate(def, shop) -> def, with every relative number replaced (in place). shop defaults to the reference
   * shop for the level. Levels without relative numbers are returned untouched.
   */
  function calibrate(def, shop) {
    var relIds = [];
    def.entities.forEach(function (e, i) { if (isRel(e)) relIds.push(i); });
    if (!relIds.length && def.bossSecs == null) return def;
    shop = shop || C.refShop(def.n);
    if (def.bossSecs != null && !(def.bossHp > 0)) def.bossHp = 1;    // placeholder so create() is happy
    var rels = {};
    relIds.forEach(function (i) { rels[i] = relOf(def.entities[i]); });
    // Two passes. In the first, a thing gets a provisional number at FIX_DIST (the bot needs one to plan) and its
    // final one at REFIX_DIST. In the second, the first pass's finals serve as the provisional numbers, so the bot
    // plays the level as it will ship and the refixed numbers match that play-through.
    var state;
    for (var pass = 0; pass < 2; pass++) {
      state = S.create(def, shop);
      var byId = {};
      state.entities.forEach(function (e) { byId[e.id] = e; });
      var provisional = pass === 0 ? relIds.slice() : [], fin = relIds.slice();
      var dt = 1 / 60, guard = 0;
      while (state.phase === 'RUN' && guard++ < 60 * 600) {
        while (provisional.length && byId[provisional[0]].z - state.z <= C.FIX_DIST) { var pid = provisional.shift(); fix(byId[pid], rels[pid], state); }
        while (fin.length && byId[fin[0]].z - state.z <= C.REFIX_DIST) {
          var id = fin.shift();
          fix(byId[id], rels[id], state);
          copyFixed(byId[id], def.entities[id]);
        }
        S.step(state, dt, B.greedy(state));
        state.events.length = 0;
      }
      fin.forEach(function (id) { fix(byId[id], rels[id], state); copyFixed(byId[id], def.entities[id]); });   // died early: fix the rest as is
    }
    if (def.bossSecs != null) {
      var n = state.phase === 'LOST' ? Math.max(1, Math.round(state.peak / 2)) : state.n;   // a dry run that died: a middling waddle
      var save = state.n; state.n = n;
      def.bossHp = Math.max(1, Math.round(def.bossSecs * S.dps(state)));
      state.n = save;
      delete def.bossSecs;
    }
    return def;
  }

  PM.calibrate = { calibrate: calibrate, available: available, isRel: isRel, expectedN: expectedN, contactZ: contactZ };
  if (typeof module !== 'undefined' && module.exports) module.exports = PM.calibrate;
})(typeof window !== 'undefined' ? window : globalThis);
