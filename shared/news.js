/* shared/news.js: the news (part 7 of 10). A game ships news.js, `window.ARCADE_NEWS = [{ version, date, de, en }]`,
   newest first or not (sorted here); the site build reads the same file for the selector's card. Arcade.news opens
   a sheet with every entry; unseen() is true until the player looked at the current version (stored under the
   game's prefix as seenVersion). A game with its own news card reads Arcade.news.latest() and shows that. */
(function (root) {
  'use strict';
  var K = root.Arcade, P = K._, cfg = P.cfg;
  var news = {
    list: function () { return K.pure.newsSorted(cfg.news || root.ARCADE_NEWS || []); },
    latest: function () { return news.list()[0] || null; },
    /** text(entry, lang?) -> the entry's HTML in the language (falls back to the other one). */
    text: function (e, l) { if (!e) return ''; l = l || K.lang.get(); return e[l] || e.en || e.de || ''; },
    seen: function () { return K.storage.get('seenVersion', null); },
    unseen: function () { return !!cfg.version && news.seen() !== cfg.version && news.list().length > 0; },
    markSeen: function () { if (cfg.version) K.storage.set('seenVersion', cfg.version); if (K.refresh) K.refresh(); },
    /** open(): the news sheet, every entry newest first. */
    open: function () {
      var list = news.list(), box = P.el('div', 'arcade-news', '');
      if (!list.length) box.appendChild(P.el('p', '', K.t('news_none')));
      list.forEach(function (e) { var h = P.el('h3', '', ''); h.textContent = K.t('news_title', { v: e.version }) + (e.date ? ' · ' + e.date : ''); box.appendChild(h); box.appendChild(P.el('div', 'arcade-news-text', news.text(e))); });
      K.sheet({ title: K.t('news'), node: box, buttons: [{ label: K.t('ok'), primary: true }], onClose: news.markSeen });
      news.markSeen();
    }
  };
  K.news = news;
})(typeof window !== 'undefined' ? window : globalThis);
