// src/save.js: progress in localStorage under STORAGE_KEY (README "Storage": every key starts with penguinMarch.).
// One JSON object: { v, reached, stars: { "<level>": 1..3 }, coins, upgrades: { size, rate, dmg }, muted }.
// load() never throws: a missing, broken or foreign value gives a fresh save. The storage object can be injected
// for the tests (anything with getItem/setItem/removeItem). Pure apart from the storage calls.
(function (root) {
  'use strict';
  var PM = root.PM = root.PM || {};
  var C = PM.config || (typeof require === 'function' ? require('./config.js') : null);

  function fresh() {
    return { v: 1, reached: 1, stars: {}, coins: 0, upgrades: { size: 0, rate: 0, dmg: 0 }, muted: false };
  }

  function clampShop(x) { return Math.min(C.MAX_SHOP, Math.max(0, x | 0)); }

  /** normalize(any) -> a valid save built from whatever fields are usable. */
  function normalize(raw) {
    var s = fresh();
    if (!raw || typeof raw !== 'object') return s;
    if (raw.reached >= 1) s.reached = Math.floor(raw.reached);
    if (raw.stars && typeof raw.stars === 'object') {
      Object.keys(raw.stars).forEach(function (k) {
        var v = raw.stars[k] | 0;
        if (/^\d+$/.test(k) && v >= 1 && v <= 3) s.stars[k] = v;
      });
    }
    if (raw.coins >= 0) s.coins = Math.floor(raw.coins);
    if (raw.upgrades && typeof raw.upgrades === 'object') {
      s.upgrades.size = clampShop(raw.upgrades.size); s.upgrades.rate = clampShop(raw.upgrades.rate); s.upgrades.dmg = clampShop(raw.upgrades.dmg);
    }
    s.muted = !!raw.muted;
    return s;
  }

  function storage(st) {
    if (st) return st;
    try { return root.localStorage; } catch (e) { return null; }
  }

  function load(st) {
    var store = storage(st);
    if (!store) return fresh();
    try {
      var raw = store.getItem(C.STORAGE_KEY);
      return raw ? normalize(JSON.parse(raw)) : fresh();
    } catch (e) { return fresh(); }
  }

  function save(s, st) {
    var store = storage(st);
    if (!store) return false;
    try { store.setItem(C.STORAGE_KEY, JSON.stringify(normalize(s))); return true; } catch (e) { return false; }
  }

  function clear(st) {
    var store = storage(st);
    if (!store) return;
    try { store.removeItem(C.STORAGE_KEY); } catch (e) { /* nothing to do */ }
  }

  var REPLAY_SHARE = 0.25;   // a level already won pays this share of its coins again (replays are for fun, not farming)

  /** recordWin(s, levelNo, stars, coins) -> the coins awarded; the save gets the best stars, the next level unlocked. */
  function recordWin(s, levelNo, stars, coins) {
    var again = !!s.stars[levelNo];
    var awarded = again ? Math.ceil(coins * REPLAY_SHARE) : coins;
    s.stars[levelNo] = Math.max(s.stars[levelNo] | 0, stars);
    s.reached = Math.max(s.reached, levelNo + 1);
    s.coins += awarded;
    return awarded;
  }

  /** buy(s, key) -> true when the upgrade was bought (coins taken, level raised). */
  function buy(s, key) {
    var lvl = s.upgrades[key];
    if (lvl == null || lvl >= C.MAX_SHOP) return false;
    var price = C.PRICES[lvl];
    if (s.coins < price) return false;
    s.coins -= price; s.upgrades[key] = lvl + 1;
    return true;
  }

  PM.save = { fresh: fresh, normalize: normalize, load: load, save: save, clear: clear, recordWin: recordWin, buy: buy };
  if (typeof module !== 'undefined' && module.exports) module.exports = PM.save;
})(typeof window !== 'undefined' ? window : globalThis);
