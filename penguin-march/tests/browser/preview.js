// tests/browser/preview.js: opens the game in the system Chrome at phone size, lets the greedy bot play a level
// and writes screenshots to tests/browser/artifacts/preview/ (title, map, shop, a few moments of the level, the
// boss, the end), or to OUT=<dir>. A review tool; the committed docs/preview/game-play.png comes from run.js.
// Usage: node tests/browser/preview.js [level] [width height]      default: level 5 at 390x844
'use strict';
var path = require('path');
var fs = require('fs');
var launchChrome = require('./chrome.js').launchChrome;
var serve = require('./serve.js').serve;

var level = parseInt(process.argv[2] || '5', 10);
var W = parseInt(process.argv[3] || '390', 10), H = parseInt(process.argv[4] || '844', 10);
var root = path.resolve(__dirname, '..', '..');
var out = process.env.OUT || path.join(__dirname, 'artifacts', 'preview');

(async function () {
  fs.mkdirSync(out, { recursive: true });
  var srv = await serve(root);
  var browser = await launchChrome();
  var ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  var page = await ctx.newPage();
  var problems = [];
  page.on('pageerror', function (e) { problems.push('pageerror: ' + (e && e.message || e)); });
  page.on('console', function (m) { if (m.type() === 'error' || m.type() === 'warning') problems.push('console.' + m.type() + ': ' + m.text()); });
  page.on('requestfailed', function (r) { problems.push('failed: ' + r.url()); });
  page.on('response', function (r) { if (r.status() >= 400) problems.push(r.status() + ' ' + r.url()); });
  await page.goto(srv.url, { waitUntil: 'networkidle' });
  await page.waitForFunction(function () { return window.PM && PM.app && PM.app.state === 'TITLE' && PM.app.assets; }, null, { timeout: 10000 });
  var assets = await page.evaluate(function () { return PM.app.assets; });
  console.log('assets', JSON.stringify(assets));
  await page.screenshot({ path: path.join(out, 'title.png') });
  await page.click('#btn-levels');
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(out, 'map.png') });
  await page.click('#map .js-back');
  await page.click('#btn-shop-title');
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(out, 'shop.png') });
  await page.click('#shop .js-back');

  // unlock every level up to the requested one so it can be started, then let the bot play
  await page.evaluate(function (n) { PM.app.save.reached = Math.max(PM.app.save.reached, n); PM.app.save.upgrades = PM.config.refShop(n); PM.app.setBot(true); PM.app.start(n); }, level);
  var shots = [1.5, 5, 10, 16, 24], taken = 0, t0 = Date.now(), bossShot = false, endShot = false;
  while (Date.now() - t0 < 120000) {
    await page.waitForTimeout(100);
    var st = await page.evaluate(function () { var s = PM.app.sim; return { app: PM.app.state, t: s ? s.t : 0, phase: s ? s.phase : '', n: s ? s.n : 0, z: s ? s.z : 0 }; });
    if (taken < shots.length && st.t >= shots[taken]) { await page.screenshot({ path: path.join(out, 'play-' + (taken + 1) + '.png') }); taken++; }
    if (st.phase === 'BOSS' && !bossShot) { await page.waitForTimeout(900); await page.screenshot({ path: path.join(out, 'boss.png') }); bossShot = true; }
    if (st.app === 'END') { await page.waitForTimeout(300); await page.screenshot({ path: path.join(out, 'end.png') }); endShot = true; break; }
  }
  var final = await page.evaluate(function () { var s = PM.app.sim; return { phase: s && s.phase, n: s && s.n, stars: s && s.stars, state: PM.app.state }; });
  console.log('level ' + level + ':', JSON.stringify(final), 'shots', taken, 'boss', bossShot, 'end', endShot);
  if (problems.length) console.log('PROBLEMS:\n  ' + problems.join('\n  '));
  await browser.close();
  srv.close();
  process.exit(problems.length ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
