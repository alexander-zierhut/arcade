// tests/browser/run.js: the optional browser smoke test (DESIGN 6.2). Run with `npm run test:browser`.
// Drives the real game in the system Chrome (playwright-core, found by tests/browser/chrome.js) via file://.
// It is no substitute for the iPhone QA pass (3.10, 6.3).
//
//   1. Main flow at 390x844 (DPR 2): boot to TITLE with no page errors, screenshot the title, click Play,
//      one real pointer launch (mouse below the dashed line), then 30 launches driven through window.CM
//      (botAim + setAim + requestLaunch on CM.app.ctx.game, advancing with the real loop by waiting),
//      score > 0, HUD rects disjoint (test 49 rules), screenshot play, pause with the Pause button (or P),
//      screenshot pause, the run record is stored, reload -> Continue restores the same score.
//   2. Title at 360x640, 375x667, 390x844 and 1920x1080 with a 160-character, 3-line dedication injected:
//      no errors, the Play button fully inside the viewport, every visible text >= 13 px.
//   3. play.js (required below): a whole game through real touch input (title, drops, merge, pause, sound, restart,
//      game over, best score, reload) and HUD / strip / overlay-card layout assertions at 320x640 to 1280x800.
//      Failure screenshots go to tests/browser/artifacts/.
// Screenshots: docs/preview/smoke-title.png, smoke-play.png, smoke-pause.png.
// Exits 1 on any failure. A failed load of the optional assets/tier-N.png is ignored.
// SMOKE_PAGE=/path/to/page.html runs against another page (for example a harness); default index.html.
'use strict';
var fs = require('fs');
var path = require('path');
var url = require('url');
var chrome = require('./chrome.js');
var play = require('./play.js');

var ROOT = path.resolve(__dirname, '..', '..');
var PAGE = process.env.SMOKE_PAGE ? path.resolve(process.env.SMOKE_PAGE) : path.join(ROOT, 'index.html');
var OUT_DIR = process.env.SMOKE_OUT ? path.resolve(process.env.SMOKE_OUT) : path.join(ROOT, 'docs', 'preview');
var OPTIONAL_ASSET = /assets\/tier-[1-9]\.png/;
var LAUNCHES = 30, LAUNCH_GAP_MS = 650;
var LONG_DEDICATION = 'For Reem, with all my love and a whole summer of sunny afternoons,\n' +
  'salty air, warm sand and the best cocktails on the beach.\nCheers to us, today and always!';

var failures = [];
function fail(msg) { failures.push(msg); console.log('  ✗ ' + msg); }
function ok(msg) { console.log('  ✓ ' + msg); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function watch(page, label, errors) {
  page.on('pageerror', function (err) { errors.push('[' + label + ' pageerror] ' + (err && err.stack || err)); });
  page.on('console', function (msg) {
    if (msg.type() !== 'error') return;
    var loc = (msg.location && msg.location()) || {};
    if (/Failed to load resource/.test(msg.text()) && OPTIONAL_ASSET.test(String(loc.url || ''))) return;
    errors.push('[' + label + ' console.error] ' + msg.text());
  });
  page.on('requestfailed', function (req) {
    if (!OPTIONAL_ASSET.test(req.url())) errors.push('[' + label + ' load failed] ' + req.url());
  });
}

function reportErrors(label, errors) {
  if (errors.length) errors.splice(0).forEach(function (e) { fail(label + ': ' + e); });
  else ok(label + ': no page errors');
}

async function waitState(page, states, ms) {
  var list = [].concat(states);
  try {
    var h = await page.waitForFunction(function (l) {
      if (document.body && /boot-failed/.test(document.body.className)) return 'boot-failed';
      var c = window.CM && window.CM.app && window.CM.app.ctx;
      return !!c && l.indexOf(c.state) >= 0;
    }, list, { timeout: ms || 8000, polling: 50 });
    return (await h.jsonValue()) === true;
  } catch (e) {
    return false;
  }
}

function appState(page) {
  return page.evaluate(function () {
    var c = window.CM && window.CM.app && window.CM.app.ctx;
    if (!c) return { state: null };
    var g = c.game;
    return { state: c.state, score: g ? g.score : 0, launches: g ? g.launches : 0, phase: g ? g.phase : null,
      bodies: g ? g.bodies.length : 0, errors: c.errors || {} };
  });
}

// The first visible <button> whose accessible name or text matches re.
async function findButton(page, re) {
  var loc = page.getByRole('button', { name: re });
  var n = await loc.count();
  for (var i = 0; i < n; i++) {
    var b = loc.nth(i);
    if (await b.isVisible().catch(function () { return false; })) return b;
  }
  return null;
}

async function shot(page, name) {
  var file = path.join(OUT_DIR, 'smoke-' + name + '.png');
  await page.screenshot({ path: file, fullPage: false });
  ok('screenshot ' + path.relative(ROOT, file));
}

// Test 49 on the live DOM: HUD rects inside the viewport and pairwise disjoint (coin may overlap the pill).
async function checkHud(page) {
  var r = await page.evaluate(function () {
    var ids = ['hud-coin', 'hud-pill', 'btn-pause', 'btn-mute', 'hud-next', 'hud-next-label', 'hud-best'];
    var out = {}, vw = window.innerWidth, vh = window.innerHeight;
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var b = el.getBoundingClientRect();
      if (b.width > 0 && b.height > 0) out[id] = { x: b.left, y: b.top, r: b.right, b: b.bottom };
    });
    return { rects: out, vw: vw, vh: vh };
  });
  var keys = Object.keys(r.rects), bad = [];
  if (keys.length < 4) { fail('HUD: only ' + keys.length + ' HUD elements visible in PLAY (' + keys.join(', ') + ')'); return; }
  keys.forEach(function (k) {
    var a = r.rects[k];
    if (a.x < -0.5 || a.y < -0.5 || a.r > r.vw + 0.5 || a.b > r.vh + 0.5) bad.push(k + ' outside the viewport');
  });
  for (var i = 0; i < keys.length; i++) {
    for (var j = i + 1; j < keys.length; j++) {
      var p = [keys[i], keys[j]].sort().join('+');
      if (p === 'hud-coin+hud-pill') continue;
      var a = r.rects[keys[i]], b = r.rects[keys[j]];
      if (a.x < b.r - 0.5 && b.x < a.r - 0.5 && a.y < b.b - 0.5 && b.y < a.b - 0.5) bad.push(p + ' overlap');
    }
  }
  if (bad.length) fail('HUD layout: ' + bad.join('; ')); else ok('HUD rects inside the viewport and disjoint (' + keys.length + ')');
}

// Every visible element that directly holds text has a computed font-size >= 13 px.
async function checkFonts(page, label) {
  var small = await page.evaluate(function () {
    var out = [], all = document.body.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var el = all[i], has = false;
      for (var n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 3 && n.nodeValue.trim()) { has = true; break; }
      if (!has || el.closest('script,style,noscript,[hidden],[aria-hidden="true"]')) continue;
      var cs = getComputedStyle(el), b = el.getBoundingClientRect();
      if (cs.visibility === 'hidden' || cs.display === 'none' || b.width === 0 || b.height === 0 || +cs.opacity === 0) continue;
      var fs = parseFloat(cs.fontSize);
      if (fs < 12.95) out.push((el.id ? '#' + el.id : el.tagName.toLowerCase() + '.' + el.className) + ' ' + fs + 'px "' + el.textContent.trim().slice(0, 24) + '"');
    }
    return out;
  });
  if (small.length) fail(label + ': text below 13 px: ' + small.slice(0, 6).join(' | '));
  else ok(label + ': every visible text >= 13 px');
}

async function mainFlow(browser) {
  console.log('Main flow (390x844):');
  var errors = [];
  var context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  var page = await context.newPage();
  watch(page, 'main', errors);
  await page.goto(url.pathToFileURL(PAGE).href, { waitUntil: 'load' });
  if (!(await waitState(page, 'TITLE', 15000))) {
    fail('the game did not reach TITLE within 15 s (state ' + JSON.stringify(await appState(page).catch(function () { return null; })) + ')');
    var bootError = await page.evaluate(function () { return document.body ? document.body.innerText.slice(0, 400) : ''; });
    if (/could not start/i.test(bootError)) fail('boot guard: ' + bootError.replace(/\s+/g, ' '));
    reportErrors('main', errors);
    await context.close();
    return;
  }
  ok('booted to TITLE');
  await sleep(700);                                     // overlay entry animation, a few attract launches
  await shot(page, 'title');

  var play = await findButton(page, /^\s*play\s*$/i) || await findButton(page, /\bplay\b/i);
  if (play) await play.click({ timeout: 5000 });
  else {
    fail('no visible "Play" button on the title');
    await page.evaluate(function () { window.CM.app.newGame(); });
  }
  if (!(await waitState(page, 'PLAY', 5000))) { fail('Play did not enter PLAY'); reportErrors('main', errors); await context.close(); return; }
  ok('Play entered PLAY');
  await sleep(400);                                     // past the 250 ms input guard

  // One real pointer launch: press and release below the dashed line, centre of the table.
  var pt = await page.evaluate(function () {
    var c = window.CM.app.ctx, r = c.game.rules;
    var p = window.CM.projection.project(c.lay, 50, (r.DANGER_Y + r.L) / 2);
    return { x: p.X, y: p.Y };
  });
  await page.mouse.move(pt.x, pt.y);
  await page.mouse.down();
  await sleep(60);
  await page.mouse.up();
  try {
    await page.waitForFunction(function () { return window.CM.app.ctx.game.launches >= 1; }, null, { timeout: 2500, polling: 50 });
    ok('a pointer release below the dashed line launched a glass');
  } catch (e) { fail('a pointer press/release below the dashed line did not launch'); }
  await sleep(LAUNCH_GAP_MS);

  // 30 launches through window.CM, advancing with the real loop.
  var done = 0, refused = 0, st;
  for (var i = 0; i < LAUNCHES; i++) {
    st = await appState(page);
    if (st.state === 'WIN_MENU') { await page.evaluate(function () { window.CM.app.keepPlaying(); }); await sleep(400); }
    else if (st.state !== 'PLAY') break;
    var res = await page.evaluate(function () {
      var G = window.CM.game, g = window.CM.app.ctx.game;
      G.setAim(g, G.botAim(g, Math.random()));
      return G.requestLaunch(g, 'key');
    });
    if (res === 'rejected') refused += 1; else done += 1;
    await sleep(LAUNCH_GAP_MS);
  }
  await sleep(800);
  st = await appState(page);
  var over = st.state === 'LOSE_SEQ' || st.state === 'OVER_MENU';
  if (done >= LAUNCHES - 2 || over) ok(done + ' scripted launches accepted (' + refused + ' refused), ' + st.launches + ' launched in total, state ' + st.state);
  else fail('only ' + done + ' of ' + LAUNCHES + ' scripted launches were accepted (' + refused + ' refused), state ' + st.state);
  if (st.score > 0) ok('score ' + st.score + ' > 0 after ' + st.launches + ' launches'); else fail('score is still 0 after ' + st.launches + ' launches');
  if (st.errors && Object.keys(st.errors).length) fail('consumer errors counted by CM.app.guard: ' + JSON.stringify(st.errors));
  if (over) {
    console.log('  (the run was lost during the scripted launches; starting a new one for the pause checks)');
    await page.evaluate(function () { window.CM.app.newGame(); });
    await waitState(page, 'PLAY', 3000);
    await sleep(400);
    await page.evaluate(function () {
      var G = window.CM.game, g = window.CM.app.ctx.game;
      G.debugAddBody(g, 2, 30, 60, 0, 0, { age: 24, cleared: true });
      G.debugAddBody(g, 2, 30 + 2 * g.rules.RADII[2], 60, 0, 0, { age: 24, cleared: true });
    });
    await sleep(600);
  }
  if ((await appState(page)).state === 'PLAY') await checkHud(page);
  await shot(page, 'play');

  // Pause with the HUD button (else the P key).
  var scoreBefore = (await appState(page)).score;
  var pause = await findButton(page, /^pause$/i);
  if (pause) await pause.click({ timeout: 3000 }).catch(function () { pause = null; });
  if (!pause) { console.log('  (no clickable Pause button; using the P key)'); await page.keyboard.press('KeyP'); }
  if (await waitState(page, 'PAUSE', 3000)) ok('paused'); else fail('Pause did not enter PAUSE');
  await sleep(450);
  await shot(page, 'pause');

  var stored = await page.evaluate(function () {
    var st = window.CM.ui && window.CM.ui.storage;
    return !!(st && st.loadRun());
  });
  if (stored) ok('the run record is stored on pause'); else fail('no run record stored after entering PAUSE');

  var persistent = await page.evaluate(function () {
    var st = window.CM.ui && window.CM.ui.storage;
    return !st || !st.persistent || st.persistent();
  });
  if (stored && persistent) {
    await page.reload({ waitUntil: 'load' });
    if (await waitState(page, 'TITLE', 15000)) {
      await sleep(500);
      var cont = await findButton(page, /continue/i);
      if (!cont) fail('after a reload with a stored run the title shows no "Continue"');
      else {
        await cont.click({ timeout: 5000 });
        if (await waitState(page, 'PLAY', 4000)) {
          var after = (await appState(page)).score;
          if (after === scoreBefore) ok('Continue restored the run (score ' + after + ')');
          else fail('Continue restored score ' + after + ', expected ' + scoreBefore);
        } else fail('Continue did not enter PLAY');
      }
    } else fail('the reload did not reach TITLE');
  }
  reportErrors('main', errors);
  await context.close();
}

async function titleCheck(browser, w, h) {
  var label = 'title ' + w + 'x' + h;
  var errors = [];
  var context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await context.addInitScript(function (text) {
    try { Object.defineProperty(window, 'CM_DEDICATION', { get: function () { return text; }, set: function () {}, configurable: false }); } catch (e) { /* ignore */ }
  }, LONG_DEDICATION);
  var page = await context.newPage();
  watch(page, label, errors);
  await page.goto(url.pathToFileURL(PAGE).href, { waitUntil: 'load' });
  if (!(await waitState(page, 'TITLE', 15000))) { fail(label + ': did not reach TITLE'); reportErrors(label, errors); await context.close(); return; }
  await sleep(700);
  var play = await findButton(page, /^\s*play\s*$/i) || await findButton(page, /\bplay\b/i);
  if (!play) fail(label + ': no visible Play button');
  else {
    var b = await play.boundingBox();
    if (b && b.x >= 0 && b.y >= 0 && b.x + b.width <= w + 0.5 && b.y + b.height <= h + 0.5) ok(label + ': Play fully inside the viewport');
    else fail(label + ': Play button not fully inside the viewport ' + JSON.stringify(b));
  }
  var ded = await page.evaluate(function (t) { return document.body.innerText.indexOf(t.split('\n')[0].slice(0, 30)) >= 0; }, LONG_DEDICATION);
  if (!ded) fail(label + ': the injected dedication is not shown');
  await checkFonts(page, label);
  reportErrors(label, errors);
  await context.close();
}

async function main() {
  if (!fs.existsSync(PAGE)) {
    console.error('Smoke test: ' + PAGE + ' does not exist yet.');
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  var browser;
  try {
    browser = await chrome.launchChrome();
  } catch (e) {
    console.error(e && e.message || e);
    process.exit(1);
  }
  try {
    await mainFlow(browser);
    console.log('Title layouts:');
    var sizes = [[360, 640], [375, 667], [390, 844], [1920, 1080]];
    for (var i = 0; i < sizes.length; i++) await titleCheck(browser, sizes[i][0], sizes[i][1]);
    await play.run(browser, {
      ok: ok, fail: fail, sleep: sleep, watch: watch, reportErrors: reportErrors, waitState: waitState, appState: appState,
      failureCount: function () { return failures.length; }, PAGE: PAGE, ROOT: ROOT
    });
  } catch (e) {
    fail('smoke test crashed: ' + (e && e.stack || e));
  } finally {
    await browser.close();
  }
  if (failures.length) {
    console.log('\nSmoke test FAILED (' + failures.length + '):\n  ' + failures.join('\n  '));
    process.exit(1);
  }
  console.log('\nSmoke test passed.');
}

main();
