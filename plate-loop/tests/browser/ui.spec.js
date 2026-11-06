// tests/browser/ui.spec.js: the UI and arcade-kit integration of Plate Loop in headless Chrome (GAME-SPEC 15).
// Run from the game folder: node tests/browser/ui.spec.js   (exit code 1 on any failure; "ok" / "FAIL" lines)
//
// The 100 fixed levels and the generator may not exist yet, so the suite injects three small fixture levels as
// window.PlateLoop.levels after the title is up (before Play is pressed):
//   1  one tap wins (L1 [0,0,0] + L2 [0], N 6), tier easy
//   2  the same with a covered piece (brings the "covered" how-to card), tier normal; two taps (the covered piece needs its own)
//   3  a lose fixture (N 4, four full boxes, interleaved kinds): a few taps jam the belt, tier hard
// The first win is played in real time with real pointer events; later waits fast-forward the simulation with
// PlateLoop.sim.tick (the main loop picks the finished status up as it would anyway).
// Every failing check writes a screenshot to tests/browser/artifacts/.
'use strict';
var fs = require('fs');
var path = require('path');
var serveMod = require('./serve.js');
var launchChrome = require('../../../tests/chrome.js').launchChrome;

var GAME_DIR = path.resolve(__dirname, '..', '..');
var ART_DIR = path.join(__dirname, 'artifacts');
var PKG = JSON.parse(fs.readFileSync(path.join(GAME_DIR, 'package.json'), 'utf8'));

// 404s that are expected while the generator / levels are not in the tree yet
var KNOWN_404 = ['src/gen/solver.js', 'src/gen/bot.js', 'src/gen/generator.js', 'src/levels/levels-001-100.js'];

var FIXTURES = [
  { id: 1, tier: 'easy', seed: 1, layout: 'ring-2col', dir: 'cw', N: 6, kinds: 1,
    boxes: [{ id: 'L1', pieces: [0, 0, 0] }, { id: 'L2', pieces: [0] }] },
  { id: 2, tier: 'normal', seed: 2, layout: 'ring-2col', dir: 'cw', N: 6, kinds: 1,
    boxes: [{ id: 'L1', pieces: ['h:0', 0, 0] }, { id: 'L2', pieces: [0] }] },
  { id: 3, tier: 'hard', seed: 3, layout: 'ring-2col', dir: 'cw', N: 4, kinds: 4,
    boxes: [{ id: 'L1', pieces: [1, 3, 2, 1] }, { id: 'L2', pieces: [1, 3, 2, 0] }, { id: 'L3', pieces: [2, 3, 0, 2] }, { id: 'L4', pieces: [3, 1, 0, 0] }] }
];
var LOSE_TAPS = [1, 3, 3, 1];

var VIEWPORTS = [
  { w: 360, h: 640, mobile: true, dsf: 2 }, { w: 390, h: 844, mobile: true, dsf: 2 }, { w: 430, h: 932, mobile: true, dsf: 2 },
  { w: 768, h: 1024, mobile: false, dsf: 1 }, { w: 1280, h: 800, mobile: false, dsf: 1 }
];

// ---------------------------------------------------------------------------------------------- reporting
var results = [], notes = [], current = null, shotN = 0, okSink = null;   // okSink: the caller's ok(cond, msg) when run() is used as a module
function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70); }
function note(s) { notes.push(s); console.log('note ' + s); }

async function shot(page, name) {
  if (!page || page.isClosed()) return;
  try {
    fs.mkdirSync(ART_DIR, { recursive: true });
    await page.screenshot({ path: path.join(ART_DIR, String(++shotN).padStart(2, '0') + '-' + slug(name) + '.png') });
  } catch (e) { /* the page may be gone */ }
}

// ck(name, fn, page): fn returns true / undefined (pass), false or a string (fail, the string is the detail), or throws
async function ck(name, fn, page) {
  var detail = null;
  try {
    var r = await fn();
    if (r === false) detail = 'returned false';
    else if (typeof r === 'string') detail = r;
  } catch (e) { detail = 'threw: ' + String(e && e.message || e).replace(/\x1b\[[0-9;]*m/g, '').split('\n').slice(0, 12).join(' / '); }
  var ok = detail === null;
  results.push({ name: name, ok: ok, detail: detail });
  if (okSink) okSink(ok, name + (ok ? '' : ': ' + detail));
  else console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : ': ' + detail));
  if (!ok) await shot(page || current, name);
  return ok;
}
function eq(actual, expected, what) {
  return actual === expected ? true : (what || 'value') + ': expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual);
}
function has(text, part, what) {
  return String(text).indexOf(part) >= 0 ? true : (what || 'text') + ': expected to contain ' + JSON.stringify(part) + ', got ' + JSON.stringify(String(text).slice(0, 120));
}

// ---------------------------------------------------------------------------------------------- page helpers
async function openPage(browser, base, o) {
  o = o || {};
  var ctx = await browser.newContext({
    viewport: { width: o.w || 390, height: o.h || 844 }, deviceScaleFactor: o.dsf || 1,
    isMobile: !!o.mobile, hasTouch: !!o.mobile, locale: o.locale || 'en-US', acceptDownloads: false
  });
  // wraps Arcade.screen before the game boots (the DOMContentLoaded listener of this script is registered first)
  await ctx.addInitScript(function () {
    window.__screens = [];
    document.addEventListener('DOMContentLoaded', function () {
      var A = window.Arcade;
      if (!A || typeof A.screen !== 'function' || A.screen.__wrapped) return;
      var orig = A.screen;
      var wrapped = function (name) { window.__screens.push(name); return orig.apply(this, arguments); };
      wrapped.__wrapped = true;
      A.screen = wrapped;
    });
  });
  var page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  var P = { page: page, ctx: ctx, base: base, consoleErrors: [], pageErrors: [], failedReqs: [], badResponses: [], warnings: [] };
  page.on('console', function (m) {
    var loc = m.location() || {};
    if (m.type() === 'error') P.consoleErrors.push({ text: m.text(), url: loc.url || '' });
    else if (m.type() === 'warning') P.warnings.push(m.text());
  });
  page.on('pageerror', function (e) { P.pageErrors.push(String(e && e.message || e)); });
  page.on('requestfailed', function (r) { P.failedReqs.push(r.url() + ' ' + ((r.failure() || {}).errorText || '')); });
  page.on('response', function (r) { if (r.status() >= 400) P.badResponses.push({ url: r.url(), status: r.status() }); });
  current = page;
  await loadGame(P);
  if (!o.keepSheet) await dismissKit(page);
  return P;
}

async function loadGame(P, reload) {
  if (reload) await P.page.reload(); else await P.page.goto(P.base);
  await P.page.waitForFunction(function () { return window.PlateLoop && window.PlateLoop.app && window.PlateLoop.app.state === 'TITLE'; }, null, { timeout: 15000 });
  await injectLevels(P.page);
}
// closes a kit sheet (the changelog card) that would cover the game and make real clicks fail
async function dismissKit(page) {
  // "Got it" marks the version as seen (closeSheet alone lets the card come back on the next title moment)
  for (var i = 0; i < 3; i++) {
    var b = await page.$('#arcade-ui [role=dialog] .arcade-btn.primary') || await page.$('#arcade-ui [role=dialog] .arcade-btn');
    if (!b) break;
    try { await b.click({ timeout: 1500 }); } catch (e) { break; }
    await page.waitForTimeout(80);
  }
  await page.evaluate(function () { if (window.Arcade.sheetOpen()) window.Arcade.closeSheet(); });
}
// click that first clears kit cards (changelog, app hint, campaigns) which can pop up over the game at any title moment
async function cl(page, sel) { await dismissKit(page); return page.click(sel); }
function injectLevels(page) {
  return page.evaluate(function (fx) { window.PlateLoop.levels = fx; }, FIXTURES);
}
function state(page) { return page.evaluate(function () { return window.PlateLoop.app.state; }); }
async function waitState(page, want, ms) {
  try {
    await page.waitForFunction(function (w) { return window.PlateLoop.app.state === w; }, want, { timeout: ms || 4000 });
    return true;
  } catch (e) { return 'state: expected ' + want + ', got ' + await state(page); }
}
async function isShown(page, sel) {
  return page.evaluate(function (s) {
    var e = document.querySelector(s);
    return !!(e && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
  }, sel);
}
async function waitShown(page, sel, ms) {
  try { await page.waitForSelector(sel, { state: 'visible', timeout: ms || 4000 }); return true; } catch (e) { return sel + ' did not show'; }
}
function text(page, sel) { return page.evaluate(function (s) { var e = document.querySelector(s); return e ? e.textContent.trim() : null; }, sel); }
function saveOf(page) {
  return page.evaluate(function () { try { return JSON.parse(localStorage.getItem('plateLoop.save')); } catch (e) { return null; } });
}
function str(page, lang, key, vars) {
  return page.evaluate(function (a) {
    var s = window.PlateLoop.strings[a.lang][a.key] || '';
    if (a.vars) s = s.replace(/\{(\w+)\}/g, function (m, n) { return a.vars[n] === undefined ? m : a.vars[n]; });
    return s;
  }, { lang: lang, key: key, vars: vars });
}
function arcadeCurrent(page) { return page.evaluate(function () { return window.Arcade.current(); }); }
async function boxPoint(page, i) {
  await page.waitForFunction(function (idx) { var a = window.PlateLoop.app; return a.scene && a.scene.boxRect(idx) && a.scene.layout(); }, i, { timeout: 4000 });
  return page.evaluate(function (idx) {
    var sc = window.PlateLoop.app.scene, c = document.getElementById('board').getBoundingClientRect();
    var L = sc.layout(), r = sc.boxRect(idx);
    return { x: c.left + L.ox + (r.x + r.w / 2) * L.scale, y: c.top + L.oy + (r.y + r.h / 2) * L.scale };
  }, i);
}
// a real pointer tap (move, down, up) on the box with the given index
async function tapBox(page, i) {
  var p = await boxPoint(page, i);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.up();
}
// fast-forwards in 100 ms steps until the box has no pending departures (a tap on a pending box is refused) or the level is decided
function settleBox(page, i) {
  return page.evaluate(function (idx) {
    var a = window.PlateLoop.app, n = 0;
    while (a.sim && a.sim.status === 'play' && a.sim.state.boxes[idx].pending > 0 && n++ < 100) {
      for (var k = 0; k < 6; k++) window.PlateLoop.sim.tick(a.sim, 16);
    }
    return a.sim ? a.sim.state.boxes[idx].pending : null;
  }, i);
}
// advances the simulation by ms in 16 ms ticks (stops when the level is decided); returns the status
function ffwd(page, ms) {                           // steps the real game frame (app.step: tick, events, render, no scheduling), so the replay recording sees every frame
  return page.evaluate(function (total) {
    var a = window.PlateLoop.app, done = 0;
    while (a.sim && done < total && a.sim.status === 'play') { a.step(16); done += 16; }
    return a.sim ? a.sim.status : null;
  }, ms);
}
async function winFixture(page, box) {            // real tap(s) on the box, then fast-forward until the win card shows
  var id = await page.evaluate(function () { return window.PlateLoop.app.level.id; });
  await tapBox(page, box || 0);
  if (id === 2) {                                  // a hidden piece never joins a run (R5): it is revealed by the first tap and needs its own
    await settleBox(page, box || 0);
    await tapBox(page, box || 0);
  }
  await ffwd(page, 30000);
  return waitShown(page, '#card-win', 4000);
}
async function loseFixture(page) {                // real taps in a fixed order, fast-forward in between, until the lose card shows
  for (var i = 0; i < 40; i++) {
    var s = await page.evaluate(function () { return window.PlateLoop.app.sim ? window.PlateLoop.app.sim.status : null; });
    if (s !== 'play') break;
    var b = LOSE_TAPS[i % LOSE_TAPS.length];
    await settleBox(page, b);
    await tapBox(page, b);
    await ffwd(page, 700);
  }
  return waitShown(page, '#card-lose', 4000);
}
async function playThrough(page, n) {             // from the title to the PLAY state of the continuing level (how-to cards confirmed)
  await cl(page, '#btn-play');
  for (var i = 0; i < 12; i++) {
    var s = await state(page);
    if (s === 'PLAY') return true;
    if (s === 'HOWTO') { await cl(page, '#howto-next'); continue; }
    await page.waitForTimeout(100);
  }
  return 'did not reach PLAY, state ' + await state(page);
}
async function toLevel(page, id) {                // title -> play level id of the fixtures (needs save.level == id)
  var r = await playThrough(page, id);
  return r;
}

// ---------------------------------------------------------------------------------------------- layout measuring (in the page)
function measureInPage(label) {
  var vw = window.innerWidth, vh = window.innerHeight, tol = 0.6, out = [];
  function vis(e) {
    if (!e.getClientRects().length) return false;
    var cs = getComputedStyle(e);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity) > 0.01;
  }
  function nm(e) { return (e.id ? '#' + e.id : e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : '')); }
  function inside(r, o, tl) { return r.left >= o.left - tl && r.top >= o.top - tl && r.right <= o.right + tl && r.bottom <= o.bottom + tl; }
  var vp = { left: 0, top: 0, right: vw, bottom: vh };
  var sel = '#app button, #app .card, #app .band, #app .pill, #app canvas#board, #app .logo, #app .name, #app .sub, #app .title-foot span, #app .lead, #app h2';
  var list = Array.prototype.filter.call(document.querySelectorAll(sel), vis);
  var buttons = [];
  list.forEach(function (e) {
    var r = e.getBoundingClientRect();
    if (!inside(r, vp, tol)) out.push(label + ': ' + nm(e) + ' outside the viewport (' + Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.right) + ',' + Math.round(r.bottom) + ' in ' + vw + 'x' + vh + ')');
    if (e.tagName === 'BUTTON') {
      buttons.push(e);
      if (r.height < 43.99) out.push(label + ': button ' + nm(e) + ' is ' + r.height.toFixed(1) + ' px tall (< 44)');
      var card = e.closest('.card');
      if (card && !inside(r, card.getBoundingClientRect(), tol)) out.push(label + ': button ' + nm(e) + ' sticks out of its card (card scrolls or clips)');
    }
    if (e.classList.contains('card') && e.scrollHeight > e.clientHeight + 1) out.push(label + ': card ' + nm(e) + ' scrolls (' + e.scrollHeight + ' > ' + e.clientHeight + ')');
  });
  function layer(b) { return b.closest('.card') || document; }
  for (var i = 0; i < buttons.length; i++) for (var j = i + 1; j < buttons.length; j++) {
    if (buttons[i].contains(buttons[j]) || buttons[j].contains(buttons[i]) || layer(buttons[i]) !== layer(buttons[j])) continue;
    var a = buttons[i].getBoundingClientRect(), b = buttons[j].getBoundingClientRect();
    var ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (ox > 1 && oy > 1) out.push(label + ': buttons ' + nm(buttons[i]) + ' and ' + nm(buttons[j]) + ' overlap');
  }
  var pill = document.getElementById('pill'), pause = document.getElementById('btn-pause'), wrap = document.getElementById('board-wrap'), cv = document.getElementById('board');
  if (pill && pause && vis(pill) && vis(pause)) {
    var pr = pill.getBoundingClientRect(), qr = pause.getBoundingClientRect();
    if (Math.min(pr.right, qr.right) - Math.max(pr.left, qr.left) > 0 && Math.min(pr.bottom, qr.bottom) - Math.max(pr.top, qr.top) > 0) out.push(label + ': level pill and pause button overlap');
  }
  if (cv && vis(cv)) {
    var cr = cv.getBoundingClientRect(), wr = wrap.getBoundingClientRect(), band = document.querySelector('.band').getBoundingClientRect();
    if (!inside(cr, wr, tol)) out.push(label + ': canvas overflows its wrap');
    if (cr.top < band.bottom - tol) out.push(label + ': canvas runs under the HUD band');
    if (Math.abs(cv.clientWidth - cr.width) > 1) out.push(label + ': canvas client width differs from its box');
  }
  var de = document.documentElement;
  if (de.scrollWidth > vw + 1 || de.scrollHeight > vh + 1) out.push(label + ': the page scrolls (' + de.scrollWidth + 'x' + de.scrollHeight + ' in ' + vw + 'x' + vh + ')');
  return out;
}

// ---------------------------------------------------------------------------------------------- scenario A: the main flow
async function scenarioMain(browser, base) {
  var P = await openPage(browser, base, { w: 390, h: 844, mobile: true, dsf: 1, keepSheet: true });
  var page = P.page, i;

  // ---- boot
  await ck('boot: the page reaches the TITLE state with no console error, page error or failed request', function () {
    if (P.consoleErrors.some(function (e) { return !KNOWN_404.some(function (k) { return e.url.indexOf(k) >= 0; }); })) return 'console errors: ' + JSON.stringify(P.consoleErrors.slice(0, 3));
    if (P.pageErrors.length) return 'page errors: ' + P.pageErrors.join(' | ');
    var rf = P.failedReqs.filter(function (u) { return !KNOWN_404.some(function (k) { return u.indexOf(k) >= 0; }); });
    if (rf.length) return 'failed requests: ' + rf.join(' | ');
    return true;
  });
  await ck('boot: no 4xx response except the known missing generator / level files', function () {
    var bad = P.badResponses.filter(function (r) { return !(r.status === 404 && KNOWN_404.some(function (k) { return r.url.indexOf(k) >= 0; })); });
    var known = P.badResponses.filter(function (r) { return bad.indexOf(r) < 0; }).map(function (r) { return r.url.replace(base, ''); });
    if (known.length) note('known 404s tolerated (not in the tree yet): ' + known.join(', '));
    return bad.length ? 'unexpected: ' + bad.map(function (r) { return r.status + ' ' + r.url; }).join(' | ') : true;
  });
  await ck('boot: PlateLoop.app.state is TITLE and assets.failed is empty', async function () {
    var r = await page.evaluate(function () { var a = window.PlateLoop.app; return { s: a.state, f: a.assets && a.assets.failed }; });
    if (r.s !== 'TITLE') return 'state ' + r.s;
    return r.f && r.f.length === 0 ? true : 'assets.failed = ' + JSON.stringify(r.f);
  });
  await ck('kit: the loading screen is gone after Arcade.ready', async function () {
    try { await page.waitForFunction(function () { return !document.querySelector('.arcade-loading') && !window.Arcade.loading.visible(); }, null, { timeout: 2500 }); return true; }
    catch (e) { return 'the loading screen is still there'; }
  });
  // BUG: audio.js persists plateLoop.save / plateLoop.sound while the game boots, so the kit sees a returning player and opens the changelog on the very first visit
  await ck('kit: the first visit opens no kit sheet or card over the title (changelog only for returning players)', async function () {
    var r = await page.evaluate(function () { return { open: window.Arcade.sheetOpen(), keys: Object.keys(localStorage).filter(function (k) { return k.indexOf('plateLoop.') === 0; }) }; });
    return r.open === false ? true : 'a kit sheet is open on the first visit (the game had already written ' + r.keys.join(', ') + ' before the title)';
  });
  await dismissKit(page);
  await ck('kit: Arcade.current() is "title" and the language follows the browser (en)', async function () {
    var r = await page.evaluate(function () { return [window.Arcade.current(), window.Arcade.lang.get(), document.documentElement.lang]; });
    return eq(r.join(','), 'title,en,en');
  });
  await ck('manifest: linked, served, with 192 and 512 icons that load', async function () {
    var r = await page.evaluate(async function () {
      var href = document.querySelector('link[rel=manifest]').getAttribute('href');
      var m = await (await fetch(href)).json();
      var sizes = (m.icons || []).map(function (i) { return i.sizes; });
      var okImgs = await Promise.all((m.icons || []).map(function (i) { return fetch(i.src).then(function (x) { return x.status; }); }));
      return { sizes: sizes, st: okImgs, start: m.start_url, scope: m.scope, display: m.display };
    });
    if (r.sizes.indexOf('192x192') < 0 || r.sizes.indexOf('512x512') < 0) return 'icons ' + r.sizes;
    if (r.st.some(function (s) { return s !== 200; })) return 'icon statuses ' + r.st;
    return r.start === './' && r.scope === './' ? true : 'start_url / scope ' + r.start + ' ' + r.scope;
  });

  // ---- title structure (GAME-SPEC 5)
  await ck('title: logo image loaded and the name "Plate Loop"', async function () {
    var r = await page.evaluate(function () { var l = document.getElementById('logo-img'); return { w: l.naturalWidth, vis: !!l.getClientRects().length, name: document.querySelector('.name').textContent.replace(/\s+/g, ' ').trim() }; });
    if (!r.w || !r.vis) return 'logo not loaded or not visible';
    return eq(r.name, 'Plate Loop');
  });
  await ck('title: primary play button "Start" and the secondary Endless button', async function () {
    if (!(await isShown(page, '#btn-play')) || !(await isShown(page, '#btn-endless'))) return 'play or endless not visible';
    return eq(await text(page, '#play-label'), await str(page, 'en', 'play_start'));
  });
  await ck('title: chip row with how-to and settings', async function () {
    var n = await page.evaluate(function () { return document.querySelectorAll('.chips .chip').length; });
    if (n < 2) return 'only ' + n + ' chips';
    return (await isShown(page, '#chip-howto')) && (await isShown(page, '#chip-settings')) ? true : 'a chip is hidden';
  });
  await ck('title: the way home is a visible data-arcade="home" button with a bilingual label', async function () {
    var r = await page.evaluate(function () { var h = document.querySelector('#screen-title [data-arcade="home"]'); return h ? { tag: h.tagName, vis: !!h.getClientRects().length, aria: h.getAttribute('aria-label') } : null; });
    if (!r) return 'no home element';
    if (!r.vis) return 'home hidden by the kit';
    return r.aria && /All games/i.test(r.aria) ? true : 'aria-label ' + r.aria;
  });
  await ck('title: footer shows the version of package.json', async function () {
    return has(await text(page, '.title-foot'), PKG.version, 'footer');
  });
  await ck('title: no news chip and no backup buttons on the title (kit owns them)', async function () {
    var n = await page.evaluate(function () { return document.querySelectorAll('#screen-title [data-arcade="news"], #screen-title [data-arcade^="backup"]').length; });
    return n === 0 ? true : n + ' news / backup elements on the title';
  });

  // ---- how-to before level 1
  await cl(page, '#btn-play');
  await ck('howto: the how-to card shows before level 1 (state HOWTO, "The belt", one page, "Got it")', async function () {
    var r = await waitState(page, 'HOWTO'); if (r !== true) return r;
    if ((r = await waitShown(page, '#card-howto')) !== true) return r;
    var h = await text(page, '#howto-h'), n = await page.evaluate(function () { return document.querySelectorAll('#howto-dots i').length; });
    if (h !== await str(page, 'en', 'h_basics_t')) return 'title ' + h;
    if (n > 1) return n + ' dots for a one page card';
    if (await isShown(page, '#howto-prev')) return 'prev shown on the first page';
    return eq(await text(page, '#howto-next'), await str(page, 'en', 'gotit'));
  });
  await ck('howto: reported to the kit as "menu"', async function () { return eq(await arcadeCurrent(page), 'menu'); });
  await cl(page, '#howto-next');
  await ck('howto: "Got it" starts level 1 (state PLAY, card gone, pill "Level 1", tier easy)', async function () {
    var r = await waitState(page, 'PLAY'); if (r !== true) return r;
    if (await isShown(page, '#card-howto')) return 'the card is still visible';
    var p = await page.evaluate(function () { var e = document.getElementById('pill'); return [e.textContent.trim(), e.getAttribute('data-tier')]; });
    return eq(p.join('|'), 'Level 1|easy');
  });
  await ck('howto: shown cards are stored in the save (seen.howto has "basics")', async function () {
    var s = await saveOf(page);
    return s && s.seen && s.seen.howto.indexOf('basics') >= 0 ? true : 'save = ' + JSON.stringify(s);
  });
  await loadGame(P, true);
  await cl(page, '#btn-play');
  await ck('howto: after a reload the card does not come back (straight to PLAY)', async function () {
    var r = await waitState(page, 'PLAY', 3000);
    if (r !== true) return r + ' (the how-to card showed again)';
    return (await isShown(page, '#card-howto')) ? 'card visible' : true;
  });

  // ---- level 1: a real pointer tap wins, in real time
  var t0 = Date.now();
  await tapBox(page, 0);
  var won = await waitShown(page, '#card-win', 30000);
  var took = Date.now() - t0;
  await ck('play: a real pointer tap on the box wins the fixture in real time, win card shows (' + Math.round(took / 100) / 10 + ' s)', function () {
    return won;
  });
  await ck('win: card text "Level 1 cleared", title, state WIN, reported as "win"', async function () {
    if (await state(page) !== 'WIN') return 'state ' + await state(page);
    if (await text(page, '#win-h') !== await str(page, 'en', 'win_title')) return 'title ' + await text(page, '#win-h');
    var c = await arcadeCurrent(page); if (c !== 'win') return 'Arcade.current() = ' + c;
    return eq(await text(page, '#win-text'), await str(page, 'en', 'win_level', { n: 1 }));
  });
  await ck('win: share button (data-arcade="share") visible with a label, Arcade.share line set', async function () {
    var r = await page.evaluate(function () {
      var b = document.querySelector('#card-win [data-arcade="share"]');
      return { vis: !!(b && b.getClientRects().length), label: b ? b.textContent.trim() : '', line: window.Arcade.share.context().line, text: window.Arcade.share.text() };
    });
    if (!r.vis) return 'the share button is hidden or missing';
    if (!r.label) return 'the share button has no label';
    if (r.line !== 'Level 1 cleared') return 'share line ' + JSON.stringify(r.line);
    return has(r.text, 'Level 1 cleared', 'share text');
  });
  await ck('win: "Watch replay" replays the recorded round (state REPLAY, replay pill) and reproduces the win, then the card comes back', async function () {
    if (!(await isShown(page, '#win-watch'))) return 'the watch button is hidden';
    await cl(page, '#win-watch');
    var r = await waitState(page, 'REPLAY', 3000); if (r !== true) return r;
    var pill = await text(page, '#pill');
    if (!/Replay/.test(pill)) return 'pill during the replay: ' + pill;
    if (await isShown(page, '#card-win')) return 'the win card is still shown during the replay';
    // the replay runs at real speed (a short round): wait for it to end on its own
    try { await page.waitForFunction(function () { return window.PlateLoop.app.state === 'WIN'; }, null, { timeout: 45000 }); } catch (e) { return 'the replay did not end, state ' + await state(page); }
    var after = await page.evaluate(function () { var a = window.PlateLoop.app; return [a.sim.status, document.getElementById('pill').textContent.trim()]; });
    if (after[0] !== 'won') return 'the replay did not reproduce the win: sim ' + after[0];
    if (!/Level 1/.test(after[1])) return 'pill after the replay: ' + after[1];
    return (await isShown(page, '#card-win')) ? true : 'the win card did not come back';
  });
  await ck('win: the star marks level 1 as a favourite (save.favs)', async function () {
    if (!(await isShown(page, '#win-fav'))) return 'the star is hidden';
    await cl(page, '#win-fav');
    if ((await page.getAttribute('#win-fav', 'aria-pressed')) !== 'true') return 'the star did not light up';
    var s = await saveOf(page);
    return s && s.favs && s.favs.length === 1 && s.favs[0].level === 1 ? true : 'save.favs = ' + JSON.stringify(s && s.favs);
  });
  await ck('win: pressing share does not throw (clipboard / share fallbacks)', async function () {
    var before = P.pageErrors.length;
    await cl(page, '#card-win [data-arcade="share"]');
    await page.waitForTimeout(400);
    return P.pageErrors.length === before ? true : 'page error: ' + P.pageErrors.slice(before).join(' | ');
  });
  await ck('win: the save moves on (save.level = 2) and the win card has next / replay / title', async function () {
    var s = await saveOf(page);
    if (!s || s.level !== 2) return 'save.level = ' + (s && s.level);
    return (await isShown(page, '#win-next')) && (await isShown(page, '#win-replay')) && (await isShown(page, '#win-title')) ? true : 'a win button is hidden';
  });

  // ---- next level brings a new mechanic's how-to
  await cl(page, '#win-next');
  await ck('howto: next level shows the how-to for its new mechanic ("Covered") only', async function () {
    var r = await waitState(page, 'HOWTO'); if (r !== true) return r;
    var n = await page.evaluate(function () { return document.querySelectorAll('#howto-dots i').length; });
    if (n > 1) return 'cards with ' + n + ' pages (basics must not repeat)';
    return eq(await text(page, '#howto-h'), await str(page, 'en', 'h_hidden_t'));
  });
  await cl(page, '#howto-next');
  await ck('play: level 2 pill "Level 2" in the normal tier colour', async function () {
    var r = await waitState(page, 'PLAY'); if (r !== true) return r;
    var p = await page.evaluate(function () { var e = document.getElementById('pill'); return [e.textContent.trim(), e.getAttribute('data-tier')]; });
    return eq(p.join('|'), 'Level 2|normal');
  });

  // ---- pause
  await ck('pause: the pause button opens the pause card (state PAUSE, reported "pause", resume / restart / quit)', async function () {
    await cl(page, '#btn-pause');
    var r = await waitState(page, 'PAUSE'); if (r !== true) return r;
    if ((r = await waitShown(page, '#card-pause')) !== true) return r;
    if ((await arcadeCurrent(page)) !== 'pause') return 'Arcade.current() = ' + await arcadeCurrent(page);
    return (await isShown(page, '#pause-resume')) && (await isShown(page, '#pause-restart')) && (await isShown(page, '#pause-quit')) ? true : 'a pause button is hidden';
  });
  await ck('pause: the simulation clock stands still while paused', async function () {
    var t1 = await page.evaluate(function () { return window.PlateLoop.app.sim.time; });
    await page.waitForTimeout(500);
    var t2 = await page.evaluate(function () { return window.PlateLoop.app.sim.time; });
    return t1 === t2 ? true : 'sim.time ran on: ' + t1 + ' -> ' + t2;
  });
  await ck('pause: resume continues (state PLAY, card gone, clock runs, reported "play")', async function () {
    await cl(page, '#pause-resume');
    var r = await waitState(page, 'PLAY'); if (r !== true) return r;
    if (await isShown(page, '#card-pause')) return 'card still visible';
    var t1 = await page.evaluate(function () { return window.PlateLoop.app.sim.time; });
    await page.waitForTimeout(400);
    var t2 = await page.evaluate(function () { return window.PlateLoop.app.sim.time; });
    if (!(t2 > t1)) return 'clock did not run';
    return eq(await arcadeCurrent(page), 'play');
  });
  await ck('pause: Escape pauses and Escape resumes', async function () {
    await page.keyboard.press('Escape');
    var r = await waitState(page, 'PAUSE', 2000); if (r !== true) return 'Escape: ' + r;
    await page.keyboard.press('Escape');
    return waitState(page, 'PLAY', 2000);
  });
  await ck('pause: the tab going hidden (visibilitychange) pauses the game', async function () {
    await page.evaluate(function () {
      Object.defineProperty(document, 'hidden', { configurable: true, get: function () { return true; } });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    var r = await waitState(page, 'PAUSE', 2000);
    await page.evaluate(function () { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
    return r;
  });
  await ck('pause: how-to from the pause card, Escape returns to the pause card', async function () {
    await cl(page, '#pause-howto');
    var r = await waitShown(page, '#card-howto'); if (r !== true) return r;
    var n = await page.evaluate(function () { return document.querySelectorAll('#howto-dots i').length; });
    if (n < 7) return 'the pause how-to shows ' + n + ' pages, expected all 7 mechanics';
    await page.keyboard.press('Escape');
    return waitShown(page, '#card-pause', 2000);
  });
  await ck('pause: restart restarts the level (fresh clock, same level, state PLAY)', async function () {
    await page.waitForTimeout(300);
    var before = await page.evaluate(function () { return window.PlateLoop.app.attempt; });
    await cl(page, '#pause-restart');
    var r = await waitState(page, 'PLAY'); if (r !== true) return r;
    var a = await page.evaluate(function () { return { id: window.PlateLoop.app.level.id, t: window.PlateLoop.app.sim.time, att: window.PlateLoop.app.attempt }; });
    if (a.id !== 2) return 'level ' + a.id;
    if (a.t > 600) return 'sim.time ' + a.t + ' after a restart';
    if (await isShown(page, '#card-pause')) return 'pause card still visible';
    return a.att === before + 1 ? true : 'attempt ' + before + ' -> ' + a.att;
  });
  await ck('pause: quit goes to the title (state TITLE, title visible, play hidden, reported "title")', async function () {
    await cl(page, '#btn-pause');
    await waitShown(page, '#card-pause');
    await cl(page, '#pause-quit');
    var r = await waitState(page, 'TITLE'); if (r !== true) return r;
    if (!(await isShown(page, '#btn-play'))) return 'title not visible';
    if (await isShown(page, '#screen-play')) return 'play screen still visible';
    return eq(await arcadeCurrent(page), 'title');
  });
  await ck('title: the play button now says "Continue · Level 2"', async function () {
    return eq(await text(page, '#play-label'), await str(page, 'en', 'play_continue', { n: 2 }));
  });

  // ---- level 2 won, level 3 lost
  await playThrough(page);
  await ck('win: level 2 is won by two taps (card "Level 2 cleared")', async function () {
    var r = await winFixture(page, 0); if (r !== true) return r;
    return eq(await text(page, '#win-text'), await str(page, 'en', 'win_level', { n: 2 }));
  });
  await cl(page, '#win-next');
  await ck('play: next level after level 2 is level 3 (hard tier, no how-to card repeats)', async function () {
    var r = await waitState(page, 'PLAY', 3000); if (r !== true) return r;
    var p = await page.evaluate(function () { var e = document.getElementById('pill'); return [e.textContent.trim(), e.getAttribute('data-tier')]; });
    return eq(p.join('|'), 'Level 3|hard');
  });
  await ck('lose: tapping the jam fixture ends in the lose card (state LOSE, reported "lose")', async function () {
    var r = await loseFixture(page); if (r !== true) return r;
    if (await state(page) !== 'LOSE') return 'state ' + await state(page);
    return eq(await arcadeCurrent(page), 'lose');
  });
  await ck('lose: texts, retry button, share line, no endless-only buttons', async function () {
    if (await text(page, '#lose-h') !== await str(page, 'en', 'lose_title')) return 'title ' + await text(page, '#lose-h');
    if (await text(page, '#lose-text') !== await str(page, 'en', 'lose_text')) return 'text ' + await text(page, '#lose-text');
    if (await text(page, '#lose-retry') !== await str(page, 'en', 'retry')) return 'retry label ' + await text(page, '#lose-retry');
    if (!(await isShown(page, '#lose-share'))) return 'share hidden';
    if (await isShown(page, '#lose-modes')) return 'the tier button shows in level mode';
    var line = await page.evaluate(function () { return window.Arcade.share.context().line; });
    return eq(line, await str(page, 'en', 'share_lose', { n: 3 }), 'share line');
  });
  await ck('lose: retry restarts level 3 (state PLAY, attempt 2, pill "Level 3")', async function () {
    await cl(page, '#lose-retry');
    var r = await waitState(page, 'PLAY'); if (r !== true) return r;
    var a = await page.evaluate(function () { return [window.PlateLoop.app.attempt, document.getElementById('pill-text').textContent.trim()]; });
    return a[0] === 2 && a[1] === 'Level 3' ? true : 'attempt/pill ' + a.join('/');
  });
  await cl(page, '#btn-pause'); await cl(page, '#pause-quit'); await waitState(page, 'TITLE');

  // ---- favourites (level 1 was starred on its win card)
  await ck('favourites: the title chip lists the starred level with Play and Remove; Remove empties the list', async function () {
    await cl(page, '#chip-favs');
    var r = await waitShown(page, '#card-favs', 3000); if (r !== true) return r;
    var n = await page.evaluate(function () { return document.querySelectorAll('#favs-list li').length; });
    if (n !== 1) return n + ' entries listed';
    if (!/Level 1/.test(await text(page, '#favs-list .fav-name'))) return 'entry text ' + await text(page, '#favs-list .fav-name');
    await cl(page, '#favs-list [data-act="remove"]');
    var s = await saveOf(page);
    if (!(s && s.favs && s.favs.length === 0)) return 'remove did not work: ' + JSON.stringify(s && s.favs);
    if (!(await isShown(page, '#favs-empty'))) return 'the empty text is missing';
    await cl(page, '#favs-back');
    return waitState(page, 'TITLE', 3000);
  });

  // ---- settings
  await cl(page, '#chip-settings');
  await ck('settings: the card opens from the title (reported "menu"), has sound, graphics, belt, performance and language rows', async function () {
    var r = await waitShown(page, '#card-settings'); if (r !== true) return r;
    if (!(await isShown(page, '#set-plain')) || !(await isShown(page, '#set-belt'))) return 'the graphics or belt row is missing';
    if ((await arcadeCurrent(page)) !== 'menu') return 'Arcade.current() = ' + await arcadeCurrent(page);
    return (await isShown(page, '#set-sound')) && (await isShown(page, '#card-settings [data-arcade="perf"]')) && (await isShown(page, '#card-settings [data-arcade="lang"]')) ? true : 'a settings row is missing';
  });
  await ck('settings: the sound toggle flips, labels itself and persists in plateLoop.save and across a reload', async function () {
    if ((await page.getAttribute('#set-sound', 'aria-pressed')) !== 'true') return 'sound not on by default';
    await cl(page, '#set-sound');
    if ((await page.getAttribute('#set-sound', 'aria-pressed')) !== 'false') return 'aria-pressed did not flip';
    if ((await text(page, '#set-sound-label')) !== await str(page, 'en', 'sound_off')) return 'label ' + await text(page, '#set-sound-label');
    var s = await saveOf(page); if (!s || s.sound !== false) return 'save.sound = ' + (s && s.sound);
    await loadGame(P, true);
    await cl(page, '#chip-settings');
    var r = await page.getAttribute('#set-sound', 'aria-pressed');
    await cl(page, '#set-sound');
    return eq(r, 'false', 'sound after reload');
  });
  await ck('settings: sound back on persists', async function () { var s = await saveOf(page); return eq(s && s.sound, true); });
  await ck('settings: plain graphics force the belt to the stream (row on and disabled); off again frees it; the belt switch flips and persists', async function () {
    await cl(page, '#set-plain');
    if ((await page.getAttribute('#set-plain', 'aria-pressed')) !== 'true') return 'plain not pressed';
    if ((await text(page, '#set-plain-label')) !== await str(page, 'en', 'graphics_plain')) return 'label ' + await text(page, '#set-plain-label');
    if ((await page.getAttribute('#set-belt', 'aria-pressed')) !== 'true' || (await page.getAttribute('#set-belt', 'aria-disabled')) !== 'true') return 'the belt row is not forced to the stream while plain is on';
    if ((await text(page, '#set-belt-label')) !== await str(page, 'en', 'belt_stream')) return 'belt label ' + await text(page, '#set-belt-label');
    var s = await saveOf(page);
    if (!(s && s.plain === true && s.belt === 'plates')) return 'save ' + JSON.stringify({ plain: s && s.plain, belt: s && s.belt });
    await cl(page, '#set-plain');
    if ((await page.getAttribute('#set-belt', 'aria-disabled')) !== 'false' || (await page.getAttribute('#set-belt', 'aria-pressed')) !== 'false') return 'the belt row is not free again';
    await cl(page, '#set-belt');
    if ((await text(page, '#set-belt-label')) !== await str(page, 'en', 'belt_stream')) return 'belt label after the flip ' + await text(page, '#set-belt-label');
    s = await saveOf(page);
    if (!(s && s.plain === false && s.belt === 'stream')) return 'save after the flip ' + JSON.stringify({ plain: s && s.plain, belt: s && s.belt });
    await cl(page, '#set-belt');
    s = await saveOf(page);
    return s && s.belt === 'plates' ? true : 'did not switch back';
  });
  await ck('settings: language switch -> German texts on the title, and back', async function () {
    var deSub = await str(page, 'de', 'title_sub'), enSub = await str(page, 'en', 'title_sub');
    await cl(page, '#card-settings [data-arcade="lang"]');
    await page.waitForTimeout(150);
    if ((await text(page, '.sub')) !== deSub) return 'after switch the sub line is ' + JSON.stringify(await text(page, '.sub'));
    if ((await text(page, '#chip-howto span')) !== await str(page, 'de', 'howto')) return 'chip text ' + await text(page, '#chip-howto span');
    if ((await text(page, '#set-sound-label')) !== await str(page, 'de', 'sound_on')) return 'settings text not German: ' + await text(page, '#set-sound-label');
    if ((await page.evaluate(function () { return document.documentElement.lang; })) !== 'de') return 'html lang not de';
    if ((await text(page, '#play-label')) !== await str(page, 'de', 'play_continue', { n: 3 })) return 'play label ' + await text(page, '#play-label');
    await cl(page, '#card-settings [data-arcade="lang"]');
    await page.waitForTimeout(150);
    return eq(await text(page, '.sub'), enSub, 'sub line after switching back');
  });
  await ck('settings: the language is stored arcade-wide (key "arcade.lang") and survives a reload', async function () {
    await cl(page, '#card-settings [data-arcade="lang"]');            // -> de
    var raw = await page.evaluate(function () { return localStorage.getItem('arcade.lang'); });
    if (!raw || raw.indexOf('de') < 0) return 'arcade.lang = ' + raw;
    var keys = await page.evaluate(function () { return Object.keys(localStorage).filter(function (k) { return /lang/i.test(k) && k.indexOf('arcade.') !== 0; }); });
    if (keys.length) return 'language also stored under a game key: ' + keys.join(',');
    await loadGame(P, true);
    var sub = await text(page, '.sub');
    var ok = sub === await str(page, 'de', 'title_sub');
    await cl(page, '#chip-settings');
    await cl(page, '#card-settings [data-arcade="lang"]');            // -> en
    return ok ? true : 'the title is not German after a reload: ' + sub;
  });
  await ck('settings: performance toggle adds and removes body.arcade-low-perf', async function () {
    var sel = '#card-settings [data-arcade="perf"]';
    var before = await page.evaluate(function () { return document.body.classList.contains('arcade-low-perf'); });
    if (before) return 'low-perf already on';
    await cl(page, sel);
    var on = await page.evaluate(function () { return document.body.classList.contains('arcade-low-perf'); });
    var pressed = await page.getAttribute(sel, 'aria-pressed');
    await cl(page, sel);
    var off = await page.evaluate(function () { return document.body.classList.contains('arcade-low-perf'); });
    if (!on) return 'class missing after the first press';
    if (pressed !== 'true') return 'aria-pressed = ' + pressed;
    return off ? 'class still there after the second press' : true;
  });
  await ck('settings: Escape / Done return to the title', async function () {
    await page.keyboard.press('Escape');
    if (await isShown(page, '#card-settings')) return 'Escape did not close the settings';
    await cl(page, '#chip-settings');
    await cl(page, '#settings-done');
    return (await isShown(page, '#card-settings')) ? 'Done did not close the settings' : true;
  });

  // ---- endless chooser
  await cl(page, '#btn-endless');
  await ck('endless: the chooser opens (app.state MODES, reported "menu") with 10 difficulties, 1 selected, a code field', async function () {
    var r = await waitShown(page, '#card-modes'); if (r !== true) return r;
    if (await state(page) !== 'MODES') return 'state ' + await state(page);
    var t = await page.evaluate(function () { return Array.prototype.map.call(document.querySelectorAll('#modes-diffs .diff'), function (b) { return b.getAttribute('data-diff') + ':' + b.getAttribute('aria-checked'); }).join(','); });
    if (t !== '1:true,2:false,3:false,4:false,5:false,6:false,7:false,8:false,9:false,10:false') return 'diffs ' + t;
    return (await isShown(page, '#modes-code')) && (await isShown(page, '#modes-code-go')) ? true : 'the code field is missing';
  });
  await ck('endless: difficulty 9 forces No luck (switch on and disabled), 5 lets it be chosen; Go stores both in the save', async function () {
    await cl(page, '#modes-diffs [data-diff="9"]');
    if ((await page.getAttribute('#modes-noluck', 'aria-pressed')) !== 'true') return 'no luck not forced on at 9';
    if ((await page.getAttribute('#modes-noluck', 'aria-disabled')) !== 'true') return 'no luck not disabled at 9';
    await cl(page, '#modes-diffs [data-diff="5"]');
    if ((await page.getAttribute('#modes-diffs [data-diff="5"]', 'aria-checked')) !== 'true') return '5 not selected';
    if ((await page.getAttribute('#modes-diffs [data-diff="1"]', 'aria-checked')) !== 'false') return '1 still selected';
    if ((await page.getAttribute('#modes-noluck', 'aria-pressed')) !== 'false') return 'no luck stayed on at 5';
    await cl(page, '#modes-noluck');
    if ((await page.getAttribute('#modes-noluck', 'aria-pressed')) !== 'true') return 'no luck not pressed';
    await cl(page, '#modes-start');
    var s = await saveOf(page);
    return s && s.endless && s.endless.difficulty === 5 && s.endless.noLuck === true ? true : 'save.endless = ' + JSON.stringify(s && s.endless);
  });
  await ck('endless: difficulty 10 is built without luck but lets hidden pieces be added (switch usable, chip and switch agree)', async function () {
    await cl(page, '#modes-adv');
    await cl(page, '#modes-diffs [data-diff="10"]');
    if ((await page.getAttribute('#modes-noluck', 'aria-pressed')) !== 'true') return 'no luck not on by default at 10';
    if ((await page.getAttribute('#modes-noluck', 'aria-disabled')) !== 'false') return 'no luck disabled at 10';
    await cl(page, '#modes-noluck');
    if ((await page.getAttribute('#modes-noluck', 'aria-pressed')) !== 'false') return 'the switch did not turn luck on';
    if ((await page.getAttribute('#modes-mechs [data-mech="hidden"]', 'aria-pressed')) !== 'true') return 'the hidden chip does not follow the switch';
    await cl(page, '#modes-mechs [data-mech="hidden"]');
    if ((await page.getAttribute('#modes-noluck', 'aria-pressed')) !== 'true') return 'the switch does not follow the chip';
    await cl(page, '#modes-diffs [data-diff="9"]');
    if ((await page.getAttribute('#modes-noluck', 'aria-disabled')) !== 'true') return 'no luck not forced at 9 after 10';
    await page.evaluate(function () { document.querySelector('#modes-diffs [data-diff="1"]').click(); document.getElementById('modes-adv').click(); });   // back to the defaults, panel closed (DOM clicks: the open panel pushes the chips off the viewport)
    return true;
  });
  await ck('endless: Go searches a level (worker or inline) and starts a round with a level code', async function () {
    var has_gen = await page.evaluate(function () { return !!window.PlateLoop.generator; });
    if (!has_gen) { note('PlateLoop.generator is not in the tree: the endless round itself is not tested'); return true; }
    try { await page.waitForFunction(function () { var s = window.PlateLoop.app.state; return s === 'PLAY' || s === 'HOWTO'; }, null, { timeout: 40000 }); } catch (e) { return 'no round started, state ' + await state(page); }
    var r = await page.evaluate(function () { var a = window.PlateLoop.app; return [a.mode, a.difficulty, a.noLuck, a.code, typeof a.level.hard]; });
    if (!/^L5n-[0-9A-Z]+$/.test(String(r[3]))) return 'code ' + r[3];
    return eq(r.slice(0, 3).concat([r[4]]).join(','), 'endless,5,true,number');
  });
  await ck('endless: the level code replays the very same level', async function () {
    var r = await page.evaluate(function () {
      var a = window.PlateLoop.app, g = window.PlateLoop.generator, rp = g.replay(a.code);
      return rp && JSON.stringify(rp.level.boxes) === JSON.stringify(a.level.boxes) && rp.level.N === a.level.N ? true : 'replay differs or failed';
    });
    return r;
  });
  await ck('endless: the code field takes the longest code (difficulty 10, every flag, a seven-symbol seed: 18 characters)', async function () {
    var longest = 'L10npwikot-ZZZZZZZ';
    await page.evaluate(function () { window.PlateLoop.screens.show('modes'); var f = document.getElementById('modes-code'); f.value = ''; f.focus(); });
    await page.keyboard.type(longest);                      // typed, so the field's maxlength applies as it does for a player
    var v = await page.inputValue('#modes-code');
    return v === longest ? true : 'the field cut the code to ' + JSON.stringify(v) + ' (maxlength ' + (await page.getAttribute('#modes-code', 'maxlength')) + ')';
  });
  await ck('endless: a tight code (flag t) replays as a tight level through playCode', async function () {
    var r = await page.evaluate(function () {
      var app = window.PlateLoop.app;
      if (!app.playCode('L10nt-198F7XE')) return 'playCode refused the code';
      return new Promise(function (resolve) {
        var n = 0, iv = setInterval(function () {
          if (app.level && app.level.tight && app.code === 'L10nt-198F7XE') { clearInterval(iv); resolve(true); }
          else if (++n > 300) { clearInterval(iv); resolve('no tight level after 30 s: code ' + app.code + ', level ' + JSON.stringify(app.level && { tight: app.level.tight, seed: app.level.seed })); }
        }, 100);
      });
    });
    if (r !== true) return r;
    await page.evaluate(function () { window.PlateLoop.app.toTitle(); });   // leave the round the proper way (the pause card's quit)
    await waitState(page, 'TITLE');
    return true;
  });
  var s2 = await state(page);
  if (s2 === 'HOWTO') { for (i = 0; i < 8 && (await state(page)) === 'HOWTO'; i++) await cl(page, '#howto-next'); s2 = await state(page); }
  if (s2 === 'PLAY') { await cl(page, '#btn-pause'); await cl(page, '#pause-quit'); await waitState(page, 'TITLE'); }
  await loadGame(P, true);
  await cl(page, '#btn-endless');
  await ck('endless: after a reload the chooser shows the stored difficulty (5) and No luck', async function () {
    var r = await page.evaluate(function () { return [document.querySelector('#modes-diffs [data-diff="5"]').getAttribute('aria-checked'), document.getElementById('modes-noluck').getAttribute('aria-pressed')]; });
    return eq(r.join(','), 'true,true');
  });
  await ck('endless: Advanced opens the mechanic chips; switching Ice off persists as endless.disabled and shows in the code', async function () {
    await cl(page, '#modes-adv');
    if (!(await isShown(page, '#modes-mechs'))) return 'the mechanics are not shown';
    await cl(page, '#modes-mechs [data-mech="ice"]');
    if ((await page.getAttribute('#modes-mechs [data-mech="ice"]', 'aria-pressed')) !== 'false') return 'ice still on';
    await cl(page, '#modes-diffs [data-diff="9"]');
    if ((await page.getAttribute('#modes-mechs [data-mech="hidden"]', 'aria-pressed')) !== 'false' || (await page.getAttribute('#modes-mechs [data-mech="hidden"]', 'aria-disabled')) !== 'true') return 'hidden not forced off at 9';
    await cl(page, '#modes-diffs [data-diff="4"]');
    await cl(page, '#modes-start');
    var s = await saveOf(page);
    if (!(s && s.endless && JSON.stringify(s.endless.disabled) === '["hidden","ice"]')) return 'save.endless.disabled = ' + JSON.stringify(s && s.endless && s.endless.disabled);
    try { await page.waitForFunction(function () { var st = window.PlateLoop.app.state; return st === 'PLAY' || st === 'HOWTO'; }, null, { timeout: 40000 }); } catch (e) { return 'no round started, state ' + await state(page); }
    var r = await page.evaluate(function () { var a = window.PlateLoop.app; return [a.code, JSON.stringify(a.disabled), JSON.stringify(a.level).indexOf('"ice":true') < 0]; });
    if (!/^L4ni-[0-9A-Z]+$/.test(String(r[0]))) return 'code ' + r[0];
    return r[1] === '["hidden","ice"]' && r[2] ? true : 'disabled ' + r[1] + ', ice-free ' + r[2];
  });
  var s3 = await state(page);
  if (s3 === 'HOWTO') { for (i = 0; i < 8 && (await state(page)) === 'HOWTO'; i++) await cl(page, '#howto-next'); s3 = await state(page); }
  if (s3 === 'PLAY') { await cl(page, '#btn-pause'); await cl(page, '#pause-quit'); await waitState(page, 'TITLE'); }
  await cl(page, '#btn-endless');
  await ck('endless: the hunt searches without end, reports candidates and the best hardness, and "Play the best" starts that level', async function () {
    await cl(page, '#modes-mechs [data-mech="ice"]');                   // ice back on
    await cl(page, '#modes-diffs [data-diff="7"]');
    await cl(page, '#modes-hunt');
    if (!(await isShown(page, '#hunt'))) return 'the hunt panel is hidden';
    try { await page.waitForFunction(function () { var b = document.getElementById('hunt-play'); return b && !b.disabled; }, null, { timeout: 30000 }); } catch (e) { return 'no candidate within 30 s: ' + await text(page, '#hunt-text'); }
    var txt = await text(page, '#hunt-text');
    if (!/\d/.test(txt)) return 'status text ' + txt;
    await cl(page, '#hunt-play');
    try { await page.waitForFunction(function () { var st = window.PlateLoop.app.state; return st === 'PLAY' || st === 'HOWTO'; }, null, { timeout: 20000 }); } catch (e) { return 'the best level did not start, state ' + await state(page); }
    var r = await page.evaluate(function () { var a = window.PlateLoop.app; return [a.difficulty, a.code, a.level.hard]; });
    return r[0] === 7 && /^L7n-[0-9A-Z]+$/.test(String(r[1])) && typeof r[2] === 'number' ? true : JSON.stringify(r);
  });
  s3 = await state(page);
  if (s3 === 'HOWTO') { for (i = 0; i < 8 && (await state(page)) === 'HOWTO'; i++) await cl(page, '#howto-next'); s3 = await state(page); }
  if (s3 === 'PLAY') { await cl(page, '#btn-pause'); await cl(page, '#pause-quit'); await waitState(page, 'TITLE'); }
  await cl(page, '#btn-endless');
  await ck('endless: a wrong level code is refused with a toast, nothing starts', async function () {
    await page.fill('#modes-code', 'L7-ZZZZZZZZ');
    await cl(page, '#modes-code-go');
    await page.waitForTimeout(300);
    return (await state(page)) === 'MODES' ? true : 'state ' + await state(page);
  });
  await ck('endless: Escape on the chooser returns to the title', async function () {
    await page.keyboard.press('Escape');
    return (await waitState(page, 'TITLE', 2000));
  });

  // ---- reload continues
  await ck('save: reload continues at the saved level (label "Continue · Level 3", Play starts level 3)', async function () {
    var s = await saveOf(page); if (!s || s.level !== 3) return 'save.level = ' + (s && s.level);
    if ((await text(page, '#play-label')) !== await str(page, 'en', 'play_continue', { n: 3 })) return 'label ' + await text(page, '#play-label');
    var r = await playThrough(page); if (r !== true) return r;
    return eq(await page.evaluate(function () { return window.PlateLoop.app.level.id; }), 3);
  });

  // ---- the whole session
  await ck('storage: every localStorage key starts with "plateLoop." or "arcade."', async function () {
    var keys = await page.evaluate(function () { return Object.keys(localStorage); });
    var bad = keys.filter(function (k) { return k.indexOf('plateLoop.') !== 0 && k.indexOf('arcade.') !== 0; });
    note('localStorage keys: ' + keys.join(', '));
    return bad.length ? 'foreign keys: ' + bad.join(', ') : (keys.some(function (k) { return k.indexOf('plateLoop.') === 0; }) ? true : 'no plateLoop. key at all');
  });
  await ck('storage: no cookie, service worker, IndexedDB or sessionStorage used', async function () {
    var cookies = await P.ctx.cookies();
    var r = await page.evaluate(async function () {
      var sw = navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).length : 0;
      var idb = indexedDB.databases ? (await indexedDB.databases()).length : 0;
      return { sw: sw, idb: idb, ss: sessionStorage.length, ck: document.cookie };
    });
    if (cookies.length || r.ck) return 'cookies: ' + JSON.stringify(cookies.map(function (c) { return c.name; }));
    return r.sw === 0 && r.idb === 0 && r.ss === 0 ? true : JSON.stringify(r);
  });
  await ck('session: no console error or page error over the whole run (known 404s ignored)', function () {
    var errs = P.consoleErrors.filter(function (e) { return !KNOWN_404.some(function (k) { return e.url.indexOf(k) >= 0; }); });
    if (errs.length) return JSON.stringify(errs.slice(0, 3));
    return P.pageErrors.length ? P.pageErrors.join(' | ') : true;
  });
  if (P.warnings.length) note('console warnings: ' + P.warnings.filter(function (w, k, a) { return a.indexOf(w) === k; }).slice(0, 6).join(' | '));
  await P.ctx.close();
}

// ---------------------------------------------------------------------------------------------- scenario B: Arcade.screen sequence
async function scenarioScreens(browser, base) {
  var P = await openPage(browser, base, { w: 390, h: 844, mobile: true, dsf: 1 });
  var page = P.page;
  await cl(page, '#btn-play');
  await waitState(page, 'HOWTO');
  await cl(page, '#howto-next');
  await waitState(page, 'PLAY');
  await cl(page, '#btn-pause');
  await waitState(page, 'PAUSE');
  await cl(page, '#pause-resume');
  await waitState(page, 'PLAY');
  await winFixture(page, 0);
  await ck('kit: Arcade.screen reports title, menu, play, pause, play, win in order', async function () {
    var log = await page.evaluate(function () { return window.__screens.slice(); });
    return eq(log.join(' > '), 'title > menu > play > pause > play > win');
  });
  await ck('kit: the wrapped Arcade.screen was installed before the game booted (log starts with "title")', async function () {
    var log = await page.evaluate(function () { return window.__screens.slice(); });
    return log[0] === 'title' ? true : 'first entry ' + log[0];
  });
  await ck('kit: a lose is reported as "lose" and the title again as "title"', async function () {
    await cl(page, '#win-next');            // level 2 (how-to) -> skip through
    for (var i = 0; i < 3 && (await state(page)) !== 'PLAY'; i++) { if ((await state(page)) === 'HOWTO') await cl(page, '#howto-next'); await page.waitForTimeout(100); }
    await winFixture(page, 0);
    await cl(page, '#win-next');
    await waitState(page, 'PLAY');
    var r = await loseFixture(page); if (r !== true) return r;
    await cl(page, '#lose-title');
    await waitState(page, 'TITLE');
    var log = await page.evaluate(function () { return window.__screens.slice(-3); });
    return eq(log.join(' > '), 'play > lose > title');
  });
  await P.ctx.close();
}

// ---------------------------------------------------------------------------------------------- scenario C: layout at five sizes
async function scenarioLayout(browser, base, vp) {
  var tag = vp.w + 'x' + vp.h, viol = [], P = null;
  async function m(label) { viol = viol.concat(await P.page.evaluate(measureInPage, label)); }
  async function body() {
    P = await openPage(browser, base, { w: vp.w, h: vp.h, mobile: vp.mobile, dsf: vp.dsf });
    var page = P.page, i;
    await m('title');
    await cl(page, '#btn-play'); await waitShown(page, '#card-howto'); await m('howto level 1');
    await cl(page, '#howto-next'); await waitState(page, 'PLAY');
    await page.waitForTimeout(200);
    await m('play');
    await cl(page, '#btn-pause'); await waitShown(page, '#card-pause'); await m('pause');
    await cl(page, '#pause-settings'); await waitShown(page, '#card-settings'); await m('pause settings');
    await cl(page, '#settings-done'); await waitShown(page, '#card-pause');
    await cl(page, '#pause-resume'); await waitState(page, 'PLAY');
    if ((await winFixture(page, 0)) === true) await m('win'); else viol.push('win card did not show');
    await cl(page, '#win-next'); await waitShown(page, '#card-howto'); await m('howto covered');
    await cl(page, '#howto-next'); await waitState(page, 'PLAY');
    await cl(page, '#btn-pause'); await cl(page, '#pause-quit'); await waitState(page, 'TITLE');
    await cl(page, '#chip-settings'); await waitShown(page, '#card-settings'); await m('settings');
    await cl(page, '#settings-done');
    await cl(page, '#btn-endless'); await waitShown(page, '#card-modes'); await m('modes');
    await cl(page, '#modes-back');
    await cl(page, '#chip-howto'); await waitShown(page, '#card-howto');
    for (i = 0; i < 7; i++) {
      await m('howto page ' + (i + 1));
      await cl(page, '#howto-next');
    }
    await playThrough(page);
    if ((await winFixture(page, 0)) !== true) viol.push('win card of level 2 did not show');
    await cl(page, '#win-next'); await waitState(page, 'PLAY');
    await page.waitForTimeout(150);
    await m('play level 3');
    if ((await loseFixture(page)) === true) await m('lose'); else viol.push('lose card did not show');
  }
  try { await body(); } catch (e) { viol.push('scenario stopped: ' + String(e && e.message || e).replace(/\x1b\[[0-9;]*m/g, '').split('\n').slice(0, 14).join(' / ')); }
  await ck('layout ' + tag + ': buttons >= 44 px, every button / card / HUD / canvas inside the viewport, pill and pause apart',
    function () { return viol.length ? viol.length + ' problem(s): ' + viol.slice(0, 5).join(' ;; ') : true; }, P && P.page);
  if (P) await P.ctx.close();
}

// ---------------------------------------------------------------------------------------------- scenario D: perf mode and the way home
async function scenarioPerfHome(browser, base) {
  var P = await openPage(browser, base, { w: 390, h: 844, mobile: true, dsf: 2 });
  var page = P.page;
  await playThrough(page);
  await ck('perf: normal mode renders the canvas at device resolution, the cheap mode at 1x (scene follows Arcade.perf)', async function () {
    var hi = await page.evaluate(function () { var c = document.getElementById('board'); return c.width / c.clientWidth; });
    await page.evaluate(function () { window.Arcade.perf.set('low'); });
    await page.waitForTimeout(200);
    var r = await page.evaluate(function () { var c = document.getElementById('board'); return { lo: c.width / c.clientWidth, cls: document.body.classList.contains('arcade-low-perf') }; });
    await page.evaluate(function () { window.Arcade.perf.set('high'); });
    await page.waitForTimeout(200);
    var back = await page.evaluate(function () { var c = document.getElementById('board'); return c.width / c.clientWidth; });
    if (Math.abs(hi - 2) > 0.05) return 'normal mode canvas ratio ' + hi;
    if (!r.cls) return 'body.arcade-low-perf missing';
    if (Math.abs(r.lo - 1) > 0.05) return 'cheap mode canvas ratio ' + r.lo;
    return Math.abs(back - 2) < 0.05 ? true : 'ratio after leaving the cheap mode ' + back;
  });
  await ck('perf: the game keeps running (state PLAY, no page error) after the perf switches', async function () {
    return P.pageErrors.length ? P.pageErrors.join(' | ') : eq(await state(page), 'PLAY');
  });
  await cl(page, '#btn-pause'); await cl(page, '#pause-quit'); await waitState(page, 'TITLE');
  await ck('kit: the home button leaves the game (a navigation towards ../)', async function () {
    await page.evaluate(function () { window.__marker = 1; });
    var nav = page.waitForEvent('framenavigated', { timeout: 4000 }).then(function () { return true; }, function () { return false; });
    await cl(page, '#screen-title [data-arcade="home"]');
    return (await nav) ? true : 'no navigation after pressing the home button';
  });
  await P.ctx.close();
}

// ---------------------------------------------------------------------------------------------- entry points
// run({ browser, url, ok }): for tests/browser/run.js. browser is a playwright Browser, url the game's base url
// (with a trailing slash), ok(cond, msg) counts / prints one check. Returns { checks, failed } when done.
async function run(o) {
  o = o || {};
  var base = String(o.url);
  if (base.charAt(base.length - 1) !== '/') base += '/';
  okSink = typeof o.ok === 'function' ? o.ok : null;
  results = []; notes = []; shotN = 0;
  if (fs.existsSync(ART_DIR)) fs.readdirSync(ART_DIR).forEach(function (f) { if (/\.png$/.test(f)) fs.unlinkSync(path.join(ART_DIR, f)); });
  try {
    await scenarioMain(o.browser, base);
    await scenarioScreens(o.browser, base);
    await scenarioPerfHome(o.browser, base);
    for (var i = 0; i < VIEWPORTS.length; i++) await scenarioLayout(o.browser, base, VIEWPORTS[i]);
  } catch (e) {
    await ck('ui suite did not crash', function () { return String(e && e.stack || e); });
  }
  okSink = null;
  var failed = results.filter(function (r) { return !r.ok; });
  return { checks: results.length, failed: failed.length, results: results };
}

module.exports = { run: run, FIXTURES: FIXTURES };

if (require.main === module) {
  (async function main() {
    var t0 = Date.now(), srv = await serveMod.serve(GAME_DIR), browser = await launchChrome(), r = null;
    try { r = await run({ browser: browser, url: srv.url }); }
    catch (e) { console.log('FAIL suite crashed: ' + String(e && e.stack || e)); await shot(current, 'suite crashed'); }
    finally { await browser.close().catch(function () {}); await srv.close(); }
    var failed = r ? r.results.filter(function (x) { return !x.ok; }) : [{ name: 'suite', detail: 'crashed' }];
    console.log('\n' + (r ? r.checks : 0) + ' checks, ' + ((r ? r.checks : 0) - failed.length) + ' ok, ' + failed.length + ' failed (' + Math.round((Date.now() - t0) / 100) / 10 + ' s)');
    failed.forEach(function (x) { console.log('  FAIL ' + x.name + ': ' + x.detail); });
    if (failed.length) console.log('screenshots: ' + ART_DIR);
    process.exit(failed.length ? 1 : 0);
  })();
}
