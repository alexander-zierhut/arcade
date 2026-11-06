// src/ui/save.js: the player's progress via Arcade.storage (key 'save' under the game's prefix): the highest cleared
// level + 1, the attempts per level, the endless bests per difficulty (1-10), the sound switch, the plain-graphics
// switch, the belt style (plates | stream) and which how-to cards were shown. Never throws.
// levelsVersion: 1 = the first beta's 500 levels, 2 = the rebuilt (much harder) levels of 2026-11-06. A player's level
// number is kept across the change; the news card tells them.
(function (root) {
  'use strict';
  var PL = root.PlateLoop = root.PlateLoop || {};
  var TIERS = ['easy', 'normal', 'hard', 'extreme'];
  var TIER_TO_DIFF = { easy: 1, normal: 3, hard: 5, extreme: 7 };     // the old per-tier bests move to these difficulties
  var MECHS = ['hidden', 'pair', 'wrap', 'ice', 'lock', 'oneway'];
  var KEY = 'save';
  var LEVELS_VERSION = 2;
  var MAX_FAVS = 200;

  function defaults() {
    var best = {}, i;
    for (i = 1; i <= 10; i++) best[i] = 0;
    return { level: 1, attempts: {}, endless: { best: best, difficulty: 1, noLuck: false, disabled: [] }, favs: [], sound: true, plain: false, belt: 'plates', seen: { howto: [] }, levelsVersion: LEVELS_VERSION };
  }
  function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  function num(v, d) { v = Number(v); return isFinite(v) && v >= 0 ? Math.floor(v) : d; }

  /** clean(raw): a complete, well-typed save from whatever was stored (older or damaged data included). */
  function clean(raw) {
    var d = defaults(), s = isObj(raw) ? raw : {}, i, k;
    d.level = Math.max(1, num(s.level, 1));
    if (isObj(s.attempts)) for (var id in s.attempts) if (Object.prototype.hasOwnProperty.call(s.attempts, id)) d.attempts[id] = num(s.attempts[id], 0);
    if (isObj(s.endless)) {
      if (isObj(s.endless.best)) {
        for (i = 1; i <= 10; i++) d.endless.best[i] = num(s.endless.best[i], 0);
        for (i = 0; i < TIERS.length; i++) {                                  // the first beta kept a best per tier
          k = TIER_TO_DIFF[TIERS[i]];
          if (num(s.endless.best[TIERS[i]], 0) > d.endless.best[k]) d.endless.best[k] = num(s.endless.best[TIERS[i]], 0);
        }
      }
      if (num(s.endless.difficulty, 0) >= 1 && num(s.endless.difficulty, 0) <= 10) d.endless.difficulty = num(s.endless.difficulty, 1);
      else if (TIERS.indexOf(s.endless.tier) >= 0) d.endless.difficulty = TIER_TO_DIFF[s.endless.tier];
      d.endless.noLuck = s.endless.noLuck === true;
      if (Array.isArray(s.endless.disabled)) d.endless.disabled = s.endless.disabled.filter(function (x) { return MECHS.indexOf(x) >= 0; });
      if (d.endless.noLuck && d.endless.disabled.indexOf('hidden') < 0) d.endless.disabled.push('hidden');
      d.endless.noLuck = d.endless.disabled.indexOf('hidden') >= 0;
    }
    d.sound = s.sound !== false;
    if (Array.isArray(s.favs)) {                                           // favourites: { level } (a fixed level) or { code } (a generated one), newest first
      var seen = {};
      s.favs.forEach(function (f) {
        if (!isObj(f) || d.favs.length >= MAX_FAVS) return;
        var e = null;
        if (num(f.level, 0) >= 1) e = { level: num(f.level, 0) };
        else if (typeof f.code === 'string' && /^L(10|[1-9])[npwiko]*-[0-9A-Z]{1,7}$/i.test(f.code)) e = { code: f.code.toUpperCase().replace(/^L(10|[1-9])([NPWIKO]*)/, function (m, d1, fl) { return 'L' + d1 + fl.toLowerCase(); }) };
        if (!e) return;
        var key = e.level ? 'L' + e.level : e.code;
        if (seen[key]) return;
        seen[key] = true;
        if (typeof f.hard === 'number' && isFinite(f.hard)) e.hard = f.hard;
        if (num(f.added, 0) > 0) e.added = num(f.added, 0);
        d.favs.push(e);
      });
    }
    d.plain = s.plain === true;
    d.belt = s.belt === 'stream' ? 'stream' : 'plates';
    if (isObj(s.seen) && Array.isArray(s.seen.howto)) d.seen.howto = s.seen.howto.filter(function (x) { return typeof x === 'string'; });
    d.levelsVersion = s.level !== undefined || s.levelsVersion !== undefined ? num(s.levelsVersion, 1) : LEVELS_VERSION;   // an old save without the field played version 1
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
    /** bestStreak(difficulty, n): records n when it beats the best of that difficulty (1-10); returns true on a new best. */
    bestStreak: function (difficulty, n) { var s = load(), d = num(difficulty, 0); if (d < 1 || d > 10) return false; if (n > (s.endless.best[d] || 0)) { s.endless.best[d] = n; persist(); return true; } return false; },
    /** favKey(entry) -> 'L54' or the code; isFav(entry); toggleFav(entry) -> true when it is a favourite now. */
    favKey: function (e) { return e && e.level ? 'L' + e.level : (e && e.code ? String(e.code) : ''); },
    isFav: function (e) { var k = save.favKey(e), l = load().favs, i; for (i = 0; i < l.length; i++) if (save.favKey(l[i]) === k) return true; return false; },
    toggleFav: function (e) {
      var s = load(), k = save.favKey(e), i;
      if (!k) return false;
      for (i = 0; i < s.favs.length; i++) if (save.favKey(s.favs[i]) === k) { s.favs.splice(i, 1); persist(); return false; }
      s.favs.unshift(clean({ favs: [e] }).favs[0] || e);
      if (s.favs.length > MAX_FAVS) s.favs.length = MAX_FAVS;
      persist();
      return true;
    },
    /** migrated(): true once, when the save comes from the first beta's levels; marks the save as current. */
    migrated: function () { var s = load(); if (s.levelsVersion >= LEVELS_VERSION) return false; s.levelsVersion = LEVELS_VERSION; persist(); return true; },
    reload: function () { cache = null; return save.get(); },
    defaults: defaults, clean: clean, LEVELS_VERSION: LEVELS_VERSION
  };
  PL.save = save;
  if (typeof module !== 'undefined' && module.exports) module.exports = save;
})(typeof window !== 'undefined' ? window : globalThis);
