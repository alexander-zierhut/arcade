// tests/browser/layout.js: layout assertions for the phone widths, called from run.js (one browser, one fresh context per viewport).
// Guards these regressions: the one-row HUD (two pills, up to three action buttons, pause) overflowing or pushing the pause
// button off-screen on 320-430 px in relaxed (widest: hint shown) and timed mode, the band growing beyond one row, the combo
// line leaving the band's edge, pause-menu toggles shrinking to different widths when their label wraps, and the coach mark
// painting above the pause card.
'use strict';
var VIEWPORTS = [{ width: 320, height: 640 }, { width: 360, height: 740 }, { width: 390, height: 844 }, { width: 430, height: 932 }];
var LONG = { moves: 123, score: 1234567, bunnies: 12 };            // the widest contents the pills can carry
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function inside(r, vw) { return r.left >= -0.5 && r.right <= vw + 0.5; }
function fmt(r) { return Math.round(r.left * 10) / 10 + '..' + Math.round(r.right * 10) / 10; }

/** hudRow(page): every visible child of the HUD row with its rect, plus the band, the combo line and the board top. */
function hudRow(page) {
  return page.evaluate(function () {
    var row = document.querySelector('.hud-row'), vis = [];
    Array.prototype.forEach.call(row.children, function (el) { var r = el.getBoundingClientRect(); if (r.width > 0) vis.push({ name: el.id || el.className, left: r.left, right: r.right, top: r.top, bottom: r.bottom, height: r.height, pill: el.classList.contains('pill'), act: el.classList.contains('act') }); });
    var p = document.getElementById('btn-pause').getBoundingClientRect(), hud = document.getElementById('hud').getBoundingClientRect();
    var combo = document.getElementById('hud-combo').getBoundingClientRect(), board = document.getElementById('board').getBoundingClientRect();
    var fill = getComputedStyle(document.getElementById('hud-combo-fill')).transform;
    return { vw: innerWidth, items: vis, pause: { left: p.left, right: p.right, height: p.height }, scrollW: row.scrollWidth, clientW: row.clientWidth,
      hud: { top: hud.top, bottom: hud.bottom, height: hud.height }, combo: { left: combo.left, right: combo.right, top: combo.top, bottom: combo.bottom, hidden: document.getElementById('hud-combo').hidden, fill: fill }, boardTop: board.top,
      levelClass: document.getElementById('hud-level').className, xBadge: document.getElementById('hud-combo-x').className };
  });
}
/** checkRow(h, tag, hud, want): the shared assertions for one HUD state. want = { pills, acts, mode }. */
function checkRow(h, tag, hud, want) {
  var offs = hud.items.filter(function (e) { return e.left < -0.5 || e.right > hud.vw + 0.5; }).map(function (e) { return e.name + ' ' + fmt(e); });
  var pills = hud.items.filter(function (e) { return e.pill; }), acts = hud.items.filter(function (e) { return e.act; });
  if (pills.length !== want.pills) h.fail(tag + want.mode + ': expected ' + want.pills + ' visible pills, got ' + pills.length);
  if (acts.map(function (a) { return a.name; }).join(',') !== want.acts) h.fail(tag + want.mode + ': expected action buttons ' + want.acts + ', got ' + acts.map(function (a) { return a.name; }).join(','));
  if (!offs.length && inside(hud.pause, hud.vw)) ok2(h, tag + want.mode + ': HUD row (' + hud.items.length + ' elements) and pause button inside the viewport'); else h.fail(tag + want.mode + ': HUD outside [0,' + hud.vw + ']: ' + offs.join(', ') + '; pause ' + fmt(hud.pause));
  if (hud.scrollW <= hud.clientW) ok2(h, tag + want.mode + ': HUD row does not overflow'); else h.fail(tag + want.mode + ': HUD row overflows: scrollWidth ' + hud.scrollW + ' > clientWidth ' + hud.clientW);
  var pillH = pills.length ? pills[0].height : 0, same = pills.concat(acts).every(function (e) { return Math.abs(e.height - pillH) < 0.5; });
  if (pills.length && Math.abs(hud.pause.height - pillH) < 0.5 && same) ok2(h, tag + want.mode + ': pause, pills and action buttons share one height (' + pillH + ' px)'); else h.fail(tag + want.mode + ': heights differ: pause ' + hud.pause.height + ', ' + pills.concat(acts).map(function (e) { return e.name + ' ' + e.height; }).join(', '));
  // one row: the band is the row plus 6 px padding on each side (no safe area in the test browser); the board starts below it
  if (hud.hud.height <= pillH + 12.5 && hud.boardTop >= hud.hud.bottom + 4) ok2(h, tag + want.mode + ': the band is one row (' + hud.hud.height + ' px) and the board starts under it'); else h.fail(tag + want.mode + ': band ' + hud.hud.height + ' px, bottom ' + hud.hud.bottom + ', board top ' + hud.boardTop);
}

// run(browser, pageUrl, h): h = { ok, fail, waitState } from run.js, so the reporting and the exit code stay in one place.
async function run(browser, pageUrl, h) {
  for (var i = 0; i < VIEWPORTS.length; i++) {
    var vp = VIEWPORTS[i], tag = vp.width + 'x' + vp.height + ': ';
    var ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    try {
      var page = await ctx.newPage();
      await page.goto(pageUrl); await h.waitState(page, 'TITLE', 8000); await sleep(300);
      var title = await page.evaluate(function () {
        return ['play-relaxed', 'play-timed'].map(function (a) { var r = document.querySelector('[data-act="' + a + '"]').getBoundingClientRect(); return { a: a, left: r.left, right: r.right, top: r.top, bottom: r.bottom, vw: innerWidth, vh: innerHeight }; });
      });
      var badTitle = title.filter(function (t) { return t.left < -0.5 || t.right > t.vw + 0.5 || t.top < 0 || t.bottom > t.vh; });
      if (!badTitle.length) ok2(h, tag + 'title buttons inside the viewport'); else h.fail(tag + 'title buttons outside the viewport: ' + JSON.stringify(badTitle));

      // relaxed level 214 (par 247, the widest moves line) with the widest numbers forced in: the row holds the hint button too
      await page.evaluate(function () { SS.app.ctx.mode = 'relaxed'; SS.app.loadLevel(214); });
      await h.waitState(page, 'INTRO', 15000);
      await page.tap('button[data-act="intro-go"]');
      await h.waitState(page, 'PLAY', 4000);
      await sleep(400);
      await page.evaluate(function (L) { var g = SS.app.ctx.game; g.moves = L.moves; g.board.bunnies = L.bunnies; g.comboMovesLeft = 2; g.combo = 2; SS.app.refreshHud(); }, LONG);
      await sleep(700);                                                   // past the bunny button's 0.4 s pop (it overshoots)
      var relaxed = await hudRow(page);
      checkRow(h, tag, relaxed, { pills: 2, acts: 'btn-undo,btn-hint,btn-bunny', mode: 'relaxed' });
      if (!relaxed.combo.hidden && relaxed.combo.top >= relaxed.hud.bottom - 0.5 && relaxed.combo.bottom <= relaxed.hud.bottom + 4.5 && relaxed.combo.left <= 0.5 && relaxed.combo.right >= relaxed.vw - 0.5 && /0\.6[0-9]*, 0, 0, 1/.test(relaxed.combo.fill)) ok2(h, tag + 'relaxed: the combo line sits on the band\'s bottom edge, full width, two thirds full'); else h.fail(tag + 'relaxed combo line: ' + JSON.stringify(relaxed.combo) + ' band bottom ' + relaxed.hud.bottom);
      if (/\bon\b/.test(relaxed.xBadge)) ok2(h, tag + 'relaxed: the x2 badge shows'); else h.fail(tag + 'x badge class: ' + relaxed.xBadge);

      // timed level 40 ("Sehr schwer", so the level pill is red) with a long Serie score; the coach mark is left open on purpose
      // (it must not cover the pause card later)
      await page.evaluate(function () { SS.app.ctx.mode = 'timed'; SS.app.loadLevel(40); });
      await h.waitState(page, 'INTRO', 8000);
      await page.tap('button[data-act="intro-go"]');
      await h.waitState(page, 'PLAY', 4000);
      await sleep(600);
      await page.evaluate(function (L) { var g = SS.app.ctx.game; g.levelScore = L.score; g.board.bunnies = L.bunnies; SS.app.refreshHud(); }, LONG);
      await sleep(700);
      var hud = await hudRow(page);
      checkRow(h, tag, hud, { pills: 2, acts: 'btn-undo,btn-bunny', mode: 'timed' });
      if (/\bvhard\b/.test(hud.levelClass)) ok2(h, tag + 'timed L40: the level pill carries the difficulty as its colour class'); else h.fail(tag + 'level pill class: ' + hud.levelClass);
      if (hud.combo.hidden) ok2(h, tag + 'timed: no combo line before the first match'); else h.fail(tag + 'combo line visible without a combo: ' + JSON.stringify(hud.combo));

      // evaluate-click: a coach mark that is still open would swallow a real tap
      await page.evaluate(function () { document.getElementById('btn-pause').click(); });
      await h.waitState(page, 'PAUSE', 3000); await sleep(500);
      var pz = await page.evaluate(function () {
        var o = document.getElementById('ov-pause'), c = o.querySelector('.card').getBoundingClientRect(), vw = innerWidth;
        var toggles = Array.prototype.map.call(o.querySelectorAll('.toggle'), function (t) { var r = t.getBoundingClientRect(); return { w: r.width, h: r.height }; });
        var rows = Array.prototype.map.call(o.querySelectorAll('.setting-row'), function (t) { var r = t.getBoundingClientRect(); return { left: r.left, right: r.right }; });
        var top = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2);
        return { vw: vw, card: { left: c.left, right: c.right }, toggles: toggles, rows: rows, coachOpen: !!(SS.ui.coach && SS.ui.coach.isOpen()), inOverlay: !!(top && o.contains(top)), top: top ? (top.id || top.className || top.tagName) : 'nothing' };
      });
      if (pz.toggles.length && pz.toggles.every(function (t) { return Math.abs(t.w - pz.toggles[0].w) < 0.5 && Math.abs(t.h - pz.toggles[0].h) < 0.5; })) ok2(h, tag + pz.toggles.length + ' pause toggles share one size (' + pz.toggles[0].w + 'x' + pz.toggles[0].h + ')'); else h.fail(tag + 'pause toggle sizes differ or are missing: ' + JSON.stringify(pz.toggles));
      var badRows = pz.rows.filter(function (r) { return r.left < pz.card.left - 0.5 || r.right > pz.card.right + 0.5; });
      if (pz.rows.length && !badRows.length) ok2(h, tag + 'setting rows inside the pause card'); else h.fail(tag + 'setting rows outside the card ' + fmt(pz.card) + ': ' + JSON.stringify(badRows) + ' (rows ' + pz.rows.length + ')');
      if (inside(pz.card, pz.vw)) ok2(h, tag + 'pause card inside the viewport'); else h.fail(tag + 'pause card ' + fmt(pz.card) + ' outside [0,' + pz.vw + ']');
      if (pz.inOverlay) ok2(h, tag + 'pause card is on top (coach ' + (pz.coachOpen ? 'open' : 'closed') + ')'); else h.fail(tag + 'something covers the pause card centre: ' + pz.top + ' (coach ' + (pz.coachOpen ? 'open' : 'closed') + ')');
    } finally { await ctx.close(); }
  }
}
function ok2(h, msg) { h.ok(msg); }
module.exports = { run: run };
