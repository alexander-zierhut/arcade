// tests/browser/play.js: the play-through and layout checks of the browser suite (required and awaited by run.js).
// Drives the real page in the system Chrome with real pointer / touch input; window.CM is only used to read state
// and to find where to press (CM.projection.project), never to make a move.
//
//   1. Play-through at 390x844 (DPR 2, touch) with ?seed=7: title -> Play (tapped), drops at chosen x positions
//      (touch taps on the table: left and right edge drops land where aimed), more drops until a merge happens (score,
//      merge counter, HUD score, discovered collection mask and the stored save follow), pause with the HUD button,
//      sound toggles (HUD button and the Paused card switch, persisted), Resume, Restart (armed, then a fresh board with
//      the seed's first glasses again), then drops in one column until the table is full and the game is lost: the
//      "Last Call!" card shows, the best score is stored under cocktailMerge.v1, the run record is gone; Play Again gives
//      a fresh board; Quit to Title, Settings sheet open / close, reload: sound setting, best and Continue survive.
//   2. Layout at 320x640, 360x740, 390x844, 430x932 (DPR 2, mobile, touch) and 1280x800 (desktop, mouse): the HUD
//      (score pill, coin, best, pause, sound, next preview and label), the collection strip and its slots, and the
//      Pause, Settings, Game over and Win cards are fully inside the viewport, the page has no horizontal overflow.
//      The Game over and Win cards are reached with CM.app.setState on a running game (layout only; the real loss is
//      driven in part 1).
// Failure screenshots go to tests/browser/artifacts/ (gitignored, uploaded by CI).
// Exports run(browser, h) with h = { ok, fail, sleep, watch, reportErrors, waitState, appState, failureCount, PAGE, ROOT }.
'use strict';
var fs = require('fs');
var path = require('path');
var url = require('url');

var ART_DIR = path.join(__dirname, 'artifacts');
var STORE_KEY = 'cocktailMerge.v1', RUN_KEY = 'cocktailMerge.v1.run';
var SEED = 7;
var VIEWPORTS = [
  { w: 320, h: 640, mobile: true }, { w: 360, h: 740, mobile: true }, { w: 390, h: 844, mobile: true },
  { w: 430, h: 932, mobile: true }, { w: 1280, h: 800, mobile: false }
];
var HUD_ELEMENTS = [
  ['score pill', '#hud-pill'], ['coin', '#hud-coin'], ['best', '#hud-best'], ['pause button', '#btn-pause'],
  ['sound button', '#btn-mute'], ['next preview', '#hud-next'], ['next label', '#hud-next-label'], ['collection strip', '#strip']
];

function digits(s) { return String(s || '').replace(/\D/g, ''); }

async function shot(page, name) {
  try {
    fs.mkdirSync(ART_DIR, { recursive: true });
    await page.screenshot({ path: path.join(ART_DIR, name + '.png'), fullPage: false });
  } catch (e) { /* the page is gone; nothing to show */ }
}

// A real press: a touch tap on touch contexts, else a mouse click.
async function press(page, selector, touch) {
  if (touch) await page.tap(selector, { timeout: 5000 });
  else await page.click(selector, { timeout: 5000 });
}
// Taps the centre of an element at once, without Playwright's stability wait (a pulsing armed button never settles
// and its 2 s arm window would run out meanwhile).
async function pressNow(page, selector, touch) {
  var c = await page.evaluate(function (sel) {
    var b = document.querySelector(sel).getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  }, selector);
  await pressAt(page, c.x, c.y, touch);
}
async function pressAt(page, x, y, touch) {
  if (touch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

function game(page) {
  return page.evaluate(function () {
    var c = window.CM.app.ctx, g = c.game, s = c.save;
    return { state: c.state, score: g ? g.score : -1, launches: g ? g.launches : -1, merges: g ? g.merges : -1,
      phase: g ? g.phase : null, bodies: g ? g.bodies.length : -1, current: g ? g.current : -1, next: g ? g.next : -1,
      highest: g ? g.highestTier : -1, seed: g ? g.seed : -1, discovered: s ? s.discovered : -1, best: s ? s.best : -1,
      muted: s ? !!s.muted : null };
  });
}

function stored(page) {
  return page.evaluate(function (keys) {
    var out = {};
    try {
      var a = localStorage.getItem(keys[0]), b = localStorage.getItem(keys[1]);
      out.save = a ? JSON.parse(a) : null; out.run = b ? JSON.parse(b) : null;
      out.keys = Object.keys(localStorage);
    } catch (e) { out.error = String(e); }
    return out;
  }, [STORE_KEY, RUN_KEY]);
}

function visible(page, selector) {
  return page.evaluate(function (sel) {
    var el = document.querySelector(sel);
    if (!el || el.closest('[hidden]')) return false;
    var b = el.getBoundingClientRect(), cs = getComputedStyle(el);
    return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
  }, selector);
}

async function until(page, fn, arg, ms) {
  try { await page.waitForFunction(fn, arg, { timeout: ms || 4000, polling: 40 }); return true; } catch (e) { return false; }
}

// Waits until the input guard after the last overlay is over and the launcher is ready.
function ready(page) {
  return until(page, function () {
    var c = window.CM.app.ctx;
    return c.state === 'PLAY' && c.game.phase === 'ready' && performance.now() >= c.guardUntilMs;
  }, null, 4000);
}

// One real drop at sim x: a touch tap on the table plane below the dashed line. Resolves to
// { launched, x (sim x of the new glass, or null) }.
async function drop(page, x, touch) {
  if (!(await ready(page))) return { launched: false, x: null };
  var before = (await game(page)).launches;
  var pt = await page.evaluate(function (sx) {
    var c = window.CM.app.ctx, r = c.game.rules;
    var p = window.CM.projection.project(c.lay, sx, (r.DANGER_Y + r.L) / 2);
    return { x: p.X, y: p.Y };
  }, x);
  await pressAt(page, pt.x, pt.y, touch);
  var launched = await until(page, function (n) { return window.CM.app.ctx.game.launches > n; }, before, 1500);
  var gx = await page.evaluate(function () {
    var b = window.CM.app.ctx.game.bodies, best = null;
    for (var i = 0; i < b.length; i++) if (!best || b[i].id > best.id) best = b[i];
    return best ? best.x : null;
  });
  return { launched: launched, x: launched ? gx : null };
}

// ---------------------------------------------------------------------------------------------------------------------
// 1. play-through
// ---------------------------------------------------------------------------------------------------------------------
async function playFlow(browser, h) {
  var label = 'play';
  console.log('Play-through (390x844, touch, seed ' + SEED + '):');
  var errors = [], failsBefore = h.failureCount();
  var context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  var page = await context.newPage();
  h.watch(page, label, errors);
  var base = url.pathToFileURL(h.PAGE).href + '?seed=' + SEED;
  try {
    await page.goto(base, { waitUntil: 'load' });
    if (!(await h.waitState(page, 'TITLE', 15000))) { h.fail('play: the game did not reach TITLE'); return; }
    await h.sleep(500);
    var cont = await visible(page, '[data-act="continue"]');
    if (!cont) h.ok('play: a fresh profile shows no Continue button'); else h.fail('play: Continue is visible on a fresh profile');

    // Title -> Play with a tap.
    await press(page, '#ov-title [data-act="play"]', true);
    if (!(await h.waitState(page, 'PLAY', 5000))) { h.fail('play: tapping Play did not enter PLAY'); return; }
    var g0 = await game(page);
    if (g0.seed === SEED && g0.score === 0 && g0.launches === 0 && g0.bodies === 0 && g0.merges === 0) h.ok('play: Play started a fresh board with the URL seed (' + SEED + ', score 0, empty table)');
    else h.fail('play: new board is not fresh / not seeded: ' + JSON.stringify(g0));
    var hud0 = await page.evaluate(function () { return { score: document.getElementById('hud-score').textContent, best: document.getElementById('hud-best').textContent }; });
    if (digits(hud0.score) === '0' && /^BEST\s/.test(hud0.best)) h.ok('play: HUD shows score 0 and "' + hud0.best + '"');
    else h.fail('play: HUD at the start: ' + JSON.stringify(hud0));
    var firstPair = [g0.current, g0.next];

    // Chosen drop positions: far left, far right.
    var left = await drop(page, 20, true), right = await drop(page, 80, true);
    if (left.launched && right.launched) h.ok('play: two touch taps launched two glasses');
    else h.fail('play: tap launches failed (left ' + left.launched + ', right ' + right.launched + ')');
    if (left.launched && Math.abs(left.x - 20) <= 4) h.ok('play: the drop aimed at x 20 landed at x ' + left.x.toFixed(1));
    else h.fail('play: the drop aimed at x 20 started at x ' + (left.x === null ? 'n/a' : left.x.toFixed(1)));
    if (right.launched && Math.abs(right.x - 80) <= 4) h.ok('play: the drop aimed at x 80 landed at x ' + right.x.toFixed(1));
    else h.fail('play: the drop aimed at x 80 started at x ' + (right.x === null ? 'n/a' : right.x.toFixed(1)));

    // Drops in the middle column until a merge happens.
    var n = 0, st = await game(page);
    while (st.merges < 1 && n < 25 && st.state === 'PLAY') { await drop(page, 50, true); st = await game(page); n++; }
    if (st.merges >= 1 && st.score > 0) h.ok('play: a merge happened after ' + st.launches + ' drops (merges ' + st.merges + ', score ' + st.score + ')');
    else { h.fail('play: no merge after ' + st.launches + ' drops (' + JSON.stringify(st) + ')'); await shot(page, 'play-nomerge'); }
    var hudOk = await until(page, function (sc) { return document.getElementById('hud-score').textContent.replace(/\D/g, '') === String(sc); }, st.score, 3000);
    if (hudOk) h.ok('play: the HUD score counts up to the game score (' + st.score + ')');
    else h.fail('play: HUD score "' + (await page.textContent('#hud-score')) + '" never reached ' + st.score);
    var bit = 1 << (st.highest - 1);
    if (st.highest >= 2 && (st.discovered & bit)) h.ok('play: collection mask has the new cocktail (tier ' + st.highest + ', mask ' + st.discovered + ')');
    else h.fail('play: highest tier ' + st.highest + ' is not in the collection mask ' + st.discovered);
    var sv = await stored(page);
    if (sv.save && sv.save.discovered === st.discovered && sv.save.bestTier >= st.highest) h.ok('play: the collection is stored in localStorage "' + STORE_KEY + '"');
    else h.fail('play: stored save does not match the collection: ' + JSON.stringify(sv.save));

    // Sound: the HUD button toggles and persists.
    var m0 = (await game(page)).muted;
    await press(page, '#btn-mute', true);
    var m1 = await until(page, function (v) { return !!window.CM.app.ctx.save.muted !== v; }, m0, 2000);
    if (m1) h.ok('play: the HUD sound button toggled the setting'); else h.fail('play: the HUD sound button did not toggle muted');
    var sv2 = await stored(page);
    if (sv2.save && sv2.save.muted === !m0) h.ok('play: the sound setting is stored'); else h.fail('play: stored muted is ' + (sv2.save && sv2.save.muted) + ', expected ' + !m0);

    // Pause with the HUD button; the card shows the score; settings in the card; Resume.
    st = await game(page);
    await press(page, '#btn-pause', true);
    if (await h.waitState(page, 'PAUSE', 3000)) h.ok('play: the Pause button paused the game'); else { h.fail('play: Pause did not enter PAUSE'); await shot(page, 'play-nopause'); }
    await until(page, function () { var e = document.getElementById('ov-pause'); return e && !e.hidden && !e.inert; }, null, 3000);
    var pauseOk = await page.evaluate(function () {
      var e = document.getElementById('ov-pause'); return { hidden: e.hidden, text: e.querySelector('.card').innerText, score: e.querySelector('.js-score').textContent };
    });
    if (!pauseOk.hidden && /paused/i.test(pauseOk.text) && digits(pauseOk.score) === String(st.score)) h.ok('play: the Paused card is shown with the score ' + st.score);
    else h.fail('play: Paused card: ' + JSON.stringify(pauseOk));
    var runRec = await stored(page);
    if (runRec.run) h.ok('play: the run is stored on pause'); else h.fail('play: no run record after pausing');
    var sw = '#ov-pause [data-key="muted"]';
    var before = await page.getAttribute(sw, 'aria-checked');
    await h.sleep(300);                                   // the overlay click guard
    await press(page, sw, true);
    await until(page, function (v) { return document.querySelector('#ov-pause [data-key="muted"]').getAttribute('aria-checked') !== v; }, before, 2000);
    var after = await page.getAttribute(sw, 'aria-checked'), mutedNow = (await game(page)).muted;
    if (after !== before && mutedNow === m0) h.ok('play: the Sound switch in the Paused card toggles back (muted ' + mutedNow + ')');
    else h.fail('play: Sound switch aria-checked ' + before + ' -> ' + after + ', muted ' + mutedNow + ' (expected ' + m0 + ')');
    // Leave it muted for the persistence check after the reload.
    await press(page, sw, true);
    await until(page, function (v) { return window.CM.app.ctx.save.muted === !v; }, m0, 2000);
    var sv3 = await stored(page);
    if (sv3.save && sv3.save.muted === !m0) h.ok('play: muted = ' + !m0 + ' is stored for the reload check');
    else h.fail('play: stored muted ' + (sv3.save && sv3.save.muted) + ', expected ' + !m0);
    await press(page, '#ov-pause [data-act="resume"]', true);
    if (await h.waitState(page, 'PLAY', 3000)) h.ok('play: Resume went back to PLAY'); else h.fail('play: Resume did not enter PLAY');
    var hiddenAfter = !(await visible(page, '#ov-pause'));
    if (hiddenAfter) h.ok('play: the Paused card is gone after Resume'); else h.fail('play: the Paused card is still visible after Resume');

    // Restart from the pause card: armed first tap, second tap restarts with a fresh board.
    await press(page, '#btn-pause', true);
    await h.waitState(page, 'PAUSE', 3000);
    await h.sleep(300);
    await pressNow(page, '#ov-pause [data-act="restart"]', true);
    var armed = await page.evaluate(function () { var b = document.querySelector('#ov-pause [data-act="restart"]'); return { armed: b.classList.contains('armed'), text: b.textContent }; });
    var stillPaused = (await game(page)).state === 'PAUSE';
    if (armed.armed && stillPaused) h.ok('play: the first Restart tap only arms it ("' + armed.text + '")'); else h.fail('play: first Restart tap: ' + JSON.stringify(armed) + ', still paused ' + stillPaused);
    await pressNow(page, '#ov-pause [data-act="restart"]', true);
    await h.waitState(page, 'PLAY', 3000);
    var g1 = await game(page);
    if (g1.state === 'PLAY' && g1.score === 0 && g1.launches === 0 && g1.bodies === 0 && g1.merges === 0 && g1.current === firstPair[0] && g1.next === firstPair[1]) h.ok('play: Restart gave a fresh board (score 0, empty table, same seeded first glasses)');
    else h.fail('play: Restart board: ' + JSON.stringify(g1) + ' expected first glasses ' + firstPair);
    var hud1 = await page.textContent('#hud-score');
    if (digits(hud1) === '0') h.ok('play: HUD score reset to 0 after Restart'); else h.fail('play: HUD score after Restart is "' + hud1 + '"');

    // Play to a loss: drop in the middle column until the table is full.
    var bestBefore = ((await stored(page)).save || {}).best || 0;
    var stalls = 0, drops = 0, t0 = Date.now();
    while (drops < 90 && stalls < 2 && (await game(page)).state === 'PLAY') {
      var d = await drop(page, 50, true);
      drops++;
      stalls = d.launched ? 0 : stalls + 1;
    }
    var over = await h.waitState(page, ['LOSE_SEQ', 'OVER_MENU'], 20000) && await h.waitState(page, 'OVER_MENU', 6000);
    var gOver = await game(page);
    if (over) h.ok('play: the table filled up after ' + drops + ' drops and the game was lost (score ' + gOver.score + ', ' + Math.round((Date.now() - t0) / 1000) + ' s)');
    else { h.fail('play: no game over after ' + drops + ' drops (' + JSON.stringify(gOver) + ')'); await shot(page, 'play-nogameover'); return; }
    await until(page, function () { var e = document.getElementById('ov-over'); return e && !e.hidden; }, null, 3000);
    var ov = await page.evaluate(function () {
      var e = document.getElementById('ov-over');
      return { hidden: e.hidden, text: e.querySelector('.card').innerText, score: e.querySelector('.js-score').textContent, best: e.querySelector('.js-best').textContent };
    });
    if (!ov.hidden && /last call/i.test(ov.text) && digits(ov.score) === String(gOver.score)) h.ok('play: the game-over card shows "Last Call!" with the score ' + gOver.score);
    else { h.fail('play: game-over card: ' + JSON.stringify(ov)); await shot(page, 'play-gameover'); }
    var sv4 = await stored(page), wantBest = Math.max(bestBefore, gOver.score);
    if (sv4.save && sv4.save.best === wantBest && wantBest > 0) h.ok('play: best score ' + wantBest + ' is stored under ' + STORE_KEY);
    else h.fail('play: stored best ' + (sv4.save && sv4.save.best) + ', expected ' + wantBest);
    if (digits(ov.best) === String(wantBest) || (ov.best && ov.best.indexOf(String(wantBest)) >= 0)) h.ok('play: the game-over card shows the best ("' + ov.best.trim() + '")');
    else h.fail('play: game-over best line "' + ov.best + '", expected ' + wantBest);
    if (!sv4.run) h.ok('play: the lost run is not stored'); else h.fail('play: a run record is still stored after the loss');
    var badKeys = (sv4.keys || []).filter(function (k) { return k.indexOf('cocktailMerge.') !== 0; });
    if (!badKeys.length) h.ok('play: every localStorage key uses the cocktailMerge. prefix'); else h.fail('play: unexpected localStorage keys ' + badKeys.join(', '));

    // Play Again: a fresh board, best kept.
    await h.sleep(300);
    await press(page, '#ov-over [data-act="again"]', true);
    await h.waitState(page, 'PLAY', 3000);
    var g2 = await game(page);
    if (g2.state === 'PLAY' && g2.score === 0 && g2.launches === 0 && g2.bodies === 0 && g2.best === wantBest) h.ok('play: Play Again gave a fresh board and kept the best (' + wantBest + ')');
    else h.fail('play: after Play Again: ' + JSON.stringify(g2));
    var hudBest = await page.textContent('#hud-best');
    if (digits(hudBest) === String(wantBest)) h.ok('play: the HUD shows "' + hudBest + '"'); else h.fail('play: HUD best "' + hudBest + '", expected ' + wantBest);

    // Drop once so a run exists, pause, quit to the title, open and close Settings.
    await drop(page, 50, true);
    await press(page, '#btn-pause', true);
    await h.waitState(page, 'PAUSE', 3000);
    await h.sleep(300);
    await press(page, '#ov-pause [data-act="quit"]', true);
    if (await h.waitState(page, 'TITLE', 3000)) h.ok('play: Quit to Title returned to the title'); else h.fail('play: Quit to Title did not reach TITLE');
    await h.sleep(500);
    await press(page, '#ov-title [data-act="settings"]', true);
    await until(page, function () { var e = document.getElementById('ov-settings'); return e && !e.hidden; }, null, 3000);
    if (await visible(page, '#ov-settings .card')) h.ok('play: the Settings sheet opened'); else h.fail('play: the Settings sheet did not open');
    var sw0 = await page.getAttribute('#ov-settings [data-key="muted"]', 'aria-checked');
    await h.sleep(300);
    await press(page, '#ov-settings [data-act="close"]', true);
    await until(page, function () { return document.getElementById('ov-settings').hidden; }, null, 3000);
    if (!(await visible(page, '#ov-settings'))) h.ok('play: the Settings sheet closed'); else h.fail('play: the Settings sheet is still open after Close');

    // Reload: settings, best and the run survive.
    await page.reload({ waitUntil: 'load' });
    if (!(await h.waitState(page, 'TITLE', 15000))) { h.fail('play: the reload did not reach TITLE'); return; }
    await h.sleep(500);
    var g3 = await game(page);
    if (g3.muted === !m0) h.ok('play: the sound setting survived the reload (muted ' + g3.muted + ')'); else h.fail('play: muted after reload ' + g3.muted + ', expected ' + !m0);
    if (g3.best === wantBest) h.ok('play: the best score survived the reload (' + wantBest + ')'); else h.fail('play: best after reload ' + g3.best + ', expected ' + wantBest);
    await press(page, '#ov-title [data-act="settings"]', true);
    await until(page, function () { var e = document.getElementById('ov-settings'); return e && !e.hidden; }, null, 3000);
    var sw1 = await page.getAttribute('#ov-settings [data-key="muted"]', 'aria-checked');
    if (sw1 === sw0 && sw1 === (g3.muted ? 'false' : 'true')) h.ok('play: the Sound switch in Settings reflects the stored setting after the reload');
    else h.fail('play: Sound switch aria-checked ' + sw1 + ' (before reload ' + sw0 + '), muted ' + g3.muted);
    await h.sleep(300);
    await press(page, '#ov-settings [data-act="close"]', true);
    if (await visible(page, '[data-act="continue"]')) h.ok('play: Continue is offered for the stored run after the reload'); else h.fail('play: no Continue button after the reload');
  } catch (e) {
    h.fail('play: crashed: ' + (e && e.message || e));
  } finally {
    if (h.failureCount() > failsBefore) await shot(page, 'play-failure');
    h.reportErrors(label, errors);
    await context.close();
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// 2. layout
// ---------------------------------------------------------------------------------------------------------------------

// Rects of the named selectors; null where the element is missing or not rendered.
function measure(page, items) {
  return page.evaluate(function (list) {
    return list.map(function (it) {
      var el = document.querySelector(it[1]);
      if (!el || el.closest('[hidden]')) return { name: it[0], sel: it[1], rect: null };
      var b = el.getBoundingClientRect(), cs = getComputedStyle(el);
      if (b.width <= 0 || b.height <= 0 || cs.visibility === 'hidden' || cs.display === 'none') return { name: it[0], sel: it[1], rect: null };
      return { name: it[0], sel: it[1], rect: { l: b.left, t: b.top, r: b.right, b: b.bottom } };
    });
  }, items);
}

// Waits until the element has stopped moving (the card-in animation) and is opaque.
function settled(page, sel) {
  return until(page, function (s) {
    var el = document.querySelector(s);
    if (!el || el.closest('[hidden]')) return false;
    var b = el.getBoundingClientRect(), key = [b.left, b.top, b.width, b.height].map(function (v) { return v.toFixed(1); }).join();
    window.__lay = window.__lay || {};
    var same = window.__lay[s] === key && +getComputedStyle(el).opacity >= 0.99;
    window.__lay[s] = key;
    return same && b.width > 0;
  }, sel, 3000);
}

async function checkRects(page, h, vp, stage, items) {
  var tag = vp.w + 'x' + vp.h, bad = [], res = await measure(page, items), n = 0;
  var info = await page.evaluate(function () { return { iw: window.innerWidth, ih: window.innerHeight, sw: document.documentElement.scrollWidth }; });
  res.forEach(function (r) {
    if (!r.rect) { bad.push(r.name + ' (' + r.sel + ') is not rendered'); return; }
    n++;
    var q = r.rect, why = [];
    if (q.l < -0.5) why.push('left ' + q.l.toFixed(1) + ' < 0');
    if (q.t < -0.5) why.push('top ' + q.t.toFixed(1) + ' < 0');
    if (q.r > info.iw + 0.5) why.push('right ' + q.r.toFixed(1) + ' > viewport width ' + info.iw);
    if (q.b > info.ih + 0.5) why.push('bottom ' + q.b.toFixed(1) + ' > viewport height ' + info.ih);
    if (why.length) bad.push(r.name + ' (' + r.sel + ') ' + why.join(', ') + ' [l ' + q.l.toFixed(1) + ' t ' + q.t.toFixed(1) + ' r ' + q.r.toFixed(1) + ' b ' + q.b.toFixed(1) + ']');
  });
  if (info.sw > info.iw) bad.push('horizontal overflow: scrollWidth ' + info.sw + ' > innerWidth ' + info.iw);
  if (bad.length) { h.fail('layout ' + tag + ' ' + stage + ': ' + bad.join('; ')); await shot(page, 'layout-' + tag + '-' + stage.replace(/\W+/g, '-')); }
  else h.ok('layout ' + tag + ' ' + stage + ': ' + n + ' element(s) inside the viewport, no horizontal overflow (scrollWidth ' + info.sw + ' <= ' + info.iw + ')');
}

async function layoutCheck(browser, h, vp) {
  var tag = vp.w + 'x' + vp.h, errors = [], touch = vp.mobile;
  var opts = { viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.mobile ? 2 : 1 };
  if (vp.mobile) { opts.isMobile = true; opts.hasTouch = true; }
  var context = await browser.newContext(opts);
  var page = await context.newPage();
  h.watch(page, 'layout ' + tag, errors);
  try {
    await page.goto(url.pathToFileURL(h.PAGE).href + '?seed=' + SEED, { waitUntil: 'load' });
    if (!(await h.waitState(page, 'TITLE', 15000))) { h.fail('layout ' + tag + ': did not reach TITLE'); return; }
    await h.sleep(500);
    await press(page, '#ov-title [data-act="play"]', touch);
    if (!(await h.waitState(page, 'PLAY', 5000))) { h.fail('layout ' + tag + ': Play did not enter PLAY'); return; }
    await drop(page, 30, touch);                          // a glass on the table, the next preview and strip in use
    await h.sleep(300);
    await checkRects(page, h, vp, 'HUD and strip', HUD_ELEMENTS);
    var slots = await page.evaluate(function () { return document.querySelectorAll('#strip-slots > *').length; });
    var slotItems = [];
    for (var i = 0; i < slots; i++) slotItems.push(['strip slot ' + (i + 1), '#strip-slots > :nth-child(' + (i + 1) + ')']);
    if (slotItems.length) await checkRects(page, h, vp, 'strip slots', slotItems);
    else h.fail('layout ' + tag + ': the collection strip has no slots');

    await press(page, '#btn-pause', touch);
    await h.waitState(page, 'PAUSE', 3000);
    await settled(page, '#ov-pause .card');
    await checkRects(page, h, vp, 'Pause card', [['pause card', '#ov-pause .card']]);

    await h.sleep(300);
    await press(page, '#ov-pause [data-act="quit"]', touch);
    await h.waitState(page, 'TITLE', 3000);
    await h.sleep(500);
    await press(page, '#ov-title [data-act="settings"]', touch);
    await settled(page, '#ov-settings .card');
    await checkRects(page, h, vp, 'Settings card', [['settings card', '#ov-settings .card']]);
    await h.sleep(300);
    await press(page, '#ov-settings [data-act="close"]', touch);

    await press(page, '#ov-title [data-act="continue"]', touch);   // the paused run is stored, so the title offers Continue
    await h.waitState(page, 'PLAY', 5000);
    await page.evaluate(function () { window.CM.app.setState('OVER_MENU'); });   // layout only; the real loss is part 1
    await settled(page, '#ov-over .card');
    await checkRects(page, h, vp, 'Game over card', [['game over card', '#ov-over .card']]);
    await page.evaluate(function () { window.CM.app.setState('WIN_MENU'); });
    await settled(page, '#ov-win .card');
    await checkRects(page, h, vp, 'Win card', [['win card', '#ov-win .card']]);
  } catch (e) {
    h.fail('layout ' + tag + ': crashed: ' + (e && e.message || e));
    await shot(page, 'layout-' + tag + '-crash');
  } finally {
    h.reportErrors('layout ' + tag, errors);
    await context.close();
  }
}

async function run(browser, h) {
  await playFlow(browser, h);
  console.log('Layouts:');
  for (var i = 0; i < VIEWPORTS.length; i++) await layoutCheck(browser, h, VIEWPORTS[i]);
}

module.exports = { run: run };
