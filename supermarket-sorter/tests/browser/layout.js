// tests/browser/layout.js: layout assertions for the phone widths, called from run.js (one browser, one fresh context per viewport).
// Guards three regressions: pills with fixed min-widths pushing the pause button off-screen on 320-390 px, pause-menu toggles
// shrinking to different widths when their label wraps, and the coach mark painting above the pause card.
'use strict';
var VIEWPORTS = [{ width: 320, height: 640 }, { width: 360, height: 740 }, { width: 390, height: 844 }, { width: 430, height: 932 }];
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function inside(r, vw) { return r.left >= -0.5 && r.right <= vw + 0.5; }
function fmt(r) { return Math.round(r.left * 10) / 10 + '..' + Math.round(r.right * 10) / 10; }

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

      // timed level 40 shows all four pills; the coach mark is left open on purpose (it must not cover the pause card later)
      await page.evaluate(function () { SS.app.ctx.mode = 'timed'; SS.app.loadLevel(40); });
      await h.waitState(page, 'INTRO', 8000);
      await page.tap('button[data-act="intro-go"]');
      await h.waitState(page, 'PLAY', 4000);
      await sleep(600);

      var hud = await page.evaluate(function () {
        var row = document.querySelector('.hud-row'), vis = [];
        Array.prototype.forEach.call(row.children, function (el) { var r = el.getBoundingClientRect(); if (r.width > 0) vis.push({ name: el.id || el.className, left: r.left, right: r.right, height: r.height, pill: el.classList.contains('pill') }); });
        var p = document.getElementById('btn-pause').getBoundingClientRect();
        return { vw: innerWidth, items: vis, pause: { left: p.left, right: p.right, height: p.height }, scrollW: row.scrollWidth, clientW: row.clientWidth };
      });
      var offs = hud.items.filter(function (e) { return e.left < -0.5 || e.right > hud.vw + 0.5; }).map(function (e) { return e.name + ' ' + fmt(e); });
      var pills = hud.items.filter(function (e) { return e.pill; });
      if (pills.length !== 4) h.fail(tag + 'expected 4 visible pills in timed level 40, got ' + pills.length);
      if (!offs.length && inside(hud.pause, hud.vw)) ok2(h, tag + 'HUD row and pause button inside the viewport'); else h.fail(tag + 'HUD outside [0,' + hud.vw + ']: ' + offs.join(', ') + '; pause ' + fmt(hud.pause));
      if (hud.scrollW <= hud.clientW) ok2(h, tag + 'HUD row does not overflow'); else h.fail(tag + 'HUD row overflows: scrollWidth ' + hud.scrollW + ' > clientWidth ' + hud.clientW);
      var pillH = pills.length ? pills[0].height : 0;
      if (pills.length && Math.abs(hud.pause.height - pillH) < 0.5 && pills.every(function (p) { return Math.abs(p.height - pillH) < 0.5; })) ok2(h, tag + 'pause button as tall as the pills (' + pillH + ' px)'); else h.fail(tag + 'pause height ' + hud.pause.height + ' vs pill heights ' + pills.map(function (p) { return p.height; }).join('/'));

      var bar = await page.evaluate(function () {
        return ['btn-undo', 'btn-bunny', 'btn-hint'].map(function (id) { var r = document.getElementById(id).getBoundingClientRect(); return { id: id, left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, vw: innerWidth, vh: innerHeight }; });
      });
      // #btn-hint is hidden outside relaxed mode (zero rect), so only undo and bunny must be present here
      var badBar = bar.filter(function (b) { return (b.w <= 0 && b.id !== 'btn-hint') || b.left < -0.5 || b.right > b.vw + 0.5 || b.top < 0 || b.bottom > b.vh + 0.5; });
      if (!badBar.length) ok2(h, tag + 'bottom bar buttons inside the viewport'); else h.fail(tag + 'bottom bar outside the viewport: ' + JSON.stringify(badBar));

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
