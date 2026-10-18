/* shared/stats.js: local play statistics (part 5 of 10), this device only, nothing is sent anywhere. One session per
   visit (a reload within five minutes continues it); the play time counts while the screen is 'play' and the page is
   visible. Stored under arcade.stats: { v: 1, sessions: [{ id, g, s, e, p }], games: { id: { sessions, playMs,
   last, first } } }, the last 300 sessions. Arcade.stats.summary() reads it; it travels with the backup. */
(function (root) {
  'use strict';
  var K = root.Arcade, P = K._, doc = root.document || null, cfg = P.cfg;
  var session = null, playSince = 0, timer = 0;

  function acc() { if (playSince && session) { var n = P.now(); session.playMs += n - playSince; playSince = n; } }
  function flush() { if (!session) return; acc(); session.end = P.now(); K.shared.set('stats', K.pure.statsFold(K.shared.get('stats', null), session)); K.shared.set('session', session); }
  function start() {
    if (!cfg.game) return;
    var n = P.now(), prev = K.shared.get('session', null);
    session = prev && prev.game === cfg.game && n - prev.end < 300000
      ? { id: prev.id, game: prev.game, start: prev.start, end: n, playMs: prev.playMs || 0 }
      : { id: n.toString(36) + Math.floor(Math.random() * 1e6).toString(36), game: cfg.game, start: n, end: n, playMs: 0 };
    K.shared.set('session', session);
    if (timer) root.clearInterval(timer);
    timer = root.setInterval(flush, 30000);
    if (timer && timer.unref) timer.unref();               // node (the tests): the timer must not keep the process alive
    if (doc) doc.addEventListener('visibilitychange', function () {
      if (doc.visibilityState === 'hidden') { flush(); playSince = 0; }
      else if (P.screen === 'play') playSince = P.now();
    });
    if (root.addEventListener) root.addEventListener('pagehide', flush);
  }
  K.stats = {
    /** summary() -> the stored statistics (see above), with the running session folded in. */
    summary: function () { flush(); return K.shared.get('stats', { v: 1, sessions: [], games: {} }); },
    /** playMs() -> play time on this device over all games. */
    playMs: function () { var s = K.stats.summary(), total = 0; for (var g in s.games) total += s.games[g].playMs; return total; },
    session: function () { return session; }
  };
  K.on('screen', function (name) {
    if (!session) return;
    if (name === 'play') { if (!playSince && (!doc || doc.visibilityState === 'visible')) playSince = P.now(); }
    else if (playSince) { acc(); playSince = 0; }
  });
  K.on('init', start);
})(typeof window !== 'undefined' ? window : globalThis);
