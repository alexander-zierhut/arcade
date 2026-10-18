/* shared/menu.js: the standard menu entries, the data-arcade wiring and Arcade.init (part 10 of 10, loaded last).
   Arcade.menu.items() lists what every game offers (home, install / fullscreen / app hint, share, news, performance
   mode, language, backup) with a label in the current language, so a game can render them in its own menus. Markup
   is simpler: any element with data-arcade="<id>" is wired on init (Arcade.wire(el) for markup rendered later),
   hidden when the entry cannot work on this device, and labelled by the kit when it carries data-arcade-auto.
   Arcade.init({ game, title, version, langs, loading, autoHint, home, share, news }) starts everything. */
(function (root) {
  'use strict';
  var K = root.Arcade, P = K._, doc = root.document || null, cfg = P.cfg;
  var wired = [];

  K.menu = {
    /** items() -> [{ id, label, run, visible }] */
    items: function () {
      var app = K.app, t = K.t;
      return [
        { id: 'home', label: t('home'), run: K.home, visible: function () { return true; } },
        { id: 'install', label: t('install'), run: function () { app.install(); }, visible: app.canInstall },
        { id: 'fullscreen', label: app.isFullscreen() ? t('fullscreen_off') : t('fullscreen'), run: function () { app.setFullscreen(); }, visible: function () { return app.canFullscreen() && !app.canInstall(); } },
        { id: 'app', label: t('app_title'), run: app.hint, visible: function () { return app.platform() !== 'desktop' && !app.isStandalone(); } },
        { id: 'share', label: t('share'), run: function () { K.share.go(); }, visible: function () { return true; } },
        { id: 'news', label: t('news'), run: K.news.open, visible: function () { return K.news.list().length > 0; } },
        { id: 'perf', label: K.perf.label(), run: K.perf.toggle, visible: function () { return true; } },
        { id: 'lang', label: t('lang') + ': ' + K.lang.get().toUpperCase(), run: K.lang.toggle, visible: function () { return cfg.langs.length > 1; } },
        { id: 'backup-export', label: t('backup_export'), run: K.backup.download, visible: function () { return true; } },
        { id: 'backup-import', label: t('backup_import'), run: K.backup.pick, visible: function () { return !!root.FileReader; } }
      ];
    }
  };
  /** refresh(): re-applies visibility, labels and states to every wired element (after a language, perf or install change). */
  K.refresh = function () {
    if (!doc || !doc.body) return;
    var items = K.menu.items(), byId = {}; items.forEach(function (i) { byId[i.id] = i; });
    wired = wired.filter(function (e) { return doc.body.contains(e); });
    wired.forEach(function (e) {
      var it = byId[e.getAttribute('data-arcade')]; if (!it) return;
      e.hidden = !it.visible();                           // an entry that cannot work on this device is not shown
      if (e.hasAttribute('data-arcade-auto')) e.textContent = it.label;
      if (it.id === 'news') e.setAttribute('data-arcade-unseen', K.news.unseen() ? '1' : '0');
      if (it.id === 'perf') e.setAttribute('aria-pressed', K.perf.low() ? 'true' : 'false');
      if (it.id === 'fullscreen') e.setAttribute('aria-pressed', K.app.isFullscreen() ? 'true' : 'false');
    });
  };
  /** wire(from?): binds every [data-arcade] element under `from` (the document by default); safe to call again. */
  K.wire = function (from) {
    if (!doc) return;
    var nodes = (from || doc).querySelectorAll('[data-arcade]');
    for (var i = 0; i < nodes.length; i++) {
      var e = nodes[i];
      if (e.getAttribute('data-arcade-wired') === '1') continue;
      e.setAttribute('data-arcade-wired', '1');
      e.addEventListener('click', (function (el) { return function (ev) {
        var items = K.menu.items(), it = null; for (var j = 0; j < items.length; j++) if (items[j].id === el.getAttribute('data-arcade')) it = items[j];
        if (!it) return; ev.preventDefault(); it.run(); K.refresh();
      }; })(e));
      wired.push(e);
    }
    K.refresh();
  };
  /** run(id): the entry by id, from the game's own code (e.g. a settings row the game renders itself). */
  K.run = function (id) { var items = K.menu.items(); for (var j = 0; j < items.length; j++) if (items[j].id === id) { items[j].run(); K.refresh(); return true; } return false; };

  /** init(options): game (the folder name), title, version, langs (['de','en']), loading (true: show the loading screen
   *  now), autoHint (true: the once-only app hint), home ('../'), share: { image (the og:image), url }, news (else
   *  window.ARCADE_NEWS), quiet (a function: true while the game shows a card of its own, so no kit card opens over it;
   *  may also be set later on Arcade.config()). Call it right after the kit's scripts; the game calls Arcade.ready()
   *  when it can be played. */
  K.init = function (o) {
    if (P.inited) return K;
    P.inited = true; o = o || {};
    cfg.game = o.game || null; cfg.title = o.title || (doc ? doc.title : ''); cfg.version = o.version || '';
    if (o.langs) cfg.langs = o.langs.slice();
    if (o.home) cfg.home = o.home;
    if (o.loading === false) cfg.loading = false;
    if (o.autoHint === false) cfg.autoHint = false;
    if (typeof o.quiet === 'function') cfg.quiet = o.quiet;        // quiet() -> true while the game shows a card of its own (no kit card then)
    var og = doc && doc.querySelector('meta[property="og:image"]');     // the build hashes the file name: the meta tag is the truth
    cfg.share = o.share || {}; if (!cfg.share.image) cfg.share.image = (og && og.getAttribute('content')) || 'assets/icons/og-image.png';
    if (o.news) cfg.news = o.news;
    P.prefix = cfg.game ? K.pure.prefixOf(cfg.game) : P.SHARED + 'none.';
    K.backup.applyPending();                              // a backup chosen on the last load, before the game reads its keys
    if (doc) doc.documentElement.lang = K.lang.get();
    if (doc && cfg.loading && cfg.game) loading();
    if (doc) { if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', function () { K.wire(); }); else K.wire(); }
    if (doc) doc.addEventListener('fullscreenchange', K.refresh);
    P.emit('init', cfg);
    return K;
  };
  function loading() { if (doc.body) K.loading.show(); else doc.addEventListener('DOMContentLoaded', function () { if (cfg.loading) K.loading.show(); }); }
})(typeof window !== 'undefined' ? window : globalThis);
