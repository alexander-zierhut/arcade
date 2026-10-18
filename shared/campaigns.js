/* shared/campaigns.js: the campaign hooks and the screen moments (part 6 of 10). shared/hooks.js lists the campaigns
   (a card every N minutes across all games: "support the arcade", "rate it", a new game); this file decides when one
   is due and shows it. The game tells the kit where it is with Arcade.screen(name); on a screen that is not 'play'
   the kit may show the once-only app hint (title) or a due campaign. Shown / clicked times are stored under
   arcade.campaigns, so the rhythm holds across games. */
(function (root) {
  'use strict';
  var K = root.Arcade, P = K._, cfg = P.cfg;
  var list = [];

  var campaigns = {
    /** define(list): the campaigns, from hooks.js. A campaign: { id, every (minutes, 60), after (minutes of play, 0),
     *  screens (['title','pause','win','lose','end']), from, until (dates), max (times), title, text, button, dismiss
     *  (each a string or { de, en }), url (opens in a new tab), onceClicked (true: never again after a click) }. */
    define: function (l) { list = (l || []).slice(); },
    list: function () { return list.slice(); },
    /** due(screen) -> the first campaign due on this screen, or null. */
    due: function (scr) {
      var states = K.shared.get('campaigns', {}), playMs = K.stats ? K.stats.playMs() : 0, n = P.now();
      for (var i = 0; i < list.length; i++) { var c = list[i]; if (K.pure.campaignDue(c, states[c.id], { now: n, playMs: playMs, screen: scr })) return c; }
      return null;
    },
    /** show(c): the card; records the showing (and a click on its button). */
    show: function (c) {
      var states = K.shared.get('campaigns', {}), st = states[c.id] || { count: 0 }, l = K.lang.get();
      st.shownAt = P.now(); st.count = (st.count || 0) + 1; states[c.id] = st; K.shared.set('campaigns', states);
      var pick = function (v) { return v && typeof v === 'object' ? (v[l] || v.en || v.de || '') : (v || ''); };
      var buttons = [];
      if (c.url) buttons.push({ label: pick(c.button) || 'OK', primary: true, onClick: function () { st.clicked = P.now(); states[c.id] = st; K.shared.set('campaigns', states); try { root.open(c.url, '_blank', 'noopener'); } catch (e) { /* blocked */ } } });
      buttons.push({ label: pick(c.dismiss) || K.t('later') });
      K.sheet({ title: pick(c.title), html: pick(c.text), buttons: buttons });
      P.emit('campaign', c.id);
    }
  };
  K.campaigns = campaigns;

  /** screen(name): the game says where it is: 'title' 'menu' 'play' 'pause' 'win' 'lose' 'end'. Drives the statistics
   *  (play time), the performance sampling and the moments for the app hint and the campaigns. */
  K.screen = function (name) {
    var prev = P.screen; P.screen = name;
    P.emit('screen', name);
    if (name !== prev) moment(name);
  };
  K.current = function () { return P.screen; };
  /** moment(name): a screen where a card may show: the once-only app hint on the title, else a due campaign. */
  function moment(name) {
    if (!name || name === 'play' || K.sheetOpen() || K.loading.visible() || !cfg.game || !P.inited) return;
    if (typeof cfg.quiet === 'function' && cfg.quiet()) return;      // the game has a card of its own open: not now

    if (name === 'title' && K.app.hintWanted()) { K.app.hint(); return; }
    var c = campaigns.due(name); if (c) campaigns.show(c);
  }
  K.on('ready', function () { root.setTimeout(function () { moment(P.screen); }, 150); });
})(typeof window !== 'undefined' ? window : globalThis);
