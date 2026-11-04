// tests/browser/run.js: the CI browser suite of Plate Loop (GAME-SPEC 15), `npm run test:browser`.
//   1  boot at 390x844: no console error, page error, failed request or 4xx; TITLE state, all sprites loaded
//   2  tests/browser/ui.spec.js (UI, kit, pause, reload, settings, win / lose cards on fixtures): its checks count here
//   3  REAL levels 1 and 2 of PlateLoop.levels, played with real pointer taps (page.mouse down / up) on the box centres, driven by the
//      solver's solution (the bot's certify loop, one tap at a time); asserts the win card and the saved progress
//   2b tests/browser/scene.spec.js (the picture matches the engine on cw / ccw fixtures): its checks count here
//   4  the lose card: played by ui.spec on a fixture, its result is reused here (not played twice)
//   5  layout at 360x640, 390x844, 430x932, 768x1024, 1280x800: canvas, boxes (>= 40 px, 44 wanted), plates (>= 32 px),
//      boxes clear of the belt band, HUD and pause button inside the viewport; every layout template is measured too
//   6  docs/preview/game-play.png (only when missing or UPDATE_PREVIEW=1) and tests/browser/artifacts/game-play.png;
//      a screenshot of every failure in tests/browser/artifacts/
//   7  "  ok   ..." / "  FAIL ..." lines, a summary, exit code 1 on any failure
// Without PlateLoop.levels (the level file is not there yet) step 3 prints a SKIP line and the layout step uses the
// fixture level of ui.spec; the exit code then depends on everything else. DEV_GEN_LEVELS=1 plays two generated levels
// instead (a development aid while the level file does not exist; never set in CI).
'use strict';
var fs = require('fs');
var path = require('path');
var serveMod = require('./serve.js');
var launchChrome = require('./chrome.js').launchChrome;
var uiSpec = require('./ui.spec.js');
var sceneSpec = require('./scene.spec.js');

var GAME_DIR = path.resolve(__dirname, '..', '..');
var ART_DIR = path.join(__dirname, 'artifacts');
var PREVIEW_DIR = path.join(GAME_DIR, 'docs', 'preview');
var PLAY_CAP_MS = 120000;

var VIEWPORTS = [
  { w: 360, h: 640, mobile: true, dsf: 2 }, { w: 390, h: 844, mobile: true, dsf: 2 }, { w: 430, h: 932, mobile: true, dsf: 2 },
  { w: 768, h: 1024, mobile: false, dsf: 1 }, { w: 1280, h: 800, mobile: false, dsf: 1 }
];
var MIN_BOX = 40, WANT_BOX = 44, MIN_PLATE = 32, WANT_PLATE = 36;

// requests that may legitimately fail: none. The kit and the game load only files that exist.
var KNOWN_BENIGN = [];
// the level file is the only exception, and only while it does not exist in the tree
var LEVELS_FILE = 'src/levels/levels-001-100.js';
var levelsFileExists = fs.existsSync(path.join(GAME_DIR, LEVELS_FILE));

// ---------------------------------------------------------------------------------------------- reporting
var total = 0, failed = 0, skipped = 0, failures = [], notes = [], shotN = 0;
function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70); }
function ok(cond, msg) {
  total++;
  if (cond) console.log('  ok   ' + msg);
  else { failed++; failures.push(msg); console.log('  FAIL ' + msg); }
  return !!cond;
}
function note(msg) { notes.push(msg); console.log('  note ' + msg); }
function skip(msg) { skipped++; console.log('  SKIP ' + msg); }
function clean(e) { return String(e && e.message || e).replace(/\x1b\[[0-9;]*m/g, '').split('\n').slice(0, 4).join(' / '); }

async function shot(page, name) {
  if (!page || page.isClosed()) return;
  try {
    fs.mkdirSync(ART_DIR, { recursive: true });
    await page.screenshot({ path: path.join(ART_DIR, 'run-' + String(++shotN).padStart(2, '0') + '-' + slug(name) + '.png') });
  } catch (e) { /* the page may be gone */ }
}
// check(name, fn, page): fn returns true / undefined (pass), false or a string (fail, the string is the detail), or throws
async function check(name, fn, page) {
  var detail = null;
  try {
    var r = await fn();
    if (r === false) detail = 'returned false';
    else if (typeof r === 'string') detail = r;
  } catch (e) { detail = 'threw: ' + clean(e); }
  ok(detail === null, name + (detail === null ? '' : ': ' + detail));
  if (detail !== null) await shot(page, name);
  return detail === null;
}

// ---------------------------------------------------------------------------------------------- page helpers
async function openPage(browser, base, o) {
  var ctx = await browser.newContext({
    viewport: { width: o.w, height: o.h }, deviceScaleFactor: o.dsf || 1,
    isMobile: !!o.mobile, hasTouch: !!o.mobile, locale: 'en-US', acceptDownloads: false
  });
  var page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  var P = { page: page, ctx: ctx, base: base, consoleErrors: [], pageErrors: [], failedReqs: [], badResponses: [], o: o };
  page.on('console', function (m) { if (m.type() === 'error') P.consoleErrors.push(m.text() + ' @ ' + ((m.location() || {}).url || '')); });
  page.on('pageerror', function (e) { P.pageErrors.push(String(e && e.message || e)); });
  page.on('requestfailed', function (r) { P.failedReqs.push(r.url() + ' ' + ((r.failure() || {}).errorText || '')); });
  page.on('response', function (r) { if (r.status() >= 400) P.badResponses.push(r.status() + ' ' + r.url()); });
  await page.goto(base);
  await page.waitForFunction(function () { return window.PlateLoop && window.PlateLoop.app && window.PlateLoop.app.state === 'TITLE'; }, null, { timeout: 15000 });
  return P;
}
function benign(url) {
  for (var i = 0; i < KNOWN_BENIGN.length; i++) if (url.indexOf(KNOWN_BENIGN[i]) >= 0) return true;
  return !levelsFileExists && url.indexOf(LEVELS_FILE) >= 0;
}
function problems(P) {
  var out = [];
  P.pageErrors.forEach(function (e) { out.push('page error: ' + e); });
  P.consoleErrors.forEach(function (e) { if (!benign(e)) out.push('console error: ' + e); });
  P.failedReqs.forEach(function (e) { if (!benign(e)) out.push('request failed: ' + e); });
  P.badResponses.forEach(function (e) { if (!benign(e)) out.push('bad response: ' + e); });
  return out;
}
// closes a kit sheet (changelog, hints) that would cover the game
async function dismissKit(page) {
  for (var i = 0; i < 3; i++) {
    var b = await page.$('#arcade-ui [role=dialog] .arcade-btn.primary') || await page.$('#arcade-ui [role=dialog] .arcade-btn');
    if (!b) break;
    try { await b.click({ timeout: 1500 }); } catch (e) { break; }
    await page.waitForTimeout(80);
  }
  await page.evaluate(function () { if (window.Arcade.sheetOpen()) window.Arcade.closeSheet(); });
}
async function cl(page, sel) { await dismissKit(page); return page.click(sel); }
function appState(page) { return page.evaluate(function () { return window.PlateLoop.app.state; }); }
async function waitState(page, want, ms) {
  try { await page.waitForFunction(function (w) { return window.PlateLoop.app.state === w; }, want, { timeout: ms || 5000 }); return true; }
  catch (e) { return 'state: expected ' + want + ', got ' + await appState(page); }
}
async function isShown(page, sel) {
  return page.evaluate(function (s) { var e = document.querySelector(s); return !!(e && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden'); }, sel);
}
async function waitShown(page, sel, ms) {
  try { await page.waitForSelector(sel, { state: 'visible', timeout: ms || 5000 }); return true; } catch (e) { return sel + ' did not show'; }
}
function saveOf(page) {
  return page.evaluate(function () { try { return JSON.parse(localStorage.getItem('plateLoop.save')); } catch (e) { return null; } });
}
// title / win card -> PLAY: presses the primary button given and confirms the how-to cards on the way
async function intoPlay(page, sel) {
  await cl(page, sel);
  for (var i = 0; i < 12; i++) {
    var s = await appState(page);
    if (s === 'PLAY') return true;
    if (s === 'HOWTO') { await cl(page, '#howto-next'); continue; }
    await page.waitForTimeout(100);
  }
  return 'did not reach PLAY, state ' + await appState(page);
}

// ---------------------------------------------------------------------------------------------- the player (in the page)
// installBot(): window.__bot.next() -> { tap: -1 | box index, x, y, belt, moves, mi, state } where x / y are the viewport
// coordinates of the box centre. It follows bot.certify: solve once, then per move wait for an empty belt, tap the
// source box, and tap boxes that hold something that is not the beginning of their planned content (kicks).
function installBot() {
  var PL = window.PlateLoop, C = null;
  function kindsOf(box) { var o = [], i; for (i = 0; i < box.pieces.length; i++) o.push(box.pieces[i].k); return o; }
  function isPrefix(have, want) { var i; if (have.length > want.length) return false; for (i = 0; i < have.length; i++) if (have[i] !== want[i]) return false; return true; }
  function point(i) {
    var sc = PL.app.scene, c = document.getElementById('board').getBoundingClientRect(), L = sc.layout(), r = sc.boxRect(i);
    return { x: c.left + L.ox + (r.x + r.w / 2) * L.scale, y: c.top + L.oy + (r.y + r.h / 2) * L.scale };
  }
  function beltCount(s) { var n = 0, i; for (i = 0; i < s.state.belt.length; i++) if (s.state.belt[i]) n++; return n; }
  function out(i, extra) {
    var r = { tap: i, state: PL.app.state, belt: 0, moves: C ? C.moves.length : 0, mi: C ? C.mi : 0, err: C ? C.err : null, sent: C ? C.sent : 0 };
    if (PL.app.sim) r.belt = beltCount(PL.app.sim);
    if (i >= 0) { var p = point(i); r.x = p.x; r.y = p.y; }
    return r;
  }
  function init() {
    var a = PL.app, layout = PL.layouts[a.level.layout], res = PL.solver.solve(a.level, { layout: layout });
    C = { sim: a.sim, layout: layout, moves: res.solvable ? res.moves : [], mi: 0, want: null, phase: 'wait', err: res.solvable ? null : 'solver: ' + (res.unknown ? 'unknown' : 'unsolvable'), sent: 0 };
  }
  function next() {
    var a = PL.app, s = a.sim, i, b, want, plan, box, mv;
    if (a.state !== 'PLAY' || !s || s.status !== 'play') return out(-1);
    if (!a.scene || !a.scene.layout() || !a.scene.boxRect(s.state.boxes.length - 1)) return out(-1);   // the new scene binds at its first frame
    if (!C || C.sim !== s) init();
    if (C.err) return out(-1);
    for (var guard = 0; guard < 3; guard++) {
      if (C.phase === 'wait') {
        if (C.mi >= C.moves.length) return out(-1);
        if (!PL.bot.beltEmpty(s)) return out(-1);
        mv = C.moves[C.mi]; box = s.state.boxes[mv.box];
        if (!box || !PL.rules.unit(box)) { C.err = 'move ' + C.mi + ': box ' + mv.box + ' is empty'; return out(-1); }
        try { plan = PL.solver.applyMove(s.state, mv, C.layout).state; } catch (e) { C.err = 'move ' + C.mi + ': ' + e.message; return out(-1); }
        C.want = []; for (i = 0; i < s.state.boxes.length; i++) C.want.push(kindsOf(plan.boxes[i]));
        C.phase = 'run'; C.sent++;
        return out(mv.box);
      }
      // run: kick whatever landed where it does not belong; the move is over when nothing is pending and the belt is empty
      var pending = false;
      for (b = 0; b < s.state.boxes.length; b++) {
        if (s.state.boxes[b].pending > 0 || isPrefix(kindsOf(s.state.boxes[b]), C.want[b])) continue;
        pending = true;
        var r = PL.rules.canEject(s.state, b);
        if (r.ok) { C.sent++; return out(b); }
        if (r.reason !== 'full' && r.reason !== 'pair' && r.reason !== 'pending') { C.err = 'move ' + C.mi + ': a piece is stuck in box ' + s.state.boxes[b].id + ' (' + r.reason + ')'; return out(-1); }
      }
      if (!pending && PL.bot.beltEmpty(s)) { C.mi++; C.phase = 'wait'; continue; }
      return out(-1);
    }
    return out(-1);
  }
  window.__bot = { next: next };
}

// plays the level on screen to its end with real taps. Returns { end: 'WIN'|'LOSE'|'timeout'|..., ms, taps, err }
async function playRound(P, hooks) {
  var page = P.page, t0 = Date.now(), taps = 0, last = null, refused = 0;
  await page.evaluate(installBot);
  while (Date.now() - t0 < PLAY_CAP_MS) {
    var r = await page.evaluate(function () { return window.__bot.next(); });
    last = r;
    if (r.state === 'WIN' || r.state === 'LOSE') return { end: r.state, ms: Date.now() - t0, taps: taps, last: r };
    if (r.err) return { end: 'bot error', ms: Date.now() - t0, taps: taps, err: r.err, last: r };
    if (hooks && hooks.poll) await hooks.poll(r);
    if (r.tap >= 0) {
      await page.mouse.move(r.x, r.y);
      await page.mouse.down();
      await page.mouse.up();
      taps++;
      await page.waitForTimeout(40);
    } else await page.waitForTimeout(40);
  }
  return { end: 'timeout', ms: Date.now() - t0, taps: taps, last: last };
}

// ---------------------------------------------------------------------------------------------- 1: boot
async function stepBoot(browser, base) {
  console.log('boot (390x844)');
  var P = await openPage(browser, base, { w: 390, h: 844, mobile: true, dsf: 1 });
  var page = P.page;
  await page.waitForTimeout(800);                                    // late requests (sprites, icons) are in by now
  await check('boot: no console error, page error, failed request or 4xx/5xx response', function () {
    var p = problems(P);
    return p.length ? p.length + ' problem(s): ' + p.slice(0, 4).join(' ;; ') : true;
  }, page);
  await check('boot: PlateLoop.app.state is TITLE and assets.failed is empty', async function () {
    var r = await page.evaluate(function () { var a = window.PlateLoop.app; return { s: a.state, f: a.assets && a.assets.failed }; });
    if (r.s !== 'TITLE') return 'state ' + r.s;
    return r.f && r.f.length === 0 ? true : 'assets.failed = ' + JSON.stringify(r.f);
  }, page);
  await check('boot: every sprite loaded (assets.loaded === assets.total > 0)', async function () {
    var r = await page.evaluate(function () { return window.PlateLoop.sprites.status(); });
    if (!(r.total > 0)) return 'no sprites counted: ' + JSON.stringify(r);
    return r.loaded === r.total ? true : r.loaded + ' of ' + r.total + ' loaded, failed: ' + JSON.stringify(r.failed);
  }, page);
  await check('boot: the modules the suite and the game need are on window.PlateLoop', async function () {
    var miss = await page.evaluate(function () {
      var PL = window.PlateLoop, need = ['sim', 'rules', 'model', 'scene', 'layout', 'layouts', 'solver', 'bot', 'input', 'save', 'screens'];
      return need.filter(function (k) { return !PL[k]; });
    });
    return miss.length ? 'missing: ' + miss.join(', ') : true;
  }, page);
  await P.ctx.close();
}

// ---------------------------------------------------------------------------------------------- the real levels
// What level list the pages use: the game's own PlateLoop.levels; DEV_GEN_LEVELS=1 swaps in two generated ones.
async function levelInfo(P) {
  return P.page.evaluate(function () {
    var L = window.PlateLoop.levels;
    return { n: L && L.length ? L.length : 0, first: L && L[0] ? { id: L[0].id, tier: L[0].tier, layout: L[0].layout, N: L[0].N, boxes: L[0].boxes.length } : null };
  });
}
function devLevels(page) {
  return page.evaluate(function () {
    var PL = window.PlateLoop, out = [], tiers = ['easy', 'normal'];
    for (var i = 0; i < 2; i++) for (var seed = 1 + i * 100; ; seed++) {
      var r = PL.generator.generate({ tier: tiers[i], seed: seed });
      if (r && r.level) { r.level.id = i + 1; out.push(r.level); break; }
      if (seed > 400) throw new Error('no dev level');
    }
    PL.levels = out;
    return out.length;
  });
}

async function stepPlay(browser, base, previewSink) {
  console.log('real levels with real taps (390x844)');
  var P = await openPage(browser, base, { w: 390, h: 844, mobile: true, dsf: 2 });
  var page = P.page;
  if (process.env.DEV_GEN_LEVELS) { await devLevels(page); note('DEV_GEN_LEVELS: generated levels instead of PlateLoop.levels'); }
  var info = await levelInfo(P);
  if (!info.n) {
    skip('play: PlateLoop.levels is missing (' + LEVELS_FILE + ' is not in the tree yet): the level 1 / 2 play-through did not run');
    await P.ctx.close();
    return false;
  }
  await check('levels: PlateLoop.levels has levels and level 1 is first (id 1, a known layout)', async function () {
    if (!info.first || info.first.id !== 1) return 'first level ' + JSON.stringify(info.first);
    var known = await page.evaluate(function (n) { return !!window.PlateLoop.layouts[n]; }, info.first.layout);
    return known ? true : 'unknown layout ' + info.first.layout;
  }, page);

  for (var lv = 1; lv <= 2; lv++) {
    var tag = 'level ' + lv;
    var r = await intoPlay(page, lv === 1 ? '#btn-play' : '#win-next');
    if (!(await check('play ' + tag + ': from ' + (lv === 1 ? 'the title' : 'the win card') + ' to PLAY (how-to cards confirmed), pill "Level ' + lv + '"', async function () {
      if (r !== true) return r;
      var p = await page.evaluate(function () { return document.getElementById('pill').textContent.trim() + '|' + window.PlateLoop.app.level.id; });
      return p === 'Level ' + lv + '|' + lv ? true : 'pill/level ' + p;
    }, page))) break;
    var shotDone = false, polled = 0;
    var res = await playRound(P, {
      poll: async function (st) {
        polled++;
        // the preview: some pieces on the belt, a little into the level
        if (lv === 1 && !shotDone && st.belt >= 3 && st.mi >= 1) {
          shotDone = true;
          await page.waitForTimeout(250);
          previewSink.buf = await page.screenshot();
        }
      }
    });
    if (lv === 1 && !shotDone) {                                   // a level with few pieces on the belt at once: take it late
      previewSink.late = true;
    }
    var secs = Math.round(res.ms / 100) / 10;
    await check('play ' + tag + ': real taps (' + res.taps + ', solver-driven) win the level in ' + secs + ' s, win card shows', async function () {
      if (res.end === 'bot error') return 'the bot gave up: ' + res.err;
      if (res.end === 'timeout') return 'no end within ' + PLAY_CAP_MS / 1000 + ' s (bot at move ' + (res.last && res.last.mi) + ' of ' + (res.last && res.last.moves) + ')';
      if (res.end === 'LOSE') return 'the level was LOST after ' + res.taps + ' taps (bot at move ' + res.last.mi + ' of ' + res.last.moves + '). // BUG: a certified level lost under real input';
      var w = await waitShown(page, '#card-win', 4000);
      if (w !== true) return w;
      return (await page.evaluate(function () { return window.PlateLoop.app.state; })) === 'WIN' ? true : 'state ' + await appState(page);
    }, page);
    await check('win ' + tag + ': the save advanced to level ' + (lv + 1), async function () {
      var s = await saveOf(page);
      return s && s.level === lv + 1 ? true : 'save.level = ' + (s && s.level);
    }, page);
    if (res.end !== 'WIN') break;
  }
  await check('play: no console error or page error during the real levels', function () {
    var p = problems(P);
    return p.length ? p.slice(0, 4).join(' ;; ') : true;
  }, page);
  await P.ctx.close();
  return true;
}

// ---------------------------------------------------------------------------------------------- 5: layout
// measured in the page: the real board of level 1 (scene) plus every layout template at the canvas size
function measureBoard(arg) {
  var PL = window.PlateLoop, out = { errors: [], boxes: [], plate: 0, layoutName: null, templates: [] };
  var vw = window.innerWidth, vh = window.innerHeight, tol = 0.6;
  function rectOf(e) { var r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; }
  function inside(r, o) { return r.l >= o.l - tol && r.t >= o.t - tol && r.r <= o.r + tol && r.b <= o.b + tol; }
  function fmt(r) { return Math.round(r.l) + ',' + Math.round(r.t) + ' ' + Math.round(r.r) + ',' + Math.round(r.b); }
  var vp = { l: 0, t: 0, r: vw, b: vh };
  var cv = document.getElementById('board'), cr = rectOf(cv);
  if (!inside(cr, vp)) out.errors.push('canvas outside the viewport (' + fmt(cr) + ' in ' + vw + 'x' + vh + ')');
  ['.band', '#pill', '#btn-pause'].forEach(function (s) {
    var e = document.querySelector(s);
    if (!e || !e.getClientRects().length) { out.errors.push(s + ' is not visible'); return; }
    var r = rectOf(e);
    if (!inside(r, vp)) out.errors.push(s + ' outside the viewport (' + fmt(r) + ' in ' + vw + 'x' + vh + ')');
  });
  var de = document.documentElement;
  if (de.scrollWidth > vw + 1 || de.scrollHeight > vh + 1) out.errors.push('the page scrolls (' + de.scrollWidth + 'x' + de.scrollHeight + ' in ' + vw + 'x' + vh + ')');
  var band = document.querySelector('.band').getBoundingClientRect();
  if (cr.top < band.bottom - tol) out.errors.push('canvas runs under the HUD band');

  // the geometry of one template at a canvas size w x h: box sizes, plate, distance of the boxes to the belt centreline
  function geometry(tpl, w, h) {
    var L = PL.layout.compute(tpl, { w: w, h: h }), s = L.scale, plate = (tpl.plate || 40), pts = PL.layout.samplePath(tpl, 2), id, res = { boxes: [], plate: plate * s, clear: Infinity, outside: [] };
    for (id in tpl.slots) {
      if (!Object.prototype.hasOwnProperty.call(tpl.slots, id)) continue;
      var b = tpl.slots[id], d = Infinity, i;
      for (i = 0; i < pts.length; i++) {                                // distance of a belt centreline point to the box rectangle
        var dx = Math.max(b.x - pts[i].x, 0, pts[i].x - (b.x + b.w)), dy = Math.max(b.y - pts[i].y, 0, pts[i].y - (b.y + b.h));
        d = Math.min(d, Math.sqrt(dx * dx + dy * dy));
      }
      var px = { x: L.ox + b.x * s, y: L.oy + b.y * s, w: b.w * s, h: b.h * s };
      res.boxes.push({ id: id, w: px.w, h: px.h, side: Math.min(px.w, px.h) });
      res.clear = Math.min(res.clear, d - plate / 2);                    // negative = the plate band touches the box
      if (px.x < -tol || px.y < -tol || px.x + px.w > w + tol || px.y + px.h > h + tol) res.outside.push(id);
    }
    // the belt band itself (centreline +- plate / 2) must fit the canvas as well
    for (var j = 0; j < pts.length; j++) {
      var q = { x: L.ox + pts[j].x * s, y: L.oy + pts[j].y * s }, e = plate * s / 2;
      if (q.x - e < -tol || q.y - e < -tol || q.x + e > w + tol || q.y + e > h + tol) { res.outside.push('belt'); break; }
    }
    return res;
  }
  var w = cv.clientWidth, h = cv.clientHeight;
  out.canvas = { w: w, h: h };
  // the real board
  var sc = PL.app.scene, tpl = PL.layouts[PL.app.level.layout];
  out.layoutName = tpl.name || PL.app.level.layout;
  var L = sc.layout();
  if (Math.abs(L.w - w) > 1 || Math.abs(L.h - h) > 1) out.errors.push('scene layout ' + L.w + 'x' + L.h + ' differs from the canvas ' + w + 'x' + h);
  var n = PL.app.sim.state.boxes.length, i, minSide = Infinity, cvLeft = cr.l, cvTop = cr.t;
  for (i = 0; i < n; i++) {
    var r = sc.boxRect(i);
    if (!r) { out.errors.push('scene.boxRect(' + i + ') is null'); continue; }
    var pw = r.w * L.scale, ph = r.h * L.scale, side = Math.min(pw, ph);
    var left = cvLeft + L.ox + r.x * L.scale, top = cvTop + L.oy + r.y * L.scale;
    var rr = { l: left, t: top, r: left + pw, b: top + ph };
    if (!inside(rr, rectOf(cv))) out.errors.push('box ' + i + ' outside the canvas (' + fmt(rr) + ')');
    if (!inside(rr, vp)) out.errors.push('box ' + i + ' outside the viewport (' + fmt(rr) + ')');
    out.boxes.push(side);
    minSide = Math.min(minSide, side);
  }
  out.minBox = minSide;
  out.plate = (tpl.plate || 40) * L.scale;
  var g = geometry(tpl, w, h);
  out.clear = g.clear * L.scale;
  if (g.outside.length) out.errors.push('outside the canvas: ' + g.outside.join(','));
  // the other templates at this canvas size
  var names = PL.layouts.list ? PL.layouts.list() : [];
  names.forEach(function (nm) {
    var t2 = PL.layouts[nm], g2 = geometry(t2, w, h), ms = Infinity;
    g2.boxes.forEach(function (b) { ms = Math.min(ms, b.side); });
    out.templates.push({ name: nm, minBox: ms, plate: g2.plate, clear: g2.clear * (PL.layout.compute(t2, { w: w, h: h }).scale), outside: g2.outside });
  });
  return out;
}

async function stepLayout(browser, base, haveLevels) {
  console.log('layout at five sizes (real level 1 board)' + (haveLevels ? '' : ' [fixture level: PlateLoop.levels missing]'));
  var table = [];
  for (var i = 0; i < VIEWPORTS.length; i++) {
    var vp = VIEWPORTS[i], tag = vp.w + 'x' + vp.h, P = null, m = null, err = null;
    try {
      P = await openPage(browser, base, vp);
      if (process.env.DEV_GEN_LEVELS) await devLevels(P.page);
      else if (!haveLevels) await P.page.evaluate(function (fx) { window.PlateLoop.levels = fx; }, uiSpec.FIXTURES);
      var r = await intoPlay(P.page, '#btn-play');
      if (r !== true) throw new Error(r);
      await P.page.waitForTimeout(250);
      m = await P.page.evaluate(measureBoard);
    } catch (e) { err = clean(e); }
    if (err || !m) {
      await check('layout ' + tag + ': the real board could be measured', function () { return err || 'no measurement'; }, P && P.page);
      if (P) await P.ctx.close();
      continue;
    }
    table.push({ tag: tag, m: m });
    var minBox = Math.round(m.minBox * 10) / 10;
    await check('layout ' + tag + ': canvas, HUD band, pill and pause button inside the viewport, every box inside the canvas, no page scroll', function () {
      return m.errors.length ? m.errors.slice(0, 4).join(' ;; ') : true;
    }, P.page);
    await check('layout ' + tag + ': every box is at least ' + MIN_BOX + ' px tall (' + WANT_BOX + ' wanted), smallest ' + minBox + ' px, layout ' + m.layoutName, function () {
      // BUG: the board is scaled to fit the canvas; at 360x640 the box height (design 44 units) lands just under the minimum
      return m.minBox >= MIN_BOX ? true : 'smallest box side is ' + minBox + ' px (< ' + MIN_BOX + '), the layout is scaled too small for this viewport';
    }, P.page);
    if (m.minBox >= MIN_BOX && m.minBox < WANT_BOX) note(tag + ': smallest box ' + minBox + ' px is under the wanted ' + WANT_BOX + ' px');
    var plate = Math.round(m.plate * 10) / 10;
    await check('layout ' + tag + ': plates are at least ' + MIN_PLATE + ' px (' + WANT_PLATE + ' wanted), measured ' + plate + ' px', function () {
      return m.plate >= MIN_PLATE ? true : 'plate is ' + plate + ' px (< ' + MIN_PLATE + ')';
    }, P.page);
    if (m.plate >= MIN_PLATE && m.plate < WANT_PLATE) note(tag + ': plate ' + plate + ' px is under the wanted ' + WANT_PLATE + ' px');
    await check('layout ' + tag + ': no box touches the belt band (clearance ' + (Math.round(m.clear * 10) / 10) + ' px between plate edge and box)', function () {
      return m.clear >= 0 ? true : 'a box overlaps the belt band by ' + (-Math.round(m.clear * 10) / 10) + ' px';
    }, P.page);
    // the template of level 1 is judged above (box height): here its plates, clearance and fit, and all numbers of the others
    var bad = m.templates.filter(function (t) { return (t.name !== m.layoutName && t.minBox < MIN_BOX) || t.plate < MIN_PLATE || t.clear < 0 || t.outside.length; });
    await check('layout ' + tag + ': every layout template (' + m.templates.map(function (t) { return t.name + ' box ' + (Math.round(t.minBox * 10) / 10); }).join(', ') + ') fits: boxes >= ' + MIN_BOX + ' px, plates >= ' + MIN_PLATE + ' px, clear of the belt', function () {
      return bad.length ? bad.map(function (t) { return t.name + ': box ' + (Math.round(t.minBox * 10) / 10) + ', plate ' + (Math.round(t.plate * 10) / 10) + ', clear ' + (Math.round(t.clear * 10) / 10) + (t.outside.length ? ', outside ' + t.outside.join(',') : ''); }).join(' ;; ') : true;
    }, P.page);
    await check('layout ' + tag + ': no console or page error while measuring', function () {
      var p = problems(P);
      return p.length ? p.slice(0, 3).join(' ;; ') : true;
    }, P.page);
    await P.ctx.close();
  }
  console.log('  measured smallest box (px) / plate (px) per viewport: ' + table.map(function (r) { return r.tag + ' ' + (Math.round(r.m.minBox * 10) / 10) + ' / ' + (Math.round(r.m.plate * 10) / 10); }).join(',  '));
  return table;
}

// ---------------------------------------------------------------------------------------------- preview
// a screenshot with pieces on the belt when the real play did not produce one: runs level 1 until the belt carries pieces
async function previewFallback(browser, base, haveLevels) {
  var P = await openPage(browser, base, { w: 390, h: 844, mobile: true, dsf: 2 });
  try {
    if (process.env.DEV_GEN_LEVELS) await devLevels(P.page);
    else if (!haveLevels) await P.page.evaluate(function (fx) { window.PlateLoop.levels = fx; }, uiSpec.FIXTURES);
    var r = await intoPlay(P.page, '#btn-play');
    if (r !== true) return null;
    var buf = null;
    await playRound(P, {
      poll: async function (st) { if (!buf && st.belt >= 2) { await P.page.waitForTimeout(250); buf = await P.page.screenshot(); } }
    });
    return buf;
  } finally { await P.ctx.close(); }
}

// ---------------------------------------------------------------------------------------------- main
(async function main() {
  var t0 = Date.now(), srv = null, browser = null, crashed = null;
  fs.mkdirSync(ART_DIR, { recursive: true });
  fs.readdirSync(ART_DIR).forEach(function (f) { if (/\.png$/.test(f)) fs.unlinkSync(path.join(ART_DIR, f)); });
  try {
    srv = await serveMod.serve(GAME_DIR);
    browser = await launchChrome();
    var base = srv.url;

    await stepBoot(browser, base);

    // 2: ui.spec (it empties tests/browser/artifacts/ of *.png first: keep what was written so far)
    console.log('ui.spec (UI and kit checks on fixture levels)');
    var kept = fs.readdirSync(ART_DIR).filter(function (f) { return /\.png$/.test(f); }).map(function (f) { return [f, fs.readFileSync(path.join(ART_DIR, f))]; });
    var ui = await uiSpec.run({ browser: browser, url: base, ok: function (cond, msg) { ok(cond, msg); } });
    kept.forEach(function (k) { fs.writeFileSync(path.join(ART_DIR, k[0]), k[1]); });
    await check('ui.spec: ran ' + ui.checks + ' checks and none failed', function () {
      return ui.checks > 0 && ui.failed === 0 ? true : ui.failed + ' of ' + ui.checks + ' failed';
    });
    // 2b: scene.spec (the picture matches the engine on cw and ccw fixtures; needs scene.platePoint / mouthPoint / staged)
    console.log('scene.spec (plates drawn where the engine says, ejects onto the plate at the mouth)');
    var sceneBefore = failed, sceneTotal = total;
    try { await sceneSpec.run({ browser: browser, url: base, ok: function (cond, msg) { ok(cond, msg); } }); }
    catch (e) { ok(false, 'scene.spec crashed: ' + clean(e)); }
    note('scene.spec: ' + (total - sceneTotal) + ' checks, ' + (failed - sceneBefore) + ' failed');
    // 4: the lose card is played by ui.spec on a fixture: reuse its result
    await check('lose card: shown on the jam fixture (result of the ui.spec check "lose: ..." reused)', function () {
      var l = ui.results.filter(function (r) { return /^lose: tapping the jam fixture/.test(r.name); });
      if (!l.length) return 'ui.spec has no lose check any more';
      return l[0].ok ? true : l[0].detail;
    });

    // 3: the real levels
    var preview = {};
    var played = await stepPlay(browser, base, preview);

    // 5: layout
    await stepLayout(browser, base, played);

    // 6: preview
    console.log('preview');
    var buf = preview.buf;
    if (!buf) { try { buf = await previewFallback(browser, base, played); } catch (e) { note('preview fallback failed: ' + clean(e)); } }
    await check('preview: a mid-level screenshot with pieces on the belt was taken', function () { return buf ? true : 'no screenshot'; });
    if (buf) {
      fs.writeFileSync(path.join(ART_DIR, 'game-play.png'), buf);
      var target = path.join(PREVIEW_DIR, 'game-play.png');
      if (process.env.UPDATE_PREVIEW === '1' || !fs.existsSync(target)) {
        fs.mkdirSync(PREVIEW_DIR, { recursive: true });
        fs.writeFileSync(target, buf);
        console.log('  wrote ' + path.relative(GAME_DIR, target));
      } else console.log('  docs/preview/game-play.png exists (UPDATE_PREVIEW=1 replaces it); wrote tests/browser/artifacts/game-play.png');
    }
  } catch (e) {
    crashed = e;
    ok(false, 'the suite crashed: ' + clean(e));
    console.log(String(e && e.stack || e).split('\n').slice(0, 8).join('\n'));
  } finally {
    if (browser) await browser.close().catch(function () {});
    if (srv) await srv.close();
  }
  var secs = Math.round((Date.now() - t0) / 100) / 10;
  console.log('\n' + total + ' checks, ' + (total - failed) + ' ok, ' + failed + ' failed' + (skipped ? ', ' + skipped + ' skipped' : '') + ' (' + secs + ' s)');
  failures.forEach(function (f) { console.log('  FAIL ' + f); });
  if (failed) console.log('screenshots: ' + ART_DIR);
  process.exit(failed || crashed ? 1 : 0);
})();
