// tests/browser/run.js: the real game in the system Chrome (npm run test:browser). Boots the page, checks every
// sprite loaded and nothing errored, steers through real pointer and keyboard input, plays level 1 to the end
// with the greedy bot driving the mouse, buys an upgrade and reloads to see it saved, pauses and resumes, and
// asserts the layout at three phone sizes, a tablet and a desktop size (HUD, cards and buttons inside the viewport).
// Writes the OG image source to tests/browser/artifacts/game-play.png (and to docs/preview/ when it is missing or
// UPDATE_PREVIEW=1 is set) and screenshots of failures to tests/browser/artifacts/.
'use strict';
var path = require('path');
var fs = require('fs');
var assert = require('assert');
var launchChrome = require('./chrome.js').launchChrome;
var serve = require('./serve.js').serve;

var root = path.resolve(__dirname, '..', '..');
var artifacts = path.join(__dirname, 'artifacts');
var SIZES = [[360, 640], [390, 844], [430, 932], [768, 1024], [1280, 800]];

var failures = 0, checks = 0;
function ok(cond, msg) { checks++; if (!cond) { failures++; console.log('  FAIL ' + msg); } else console.log('  ok   ' + msg); }

async function newPage(browser, w, h) {
  var ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: w < 800, hasTouch: w < 800 });
  var page = await ctx.newPage();
  var problems = [];
  page.on('pageerror', function (e) { problems.push('pageerror: ' + (e && e.message || e)); });
  page.on('console', function (m) { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  page.on('requestfailed', function (r) { problems.push('failed: ' + r.url()); });
  page.on('response', function (r) { if (r.status() >= 400) problems.push(r.status() + ' ' + r.url()); });
  return { ctx: ctx, page: page, problems: problems };
}

async function boot(page, url) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(function () { return window.PM && PM.app && PM.app.state === 'TITLE' && PM.app.assets; }, null, { timeout: 15000 });
}

/** inside(page, selector): every matching visible element lies within the viewport. */
async function inside(page, selector, vw, vh) {
  var boxes = await page.$$eval(selector, function (els) {
    return els.filter(function (e) { return e.offsetParent !== null; }).map(function (e) { var r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, s: e.id || e.className }; });
  });
  var bad = boxes.filter(function (b) { return b.l < -1 || b.t < -1 || b.r > vw + 1 || b.b > vh + 1; });
  return { count: boxes.length, bad: bad };
}

/** Moves the mouse to where the bot wants the waddle: the inverse of input.js (toRoadX and GAIN). */
async function driveWithMouse(page, seconds) {
  var t0 = Date.now();
  await page.mouse.move(10, 10); await page.mouse.down();
  while (Date.now() - t0 < seconds * 1000) {
    var want = await page.evaluate(function () {
      var s = PM.app.sim; if (!s || PM.app.state !== 'PLAY') return null;
      var x = PM.bot.greedy(s) / 1.35;
      var p = PM.render.project(PM.config.CAM_BACK, x);
      return { x: p.sx, y: PM.render.size().H * 0.8, phase: s.phase };
    });
    if (!want) break;
    await page.mouse.move(want.x, want.y);
    await page.waitForTimeout(40);
  }
  await page.mouse.up();
}

(async function () {
  fs.mkdirSync(artifacts, { recursive: true });
  var srv = await serve(root);
  var browser = await launchChrome();
  try {
    // ---- boot, assets, menus ----
    console.log('boot');
    var P = await newPage(browser, 390, 844), page = P.page;
    await boot(page, srv.url);
    var assets = await page.evaluate(function () { return PM.app.assets; });
    ok(assets.failed.length === 0 && assets.loaded === assets.total, 'all ' + assets.total + ' sprites loaded');
    ok(await page.$eval('#btn-play', function (b) { return b.offsetParent !== null; }), 'title screen shown');
    await page.click('#btn-levels');
    ok((await page.$$('#map-list .lvl')).length >= 7, 'level map lists levels');
    ok((await page.$$('#map-list .lvl.locked')).length >= 5, 'later levels are locked on a fresh save');
    await page.click('#map .js-back');
    await page.click('#btn-shop-title');
    ok((await page.$$('#shop-list .upg')).length === 3, 'shop shows three upgrades');
    ok(await page.$eval('#shop-list .btn', function (b) { return b.disabled; }), 'nothing affordable with 0 coins');
    await page.click('#shop .js-back');

    // ---- steering by pointer and keyboard ----
    console.log('steering');
    await page.click('#btn-play');
    await page.waitForFunction(function () { return PM.app.state === 'PLAY'; });
    var H = 844;
    await page.mouse.move(195, H * 0.8); await page.mouse.down(); await page.mouse.move(360, H * 0.8); await page.waitForTimeout(500);
    var x1 = await page.evaluate(function () { return PM.app.sim.x; });
    ok(x1 > 0.3, 'drag right moves the waddle right (x=' + x1.toFixed(2) + ')');
    await page.mouse.move(30, H * 0.8); await page.waitForTimeout(600); await page.mouse.up();
    var x2 = await page.evaluate(function () { return PM.app.sim.x; });
    ok(x2 < -0.3, 'drag left moves it left (x=' + x2.toFixed(2) + ')');
    await page.keyboard.down('ArrowRight'); await page.waitForTimeout(700); await page.keyboard.up('ArrowRight');
    var x3 = await page.evaluate(function () { return PM.app.sim.x; });
    ok(x3 > 0.5, 'arrow key steers (x=' + x3.toFixed(2) + ')');

    // ---- pause / resume ----
    await page.click('#btn-pause');
    var paused = await page.evaluate(function () { return { st: PM.app.state, t: PM.app.sim.t }; });
    await page.waitForTimeout(300);
    var still = await page.evaluate(function () { return PM.app.sim.t; });
    ok(paused.st === 'PAUSE' && still === paused.t, 'pause stops the sim');
    await page.click('#btn-resume');
    await page.waitForTimeout(200);
    ok(await page.evaluate(function () { return PM.app.state === 'PLAY'; }), 'resume continues');

    // ---- level 1 played to the end through the mouse ----
    console.log('level 1 by mouse');
    await page.evaluate(function () { PM.app.start(1); });
    await driveWithMouse(page, 40);
    await page.waitForFunction(function () { return PM.app.state === 'END'; }, null, { timeout: 15000 });
    var res = await page.evaluate(function () { var s = PM.app.sim; return { phase: s.phase, n: s.n, stars: s.stars, coins: PM.app.save.coins, reached: PM.app.save.reached }; });
    ok(res.phase === 'WON', 'level 1 won through pointer input (n=' + res.n + ', stars=' + res.stars + ')');
    ok(res.coins > 0 && res.reached === 2, 'coins awarded and level 2 unlocked (coins=' + res.coins + ')');
    ok(await page.$eval('#btn-next', function (b) { return b.offsetParent !== null; }), 'end screen offers the next level');

    // ---- shop and persistence ----
    console.log('shop');
    await page.evaluate(function () { PM.app.save.coins = 500; PM.save.save(PM.app.save); });
    await page.click('#btn-shop-end');
    await page.click('#shop-list [data-buy="size"]');
    var bought = await page.evaluate(function () { return { size: PM.app.save.upgrades.size, coins: PM.app.save.coins }; });
    ok(bought.size === 1 && bought.coins === 500 - 120, 'bought bigger waddle (coins=' + bought.coins + ')');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(function () { return window.PM && PM.app && PM.app.state === 'TITLE'; });
    var after = await page.evaluate(function () { return { size: PM.app.save.upgrades.size, reached: PM.app.save.reached, key: Object.keys(localStorage) }; });
    ok(after.size === 1 && after.reached === 2, 'save survives a reload');
    ok(after.key.every(function (k) { return k.indexOf('penguinMarch.') === 0 || k.indexOf('arcade.') === 0; }), 'storage keys carry the game prefix (or the arcade kit\'s)');
    ok(await page.$eval('#btn-play', function (b) { return /level 2/i.test(b.textContent); }), 'play button continues at level 2');

    // ---- losing ----
    console.log('losing');
    await page.evaluate(function () { PM.app.save.reached = 30; PM.app.save.upgrades = { size: 0, rate: 0, dmg: 0 }; PM.app.start(21); PM.input.set(0.5); });
    await page.waitForFunction(function () { return PM.app.state === 'END'; }, null, { timeout: 60000 });
    var lost = await page.evaluate(function () { return { phase: PM.app.sim.phase, title: document.getElementById('end-title').textContent }; });
    ok(lost.phase === 'LOST' && /walrus/i.test(lost.title), 'a hard level with no shop and a lazy lane is lost (' + lost.title + ')');
    ok(await page.$eval('#btn-next', function (b) { return b.hidden; }), 'no next level after a loss');
    ok(P.problems.length === 0, 'no page errors, console errors or failed requests' + (P.problems.length ? ': ' + P.problems.join(' | ') : ''));
    await P.ctx.close();

    // ---- preview shot for the OG image: level 5 mid-run with the bot ----
    console.log('preview shot');
    var Q = await newPage(browser, 390, 844);
    await boot(Q.page, srv.url);
    await Q.page.evaluate(function () { PM.app.save.reached = 5; PM.app.save.upgrades = PM.config.refShop(5); PM.app.setBot(true); PM.app.start(5); });
    // the moment a gate pair is close ahead of a grown waddle: numbers, arches and the crowd in one frame
    await Q.page.waitForFunction(function () {
      var s = PM.app.sim;
      return s && s.t > 6 && s.n >= 20 && s.entities.some(function (e) { return e.alive && e.type === 'gate' && e.z - s.z > 7 && e.z - s.z < 11; });
    }, null, { timeout: 30000 });
    // always to artifacts/; the committed docs/preview/game-play.png only when missing or asked for (UPDATE_PREVIEW=1),
    // so a routine test run does not churn the repository
    var shot = path.join(artifacts, 'game-play.png'), kept = path.join(root, 'docs', 'preview', 'game-play.png');
    await Q.page.screenshot({ path: shot });
    if (process.env.UPDATE_PREVIEW || !fs.existsSync(kept)) { fs.mkdirSync(path.dirname(kept), { recursive: true }); fs.copyFileSync(shot, kept); ok(true, 'wrote docs/preview/game-play.png'); }
    else ok(true, 'wrote tests/browser/artifacts/game-play.png (UPDATE_PREVIEW=1 refreshes docs/preview)');
    await Q.ctx.close();

    // ---- layout at several sizes ----
    console.log('layout');
    for (var i = 0; i < SIZES.length; i++) {
      var w = SIZES[i][0], h = SIZES[i][1];
      var R = await newPage(browser, w, h);
      await boot(R.page, srv.url);
      var t = await inside(R.page, '#title .card, #title .btn', w, h);
      ok(t.count >= 5 && t.bad.length === 0, w + 'x' + h + ': title card and buttons inside the viewport' + (t.bad.length ? ' (' + JSON.stringify(t.bad) + ')' : ''));
      await R.page.click('#btn-levels');
      var m = await inside(R.page, '#map .card, #map .bar .btn, #btn-map-more', w, h);
      ok(m.bad.length === 0, w + 'x' + h + ': level map inside the viewport');
      await R.page.click('#map .js-back');
      await R.page.click('#btn-shop-title');
      var s = await inside(R.page, '#shop .card, #shop .upg .btn', w, h);
      ok(s.count >= 4 && s.bad.length === 0, w + 'x' + h + ': shop inside the viewport');
      await R.page.click('#shop .js-back');
      await R.page.evaluate(function () { PM.app.setBot(true); PM.app.start(1); });
      await R.page.waitForTimeout(400);
      var hud = await inside(R.page, '#hud .pill, #hud .icon-btn', w, h);
      ok(hud.count === 3 && hud.bad.length === 0, w + 'x' + h + ': HUD inside the viewport');
      var canvas = await R.page.$eval('#game', function (c) { return { w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight }; });
      ok(canvas.cw === w && canvas.ch === h && canvas.w === w * 2, w + 'x' + h + ': canvas fills the viewport at 2x');
      await R.page.waitForFunction(function () { return PM.app.state === 'END'; }, null, { timeout: 60000 });
      await R.page.waitForTimeout(200);
      var e = await inside(R.page, '#end .card, #end .btn', w, h);
      ok(e.count >= 4 && e.bad.length === 0, w + 'x' + h + ': end screen inside the viewport');
      if (R.problems.length) ok(false, w + 'x' + h + ': ' + R.problems.join(' | '));
      if (failures) await R.page.screenshot({ path: path.join(artifacts, 'layout-' + w + 'x' + h + '.png') });
      await R.ctx.close();
    }
  } catch (e) {
    failures++;
    console.log('  ERROR ' + (e && e.stack || e));
  } finally {
    await browser.close();
    srv.close();
  }
  console.log(failures ? failures + ' of ' + checks + ' browser checks failed' : 'all ' + checks + ' browser checks passed');
  process.exit(failures ? 1 : 0);
})();
