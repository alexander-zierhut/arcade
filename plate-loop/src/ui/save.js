// src/ui/save.js: the player's progress via Arcade.storage (key 'save' under the game's prefix): the highest cleared
// level + 1, the attempts per level, the endless bests, the sound switch and which how-to cards were shown. Never throws.
(function (root) {
  'use strict';
  var PL = root.PlateLoop = root.PlateLoop || {};
  var TIERS = ['easy', 'normal', 'hard', 'extreme'];
  var KEY = 'save';

  function defaults() {
    return { level: 1, attempts: {}, endless: { best: { easy: 0, normal: 0, hard: 0, extreme: 0 }, tier: 'easy', noLuck: false }, sound: true, seen: { howto: [] } };
  }
  function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  function num(v, d) { v = Number(v); return isFinite(v) && v >= 0 ? Math.floor(v) : d; }

  /** clean(raw): a complete, well-typed save from whatever was stored (older or damaged data included). */
  function clean(raw) {
    var d = defaults(), s = isObj(raw) ? raw : {};
    d.level = Math.max(1, num(s.level, 1));
    if (isObj(s.attempts)) for (var id in s.attempts) if (Object.prototype.hasOwnProperty.call(s.attempts, id)) d.attempts[id] = num(s.attempts[id], 0);
    if (isObj(s.endless)) {
      if (isObj(s.endless.best)) for (var i = 0; i < TIERS.length; i++) d.endless.best[TIERS[i]] = num(s.endless.best[TIERS[i]], 0);
      if (TIERS.indexOf(s.endless.tier) >= 0) d.endless.tier = s.endless.tier;
      d.endless.noLuck = s.endless.noLuck === true;
    }
    d.sound = s.sound !== false;
    if (isObj(s.seen) && Array.isArray(s.seen.howto)) d.seen.howto = s.seen.howto.filter(function (x) { return typeof x === 'string'; });
    return d;
  }

  var cache = null;
  function store() { return root.Arcade && root.Arcade.storage ? root.Arcade.storage : null; }
  function load() {
    if (cache) return cache;
    var raw = null;
    try { var st = store(); raw = st ? st.get(KEY, null) : null; } catch (e) { raw = null; }
    cache = clean(raw);
    return cache;
  }
  function persist() {
    try { var st = store(); if (st) st.set(KEY, cache); } catch (e) { /* storage is the kit's problem; the memory copy stays */ }
  }

  var save = {
    /** get() -> the whole save (a copy). */
    get: function () { return JSON.parse(JSON.stringify(load())); },
    /** set(next): replaces the save with next (cleaned). */
    set: function (next) { cache = clean(next); persist(); return save.get(); },
    /** patch(partial): merges partial into the save: objects merge one level deeper (attempts, endless, endless.best, seen). */
    patch: function (p) {
      var s = load();
      if (isObj(p)) {
        for (var k in p) {
          if (!Object.prototype.hasOwnProperty.call(p, k)) continue;
          if (k === 'endless' && isObj(p.endless)) {
            for (var e in p.endless) {
              if (!Object.prototype.hasOwnProperty.call(p.endless, e)) continue;
              if (e === 'best' && isObj(p.endless.best)) for (var t in p.endless.best) s.endless.best[t] = p.endless.best[t];
              else s.endless[e] = p.endless[e];
            }
          } else if ((k === 'attempts' || k === 'seen') && isObj(p[k])) {
            for (var a in p[k]) s[k][a] = p[k][a];
          } else s[k] = p[k];
        }
      }
      cache = clean(s); persist();
      return save.get();
    },
    /** seenHowto(id) / markHowto(id): which how-to cards were shown. */
    seenHowto: function (id) { return load().seen.howto.indexOf(id) >= 0; },
    markHowto: function (id) { var s = load(); if (s.seen.howto.indexOf(id) < 0) { s.seen.howto.push(id); persist(); } },
    /** attempt(id): counts a start of level id and returns the new number (1 for the first start). */
    attempt: function (id) { var s = load(), n = (s.attempts[id] || 0) + 1; s.attempts[id] = n; persist(); return n; },
    /** cleared(id): the level is done: level = max(level, id + 1). */
    cleared: function (id) { var s = load(); if (id + 1 > s.level) { s.level = id + 1; persist(); } return s.level; },
    /** bestStreak(tier, n): records n when it beats the best; returns true on a new best. */
    bestStreak: function (tier, n) { var s = load(); if (TIERS.indexOf(tier) < 0) return false; if (n > (s.endless.best[tier] || 0)) { s.endless.best[tier] = n; persist(); return true; } return false; },
    reload: function () { cache = null; return save.get(); },
    defaults: defaults, clean: clean
  };
  PL.save = save;
  if (typeof module !== 'undefined' && module.exports) module.exports = save;
})(typeof window !== 'undefined' ? window : globalThis);
