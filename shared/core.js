/* shared/core.js: the arcade kit, part 1 of 10 (load order: core, ui, app, perf, stats, campaigns, news, share, backup,
   menu; then hooks.js and the game's news.js; then Arcade.init). The kit is what every game has in common, so no game
   builds it again: loading screen, language, "play as an app", the way home, performance mode, campaign hooks, local
   play statistics, news, share and the backup of every game's progress. It never draws into a game's canvas and never
   touches a game's own storage keys. docs/GAME-SPEC.md says what a game does; shared/README.md is the API.

   This file: the shared internals (Arcade._), the pure helpers (Arcade.pure, run in node by tests/kit.test.mjs), the
   kit's own strings and Arcade.t, the storage wrappers (Arcade.storage for the game's keys, Arcade.shared for the kit's
   arcade.* keys), the language preference (Arcade.lang) and the events (Arcade.on / off). Plain ES5. */
(function (root) {
  'use strict';
  var K = root.Arcade = root.Arcade || {};
  var doc = root.document || null, nav = root.navigator || null;
  var KIT_VERSION = '1.1.0';
  var SHARED = 'arcade.';                        // the kit's own keys (language, perf, stats, campaigns) on the origin
  var cfg = { game: null, title: '', version: '', langs: ['de', 'en'], share: {}, home: '../', loading: true, autoHint: true, news: null };
  var listeners = {}, mem = {}, broken = false;
  var P = K._ = { cfg: cfg, SHARED: SHARED, KIT_VERSION: KIT_VERSION, prefix: SHARED + 'none.', screen: null, inited: false };

  // ---------------------------------------------------------------- events
  function on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); return function () { off(ev, fn); }; }
  function off(ev, fn) { var l = listeners[ev] || []; var i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); }
  function emit(ev, data) { var l = (listeners[ev] || []).slice(); for (var i = 0; i < l.length; i++) { try { l[i](data); } catch (e) { warn(ev + ' listener', e); } } }
  function warn(what, e) { if (root.console && root.console.warn) root.console.warn('[arcade] ' + what, e || ''); }
  function now() { return Date.now(); }
  P.emit = emit; P.warn = warn; P.now = now;
  K.on = on; K.off = off;

  // ---------------------------------------------------------------- pure helpers (node-tested)
  var pure = {};
  /** prefixOf(folder) -> the game's storage prefix: the folder name in camelCase plus a dot (README "Storage"). */
  pure.prefixOf = function (folder) { return String(folder).replace(/-([a-z0-9])/g, function (_, c) { return c.toUpperCase(); }) + '.'; };
  /** pickLang(stored, navigatorLanguage, supported) -> the language to start in. */
  pure.pickLang = function (stored, navLang, supported) {
    supported = supported && supported.length ? supported : ['en'];
    if (stored && supported.indexOf(stored) >= 0) return stored;
    var n = String(navLang || '').slice(0, 2).toLowerCase();
    return supported.indexOf(n) >= 0 ? n : supported[0];
  };
  pure.compareVersions = function (a, b) {
    var x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
    for (var i = 0; i < 3; i++) { var d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0 ? 1 : -1; }
    return 0;
  };
  /** newsSorted(list) -> a copy, newest version first; an entry has version, date and a text per language. */
  pure.newsSorted = function (list) {
    return (list || []).filter(function (e) { return e && typeof e.version === 'string'; }).slice().sort(function (a, b) { return pure.compareVersions(b.version, a.version); });
  };
  /** newsPlain(html) -> a news entry as plain text. */
  pure.newsPlain = function (html) { return String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); };
  /** within(isoDate, days, now) -> true while the date is at most `days` days old ("new" labels: a game released
   *  within two weeks, a change within one week). An unparsable date is never new. */
  pure.within = function (iso, days, now) {
    var t = Date.parse(String(iso || '')); if (isNaN(t)) return false;
    var n = now === undefined ? Date.now() : now;
    return n >= t && n < t + days * 86400000;
  };
  /** dateText(isoDate, lang) -> the date for the player ("19 Oct 2026" / "19. Okt. 2026"), the ISO text when the browser cannot. */
  pure.dateText = function (iso, lang) {
    var t = Date.parse(String(iso || '')); if (isNaN(t)) return String(iso || '');
    try { return new Date(t).toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); } catch (e) { return String(iso); }
  };
  /** durationText(ms, lang) -> "1 h 20 min" / "12 min" / "under a minute" (the profile's play time). */
  pure.durationText = function (ms, lang) {
    var m = Math.round((ms || 0) / 60000), de = lang === 'de';
    if (m < 1) return de ? 'unter einer Minute' : 'under a minute';
    if (m < 60) return m + ' min';
    return Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : '');
  };
  /** backupEncode(entries, meta) -> JSON text of every key/value on the origin. */
  pure.backupEncode = function (entries, meta) {
    var keys = Object.keys(entries).sort(), out = { kind: 'arcade-backup', format: 1, date: (meta && meta.date) || new Date().toISOString().slice(0, 19), origin: (meta && meta.origin) || '', kit: KIT_VERSION, keys: {} };
    keys.forEach(function (k) { out.keys[k] = String(entries[k]); });
    return JSON.stringify(out, null, 1);
  };
  /** backupDecode(text) -> { keys, date, format } or throws when the text is not an arcade backup. */
  pure.backupDecode = function (text) {
    var o; try { o = JSON.parse(text); } catch (e) { throw new Error('not json'); }
    if (!o || o.kind !== 'arcade-backup' || typeof o.format !== 'number' || !o.keys || typeof o.keys !== 'object') throw new Error('not an arcade backup');
    var keys = {};
    Object.keys(o.keys).forEach(function (k) { if (typeof o.keys[k] === 'string') keys[k] = o.keys[k]; });
    return { keys: keys, date: typeof o.date === 'string' ? o.date : '', format: o.format };
  };
  /** backupGames(keys, games) -> [{ id, title, count }] for the games ({ id, title }) that have keys in the backup, plus 'arcade' for the kit's own. */
  pure.backupGames = function (keys, games) {
    var out = [];
    (games || []).forEach(function (g) {
      var p = g.prefix || pure.prefixOf(g.id), n = 0;
      Object.keys(keys).forEach(function (k) { if (k.indexOf(p) === 0) n++; });
      if (n) out.push({ id: g.id, title: g.title || g.id, count: n });
    });
    var kit = 0; Object.keys(keys).forEach(function (k) { if (k.indexOf(SHARED) === 0) kit++; });
    if (kit) out.push({ id: 'arcade', title: 'Arcade', count: kit });
    return out;
  };
  /** campaignDue(c, state, ctx) -> true when campaign c should show now. state = { shownAt, clicked, count } (stored per
   *  id); ctx = { now, playMs (play time on this device, all games), screen }. c.every / c.after are minutes. */
  pure.campaignDue = function (c, state, ctx) {
    if (!c || !c.id || !c.text) return false;
    var screens = c.screens || ['title', 'pause', 'win', 'lose', 'end'];
    if (screens.indexOf(ctx.screen) < 0) return false;
    var t = ctx.now;
    if (c.from && t < Date.parse(c.from)) return false;
    if (c.until && t > Date.parse(c.until)) return false;
    if (c.after && ctx.playMs < c.after * 60000) return false;
    if (c.max && ((state && state.count) || 0) >= c.max) return false;
    if (state && state.clicked && c.onceClicked !== false) return false;
    var every = (c.every || 60) * 60000;
    if (state && state.shownAt && t - state.shownAt < every) return false;
    return true;
  };
  /** perfVerdict(frameIntervalsMs) -> 'low' when the device cannot keep up, 'ok' when it can, null when too few samples. */
  pure.perfVerdict = function (iv) {
    if (!iv || iv.length < 120) return null;
    var s = iv.slice().sort(function (a, b) { return a - b; }), p50 = s[Math.floor(s.length * 0.5)], p90 = s[Math.floor(s.length * 0.9)];
    if (p90 > 40 && p50 > 22) return 'low';      // a tenth of the frames under 25 fps and not even 45 fps typical
    if (p90 < 26) return 'ok';
    return null;
  };
  /** statsFold(stats, session) -> stats with the session recorded (sessions capped at 300, per-game totals rebuilt). */
  pure.statsFold = function (stats, s) {
    var st = stats && stats.v === 1 ? stats : { v: 1, sessions: [], games: {} };
    st.sessions = st.sessions || []; st.games = st.games || {};
    var idx = -1;
    for (var i = st.sessions.length - 1; i >= 0; i--) if (st.sessions[i].id === s.id) { idx = i; break; }
    var rec = { id: s.id, g: s.game, s: s.start, e: s.end, p: Math.max(0, Math.round(s.playMs)) };
    if (idx >= 0) st.sessions[idx] = rec; else st.sessions.push(rec);
    if (st.sessions.length > 300) st.sessions = st.sessions.slice(-300);
    var g = {}; st.sessions.forEach(function (r) { var e = g[r.g] = g[r.g] || { sessions: 0, playMs: 0, last: 0, first: 0 }; e.sessions++; e.playMs += r.p; e.last = Math.max(e.last, r.e); e.first = e.first ? Math.min(e.first, r.s) : r.s; });
    st.games = g;
    return st;
  };
  /** shareText({ title, line, url }) -> "Level 12 cleared, 4,520 points · Supermarket Sorter\nhttps://…". */
  pure.shareText = function (o) { var head = [o.line || '', o.title || ''].filter(Boolean).join(' · '); return [head, o.url || ''].filter(Boolean).join('\n'); };
  K.pure = pure;

  // ---------------------------------------------------------------- the kit's own strings (de + en)
  var STR = {
    de: { loading: 'Lädt …', later: 'Später', ok: 'Alles klar', close: 'Schließen', home: 'Alle Spiele', install: 'Als App installieren', fullscreen: 'Vollbild', fullscreen_off: 'Vollbild beenden',
      app_title: 'Als App spielen', app_install: '<p>Ohne Adressleiste ist das Spiel deutlich größer.</p><p>Installiere es: Es startet dann wie eine App vom Startbildschirm.</p>',
      app_ios: '<p>Ohne Adressleiste ist das Spiel deutlich größer.</p><p>In Safari unten auf <b>Teilen</b> tippen, dann <b>„Zum Home-Bildschirm“</b>. Das Spiel startet dann wie eine App.</p>',
      app_android: '<p>Ohne Adressleiste ist das Spiel deutlich größer.</p><p>Oben rechts auf <b>⋮</b> tippen, dann <b>„Zum Startbildschirm hinzufügen“</b>. Oder einfach unten auf <b>Vollbild</b>.</p>',
      app_keep: '<p>Dein Spielstand bleibt dabei erhalten, solange du dieselbe Adresse benutzt.</p>',
      share: 'Teilen', share_copied: 'Text kopiert: einfach einfügen', share_failed: 'Teilen ging nicht', news: 'Neuigkeiten', news_title: 'Neu in Version {v}', news_none: 'Noch keine Neuigkeiten.',
      news_older: '‹ Älter', news_newer: 'Neuer ›', news_new: 'Neu',
      profile_title: 'Dein Fortschritt', profile_text: '<p>Jedes Spiel speichert auf diesem Gerät, in diesem Browser. Für ein neues Handy: hier eine Sicherung herunterladen und dort laden. Eine geladene Sicherung ersetzt die Spielstände der Spiele, die sie enthält.</p>',
      profile_played: '{time} gespielt', profile_saved: 'Spielstand auf diesem Gerät', profile_none: 'noch nicht gespielt',
      perf: 'Sparmodus', perf_auto: 'Sparmodus: automatisch', perf_auto_on: 'Sparmodus: automatisch (an)', perf_on: 'Sparmodus: an', perf_off: 'Sparmodus: aus',
      perf_switched: 'Sparmodus an: Dein Gerät kam nicht hinterher. In den Einstellungen änderbar.',
      lang: 'Sprache', backup_export: 'Alle Spielstände sichern', backup_import: 'Spielstände laden', backup_done: 'Spielstände gesichert ({file})', backup_copied: 'Spielstände in die Zwischenablage kopiert',
      backup_bad: 'Das ist keine Arcade-Sicherung', backup_imported: 'Spielstände geladen ({n} Einträge). Seite wird neu geladen.', backup_confirm: 'Ersetzt die Spielstände auf diesem Gerät für: {games}. Fortfahren?' },
    en: { loading: 'Loading …', later: 'Later', ok: 'Got it', close: 'Close', home: 'All games', install: 'Install as an app', fullscreen: 'Fullscreen', fullscreen_off: 'Leave fullscreen',
      app_title: 'Play as an app', app_install: '<p>Without the address bar the game is much bigger.</p><p>Install it: it then starts like an app from your home screen.</p>',
      app_ios: '<p>Without the address bar the game is much bigger.</p><p>In Safari tap <b>Share</b>, then <b>"Add to Home Screen"</b>. The game then starts like an app.</p>',
      app_android: '<p>Without the address bar the game is much bigger.</p><p>Tap <b>⋮</b> at the top right, then <b>"Add to Home screen"</b>. Or simply tap <b>Fullscreen</b> below.</p>',
      app_keep: '<p>Your progress is kept as long as you use the same address.</p>',
      share: 'Share', share_copied: 'Text copied: just paste it', share_failed: 'Sharing did not work', news: 'What\'s new', news_title: 'New in version {v}', news_none: 'No news yet.',
      news_older: '‹ Older', news_newer: 'Newer ›', news_new: 'New',
      profile_title: 'Your progress', profile_text: '<p>Every game saves on this device, in this browser. For a new phone: download a backup here and load it there. A loaded backup replaces the progress of the games it contains.</p>',
      profile_played: '{time} played', profile_saved: 'progress on this device', profile_none: 'not played yet',
      perf: 'Performance mode', perf_auto: 'Performance mode: automatic', perf_auto_on: 'Performance mode: automatic (on)', perf_on: 'Performance mode: on', perf_off: 'Performance mode: off',
      perf_switched: 'Performance mode on: your device could not keep up. Change it in the settings.',
      lang: 'Language', backup_export: 'Back up all games', backup_import: 'Load a backup', backup_done: 'Backup saved ({file})', backup_copied: 'Backup copied to the clipboard',
      backup_bad: 'That is not an arcade backup', backup_imported: 'Backup loaded ({n} entries). Reloading.', backup_confirm: 'Replaces the progress on this device for: {games}. Continue?' }
  };
  /** t(key, vars): the kit's own strings in the current language ({name} placeholders). */
  function t(key, vars) {
    var table = STR[lang.get()] || STR.en, s = table[key]; if (s === undefined) s = STR.en[key]; if (s === undefined) return key;
    if (vars) for (var k in vars) s = s.split('{' + k + '}').join(String(vars[k]));
    return s;
  }
  K.t = t;
  K.STRINGS = STR;

  // ---------------------------------------------------------------- raw storage: localStorage with a memory fallback
  function ls() { if (broken) return null; try { return root.localStorage || null; } catch (e) { broken = true; return null; } }
  function rawGet(key) { var s = ls(); if (s) { try { var v = s.getItem(key); if (v !== null) return v; } catch (e) { broken = true; } } return Object.prototype.hasOwnProperty.call(mem, key) ? mem[key] : null; }
  function rawSet(key, value) { mem[key] = value; var s = ls(); if (!s) return false; try { s.setItem(key, value); return true; } catch (e) { return false; } }
  function rawRemove(key) { delete mem[key]; var s = ls(); if (!s) return; try { s.removeItem(key); } catch (e) { /* nothing */ } }
  function rawKeys() { var s = ls(), out = {}; if (s) { try { for (var i = 0; i < s.length; i++) { var k = s.key(i); out[k] = s.getItem(k); } } catch (e) { /* partial */ } } for (var m in mem) if (!(m in out)) out[m] = mem[m]; return out; }
  function jsonGet(key, fallback) { var raw = rawGet(key); if (raw === null) return fallback; try { return JSON.parse(raw); } catch (e) { return fallback; } }
  function jsonSet(key, value) { return rawSet(key, JSON.stringify(value)); }
  P.rawGet = rawGet; P.rawSet = rawSet; P.rawRemove = rawRemove; P.rawKeys = rawKeys;
  /** Arcade.storage: the game's own keys (prefix = folder name in camelCase + '.'), JSON values, never throws. */
  K.storage = {
    key: function (name) { return P.prefix + name; },
    get: function (name, fallback) { return jsonGet(P.prefix + name, fallback); },
    set: function (name, value) { return jsonSet(P.prefix + name, value); },
    remove: function (name) { rawRemove(P.prefix + name); },
    persistent: function () { return !!ls(); }
  };
  /** Arcade.shared: the kit's own keys (arcade.*), the same for every game on the origin. */
  K.shared = {
    get: function (name, fallback) { return jsonGet(SHARED + name, fallback); },
    set: function (name, value) { return jsonSet(SHARED + name, value); },
    remove: function (name) { rawRemove(SHARED + name); }
  };

  // ---------------------------------------------------------------- language (arcade-wide: chosen once, every game follows)
  var lang = {
    get: function () { return pure.pickLang(rawGet(SHARED + 'lang'), nav && (nav.language || nav.userLanguage), cfg.langs); },
    stored: function () { return rawGet(SHARED + 'lang'); },
    set: function (code) {
      if (cfg.langs.indexOf(code) < 0) return lang.get();
      var prev = lang.get(); rawSet(SHARED + 'lang', code);
      if (doc) doc.documentElement.lang = code;
      if (code !== prev) { emit('lang', code); if (K.refresh) K.refresh(); }
      return code;
    },
    list: function () { return cfg.langs.slice(); },
    toggle: function () { var l = cfg.langs, i = l.indexOf(lang.get()); return lang.set(l[(i + 1) % l.length]); }
  };
  K.lang = lang;
  K.config = function () { return cfg; };
  K.KIT_VERSION = KIT_VERSION;
  if (typeof module !== 'undefined' && module.exports) module.exports = K;
})(typeof window !== 'undefined' ? window : globalThis);
