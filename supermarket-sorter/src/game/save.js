// src/game/save.js: the persistent record, schema v2 (DESIGN 5.4). Pure. normalizeSave accepts anything (a JSON string,
// an object, null, a v1 record) and returns a valid v2 record; mergeSave combines the stored record with new values.
(function (root) {
  'use strict';
  var SS = root.SS = root.SS || {};
  var MODES = ['timed', 'relaxed'], TOP_N = 10;
  var BOOLS = { muted: false, music: false, lowGfx: false, haptics: true, reducedMotion: false, stillBelts: false, showDepth: false, flatIcons: false };
  var TIPS = ['drag', 'tap', 'layers', 'bunny', 'lock', 'depth', 'belts', 'beltBunny', 'sil', 'hbelt', 'drift', 'warn', 'orphan', 'turbo'];

  function parse(raw) { if (typeof raw !== 'string') return raw; try { return JSON.parse(raw); } catch (e) { return null; } }
  function uint(v) { return typeof v === 'number' && isFinite(v) && v >= 0 ? Math.floor(v) : 0; }
  function date(d) { return typeof d === 'string' ? d.slice(0, 10) : ''; }
  function entry(e, mode) {
    if (!e || typeof e !== 'object') return null;
    var o = { score: uint(e.score), level: uint(e.level), date: date(e.date) };
    if (mode === 'timed') o.fromLevel = Math.max(1, uint(e.fromLevel) || 1);
    return o.score > 0 || o.level > 0 ? o : null;
  }
  function sortTop(top) { top.sort(function (a, b) { return b.score - a.score || b.level - a.level; }); return top.slice(0, TOP_N); }
  function levelRec(x, mode) {
    if (!x || typeof x !== 'object') return null;
    var o = { best: uint(x.best), stars: Math.min(3, uint(x.stars)) };
    if (mode === 'relaxed') { o.moves = uint(x.moves); o.badges = Array.isArray(x.badges) ? x.badges.filter(function (b) { return typeof b === 'string'; }).slice(0, 4) : []; }
    return o;
  }
  function levels(src, mode) {
    var out = {};
    if (src && typeof src === 'object') for (var k in src) { if (/^\d+$/.test(k)) { var r = levelRec(src[k], mode); if (r) out[k] = r; } }
    return out;
  }
  function record(r, mode, v1) {
    r = r && typeof r === 'object' ? r : {};
    var top = Array.isArray(r.top) ? r.top.map(function (e) { return entry(e, mode); }).filter(Boolean) : [];
    var reached = Math.max(1, uint(r.reached));
    if (v1 && mode === 'relaxed') {            // v1 relaxed top entries were run totals: keep only the progress they imply
      top.forEach(function (e) { reached = Math.max(reached, e.level + 1); });
      top = [];
    }
    if (mode === 'timed') {
      return { reached: reached, best: uint(r.best), bestLevel: uint(r.bestLevel), games: uint(r.games),
        serie: { score: uint(r.serie && r.serie.score), fromLevel: Math.max(1, uint(r.serie && r.serie.fromLevel) || reached) }, top: sortTop(top), levels: levels(r.levels, mode) };
    }
    var lv = levels(r.levels, mode), totalBest = 0, totalStars = 0;
    for (var k in lv) { totalBest += lv[k].best; totalStars += lv[k].stars; }
    return { reached: reached, totalBest: totalBest, totalStars: totalStars, top: sortTop(top), levels: lv };
  }

  /** normalizeSave(raw) -> Save v2 */
  function normalizeSave(raw) {
    var o = parse(raw), s = { v: 2 };
    o = o && typeof o === 'object' ? o : {};
    var v1 = !(o.v >= 2);                          // only a real v1 record is migrated; a newer record is read as-is (unknown fields are ignored)
    for (var k in BOOLS) s[k] = typeof o[k] === 'boolean' ? o[k] : BOOLS[k];
    s.lang = o.lang === 'de' ? 'de' : 'en';
    s.seenVersion = typeof o.seenVersion === 'string' ? o.seenVersion.slice(0, 20) : '';   // the last version whose "what's new" card was seen (v0.3)
    s.seenInstallHint = o.seenInstallHint === true;                                           // the "Als App spielen" card was seen (v0.3.1)
    s.seenTips = {};
    TIPS.forEach(function (t) { s.seenTips[t] = !!(o.seenTips && o.seenTips[t]); });
    s.records = {};
    MODES.forEach(function (m) { s.records[m] = record(o.records && o.records[m], m, v1); });
    return s;
  }
  /** mergeSave(stored, next) -> Save: settings from next (when given), records per field: max, union of top lists, best per level. */
  function mergeSave(stored, next) {
    var a = normalizeSave(stored), b = normalizeSave(next), nx = parse(next) || {}, s = { v: 2 };
    for (var k in BOOLS) s[k] = typeof nx[k] === 'boolean' ? nx[k] : a[k];
    s.lang = nx.lang === 'en' || nx.lang === 'de' ? nx.lang : a.lang;
    s.seenVersion = typeof nx.seenVersion === 'string' ? b.seenVersion : a.seenVersion;
    s.seenInstallHint = a.seenInstallHint || b.seenInstallHint;
    s.seenTips = {};
    TIPS.forEach(function (t) { s.seenTips[t] = a.seenTips[t] || b.seenTips[t]; });
    s.records = {};
    MODES.forEach(function (m) {
      var ra = a.records[m], rb = b.records[m], seen = {}, top = [], lv = {}, key;
      ra.top.concat(rb.top).forEach(function (e) { var kk = e.score + '/' + e.level + '/' + e.date; if (!seen[kk]) { seen[kk] = 1; top.push(e); } });
      for (key in ra.levels) lv[key] = ra.levels[key];
      for (key in rb.levels) { if (!lv[key] || rb.levels[key].best > lv[key].best || (rb.levels[key].best === lv[key].best && rb.levels[key].stars > lv[key].stars)) lv[key] = rb.levels[key]; }
      var r = { reached: Math.max(ra.reached, rb.reached), top: sortTop(top), levels: lv };
      if (m === 'timed') {
        r.best = Math.max(ra.best, rb.best); r.bestLevel = Math.max(ra.bestLevel, rb.bestLevel); r.games = Math.max(ra.games, rb.games);
        r.serie = (nx.records && nx.records[m] && nx.records[m].serie) ? rb.serie : ra.serie;      // the Serie is state, not a record: next wins when given
      } else {
        r.totalBest = 0; r.totalStars = 0;
        for (key in lv) { r.totalBest += lv[key].best; r.totalStars += lv[key].stars; }
      }
      s.records[m] = r;
    });
    return s;
  }
  /** recordRun(save, mode, { score, level, fromLevel, date }) -> { save, rank, newBest }: a banked timed Serie (or a legacy run). */
  function recordRun(save, mode, run) {
    var s = normalizeSave(save), r = s.records[mode];
    if (!r) return { save: s, rank: -1, newBest: false };
    var e = entry(run, mode) || { score: 0, level: 0, date: '', fromLevel: 1 };
    var newBest = e.score > (r.best || 0);
    if (mode === 'timed') { r.best = Math.max(r.best, e.score); r.bestLevel = Math.max(r.bestLevel, e.level); r.games += 1; }
    r.top.push(e);
    r.top = sortTop(r.top);
    return { save: s, rank: r.top.indexOf(e), newBest: newBest };
  }
  /** recordLevel(save, mode, n, { score, stars, moves, badges, date }) -> { save, improved, newBest }: per-level best (both modes). */
  function recordLevel(save, mode, n, res) {
    var s = normalizeSave(save), r = s.records[mode], key = String(n), prev = r.levels[key], improved = false;
    var rec = { best: uint(res.score), stars: Math.min(3, uint(res.stars)) };
    if (mode === 'relaxed') { rec.moves = uint(res.moves); rec.badges = Array.isArray(res.badges) ? res.badges.slice(0, 4) : []; }
    if (!prev || rec.best > prev.best || (rec.best === prev.best && rec.stars > prev.stars)) { r.levels[key] = rec; improved = true; }
    r.reached = Math.max(r.reached, n + 1);
    var newBest = false;
    if (mode === 'relaxed') {
      r.totalBest = 0; r.totalStars = 0;
      for (var k in r.levels) { r.totalBest += r.levels[k].best; r.totalStars += r.levels[k].stars; }
      if (improved) { var w = Math.round(rec.best * (100 + n) / 100); newBest = !r.top.length || w > r.top[0].score; r.top.push({ score: w, level: n, date: date(res.date) }); r.top = sortTop(r.top); }
    }
    return { save: s, improved: improved, newBest: newBest };
  }

  // ---------- export / import (a versioned, self-describing JSON file; DESIGN 8.8 + owner: updates must never destroy progress) ----------
  var EXPORT_APP = 'supermarket-sorter', EXPORT_FORMAT = 1, SAVE_VERSION = 2;
  function validRun(rec, mode) {
    return !!(rec && typeof rec === 'object' && rec.v >= 2 && typeof rec.rulesVersion === 'number' && rec.mode === mode && rec.levelNo >= 1);
  }
  /** exportRecord(save, runs, meta) -> plain object: { app, format, version, saveVersion, rulesVersion, exportedAt, save, runs } */
  function exportRecord(save, runs, meta) {
    meta = meta || {};
    var out = { app: EXPORT_APP, format: EXPORT_FORMAT, version: String(meta.version || ''), saveVersion: SAVE_VERSION, rulesVersion: meta.rulesVersion || 0,
      exportedAt: typeof meta.date === 'string' ? meta.date : '', save: normalizeSave(save), runs: {} };
    MODES.forEach(function (m) { out.runs[m] = runs && validRun(runs[m], m) ? runs[m] : null; });
    return out;
  }
  /** importRecord(text|object) -> { save, runs, info } or throws an Error with a short reason. The save is normalised
   *  (any older save version migrates; a newer one is read with unknown fields ignored); runs are kept only when valid. */
  function importRecord(input) {
    var o = parse(input);
    if (!o || typeof o !== 'object') throw new Error('not a JSON object');
    if (o.app !== EXPORT_APP) throw new Error('not a Supermarket Sorter file');
    if (typeof o.format !== 'number' || o.format < 1) throw new Error('unknown format');
    if (!o.save || typeof o.save !== 'object') throw new Error('no save data');
    var save = normalizeSave(o.save), runs = {};
    MODES.forEach(function (m) { runs[m] = o.runs && validRun(o.runs[m], m) ? o.runs[m] : null; });
    return { save: save, runs: runs, info: { version: String(o.version || ''), format: o.format, saveVersion: o.saveVersion || 0, exportedAt: o.exportedAt || '', newerFormat: o.format > EXPORT_FORMAT } };
  }

  var save = { normalizeSave: normalizeSave, mergeSave: mergeSave, recordRun: recordRun, recordLevel: recordLevel, exportRecord: exportRecord, importRecord: importRecord,
    MODES: MODES, TOP_N: TOP_N, TIPS: TIPS, EXPORT_FORMAT: EXPORT_FORMAT, SAVE_VERSION: SAVE_VERSION };
  SS.save = save;
  if (typeof module !== 'undefined' && module.exports) module.exports = save;
})(typeof globalThis !== 'undefined' ? globalThis : this);
