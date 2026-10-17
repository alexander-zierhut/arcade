// src/ui/storage.js: the localStorage wrapper. Every access is in try/catch; when localStorage is missing or throws
// (private mode, quota, file:// quirks) an in-memory object serves the rest of the session. Records go through the pure
// SS.save.normalizeSave / mergeSave.
(function (root) {
  'use strict';
  var SS = root.SS = root.SS || {};
  var ui = SS.ui = SS.ui || {};
  var mem = {}, broken = false, warned = {};

  function cfg(name, d) { return (SS.config && SS.config[name]) || d; }
  function KEY() { return cfg('STORAGE_KEY', 'supermarketSorter.v1'); }
  function RUN_KEY() { return cfg('RUN_KEY', 'supermarketSorter.v1.run'); }
  function warnOnce(msg, e) {
    if (warned[msg]) return;
    warned[msg] = true;
    if (root.console && root.console.warn) root.console.warn('[storage] ' + msg, e || '');
  }
  function ls() {
    if (broken) return null;
    try { return root.localStorage || null; } catch (e) { broken = true; warnOnce('localStorage unavailable', e); return null; }
  }
  function getRaw(key) {
    var s = ls();
    if (s) { try { var v = s.getItem(key); if (v !== null) return v; } catch (e) { broken = true; warnOnce('read failed', e); } }
    return Object.prototype.hasOwnProperty.call(mem, key) ? mem[key] : null;
  }
  function setRaw(key, value) {
    mem[key] = value;
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

  /** load() -> Save (normalised; defaults when nothing is stored). */
  function load() { return SS.save.normalizeSave(getRaw(KEY())); }
  /** save(next) -> Save: merges with the stored record and writes it. */
  function save(next) {
    var merged = SS.save.mergeSave(getRaw(KEY()), next || {});
    try { setRaw(KEY(), JSON.stringify(merged)); } catch (e) { warnOnce('save failed', e); }
    return merged;
  }
  /** loadRun(mode) -> run record v2 or null (malformed or out-of-date records are dropped). */
  function loadRun(mode) {
    var raw = getRaw(RUN_KEY() + '.' + mode);
    if (raw === null || raw === undefined) return null;
    var rec = null;
    try { rec = JSON.parse(raw); } catch (e) { rec = null; }
    var ok = rec && typeof rec === 'object' && rec.v === 2 && rec.rulesVersion === cfg('RULES_VERSION', 2) && rec.mode === mode && rec.levelNo >= 1;
    if (!ok) { clearRun(mode); return null; }
    return rec;
  }
  function saveRun(mode, rec) { if (rec) { try { setRaw(RUN_KEY() + '.' + mode, JSON.stringify(rec)); } catch (e) { warnOnce('saveRun failed', e); } } }
  function clearRun(mode) { removeRaw(RUN_KEY() + '.' + mode); }
  /** legacyRun() -> the v1 run record (for the one-time migration) or null. */
  function legacyRun() { var raw = getRaw(RUN_KEY()); if (!raw) return null; var rec = null; try { rec = JSON.parse(raw); } catch (e) { rec = null; } removeRaw(RUN_KEY()); return rec && rec.v === 1 ? rec : null; }
  function persistent() { return !!ls(); }

  /** exportAll() -> JSON text of the whole progress (settings, records, boards in progress) with version numbers. */
  function exportAll() {
    var runs = {}, d = new Date();
    SS.save.MODES.forEach(function (m) { runs[m] = loadRun(m); });
    var rec = SS.save.exportRecord(load(), runs, { version: cfg('VERSION', ''), rulesVersion: cfg('RULES_VERSION', 2), date: d.toISOString().slice(0, 19) });
    return JSON.stringify(rec, null, 1);
  }
  /** importAll(text) -> info: merges the imported records with the stored ones (progress only ever grows) and restores
   *  the boards in progress when the file has them for the same rules version. Throws on an invalid file. */
  function importAll(text) {
    var r = SS.save.importRecord(text), merged = save(r.save);
    SS.save.MODES.forEach(function (m) { var run = r.runs[m]; if (run && run.rulesVersion === cfg('RULES_VERSION', 2)) saveRun(m, run); });
    r.info.reached = { timed: merged.records.timed.reached, relaxed: merged.records.relaxed.reached };
    return r.info;
  }

  ui.storage = { load: load, save: save, loadRun: loadRun, saveRun: saveRun, clearRun: clearRun, legacyRun: legacyRun, persistent: persistent, exportAll: exportAll, importAll: importAll };
})(typeof globalThis !== 'undefined' ? globalThis : this);
