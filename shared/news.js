/* shared/news.js: the news (part 7 of 10). A game ships news.js, `window.ARCADE_NEWS = [{ version, date, de, en }]`
   (sorted here, newest first); the site build reads the same file for the selector. Arcade.news.open() is the
   changelog: one change per page (a version, its date, its points), paged with older / newer. The kit opens it by
   itself on the title screen when something changed since the player was last here (auto(), called by the screen
   moments in campaigns.js): once per version, never on a first visit. The seen version is stored under the game's
   prefix as seenVersion; the selector's changelog marks it for the game it shows, so the game does not ask again. */
(function (root) {
  'use strict';
  var K = root.Arcade, P = K._, cfg = P.cfg;

  /** returning() -> true when this device has seen the game before (a recorded session, or any key of the game's own). */
  function returning() {
    var st = K.shared.get('stats', null), g = st && st.games && st.games[cfg.game];
    if (g && g.sessions >= 1) return true;
    var keys = P.rawKeys(), seenKey = P.prefix + 'seenVersion';
    for (var k in keys) if (k.indexOf(P.prefix) === 0 && k !== seenKey) return true;
    return false;
  }
  function markFor(game, version) { if (game && version) P.rawSet(K.pure.prefixOf(game) + 'seenVersion', JSON.stringify(version)); }

  var news = {
    list: function () { return K.pure.newsSorted(cfg.news || root.ARCADE_NEWS || []); },
    latest: function () { return news.list()[0] || null; },
    /** text(entry, lang?) -> the entry's HTML in the language (falls back to the other one). */
    text: function (e, l) { if (!e) return ''; l = l || K.lang.get(); return e[l] || e.en || e.de || ''; },
    seen: function () { return K.storage.get('seenVersion', null); },
    unseen: function () { return !!cfg.version && news.seen() !== cfg.version && news.list().length > 0; },
    markSeen: function () { if (cfg.version) K.storage.set('seenVersion', cfg.version); if (K.refresh) K.refresh(); },
    /** recent(days?) -> true when the newest entry is at most `days` (7) days old (the "New" label on a news button). */
    recent: function (days) { var e = news.latest(); return !!e && K.pure.within(e.date, days || 7); },
    /** wanted() -> true when the player was here before and has not seen this version's news yet. */
    wanted: function () {
      if (!cfg.game || !cfg.version || !news.list().length) return false;
      var seen = news.seen();
      if (seen === cfg.version) return false;
      return seen !== null || returning();
    },
    /** auto() -> opened the changelog by itself (the title moment calls it). A first visit only records the version:
     *  nothing changed "since last time". */
    auto: function () {
      if (!cfg.game || !cfg.version) return false;
      if (news.wanted()) { news.open(); return true; }
      if (news.seen() === null) K.storage.set('seenVersion', cfg.version);
      return false;
    },
    /** open({ list, title, game, index }): the changelog sheet. Without options: the game's own news, newest first.
     *  The selector passes a game's list, its title and its id (so the version counts as seen there too). */
    open: function (o) {
      o = o || {};
      var list = o.list ? K.pure.newsSorted(o.list) : news.list(), i = Math.max(0, Math.min(list.length - 1, o.index || 0));
      var box = P.el('div', 'arcade-news', ''), lang = K.lang.get();
      if (!list.length) box.appendChild(P.el('p', '', K.t('news_none')));
      else {
        var head = P.el('div', 'arcade-news-head', ''), text = P.el('div', 'arcade-news-text', ''), nav = P.el('div', 'arcade-news-nav', '');
        var older = navBtn(K.t('news_older'), function () { go(i + 1); }), count = P.el('span', 'arcade-news-count', ''), newer = navBtn(K.t('news_newer'), function () { go(i - 1); });
        box.appendChild(head); box.appendChild(text);
        if (list.length > 1) { nav.appendChild(newer); nav.appendChild(count); nav.appendChild(older); box.appendChild(nav); }
      }
      function navBtn(label, fn) { var b = P.el('button', 'arcade-news-btn', ''); b.type = 'button'; b.textContent = label; b.addEventListener('click', function (ev) { ev.preventDefault(); fn(); }); return b; }
      function go(n) { i = Math.max(0, Math.min(list.length - 1, n)); render(); }
      function render() {
        var e = list[i];
        head.textContent = K.t('news_title', { v: e.version }) + (e.date ? ' · ' + K.pure.dateText(e.date, lang) : '');
        text.innerHTML = news.text(e, lang);
        count.textContent = (i + 1) + ' / ' + list.length;
        older.disabled = i >= list.length - 1; newer.disabled = i <= 0;
        box.setAttribute('data-page', String(i));
      }
      if (list.length) render();
      K.sheet({ title: o.title || K.t('news'), node: box, buttons: [{ label: K.t('ok'), primary: true }] });
      if (o.game) markFor(o.game, list.length ? list[0].version : ''); else news.markSeen();
      return box;
    }
  };
  K.news = news;
})(typeof window !== 'undefined' ? window : globalThis);
