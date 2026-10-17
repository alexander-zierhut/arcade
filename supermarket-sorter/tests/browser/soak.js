// tests/browser/soak.js: plays many levels of both branches through the real app in headless Chrome (hint moves and bunny
// collects through SS.app, animations through the board view), watching for page errors, DOM growth (leaked item, FX or
// belt nodes), leaked animations, heap growth and slow actions. Usage: node tests/browser/soak.js [levels=12]
'use strict';
var path = require('path');
var chrome = require('./chrome.js');
var ROOT = path.resolve(__dirname, '..', '..');
var LEVELS = parseInt(process.argv[2], 10) || 12;
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
async function waitState(page, s, ms) { try { await page.waitForFunction(function (s) { return window.SS && SS.app && SS.app.ctx.state === s; }, s, { timeout: ms || 8000, polling: 50 }); return true; } catch (e) { return false; } }
async function dismissCoach(page) { for (var i = 0; i < 6; i++) { if (!(await page.evaluate(function () { return SS.ui.coach && SS.ui.coach.isOpen(); }))) break; await page.tap('#coach button'); await sleep(200); } }

async function main() {
  var browser = await chrome.launchChrome(), failures = [];
  try {
    var ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    var page = await ctx.newPage(), errors = [];
    page.on('pageerror', function (e) { errors.push('pageerror: ' + (e && e.message || e)); });
    page.on('console', function (m) { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    var cdp = await ctx.newCDPSession(page);
    await cdp.send('Performance.enable');
    await page.goto('file://' + path.join(ROOT, 'index.html'));
    await waitState(page, 'TITLE');
    var heap0 = 0;
    for (var mi = 0; mi < 2; mi++) {
      var mode = ['relaxed', 'timed'][mi];
      for (var lv = 1; lv <= LEVELS; lv++) {
        await page.evaluate(function (a) { SS.app.ctx.mode = a.mode; SS.app.loadLevel(a.n); }, { mode: mode, n: lv });
        if (!(await waitState(page, 'INTRO', 15000))) { failures.push(mode + ' L' + lv + ': no intro'); break; }
        await page.tap('button[data-act="intro-go"]'); await waitState(page, 'PLAY', 4000); await dismissCoach(page);
        var r = await page.evaluate(function () {
          return new Promise(function (resolve) {
            var g = SS.app.ctx.game, moves = 0, slow = 0, worst = 0, t0 = performance.now();
            SS.game.start(g);
            var iv = setInterval(function () {
              if (g.status !== 'playing' || performance.now() - t0 > 90000) { clearInterval(iv); return resolve({ level: g.level.n, moves: moves, slow: slow, worst: worst, ms: Math.round(performance.now() - t0), status: g.status, items: g.level.items, belts: g.board.belts.length, depth: Math.max.apply(null, g.level.comps.map(function (c) { return c.layers.length; })) }); }
              var b = g.board;
              for (var id in b.items) if (b.items[id].type === '*') { var ce = SS.app.onCollect(+id); if (ce) { SS.ui.board.apply(ce, false); return; } }
              var a = performance.now(), m = SS.solver.hint(b, 20000);
              if (!m) { clearInterval(iv); return resolve({ level: g.level.n, moves: moves, status: 'nohint' }); }
              var ev = SS.app.onDrop(m.item, m.to, SS.board.firstFree(b, m.to));
              if (ev) SS.ui.board.apply(ev, false);
              var d = performance.now() - a; moves += 1; if (d > 8) slow += 1; if (d > worst) worst = d;
            }, 40);
          });
        });
        await sleep(1400);
        var dom = await page.evaluate(function () { return { items: document.querySelectorAll('#items .item').length, fx: document.getElementById('fx').childElementCount, nodes: document.getElementsByTagName('*').length, anims: document.getAnimations().length }; });
        var metrics = (await cdp.send('Performance.getMetrics')).metrics, heap = 0;
        metrics.forEach(function (m) { if (m.name === 'JSHeapUsedSize') heap = m.value; });
        if (!heap0) heap0 = heap;
        console.log(mode + ' L' + r.level + ' (' + r.items + ' items, depth ' + r.depth + ', belts ' + r.belts + '): ' + r.status + ' in ' + r.moves + ' moves, ' + r.ms + ' ms, worst action ' + (r.worst || 0).toFixed(1) + ' ms, slow(>8ms) ' + r.slow + ' | DOM items ' + dom.items + ' fx ' + dom.fx + ' nodes ' + dom.nodes + ' anims ' + dom.anims + ' | heap ' + (heap / 1048576).toFixed(1) + ' MB');
        if (r.status !== 'won') { failures.push(mode + ' L' + r.level + ' ' + r.status); }
        if (dom.fx !== 0 || dom.items > 2) failures.push(mode + ' L' + r.level + ' leaked DOM nodes (items ' + dom.items + ', fx ' + dom.fx + ')');
        if (r.worst > 60) failures.push(mode + ' L' + r.level + ' worst action ' + r.worst.toFixed(1) + ' ms');
      }
    }
    console.log('heap growth: x' + (heap / heap0).toFixed(2));
    if (heap / heap0 > 3) failures.push('heap grew x' + (heap / heap0).toFixed(2));
    errors.forEach(function (e) { failures.push(e); });
  } finally { await browser.close(); }
  console.log(failures.length ? failures.length + ' failure(s):\n  ' + failures.join('\n  ') : 'soak passed');
  if (failures.length) process.exitCode = 1;
}
main().catch(function (e) { console.error(e && e.stack || e); process.exit(1); });
