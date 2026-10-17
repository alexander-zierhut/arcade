// src/ui/storage.js: the localStorage wrapper (DESIGN 5.9). Browser file; sets CM.ui.storage.
// Every access is wrapped in try/catch. When localStorage is missing or throws (Safari file://,
// private mode, quota), the wrapper keeps working on an in-memory object for the rest of the session.
// Save records go through the pure CM.game.normalizeSave / mergeSave (2.11); the `music` setting
// (owner round 2: its own persisted "Music" toggle, default on) is carried here as well, so it
// survives even while save.js does not know the field yet (docs/amendments/ui.md).
(function (root) {
  'use strict';
  var CM = root.CM = root.CM || {};
  var ui = CM.ui = CM.ui || {};

  var mem = {};             // in-memory fallback, keyed like localStorage
  var broken = false;       // localStorage failed once: stay on memory (no flip-flopping between stores)
  var warned = {};

  function cfg(name, d) { return (CM.config && CM.config[name]) || d; }
  function KEY() { return cfg('STORAGE_KEY', 'cocktailMerge.v1'); }
  function RUN_KEY() { return cfg('RUN_KEY', 'cocktailMerge.v1.run'); }
  function warnOnce(msg, e) {
    if (warned[msg]) return;
    warned[msg] = true;
    if (root.console && root.console.warn) root.console.warn('Cocktail Merge storage: ' + msg, e || '');
  }

  function ls() {
    if (broken) return null;
    try { return root.localStorage || null; } catch (e) { broken = true; warnOnce('localStorage unavailable', e); return null; }
  }
  function getRaw(key) {
    var s = ls();
    if (s) {
      try { var v = s.getItem(key); if (v !== null) return v; } catch (e) { broken = true; warnOnce('read failed', e); }
    }
    return Object.prototype.hasOwnProperty.call(mem, key) ? mem[key] : null;
  }
  function setRaw(key, value) {
    mem[key] = value;                       // memory always holds the latest value
    var s = ls();
    if (!s) return false;
    try { s.setItem(key, value); return true; } catch (e) { warnOnce('write failed (quota or private mode)', e); return false; }
  }
  function removeRaw(key) {
    delete mem[key];
    var s = ls();
    if (!s) return;
    try { s.removeItem(key); } catch (e) { warnOnce('remove failed', e); }
  }
  function parse(raw) {
    if (typeof raw !== 'string') return raw;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  // Fallbacks used only when CM.game is missing (keeps this file testable on its own, e.g. ui-check).
  function fallbackNormalize(raw) {
    var o = parse(raw), s = { v: 1, best: 0, bestTier: 1, muted: false, ambience: false, music: true, showNumbers: false,
      relaxed: true, lowGfx: false, wins: 0, discovered: 0 };
    if (!o || typeof o !== 'object') return s;
    ['best', 'wins'].forEach(function (k) { if (typeof o[k] === 'number' && o[k] >= 0 && Math.floor(o[k]) === o[k]) s[k] = o[k]; });
    if (o.bestTier >= 1 && o.bestTier <= 9 && Math.floor(o.bestTier) === o.bestTier) s.bestTier = o.bestTier;
    ['muted', 'ambience', 'music', 'showNumbers', 'relaxed', 'lowGfx'].forEach(function (k) { if (typeof o[k] === 'boolean') s[k] = o[k]; });
    if (typeof o.discovered === 'number' && o.discovered >= 0) s.discovered = (o.discovered >>> 0) & 0x1FF;
    return s;
  }
  function normalize(raw) {
    var g = CM.game, s;
    try { s = (g && typeof g.normalizeSave === 'function') ? g.normalizeSave(raw) : fallbackNormalize(raw); }
    catch (e) { warnOnce('normalizeSave threw', e); s = fallbackNormalize(raw); }
    var o = parse(raw);
    if (typeof s.music !== 'boolean') s.music = (o && typeof o.music === 'boolean') ? o.music : true;
    return s;
  }
  function merge(stored, next) {
    var g = CM.game, m;
    try {
      if (g && typeof g.mergeSave === 'function') m = g.mergeSave(stored, next);
    } catch (e) { warnOnce('mergeSave threw', e); }
    if (!m) {
      var a = normalize(stored), b = normalize(next);
      m = { v: 1, best: Math.max(a.best, b.best), bestTier: Math.max(a.bestTier, b.bestTier), muted: b.muted,
        ambience: b.ambience, showNumbers: b.showNumbers, relaxed: b.relaxed, wins: Math.max(a.wins, b.wins),
        discovered: (a.discovered | b.discovered) & 0x1FF };
    }
    // music is a setting: it takes `next` (like muted / ambience), else keeps the stored value.
    m.music = (next && typeof next.music === 'boolean') ? next.music
      : (stored && typeof stored.music === 'boolean') ? stored.music : true;
    return m;
  }

  /** load() -> Save: the stored settings and records, normalised (defaults when nothing is stored). */
  function load() { return normalize(getRaw(KEY())); }

  /** save(next) -> Save: merges with the stored value (best/wins/bestTier max, discovered OR) and writes. */
  function save(next) {
    var merged = merge(load(), next || {});
    try { setRaw(KEY(), JSON.stringify(merged)); } catch (e) { warnOnce('save failed', e); }
    return merged;
  }

  /** loadRun() -> RunRecord | null. A malformed or out-of-date record is discarded silently. */
  function loadRun() {
    var raw = getRaw(RUN_KEY()), rec;
    if (raw === null || raw === undefined) return null;
    rec = parse(raw);
    var ok = rec && typeof rec === 'object' && rec.v === 1 && rec.game && typeof rec.game === 'object' &&
      rec.rulesVersion === cfg('RULES_VERSION', 2) && rec.meta && typeof rec.meta === 'object';
    if (!ok) { clearRun(); return null; }
    return rec;
  }

  /** saveRun(record): stores the run in progress (a few kB of JSON). */
  function saveRun(rec) {
    if (!rec) return;
    try { setRaw(RUN_KEY(), JSON.stringify(rec)); } catch (e) { warnOnce('saveRun failed', e); }
  }

  /** clearRun(): forgets the run in progress. */
  function clearRun() { removeRaw(RUN_KEY()); }

  /** persistent() -> boolean: false when we are on the in-memory fallback (nothing survives a reload). */
  function persistent() { return !!ls(); }

  ui.storage = { load: load, save: save, loadRun: loadRun, saveRun: saveRun, clearRun: clearRun, persistent: persistent };
})(typeof globalThis !== 'undefined' ? globalThis : this);
