// tests/browser/ui-check-page.js: the page logic of the generated ui-check.html (see ui-check.js).
// Fakes CM.app.ctx (layout, save, a mid-run game), paints the procedural scene and a few glasses on the
// canvas so the overlays are judged over a realistic background, then shows the state in ?show=.
(function () {
  'use strict';
  var q = {};
  location.search.replace(/[?&]([^=&]+)=([^&]*)/g, function (_, k, v) { q[k] = decodeURIComponent(v); });
  var vw = innerWidth, vh = innerHeight, dpr = Math.min(devicePixelRatio || 1, 2);
  var safe = q.coarse === '1' ? { top: 47, bottom: 34 } : { top: 0, bottom: 0 };
  var lay = CM.projection.computeLayout(vw, vh, dpr, safe, { coarse: q.coarse === '1' });
  var save = { v: 1, best: 12340, bestTier: 6, muted: false, music: true, ambience: true, showNumbers: false,
    relaxed: true, wins: 2, discovered: 63 };
  var game = { score: 4210, next: 3, current: 2, runMask: 31, highestTier: 5, wonOnce: false };
  var intents = { aimX: 50, aimDirty: false, launch: null, pause: function () {}, mute: function () {}, restart: function () {} };
  CM.app = { ctx: { state: 'TITLE', lay: lay, save: save, game: game, bestAtRunStart: 3000, newBestShown: false, intents: intents } };
  var log = [];
  function flip(k) { return function (v) { save[k] = v; log.push(k + '=' + v); }; }
  var handlers = {
    onPlay: function () { log.push('play'); }, onContinue: function () { log.push('continue'); },
    onNewGame: function () { log.push('newgame'); }, onResume: function () { log.push('resume'); },
    onRestart: function () { log.push('restart'); }, onQuit: function () { log.push('quit'); },
    onKeepPlaying: function () { log.push('keep'); }, onPause: function () { log.push('pause'); },
    onToggleMute: flip('muted'), onToggleMusic: flip('music'), onToggleAmbience: flip('ambience'),
    onToggleNumbers: flip('showNumbers'), onToggleRelaxed: flip('relaxed')
  };

  // Scene: the procedural background, table and roof, plus a few glasses.
  var cv = document.getElementById('game');
  cv.width = vw * dpr; cv.height = vh * dpr; cv.style.width = vw + 'px'; cv.style.height = vh + 'px';
  var ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);
  var rules = { DANGER_Y: 133, LAUNCH_Y: 144, W: 100, L: 160, FRAME: 5 };
  try { CM.art.paintBackground(ctx, lay, vw, vh, 0); } catch (e) { ctx.fillStyle = '#6CC9F2'; ctx.fillRect(0, 0, vw, vh); }
  try { CM.art.paintTable(ctx, lay, rules); } catch (e) { console.warn(e); }
  try {
    var sprites = CM.art.buildSprites(lay, null);
    [[3, 30, 20], [5, 62, 24], [2, 18, 44], [4, 44, 46], [7, 78, 52], [1, 34, 70], [6, 58, 80], [2, 50, 144]]
      .sort(function (a, b) { return a[2] - b[2]; }).forEach(function (g) {
        var sp = sprites[g[0]], r = [0, 6, 6.7, 8.2, 9.6, 11.3, 13.1, 15.1, 17.3, 20][g[0]];
        var p = CM.projection.project(lay, g[1], g[2]), s = CM.projection.scaleAt(g[2]);
        var k = r * lay.kX * s / sp.rp;
        ctx.drawImage(sp.canvas, p.X - sp.axPx * k, p.Y - sp.ayPx * k, sp.canvas.width * k, sp.canvas.height * k);
      });
  } catch (e) { console.warn(e); }
  try { CM.art.paintRoof(ctx, lay, vw); } catch (e) { console.warn(e); }

  CM.ui.init(handlers);
  CM.ui.input.attach(document.getElementById('input'), function () { return lay; },
    function () { return { zoom: 1, aboutX: 0, aboutY: 0 }; }, intents);
  CM.ui.applyLayout(lay);

  var s = q.show || 'title';
  var run = { v: 1, rulesVersion: 2, game: { score: 4210 }, meta: {} };
  if (s === 'title') CM.ui.showOverlay('title', { save: save, run: null });
  else if (s === 'title-run') CM.ui.showOverlay('title', { save: save, run: run });
  else if (s === 'pause') CM.ui.showOverlay('pause', { score: 4210 });
  else if (s === 'win') { CM.ui.setHudVisible(true); CM.ui.setHud(game, save); CM.ui.showOverlay('win', { score: 14210, best: 14210, newBest: true }); }
  else if (s === 'over') { CM.ui.setHudVisible(true); CM.ui.setHud(game, save); CM.ui.showOverlay('over', { score: 4210 }); }
  else if (s === 'oops') CM.ui.showOverlay('oops');
  else if (s === 'rotate') CM.ui.showOverlay('rotate');
  else if (s === 'settings' || s === 'collection' || s === 'howto') {
    CM.ui.showOverlay('title', { save: save, run: run }); CM.ui.openSheet(s);
  } else if (s === 'armed') {
    CM.ui.showOverlay('pause', { score: 4210 });
    setTimeout(function () { document.querySelector('#ov-pause [data-act="restart"]').click(); }, 300);
  } else if (s === 'play') {
    CM.app.ctx.state = 'PLAY';
    CM.ui.showOverlay(null);
    CM.ui.setHudVisible(true);
    game.score = 2900; CM.ui.setHud(game, save);
    game.score = 4210; CM.ui.setHud(game, save);
    CM.ui.consume([{ type: 'discover', tier: 6 }], game);
    setTimeout(function () { CM.ui.toast('NEW COCKTAIL: Tequila Sunrise!', 6); }, 10);
  }
  window.uiReport = function () {
    var col = document.getElementById('title-col');
    var over = col && !col.closest('[hidden]') ? (col.scrollHeight > col.clientHeight + 1 ? ' TITLE OVERFLOWS ' + col.scrollHeight + '>' + col.clientHeight : '') : '';
    var howto = document.getElementById('title-howto');
    return 'S=' + lay.S + ' farY=' + Math.round(lay.farY) + over + (howto && !col.closest('[hidden]') ? ' howto=' + (howto.hidden ? 'button' : 'card') : '') +
      (log.length ? ' log=' + log.join(',') : '');
  };
  setTimeout(function () { document.body.setAttribute('data-done', '1'); }, 50);
})();
